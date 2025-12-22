"""
Usage metering service for the Agentic Data Governance System.

This module provides functionality for tracking tenant resource consumption
including agent invocations, tokens, storage, and API calls.

Requirements: 22.1, 22.2
"""

from datetime import datetime, timedelta
from typing import Optional, Any
from collections import defaultdict
import threading

from models.metering import (
    UsageEvent,
    UsageEventType,
    UsageAggregate,
    AggregationPeriod,
    BillingRecord,
    TenantQuota,
    UsageSummary,
)
from services.tenant_context import get_current_tenant_id


class MeteringService:
    """
    Service for tracking and aggregating tenant usage metrics.
    
    Validates: Requirements 22.1, 22.2
    """
    
    def __init__(self):
        """Initialize the metering service."""
        # In-memory storage for events (would be replaced with persistent storage)
        self._events: list[UsageEvent] = []
        self._aggregates: dict[str, UsageAggregate] = {}  # key: tenant_id:period:start_time
        self._quotas: dict[str, TenantQuota] = {}  # key: tenant_id
        self._billing_records: dict[str, BillingRecord] = {}  # key: record_id
        self._lock = threading.Lock()
    
    def record_event(
        self,
        event_type: UsageEventType,
        tenant_id: Optional[str] = None,
        quantity: int = 1,
        tokens_input: int = 0,
        tokens_output: int = 0,
        bytes_transferred: int = 0,
        agent_id: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        report_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None
    ) -> UsageEvent:
        """
        Record a usage event for metering.
        
        Args:
            event_type: Type of usage event.
            tenant_id: Tenant ID (uses current context if not provided).
            quantity: Number of units consumed.
            tokens_input: Input tokens consumed.
            tokens_output: Output tokens consumed.
            bytes_transferred: Bytes transferred.
            agent_id: ID of the agent involved.
            session_id: Session ID.
            user_id: User ID.
            report_id: Report ID if applicable.
            metadata: Additional metadata.
            
        Returns:
            The recorded UsageEvent.
            
        Raises:
            ValueError: If no tenant_id provided and no context set.
        """
        if tenant_id is None:
            tenant_id = get_current_tenant_id()
        
        if not tenant_id:
            raise ValueError("No tenant_id provided and no tenant context set")
        
        event = UsageEvent(
            tenant_id=tenant_id,
            event_type=event_type,
            quantity=quantity,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            bytes_transferred=bytes_transferred,
            agent_id=agent_id,
            session_id=session_id,
            user_id=user_id,
            report_id=report_id,
            metadata=metadata or {}
        )
        
        with self._lock:
            self._events.append(event)
            self._update_quota_usage(tenant_id, event)
        
        return event
    
    def record_agent_invocation(
        self,
        agent_id: str,
        tokens_input: int = 0,
        tokens_output: int = 0,
        tenant_id: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None
    ) -> UsageEvent:
        """
        Record an agent invocation event.
        
        Validates: Requirements 22.1
        """
        return self.record_event(
            event_type='agent_invocation',
            tenant_id=tenant_id,
            quantity=1,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            agent_id=agent_id,
            session_id=session_id,
            user_id=user_id,
            metadata=metadata
        )
    
    def record_token_consumption(
        self,
        tokens_input: int,
        tokens_output: int,
        agent_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        session_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None
    ) -> UsageEvent:
        """
        Record token consumption event.
        
        Validates: Requirements 22.1
        """
        return self.record_event(
            event_type='token_consumption',
            tenant_id=tenant_id,
            quantity=tokens_input + tokens_output,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            agent_id=agent_id,
            session_id=session_id,
            metadata=metadata
        )
    
    def record_storage_operation(
        self,
        operation: str,  # 'write' or 'read'
        bytes_transferred: int,
        tenant_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None
    ) -> UsageEvent:
        """
        Record a storage operation event.
        
        Validates: Requirements 22.1
        """
        event_type: UsageEventType = 'storage_write' if operation == 'write' else 'storage_read'
        return self.record_event(
            event_type=event_type,
            tenant_id=tenant_id,
            quantity=1,
            bytes_transferred=bytes_transferred,
            metadata=metadata
        )
    
    def record_api_call(
        self,
        endpoint: str,
        tenant_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None
    ) -> UsageEvent:
        """
        Record an API call event.
        
        Validates: Requirements 22.1
        """
        return self.record_event(
            event_type='api_call',
            tenant_id=tenant_id,
            quantity=1,
            user_id=user_id,
            metadata={'endpoint': endpoint, **(metadata or {})}
        )
    
    def _update_quota_usage(self, tenant_id: str, event: UsageEvent) -> None:
        """Update quota usage based on an event."""
        quota = self._quotas.get(tenant_id)
        if not quota:
            return
        
        if event.event_type == 'agent_invocation':
            quota.current_agent_invocations += event.quantity
        elif event.event_type == 'token_consumption':
            quota.current_tokens += event.total_tokens
        elif event.event_type in ('storage_write', 'storage_read'):
            quota.current_storage_gb += event.bytes_transferred / (1024 ** 3)
        elif event.event_type == 'api_call':
            quota.current_api_calls += event.quantity
    
    def get_events(
        self,
        tenant_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        event_type: Optional[UsageEventType] = None,
        limit: int = 1000
    ) -> list[UsageEvent]:
        """
        Get usage events for a tenant.
        
        Args:
            tenant_id: Tenant ID to filter by.
            start_time: Start of time range.
            end_time: End of time range.
            event_type: Filter by event type.
            limit: Maximum number of events to return.
            
        Returns:
            List of matching UsageEvents.
        """
        with self._lock:
            events = [e for e in self._events if e.tenant_id == tenant_id]
        
        if start_time:
            events = [e for e in events if e.timestamp >= start_time]
        if end_time:
            events = [e for e in events if e.timestamp <= end_time]
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        
        # Sort by timestamp descending and limit
        events.sort(key=lambda e: e.timestamp, reverse=True)
        return events[:limit]
    
    def aggregate_usage(
        self,
        tenant_id: str,
        period: AggregationPeriod,
        period_start: datetime,
        period_end: Optional[datetime] = None
    ) -> UsageAggregate:
        """
        Aggregate usage metrics for a time period.
        
        Validates: Requirements 22.2, 22.3
        
        Args:
            tenant_id: Tenant ID to aggregate for.
            period: Aggregation period type.
            period_start: Start of the period.
            period_end: End of the period (defaults based on period type).
            
        Returns:
            UsageAggregate with aggregated metrics.
        """
        # Calculate period_end if not provided
        if period_end is None:
            if period == 'hourly':
                period_end = period_start + timedelta(hours=1)
            elif period == 'daily':
                period_end = period_start + timedelta(days=1)
            elif period == 'monthly':
                # Approximate month as 30 days
                period_end = period_start + timedelta(days=30)
        
        # Get events for the period
        events = self.get_events(
            tenant_id=tenant_id,
            start_time=period_start,
            end_time=period_end,
            limit=100000  # High limit for aggregation
        )
        
        # Initialize aggregate
        aggregate = UsageAggregate(
            tenant_id=tenant_id,
            period=period,
            period_start=period_start,
            period_end=period_end
        )
        
        # Track unique users and sessions
        unique_users: set[str] = set()
        sessions_by_time: dict[datetime, set[str]] = defaultdict(set)
        
        # Aggregate events
        for event in events:
            if event.event_type == 'agent_invocation':
                aggregate.agent_invocations += event.quantity
                aggregate.total_tokens_input += event.tokens_input
                aggregate.total_tokens_output += event.tokens_output
            elif event.event_type == 'token_consumption':
                aggregate.total_tokens_input += event.tokens_input
                aggregate.total_tokens_output += event.tokens_output
            elif event.event_type == 'storage_write':
                aggregate.storage_writes += event.quantity
                aggregate.storage_bytes_written += event.bytes_transferred
            elif event.event_type == 'storage_read':
                aggregate.storage_reads += event.quantity
                aggregate.storage_bytes_read += event.bytes_transferred
            elif event.event_type == 'api_call':
                aggregate.api_calls += event.quantity
            elif event.event_type == 'report_processed':
                aggregate.reports_processed += event.quantity
            elif event.event_type == 'cde_scored':
                aggregate.cdes_scored += event.quantity
            elif event.event_type == 'rule_executed':
                aggregate.rules_executed += event.quantity
            elif event.event_type == 'issue_created':
                aggregate.issues_created += event.quantity
            elif event.event_type == 'approval_processed':
                aggregate.approvals_processed += event.quantity
            
            # Track users and sessions
            if event.user_id:
                unique_users.add(event.user_id)
            if event.session_id:
                # Round to hour for concurrent session tracking
                hour_key = event.timestamp.replace(minute=0, second=0, microsecond=0)
                sessions_by_time[hour_key].add(event.session_id)
        
        aggregate.active_users = len(unique_users)
        if sessions_by_time:
            aggregate.peak_concurrent_sessions = max(len(s) for s in sessions_by_time.values())
        
        aggregate.updated_at = datetime.now()
        
        # Store aggregate
        key = f"{tenant_id}:{period}:{period_start.isoformat()}"
        with self._lock:
            self._aggregates[key] = aggregate
        
        return aggregate
    
    def get_aggregate(
        self,
        tenant_id: str,
        period: AggregationPeriod,
        period_start: datetime
    ) -> Optional[UsageAggregate]:
        """Get a stored aggregate."""
        key = f"{tenant_id}:{period}:{period_start.isoformat()}"
        return self._aggregates.get(key)
    
    def set_quota(self, quota: TenantQuota) -> None:
        """Set quota limits for a tenant."""
        with self._lock:
            self._quotas[quota.tenant_id] = quota
    
    def get_quota(self, tenant_id: str) -> Optional[TenantQuota]:
        """Get quota for a tenant."""
        return self._quotas.get(tenant_id)
    
    def check_quota(self, tenant_id: str, metric: str) -> dict[str, Any]:
        """
        Check quota status for a tenant.
        
        Returns:
            Dictionary with quota status information.
        """
        quota = self._quotas.get(tenant_id)
        if not quota:
            return {
                "has_quota": False,
                "status": "ok",
                "exceeded": False
            }
        
        return {
            "has_quota": True,
            "status": quota.get_quota_status(metric),
            "exceeded": quota.is_quota_exceeded(metric),
            "usage_percent": getattr(quota, f"{metric}_usage_percent", 0.0)
        }
    
    def get_usage_summary(
        self,
        tenant_id: str,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None
    ) -> UsageSummary:
        """
        Get usage summary for dashboard display.
        
        Validates: Requirements 22.5
        """
        if period_end is None:
            period_end = datetime.now()
        if period_start is None:
            # Default to current month
            period_start = period_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Get events for current period
        events = self.get_events(
            tenant_id=tenant_id,
            start_time=period_start,
            end_time=period_end,
            limit=100000
        )
        
        # Calculate current period metrics
        summary = UsageSummary(
            tenant_id=tenant_id,
            period_start=period_start,
            period_end=period_end
        )
        
        storage_bytes = 0
        agent_usage: dict[str, int] = defaultdict(int)
        user_usage: dict[str, int] = defaultdict(int)
        report_usage: dict[str, int] = defaultdict(int)
        
        for event in events:
            if event.event_type == 'agent_invocation':
                summary.agent_invocations += event.quantity
                summary.total_tokens += event.total_tokens
                if event.agent_id:
                    agent_usage[event.agent_id] += event.quantity
            elif event.event_type == 'token_consumption':
                summary.total_tokens += event.total_tokens
            elif event.event_type in ('storage_write', 'storage_read'):
                storage_bytes += event.bytes_transferred
            elif event.event_type == 'api_call':
                summary.api_calls += event.quantity
            
            if event.user_id:
                user_usage[event.user_id] += 1
            if event.report_id:
                report_usage[event.report_id] += 1
        
        summary.storage_gb = storage_bytes / (1024 ** 3)
        
        # Get quota
        summary.quota = self._quotas.get(tenant_id)
        
        # Calculate estimated cost
        summary.estimated_cost = (
            summary.agent_invocations * 0.01 +
            (summary.total_tokens / 1000) * 0.002 +
            summary.storage_gb * 0.10 +
            summary.api_calls * 0.001
        )
        
        # Top consumers
        summary.top_agents = [
            {"agent_id": k, "invocations": v}
            for k, v in sorted(agent_usage.items(), key=lambda x: x[1], reverse=True)[:5]
        ]
        summary.top_users = [
            {"user_id": k, "events": v}
            for k, v in sorted(user_usage.items(), key=lambda x: x[1], reverse=True)[:5]
        ]
        summary.top_reports = [
            {"report_id": k, "events": v}
            for k, v in sorted(report_usage.items(), key=lambda x: x[1], reverse=True)[:5]
        ]
        
        # Calculate trends (compare to previous period)
        period_duration = period_end - period_start
        prev_period_start = period_start - period_duration
        prev_period_end = period_start
        
        prev_events = self.get_events(
            tenant_id=tenant_id,
            start_time=prev_period_start,
            end_time=prev_period_end,
            limit=100000
        )
        
        prev_invocations = sum(1 for e in prev_events if e.event_type == 'agent_invocation')
        prev_tokens = sum(e.total_tokens for e in prev_events)
        prev_storage = sum(e.bytes_transferred for e in prev_events if e.event_type in ('storage_write', 'storage_read'))
        prev_api_calls = sum(1 for e in prev_events if e.event_type == 'api_call')
        
        def calc_trend(current: float, previous: float) -> float:
            if previous == 0:
                return 100.0 if current > 0 else 0.0
            return ((current - previous) / previous) * 100
        
        summary.agent_invocations_trend = calc_trend(summary.agent_invocations, prev_invocations)
        summary.tokens_trend = calc_trend(summary.total_tokens, prev_tokens)
        summary.storage_trend = calc_trend(storage_bytes, prev_storage)
        summary.api_calls_trend = calc_trend(summary.api_calls, prev_api_calls)
        
        return summary


# Global metering service instance
_metering_service: Optional[MeteringService] = None


def get_metering_service() -> MeteringService:
    """Get the global metering service instance."""
    global _metering_service
    if _metering_service is None:
        _metering_service = MeteringService()
    return _metering_service


def record_usage(
    event_type: UsageEventType,
    tenant_id: Optional[str] = None,
    **kwargs
) -> UsageEvent:
    """
    Convenience function to record a usage event.
    
    Validates: Requirements 22.1
    """
    service = get_metering_service()
    return service.record_event(event_type=event_type, tenant_id=tenant_id, **kwargs)


def record_agent_invocation(
    agent_id: str,
    tokens_input: int = 0,
    tokens_output: int = 0,
    **kwargs
) -> UsageEvent:
    """
    Convenience function to record an agent invocation.
    
    Validates: Requirements 22.1
    """
    service = get_metering_service()
    return service.record_agent_invocation(
        agent_id=agent_id,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        **kwargs
    )


def get_usage_summary(tenant_id: str, **kwargs) -> UsageSummary:
    """
    Convenience function to get usage summary.
    
    Validates: Requirements 22.5
    """
    service = get_metering_service()
    return service.get_usage_summary(tenant_id=tenant_id, **kwargs)
