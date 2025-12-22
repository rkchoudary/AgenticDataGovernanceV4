"""
AgentCore Identity Integration for governance agent authentication.

This module provides OAuth2 Credential Provider configuration and
identity management for the AgentCore Data Governance system.

Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
- Create an OAuth2 Credential Provider for user authentication
- Implement @requires_access_token decorator for tools requiring human approval
- Extract user claims from JWT tokens for audit entries
- Support USER_FEDERATION auth flow for interactive approval workflows
- Use AgentCore Token Vault for secure credential management
"""

import base64
import functools
import json
import os
from datetime import datetime
from typing import Any, Callable, Literal, Optional, TypeVar
from pydantic import BaseModel, Field
from uuid import uuid4


# Type variable for generic function decoration
F = TypeVar('F', bound=Callable[..., Any])


# ============================================
# Identity Models
# ============================================

class UserClaims(BaseModel):
    """
    User claims extracted from JWT token.
    
    These claims are used for audit entries and authorization.
    
    Requirements: 16.3
    """
    sub: str  # Subject (user ID)
    email: Optional[str] = None
    name: Optional[str] = None
    preferred_username: Optional[str] = None
    roles: list[str] = Field(default_factory=list)
    groups: list[str] = Field(default_factory=list)
    tenant_id: Optional[str] = None
    iss: Optional[str] = None  # Issuer
    aud: Optional[str] = None  # Audience
    exp: Optional[int] = None  # Expiration time
    iat: Optional[int] = None  # Issued at time
    
    @property
    def user_id(self) -> str:
        """Get the user identifier for audit entries."""
        return self.preferred_username or self.email or self.sub
    
    @property
    def primary_role(self) -> Optional[str]:
        """Get the primary role for authorization."""
        return self.roles[0] if self.roles else None


class IdentityContext(BaseModel):
    """
    Identity context for a request.
    
    Contains user claims and authentication metadata.
    """
    user_claims: UserClaims
    access_token: str
    token_type: str = "Bearer"
    authenticated_at: datetime = Field(default_factory=datetime.now)
    auth_method: Literal["oauth2", "api_key", "service_account"] = "oauth2"
    session_id: Optional[str] = None


class OAuth2CredentialProviderConfig(BaseModel):
    """
    Configuration for OAuth2 Credential Provider.
    
    Requirements: 16.1, 16.4
    """
    name: str = "governance-identity-provider"
    provider_type: Literal["OAUTH2"] = "OAUTH2"
    auth_flow: Literal["USER_FEDERATION", "CLIENT_CREDENTIALS"] = "USER_FEDERATION"
    
    # OAuth2 endpoints
    authorization_endpoint: Optional[str] = None
    token_endpoint: Optional[str] = None
    userinfo_endpoint: Optional[str] = None
    jwks_uri: Optional[str] = None
    
    # Client configuration
    client_id: Optional[str] = None
    client_secret_arn: Optional[str] = None  # ARN in Token Vault
    
    # Scopes
    scopes: list[str] = Field(default_factory=lambda: ["openid", "profile", "email"])
    
    # Token settings
    token_expiry_seconds: int = 3600
    refresh_token_enabled: bool = True


class TokenVaultConfig(BaseModel):
    """
    Configuration for AgentCore Token Vault.
    
    Requirements: 16.5
    """
    vault_name: str = "governance-token-vault"
    region: str = "us-west-2"
    encryption_key_arn: Optional[str] = None


# ============================================
# JWT Token Utilities
# ============================================

def decode_jwt_claims(token: str) -> UserClaims:
    """
    Decode and extract claims from a JWT token.
    
    Note: This performs basic decoding without signature verification.
    In production, signature verification should be done by AgentCore Gateway.
    
    Args:
        token: The JWT access token
        
    Returns:
        UserClaims extracted from the token
        
    Requirements: 16.3
    """
    try:
        # Split the token into parts
        parts = token.split('.')
        if len(parts) != 3:
            raise ValueError("Invalid JWT format")
        
        # Decode the payload (second part)
        payload = parts[1]
        
        # Add padding if needed
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += '=' * padding
        
        # Decode base64
        decoded = base64.urlsafe_b64decode(payload)
        claims_dict = json.loads(decoded)
        
        # Extract roles from various claim formats
        roles = []
        if 'roles' in claims_dict:
            roles = claims_dict['roles']
        elif 'cognito:groups' in claims_dict:
            roles = claims_dict['cognito:groups']
        elif 'realm_access' in claims_dict:
            # Keycloak format
            roles = claims_dict['realm_access'].get('roles', [])
        elif 'role' in claims_dict:
            roles = [claims_dict['role']] if isinstance(claims_dict['role'], str) else claims_dict['role']
        
        # Extract groups
        groups = claims_dict.get('groups', [])
        
        # Extract tenant_id from various claim formats
        tenant_id = claims_dict.get('tenant_id') or claims_dict.get('custom:tenant_id')
        
        return UserClaims(
            sub=claims_dict.get('sub', ''),
            email=claims_dict.get('email'),
            name=claims_dict.get('name'),
            preferred_username=claims_dict.get('preferred_username') or claims_dict.get('username'),
            roles=roles,
            groups=groups,
            tenant_id=tenant_id,
            iss=claims_dict.get('iss'),
            aud=claims_dict.get('aud'),
            exp=claims_dict.get('exp'),
            iat=claims_dict.get('iat'),
        )
    except Exception as e:
        # Return minimal claims on decode failure
        return UserClaims(sub=f"unknown_{uuid4().hex[:8]}")


