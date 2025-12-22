"""
Usage dashboard API service for the Agentic Data Governance System.

This module provides tenant-accessible endpoints for viewing consumption
data, billing history, and quota status.

Requirements: 22.5
"""

from datetime import datetime, timedelta
from typing import Optional, Any, Literal
from pydantic import BaseModel, Field

from models.metering import (
    UsageSummary,
    UsageAggregate,
    BillingRecord,
    TenantQuota,
    AggregationPeriod,
)
from services.metering import MeteringService, get_metering_service
from services.billing import BillingPipeline, get_billing_pipeline
from services.tenant_context import get_current_tenant_id


class UsageDashboardMetrics(BaseModel):
    """
    Dashboard metrics for tenant usage display.
    
    Validates: Requirements 22.5
    """
    tenant_id: str
    period_label: str
    period_start: datetime
    period_end: datetime
    
    # Current usage
    agent_invocations: int = 0
    total_tokens: int = 0
    storage_gb: float = 0.0
    api_calls: int = 0
    
    # Quota status
    agent_invocations_quota: Optional[int] = None
    agent_invocations_percent: float = 0.0
    tokens_quota: Optional[int] = None
    tokens_percent: float = 0.0
    storage_quota_gb: Optional[float] = None
    storage_percent: float = 0.0
    api_calls_quota: Optional[int] = None
    api_calls_percent: float = 0.0
    
    # Cost information
    estimated_cost: float = 0.0
    currency: str = "USD"
    
    # Trends
    agent_invocations_trend: float = 0.0
    tokens_trend: float = 0.0
    storage_trend: float = 0.0
    api_calls_trend: float = 0.0


class UsageBreakdown(BaseModel):
    """Breakdown of usage by category."""
    category: str
    count: int
    percentage: float
    cost: float


class UsageHistory(BaseModel):
    """Historical usage data point."""
    timestamp: datetime
    agent_invocations: int = 0
    tokens: int = 0
    storage_gb: float = 0.0
    api_calls: int = 0
    cost: float = 0.0


class BillingHistoryItem(BaseModel):
    """Billing history item for display."""
    id: str
    period_start: datetime
    period_end: datetime
    agent_invocations: int
    total_tokens: int
    storage_gb: float
    api_calls: int
    subtotal: float
    discount_amount: float
    total_amount: float
    currency: str
    status: str
    invoice_id: Optional[str] = None


class QuotaStatus(BaseModel):
    """Quota status for a specific metric."""
    metric: str
    current: float
    limit: float
    percentage: float
    status: Literal['ok', 'warning', 'critical', 'exceeded']
    warning_threshold: int
    critical_threshold: int


class UsageDashboardResponse(BaseModel):
    """Complete usage dashboard response."""
    metrics: UsageDashboardMetrics
    quotas: list[QuotaStatus]
    usage_by_agent: list[UsageBreakdown]
    usage_by_user: list[UsageBreakdown]
    history: list[UsageHistory]
    billing_history: list[BillingHistoryItem]


