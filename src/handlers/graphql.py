"""GraphQL Lambda handler for complex regulatory relationship queries.

Implements Requirements 13.5:
- GraphQL queries for traversing relationships between regulations and implementing guidance
"""

import json
import os
import time
from typing import Any, Optional

from regulatory_kb.core import get_logger, configure_logging
from regulatory_kb.api import (
    AuthService,
    AuthConfig,
    Permission,
    AuditLogger,
    AuditEventType,
    RateLimiter,
    RateLimitConfig,
)
from regulatory_kb.api.graphql import GraphQLService, GraphQLContext
from regulatory_kb.storage.graph_store import FalkorDBStore, GraphStoreConfig

configure_logging(level="INFO", json_format=True)
logger = get_logger(__name__)

# Global service instances
_graphql_service: Optional[GraphQLService] = None
_auth_service: Optional[AuthService] = None
_audit_logger: Optional[AuditLogger] = None
_rate_limiter: Optional[RateLimiter] = None
_graph_store: Optional[FalkorDBStore] = None


def _get_graph_store() -> FalkorDBStore:
    """Get or create the graph store."""
    global _graph_store
    
    if _graph_store is None:
        store_config = GraphStoreConfig(
            host=os.environ.get("FALKORDB_HOST", "localhost"),
            port=int(os.environ.get("FALKORDB_PORT", "6379")),
            password=os.environ.get("FALKORDB_PASSWORD"),
        )
        _graph_store = FalkorDBStore(store_config)
        try:
            _graph_store.connect()
        except Exception as e:
            logger.warning("falkordb_connection_failed", error=str(e))
    
    return _graph_store


def _get_graphql_service() -> GraphQLService:
    """Get or create the GraphQL service."""
    global _graphql_service
    
    if _graphql_service is None:
        _graphql_service = GraphQLService(_get_graph_store())
    
    return _graphql_service


def _get_auth_service() -> AuthService:
    """Get or create the auth service."""
    global _auth_service
    
    if _auth_service is None:
        config = AuthConfig(
            secret_key=os.environ.get("API_SECRET_KEY", "default-secret-key"),
        )
        _auth_service = AuthService(config)
    
    return _auth_service


def _get_audit_logger() -> AuditLogger:
    """Get or create the audit logger."""
    global _audit_logger
    
    if _audit_logger is None:
        _audit_logger = AuditLogger()
    
    return _audit_logger


def _get_rate_limiter() -> RateLimiter:
    """Get or create the rate limiter."""
    global _rate_limiter
    
    if _rate_limiter is None:
        config = RateLimitConfig(
            default_requests_per_minute=int(
                os.environ.get("RATE_LIMIT_PER_MINUTE", "100")
            ),
        )
        _rate_limiter = RateLimiter(config)
    
    return _rate_limiter


def _extract_client_info(event: dict) -> dict[str, Optional[str]]:
    """Extract client information from request."""
    headers = event.get("headers") or {}
    request_context = event.get("requestContext") or {}
    identity = request_context.get("identity") or {}
    
    return {
        "ip_address": identity.get("sourceIp"),
        "user_agent": headers.get("User-Agent", headers.get("user-agent")),
        "request_id": request_context.get("requestId"),
    }


def _authenticate_request(event: dict) -> tuple[bool, Optional[str], dict]:
    """Authenticate an API request."""
    headers = event.get("headers") or {}
    auth_service = _get_auth_service()
    audit_logger = _get_audit_logger()
    client_info = _extract_client_info(event)
    
    # Skip auth if disabled
    if os.environ.get("DISABLE_AUTH", "false").lower() == "true":
        return True, "anonymous", {}
    
    result = auth_service.authenticate_request(headers, Permission.SEARCH_DOCUMENTS)
    
    if not result.success:
        audit_logger.log_auth_failure(
            ip_address=client_info["ip_address"],
            user_agent=client_info["user_agent"],
            error_message=result.error,
        )
        return False, None, {
            "statusCode": 401,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"errors": [{"message": result.error}]}),
        }
    
    return True, result.user_id, {}