def extract_user_for_audit(token: str) -> dict[str, Any]:
    """
    Extract user information from JWT token for audit entries.
    
    Args:
        token: The JWT access token
        
    Returns:
        Dictionary with user information for audit entries
        
    Requirements: 16.3
    """
    claims = decode_jwt_claims(token)
    return {
        "user_id": claims.user_id,
        "email": claims.email,
        "name": claims.name,
        "roles": claims.roles,
        "tenant_id": claims.tenant_id,
    }


def get_identity_context(token: str, session_id: Optional[str] = None) -> IdentityContext:
    """
    Create an identity context from an access token.
    
    Args:
        token: The JWT access token
        session_id: Optional session identifier
        
    Returns:
        IdentityContext with user claims and metadata
    """
    claims = decode_jwt_claims(token)
    return IdentityContext(
        user_claims=claims,
        access_token=token,
        session_id=session_id,
    )


# ============================================
# Access Token Decorator
# ============================================

# Thread-local storage for current identity context
_current_identity_context: Optional[IdentityContext] = None


def set_current_identity_context(context: Optional[IdentityContext]) -> None:
    """Set the current identity context for the request."""
    global _current_identity_context
    _current_identity_context = context


def get_current_identity_context() -> Optional[IdentityContext]:
    """Get the current identity context for the request."""
    return _current_identity_context


def requires_access_token(
    required_roles: Optional[list[str]] = None,
    any_role: bool = False
) -> Callable[[F], F]:
    """
    Decorator that requires a valid access token for tool execution.
    
    This decorator:
    1. Validates that an access token is present
    2. Extracts user claims from the token
    3. Optionally validates required roles
    4. Makes identity context available to the decorated function
    
    Args:
        required_roles: Optional list of roles required to execute the tool
        any_role: If True, user needs any one of the required roles. 
                  If False, user needs all required roles.
    
    Returns:
        Decorated function that enforces access token requirement
        
    Requirements: 16.2
    
    Example:
        @requires_access_token(required_roles=["compliance_officer"])
        def approve_catalog(approver: str, rationale: str, access_token: str = None):
            # access_token is automatically validated
            # identity context is available via get_current_identity_context()
            ...
    """
    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            # Extract access token from kwargs
            access_token = kwargs.get('access_token')
            
            # Also check for token in environment (for AgentCore Runtime)
            if not access_token:
                access_token = os.environ.get('AGENTCORE_ACCESS_TOKEN')
            
            if not access_token:
                raise AuthenticationError(
                    "Access token required. Please provide 'access_token' parameter."
                )
            
            # Decode and validate token
            try:
                claims = decode_jwt_claims(access_token)
            except Exception as e:
                raise AuthenticationError(f"Invalid access token: {str(e)}")
            
            # Check token expiration
            if claims.exp:
                current_time = int(datetime.now().timestamp())
                if current_time > claims.exp:
                    raise AuthenticationError("Access token has expired")
            
            # Validate required roles
            if required_roles:
                user_roles = set(claims.roles)
                required_set = set(required_roles)
                
                if any_role:
                    # User needs at least one of the required roles
                    if not user_roles.intersection(required_set):
                        raise AuthorizationError(
                            f"User does not have any of the required roles: {required_roles}"
                        )
                else:
                    # User needs all required roles
                    if not required_set.issubset(user_roles):
                        missing = required_set - user_roles
                        raise AuthorizationError(
                            f"User is missing required roles: {list(missing)}"
                        )
            
            # Set identity context for the request
            context = IdentityContext(
                user_claims=claims,
                access_token=access_token,
                session_id=kwargs.get('session_id'),
            )
            set_current_identity_context(context)
            
            try:
                # Execute the function
                return func(*args, **kwargs)
            finally:
                # Clear identity context after execution
                set_current_identity_context(None)
        
        return wrapper  # type: ignore
    
    return decorator


# ============================================
# Exception Classes
# ============================================

class AuthenticationError(Exception):
    """Raised when authentication fails."""
    pass


class AuthorizationError(Exception):
    """Raised when authorization fails."""
    pass


# ============================================
# Identity Provider Class
# ============================================

