"""
Unit tests for AgentCore Identity Integration.

Tests token extraction and user context functionality.
Requirements: 16.3, 16.4
"""
import base64
import json
import pytest
from datetime import datetime, timedelta

from services.identity_config import (
    UserClaims,
    IdentityContext,
    OAuth2CredentialProviderConfig,
    TokenVaultConfig,
    IdentityProvider,
    decode_jwt_claims,
    extract_user_for_audit,
    get_identity_context,
    requires_access_token,
    get_current_identity_context,
    set_current_identity_context,
    create_identity_provider,
    create_token_for_user,
    AuthenticationError,
    AuthorizationError,
)


def create_test_jwt(claims: dict, expired: bool = False) -> str:
    """Helper to create a test JWT token."""
    if expired:
        claims['exp'] = int((datetime.now() - timedelta(hours=1)).timestamp())
    elif 'exp' not in claims:
        claims['exp'] = int((datetime.now() + timedelta(hours=1)).timestamp())
    
    if 'iat' not in claims:
        claims['iat'] = int(datetime.now().timestamp())
    
    header = base64.urlsafe_b64encode(
        json.dumps({"alg": "none", "typ": "JWT"}).encode()
    ).decode().rstrip('=')
    
    payload = base64.urlsafe_b64encode(
        json.dumps(claims).encode()
    ).decode().rstrip('=')
    
    return f"{header}.{payload}."


class TestUserClaims:
    """Tests for UserClaims model."""
    
    def test_user_id_from_preferred_username(self):
        """Test user_id property returns preferred_username when available."""
        claims = UserClaims(
            sub="user-123",
            preferred_username="jdoe",
            email="jdoe@example.com"
        )
        assert claims.user_id == "jdoe"
    
    def test_user_id_from_email_when_no_username(self):
        """Test user_id property falls back to email."""
        claims = UserClaims(
            sub="user-123",
            email="jdoe@example.com"
        )
        assert claims.user_id == "jdoe@example.com"
    
    def test_user_id_from_sub_when_no_username_or_email(self):
        """Test user_id property falls back to sub."""
        claims = UserClaims(sub="user-123")
        assert claims.user_id == "user-123"
    
    def test_primary_role_returns_first_role(self):
        """Test primary_role returns first role in list."""
        claims = UserClaims(
            sub="user-123",
            roles=["compliance_officer", "data_steward"]
        )
        assert claims.primary_role == "compliance_officer"
    
    def test_primary_role_returns_none_when_no_roles(self):
        """Test primary_role returns None when no roles."""
        claims = UserClaims(sub="user-123")
        assert claims.primary_role is None


class TestDecodeJwtClaims:
    """Tests for JWT token decoding and claim extraction.
    
    Requirements: 16.3
    """
    
    def test_decode_standard_claims(self):
        """Test decoding standard JWT claims."""
        token = create_test_jwt({
            "sub": "user-123",
            "email": "jdoe@example.com",
            "name": "John Doe",
            "preferred_username": "jdoe"
        })
        
        claims = decode_jwt_claims(token)
        
        assert claims.sub == "user-123"
        assert claims.email == "jdoe@example.com"
        assert claims.name == "John Doe"
        assert claims.preferred_username == "jdoe"
    
    def test_decode_roles_from_roles_claim(self):
        """Test extracting roles from 'roles' claim."""
        token = create_test_jwt({
            "sub": "user-123",
            "roles": ["compliance_officer", "data_steward"]
        })
        
        claims = decode_jwt_claims(token)
        
        assert claims.roles == ["compliance_officer", "data_steward"]
    
    def test_decode_roles_from_cognito_groups(self):
        """Test extracting roles from Cognito 'cognito:groups' claim."""
        token = create_test_jwt({
            "sub": "user-123",
            "cognito:groups": ["admin", "users"]
        })
        
        claims = decode_jwt_claims(token)
        
        assert claims.roles == ["admin", "users"]
    
    def test_decode_roles_from_keycloak_format(self):
        """Test extracting roles from Keycloak 'realm_access' claim."""
        token = create_test_jwt({
            "sub": "user-123",
            "realm_access": {"roles": ["manager", "viewer"]}
        })
        
        claims = decode_jwt_claims(token)
        
        assert claims.roles == ["manager", "viewer"]
    
    def test_decode_single_role_string(self):
        """Test extracting single role as string."""
        token = create_test_jwt({
            "sub": "user-123",
            "role": "admin"
        })
        
        claims = decode_jwt_claims(token)
        
        assert claims.roles == ["admin"]
    
    def test_decode_tenant_id(self):
        """Test extracting tenant_id from claims."""
        token = create_test_jwt({
            "sub": "user-123",
            "tenant_id": "tenant-abc"
        })
        
        claims = decode_jwt_claims(token)
        
        assert claims.tenant_id == "tenant-abc"
    
    def test_decode_custom_tenant_id(self):
        """Test extracting tenant_id from custom:tenant_id claim."""
        token = create_test_jwt({
            "sub": "user-123",
            "custom:tenant_id": "tenant-xyz"
        })
        
        claims = decode_jwt_claims(token)
        
        assert claims.tenant_id == "tenant-xyz"
    
    def test_decode_groups(self):
        """Test extracting groups from claims."""
        token = create_test_jwt({
            "sub": "user-123",
            "groups": ["finance", "compliance"]
        })
        
        claims = decode_jwt_claims(token)
        
        assert claims.groups == ["finance", "compliance"]
    
    def test_decode_issuer_and_audience(self):
        """Test extracting iss and aud claims."""
        token = create_test_jwt({
            "sub": "user-123",
            "iss": "https://auth.example.com",
            "aud": "governance-app"
        })
        
        claims = decode_jwt_claims(token)
        
        assert claims.iss == "https://auth.example.com"
        assert claims.aud == "governance-app"
    
    def test_decode_invalid_jwt_returns_minimal_claims(self):
        """Test that invalid JWT returns minimal claims."""
        claims = decode_jwt_claims("invalid-token")
        
        assert claims.sub.startswith("unknown_")
    
    def test_decode_username_fallback(self):
        """Test username extraction falls back to 'username' claim."""
        token = create_test_jwt({
            "sub": "user-123",
            "username": "johndoe"
        })
        
        claims = decode_jwt_claims(token)
        
        assert claims.preferred_username == "johndoe"


