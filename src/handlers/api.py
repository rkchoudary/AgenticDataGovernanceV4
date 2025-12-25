"""API Lambda handlers for document search and natural language queries.

Implements Requirements 13.1-13.4, 13.6:
- REST API endpoints for searching by regulator
- Endpoints for searching by regulatory category
- Endpoints for searching by form type
- Structured responses with document content, metadata, and relationships
- Authentication, rate limiting, and audit logging
"""

import json
import os
import time
from typing import Any, Optional

from regulatory_kb.core import get_logger, configure_logging
from regulatory_kb.agent import (
    BedrockAgentService,
    AgentConfig,
    QueryProcessor,
    ToolRegistry,
)
from regulatory_kb.api import (
    DocumentSearchService,
    SearchFilters,
    AuthService,
    AuthConfig,
    Permission,
    AuditLogger,
    AuditEventType,
    RateLimiter,
    RateLimitConfig,
)
from regulatory_kb.models.document import DocumentCategory, DocumentType
from regulatory_kb.storage.graph_store import FalkorDBStore, GraphStoreConfig
from regulatory_kb.storage.vector_search import VectorSearchService

configure_logging(level="INFO", json_format=True)
logger = get_logger(__name__)

# Global service instances (initialized lazily)
_agent_service: Optional[BedrockAgentService] = None
_query_processor: Optional[QueryProcessor] = None
_search_service: Optional[DocumentSearchService] = None
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


def _get_search_service() -> DocumentSearchService:
    """Get or create the document search service."""
    global _search_service
    
    if _search_service is None:
        _search_service = DocumentSearchService(_get_graph_store())
    
    return _search_service


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


def _get_agent_service() -> BedrockAgentService:
    """Get or create the Bedrock Agent service."""
    global _agent_service
    
    if _agent_service is None:
        config = AgentConfig(
            region=os.environ.get("AWS_REGION", "us-east-1"),
            model_id=os.environ.get(
                "BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0"
            ),
            session_timeout_hours=int(os.environ.get("SESSION_TIMEOUT_HOURS", "8")),
        )
        
        store = _get_graph_store()
        vector_service = VectorSearchService(store)
        tool_registry = ToolRegistry.create_default_registry(store, vector_service)
        
        _agent_service = BedrockAgentService(config, tool_registry)
    
    return _agent_service


def _get_query_processor() -> QueryProcessor:
    """Get or create the query processor."""
    global _query_processor
    
    if _query_processor is None:
        agent_service = _get_agent_service()
        _query_processor = QueryProcessor(agent_service.tool_registry)
    
    return _query_processor


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


def _authenticate_request(
    event: dict,
    required_permission: Optional[Permission] = None,
) -> tuple[bool, Optional[str], dict]:
    """Authenticate an API request.
    
    Returns:
        Tuple of (is_authenticated, client_id, error_response or empty dict)
    """
    headers = event.get("headers") or {}
    auth_service = _get_auth_service()
    audit_logger = _get_audit_logger()
    client_info = _extract_client_info(event)
    
    # Skip auth if disabled (for development)
    if os.environ.get("DISABLE_AUTH", "false").lower() == "true":
        return True, "anonymous", {}
    
    result = auth_service.authenticate_request(headers, required_permission)
    
    if not result.success:
        audit_logger.log_auth_failure(
            ip_address=client_info["ip_address"],
            user_agent=client_info["user_agent"],
            error_message=result.error,
        )
        return False, None, {
            "statusCode": 401,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": result.error}),
        }
    
    audit_logger.log_auth_success(
        client_id=result.user_id or "unknown",
        ip_address=client_info["ip_address"],
        user_agent=client_info["user_agent"],
    )
    
    return True, result.user_id, {}


def _check_rate_limit(client_id: str, event: dict) -> tuple[bool, dict]:
    """Check rate limit for a client.
    
    Returns:
        Tuple of (is_allowed, error_response or empty dict with headers)
    """
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
                "error": "Rate limit exceeded",
                "retry_after": result.retry_after_seconds,
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
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    }
    if extra_headers:
        headers.update(extra_headers)
    
    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body) if not isinstance(body, str) else body,
    }


