"""Authentication service for API access control.

Implements Requirements 13.6:
- Authentication for API access
"""

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, Optional

from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class AuthMethod(str, Enum):
    """Supported authentication methods."""
    API_KEY = "api_key"
    JWT = "jwt"
    IAM = "iam"


class Permission(str, Enum):
    """API permissions."""
    READ_DOCUMENTS = "read:documents"
    SEARCH_DOCUMENTS = "search:documents"
    READ_RELATIONSHIPS = "read:relationships"
    QUERY_NL = "query:natural_language"
    # Upload permissions (Implements Requirement 7.1)
    UPLOAD_DOCUMENTS = "upload:documents"
    UPLOAD_BATCH = "upload:batch"
    REPLACE_DOCUMENTS = "replace:documents"
    VIEW_UPLOAD_STATUS = "view:upload_status"
    VIEW_AUDIT_LOGS = "view:audit_logs"
    ADMIN = "admin"


@dataclass
class APIKey:
    """API key for authentication."""
    
    key_id: str
    key_hash: str
    name: str
    permissions: list[Permission] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: Optional[datetime] = None
    rate_limit: int = 100  # requests per minute
    is_active: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)
    
    @property
    def is_expired(self) -> bool:
        """Check if key has expired."""
        if self.expires_at is None:
            return False
        return datetime.now(timezone.utc) > self.expires_at
    
    def has_permission(self, permission: Permission) -> bool:
        """Check if key has a specific permission."""
        if Permission.ADMIN in self.permissions:
            return True
        return permission in self.permissions


@dataclass
class AuthConfig:
    """Configuration for authentication service."""
    
    secret_key: str = "default-secret-key-change-in-production"
    token_expiry_hours: int = 24
    api_key_prefix: str = "rk_"
    hash_algorithm: str = "sha256"


@dataclass
class AuthResult:
    """Result of an authentication attempt."""
    
    success: bool
    api_key: Optional[APIKey] = None
    error: Optional[str] = None
    user_id: Optional[str] = None
    permissions: list[Permission] = field(default_factory=list)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "success": self.success,
            "error": self.error,
            "user_id": self.user_id,
            "permissions": [p.value for p in self.permissions],
        }


