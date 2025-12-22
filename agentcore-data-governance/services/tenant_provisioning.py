"""
Tenant provisioning service for the Agentic Data Governance System.

This module provides tenant lifecycle management including onboarding,
configuration, and offboarding with proper data isolation.

Requirements: 20.1, 20.5
"""

from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4
import re

from typing import TYPE_CHECKING

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
)
from models.audit import AuditEntry

if TYPE_CHECKING:
    from repository.tenant_aware import TenantAwareRepository


# Tier-based configuration limits
TIER_CONFIGS = {
    'free': TenantConfig(
        max_users=5,
        max_agents=3,
        max_reports=10,
        max_cdes=100,
        max_storage_gb=1.0,
        retention_days=30,
        features={
            "ai_chat": True,
            "lineage_visualization": True,
            "advanced_analytics": False,
            "custom_integrations": False,
            "sso": False,
            "audit_export": False,
        },
    ),
    'starter': TenantConfig(
        max_users=10,
        max_agents=5,
        max_reports=25,
        max_cdes=500,
        max_storage_gb=5.0,
        retention_days=90,
        features={
            "ai_chat": True,
            "lineage_visualization": True,
            "advanced_analytics": True,
            "custom_integrations": False,
            "sso": False,
            "audit_export": True,
        },
    ),
    'professional': TenantConfig(
        max_users=50,
        max_agents=8,
        max_reports=100,
        max_cdes=2000,
        max_storage_gb=25.0,
        retention_days=365,
        features={
            "ai_chat": True,
            "lineage_visualization": True,
            "advanced_analytics": True,
            "custom_integrations": True,
            "sso": True,
            "audit_export": True,
        },
    ),
    'enterprise': TenantConfig(
        max_users=500,
        max_agents=8,
        max_reports=500,
        max_cdes=10000,
        max_storage_gb=100.0,
        retention_days=2555,  # 7 years for regulatory compliance
        features={
            "ai_chat": True,
            "lineage_visualization": True,
            "advanced_analytics": True,
            "custom_integrations": True,
            "sso": True,
            "audit_export": True,
        },
    ),
}

# Tier pricing (monthly in USD)
TIER_PRICING = {
    'free': 0.0,
    'starter': 99.0,
    'professional': 499.0,
    'enterprise': 1999.0,
}


class TenantProvisioningError(Exception):
    """Error during tenant provisioning."""
    pass


class TenantNotFoundError(Exception):
    """Tenant not found."""
    pass


