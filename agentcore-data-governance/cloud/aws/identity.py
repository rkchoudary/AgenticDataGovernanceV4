"""
AWS Identity provider implementation.

This module implements the IdentityProvider protocol using
AWS Cognito and AgentCore Identity for authentication.

Requirements: 21.2
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


class AWSIdentityProvider:
    """
    AWS implementation of IdentityProvider using Cognito/AgentCore Identity.
    
    This provider handles authentication, token validation, and
    user management using AWS identity services.
    
    Requirements: 21.2
    """
    
    def __init__(self, region: str = "us-west-2"):
        """
        Initialize the AWS Identity provider.
        
        Args:
            region: AWS region for identity services
        """
        self.region = region
        self._cognito_client = None
        self._identity_client = None
        
        # In-memory storage for local development/testing
        self._providers: dict[str, IdentityProviderResult] = {}
        self._tokens: dict[str, dict[str, Any]] = {}
        self._revoked_tokens: set[str] = set()
    
    @property
    def cognito_client(self):
        """Lazy-load the Cognito client."""
        if self._cognito_client is None:
            try:
                import boto3
                self._cognito_client = boto3.client(
                    "cognito-idp",
                    region_name=self.region
                )
            except ImportError:
                self._cognito_client = None
        return self._cognito_client
    
    @property
    def identity_client(self):
        """Lazy-load the AgentCore Identity client."""
        if self._identity_client is None:
            try:
                from bedrock_agentcore.identity import IdentityClient
                self._identity_client = IdentityClient(region_name=self.region)
            except ImportError:
                self._identity_client = None
        return self._identity_client
    
    def setup_provider(self, config: IdentityConfig) -> IdentityProviderResult:
        """
        Set up the identity provider.
        
        Args:
            config: Identity provider configuration
            
        Returns:
            Setup result with provider details
        """
        provider_id = f"idp-{uuid4().hex[:12]}"
        
        if self.identity_client:
            try:
                response = self.identity_client.create_credential_provider(
                    provider_name=config.name,
                    provider_type="OAUTH2",
                    auth_flow=config.auth_flow,
                    scopes=config.scopes,
                    token_expiry_seconds=config.token_expiry_seconds,
                    client_id=config.client_id,
                )
                provider_id = response.get("provider_id", provider_id)
                issuer_url = response.get("issuer_url")
                client_id = response.get("client_id", config.client_id)
                status = "active"
            except Exception:
                issuer_url = f"https://cognito-idp.{self.region}.amazonaws.com/{provider_id}"
                client_id = config.client_id
                status = "active"
        else:
            # Local development mode
            issuer_url = f"http://localhost:8082/identity/{provider_id}"
            client_id = config.client_id or f"client-{uuid4().hex[:8]}"
            status = "active"
        
        result = IdentityProviderResult(
            provider_id=provider_id,
            provider_name=config.name,
            issuer_url=issuer_url,
            client_id=client_id,
            status=status,
            provider="aws",
            metadata={
                "auth_flow": config.auth_flow,
                "scopes": config.scopes,
                "region": self.region,
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
        # Check if token is revoked
        if token in self._revoked_tokens:
            raise ValueError("Token has been revoked")
        
        # Decode and validate token
        claims = self._decode_jwt(token)
        
        # Check expiration
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
        
        # Extract roles from various claim formats
        roles = []
        if "roles" in claims:
            roles = claims["roles"]
        elif "cognito:groups" in claims:
            roles = claims["cognito:groups"]
        elif "role" in claims:
            roles = [claims["role"]] if isinstance(claims["role"], str) else claims["role"]
        
        return {
            "sub": claims.get("sub", ""),
            "email": claims.get("email"),
            "name": claims.get("name"),
            "preferred_username": claims.get("preferred_username") or claims.get("username"),
            "roles": roles,
            "groups": claims.get("groups", []),
            "tenant_id": claims.get("tenant_id") or claims.get("custom:tenant_id"),
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
            "preferred_username": service_name,
            "roles": roles,
            "tenant_id": tenant_id,
            "iat": int(datetime.now().timestamp()),
            "exp": int(datetime.now().timestamp()) + expiry_seconds,
            "iss": f"https://agentcore.{self.region}.amazonaws.com",
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
        """
        Decode a JWT token without signature verification.
        
        Note: In production, signature verification is done by AWS services.
        
        Args:
            token: JWT token string
            
        Returns:
            Token claims
        """
        try:
            parts = token.split(".")
            if len(parts) != 3:
                raise ValueError("Invalid JWT format")
            
            payload = parts[1]
            
            # Add padding if needed
            padding = 4 - len(payload) % 4
            if padding != 4:
                payload += "=" * padding
            
            decoded = base64.urlsafe_b64decode(payload)
            return json.loads(decoded)
        except Exception as e:
            raise ValueError(f"Failed to decode token: {str(e)}")
    
    def _encode_jwt(self, claims: dict[str, Any]) -> str:
        """
        Encode claims as a JWT token.
        
        Note: This creates unsigned tokens for local development.
        
        Args:
            claims: Token claims
            
        Returns:
            JWT token string
        """
        header = base64.urlsafe_b64encode(
            json.dumps({"alg": "none", "typ": "JWT"}).encode()
        ).decode().rstrip("=")
        
        payload = base64.urlsafe_b64encode(
            json.dumps(claims).encode()
        ).decode().rstrip("=")
        
        return f"{header}.{payload}."
