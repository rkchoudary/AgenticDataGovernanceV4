"""
Hypothesis strategies for Tenant models.

Contains test data generators for multi-tenant SaaS Pydantic models.

**Feature: agentcore-python-refactor, Property 28: Tenant Data Isolation**
**Validates: Requirements 20.1, 20.2, 42.1**
"""

from datetime import datetime, timedelta
from typing import Any
from hypothesis import strategies as st
from hypothesis.strategies import composite

from models.tenant import (
    Tenant,
    TenantConfig,
    TenantBranding,
    Subscription,
    TenantUsage,
    TenantProvisioningRequest,
    TenantOffboardingRequest,
    TenantStatus,
    SubscriptionTier,
    SubscriptionStatus,
    BillingProvider,
)


# Basic strategies - enums
tenant_status_strategy = st.sampled_from(['active', 'suspended', 'pending', 'offboarded'])
subscription_tier_strategy = st.sampled_from(['free', 'starter', 'professional', 'enterprise'])
subscription_status_strategy = st.sampled_from(['active', 'trial', 'past_due', 'cancelled', 'expired'])
billing_provider_strategy = st.sampled_from(['stripe', 'aws_marketplace', 'azure_marketplace'])

# Non-empty string strategy
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)

# Slug strategy (URL-friendly identifier)
slug_strategy = st.from_regex(r'[a-z][a-z0-9\-]{2,29}', fullmatch=True)

# Email strategy
email_strategy = st.from_regex(r'[a-z]{3,10}@[a-z]{3,10}\.[a-z]{2,4}', fullmatch=True)

# Color strategy (hex colors)
color_strategy = st.from_regex(r'#[0-9a-f]{6}', fullmatch=True)

# URL strategy
url_strategy = st.from_regex(r'https://[a-z]{3,10}\.[a-z]{2,4}/[a-z0-9\-]{1,20}', fullmatch=True)

# Domain strategy
domain_strategy = st.from_regex(r'[a-z]{3,10}\.[a-z]{2,4}', fullmatch=True)

# Jurisdiction strategy
jurisdiction_strategy = st.sampled_from(['US', 'CA', 'UK', 'EU', 'APAC'])


@composite
def tenant_branding_strategy(draw, white_label: bool = None):
    """
    Generate a TenantBranding.
    
    Args:
        white_label: If True, enable white label. If False, disable.
    """
    is_white_label = white_label if white_label is not None else draw(st.booleans())
    
    branding = TenantBranding(
        logo_url=draw(st.none() | url_strategy),
        favicon_url=draw(st.none() | url_strategy),
        primary_color=draw(color_strategy),
        secondary_color=draw(color_strategy),
        accent_color=draw(color_strategy),
        font_family=draw(st.sampled_from([
            'Inter, sans-serif',
            'Roboto, sans-serif',
            'Open Sans, sans-serif',
            'Lato, sans-serif'
        ])),
        custom_css=draw(st.none() | st.text(min_size=10, max_size=500)),
        white_label=is_white_label
    )
    
    if is_white_label:
        branding.custom_domain = draw(st.none() | domain_strategy)
    
    return branding


@composite
def tenant_config_strategy(draw, tier: SubscriptionTier = None):
    """
    Generate a TenantConfig.
    
    Args:
        tier: Optional subscription tier to determine limits.
    """
    actual_tier = tier or draw(subscription_tier_strategy)
    
    # Set limits based on tier
    tier_limits = {
        'free': {'max_users': 5, 'max_agents': 2, 'max_reports': 10, 'max_cdes': 100, 'max_storage_gb': 1.0},
        'starter': {'max_users': 10, 'max_agents': 4, 'max_reports': 25, 'max_cdes': 500, 'max_storage_gb': 5.0},
        'professional': {'max_users': 50, 'max_agents': 8, 'max_reports': 100, 'max_cdes': 2000, 'max_storage_gb': 25.0},
        'enterprise': {'max_users': 500, 'max_agents': 8, 'max_reports': 500, 'max_cdes': 10000, 'max_storage_gb': 100.0},
    }
    
    limits = tier_limits.get(actual_tier, tier_limits['free'])
    
    # Features based on tier
    features = {
        'ai_chat': True,
        'lineage_visualization': True,
        'advanced_analytics': actual_tier in ['professional', 'enterprise'],
        'custom_integrations': actual_tier == 'enterprise',
        'sso': actual_tier in ['professional', 'enterprise'],
        'audit_export': True,
    }
    
    return TenantConfig(
        max_users=limits['max_users'],
        max_agents=limits['max_agents'],
        max_reports=limits['max_reports'],
        max_cdes=limits['max_cdes'],
        max_storage_gb=limits['max_storage_gb'],
        retention_days=draw(st.sampled_from([90, 180, 365, 730])),
        features=features,
        allowed_jurisdictions=draw(st.lists(
            jurisdiction_strategy,
            min_size=1,
            max_size=5,
            unique=True
        )),
        notification_settings=draw(st.fixed_dictionaries({
            'email_enabled': st.booleans(),
            'slack_enabled': st.booleans(),
            'digest_frequency': st.sampled_from(['daily', 'weekly', 'immediate'])
        }))
    )


