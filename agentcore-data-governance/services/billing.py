"""
Billing pipeline service for the Agentic Data Governance System.

This module provides functionality for emitting usage events to billing systems
and supporting hourly/daily/monthly aggregation.

Requirements: 22.2, 22.3
"""

from datetime import datetime, timedelta
from typing import Optional, Any, Callable, Literal
from enum import Enum
import threading
import json

from models.metering import (
    UsageAggregate,
    AggregationPeriod,
    BillingRecord,
    BillingStatus,
    TenantQuota,
)
from models.tenant import BillingProvider
from services.metering import MeteringService, get_metering_service


class BillingEventType(str, Enum):
    """Types of billing events."""
    USAGE_REPORT = "usage_report"
    SUBSCRIPTION_CREATED = "subscription_created"
    SUBSCRIPTION_UPDATED = "subscription_updated"
    SUBSCRIPTION_CANCELLED = "subscription_cancelled"
    INVOICE_GENERATED = "invoice_generated"
    PAYMENT_RECEIVED = "payment_received"
    PAYMENT_FAILED = "payment_failed"
    QUOTA_WARNING = "quota_warning"
    QUOTA_EXCEEDED = "quota_exceeded"


class BillingEvent:
    """Represents a billing event to be emitted."""
    
    def __init__(
        self,
        event_type: BillingEventType,
        tenant_id: str,
        data: dict[str, Any],
        timestamp: Optional[datetime] = None
    ):
        self.event_type = event_type
        self.tenant_id = tenant_id
        self.data = data
        self.timestamp = timestamp or datetime.now()
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "event_type": self.event_type.value,
            "tenant_id": self.tenant_id,
            "data": self.data,
            "timestamp": self.timestamp.isoformat()
        }
    
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())


