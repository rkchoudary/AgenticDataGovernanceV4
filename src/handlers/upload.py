"""Upload Lambda handlers for document upload API.

Implements Requirements 1.1-1.7, 4.1-4.5, 5.1-5.5, 6.1-6.5:
- POST /documents/upload - Single document upload
- POST /documents/upload/batch - Batch upload (up to 20 documents)
- GET /documents/upload/{id}/status - Check upload status
- GET /documents/upload/batch/{id}/status - Check batch status
- PUT /documents/{id}/replace - Replace existing document with new version
- GET /documents/{id}/versions - Get version history
- GET /documents/{id}/versions/{version} - Get specific version
"""

import base64
import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

from regulatory_kb.core import get_logger, configure_logging
from regulatory_kb.api import (
    AuthService,
    AuthConfig,
    Permission,
    AuditLogger,
    CloudWatchAuditLogger,
    RateLimiter,
    RateLimitConfig,
)
from regulatory_kb.upload import (
    UploadService,
    StatusTracker,
    UploadMetadata,
    UploadStatus,
    VersionManager,
)
from regulatory_kb.api.webhooks import WebhookService

configure_logging(level="INFO", json_format=True)
logger = get_logger(__name__)

# Global service instances (initialized lazily)
_upload_service: Optional[UploadService] = None
_status_tracker: Optional[StatusTracker] = None
_auth_service: Optional[AuthService] = None
_audit_logger: Optional[AuditLogger] = None
_rate_limiter: Optional[RateLimiter] = None
_version_manager: Optional[VersionManager] = None
_webhook_service: Optional[WebhookService] = None


def _get_upload_service() -> UploadService:
    """Get or create the upload service."""
    global _upload_service
    if _upload_service is None:
        _upload_service = UploadService()
    return _upload_service


def _get_status_tracker() -> StatusTracker:
    """Get or create the status tracker."""
    global _status_tracker
    if _status_tracker is None:
        _status_tracker = StatusTracker()
    return _status_tracker


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
    """Get or create the audit logger.
    
    Uses CloudWatchAuditLogger for production (7-year retention)
    or standard AuditLogger for development.
    """
    global _audit_logger
    if _audit_logger is None:
        # Use CloudWatch logger in production for 7-year retention (Requirement 7.5)
        if os.environ.get("USE_CLOUDWATCH_AUDIT", "true").lower() == "true":
            _audit_logger = CloudWatchAuditLogger(
                log_group_name=os.environ.get("AUDIT_LOG_GROUP", "/regulatory-kb/upload-audit"),
            )
        else:
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


def _get_version_manager() -> VersionManager:
    """Get or create the version manager."""
    global _version_manager
    if _version_manager is None:
        _version_manager = VersionManager()
    return _version_manager


def _get_webhook_service() -> WebhookService:
    """Get or create the webhook service."""
    global _webhook_service
    if _webhook_service is None:
        _webhook_service = WebhookService(
            signing_secret=os.environ.get("WEBHOOK_SIGNING_SECRET", "webhook-secret"),
        )
    return _webhook_service


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
    
    Implements Requirement 7.1:
    - Validates API keys/tokens on all upload requests
    - Returns 401 for missing/invalid authentication
    - Returns 403 for insufficient permissions
    
    Args:
        event: API Gateway event
        required_permission: Optional permission to check
    
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
    
    # First, validate the API key exists and is valid
    result = auth_service.authenticate_request(headers)
    
    if not result.success:
        # Log authentication failure
        audit_logger.log_auth_failure(
            ip_address=client_info["ip_address"],
            user_agent=client_info["user_agent"],
            error_message=result.error,
        )
        # Return 401 for missing or invalid authentication
        return False, None, {
            "statusCode": 401,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "error": result.error or "Authentication required",
                "code": "UNAUTHORIZED",
            }),
        }
    
    # Check permission if required
    if required_permission and result.api_key:
        if not auth_service.check_permission(result.api_key, required_permission):
            # Log permission denied
            audit_logger.log_auth_failure(
                ip_address=client_info["ip_address"],
                user_agent=client_info["user_agent"],
                error_message=f"Permission denied: {required_permission.value}",
                metadata={"client_id": result.user_id},
            )
            # Return 403 for insufficient permissions
            return False, None, {
                "statusCode": 403,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({
                    "error": f"Permission denied: {required_permission.value}",
                    "code": "FORBIDDEN",
                    "required_permission": required_permission.value,
                }),
            }
    
    # Log successful authentication
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
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    }
    if extra_headers:
        headers.update(extra_headers)
    
    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body) if not isinstance(body, str) else body,
    }