class TenantProvisioningService:
    """
    Service for managing tenant lifecycle.
    
    Handles tenant onboarding, configuration updates, and offboarding
    with proper data isolation and audit trail preservation.
    
    Validates: Requirements 20.1, 20.5
    """
    
    def __init__(self, repository: "TenantAwareRepository"):
        """
        Initialize the tenant provisioning service.
        
        Args:
            repository: The tenant-aware repository for data storage.
        """
        self.repository = repository
    
    def _validate_slug(self, slug: str) -> bool:
        """Validate tenant slug format."""
        # Slug must be lowercase alphanumeric with hyphens, 3-50 chars
        pattern = r'^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'
        return bool(re.match(pattern, slug))
    
    def _is_slug_available(self, slug: str) -> bool:
        """Check if a slug is available."""
        for tenant in self.repository.list_tenants():
            if tenant.slug == slug:
                return False
        return True
    
    def provision_tenant(self, request: TenantProvisioningRequest) -> Tenant:
        """
        Provision a new tenant with isolated resources.
        
        Creates a new tenant with:
        - Dedicated data namespace
        - Tier-appropriate configuration
        - Initial subscription
        - Audit trail entry
        
        Args:
            request: The provisioning request with tenant details.
            
        Returns:
            The created tenant.
            
        Raises:
            TenantProvisioningError: If provisioning fails.
        """
        # Validate slug
        if not self._validate_slug(request.slug):
            raise TenantProvisioningError(
                f"Invalid slug format: {request.slug}. "
                "Slug must be 3-50 lowercase alphanumeric characters with hyphens."
            )
        
        # Check slug availability
        if not self._is_slug_available(request.slug):
            raise TenantProvisioningError(
                f"Slug already in use: {request.slug}"
            )
        
        # Get tier-based configuration
        config = TIER_CONFIGS.get(request.tier, TIER_CONFIGS['free']).model_copy()
        
        # Create subscription
        now = datetime.now()
        trial_days = 14 if request.tier != 'free' else 0
        
        subscription = Subscription(
            tenant_id="",  # Will be set after tenant creation
            tier=request.tier,
            status='trial' if trial_days > 0 else 'active',
            billing_provider=request.billing_provider,
            external_subscription_id=request.external_subscription_id,
            started_at=now,
            trial_ends_at=now + timedelta(days=trial_days) if trial_days > 0 else None,
            current_period_start=now,
            current_period_end=now + timedelta(days=30),
            monthly_price=TIER_PRICING.get(request.tier, 0.0),
        )
        
        # Create tenant
        tenant = Tenant(
            name=request.name,
            slug=request.slug,
            status='active',
            config=config,
            branding=TenantBranding(),
            admin_email=request.admin_email,
            admin_name=request.admin_name,
            metadata=request.metadata,
            created_at=now,
            updated_at=now,
            onboarded_at=now,
        )
        
        # Update subscription with tenant ID
        subscription.tenant_id = tenant.id
        tenant.subscription = subscription
        
        # Store tenant
        self.repository.create_tenant(tenant)
        
        # Create audit entry for provisioning
        # Store directly in the repository's audit entries
        audit_key = f"tenant:{tenant.id}:audit:all"
        if audit_key not in self.repository._audit_entries:
            self.repository._audit_entries[audit_key] = []
        
        self.repository._audit_entries[audit_key].append(AuditEntry(
            tenant_id=tenant.id,
            actor="TenantProvisioningService",
            actor_type="system",
            action="provision_tenant",
            entity_type="Tenant",
            entity_id=tenant.id,
            new_state={
                "name": tenant.name,
                "slug": tenant.slug,
                "tier": request.tier,
                "admin_email": tenant.admin_email,
            },
            rationale=f"Tenant provisioned with {request.tier} tier",
        ))
        
        return tenant
    
    def _create_audit_entry(self, tenant_id: str, entry: AuditEntry) -> None:
        """Helper to create audit entry for a tenant."""
        audit_key = f"tenant:{tenant_id}:audit:all"
        if audit_key not in self.repository._audit_entries:
            self.repository._audit_entries[audit_key] = []
        self.repository._audit_entries[audit_key].append(entry)
    
    def get_tenant(self, tenant_id: str) -> Tenant:
        """
        Get a tenant by ID.
        
        Args:
            tenant_id: The tenant ID.
            
        Returns:
            The tenant.
            
        Raises:
            TenantNotFoundError: If tenant not found.
        """
        tenant = self.repository.get_tenant(tenant_id)
        if not tenant:
            raise TenantNotFoundError(f"Tenant not found: {tenant_id}")
        return tenant
    
    def get_tenant_by_slug(self, slug: str) -> Optional[Tenant]:
        """
        Get a tenant by slug.
        
        Args:
            slug: The tenant slug.
            
        Returns:
            The tenant if found, None otherwise.
        """
        for tenant in self.repository.list_tenants():
            if tenant.slug == slug:
                return tenant
        return None
    
    def update_tenant_config(
        self,
        tenant_id: str,
        config_updates: dict,
        updated_by: str
    ) -> Tenant:
        """
        Update tenant configuration.
        
        Args:
            tenant_id: The tenant ID.
            config_updates: Dictionary of configuration updates.
            updated_by: Who is making the update.
            
        Returns:
            The updated tenant.
        """
        tenant = self.get_tenant(tenant_id)
        previous_config = tenant.config.model_dump()
        
        # Apply updates
        for key, value in config_updates.items():
            if hasattr(tenant.config, key):
                setattr(tenant.config, key, value)
        
        tenant.updated_at = datetime.now()
        self.repository.update_tenant(tenant)
        
        # Audit entry
        self._create_audit_entry(tenant_id, AuditEntry(
            tenant_id=tenant_id,
            actor=updated_by,
            actor_type="human",
            action="update_tenant_config",
            entity_type="TenantConfig",
            entity_id=tenant_id,
            previous_state=previous_config,
            new_state=tenant.config.model_dump(),
            rationale="Configuration updated",
        ))
        
        return tenant
    
    def update_tenant_branding(
        self,
        tenant_id: str,
        branding_updates: dict,
        updated_by: str
    ) -> Tenant:
        """
        Update tenant branding.
        
        Args:
            tenant_id: The tenant ID.
            branding_updates: Dictionary of branding updates.
            updated_by: Who is making the update.
            
        Returns:
            The updated tenant.
        """
        tenant = self.get_tenant(tenant_id)
        previous_branding = tenant.branding.model_dump()
        
        # Apply updates
        for key, value in branding_updates.items():
            if hasattr(tenant.branding, key):
                setattr(tenant.branding, key, value)
        
        tenant.updated_at = datetime.now()
        self.repository.update_tenant(tenant)
        
        # Audit entry
        self._create_audit_entry(tenant_id, AuditEntry(
            tenant_id=tenant_id,
            actor=updated_by,
            actor_type="human",
            action="update_tenant_branding",
            entity_type="TenantBranding",
            entity_id=tenant_id,
            previous_state=previous_branding,
            new_state=tenant.branding.model_dump(),
            rationale="Branding updated",
        ))
        
        return tenant
    
    def upgrade_subscription(
        self,
        tenant_id: str,
        new_tier: SubscriptionTier,
        updated_by: str
    ) -> Tenant:
        """
        Upgrade tenant subscription tier.
        
        Args:
            tenant_id: The tenant ID.
            new_tier: The new subscription tier.
            updated_by: Who is making the upgrade.
            
        Returns:
            The updated tenant.
        """
        tenant = self.get_tenant(tenant_id)
        
        if not tenant.subscription:
            raise TenantProvisioningError("Tenant has no subscription")
        
        previous_tier = tenant.subscription.tier
        
        # Update subscription
        tenant.subscription.tier = new_tier
        tenant.subscription.monthly_price = TIER_PRICING.get(new_tier, 0.0)
        tenant.subscription.status = 'active'
        
        # Update config to match new tier
        new_config = TIER_CONFIGS.get(new_tier, TIER_CONFIGS['free'])
        tenant.config = new_config.model_copy()
        
        tenant.updated_at = datetime.now()
        self.repository.update_tenant(tenant)
        
        # Audit entry
        self._create_audit_entry(tenant_id, AuditEntry(
            tenant_id=tenant_id,
            actor=updated_by,
            actor_type="human",
            action="upgrade_subscription",
            entity_type="Subscription",
            entity_id=tenant.subscription.id,
            previous_state={"tier": previous_tier},
            new_state={"tier": new_tier},
            rationale=f"Subscription upgraded from {previous_tier} to {new_tier}",
        ))
        
        return tenant
    
    def suspend_tenant(self, tenant_id: str, reason: str, suspended_by: str) -> Tenant:
        """
        Suspend a tenant.
        
        Args:
            tenant_id: The tenant ID.
            reason: Reason for suspension.
            suspended_by: Who is suspending the tenant.
            
        Returns:
            The updated tenant.
        """
        tenant = self.get_tenant(tenant_id)
        previous_status = tenant.status
        
        tenant.status = 'suspended'
        tenant.updated_at = datetime.now()
        self.repository.update_tenant(tenant)
        
        # Audit entry
        self._create_audit_entry(tenant_id, AuditEntry(
            tenant_id=tenant_id,
            actor=suspended_by,
            actor_type="human",
            action="suspend_tenant",
            entity_type="Tenant",
            entity_id=tenant_id,
            previous_state={"status": previous_status},
            new_state={"status": "suspended"},
            rationale=reason,
        ))
        
        return tenant
    
    def reactivate_tenant(self, tenant_id: str, reactivated_by: str) -> Tenant:
        """
        Reactivate a suspended tenant.
        
        Args:
            tenant_id: The tenant ID.
            reactivated_by: Who is reactivating the tenant.
            
        Returns:
            The updated tenant.
        """
        tenant = self.get_tenant(tenant_id)
        
        if tenant.status != 'suspended':
            raise TenantProvisioningError(
                f"Cannot reactivate tenant with status: {tenant.status}"
            )
        
        tenant.status = 'active'
        tenant.updated_at = datetime.now()
        self.repository.update_tenant(tenant)
        
        # Audit entry
        self._create_audit_entry(tenant_id, AuditEntry(
            tenant_id=tenant_id,
            actor=reactivated_by,
            actor_type="human",
            action="reactivate_tenant",
            entity_type="Tenant",
            entity_id=tenant_id,
            previous_state={"status": "suspended"},
            new_state={"status": "active"},
            rationale="Tenant reactivated",
        ))
        
        return tenant
    
    def offboard_tenant(self, request: TenantOffboardingRequest) -> dict:
        """
        Offboard a tenant with optional data deletion.
        
        Supports:
        - Complete data deletion
        - Audit trail preservation for regulatory compliance
        - Immediate or scheduled offboarding
        
        Args:
            request: The offboarding request.
            
        Returns:
            Offboarding result with details.
            
        Validates: Requirements 20.5
        """
        tenant = self.get_tenant(request.tenant_id)
        
        # Create final audit entry before potential deletion
        self._create_audit_entry(request.tenant_id, AuditEntry(
            tenant_id=request.tenant_id,
            actor="TenantProvisioningService",
            actor_type="system",
            action="offboard_tenant",
            entity_type="Tenant",
            entity_id=request.tenant_id,
            previous_state=tenant.model_dump(),
            new_state={"status": "offboarded"},
            rationale=request.reason,
        ))
        
        result = {
            "tenant_id": request.tenant_id,
            "tenant_name": tenant.name,
            "offboarded_at": datetime.now().isoformat(),
            "reason": request.reason,
            "audit_preserved": request.preserve_audit_trail,
            "data_deleted": False,
        }
        
        if request.immediate:
            # Preserve audit entries if requested
            preserved_audit = []
            if request.preserve_audit_trail:
                audit_key = f"tenant:{request.tenant_id}:audit:all"
                preserved_audit = self.repository._audit_entries.get(audit_key, [])
            
            # Delete tenant and all data
            self.repository.delete_tenant(request.tenant_id)
            result["data_deleted"] = True
            
            # Restore audit entries if preserved
            if request.preserve_audit_trail and preserved_audit:
                audit_key = f"tenant:{request.tenant_id}:audit:all"
                self.repository._audit_entries[audit_key] = preserved_audit
                result["audit_entries_preserved"] = len(preserved_audit)
        else:
            # Mark as offboarded but don't delete yet
            tenant.status = 'offboarded'
            tenant.offboarded_at = datetime.now()
            tenant.updated_at = datetime.now()
            self.repository.update_tenant(tenant)
            result["scheduled_deletion"] = True
        
        return result
    
    def list_tenants(
        self,
        status: Optional[TenantStatus] = None,
        tier: Optional[SubscriptionTier] = None
    ) -> list[Tenant]:
        """
        List tenants with optional filters.
        
        Args:
            status: Optional status filter.
            tier: Optional subscription tier filter.
            
        Returns:
            List of matching tenants.
        """
        tenants = self.repository.list_tenants()
        
        if status:
            tenants = [t for t in tenants if t.status == status]
        
        if tier:
            tenants = [
                t for t in tenants 
                if t.subscription and t.subscription.tier == tier
            ]
        
        return tenants
    
    def get_tenant_usage_summary(
        self,
        tenant_id: str,
        period_start: datetime,
        period_end: datetime
    ) -> dict:
        """
        Get usage summary for a tenant.
        
        Args:
            tenant_id: The tenant ID.
            period_start: Start of the period.
            period_end: End of the period.
            
        Returns:
            Usage summary dictionary.
        """
        usage_records = self.repository.get_tenant_usage(
            tenant_id,
            since=period_start,
            until=period_end
        )
        
        if not usage_records:
            return {
                "tenant_id": tenant_id,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "total_agent_invocations": 0,
                "total_token_consumption": 0,
                "total_api_calls": 0,
                "max_storage_used_gb": 0.0,
                "max_active_users": 0,
                "total_reports_processed": 0,
            }
        
        return {
            "tenant_id": tenant_id,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "total_agent_invocations": sum(u.agent_invocations for u in usage_records),
            "total_token_consumption": sum(u.token_consumption for u in usage_records),
            "total_api_calls": sum(u.api_calls for u in usage_records),
            "max_storage_used_gb": max(u.storage_used_gb for u in usage_records),
            "max_active_users": max(u.active_users for u in usage_records),
            "total_reports_processed": sum(u.reports_processed for u in usage_records),
        }


