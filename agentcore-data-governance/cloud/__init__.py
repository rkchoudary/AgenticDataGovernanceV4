"""
Cloud-agnostic provider abstractions for the governance platform.

This module provides interfaces and implementations for deploying
the governance platform to different cloud providers (AWS, Azure).

Requirements: 21.1, 21.2, 21.3, 21.4
"""

from cloud.base import (
    AgentRuntimeProvider,
    MemoryStoreProvider,
    IdentityProvider,
    PolicyEngineProvider,
    CloudProvider,
    CloudProviderType,
    AgentConfig,
    MemoryConfig,
    IdentityConfig,
    PolicyConfig,
    AgentDeploymentResult,
    MemoryStoreResult,
    IdentityProviderResult,
    PolicyEngineResult,
)
from cloud.factory import (
    get_cloud_provider,
    create_provider,
    get_default_provider_type,
)

__all__ = [
    # Protocols
    "AgentRuntimeProvider",
    "MemoryStoreProvider",
    "IdentityProvider",
    "PolicyEngineProvider",
    "CloudProvider",
    # Types
    "CloudProviderType",
    # Configs
    "AgentConfig",
    "MemoryConfig",
    "IdentityConfig",
    "PolicyConfig",
    # Results
    "AgentDeploymentResult",
    "MemoryStoreResult",
    "IdentityProviderResult",
    "PolicyEngineResult",
    # Factory
    "get_cloud_provider",
    "create_provider",
    "get_default_provider_type",
]
