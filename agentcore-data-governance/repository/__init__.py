"""
Repository package for AgentCore Data Governance.

Contains data persistence implementations:
- GovernanceRepository (abstract base)
- InMemoryGovernanceRepository (for testing)
- AgentCoreMemoryRepository (for production)
- TenantAwareRepository (for multi-tenant SaaS)
- ImmutableAuditStore (for tamper-evident audit trails)
"""

from repository.base import GovernanceRepository
from repository.in_memory import InMemoryGovernanceRepository
from repository.agentcore_memory import AgentCoreMemoryRepository
from repository.tenant_aware import TenantAwareRepository
from repository.immutable_audit import (
    ImmutableAuditStore,
    verify_audit_export,
    GENESIS_HASH,
)

__all__ = [
    "GovernanceRepository",
    "InMemoryGovernanceRepository",
    "AgentCoreMemoryRepository",
    "TenantAwareRepository",
    "ImmutableAuditStore",
    "verify_audit_export",
    "GENESIS_HASH",
]
