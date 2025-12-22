"""
AWS Cloud Provider implementation.

This module provides the composite AWS cloud provider that combines
all AWS-specific service implementations.

Requirements: 21.2
"""

from typing import Any

from cloud.base import (
    CloudProvider,
    CloudProviderType,
    AgentRuntimeProvider,
    MemoryStoreProvider,
    IdentityProvider,
    PolicyEngineProvider,
)
from cloud.aws.runtime import AWSAgentRuntimeProvider
from cloud.aws.memory import AWSMemoryStoreProvider
from cloud.aws.identity import AWSIdentityProvider
from cloud.aws.policy import AWSPolicyEngineProvider


class AWSCloudProvider(CloudProvider):
    """
    AWS implementation of CloudProvider.
    
    This provider combines all AWS-specific service implementations
    using AWS Bedrock AgentCore services.
    
    Requirements: 21.2
    - AgentCore Runtime for agent deployment
    - AgentCore Memory for persistent storage
    - Cognito / AgentCore Identity for authentication
    - AgentCore Policy Engine for authorization
    """
    
    def __init__(self, region: str = "us-west-2"):
        """
        Initialize the AWS Cloud Provider.
        
        Args:
            region: AWS region for all services
        """
        super().__init__(region=region)
        
        # Initialize individual providers
        self._runtime = AWSAgentRuntimeProvider(region=region)
        self._memory = AWSMemoryStoreProvider(region=region)
        self._identity = AWSIdentityProvider(region=region)
        self._policy = AWSPolicyEngineProvider(region=region)
    
    @property
    def provider_type(self) -> CloudProviderType:
        """Get the cloud provider type."""
        return "aws"
    
    @property
    def runtime(self) -> AgentRuntimeProvider:
        """Get the agent runtime provider."""
        return self._runtime
    
    @property
    def memory(self) -> MemoryStoreProvider:
        """Get the memory store provider."""
        return self._memory
    
    @property
    def identity(self) -> IdentityProvider:
        """Get the identity provider."""
        return self._identity
    
    @property
    def policy(self) -> PolicyEngineProvider:
        """Get the policy engine provider."""
        return self._policy
    
    def health_check(self) -> dict[str, Any]:
        """
        Perform a health check on all AWS services.
        
        Returns:
            Health status for each service
        """
        health = {
            "provider": "aws",
            "region": self.region,
            "services": {},
        }
        
        # Check runtime
        try:
            if self._runtime.client:
                health["services"]["runtime"] = {"status": "healthy", "type": "AgentCore Runtime"}
            else:
                health["services"]["runtime"] = {"status": "local_mode", "type": "In-Memory"}
        except Exception as e:
            health["services"]["runtime"] = {"status": "error", "error": str(e)}
        
        # Check memory
        try:
            if self._memory.client:
                health["services"]["memory"] = {"status": "healthy", "type": "AgentCore Memory"}
            else:
                health["services"]["memory"] = {"status": "local_mode", "type": "In-Memory"}
        except Exception as e:
            health["services"]["memory"] = {"status": "error", "error": str(e)}
        
        # Check identity
        try:
            if self._identity.cognito_client or self._identity.identity_client:
                health["services"]["identity"] = {"status": "healthy", "type": "Cognito/AgentCore Identity"}
            else:
                health["services"]["identity"] = {"status": "local_mode", "type": "In-Memory"}
        except Exception as e:
            health["services"]["identity"] = {"status": "error", "error": str(e)}
        
        # Check policy
        try:
            if self._policy.client:
                health["services"]["policy"] = {"status": "healthy", "type": "AgentCore Policy Engine"}
            else:
                health["services"]["policy"] = {"status": "local_mode", "type": "In-Memory"}
        except Exception as e:
            health["services"]["policy"] = {"status": "error", "error": str(e)}
        
        # Overall status
        statuses = [s.get("status") for s in health["services"].values()]
        if all(s == "healthy" for s in statuses):
            health["overall_status"] = "healthy"
        elif any(s == "error" for s in statuses):
            health["overall_status"] = "degraded"
        else:
            health["overall_status"] = "local_mode"
        
        return health
    
    def get_credentials(self) -> dict[str, Any]:
        """
        Get the current credentials configuration.
        
        Returns:
            Credentials information (without secrets)
        """
        return {
            "provider": "aws",
            "region": self.region,
            "credential_source": "default_chain",
            "services": {
                "runtime": "AgentCore Runtime",
                "memory": "AgentCore Memory",
                "identity": "Cognito / AgentCore Identity",
                "policy": "AgentCore Policy Engine",
            },
        }