# Convenience functions for common operations

def provision_tenant(
    repository: "TenantAwareRepository",
    name: str,
    slug: str,
    admin_email: str,
    admin_name: str,
    tier: SubscriptionTier = 'free'
) -> Tenant:
    """
    Convenience function to provision a new tenant.
    
    Args:
        repository: The repository to use.
        name: Tenant organization name.
        slug: URL-friendly identifier.
        admin_email: Admin email address.
        admin_name: Admin name.
        tier: Subscription tier.
        
    Returns:
        The created tenant.
    """
    service = TenantProvisioningService(repository)
    request = TenantProvisioningRequest(
        name=name,
        slug=slug,
        admin_email=admin_email,
        admin_name=admin_name,
        tier=tier,
    )
    return service.provision_tenant(request)


def offboard_tenant(
    repository: "TenantAwareRepository",
    tenant_id: str,
    reason: str,
    preserve_audit: bool = True,
    immediate: bool = False
) -> dict:
    """
    Convenience function to offboard a tenant.
    
    Args:
        repository: The repository to use.
        tenant_id: The tenant ID.
        reason: Reason for offboarding.
        preserve_audit: Whether to preserve audit trail.
        immediate: Whether to delete immediately.
        
    Returns:
        Offboarding result.
    """
    service = TenantProvisioningService(repository)
    request = TenantOffboardingRequest(
        tenant_id=tenant_id,
        reason=reason,
        preserve_audit_trail=preserve_audit,
        immediate=immediate,
    )
    return service.offboard_tenant(request)
