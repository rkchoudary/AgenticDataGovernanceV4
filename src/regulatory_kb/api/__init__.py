"""API module for regulatory knowledge base REST and GraphQL endpoints."""

from regulatory_kb.api.rest import (
    DocumentSearchService,
    SearchFilters,
    SearchResult,
    PaginatedResponse,
)
from regulatory_kb.api.auth import (
    AuthService,
    AuthConfig,
    APIKey,
    AuthResult,
    Permission,
)
from regulatory_kb.api.audit import (
    AuditLogger,
    AuditEvent,
    AuditEventType,
)
from regulatory_kb.api.cloudwatch_audit import (
    CloudWatchAuditLogger,
    RETENTION_DAYS,
)
from regulatory_kb.api.rate_limiter import (
    RateLimiter,
    RateLimitConfig,
    RateLimitResult,
)
from regulatory_kb.api.graphql import (
    GraphQLService,
    GraphQLContext,
    GraphQLResult,
    GRAPHQL_SCHEMA,
)
from regulatory_kb.api.webhooks import (
    WebhookService,
    WebhookSubscription,
    WebhookDelivery,
    WebhookEventType,
    WebhookStatus,
    WebhookPayload,
)

__all__ = [
    "DocumentSearchService",
    "SearchFilters",
    "SearchResult",
    "PaginatedResponse",
    "AuthService",
    "AuthConfig",
    "APIKey",
    "AuthResult",
    "Permission",
    "AuditLogger",
    "AuditEvent",
    "AuditEventType",
    "CloudWatchAuditLogger",
    "RETENTION_DAYS",
    "RateLimiter",
    "RateLimitConfig",
    "RateLimitResult",
    "GraphQLService",
    "GraphQLContext",
    "GraphQLResult",
    "GRAPHQL_SCHEMA",
    "WebhookService",
    "WebhookSubscription",
    "WebhookDelivery",
    "WebhookEventType",
    "WebhookStatus",
    "WebhookPayload",
]