class TestExtractUserForAudit:
    """Tests for extracting user info for audit entries.
    
    Requirements: 16.3
    """
    
    def test_extract_complete_user_info(self):
        """Test extracting complete user info for audit."""
        token = create_test_jwt({
            "sub": "user-123",
            "email": "jdoe@example.com",
            "name": "John Doe",
            "preferred_username": "jdoe",
            "roles": ["compliance_officer"],
            "tenant_id": "tenant-abc"
        })
        
        audit_info = extract_user_for_audit(token)
        
        assert audit_info["user_id"] == "jdoe"
        assert audit_info["email"] == "jdoe@example.com"
        assert audit_info["name"] == "John Doe"
        assert audit_info["roles"] == ["compliance_officer"]
        assert audit_info["tenant_id"] == "tenant-abc"
    
    def test_extract_minimal_user_info(self):
        """Test extracting minimal user info when claims are sparse."""
        token = create_test_jwt({"sub": "user-456"})
        
        audit_info = extract_user_for_audit(token)
        
        assert audit_info["user_id"] == "user-456"
        assert audit_info["email"] is None
        assert audit_info["name"] is None
        assert audit_info["roles"] == []
        assert audit_info["tenant_id"] is None


class TestGetIdentityContext:
    """Tests for creating identity context from token."""
    
    def test_create_identity_context(self):
        """Test creating identity context from token."""
        token = create_test_jwt({
            "sub": "user-123",
            "email": "jdoe@example.com",
            "roles": ["data_steward"]
        })
        
        context = get_identity_context(token, session_id="session-001")
        
        assert context.user_claims.sub == "user-123"
        assert context.access_token == token
        assert context.token_type == "Bearer"
        assert context.session_id == "session-001"
        assert context.auth_method == "oauth2"


