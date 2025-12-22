"""
Abstract base interfaces for cloud provider abstractions.

This module defines the Protocol interfaces that all cloud provider
implementations must follow, enabling deployment to AWS or Azure.

Requirements: 21.1
- Define interfaces for: AgentRuntime, MemoryStore, PolicyEngine, IdentityProvider
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Literal, Optional, Protocol, runtime_checkable
from pydantic import BaseModel, Field
from uuid import uuid4


# ============================================
# Type Definitions
# ============================================

CloudProviderType = Literal["aws", "azure"]


# ============================================
# Configuration Models
# ============================================

class AgentConfig(BaseModel):
    """Configuration for deploying an agent to a cloud runtime."""
    
    name: str
    entrypoint: str
    runtime: str = "PYTHON_3_12"
    memory_mode: Literal["STM_ONLY", "LTM_ONLY", "STM_AND_LTM"] = "STM_AND_LTM"
    memory_id: Optional[str] = None
    idle_timeout: int = 900  # seconds
    max_lifetime: int = 28800  # seconds
    environment_variables: dict[str, str] = Field(default_factory=dict)
    resource_limits: dict[str, Any] = Field(default_factory=dict)
    tags: dict[str, str] = Field(default_factory=dict)


class MemoryConfig(BaseModel):
    """Configuration for creating a memory store."""
    
    name: str
    retention_days: int = 365
    encryption_enabled: bool = True
    encryption_key_id: Optional[str] = None
    tags: dict[str, str] = Field(default_factory=dict)


class IdentityConfig(BaseModel):
    """Configuration for identity provider setup."""
    
    name: str
    auth_flow: Literal["USER_FEDERATION", "CLIENT_CREDENTIALS"] = "USER_FEDERATION"
    scopes: list[str] = Field(default_factory=lambda: ["openid", "profile", "email"])
    token_expiry_seconds: int = 3600
    refresh_token_enabled: bool = True
    
    # OAuth2 endpoints (provider-specific)
    authorization_endpoint: Optional[str] = None
    token_endpoint: Optional[str] = None
    userinfo_endpoint: Optional[str] = None
    jwks_uri: Optional[str] = None
    
    # Client configuration
    client_id: Optional[str] = None
    client_secret_location: Optional[str] = None  # Secret ARN or Key Vault reference


class PolicyConfig(BaseModel):
    """Configuration for policy engine setup."""
    
    name: str
    mode: Literal["ENFORCE", "MONITOR"] = "ENFORCE"
    policy_language: Literal["CEDAR", "REGO"] = "CEDAR"
    policies: list[str] = Field(default_factory=list)  # Policy definitions
    default_decision: Literal["ALLOW", "DENY"] = "DENY"
    tags: dict[str, str] = Field(default_factory=dict)


# ============================================
# Result Models
# ============================================

class AgentDeploymentResult(BaseModel):
    """Result of deploying an agent."""
    
    agent_id: str
    agent_name: str
    endpoint_url: Optional[str] = None
    status: Literal["deployed", "pending", "failed"] = "deployed"
    created_at: datetime = Field(default_factory=datetime.now)
    provider: CloudProviderType = "aws"
    metadata: dict[str, Any] = Field(default_factory=dict)


class MemoryStoreResult(BaseModel):
    """Result of creating a memory store."""
    
    memory_id: str
    memory_name: str
    endpoint_url: Optional[str] = None
    status: Literal["active", "creating", "failed"] = "active"
    created_at: datetime = Field(default_factory=datetime.now)
    provider: CloudProviderType = "aws"
    metadata: dict[str, Any] = Field(default_factory=dict)


class IdentityProviderResult(BaseModel):
    """Result of setting up an identity provider."""
    
    provider_id: str
    provider_name: str
    issuer_url: Optional[str] = None
    client_id: Optional[str] = None
    status: Literal["active", "pending", "failed"] = "active"
    created_at: datetime = Field(default_factory=datetime.now)
    provider: CloudProviderType = "aws"
    metadata: dict[str, Any] = Field(default_factory=dict)


class PolicyEngineResult(BaseModel):
    """Result of setting up a policy engine."""
    
    engine_id: str
    engine_name: str
    endpoint_url: Optional[str] = None
    status: Literal["active", "pending", "failed"] = "active"
    created_at: datetime = Field(default_factory=datetime.now)
    provider: CloudProviderType = "aws"
    metadata: dict[str, Any] = Field(default_factory=dict)


# ============================================
# Provider Protocols
# ============================================

@runtime_checkable
class AgentRuntimeProvider(Protocol):
    """
    Protocol for agent runtime providers.
    
    Implementations must provide methods for deploying, managing,
    and invoking AI agents on the target cloud platform.
    
    Requirements: 21.1
    - AWS: AgentCore Runtime
    - Azure: Azure Container Apps
    """
    
    def deploy_agent(self, config: AgentConfig) -> AgentDeploymentResult:
        """
        Deploy an agent to the cloud runtime.
        
        Args:
            config: Agent deployment configuration
            
        Returns:
            Deployment result with agent ID and endpoint
        """
        ...
    
    def invoke_agent(
        self,
        agent_id: str,
        payload: dict[str, Any],
        session_id: Optional[str] = None,
        actor_id: Optional[str] = None
    ) -> dict[str, Any]:
        """
        Invoke a deployed agent.
        
        Args:
            agent_id: The agent identifier
            payload: Request payload including prompt
            session_id: Optional session identifier
            actor_id: Optional actor identifier
            
        Returns:
            Agent response
        """
        ...
    
    def get_agent_status(self, agent_id: str) -> dict[str, Any]:
        """
        Get the status of a deployed agent.
        
        Args:
            agent_id: The agent identifier
            
        Returns:
            Agent status information
        """
        ...
    
    def delete_agent(self, agent_id: str) -> bool:
        """
        Delete a deployed agent.
        
        Args:
            agent_id: The agent identifier
            
        Returns:
            True if deleted successfully
        """
        ...
    
    def list_agents(self, tags: Optional[dict[str, str]] = None) -> list[AgentDeploymentResult]:
        """
        List deployed agents.
        
        Args:
            tags: Optional tags to filter by
            
        Returns:
            List of deployed agents
        """
        ...


@runtime_checkable
class MemoryStoreProvider(Protocol):
    """
    Protocol for memory store providers.
    
    Implementations must provide methods for creating and managing
    persistent memory stores for agent conversations and knowledge.
    
    Requirements: 21.1
    - AWS: AgentCore Memory
    - Azure: Cosmos DB
    """
    
    def create_memory_store(self, config: MemoryConfig) -> MemoryStoreResult:
        """
        Create a new memory store.
        
        Args:
            config: Memory store configuration
            
        Returns:
            Memory store creation result
        """
        ...
    
    def store_event(
        self,
        memory_id: str,
        session_id: str,
        actor_id: str,
        event_type: str,
        data: dict[str, Any]
    ) -> str:
        """
        Store an event in the memory store.
        
        Args:
            memory_id: Memory store identifier
            session_id: Session identifier
            actor_id: Actor identifier
            event_type: Type of event
            data: Event data
            
        Returns:
            Event identifier
        """
        ...
    
    def get_events(
        self,
        memory_id: str,
        session_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        event_type: Optional[str] = None,
        since: Optional[datetime] = None,
        limit: Optional[int] = None
    ) -> list[dict[str, Any]]:
        """
        Retrieve events from the memory store.
        
        Args:
            memory_id: Memory store identifier
            session_id: Optional session filter
            actor_id: Optional actor filter
            event_type: Optional event type filter
            since: Optional datetime filter
            limit: Optional result limit
            
        Returns:
            List of events
        """
        ...
    
    def delete_memory_store(self, memory_id: str) -> bool:
        """
        Delete a memory store.
        
        Args:
            memory_id: Memory store identifier
            
        Returns:
            True if deleted successfully
        """
        ...
    
    def get_memory_store_status(self, memory_id: str) -> dict[str, Any]:
        """
        Get the status of a memory store.
        
        Args:
            memory_id: Memory store identifier
            
        Returns:
            Memory store status information
        """
        ...


@runtime_checkable
class IdentityProvider(Protocol):
    """
    Protocol for identity providers.
    
    Implementations must provide methods for authentication,
    token validation, and user management.
    
    Requirements: 21.1
    - AWS: Cognito / AgentCore Identity
    - Azure: Entra ID (Azure AD)
    """
    
    def setup_provider(self, config: IdentityConfig) -> IdentityProviderResult:
        """
        Set up the identity provider.
        
        Args:
            config: Identity provider configuration
            
        Returns:
            Setup result with provider details
        """
        ...
    
    def validate_token(self, token: str) -> dict[str, Any]:
        """
        Validate an access token.
        
        Args:
            token: JWT access token
            
        Returns:
            Token claims if valid
            
        Raises:
            AuthenticationError: If token is invalid
        """
        ...
    
    def get_user_claims(self, token: str) -> dict[str, Any]:
        """
        Extract user claims from a token.
        
        Args:
            token: JWT access token
            
        Returns:
            User claims dictionary
        """
        ...
    
    def create_service_token(
        self,
        service_name: str,
        roles: list[str],
        tenant_id: Optional[str] = None,
        expiry_seconds: int = 3600
    ) -> str:
        """
        Create a service account token.
        
        Args:
            service_name: Name of the service
            roles: Roles to assign
            tenant_id: Optional tenant identifier
            expiry_seconds: Token expiry time
            
        Returns:
            JWT token string
        """
        ...
    
    def revoke_token(self, token: str) -> bool:
        """
        Revoke an access token.
        
        Args:
            token: Token to revoke
            
        Returns:
            True if revoked successfully
        """
        ...


@runtime_checkable
class PolicyEngineProvider(Protocol):
    """
    Protocol for policy engine providers.
    
    Implementations must provide methods for policy evaluation
    and enforcement using Cedar or similar policy languages.
    
    Requirements: 21.1
    - AWS: AgentCore Policy Engine
    - Azure: Azure Policy
    """
    
    def setup_engine(self, config: PolicyConfig) -> PolicyEngineResult:
        """
        Set up the policy engine.
        
        Args:
            config: Policy engine configuration
            
        Returns:
            Setup result with engine details
        """
        ...
    
    def add_policy(self, engine_id: str, policy: str) -> str:
        """
        Add a policy to the engine.
        
        Args:
            engine_id: Policy engine identifier
            policy: Policy definition
            
        Returns:
            Policy identifier
        """
        ...
    
    def evaluate(
        self,
        engine_id: str,
        principal: dict[str, Any],
        action: str,
        resource: dict[str, Any],
        context: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        """
        Evaluate a policy decision.
        
        Args:
            engine_id: Policy engine identifier
            principal: The entity making the request
            action: The action being requested
            resource: The resource being accessed
            context: Optional additional context
            
        Returns:
            Evaluation result with decision and reasons
        """
        ...
    
    def delete_policy(self, engine_id: str, policy_id: str) -> bool:
        """
        Delete a policy from the engine.
        
        Args:
            engine_id: Policy engine identifier
            policy_id: Policy identifier
            
        Returns:
            True if deleted successfully
        """
        ...
    
    def list_policies(self, engine_id: str) -> list[dict[str, Any]]:
        """
        List policies in the engine.
        
        Args:
            engine_id: Policy engine identifier
            
        Returns:
            List of policies
        """
        ...


# ============================================
# Composite Cloud Provider
# ============================================

class CloudProvider(ABC):
    """
    Abstract base class for cloud providers.
    
    This class combines all provider interfaces into a single
    unified interface for cloud platform operations.
    
    Requirements: 21.1
    """
    
    def __init__(self, region: str = "us-west-2"):
        """
        Initialize the cloud provider.
        
        Args:
            region: Cloud region for resource deployment
        """
        self.region = region
    
    @property
    @abstractmethod
    def provider_type(self) -> CloudProviderType:
        """Get the cloud provider type."""
        ...
    
    @property
    @abstractmethod
    def runtime(self) -> AgentRuntimeProvider:
        """Get the agent runtime provider."""
        ...
    
    @property
    @abstractmethod
    def memory(self) -> MemoryStoreProvider:
        """Get the memory store provider."""
        ...
    
    @property
    @abstractmethod
    def identity(self) -> IdentityProvider:
        """Get the identity provider."""
        ...
    
    @property
    @abstractmethod
    def policy(self) -> PolicyEngineProvider:
        """Get the policy engine provider."""
        ...
    
    @abstractmethod
    def health_check(self) -> dict[str, Any]:
        """
        Perform a health check on all provider services.
        
        Returns:
            Health status for each service
        """
        ...
    
    @abstractmethod
    def get_credentials(self) -> dict[str, Any]:
        """
        Get the current credentials configuration.
        
        Returns:
            Credentials information (without secrets)
        """
        ...
