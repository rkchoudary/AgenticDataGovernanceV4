"""
AWS cloud provider implementations.

This module provides AWS-specific implementations of the cloud provider
interfaces using AWS Bedrock AgentCore services.

Requirements: 21.2
- AgentCore Runtime for agent deployment
- AgentCore Memory for persistent storage
- AgentCore Identity / Cognito for authentication
- AgentCore Policy Engine for authorization
"""

from cloud.aws.provider import AWSCloudProvider
from cloud.aws.runtime import AWSAgentRuntimeProvider
from cloud.aws.memory import AWSMemoryStoreProvider
from cloud.aws.identity import AWSIdentityProvider
from cloud.aws.policy import AWSPolicyEngineProvider

__all__ = [
    "AWSCloudProvider",
    "AWSAgentRuntimeProvider",
    "AWSMemoryStoreProvider",
    "AWSIdentityProvider",
    "AWSPolicyEngineProvider",
]
