"""
Usage metering models for the Agentic Data Governance System.

This module defines Pydantic models for tracking tenant resource consumption
including agent invocations, tokens, storage, and API calls.

Requirements: 22.1, 22.2
"""

from datetime import datetime
from typing import Literal, Optional, Any
from pydantic import BaseModel, Field
from uuid import uuid4


# Type aliases
UsageEventType = Literal[
    'agent_invocation',
    'token_consumption',
    'storage_write',
    'storage_read',
    'api_call',
    'report_processed',
    'cde_scored',
    'rule_executed',
    'issue_created',
    'approval_processed'
]

AggregationPeriod = Literal['hourly', 'daily', 'monthly']
BillingStatus = Literal['pending', 'processed', 'failed', 'exported']


class UsageEvent(BaseModel):
    """
    Individual usage event for metering.
    
    Captures a single billable action performed by a tenant.
    
    Validates: Requirements 22.1, 22.2
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: str
    event_type: UsageEventType
    timestamp: datetime = Field(default_factory=datetime.now)
    
    # Event-specific metrics
    quantity: int = 1
    tokens_input: int = 0
    tokens_output: int = 0
    bytes_transferred: int = 0
    
    # Context information
    agent_id: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    report_id: Optional[str] = None
    
    # Additional metadata
    metadata: dict[str, Any] = Field(default_factory=dict)
    
    @property
    def total_tokens(self) -> int:
        """Total tokens consumed (input + output)."""
        return self.tokens_input + self.tokens_output


class UsageAggregate(BaseModel):
    """
    Aggregated usage metrics for a time period.
    
    Validates: Requirements 22.2, 22.3
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: str
    period: AggregationPeriod
    period_start: datetime
    period_end: datetime
    
    # Aggregated counts
    agent_invocations: int = 0
    total_tokens_input: int = 0
    total_tokens_output: int = 0
    storage_writes: int = 0
    storage_reads: int = 0
    storage_bytes_written: int = 0
    storage_bytes_read: int = 0
    api_calls: int = 0
    reports_processed: int = 0
    cdes_scored: int = 0
    rules_executed: int = 0
    issues_created: int = 0
    approvals_processed: int = 0
    
    # Computed metrics
    active_users: int = 0
    peak_concurrent_sessions: int = 0
    
    # Billing status
    status: BillingStatus = 'pending'
    exported_at: Optional[datetime] = None
    billing_reference: Optional[str] = None
    
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    @property
    def total_tokens(self) -> int:
        """Total tokens consumed in this period."""
        return self.total_tokens_input + self.total_tokens_output
    
    @property
    def total_storage_bytes(self) -> int:
        """Total storage bytes transferred."""
        return self.storage_bytes_written + self.storage_bytes_read


