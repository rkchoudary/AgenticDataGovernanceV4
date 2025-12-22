"""
Azure Entra ID (Azure AD) identity provider implementation (stub).

This module provides a stub implementation of the IdentityProvider
protocol using Microsoft Entra ID for authentication.

Requirements: 21.3
"""

import base64
import json
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from cloud.base import (
    IdentityProvider,
    IdentityConfig,
    IdentityProviderResult,
)


class AzureIdentityProvider:
    """
    Azure implementation of IdentityProvider using Entra ID.
    
    This is a stub implementation that provides the interface for
    authentication using Microsoft Entra ID (Azure AD).
    
    Requirements: 21.3
    
    Note: This is a stub implementation. Full Azure integration
    requires the Azure SDK and proper Azure credentials.
    """
    
    def __init__(self, region: str = "eastus"):
        """
        Initialize the Azure Identity provider.
        
        Args:
            region: Azure region (for consistency with other providers)
        """
        self.region = region
        self._client = None
        
        # In-memory storage for local development/testing
        self._providers: dict[str, IdentityProviderResult] = {}
        self._revoked_tokens: set[str] = set()
    
    @property
    def client(self):
        """Lazy-load the Azure Identity client."""
        if self._client is None:
            try:
                from azure.identity import DefaultAzureCredential
                self._client = DefaultAzureCredential()
            except ImportError:
                self._client = None
        return self._client
    
    def setup_provider(self, config: IdentityConfig) -> IdentityProviderResult:
        """
        Set up the identity provider (Entra ID app registration).
        
        Args:
            config: Identity provider configuration
            
        Returns:
            Setup result with provider details
        """
        provider_id = f"idp-{uuid4().hex[:12]}"
        
        # Stub implementation - would create Entra ID app registration
        tenant_id = "common"  # Would be actual tenant ID
        issuer_url = f"https://login.microsoftonline.com/{tenant_id}/v2.0"
        
        result = IdentityProviderResult(
            provider_id=provider_id,
            provider_name=config.name,
            issuer_url=issuer_url,
            client_id=config.client_id or f"client-{uuid4().hex[:8]}",
            status="active",
            provider="azure",
            metadata={
                "auth_flow": config.auth_flow,
                "scopes": config.scopes,
                "tenant_id": tenant_id,
                "stub": True,
            },
        )
        
        self._providers[provider_id] = result
        return result
    
    def validate_token(self, token: str) -> dict[str, Any]:
        """
        Validate an access token.
        
        Args:
            token: JWT access token
            
        Returns:
            Token claims if valid
            
        Raises:
            ValueError: If token is invalid
        """
        if token in self._revoked_tokens:
            raise ValueError("Token has been revoked")
        
        claims = self._decode_jwt(token)
        
        if claims.get("exp"):
            current_time = int(datetime.now().timestamp())
            if current_time > claims["exp"]:
                raise ValueError("Token has expired")
        
        return claims
    
    def get_user_claims(self, token: str) -> dict[str, Any]:
        """
        Extract user claims from a token.
        
        Args:
            token: JWT access token
            
        Returns:
            User claims dictionary
        """
        claims = self._decode_jwt(token)
        
        # Azure AD specific claim mappings
        roles = claims.get("roles", [])
        groups = claims.get("groups", [])
        
        return {
            "sub": claims.get("sub", claims.get("oid", "")),
            "email": claims.get("email") or claims.get("preferred_username"),
            "name": claims.get("name"),
            "preferred_username": claims.get("preferred_username"),
            "roles": roles,
            "groups": groups,
            "tenant_id": claims.get("tid"),  # Azure tenant ID
            "iss": claims.get("iss"),
            "aud": claims.get("aud"),
            "exp": claims.get("exp"),
            "iat": claims.get("iat"),
        }
    
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
        claims = {
            "sub": f"service:{service_name}",
            "oid": f"service-{uuid4().hex[:8]}",
            "preferred_username": service_name,
            "roles": roles,
            "tid": tenant_id or "common",
            "iat": int(datetime.now().timestamp()),
            "exp": int(datetime.now().timestamp()) + expiry_seconds,
            "iss": "https://login.microsoftonline.com/common/v2.0",
        }
        
        return self._encode_jwt(claims)
    
    def revoke_token(self, token: str) -> bool:
        """
        Revoke an access token.
        
        Args:
            token: Token to revoke
            
        Returns:
            True if revoked successfully
        """
        self._revoked_tokens.add(token)
        return True
    
    def _decode_jwt(self, token: str) -> dict[str, Any]:
        """Decode a JWT token without signature verification."""
        try:
            parts = token.split(".")
            if len(parts) != 3:
                raise ValueError("Invalid JWT format")
            
            payload = parts[1]
            padding = 4 - len(payload) % 4
            if padding != 4:
                payload += "=" * padding
            
            decoded = base64.urlsafe_b64decode(payload)
            return json.loads(decoded)
        except Exception as e:
            raise ValueError(f"Failed to decode token: {str(e)}")
    
    def _encode_jwt(self, claims: dict[str, Any]) -> str:
        """Encode claims as a JWT token."""
        header = base64.urlsafe_b64encode(
            json.dumps({"alg": "none", "typ": "JWT"}).encode()
        ).decode().rstrip("=")
        
        payload = base64.urlsafe_b64encode(
            json.dumps(claims).encode()
        ).decode().rstrip("=")
        
        return f"{header}.{payload}."