def _parse_multipart_form_data(event: dict) -> tuple[Optional[bytes], Optional[str], Optional[dict]]:
    """Parse multipart form data from API Gateway event.
    
    Returns:
        Tuple of (file_content, file_name, metadata_dict)
    """
    content_type = (event.get("headers") or {}).get("Content-Type", "")
    content_type = content_type or (event.get("headers") or {}).get("content-type", "")
    
    body = event.get("body", "")
    is_base64 = event.get("isBase64Encoded", False)
    
    if is_base64:
        body = base64.b64decode(body)
    elif isinstance(body, str):
        body = body.encode("utf-8")
    
    # Handle JSON body (for simpler testing)
    if "application/json" in content_type:
        try:
            data = json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)
            file_content = base64.b64decode(data.get("file", "")) if data.get("file") else None
            file_name = data.get("file_name", "document")
            metadata = data.get("metadata")
            return file_content, file_name, metadata
        except (json.JSONDecodeError, ValueError):
            return None, None, None
    
    # Handle multipart form data
    if "multipart/form-data" in content_type:
        # Extract boundary
        boundary = None
        for part in content_type.split(";"):
            part = part.strip()
            if part.startswith("boundary="):
                boundary = part[9:].strip('"')
                break
        
        if not boundary:
            return None, None, None
        
        return _parse_multipart_body(body, boundary)
    
    return None, None, None