class TestRequiresAccessTokenDecorator:
    """Tests for @requires_access_token decorator.
    
    Requirements: 16.2, 16.3
    """
    
    def test_decorator_allows_valid_token(self):
        """Test decorator allows execution with valid token."""
        @requires_access_token()
        def protected_function(data: str, access_token: str = None):
            return f"processed: {data}"
        
        token = create_test_jwt({
            "sub": "user-123",
            "roles": ["user"]
        })
        
        result = protected_function("test", access_token=token)
        
        assert result == "processed: test"
    
    def test_decorator_rejects_missing_token(self):
        """Test decorator rejects call without token."""
        @requires_access_token()
        def protected_function(data: str, access_token: str = None):
            return f"processed: {data}"
        
        with pytest.raises(AuthenticationError, match="Access token required"):
            protected_function("test")
    
    def test_decorator_rejects_expired_token(self):
        """Test decorator rejects expired token."""
        @requires_access_token()
        def protected_function(data: str, access_token: str = None):
            return f"processed: {data}"
        
        token = create_test_jwt({"sub": "user-123"}, expired=True)
        
        with pytest.raises(AuthenticationError, match="expired"):
            protected_function("test", access_token=token)
    
    def test_decorator_validates_required_roles(self):
        """Test decorator validates required roles."""
        @requires_access_token(required_roles=["compliance_officer"])
        def approve_action(data: str, access_token: str = None):
            return f"approved: {data}"
        
        token = create_test_jwt({
            "sub": "user-123",
            "roles": ["compliance_officer", "data_steward"]
        })
        
        result = approve_action("catalog", access_token=token)
        
        assert result == "approved: catalog"
    
    def test_decorator_rejects_missing_required_role(self):
        """Test decorator rejects user missing required role."""
        @requires_access_token(required_roles=["compliance_officer"])
        def approve_action(data: str, access_token: str = None):
            return f"approved: {data}"
        
        token = create_test_jwt({
            "sub": "user-123",
            "roles": ["data_steward"]
        })
        
        with pytest.raises(AuthorizationError, match="missing required roles"):
            approve_action("catalog", access_token=token)
    
    def test_decorator_any_role_mode(self):
        """Test decorator with any_role=True accepts any matching role."""
        @requires_access_token(required_roles=["admin", "compliance_officer"], any_role=True)
        def admin_action(data: str, access_token: str = None):
            return f"admin: {data}"
        
        token = create_test_jwt({
            "sub": "user-123",
            "roles": ["compliance_officer"]
        })
        
        result = admin_action("action", access_token=token)
        
        assert result == "admin: action"
    
    def test_decorator_any_role_rejects_no_match(self):
        """Test decorator with any_role=True rejects when no roles match."""
        @requires_access_token(required_roles=["admin", "compliance_officer"], any_role=True)
        def admin_action(data: str, access_token: str = None):
            return f"admin: {data}"
        
        token = create_test_jwt({
            "sub": "user-123",
            "roles": ["viewer"]
        })
        
        with pytest.raises(AuthorizationError, match="does not have any"):
            admin_action("action", access_token=token)
    
    def test_decorator_sets_identity_context(self):
        """Test decorator sets identity context during execution."""
        captured_context = None
        
        @requires_access_token()
        def capture_context(access_token: str = None):
            nonlocal captured_context
            captured_context = get_current_identity_context()
            return "done"
        
        token = create_test_jwt({
            "sub": "user-123",
            "email": "jdoe@example.com"
        })
        
        capture_context(access_token=token)
        
        assert captured_context is not None
        assert captured_context.user_claims.sub == "user-123"
    
    def test_decorator_clears_identity_context_after_execution(self):
        """Test decorator clears identity context after execution."""
        @requires_access_token()
        def simple_function(access_token: str = None):
            return "done"
        
        token = create_test_jwt({"sub": "user-123"})
        
        simple_function(access_token=token)
        
        assert get_current_identity_context() is None


class TestIdentityProvider:
    """Tests for IdentityProvider class.
    
    Requirements: 16.1, 16.4
    """
    
    def test_validate_token_returns_claims(self):
        """Test validate_token returns user claims."""
        provider = IdentityProvider()
        token = create_test_jwt({
            "sub": "user-123",
            "email": "jdoe@example.com"
        })
        
        claims = provider.validate_token(token)
        
        assert claims.sub == "user-123"
        assert claims.email == "jdoe@example.com"
    
    def test_validate_token_rejects_expired(self):
        """Test validate_token rejects expired token."""
        provider = IdentityProvider()
        token = create_test_jwt({"sub": "user-123"}, expired=True)
        
        with pytest.raises(AuthenticationError, match="expired"):
            provider.validate_token(token)
    
    def test_get_user_context(self):
        """Test get_user_context returns full identity context."""
        provider = IdentityProvider()
        token = create_test_jwt({
            "sub": "user-123",
            "roles": ["data_steward"]
        })
        
        context = provider.get_user_context(token)
        
        assert isinstance(context, IdentityContext)
        assert context.user_claims.sub == "user-123"
        assert context.access_token == token
    
    def test_extract_audit_info(self):
        """Test extract_audit_info returns audit-relevant info."""
        provider = IdentityProvider()
        token = create_test_jwt({
            "sub": "user-123",
            "email": "jdoe@example.com",
            "name": "John Doe",
            "preferred_username": "jdoe",
            "roles": ["compliance_officer"],
            "tenant_id": "tenant-abc"
        })
        
        audit_info = provider.extract_audit_info(token)
        
        # user_id prefers preferred_username over email over sub
        assert audit_info["user_id"] == "jdoe"
        assert audit_info["email"] == "jdoe@example.com"
        assert audit_info["tenant_id"] == "tenant-abc"
    
    def test_create_service_token(self):
        """Test creating service account token."""
        provider = IdentityProvider()
        
        token = provider.create_service_token(
            service_name="regulatory-agent",
            roles=["agent", "service"],
            tenant_id="tenant-xyz"
        )
        
        # Verify the token can be decoded
        claims = decode_jwt_claims(token)
        
        assert claims.sub == "service:regulatory-agent"
        assert claims.preferred_username == "regulatory-agent"
        assert claims.roles == ["agent", "service"]
        assert claims.tenant_id == "tenant-xyz"


