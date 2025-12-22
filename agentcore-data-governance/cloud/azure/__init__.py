"""
Azure cloud provider implementations.

This module provides Azure-specific implementations of the cloud provider
interfaces using Azure services.

Requirements: 21.3
- Azure Container Apps for agent deployment
- Cosmos DB for persistent storage
- Entra ID (Azure AD) for authentication
- Azure Policy for authorization
"""

from cloud.azure.provider import AzureCloudProvider
from cloud.azure.runtime import AzureAgentRuntimeProvider
from cloud.azure.memory import AzureMemoryStoreProvider
from cloud.azure.identity import AzureIdentityProvider
from cloud.azure.policy import AzurePolicyEngineProvider

__all__ = [
    "AzureCloudProvider",
    "AzureAgentRuntimeProvider",
    "AzureMemoryStoreProvider",
    "AzureIdentityProvider",
    "AzurePolicyEngineProvider",
]