def search_handler(event: dict, context: Any) -> dict:
    """Handle document search API requests.

    Supports:
    - GET /documents - List/search all documents
    - GET /documents/{id} - Get document by ID
    - GET /regulators/{regulator}/documents - Get documents by regulator
    - GET /search?q={query} - Search documents
    - GET /relationships/{document-id} - Get document relationships

    Args:
        event: API Gateway event
        context: Lambda context

    Returns:
        API Gateway response
    """
    start_time = time.time()
    logger.info("search_request_received", path=event.get("path"))

    # Authenticate
    is_auth, client_id, auth_error = _authenticate_request(
        event, Permission.SEARCH_DOCUMENTS
    )
    if not is_auth:
        return auth_error

    # Check rate limit
    is_allowed, rate_result = _check_rate_limit(client_id, event)
    if not is_allowed:
        return rate_result
    
    rate_headers = rate_result.get("rate_limit_headers", {})

    try:
        # Extract parameters
        query_params = event.get("queryStringParameters") or {}
        path_params = event.get("pathParameters") or {}
        path = event.get("path", "")
        
        audit_logger = _get_audit_logger()
        search_service = _get_search_service()

        # Route based on path
        if path_params.get("id"):
            # GET /documents/{id}
            document_id = path_params["id"]
            result = search_service.get_document_by_id(document_id)
            
            if not result:
                return _build_response(404, {"error": "Document not found"}, rate_headers)
            
            duration_ms = int((time.time() - start_time) * 1000)
            audit_logger.log_document_access(
                client_id=client_id,
                document_id=document_id,
                action="view",
                request_path=path,
                duration_ms=duration_ms,
            )
            
            return _build_response(200, {
                "document": {
                    "id": result.id,
                    "title": result.title,
                    "document_type": result.document_type,
                    "regulator_id": result.regulator_id,
                    "regulator_name": result.regulator_name,
                    "source_url": result.source_url,
                    "categories": result.categories,
                    "effective_date": result.effective_date,
                    "version": result.version,
                    "form_number": result.form_number,
                    "cfr_section": result.cfr_section,
                    "relationships": result.relationships,
                }
            }, rate_headers)
        
        elif path_params.get("document-id"):
            # GET /relationships/{document-id}
            document_id = path_params["document-id"]
            relationships = search_service.get_document_relationships(document_id)
            
            duration_ms = int((time.time() - start_time) * 1000)
            audit_logger.log_document_access(
                client_id=client_id,
                document_id=document_id,
                action="view_relationships",
                request_path=path,
                duration_ms=duration_ms,
            )
            
            return _build_response(200, {
                "document_id": document_id,
                "relationships": relationships,
            }, rate_headers)
        
        elif path_params.get("regulator"):
            # GET /regulators/{regulator}/documents
            regulator = path_params["regulator"]
            page = int(query_params.get("page", "1"))
            page_size = int(query_params.get("page_size", "20"))
            
            result = search_service.get_documents_by_regulator(
                regulator=regulator,
                page=page,
                page_size=page_size,
            )
            
            duration_ms = int((time.time() - start_time) * 1000)
            audit_logger.log_search(
                client_id=client_id,
                query_params={"regulator": regulator, "page": page},
                result_count=result.total_count,
                request_path=path,
                duration_ms=duration_ms,
            )
            
            return _build_response(200, _format_search_result(result), rate_headers)
        
        else:
            # GET /documents or GET /search
            filters = _parse_search_filters(query_params)
            result = search_service.search(filters)
            
            duration_ms = int((time.time() - start_time) * 1000)
            audit_logger.log_search(
                client_id=client_id,
                query_params=filters.to_dict(),
                result_count=result.total_count,
                request_path=path,
                duration_ms=duration_ms,
            )
            
            return _build_response(200, _format_search_result(result), rate_headers)

    except Exception as e:
        logger.error("search_failed", error=str(e))
        audit_logger = _get_audit_logger()
        audit_logger.log_error(
            error_message=str(e),
            client_id=client_id,
            status_code=500,
            request_path=event.get("path"),
        )
        return _build_response(500, {"error": str(e)}, rate_headers)


