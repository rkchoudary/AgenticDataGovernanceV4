"""
Tenant context middleware for the Agentic Data Governance System.

This module provides tenant context management using ContextVar for
propagating tenant_id across async operations and extracting tenant
information from JWT claims.

Requirements: 20.2, 20.3
"""

from contextvars import ContextVar
from typing import Optional, Any
from dataclasses import dataclass
import base64
import json


# ContextVar for tenant propagation across async operations
_tenant_context: ContextVar[Optional[str]] = ContextVar('tenant_context', default=None)
_user_context: ContextVar[Optional[dict]] = ContextVar('user_context', default=None)


@dataclass
class TenantContext:
    """Tenant context information extracted from JWT."""
    tenant_id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    user_roles: list[str] = None
    
    def __post_init__(self):
        if self.user_roles is None:
            self.user_roles = []


def get_current_tenant_id() -> Optional[str]:
    """
    Get the current tenant ID from context.
    
    Returns:
        The current tenant ID or None if not set.
    """
    return _tenant_context.get()


def set_current_tenant_id(tenant_id: str) -> None:
    """
    Set the current tenant ID in context.
    
    Args:
        tenant_id: The tenant ID to set.
    """
    _tenant_context.set(tenant_id)


def clear_tenant_context() -> None:
    """Clear the tenant context."""
    _tenant_context.set(None)
    _user_context.set(None)


def get_current_user_context() -> Optional[dict]:
    """
    Get the current user context from context.
    
    Returns:
        The current user context or None if not set.
    """
    return _user_context.get()


def set_user_context(user_info: dict) -> None:
    """
    Set the current user context.
    
    Args:
        user_info: Dictionary containing user information.
    """
    _user_context.set(user_info)


def extract_tenant_from_jwt(token: str) -> TenantContext:
    """
    Extract tenant context from a JWT token.
    
    Args:
        token: The JWT token string (can include 'Bearer ' prefix).
        
    Returns:
        TenantContext with extracted information.
        
    Raises:
        ValueError: If the token is invalid or missing required claims.
    """
    # Remove Bearer prefix if present
    if token.startswith('Bearer '):
        token = token[7:]
    
    try:
        # Split JWT into parts
        parts = token.split('.')
        if len(parts) != 3:
            raise ValueError("Invalid JWT format")
        
        # Decode payload (middle part)
        # Add padding if needed
        payload_b64 = parts[1]
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += '=' * padding
        
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        payload = json.loads(payload_bytes.decode('utf-8'))
        
        # Extract tenant_id from claims
        # Support multiple claim formats
        tenant_id = (
            payload.get('tenant_id') or
            payload.get('custom:tenant_id') or
            payload.get('https://governance.example.com/tenant_id')
        )
        
        if not tenant_id:
            raise ValueError("Missing tenant_id claim in JWT")
        
        # Extract user information
        user_id = payload.get('sub') or payload.get('user_id')
        user_email = payload.get('email')
        user_roles = payload.get('roles', [])
        
        # Handle roles as string or list
        if isinstance(user_roles, str):
            user_roles = [user_roles]
        
        return TenantContext(
            tenant_id=tenant_id,
            user_id=user_id,
            user_email=user_email,
            user_roles=user_roles
        )
        
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise ValueError(f"Failed to decode JWT payload: {e}")


def require_tenant_context(func):
    """
    Decorator that ensures tenant context is set before executing a function.
    
    Raises:
        RuntimeError: If tenant context is not set.
    """
    def wrapper(*args, **kwargs):
        tenant_id = get_current_tenant_id()
        if not tenant_id:
            raise RuntimeError("Tenant context is required but not set")
        return func(*args, **kwargs)
    
    wrapper.__name__ = func.__name__
    wrapper.__doc__ = func.__doc__
    return wrapper


async def async_require_tenant_context(func):
    """
    Async decorator that ensures tenant context is set before executing a function.
    
    Raises:
        RuntimeError: If tenant context is not set.
    """
    async def wrapper(*args, **kwargs):
        tenant_id = get_current_tenant_id()
        if not tenant_id:
            raise RuntimeError("Tenant context is required but not set")
        return await func(*args, **kwargs)
    
    wrapper.__name__ = func.__name__
    wrapper.__doc__ = func.__doc__
    return wrapper


class TenantContextManager:
    """
    Context manager for setting tenant context within a scope.
    
    Usage:
        with TenantContextManager(tenant_id="tenant-123"):
            # All operations within this block will have tenant context
            do_something()
    """
    
    def __init__(self, tenant_id: str, user_info: Optional[dict] = None):
        self.tenant_id = tenant_id
        self.user_info = user_info
        self._previous_tenant_id: Optional[str] = None
        self._previous_user_info: Optional[dict] = None
    
    def __enter__(self):
        self._previous_tenant_id = get_current_tenant_id()
        self._previous_user_info = get_current_user_context()
        set_current_tenant_id(self.tenant_id)
        if self.user_info:
            set_user_context(self.user_info)
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._previous_tenant_id:
            set_current_tenant_id(self._previous_tenant_id)
        else:
            clear_tenant_context()
        if self._previous_user_info:
            set_user_context(self._previous_user_info)
        return False


class TenantMiddleware:
    """
    Middleware for extracting tenant context from requests.
    
    This middleware extracts the tenant_id from JWT tokens in the
    Authorization header and sets it in the context for downstream use.
    """
    
    def __init__(self, header_name: str = "Authorization"):
        self.header_name = header_name
    
    def process_request(self, headers: dict[str, str]) -> TenantContext:
        """
        Process a request and extract tenant context.
        
        Args:
            headers: Request headers dictionary.
            
        Returns:
            TenantContext with extracted information.
            
        Raises:
            ValueError: If Authorization header is missing or invalid.
        """
        auth_header = headers.get(self.header_name)
        if not auth_header:
            raise ValueError(f"Missing {self.header_name} header")
        
        tenant_context = extract_tenant_from_jwt(auth_header)
        
        # Set context vars
        set_current_tenant_id(tenant_context.tenant_id)
        set_user_context({
            "user_id": tenant_context.user_id,
            "email": tenant_context.user_email,
            "roles": tenant_context.user_roles
        })
        
        return tenant_context


def create_tenant_scoped_key(base_key: str, tenant_id: Optional[str] = None) -> str:
    """
    Create a tenant-scoped storage key.
    
    Args:
        base_key: The base key to scope.
        tenant_id: Optional tenant ID. If not provided, uses current context.
        
    Returns:
        Tenant-prefixed key in format: "tenant:{tenant_id}:{base_key}"
        
    Raises:
        RuntimeError: If no tenant_id provided and no context set.
    """
    if tenant_id is None:
        tenant_id = get_current_tenant_id()
    
    if not tenant_id:
        raise RuntimeError("No tenant_id provided and no tenant context set")
    
    return f"tenant:{tenant_id}:{base_key}"


def parse_tenant_scoped_key(scoped_key: str) -> tuple[str, str]:
    """
    Parse a tenant-scoped key to extract tenant_id and base_key.
    
    Args:
        scoped_key: The tenant-scoped key.
        
    Returns:
        Tuple of (tenant_id, base_key).
        
    Raises:
        ValueError: If the key format is invalid.
    """
    if not scoped_key.startswith("tenant:"):
        raise ValueError(f"Invalid tenant-scoped key format: {scoped_key}")
    
    parts = scoped_key.split(":", 2)
    if len(parts) != 3:
        raise ValueError(f"Invalid tenant-scoped key format: {scoped_key}")
    
    return parts[1], parts[2]
