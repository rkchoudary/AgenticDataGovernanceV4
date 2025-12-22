"""
Multi-tenant SaaS models for the Agentic Data Governance System.

This module defines Pydantic models for tenants, configurations,
branding, and subscriptions.

Requirements: 20.1, 20.2
"""

from datetime import datetime
from typing import Literal, Optional, Any
from pydantic import BaseModel, Field
from uuid import uuid4


# Type aliases
TenantStatus = Literal['active', 'suspended', 'pending', 'offboarded']
SubscriptionTier = Literal['free', 'starter', 'professional', 'enterprise']
SubscriptionStatus = Literal['active', 'trial', 'past_due', 'cancelled', 'expired']
BillingProvider = Literal['stripe', 'aws_marketplace', 'azure_marketplace']


class TenantBranding(BaseModel):
    """Branding configuration for a tenant."""
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    primary_color: str = "#1a73e8"
    secondary_color: str = "#4285f4"
    accent_color: str = "#34a853"
    font_family: str = "Inter, sans-serif"
    custom_css: Optional[str] = None
    custom_domain: Optional[str] = None
    white_label: bool = False


class TenantConfig(BaseModel):
    """Configuration settings for a tenant."""
    max_users: int = 10
    max_agents: int = 8
    max_reports: int = 50
    max_cdes: int = 1000
    max_storage_gb: float = 10.0
    retention_days: int = 365
    features: dict[str, bool] = Field(default_factory=lambda: {
        "ai_chat": True,
        "lineage_visualization": True,
        "advanced_analytics": False,
        "custom_integrations": False,
        "sso": False,
        "audit_export": True,
    })
    allowed_jurisdictions: list[str] = Field(default_factory=lambda: ["US", "CA"])
    notification_settings: dict[str, Any] = Field(default_factory=dict)


class Subscription(BaseModel):
    """Subscription details for a tenant."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: str
    tier: SubscriptionTier = 'free'
    status: SubscriptionStatus = 'trial'
    billing_provider: Optional[BillingProvider] = None
    external_subscription_id: Optional[str] = None
    started_at: datetime
    trial_ends_at: Optional[datetime] = None
    current_period_start: datetime
    current_period_end: datetime
    cancelled_at: Optional[datetime] = None
    monthly_price: float = 0.0
    currency: str = "USD"


class Tenant(BaseModel):
    """
    Represents a tenant organization in the multi-tenant SaaS platform.
    
    Validates: Requirements 20.1, 20.2
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    slug: str  # URL-friendly identifier
    status: TenantStatus = 'pending'
    config: TenantConfig = Field(default_factory=TenantConfig)
    branding: TenantBranding = Field(default_factory=TenantBranding)
    subscription: Optional[Subscription] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    onboarded_at: Optional[datetime] = None
    offboarded_at: Optional[datetime] = None
    admin_email: str
    admin_name: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class TenantUsage(BaseModel):
    """Usage metrics for a tenant."""
    tenant_id: str
    period_start: datetime
    period_end: datetime
    agent_invocations: int = 0
    token_consumption: int = 0
    storage_used_gb: float = 0.0
    api_calls: int = 0
    active_users: int = 0
    reports_processed: int = 0


class TenantProvisioningRequest(BaseModel):
    """Request to provision a new tenant."""
    name: str
    slug: str
    admin_email: str
    admin_name: str
    tier: SubscriptionTier = 'free'
    billing_provider: Optional[BillingProvider] = None
    external_subscription_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TenantOffboardingRequest(BaseModel):
    """Request to offboard a tenant."""
    tenant_id: str
    reason: str
    preserve_audit_trail: bool = True
    immediate: bool = False