class TestOAuth2CredentialProviderConfig:
    """Tests for OAuth2 configuration.
    
    Requirements: 16.1, 16.4
    """
    
    def test_default_config(self):
        """Test default OAuth2 configuration."""
        config = OAuth2CredentialProviderConfig()
        
        assert config.name == "governance-identity-provider"
        assert config.provider_type == "OAUTH2"
        assert config.auth_flow == "USER_FEDERATION"
        assert "openid" in config.scopes
        assert config.token_expiry_seconds == 3600
    
    def test_user_federation_auth_flow(self):
        """Test USER_FEDERATION auth flow configuration.
        
        Requirements: 16.4
        """
        config = OAuth2CredentialProviderConfig(
            auth_flow="USER_FEDERATION",
            authorization_endpoint="https://auth.example.com/authorize",
            token_endpoint="https://auth.example.com/token"
        )
        
        assert config.auth_flow == "USER_FEDERATION"
        assert config.authorization_endpoint == "https://auth.example.com/authorize"
    
    def test_client_credentials_auth_flow(self):
        """Test CLIENT_CREDENTIALS auth flow configuration."""
        config = OAuth2CredentialProviderConfig(
            auth_flow="CLIENT_CREDENTIALS",
            client_id="my-client",
            client_secret_arn="arn:aws:secretsmanager:us-west-2:123456789:secret:client-secret"
        )
        
        assert config.auth_flow == "CLIENT_CREDENTIALS"
        assert config.client_id == "my-client"


class TestTokenVaultConfig:
    """Tests for Token Vault configuration.
    
    Requirements: 16.5
    """
    
    def test_default_config(self):
        """Test default Token Vault configuration."""
        config = TokenVaultConfig()
        
        assert config.vault_name == "governance-token-vault"
        assert config.region == "us-west-2"
    
    def test_custom_config(self):
        """Test custom Token Vault configuration."""
        config = TokenVaultConfig(
            vault_name="custom-vault",
            region="eu-west-1",
            encryption_key_arn="arn:aws:kms:eu-west-1:123456789:key/abc"
        )
        
        assert config.vault_name == "custom-vault"
        assert config.region == "eu-west-1"
        assert config.encryption_key_arn is not None


class TestCreateIdentityProvider:
    """Tests for create_identity_provider factory function."""
    
    def test_create_with_defaults(self):
        """Test creating identity provider with defaults."""
        provider = create_identity_provider()
        
        assert provider.config.name == "governance-identity-provider"
        assert provider.config.auth_flow == "USER_FEDERATION"
    
    def test_create_with_custom_config(self):
        """Test creating identity provider with custom config."""
        provider = create_identity_provider(
            provider_name="custom-provider",
            auth_flow="CLIENT_CREDENTIALS",
            client_id="my-client"
        )
        
        assert provider.config.name == "custom-provider"
        assert provider.config.auth_flow == "CLIENT_CREDENTIALS"
        assert provider.config.client_id == "my-client"


class TestCreateTokenForUser:
    """Tests for create_token_for_user helper function."""
    
    def test_create_token_with_all_fields(self):
        """Test creating token with all user fields."""
        token = create_token_for_user(
            user_id="user-123",
            email="jdoe@example.com",
            name="John Doe",
            roles=["compliance_officer", "data_steward"],
            tenant_id="tenant-abc",
            expiry_seconds=7200
        )
        
        claims = decode_jwt_claims(token)
        
        assert claims.sub == "user-123"
        assert claims.email == "jdoe@example.com"
        assert claims.name == "John Doe"
        assert claims.roles == ["compliance_officer", "data_steward"]
        assert claims.tenant_id == "tenant-abc"
    
    def test_create_token_with_minimal_fields(self):
        """Test creating token with minimal fields."""
        token = create_token_for_user(user_id="user-456")
        
        claims = decode_jwt_claims(token)
        
        assert claims.sub == "user-456"
        assert claims.roles == []