@composite
def subscription_strategy(
    draw,
    tenant_id: str = None,
    tier: SubscriptionTier = None,
    status: SubscriptionStatus = None
):
    """
    Generate a Subscription.
    
    Args:
        tenant_id: Optional specific tenant ID.
        tier: Optional specific tier.
        status: Optional specific status.
    """
    actual_tier = tier or draw(subscription_tier_strategy)
    actual_status = status or draw(subscription_status_strategy)
    
    started_at = draw(st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2025, 12, 31)
    ))
    
    # Calculate period dates
    period_start = started_at
    period_end = started_at + timedelta(days=30)
    
    # Pricing based on tier
    tier_pricing = {
        'free': 0.0,
        'starter': 99.0,
        'professional': 499.0,
        'enterprise': 1999.0,
    }
    
    subscription = Subscription(
        id=draw(st.uuids().map(str)),
        tenant_id=tenant_id or draw(st.uuids().map(str)),
        tier=actual_tier,
        status=actual_status,
        billing_provider=draw(st.none() | billing_provider_strategy) if actual_tier != 'free' else None,
        external_subscription_id=draw(st.none() | st.uuids().map(str)) if actual_tier != 'free' else None,
        started_at=started_at,
        current_period_start=period_start,
        current_period_end=period_end,
        monthly_price=tier_pricing.get(actual_tier, 0.0),
        currency=draw(st.sampled_from(['USD', 'EUR', 'GBP', 'CAD']))
    )
    
    # Add trial end date if in trial
    if actual_status == 'trial':
        subscription.trial_ends_at = started_at + timedelta(days=14)
    
    # Add cancelled date if cancelled
    if actual_status == 'cancelled':
        subscription.cancelled_at = draw(st.datetimes(
            min_value=started_at,
            max_value=datetime(2030, 12, 31)
        ))
    
    return subscription


@composite
def tenant_strategy(
    draw,
    status: TenantStatus = None,
    tier: SubscriptionTier = None,
    with_subscription: bool = None
):
    """
    Generate a Tenant.
    
    Args:
        status: Optional specific status.
        tier: Optional specific subscription tier.
        with_subscription: If True, include subscription. If False, exclude.
    """
    actual_status = status or draw(tenant_status_strategy)
    actual_tier = tier or draw(subscription_tier_strategy)
    
    tenant_id = draw(st.uuids().map(str))
    created_at = draw(st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2025, 12, 31)
    ))
    
    tenant = Tenant(
        id=tenant_id,
        name=draw(non_empty_string_strategy),
        slug=draw(slug_strategy),
        status=actual_status,
        config=draw(tenant_config_strategy(tier=actual_tier)),
        branding=draw(tenant_branding_strategy()),
        created_at=created_at,
        updated_at=draw(st.datetimes(
            min_value=created_at,
            max_value=datetime(2030, 12, 31)
        )),
        admin_email=draw(email_strategy),
        admin_name=draw(non_empty_string_strategy),
        metadata=draw(st.fixed_dictionaries({
            'source': st.sampled_from(['direct', 'marketplace', 'referral']),
            'industry': st.sampled_from(['banking', 'insurance', 'investment', 'fintech'])
        }))
    )
    
    # Add subscription if requested or randomly
    has_subscription = with_subscription if with_subscription is not None else draw(st.booleans())
    if has_subscription:
        tenant.subscription = draw(subscription_strategy(tenant_id=tenant_id, tier=actual_tier))
    
    # Add onboarded date if active
    if actual_status == 'active':
        tenant.onboarded_at = draw(st.datetimes(
            min_value=created_at,
            max_value=datetime(2030, 12, 31)
        ))
    
    # Add offboarded date if offboarded
    if actual_status == 'offboarded':
        tenant.offboarded_at = draw(st.datetimes(
            min_value=created_at,
            max_value=datetime(2030, 12, 31)
        ))
    
    return tenant