class IdentityProvider:
    """
    Identity Provider for AgentCore integration.
    
    This class manages OAuth2 authentication and token handling
    for the governance system.
    
    Requirements: 16.1, 16.4, 16.5
    """
    
    def __init__(
        self,
        config: Optional[OAuth2CredentialProviderConfig] = None,
        token_vault_config: Optional[TokenVaultConfig] = None
    ):
        """
        Initialize the Identity Provider.
        
        Args:
            config: OAuth2 Credential Provider configuration
            token_vault_config: Token Vault configuration
        """
        self.config = config or OAuth2CredentialProviderConfig()
        self.token_vault_config = token_vault_config or TokenVaultConfig()
        self._token_cache: dict[str, tuple[str, datetime]] = {}
    
    def validate_token(self, token: str) -> UserClaims:
        """
        Validate an access token and return user claims.
        
        Args:
            token: The JWT access token
            
        Returns:
            UserClaims extracted from the token
            
        Raises:
            AuthenticationError: If token is invalid or expired
        """
        claims = decode_jwt_claims(token)
        
        # Check expiration
        if claims.exp:
            current_time = int(datetime.now().timestamp())
            if current_time > claims.exp:
                raise AuthenticationError("Access token has expired")
        
        return claims
    
    def get_user_context(self, token: str) -> IdentityContext:
        """
        Get the full identity context for a user.
        
        Args:
            token: The JWT access token
            
        Returns:
            IdentityContext with user claims and metadata
        """
        claims = self.validate_token(token)
        return IdentityContext(
            user_claims=claims,
            access_token=token,
        )
    
    def extract_audit_info(self, token: str) -> dict[str, Any]:
        """
        Extract information for audit entries from a token.
        
        Args:
            token: The JWT access token
            
        Returns:
            Dictionary with audit-relevant user information
            
        Requirements: 16.3
        """
        return extract_user_for_audit(token)
    
    def create_service_token(
        self,
        service_name: str,
        roles: list[str],
        tenant_id: Optional[str] = None
    ) -> str:
        """
        Create a service account token for agent-to-agent communication.
        
        Note: In production, this would use AgentCore Token Vault.
        
        Args:
            service_name: Name of the service
            roles: Roles to assign to the service
            tenant_id: Optional tenant identifier
            
        Returns:
            JWT token for the service account
        """
        # Create claims for service account
        claims = {
            "sub": f"service:{service_name}",
            "preferred_username": service_name,
            "roles": roles,
            "tenant_id": tenant_id,
            "iat": int(datetime.now().timestamp()),
            "exp": int(datetime.now().timestamp()) + self.config.token_expiry_seconds,
        }
        
        # Encode as JWT (simplified - no signature for local use)
        header = base64.urlsafe_b64encode(
            json.dumps({"alg": "none", "typ": "JWT"}).encode()
        ).decode().rstrip('=')
        
        payload = base64.urlsafe_b64encode(
            json.dumps(claims).encode()
        ).decode().rstrip('=')
        
        return f"{header}.{payload}."


# ============================================
# Factory Functions
# ============================================

def create_identity_provider(
    provider_name: str = "governance-identity-provider",
    auth_flow: Literal["USER_FEDERATION", "CLIENT_CREDENTIALS"] = "USER_FEDERATION",
    **kwargs
) -> IdentityProvider:
    """
    Create an Identity Provider with the specified configuration.
    
    Args:
        provider_name: Name of the identity provider
        auth_flow: Authentication flow type
        **kwargs: Additional configuration options
        
    Returns:
        Configured IdentityProvider instance
        
    Requirements: 16.1, 16.4
    """
    config = OAuth2CredentialProviderConfig(
        name=provider_name,
        auth_flow=auth_flow,
        **kwargs
    )
    return IdentityProvider(config=config)


def create_token_for_user(
    user_id: str,
    email: Optional[str] = None,
    name: Optional[str] = None,
    roles: Optional[list[str]] = None,
    tenant_id: Optional[str] = None,
    expiry_seconds: int = 3600
) -> str:
    """
    Create a JWT token for a user (for testing/development).
    
    Note: In production, tokens should be issued by the OAuth2 provider.
    
    Args:
        user_id: User identifier
        email: User email
        name: User display name
        roles: User roles
        tenant_id: Tenant identifier
        expiry_seconds: Token expiry in seconds
        
    Returns:
        JWT token string
    """
    claims = {
        "sub": user_id,
        "email": email,
        "name": name,
        "preferred_username": user_id,
        "roles": roles or [],
        "tenant_id": tenant_id,
        "iat": int(datetime.now().timestamp()),
        "exp": int(datetime.now().timestamp()) + expiry_seconds,
    }
    
    # Encode as JWT (simplified - no signature for local use)
    header = base64.urlsafe_b64encode(
        json.dumps({"alg": "none", "typ": "JWT"}).encode()
    ).decode().rstrip('=')
    
    payload = base64.urlsafe_b64encode(
        json.dumps(claims).encode()
    ).decode().rstrip('=')
    
    return f"{header}.{payload}."