class AuthService:
    """Authentication service for API access control.
    
    Provides:
    - API key generation and validation
    - Permission checking
    - Token-based authentication
    """
    
    def __init__(self, config: Optional[AuthConfig] = None):
        """Initialize the auth service.
        
        Args:
            config: Authentication configuration.
        """
        self.config = config or AuthConfig()
        self._api_keys: dict[str, APIKey] = {}
    
    def generate_api_key(
        self,
        name: str,
        permissions: Optional[list[Permission]] = None,
        expires_in_days: Optional[int] = None,
        rate_limit: int = 100,
        metadata: Optional[dict[str, Any]] = None,
    ) -> tuple[str, APIKey]:
        """Generate a new API key.
        
        Args:
            name: Name/description for the key.
            permissions: List of permissions to grant.
            expires_in_days: Days until expiration (None for no expiry).
            rate_limit: Rate limit in requests per minute.
            metadata: Additional metadata.
            
        Returns:
            Tuple of (raw_key, APIKey object).
        """
        # Generate random key
        raw_key = self.config.api_key_prefix + secrets.token_urlsafe(32)
        key_id = secrets.token_urlsafe(16)
        
        # Hash the key for storage
        key_hash = self._hash_key(raw_key)
        
        # Calculate expiration
        expires_at = None
        if expires_in_days:
            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)
        
        # Default permissions
        if permissions is None:
            permissions = [Permission.READ_DOCUMENTS, Permission.SEARCH_DOCUMENTS]
        
        api_key = APIKey(
            key_id=key_id,
            key_hash=key_hash,
            name=name,
            permissions=permissions,
            expires_at=expires_at,
            rate_limit=rate_limit,
            metadata=metadata or {},
        )
        
        # Store the key
        self._api_keys[key_id] = api_key
        
        logger.info(
            "api_key_generated",
            key_id=key_id,
            name=name,
            permissions=[p.value for p in permissions],
        )
        
        return raw_key, api_key
    
    def validate_api_key(self, raw_key: str) -> AuthResult:
        """Validate an API key.
        
        Args:
            raw_key: The raw API key to validate.
            
        Returns:
            AuthResult with validation status.
        """
        if not raw_key:
            return AuthResult(success=False, error="API key is required")
        
        if not raw_key.startswith(self.config.api_key_prefix):
            return AuthResult(success=False, error="Invalid API key format")
        
        # Hash the provided key
        key_hash = self._hash_key(raw_key)
        
        # Find matching key
        for api_key in self._api_keys.values():
            if hmac.compare_digest(api_key.key_hash, key_hash):
                # Check if active
                if not api_key.is_active:
                    logger.warning("api_key_inactive", key_id=api_key.key_id)
                    return AuthResult(success=False, error="API key is inactive")
                
                # Check expiration
                if api_key.is_expired:
                    logger.warning("api_key_expired", key_id=api_key.key_id)
                    return AuthResult(success=False, error="API key has expired")
                
                logger.info("api_key_validated", key_id=api_key.key_id)
                return AuthResult(
                    success=True,
                    api_key=api_key,
                    user_id=api_key.key_id,
                    permissions=api_key.permissions,
                )
        
        logger.warning("api_key_not_found")
        return AuthResult(success=False, error="Invalid API key")
    
    def check_permission(
        self,
        api_key: APIKey,
        required_permission: Permission,
    ) -> bool:
        """Check if an API key has a required permission.
        
        Args:
            api_key: The API key to check.
            required_permission: The permission required.
            
        Returns:
            True if permission is granted.
        """
        return api_key.has_permission(required_permission)
    
    def revoke_api_key(self, key_id: str) -> bool:
        """Revoke an API key.
        
        Args:
            key_id: ID of the key to revoke.
            
        Returns:
            True if key was revoked.
        """
        if key_id in self._api_keys:
            self._api_keys[key_id].is_active = False
            logger.info("api_key_revoked", key_id=key_id)
            return True
        return False
    
    def delete_api_key(self, key_id: str) -> bool:
        """Delete an API key.
        
        Args:
            key_id: ID of the key to delete.
            
        Returns:
            True if key was deleted.
        """
        if key_id in self._api_keys:
            del self._api_keys[key_id]
            logger.info("api_key_deleted", key_id=key_id)
            return True
        return False
    
    def get_api_key(self, key_id: str) -> Optional[APIKey]:
        """Get an API key by ID.
        
        Args:
            key_id: ID of the key.
            
        Returns:
            APIKey or None if not found.
        """
        return self._api_keys.get(key_id)
    
    def list_api_keys(self) -> list[APIKey]:
        """List all API keys.
        
        Returns:
            List of API keys (without hashes exposed).
        """
        return list(self._api_keys.values())
    
    def authenticate_request(
        self,
        headers: dict[str, str],
        required_permission: Optional[Permission] = None,
    ) -> AuthResult:
        """Authenticate an API request.
        
        Args:
            headers: Request headers.
            required_permission: Optional permission to check.
            
        Returns:
            AuthResult with authentication status.
        """
        # Extract API key from headers
        auth_header = headers.get("Authorization", headers.get("authorization", ""))
        api_key_header = headers.get("X-API-Key", headers.get("x-api-key", ""))
        
        raw_key = None
        
        # Check Authorization header (Bearer token)
        if auth_header.startswith("Bearer "):
            raw_key = auth_header[7:]
        # Check X-API-Key header
        elif api_key_header:
            raw_key = api_key_header
        
        if not raw_key:
            return AuthResult(
                success=False,
                error="No API key provided. Use Authorization: Bearer <key> or X-API-Key header",
            )
        
        # Validate the key
        result = self.validate_api_key(raw_key)
        
        # Check permission if required
        if result.success and required_permission and result.api_key:
            if not self.check_permission(result.api_key, required_permission):
                return AuthResult(
                    success=False,
                    error=f"Permission denied: {required_permission.value}",
                    api_key=result.api_key,
                )
        
        return result
    
    def _hash_key(self, raw_key: str) -> str:
        """Hash an API key for secure storage."""
        return hashlib.sha256(
            (raw_key + self.config.secret_key).encode()
        ).hexdigest()