def _parse_search_filters(query_params: dict) -> SearchFilters:
    """Parse search filters from query parameters."""
    category = None
    if query_params.get("category"):
        try:
            category = DocumentCategory(query_params["category"])
        except ValueError:
            pass
    
    doc_type = None
    if query_params.get("type"):
        try:
            doc_type = DocumentType(query_params["type"])
        except ValueError:
            pass
    
    return SearchFilters(
        query=query_params.get("q"),
        regulator_abbreviation=query_params.get("regulator"),
        category=category,
        document_type=doc_type,
        form_number=query_params.get("form"),
        cfr_section=query_params.get("cfr"),
        page=int(query_params.get("page", "1")),
        page_size=int(query_params.get("page_size", "20")),
    )


def _format_search_result(result) -> dict:
    """Format search result for API response."""
    return {
        "documents": [
            {
                "id": doc.id,
                "title": doc.title,
                "document_type": doc.document_type,
                "regulator_id": doc.regulator_id,
                "regulator_name": doc.regulator_name,
                "categories": doc.categories,
                "effective_date": doc.effective_date,
                "version": doc.version,
                "form_number": doc.form_number,
                "relevance_score": doc.relevance_score,
            }
            for doc in result.documents
        ],
        "pagination": {
            "total": result.total_count,
            "page": result.page,
            "page_size": result.page_size,
            "has_more": result.has_more,
        },
        "filters_applied": result.filters_applied,
    }


def query_handler(event: dict, context: Any) -> dict:
    """Handle natural language query API requests.

    POST /query/natural-language
    Body: {"question": "...", "session_id": "...", "use_agent": true}

    Args:
        event: API Gateway event with POST body
        context: Lambda context

    Returns:
        API Gateway response
    """
    start_time = time.time()
    logger.info("nl_query_request_received")

    # Authenticate
    is_auth, client_id, auth_error = _authenticate_request(
        event, Permission.QUERY_NL
    )
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
        question = body.get("question")
        session_id = body.get("session_id")
        use_agent = body.get("use_agent", True)

        if not question:
            return _build_response(400, {"error": "question is required"}, rate_headers)

        logger.info(
            "processing_nl_query",
            question=question[:100],
            session_id=session_id,
            use_agent=use_agent,
        )

        audit_logger = _get_audit_logger()

        if use_agent:
            # Use Bedrock Agent for full conversational AI
            agent_service = _get_agent_service()
            response = agent_service.query(
                question=question,
                session_id=session_id,
            )
            
            duration_ms = int((time.time() - start_time) * 1000)
            audit_logger.log_nl_query(
                client_id=client_id,
                query=question,
                has_citations=len(response.citations) > 0,
                confidence=response.confidence,
                request_path=event.get("path"),
                duration_ms=duration_ms,
            )
            
            return _build_response(200, {
                "answer": response.text,
                "citations": [
                    {
                        "document_id": c.document_id,
                        "document_title": c.document_title,
                        "section": c.section,
                        "excerpt": c.excerpt,
                    }
                    for c in response.citations
                ],
                "confidence": response.confidence,
                "is_uncertain": response.is_uncertain,
                "uncertainty_reason": response.uncertainty_reason,
                "tool_calls": response.tool_calls,
            }, rate_headers)
        else:
            # Use query processor for lightweight processing
            processor = _get_query_processor()
            result = processor.process_query(
                query=question,
                session_id=session_id,
            )
            
            duration_ms = int((time.time() - start_time) * 1000)
            audit_logger.log_nl_query(
                client_id=client_id,
                query=question,
                has_citations=len(result.citations) > 0,
                confidence=result.confidence,
                request_path=event.get("path"),
                duration_ms=duration_ms,
            )
            
            return _build_response(200, {
                "answer": result.answer,
                "citations": [
                    {
                        "document_id": c.document_id,
                        "document_title": c.document_title,
                        "section": c.section,
                        "excerpt": c.excerpt,
                    }
                    for c in result.citations
                ],
                "confidence": result.confidence,
                "is_uncertain": result.is_uncertain,
                "uncertainty_reason": result.uncertainty_reason,
                "intent": result.intent.value,
                "topic": result.topic.value,
                "follow_up_suggestions": result.follow_up_suggestions,
            }, rate_headers)

    except Exception as e:
        logger.error("nl_query_failed", error=str(e))
        audit_logger = _get_audit_logger()
        audit_logger.log_error(
            error_message=str(e),
            client_id=client_id,
            status_code=500,
            request_path=event.get("path"),
        )
        return _build_response(500, {"error": str(e)}, rate_headers)