def _check_rate_limit(client_id: str, event: dict) -> tuple[bool, dict]:
    """Check rate limit for a client."""
    rate_limiter = _get_rate_limiter()
    audit_logger = _get_audit_logger()
    client_info = _extract_client_info(event)
    
    result = rate_limiter.check_rate_limit(client_id)
    
    if not result.allowed:
        audit_logger.log_rate_limit_exceeded(
            client_id=client_id,
            limit=result.limit,
            ip_address=client_info["ip_address"],
            request_path=event.get("path"),
        )
        return False, {
            "statusCode": 429,
            "headers": {
                "Content-Type": "application/json",
                **result.to_headers(),
            },
            "body": json.dumps({
                "errors": [{
                    "message": "Rate limit exceeded",
                    "extensions": {"retryAfter": result.retry_after_seconds},
                }]
            }),
        }
    
    return True, {"rate_limit_headers": result.to_headers()}


def _build_response(
    status_code: int,
    body: Any,
    extra_headers: Optional[dict] = None,
) -> dict:
    """Build an API Gateway response."""
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-API-Key",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
    }
    if extra_headers:
        headers.update(extra_headers)
    
    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body) if not isinstance(body, str) else body,
    }


def graphql_handler(event: dict, context: Any) -> dict:
    """Handle GraphQL API requests.

    POST /graphql
    Body: {"query": "...", "variables": {...}, "operationName": "..."}

    Args:
        event: API Gateway event with POST body
        context: Lambda context

    Returns:
        API Gateway response with GraphQL result
    """
    start_time = time.time()
    logger.info("graphql_request_received")

    # Authenticate
    is_auth, client_id, auth_error = _authenticate_request(event)
    if not is_auth:
        return auth_error

    # Check rate limit
    is_allowed, rate_result = _check_rate_limit(client_id, event)
    if not is_allowed:
        return rate_result
    
    rate_headers = rate_result.get("rate_limit_headers", {})

    try:
        # Parse request body
        body = json.loads(event.get("body", "{}"))
        query = body.get("query")
        variables = body.get("variables", {})
        operation_name = body.get("operationName")

        if not query:
            return _build_response(400, {
                "errors": [{"message": "query is required"}]
            }, rate_headers)

        logger.info(
            "processing_graphql_query",
            query_length=len(query),
            has_variables=bool(variables),
            operation_name=operation_name,
        )

        # Execute GraphQL query
        graphql_service = _get_graphql_service()
        client_info = _extract_client_info(event)
        
        gql_context = GraphQLContext(
            graph_store=_get_graph_store(),
            client_id=client_id,
            request_id=client_info.get("request_id"),
        )
        
        result = graphql_service.execute(
            query=query,
            variables=variables,
            operation_name=operation_name,
            context=gql_context,
        )

        duration_ms = int((time.time() - start_time) * 1000)
        
        # Log audit event
        audit_logger = _get_audit_logger()
        audit_logger.log(
            audit_logger._events[-1] if audit_logger._events else
            audit_logger.log_search(
                client_id=client_id,
                query_params={"query": query[:100], "operation": operation_name},
                result_count=0,
                request_path=event.get("path"),
                duration_ms=duration_ms,
            )
        )

        logger.info(
            "graphql_query_completed",
            duration_ms=duration_ms,
            has_errors=bool(result.errors),
        )

        return _build_response(200, result.to_dict(), rate_headers)

    except json.JSONDecodeError as e:
        logger.error("graphql_json_parse_error", error=str(e))
        return _build_response(400, {
            "errors": [{"message": f"Invalid JSON: {str(e)}"}]
        }, rate_headers)
    
    except Exception as e:
        logger.error("graphql_failed", error=str(e))
        audit_logger = _get_audit_logger()
        audit_logger.log_error(
            error_message=str(e),
            client_id=client_id,
            status_code=500,
            request_path=event.get("path"),
        )
        return _build_response(500, {
            "errors": [{"message": str(e)}]
        }, rate_headers)
