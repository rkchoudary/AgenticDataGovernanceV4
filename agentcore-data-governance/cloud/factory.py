"""
Cloud provider factory for environment-based provider selection.

This module provides factory functions for creating cloud providers
based on environment configuration.

Requirements: 21.1, 21.4
"""

import os
from typing import Optional

from cloud.base import CloudProvider, CloudProviderType


# Environment variable for cloud provider selection
CLOUD_PROVIDER_ENV_VAR = "CLOUD_PROVIDER"
CLOUD_REGION_ENV_VAR = "CLOUD_REGION"

# Default values
DEFAULT_PROVIDER: CloudProviderType = "aws"
DEFAULT_AWS_REGION = "us-west-2"
DEFAULT_AZURE_REGION = "eastus"


def get_default_provider_type() -> CloudProviderType:
    """
    Get the default cloud provider type from environment.
    
    Reads the CLOUD_PROVIDER environment variable to determine
    which cloud provider to use. Defaults to AWS if not set.
    
    Returns:
        Cloud provider type ('aws' or 'azure')
        
    Requirements: 21.4
    """
    provider = os.environ.get(CLOUD_PROVIDER_ENV_VAR, DEFAULT_PROVIDER).lower()
    
    if provider in ("aws", "amazon", "agentcore"):
        return "aws"
    elif provider in ("azure", "microsoft", "az"):
        return "azure"
    else:
        # Default to AWS for unknown values
        return "aws"


def get_default_region(provider_type: CloudProviderType) -> str:
    """
    Get the default region for a cloud provider.
    
    Reads the CLOUD_REGION environment variable or returns
    provider-specific defaults.
    
    Args:
        provider_type: The cloud provider type
        
    Returns:
        Region string
    """
    region = os.environ.get(CLOUD_REGION_ENV_VAR)
    
    if region:
        return region
    
    if provider_type == "aws":
        return os.environ.get("AWS_REGION", DEFAULT_AWS_REGION)
    elif provider_type == "azure":
        return os.environ.get("AZURE_REGION", DEFAULT_AZURE_REGION)
    
    return DEFAULT_AWS_REGION


def create_provider(
    provider_type: CloudProviderType,
    region: Optional[str] = None
) -> CloudProvider:
    """
    Create a cloud provider instance.
    
    Args:
        provider_type: The cloud provider type ('aws' or 'azure')
        region: Optional region override
        
    Returns:
        CloudProvider instance
        
    Raises:
        ValueError: If provider type is not supported
        
    Requirements: 21.1, 21.4
    """
    if region is None:
        region = get_default_region(provider_type)
    
    if provider_type == "aws":
        from cloud.aws import AWSCloudProvider
        return AWSCloudProvider(region=region)
    elif provider_type == "azure":
        from cloud.azure import AzureCloudProvider
        return AzureCloudProvider(region=region)
    else:
        raise ValueError(f"Unsupported cloud provider type: {provider_type}")


def get_cloud_provider(
    provider_type: Optional[CloudProviderType] = None,
    region: Optional[str] = None
) -> CloudProvider:
    """
    Get a cloud provider instance based on environment configuration.
    
    This is the main entry point for obtaining a cloud provider.
    It reads environment variables to determine the provider type
    and region if not explicitly specified.
    
    Args:
        provider_type: Optional provider type override
        region: Optional region override
        
    Returns:
        CloudProvider instance configured for the target cloud
        
    Requirements: 21.1, 21.4
    
    Example:
        # Use environment-based configuration
        provider = get_cloud_provider()
        
        # Explicitly specify AWS
        provider = get_cloud_provider(provider_type="aws", region="us-east-1")
        
        # Explicitly specify Azure
        provider = get_cloud_provider(provider_type="azure", region="westeurope")
    """
    if provider_type is None:
        provider_type = get_default_provider_type()
    
    return create_provider(provider_type, region)


# Singleton instance for convenience
_default_provider: Optional[CloudProvider] = None


def get_default_provider() -> CloudProvider:
    """
    Get the default cloud provider singleton.
    
    This returns a cached instance of the cloud provider based on
    environment configuration. Use this for convenience when you
    don't need to manage provider lifecycle.
    
    Returns:
        CloudProvider singleton instance
    """
    global _default_provider
    
    if _default_provider is None:
        _default_provider = get_cloud_provider()
    
    return _default_provider


def reset_default_provider() -> None:
    """
    Reset the default provider singleton.
    
    Call this if environment variables change and you need
    to reinitialize the provider.
    """
    global _default_provider
    _default_provider = None


# Convenience functions for common operations

def deploy_agent(config: "AgentConfig") -> "AgentDeploymentResult":
    """
    Deploy an agent using the default cloud provider.
    
    Args:
        config: Agent deployment configuration
        
    Returns:
        Deployment result
    """
    from cloud.base import AgentConfig, AgentDeploymentResult
    provider = get_default_provider()
    return provider.runtime.deploy_agent(config)


def create_memory_store(config: "MemoryConfig") -> "MemoryStoreResult":
    """
    Create a memory store using the default cloud provider.
    
    Args:
        config: Memory store configuration
        
    Returns:
        Memory store result
    """
    from cloud.base import MemoryConfig, MemoryStoreResult
    provider = get_default_provider()
    return provider.memory.create_memory_store(config)


def validate_token(token: str) -> dict:
    """
    Validate a token using the default cloud provider.
    
    Args:
        token: JWT access token
        
    Returns:
        Token claims
    """
    provider = get_default_provider()
    return provider.identity.validate_token(token)


def evaluate_policy(
    engine_id: str,
    principal: dict,
    action: str,
    resource: dict,
    context: Optional[dict] = None
) -> dict:
    """
    Evaluate a policy using the default cloud provider.
    
    Args:
        engine_id: Policy engine identifier
        principal: The entity making the request
        action: The action being requested
        resource: The resource being accessed
        context: Optional additional context
        
    Returns:
        Evaluation result
    """
    provider = get_default_provider()
    return provider.policy.evaluate(engine_id, principal, action, resource, context)