class BillingPipeline:
    """
    Pipeline for processing and emitting billing events.
    
    Validates: Requirements 22.2, 22.3
    """
    
    def __init__(
        self,
        metering_service: Optional[MeteringService] = None,
        billing_provider: Optional[BillingProvider] = None
    ):
        """
        Initialize the billing pipeline.
        
        Args:
            metering_service: Metering service instance.
            billing_provider: Default billing provider.
        """
        self._metering_service = metering_service or get_metering_service()
        self._billing_provider = billing_provider
        self._event_handlers: dict[BillingProvider, Callable[[BillingEvent], bool]] = {}
        self._billing_records: dict[str, BillingRecord] = {}
        self._pending_events: list[BillingEvent] = []
        self._lock = threading.Lock()
        
        # Pricing configuration per tier
        self._tier_pricing: dict[str, dict[str, float]] = {
            "free": {
                "agent_invocation": 0.0,
                "token_1k": 0.0,
                "storage_gb": 0.0,
                "api_call": 0.0
            },
            "starter": {
                "agent_invocation": 0.01,
                "token_1k": 0.002,
                "storage_gb": 0.10,
                "api_call": 0.001
            },
            "professional": {
                "agent_invocation": 0.008,
                "token_1k": 0.0015,
                "storage_gb": 0.08,
                "api_call": 0.0008
            },
            "enterprise": {
                "agent_invocation": 0.005,
                "token_1k": 0.001,
                "storage_gb": 0.05,
                "api_call": 0.0005
            }
        }
    
    def register_handler(
        self,
        provider: BillingProvider,
        handler: Callable[[BillingEvent], bool]
    ) -> None:
        """
        Register a billing event handler for a provider.
        
        Args:
            provider: The billing provider.
            handler: Function that handles billing events, returns True on success.
        """
        self._event_handlers[provider] = handler
    
    def emit_event(
        self,
        event: BillingEvent,
        provider: Optional[BillingProvider] = None
    ) -> bool:
        """
        Emit a billing event to the appropriate handler.
        
        Args:
            event: The billing event to emit.
            provider: Override billing provider.
            
        Returns:
            True if event was successfully handled.
        """
        target_provider = provider or self._billing_provider
        
        if target_provider and target_provider in self._event_handlers:
            handler = self._event_handlers[target_provider]
            try:
                return handler(event)
            except Exception:
                # Queue for retry
                with self._lock:
                    self._pending_events.append(event)
                return False
        
        # No handler, queue the event
        with self._lock:
            self._pending_events.append(event)
        return True
    
    def aggregate_and_emit(
        self,
        tenant_id: str,
        period: AggregationPeriod,
        period_start: datetime,
        period_end: Optional[datetime] = None,
        tier: str = "starter"
    ) -> BillingRecord:
        """
        Aggregate usage for a period and emit billing event.
        
        Validates: Requirements 22.2, 22.3
        
        Args:
            tenant_id: Tenant to aggregate for.
            period: Aggregation period type.
            period_start: Start of the period.
            period_end: End of the period.
            tier: Subscription tier for pricing.
            
        Returns:
            BillingRecord with calculated costs.
        """
        # Get aggregated usage
        aggregate = self._metering_service.aggregate_usage(
            tenant_id=tenant_id,
            period=period,
            period_start=period_start,
            period_end=period_end
        )
        
        # Create billing record
        record = self._create_billing_record(aggregate, tier)
        
        # Store record
        with self._lock:
            self._billing_records[record.id] = record
        
        # Emit usage report event
        event = BillingEvent(
            event_type=BillingEventType.USAGE_REPORT,
            tenant_id=tenant_id,
            data={
                "billing_record_id": record.id,
                "period": period,
                "period_start": period_start.isoformat(),
                "period_end": aggregate.period_end.isoformat(),
                "agent_invocations": aggregate.agent_invocations,
                "total_tokens": aggregate.total_tokens,
                "storage_bytes": aggregate.total_storage_bytes,
                "api_calls": aggregate.api_calls,
                "total_amount": record.total_amount,
                "currency": record.currency
            }
        )
        
        self.emit_event(event)
        
        return record
    
    def _create_billing_record(
        self,
        aggregate: UsageAggregate,
        tier: str
    ) -> BillingRecord:
        """Create a billing record from an aggregate."""
        pricing = self._tier_pricing.get(tier, self._tier_pricing["starter"])
        
        record = BillingRecord(
            tenant_id=aggregate.tenant_id,
            period_start=aggregate.period_start,
            period_end=aggregate.period_end,
            agent_invocations=aggregate.agent_invocations,
            total_tokens=aggregate.total_tokens,
            storage_gb=aggregate.total_storage_bytes / (1024 ** 3),
            api_calls=aggregate.api_calls,
            unit_prices=pricing
        )
        
        record.calculate_costs()
        return record
    
    def run_hourly_aggregation(self, tenant_ids: list[str], tier: str = "starter") -> list[BillingRecord]:
        """
        Run hourly aggregation for multiple tenants.
        
        Validates: Requirements 22.3
        """
        now = datetime.now()
        period_start = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
        
        records = []
        for tenant_id in tenant_ids:
            record = self.aggregate_and_emit(
                tenant_id=tenant_id,
                period='hourly',
                period_start=period_start,
                tier=tier
            )
            records.append(record)
        
        return records
    
    def run_daily_aggregation(self, tenant_ids: list[str], tier: str = "starter") -> list[BillingRecord]:
        """
        Run daily aggregation for multiple tenants.
        
        Validates: Requirements 22.3
        """
        now = datetime.now()
        period_start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
        
        records = []
        for tenant_id in tenant_ids:
            record = self.aggregate_and_emit(
                tenant_id=tenant_id,
                period='daily',
                period_start=period_start,
                tier=tier
            )
            records.append(record)
        
        return records
    
    def run_monthly_aggregation(self, tenant_ids: list[str], tier: str = "starter") -> list[BillingRecord]:
        """
        Run monthly aggregation for multiple tenants.
        
        Validates: Requirements 22.3
        """
        now = datetime.now()
        # First day of previous month
        first_of_current = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_start = (first_of_current - timedelta(days=1)).replace(day=1)
        period_end = first_of_current
        
        records = []
        for tenant_id in tenant_ids:
            record = self.aggregate_and_emit(
                tenant_id=tenant_id,
                period='monthly',
                period_start=period_start,
                period_end=period_end,
                tier=tier
            )
            records.append(record)
        
        return records
    
    def get_billing_record(self, record_id: str) -> Optional[BillingRecord]:
        """Get a billing record by ID."""
        return self._billing_records.get(record_id)
    
    def get_billing_records(
        self,
        tenant_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> list[BillingRecord]:
        """Get billing records for a tenant."""
        records = [r for r in self._billing_records.values() if r.tenant_id == tenant_id]
        
        if start_date:
            records = [r for r in records if r.period_start >= start_date]
        if end_date:
            records = [r for r in records if r.period_end <= end_date]
        
        records.sort(key=lambda r: r.period_start, reverse=True)
        return records
    
    def mark_record_processed(
        self,
        record_id: str,
        invoice_id: Optional[str] = None,
        payment_id: Optional[str] = None
    ) -> Optional[BillingRecord]:
        """Mark a billing record as processed."""
        record = self._billing_records.get(record_id)
        if record:
            record.status = 'processed'
            record.processed_at = datetime.now()
            record.invoice_id = invoice_id
            record.payment_id = payment_id
        return record
    
    def get_pending_events(self) -> list[BillingEvent]:
        """Get pending events that haven't been processed."""
        with self._lock:
            return list(self._pending_events)
    
    def clear_pending_events(self) -> int:
        """Clear pending events and return count."""
        with self._lock:
            count = len(self._pending_events)
            self._pending_events.clear()
            return count
    
    def retry_pending_events(self, provider: BillingProvider) -> tuple[int, int]:
        """
        Retry pending events for a provider.
        
        Returns:
            Tuple of (success_count, failure_count).
        """
        if provider not in self._event_handlers:
            return (0, len(self._pending_events))
        
        handler = self._event_handlers[provider]
        success_count = 0
        failed_events = []
        
        with self._lock:
            events = list(self._pending_events)
            self._pending_events.clear()
        
        for event in events:
            try:
                if handler(event):
                    success_count += 1
                else:
                    failed_events.append(event)
            except Exception:
                failed_events.append(event)
        
        with self._lock:
            self._pending_events.extend(failed_events)
        
        return (success_count, len(failed_events))


# Billing provider handlers

def create_stripe_handler(api_key: str) -> Callable[[BillingEvent], bool]:
    """
    Create a Stripe billing event handler.
    
    Validates: Requirements 22.4
    """
    def handler(event: BillingEvent) -> bool:
        # In production, this would use the Stripe API
        # For now, we just log the event
        print(f"[Stripe] Billing event: {event.to_json()}")
        return True
    
    return handler


def create_aws_marketplace_handler(region: str = "us-west-2") -> Callable[[BillingEvent], bool]:
    """
    Create an AWS Marketplace billing event handler.
    
    Validates: Requirements 22.4, 37.3
    """
    def handler(event: BillingEvent) -> bool:
        # In production, this would use AWS Marketplace Metering API
        # For now, we just log the event
        print(f"[AWS Marketplace] Billing event: {event.to_json()}")
        return True
    
    return handler


def create_azure_marketplace_handler() -> Callable[[BillingEvent], bool]:
    """
    Create an Azure Marketplace billing event handler.
    
    Validates: Requirements 22.4, 38.3
    """
    def handler(event: BillingEvent) -> bool:
        # In production, this would use Azure Marketplace Metering API
        # For now, we just log the event
        print(f"[Azure Marketplace] Billing event: {event.to_json()}")
        return True
    
    return handler


# Global billing pipeline instance
_billing_pipeline: Optional[BillingPipeline] = None


def get_billing_pipeline() -> BillingPipeline:
    """Get the global billing pipeline instance."""
    global _billing_pipeline
    if _billing_pipeline is None:
        _billing_pipeline = BillingPipeline()
    return _billing_pipeline


def emit_usage_report(
    tenant_id: str,
    period: AggregationPeriod,
    period_start: datetime,
    tier: str = "starter"
) -> BillingRecord:
    """
    Convenience function to emit a usage report.
    
    Validates: Requirements 22.2
    """
    pipeline = get_billing_pipeline()
    return pipeline.aggregate_and_emit(
        tenant_id=tenant_id,
        period=period,
        period_start=period_start,
        tier=tier
    )