def _parse_multipart_body(body: bytes, boundary: str) -> tuple[Optional[bytes], Optional[str], Optional[dict]]:
    """Parse multipart body content.
    
    Args:
        body: Raw body bytes
        boundary: Multipart boundary string
        
    Returns:
        Tuple of (file_content, file_name, metadata_dict)
    """
    file_content = None
    file_name = None
    metadata = {}
    
    boundary_bytes = f"--{boundary}".encode()
    parts = body.split(boundary_bytes)
    
    for part in parts:
        if not part or part == b"--" or part == b"--\r\n":
            continue
        
        # Split headers from content
        if b"\r\n\r\n" in part:
            headers_section, content = part.split(b"\r\n\r\n", 1)
        elif b"\n\n" in part:
            headers_section, content = part.split(b"\n\n", 1)
        else:
            continue
        
        headers_str = headers_section.decode("utf-8", errors="ignore")
        
        # Parse Content-Disposition
        name = None
        filename = None
        for line in headers_str.split("\n"):
            line = line.strip()
            if line.lower().startswith("content-disposition:"):
                for item in line.split(";"):
                    item = item.strip()
                    if item.startswith("name="):
                        name = item[5:].strip('"')
                    elif item.startswith("filename="):
                        filename = item[9:].strip('"')
        
        # Remove trailing boundary markers
        content = content.rstrip(b"\r\n-")
        
        if name == "file" and filename:
            file_content = content
            file_name = filename
        elif name == "metadata":
            try:
                metadata = json.loads(content.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                pass
        elif name and name != "file":
            # Handle individual metadata fields
            try:
                metadata[name] = content.decode("utf-8").strip()
            except UnicodeDecodeError:
                pass
    
    return file_content, file_name, metadata if metadata else None


def upload_handler(event: dict, context: Any) -> dict:
    """Handle document upload API requests.
    
    Routes:
    - POST /documents/upload - Single document upload
    - POST /documents/upload/batch - Batch upload
    - GET /documents/upload/{id}/status - Get upload status
    - GET /documents/upload/batch/{id}/status - Get batch status
    
    Implements Requirement 7.1:
    - Requires valid API authentication for all upload requests
    - Returns 401 for missing/invalid authentication
    - Returns 403 for insufficient permissions
    
    Args:
        event: API Gateway event
        context: Lambda context
        
    Returns:
        API Gateway response
    """
    start_time = time.time()
    http_method = event.get("httpMethod", "GET")
    path = event.get("path", "")
    path_params = event.get("pathParameters") or {}
    
    logger.info("upload_request_received", method=http_method, path=path)
    
    # Determine required permission based on endpoint
    required_permission = _get_required_permission(http_method, path)
    
    # Authenticate with permission check (Requirement 7.1)
    is_auth, client_id, auth_error = _authenticate_request(event, required_permission)
    if not is_auth:
        return auth_error
    
    # Check rate limit
    is_allowed, rate_result = _check_rate_limit(client_id, event)
    if not is_allowed:
        return rate_result
    
    rate_headers = rate_result.get("rate_limit_headers", {})
    audit_logger = _get_audit_logger()
    
    try:
        # Route based on method and path
        if http_method == "POST":
            if "/batch" in path:
                return _handle_batch_upload(event, client_id, rate_headers)
            else:
                return _handle_single_upload(event, client_id, rate_headers)
        
        elif http_method == "GET":
            if "/batch/" in path and path_params.get("batch_id"):
                return _handle_batch_status(path_params["batch_id"], rate_headers)
            elif path_params.get("upload_id"):
                return _handle_upload_status(path_params["upload_id"], rate_headers)
            else:
                return _build_response(400, {"error": "Invalid request path"}, rate_headers)
        
        else:
            return _build_response(405, {"error": "Method not allowed"}, rate_headers)
    
    except Exception as e:
        logger.error("upload_handler_error", error=str(e))
        audit_logger.log_error(
            error_message=str(e),
            client_id=client_id,
            status_code=500,
            request_path=path,
        )
        return _build_response(500, {"error": str(e)}, rate_headers)


def _get_required_permission(http_method: str, path: str) -> Optional[Permission]:
    """Determine required permission based on HTTP method and path.
    
    Implements Requirement 7.1:
    - Maps endpoints to required permissions
    
    Args:
        http_method: HTTP method (GET, POST, PUT, etc.)
        path: Request path
        
    Returns:
        Required Permission or None
    """
    if http_method == "POST":
        if "/batch" in path:
            return Permission.UPLOAD_BATCH
        return Permission.UPLOAD_DOCUMENTS
    elif http_method == "PUT" and "/replace" in path:
        return Permission.REPLACE_DOCUMENTS
    elif http_method == "GET":
        if "/status" in path or "/versions" in path:
            return Permission.VIEW_UPLOAD_STATUS
        if "/audit" in path:
            return Permission.VIEW_AUDIT_LOGS
    return None


def _handle_single_upload(event: dict, client_id: str, rate_headers: dict) -> dict:
    """Handle single document upload.
    
    Implements Requirements 1.1-1.7, 7.2:
    - Validates file type and size
    - Stores file in S3
    - Queues for processing
    - Returns upload_id
    - Logs upload action with uploader identity
    """
    audit_logger = _get_audit_logger()
    upload_service = _get_upload_service()
    client_info = _extract_client_info(event)
    
    # Parse multipart form data
    file_content, file_name, metadata_dict = _parse_multipart_form_data(event)
    
    if not file_content or not file_name:
        return _build_response(
            400,
            {"error": "Missing file in request. Use multipart/form-data with 'file' field."},
            rate_headers,
        )
    
    # Convert metadata dict to model
    metadata = None
    if metadata_dict:
        try:
            metadata = UploadMetadata(**metadata_dict)
        except Exception as e:
            return _build_response(
                400,
                {"error": f"Invalid metadata: {str(e)}"},
                rate_headers,
            )
    
    # Upload document
    response, error_code = upload_service.upload_document(
        file_content=file_content,
        file_name=file_name,
        uploader_id=client_id,
        metadata=metadata,
    )
    
    if error_code:
        # Log upload failure (Requirement 7.2)
        audit_logger.log_upload_failed(
            client_id=client_id,
            upload_id=response.upload_id or "unknown",
            file_name=file_name,
            error_message=response.message,
            error_stage="validation",
            metadata={"error_code": error_code},
        )
        return _build_response(error_code, {"error": response.message}, rate_headers)
    
    # Determine file type from extension
    file_type = "pdf" if file_name.lower().endswith(".pdf") else "html"
    
    # Log upload initiated (Requirement 7.2)
    audit_logger.log_upload_initiated(
        client_id=client_id,
        upload_id=response.upload_id,
        file_name=file_name,
        file_size=len(file_content),
        file_type=file_type,
        ip_address=client_info.get("ip_address"),
        user_agent=client_info.get("user_agent"),
        metadata=metadata_dict,
    )
    
    return _build_response(
        200,
        {
            "upload_id": response.upload_id,
            "status": response.status.value,
            "message": response.message,
            "estimated_processing_time": response.estimated_processing_time,
        },
        rate_headers,
    )


def _handle_batch_upload(event: dict, client_id: str, rate_headers: dict) -> dict:
    """Handle batch document upload.
    
    Implements Requirements 5.1-5.5, 7.2:
    - Accepts up to 20 documents
    - Validates each independently
    - Returns batch_id and individual statuses
    - Logs batch upload action with uploader identity
    """
    audit_logger = _get_audit_logger()
    upload_service = _get_upload_service()
    client_info = _extract_client_info(event)
    start_time = time.time()
    
    # Parse JSON body for batch upload
    try:
        body = event.get("body", "{}")
        if event.get("isBase64Encoded"):
            body = base64.b64decode(body).decode("utf-8")
        data = json.loads(body)
    except (json.JSONDecodeError, ValueError) as e:
        return _build_response(
            400,
            {"error": f"Invalid JSON body: {str(e)}"},
            rate_headers,
        )
    
    documents = data.get("documents", [])
    if not documents:
        return _build_response(
            400,
            {"error": "Missing 'documents' array in request body"},
            rate_headers,
        )
    
    # Convert base64 file content
    for doc in documents:
        if "file" in doc:
            try:
                doc["file_content"] = base64.b64decode(doc["file"])
            except Exception:
                doc["file_content"] = b""
    
    # Upload batch
    response, error_code = upload_service.upload_batch(
        documents=documents,
        uploader_id=client_id,
    )
    
    processing_time_ms = int((time.time() - start_time) * 1000)
    
    # Log batch upload initiated (Requirement 7.2)
    audit_logger.log_batch_upload_initiated(
        client_id=client_id,
        batch_id=response.batch_id,
        document_count=len(documents),
        ip_address=client_info.get("ip_address"),
        user_agent=client_info.get("user_agent"),
    )
    
    # Log batch upload completed (Requirement 7.2)
    audit_logger.log_batch_upload_completed(
        client_id=client_id,
        batch_id=response.batch_id,
        total_documents=response.total_documents,
        accepted=response.accepted,
        rejected=response.rejected,
        processing_time_ms=processing_time_ms,
    )
    
    if error_code:
        return _build_response(
            error_code,
            {
                "error": "Batch upload failed",
                "batch_id": response.batch_id,
                "documents": [d.model_dump() for d in response.documents],
            },
            rate_headers,
        )
    
    return _build_response(
        200,
        {
            "batch_id": response.batch_id,
            "total_documents": response.total_documents,
            "accepted": response.accepted,
            "rejected": response.rejected,
            "documents": [d.model_dump() for d in response.documents],
        },
        rate_headers,
    )


def _handle_upload_status(upload_id: str, rate_headers: dict) -> dict:
    """Handle upload status query.
    
    Implements Requirements 4.2-4.5:
    - Returns status (pending, processing, completed, failed)
    - Error details for failed
    - KB document ID for completed
    - 404 for non-existent
    """
    status_tracker = _get_status_tracker()
    
    status = status_tracker.get_status(upload_id)
    
    if not status:
        return _build_response(
            404,
            {"error": f"Document not found with ID: {upload_id}"},
            rate_headers,
        )
    
    return _build_response(
        200,
        {
            "upload_id": status.upload_id,
            "status": status.status.value,
            "created_at": status.created_at.isoformat(),
            "updated_at": status.updated_at.isoformat() if status.updated_at else None,
            "completed_at": status.completed_at.isoformat() if status.completed_at else None,
            "kb_document_id": status.kb_document_id,
            "metadata": status.metadata,
            "error_details": status.error_details,
            "processing_stage": status.processing_stage,
        },
        rate_headers,
    )


def _handle_batch_status(batch_id: str, rate_headers: dict) -> dict:
    """Handle batch status query.
    
    Implements Requirement 5.5:
    - Aggregate batch status
    - Individual document statuses
    """
    status_tracker = _get_status_tracker()
    
    status = status_tracker.get_batch_status(batch_id)
    
    if not status:
        return _build_response(
            404,
            {"error": f"Batch not found with ID: {batch_id}"},
            rate_headers,
        )
    
    return _build_response(
        200,
        {
            "batch_id": status.batch_id,
            "total_documents": status.total_documents,
            "pending": status.pending,
            "processing": status.processing,
            "completed": status.completed,
            "failed": status.failed,
            "documents": [
                {
                    "upload_id": d.upload_id,
                    "status": d.status.value,
                    "created_at": d.created_at.isoformat(),
                    "kb_document_id": d.kb_document_id,
                    "error_details": d.error_details,
                }
                for d in status.documents
            ],
        },
        rate_headers,
    )


def version_handler(event: dict, context: Any) -> dict:
    """Handle document version management API requests.
    
    Routes:
    - PUT /documents/{id}/replace - Replace existing document with new version
    - GET /documents/{id}/versions - Get version history
    - GET /documents/{id}/versions/{version} - Get specific version
    
    Implements Requirements 6.1-6.5, 7.1:
    - Document replacement with version history
    - Archive previous versions in S3
    - Preserve relationships from previous version
    - Query previous versions
    - Webhook notifications for document replacement
    - Requires valid API authentication
    
    Args:
        event: API Gateway event
        context: Lambda context
        
    Returns:
        API Gateway response
    """
    http_method = event.get("httpMethod", "GET")
    path = event.get("path", "")
    path_params = event.get("pathParameters") or {}
    
    logger.info("version_request_received", method=http_method, path=path)
    
    # Determine required permission based on endpoint
    required_permission = _get_required_permission(http_method, path)
    
    # Authenticate with permission check (Requirement 7.1)
    is_auth, client_id, auth_error = _authenticate_request(event, required_permission)
    if not is_auth:
        return auth_error
    
    # Check rate limit
    is_allowed, rate_result = _check_rate_limit(client_id, event)
    if not is_allowed:
        return rate_result
    
    rate_headers = rate_result.get("rate_limit_headers", {})
    audit_logger = _get_audit_logger()
    
    try:
        document_id = path_params.get("document_id") or path_params.get("id")
        
        if not document_id:
            return _build_response(400, {"error": "Missing document ID"}, rate_headers)
        
        # Route based on method and path
        if http_method == "PUT" and "/replace" in path:
            return _handle_document_replace(event, document_id, client_id, rate_headers)
        
        elif http_method == "GET":
            version_number = path_params.get("version")
            if version_number:
                return _handle_get_version(document_id, int(version_number), rate_headers)
            else:
                return _handle_get_version_history(document_id, rate_headers)
        
        else:
            return _build_response(405, {"error": "Method not allowed"}, rate_headers)
    
    except Exception as e:
        logger.error("version_handler_error", error=str(e))
        audit_logger.log_error(
            error_message=str(e),
            client_id=client_id,
            status_code=500,
            request_path=path,
        )
        return _build_response(500, {"error": str(e)}, rate_headers)


def _handle_document_replace(
    event: dict,
    document_id: str,
    client_id: str,
    rate_headers: dict,
) -> dict:
    """Handle document replacement request.
    
    Implements Requirements 6.1-6.4, 7.3:
    - Detect matching documents by title and regulator
    - Archive previous version in S3
    - Preserve relationships from previous version
    - Create new version record
    - Log modification with before/after states
    
    Args:
        event: API Gateway event
        document_id: ID of document to replace
        client_id: Client/uploader ID
        rate_headers: Rate limit headers
        
    Returns:
        API Gateway response
    """
    audit_logger = _get_audit_logger()
    version_manager = _get_version_manager()
    webhook_service = _get_webhook_service()
    client_info = _extract_client_info(event)
    
    # Parse request body
    file_content, file_name, metadata_dict = _parse_multipart_form_data(event)
    
    if not file_content or not file_name:
        return _build_response(
            400,
            {"error": "Missing file in request. Use multipart/form-data with 'file' field."},
            rate_headers,
        )
    
    # Extract metadata
    title = metadata_dict.get("title") if metadata_dict else None
    regulator = metadata_dict.get("regulator") if metadata_dict else None
    
    # Get before state for audit logging (Requirement 7.3)
    before_state = None
    existing_version = version_manager.get_version_history(document_id)
    if existing_version:
        latest = existing_version[0] if existing_version else None
        if latest:
            before_state = {
                "document_id": document_id,
                "version_number": latest.version_number,
                "title": latest.title,
                "regulator": latest.regulator,
                "created_at": latest.created_at.isoformat() if latest.created_at else None,
            }
    
    # Perform replacement
    result = version_manager.replace_document(
        existing_document_id=document_id,
        new_file_content=file_content,
        new_file_name=file_name,
        uploader_id=client_id,
        title=title,
        regulator=regulator,
        metadata=metadata_dict,
        preserve_relationships=True,
    )
    
    if not result.success:
        return _build_response(
            400 if "not found" in (result.error_message or "").lower() else 500,
            {"error": result.error_message},
            rate_headers,
        )
    
    # Build after state for audit logging (Requirement 7.3)
    after_state = {
        "document_id": result.new_document_id,
        "version_number": result.version_number,
        "title": title,
        "regulator": regulator,
        "replaced_at": datetime.now(timezone.utc).isoformat(),
    }
    
    # Log the replacement with before/after states (Requirement 7.3)
    audit_logger.log_document_replaced(
        client_id=client_id,
        new_document_id=result.new_document_id,
        previous_document_id=result.previous_version_id,
        title=title or "",
        version_number=result.version_number,
        before_state=before_state,
        after_state=after_state,
        ip_address=client_info.get("ip_address"),
    )
    
    # Trigger webhook notification (Requirement 6.5)
    try:
        webhook_service.dispatch_document_replaced(
            new_document_id=result.new_document_id,
            previous_document_id=result.previous_version_id,
            title=title or "",
            regulator=regulator,
            version_number=result.version_number,
            uploader_id=client_id,
        )
    except Exception as e:
        logger.warning("webhook_dispatch_failed", error=str(e))
    
    return _build_response(
        200,
        {
            "new_document_id": result.new_document_id,
            "previous_version_id": result.previous_version_id,
            "version_number": result.version_number,
            "replaced_at": datetime.now(timezone.utc).isoformat(),
            "relationships_preserved": result.relationships_preserved,
        },
        rate_headers,
    )


def _handle_get_version_history(document_id: str, rate_headers: dict) -> dict:
    """Handle version history query.
    
    Implements Requirement 6.4:
    - Support querying previous versions
    
    Args:
        document_id: Document ID to get history for
        rate_headers: Rate limit headers
        
    Returns:
        API Gateway response
    """
    version_manager = _get_version_manager()
    
    versions = version_manager.get_version_history(document_id)
    
    if not versions:
        return _build_response(
            404,
            {"error": f"No version history found for document: {document_id}"},
            rate_headers,
        )
    
    return _build_response(
        200,
        {
            "document_id": document_id,
            "versions": [
                {
                    "version_number": v.version_number,
                    "created_at": v.created_at.isoformat(),
                    "title": v.title,
                    "regulator": v.regulator,
                    "uploader_id": v.uploader_id,
                    "previous_version_id": v.previous_version_id,
                }
                for v in versions
            ],
        },
        rate_headers,
    )


def _handle_get_version(
    document_id: str,
    version_number: int,
    rate_headers: dict,
) -> dict:
    """Handle specific version query.
    
    Implements Requirement 6.4:
    - Access previous versions
    
    Args:
        document_id: Document ID
        version_number: Version number to retrieve
        rate_headers: Rate limit headers
        
    Returns:
        API Gateway response
    """
    version_manager = _get_version_manager()
    
    version = version_manager.get_version(document_id, version_number)
    
    if not version:
        return _build_response(
            404,
            {"error": f"Version {version_number} not found for document: {document_id}"},
            rate_headers,
        )
    
    return _build_response(
        200,
        {
            "document_id": version.document_id,
            "version_number": version.version_number,
            "s3_key": version.s3_key,
            "created_at": version.created_at.isoformat(),
            "title": version.title,
            "regulator": version.regulator,
            "uploader_id": version.uploader_id,
            "metadata": version.metadata,
            "previous_version_id": version.previous_version_id,
        },
        rate_headers,
    )


def find_matching_handler(event: dict, context: Any) -> dict:
    """Handle find matching documents request.
    
    Implements Requirements 6.1, 7.1:
    - Detect matching documents by title and regulator
    - Requires valid API authentication
    
    Args:
        event: API Gateway event
        context: Lambda context
        
    Returns:
        API Gateway response with matching documents
    """
    http_method = event.get("httpMethod", "GET")
    path = event.get("path", "")
    
    logger.info("find_matching_request_received", method=http_method)
    
    # Authenticate with permission check (Requirement 7.1)
    is_auth, client_id, auth_error = _authenticate_request(event, Permission.VIEW_UPLOAD_STATUS)
    if not is_auth:
        return auth_error
    
    # Check rate limit
    is_allowed, rate_result = _check_rate_limit(client_id, event)
    if not is_allowed:
        return rate_result
    
    rate_headers = rate_result.get("rate_limit_headers", {})
    
    try:
        # Parse query parameters
        query_params = event.get("queryStringParameters") or {}
        title = query_params.get("title")
        regulator = query_params.get("regulator")
        
        if not title or not regulator:
            return _build_response(
                400,
                {"error": "Both 'title' and 'regulator' query parameters are required"},
                rate_headers,
            )
        
        version_manager = _get_version_manager()
        matches = version_manager.find_matching_documents(title, regulator)
        
        return _build_response(
            200,
            {
                "title": title,
                "regulator": regulator,
                "matches": [m.to_dict() for m in matches],
                "has_matches": len(matches) > 0,
            },
            rate_headers,
        )
    
    except Exception as e:
        logger.error("find_matching_handler_error", error=str(e))
        return _build_response(500, {"error": str(e)}, rate_headers)


def audit_handler(event: dict, context: Any) -> dict:
    """Handle audit log query API requests.
    
    Routes:
    - GET /audit/logs - Query audit logs with filtering and pagination
    
    Implements Requirement 7.4:
    - Support filtering by uploader, date range, document ID
    - Paginate results for large log sets
    
    Args:
        event: API Gateway event
        context: Lambda context
        
    Returns:
        API Gateway response
    """
    http_method = event.get("httpMethod", "GET")
    path = event.get("path", "")
    
    logger.info("audit_request_received", method=http_method, path=path)
    
    # Authenticate with permission check (Requirement 7.1)
    is_auth, client_id, auth_error = _authenticate_request(event, Permission.VIEW_AUDIT_LOGS)
    if not is_auth:
        return auth_error
    
    # Check rate limit
    is_allowed, rate_result = _check_rate_limit(client_id, event)
    if not is_allowed:
        return rate_result
    
    rate_headers = rate_result.get("rate_limit_headers", {})
    
    try:
        if http_method == "GET":
            return _handle_audit_query(event, client_id, rate_headers)
        else:
            return _build_response(405, {"error": "Method not allowed"}, rate_headers)
    
    except Exception as e:
        logger.error("audit_handler_error", error=str(e))
        return _build_response(500, {"error": str(e)}, rate_headers)


def _handle_audit_query(event: dict, client_id: str, rate_headers: dict) -> dict:
    """Handle audit log query request.
    
    Implements Requirement 7.4:
    - Support filtering by uploader, date range, document ID
    - Paginate results for large log sets
    
    Query Parameters:
    - uploader_id: Filter by uploader/client ID
    - document_id: Filter by document/resource ID
    - event_type: Filter by event type (comma-separated for multiple)
    - start_date: Filter events after this date (ISO format)
    - end_date: Filter events before this date (ISO format)
    - limit: Maximum events to return (default 100, max 1000)
    - offset: Number of events to skip for pagination
    
    Args:
        event: API Gateway event
        client_id: Authenticated client ID
        rate_headers: Rate limit headers
        
    Returns:
        API Gateway response with audit events
    """
    from regulatory_kb.api.audit import AuditEventType
    
    audit_logger = _get_audit_logger()
    query_params = event.get("queryStringParameters") or {}
    
    # Parse query parameters
    uploader_id = query_params.get("uploader_id")
    document_id = query_params.get("document_id")
    event_type_str = query_params.get("event_type")
    start_date_str = query_params.get("start_date")
    end_date_str = query_params.get("end_date")
    
    # Parse pagination parameters
    try:
        limit = min(int(query_params.get("limit", "100")), 1000)
        offset = int(query_params.get("offset", "0"))
    except ValueError:
        return _build_response(
            400,
            {"error": "Invalid limit or offset parameter"},
            rate_headers,
        )
    
    # Parse event types
    event_types = None
    if event_type_str:
        try:
            event_types = [
                AuditEventType(et.strip())
                for et in event_type_str.split(",")
            ]
        except ValueError as e:
            return _build_response(
                400,
                {"error": f"Invalid event_type: {str(e)}"},
                rate_headers,
            )
    
    # Parse dates
    start_date = None
    end_date = None
    try:
        if start_date_str:
            start_date = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
        if end_date_str:
            end_date = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
    except ValueError as e:
        return _build_response(
            400,
            {"error": f"Invalid date format: {str(e)}. Use ISO format (YYYY-MM-DDTHH:MM:SSZ)"},
            rate_headers,
        )
    
    # Query events
    events, total_count = audit_logger.query_events(
        uploader_id=uploader_id,
        document_id=document_id,
        event_types=event_types,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )
    
    # Calculate pagination info
    has_more = (offset + len(events)) < total_count
    next_offset = offset + limit if has_more else None
    
    return _build_response(
        200,
        {
            "events": [e.to_dict() for e in events],
            "pagination": {
                "total_count": total_count,
                "limit": limit,
                "offset": offset,
                "has_more": has_more,
                "next_offset": next_offset,
            },
            "filters": {
                "uploader_id": uploader_id,
                "document_id": document_id,
                "event_types": [et.value for et in event_types] if event_types else None,
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
            },
        },
        rate_headers,
    )