class BillingRecord(BaseModel):
    """
    Billing record for a tenant's usage.
    
    Validates: Requirements 22.2, 22.3
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: str
    period_start: datetime
    period_end: datetime
    
    # Usage summary
    agent_invocations: int = 0
    total_tokens: int = 0
    storage_gb: float = 0.0
    api_calls: int = 0
    
    # Pricing
    unit_prices: dict[str, float] = Field(default_factory=lambda: {
        "agent_invocation": 0.01,
        "token_1k": 0.002,
        "storage_gb": 0.10,
        "api_call": 0.001
    })
    
    # Calculated amounts
    agent_invocation_cost: float = 0.0
    token_cost: float = 0.0
    storage_cost: float = 0.0
    api_call_cost: float = 0.0
    subtotal: float = 0.0
    discount_percent: float = 0.0
    discount_amount: float = 0.0
    total_amount: float = 0.0
    currency: str = "USD"
    
    # Status
    status: BillingStatus = 'pending'
    invoice_id: Optional[str] = None
    payment_id: Optional[str] = None
    
    created_at: datetime = Field(default_factory=datetime.now)
    processed_at: Optional[datetime] = None
    
    def calculate_costs(self) -> None:
        """Calculate costs based on usage and unit prices."""
        self.agent_invocation_cost = self.agent_invocations * self.unit_prices.get("agent_invocation", 0.01)
        self.token_cost = (self.total_tokens / 1000) * self.unit_prices.get("token_1k", 0.002)
        self.storage_cost = self.storage_gb * self.unit_prices.get("storage_gb", 0.10)
        self.api_call_cost = self.api_calls * self.unit_prices.get("api_call", 0.001)
        
        self.subtotal = (
            self.agent_invocation_cost +
            self.token_cost +
            self.storage_cost +
            self.api_call_cost
        )
        
        self.discount_amount = self.subtotal * (self.discount_percent / 100)
        self.total_amount = self.subtotal - self.discount_amount


class TenantQuota(BaseModel):
    """
    Quota limits for a tenant.
    
    Validates: Requirements 22.1
    """
    tenant_id: str
    
    # Monthly limits
    max_agent_invocations: int = 10000
    max_tokens: int = 1000000
    max_storage_gb: float = 10.0
    max_api_calls: int = 100000
    
    # Current usage (updated periodically)
    current_agent_invocations: int = 0
    current_tokens: int = 0
    current_storage_gb: float = 0.0
    current_api_calls: int = 0
    
    # Alert thresholds (percentage)
    warning_threshold: int = 80
    critical_threshold: int = 95
    
    period_start: datetime = Field(default_factory=datetime.now)
    period_end: Optional[datetime] = None
    
    @property
    def agent_invocation_usage_percent(self) -> float:
        """Percentage of agent invocation quota used."""
        if self.max_agent_invocations == 0:
            return 0.0
        return (self.current_agent_invocations / self.max_agent_invocations) * 100
    
    @property
    def token_usage_percent(self) -> float:
        """Percentage of token quota used."""
        if self.max_tokens == 0:
            return 0.0
        return (self.current_tokens / self.max_tokens) * 100
    
    @property
    def storage_usage_percent(self) -> float:
        """Percentage of storage quota used."""
        if self.max_storage_gb == 0:
            return 0.0
        return (self.current_storage_gb / self.max_storage_gb) * 100
    
    @property
    def api_call_usage_percent(self) -> float:
        """Percentage of API call quota used."""
        if self.max_api_calls == 0:
            return 0.0
        return (self.current_api_calls / self.max_api_calls) * 100
    
    def is_quota_exceeded(self, metric: str) -> bool:
        """Check if a specific quota is exceeded."""
        if metric == "agent_invocations":
            return self.current_agent_invocations >= self.max_agent_invocations
        elif metric == "tokens":
            return self.current_tokens >= self.max_tokens
        elif metric == "storage":
            return self.current_storage_gb >= self.max_storage_gb
        elif metric == "api_calls":
            return self.current_api_calls >= self.max_api_calls
        return False
    
    def get_quota_status(self, metric: str) -> Literal['ok', 'warning', 'critical', 'exceeded']:
        """Get the status of a specific quota."""
        usage_percent = 0.0
        if metric == "agent_invocations":
            usage_percent = self.agent_invocation_usage_percent
        elif metric == "tokens":
            usage_percent = self.token_usage_percent
        elif metric == "storage":
            usage_percent = self.storage_usage_percent
        elif metric == "api_calls":
            usage_percent = self.api_call_usage_percent
        
        if usage_percent >= 100:
            return 'exceeded'
        elif usage_percent >= self.critical_threshold:
            return 'critical'
        elif usage_percent >= self.warning_threshold:
            return 'warning'
        return 'ok'


class UsageSummary(BaseModel):
    """
    Summary of tenant usage for dashboard display.
    
    Validates: Requirements 22.5
    """
    tenant_id: str
    period_start: datetime
    period_end: datetime
    
    # Current period usage
    agent_invocations: int = 0
    total_tokens: int = 0
    storage_gb: float = 0.0
    api_calls: int = 0
    
    # Quota information
    quota: Optional[TenantQuota] = None
    
    # Cost estimates
    estimated_cost: float = 0.0
    currency: str = "USD"
    
    # Trends (compared to previous period)
    agent_invocations_trend: float = 0.0  # percentage change
    tokens_trend: float = 0.0
    storage_trend: float = 0.0
    api_calls_trend: float = 0.0
    
    # Top consumers
    top_agents: list[dict[str, Any]] = Field(default_factory=list)
    top_users: list[dict[str, Any]] = Field(default_factory=list)
    top_reports: list[dict[str, Any]] = Field(default_factory=list)