@composite
def tenant_usage_strategy(draw, tenant_id: str = None):
    """
    Generate a TenantUsage.
    
    Args:
        tenant_id: Optional specific tenant ID.
    """
    period_start = draw(st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2025, 12, 31)
    ))
    
    return TenantUsage(
        tenant_id=tenant_id or draw(st.uuids().map(str)),
        period_start=period_start,
        period_end=period_start + timedelta(days=30),
        agent_invocations=draw(st.integers(min_value=0, max_value=100000)),
        token_consumption=draw(st.integers(min_value=0, max_value=10000000)),
        storage_used_gb=draw(st.floats(min_value=0.0, max_value=100.0)),
        api_calls=draw(st.integers(min_value=0, max_value=1000000)),
        active_users=draw(st.integers(min_value=0, max_value=500)),
        reports_processed=draw(st.integers(min_value=0, max_value=1000))
    )


@composite
def tenant_provisioning_request_strategy(draw, tier: SubscriptionTier = None):
    """
    Generate a TenantProvisioningRequest.
    
    Args:
        tier: Optional specific tier.
    """
    actual_tier = tier or draw(subscription_tier_strategy)
    
    request = TenantProvisioningRequest(
        name=draw(non_empty_string_strategy),
        slug=draw(slug_strategy),
        admin_email=draw(email_strategy),
        admin_name=draw(non_empty_string_strategy),
        tier=actual_tier,
        metadata=draw(st.fixed_dictionaries({
            'source': st.sampled_from(['direct', 'marketplace', 'referral']),
            'industry': st.sampled_from(['banking', 'insurance', 'investment', 'fintech'])
        }))
    )
    
    # Add billing info for paid tiers
    if actual_tier != 'free':
        request.billing_provider = draw(billing_provider_strategy)
        request.external_subscription_id = draw(st.uuids().map(str))
    
    return request


@composite
def tenant_offboarding_request_strategy(draw, tenant_id: str = None):
    """
    Generate a TenantOffboardingRequest.
    
    Args:
        tenant_id: Optional specific tenant ID.
    """
    return TenantOffboardingRequest(
        tenant_id=tenant_id or draw(st.uuids().map(str)),
        reason=draw(st.text(
            min_size=10,
            max_size=300,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        preserve_audit_trail=draw(st.booleans()),
        immediate=draw(st.booleans())
    )


# Convenience strategies for common test scenarios

@composite
def active_tenant_strategy(draw, tier: SubscriptionTier = None):
    """
    Generate an active tenant.
    
    Convenience strategy for testing active tenant scenarios.
    """
    return draw(tenant_strategy(status='active', tier=tier, with_subscription=True))


@composite
def pending_tenant_strategy(draw):
    """
    Generate a pending tenant.
    
    Convenience strategy for testing tenant provisioning.
    """
    return draw(tenant_strategy(status='pending', with_subscription=False))


@composite
def enterprise_tenant_strategy(draw):
    """
    Generate an enterprise tenant.
    
    Convenience strategy for testing enterprise features.
    """
    return draw(tenant_strategy(status='active', tier='enterprise', with_subscription=True))


@composite
def free_tier_tenant_strategy(draw):
    """
    Generate a free tier tenant.
    
    Convenience strategy for testing free tier limitations.
    """
    return draw(tenant_strategy(status='active', tier='free', with_subscription=True))


@composite
def tenant_pair_strategy(draw):
    """
    Generate a pair of distinct tenants.
    
    Useful for testing tenant isolation.
    """
    tenant1 = draw(active_tenant_strategy())
    tenant2 = draw(active_tenant_strategy())
    
    # Ensure different IDs
    while tenant2.id == tenant1.id:
        tenant2 = draw(active_tenant_strategy())
    
    return (tenant1, tenant2)