class UsageDashboardService:
    """
    Service for providing tenant-accessible usage dashboard data.
    
    Validates: Requirements 22.5
    """
    
    def __init__(
        self,
        metering_service: Optional[MeteringService] = None,
        billing_pipeline: Optional[BillingPipeline] = None
    ):
        """Initialize the usage dashboard service."""
        self._metering_service = metering_service or get_metering_service()
        self._billing_pipeline = billing_pipeline or get_billing_pipeline()
    
    def get_dashboard_metrics(
        self,
        tenant_id: Optional[str] = None,
        period: Literal['day', 'week', 'month', 'year'] = 'month'
    ) -> UsageDashboardMetrics:
        """
        Get dashboard metrics for a tenant.
        
        Validates: Requirements 22.5
        
        Args:
            tenant_id: Tenant ID (uses current context if not provided).
            period: Time period for metrics.
            
        Returns:
            UsageDashboardMetrics with current usage and trends.
        """
        if tenant_id is None:
            tenant_id = get_current_tenant_id()
        
        if not tenant_id:
            raise ValueError("No tenant_id provided and no tenant context set")
        
        # Calculate period boundaries
        now = datetime.now()
        if period == 'day':
            period_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            period_label = "Today"
        elif period == 'week':
            period_start = now - timedelta(days=now.weekday())
            period_start = period_start.replace(hour=0, minute=0, second=0, microsecond=0)
            period_label = "This Week"
        elif period == 'month':
            period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            period_label = "This Month"
        else:  # year
            period_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            period_label = "This Year"
        
        # Get usage summary
        summary = self._metering_service.get_usage_summary(
            tenant_id=tenant_id,
            period_start=period_start,
            period_end=now
        )
        
        # Build metrics
        metrics = UsageDashboardMetrics(
            tenant_id=tenant_id,
            period_label=period_label,
            period_start=period_start,
            period_end=now,
            agent_invocations=summary.agent_invocations,
            total_tokens=summary.total_tokens,
            storage_gb=summary.storage_gb,
            api_calls=summary.api_calls,
            estimated_cost=summary.estimated_cost,
            agent_invocations_trend=summary.agent_invocations_trend,
            tokens_trend=summary.tokens_trend,
            storage_trend=summary.storage_trend,
            api_calls_trend=summary.api_calls_trend
        )
        
        # Add quota information if available
        if summary.quota:
            quota = summary.quota
            metrics.agent_invocations_quota = quota.max_agent_invocations
            metrics.agent_invocations_percent = quota.agent_invocation_usage_percent
            metrics.tokens_quota = quota.max_tokens
            metrics.tokens_percent = quota.token_usage_percent
            metrics.storage_quota_gb = quota.max_storage_gb
            metrics.storage_percent = quota.storage_usage_percent
            metrics.api_calls_quota = quota.max_api_calls
            metrics.api_calls_percent = quota.api_call_usage_percent
        
        return metrics
    
    def get_quota_status(
        self,
        tenant_id: Optional[str] = None
    ) -> list[QuotaStatus]:
        """
        Get quota status for all metrics.
        
        Validates: Requirements 22.5
        """
        if tenant_id is None:
            tenant_id = get_current_tenant_id()
        
        if not tenant_id:
            raise ValueError("No tenant_id provided and no tenant context set")
        
        quota = self._metering_service.get_quota(tenant_id)
        if not quota:
            return []
        
        metrics = ['agent_invocations', 'tokens', 'storage', 'api_calls']
        statuses = []
        
        for metric in metrics:
            if metric == 'agent_invocations':
                current = float(quota.current_agent_invocations)
                limit = float(quota.max_agent_invocations)
                percentage = quota.agent_invocation_usage_percent
            elif metric == 'tokens':
                current = float(quota.current_tokens)
                limit = float(quota.max_tokens)
                percentage = quota.token_usage_percent
            elif metric == 'storage':
                current = quota.current_storage_gb
                limit = quota.max_storage_gb
                percentage = quota.storage_usage_percent
            else:  # api_calls
                current = float(quota.current_api_calls)
                limit = float(quota.max_api_calls)
                percentage = quota.api_call_usage_percent
            
            statuses.append(QuotaStatus(
                metric=metric,
                current=current,
                limit=limit,
                percentage=percentage,
                status=quota.get_quota_status(metric),
                warning_threshold=quota.warning_threshold,
                critical_threshold=quota.critical_threshold
            ))
        
        return statuses
    
    def get_usage_breakdown_by_agent(
        self,
        tenant_id: Optional[str] = None,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None
    ) -> list[UsageBreakdown]:
        """
        Get usage breakdown by agent.
        
        Validates: Requirements 22.5
        """
        if tenant_id is None:
            tenant_id = get_current_tenant_id()
        
        if not tenant_id:
            raise ValueError("No tenant_id provided and no tenant context set")
        
        summary = self._metering_service.get_usage_summary(
            tenant_id=tenant_id,
            period_start=period_start,
            period_end=period_end
        )
        
        total = sum(a.get('invocations', 0) for a in summary.top_agents)
        if total == 0:
            return []
        
        breakdowns = []
        for agent in summary.top_agents:
            count = agent.get('invocations', 0)
            breakdowns.append(UsageBreakdown(
                category=agent.get('agent_id', 'unknown'),
                count=count,
                percentage=(count / total) * 100 if total > 0 else 0,
                cost=count * 0.01  # Simplified cost calculation
            ))
        
        return breakdowns
    
    def get_usage_breakdown_by_user(
        self,
        tenant_id: Optional[str] = None,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None
    ) -> list[UsageBreakdown]:
        """
        Get usage breakdown by user.
        
        Validates: Requirements 22.5
        """
        if tenant_id is None:
            tenant_id = get_current_tenant_id()
        
        if not tenant_id:
            raise ValueError("No tenant_id provided and no tenant context set")
        
        summary = self._metering_service.get_usage_summary(
            tenant_id=tenant_id,
            period_start=period_start,
            period_end=period_end
        )
        
        total = sum(u.get('events', 0) for u in summary.top_users)
        if total == 0:
            return []
        
        breakdowns = []
        for user in summary.top_users:
            count = user.get('events', 0)
            breakdowns.append(UsageBreakdown(
                category=user.get('user_id', 'unknown'),
                count=count,
                percentage=(count / total) * 100 if total > 0 else 0,
                cost=count * 0.001  # Simplified cost calculation
            ))
        
        return breakdowns
    
    def get_usage_history(
        self,
        tenant_id: Optional[str] = None,
        period: AggregationPeriod = 'daily',
        num_periods: int = 30
    ) -> list[UsageHistory]:
        """
        Get historical usage data.
        
        Validates: Requirements 22.5
        """
        if tenant_id is None:
            tenant_id = get_current_tenant_id()
        
        if not tenant_id:
            raise ValueError("No tenant_id provided and no tenant context set")
        
        history = []
        now = datetime.now()
        
        for i in range(num_periods):
            if period == 'hourly':
                period_start = now - timedelta(hours=i+1)
                period_start = period_start.replace(minute=0, second=0, microsecond=0)
            elif period == 'daily':
                period_start = now - timedelta(days=i+1)
                period_start = period_start.replace(hour=0, minute=0, second=0, microsecond=0)
            else:  # monthly
                # Go back i months
                month = now.month - i - 1
                year = now.year
                while month <= 0:
                    month += 12
                    year -= 1
                period_start = datetime(year, month, 1)
            
            # Get or create aggregate
            aggregate = self._metering_service.get_aggregate(tenant_id, period, period_start)
            
            if aggregate:
                history.append(UsageHistory(
                    timestamp=period_start,
                    agent_invocations=aggregate.agent_invocations,
                    tokens=aggregate.total_tokens,
                    storage_gb=aggregate.total_storage_bytes / (1024 ** 3),
                    api_calls=aggregate.api_calls,
                    cost=(
                        aggregate.agent_invocations * 0.01 +
                        (aggregate.total_tokens / 1000) * 0.002 +
                        (aggregate.total_storage_bytes / (1024 ** 3)) * 0.10 +
                        aggregate.api_calls * 0.001
                    )
                ))
            else:
                history.append(UsageHistory(
                    timestamp=period_start,
                    agent_invocations=0,
                    tokens=0,
                    storage_gb=0.0,
                    api_calls=0,
                    cost=0.0
                ))
        
        # Sort by timestamp ascending
        history.sort(key=lambda h: h.timestamp)
        return history
    
    def get_billing_history(
        self,
        tenant_id: Optional[str] = None,
        limit: int = 12
    ) -> list[BillingHistoryItem]:
        """
        Get billing history for a tenant.
        
        Validates: Requirements 22.5
        """
        if tenant_id is None:
            tenant_id = get_current_tenant_id()
        
        if not tenant_id:
            raise ValueError("No tenant_id provided and no tenant context set")
        
        records = self._billing_pipeline.get_billing_records(tenant_id)[:limit]
        
        return [
            BillingHistoryItem(
                id=r.id,
                period_start=r.period_start,
                period_end=r.period_end,
                agent_invocations=r.agent_invocations,
                total_tokens=r.total_tokens,
                storage_gb=r.storage_gb,
                api_calls=r.api_calls,
                subtotal=r.subtotal,
                discount_amount=r.discount_amount,
                total_amount=r.total_amount,
                currency=r.currency,
                status=r.status,
                invoice_id=r.invoice_id
            )
            for r in records
        ]
    
    def get_full_dashboard(
        self,
        tenant_id: Optional[str] = None,
        period: Literal['day', 'week', 'month', 'year'] = 'month'
    ) -> UsageDashboardResponse:
        """
        Get complete dashboard data.
        
        Validates: Requirements 22.5
        """
        if tenant_id is None:
            tenant_id = get_current_tenant_id()
        
        if not tenant_id:
            raise ValueError("No tenant_id provided and no tenant context set")
        
        metrics = self.get_dashboard_metrics(tenant_id, period)
        
        return UsageDashboardResponse(
            metrics=metrics,
            quotas=self.get_quota_status(tenant_id),
            usage_by_agent=self.get_usage_breakdown_by_agent(
                tenant_id,
                metrics.period_start,
                metrics.period_end
            ),
            usage_by_user=self.get_usage_breakdown_by_user(
                tenant_id,
                metrics.period_start,
                metrics.period_end
            ),
            history=self.get_usage_history(tenant_id, 'daily', 30),
            billing_history=self.get_billing_history(tenant_id, 12)
        )


# Global usage dashboard service instance
_usage_dashboard_service: Optional[UsageDashboardService] = None


def get_usage_dashboard_service() -> UsageDashboardService:
    """Get the global usage dashboard service instance."""
    global _usage_dashboard_service
    if _usage_dashboard_service is None:
        _usage_dashboard_service = UsageDashboardService()
    return _usage_dashboard_service


def get_dashboard_metrics(
    tenant_id: Optional[str] = None,
    period: Literal['day', 'week', 'month', 'year'] = 'month'
) -> UsageDashboardMetrics:
    """
    Convenience function to get dashboard metrics.
    
    Validates: Requirements 22.5
    """
    service = get_usage_dashboard_service()
    return service.get_dashboard_metrics(tenant_id, period)


def get_full_usage_dashboard(
    tenant_id: Optional[str] = None,
    period: Literal['day', 'week', 'month', 'year'] = 'month'
) -> UsageDashboardResponse:
    """
    Convenience function to get full dashboard data.
    
    Validates: Requirements 22.5
    """
    service = get_usage_dashboard_service()
    return service.get_full_dashboard(tenant_id, period)
