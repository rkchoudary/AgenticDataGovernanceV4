"""Audit logging service for API access tracking.

Implements Requirements 13.6:
- Audit logging for API access
"""

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class AuditEventType(str, Enum):
    """Types of audit events."""
    
    # Authentication events
    AUTH_SUCCESS = "auth.success"
    AUTH_FAILURE = "auth.failure"
    AUTH_KEY_CREATED = "auth.key_created"
    AUTH_KEY_REVOKED = "auth.key_revoked"
    
    # Document access events
    DOCUMENT_VIEW = "document.view"
    DOCUMENT_SEARCH = "document.search"
    DOCUMENT_DOWNLOAD = "document.download"
    
    # Query events
    QUERY_NL = "query.natural_language"
    QUERY_GRAPHQL = "query.graphql"
    
    # Relationship events
    RELATIONSHIP_VIEW = "relationship.view"
    RELATIONSHIP_TRAVERSE = "relationship.traverse"
    
    # Admin events
    ADMIN_CONFIG_CHANGE = "admin.config_change"
    ADMIN_USER_CHANGE = "admin.user_change"
    
    # Rate limit events
    RATE_LIMIT_EXCEEDED = "rate_limit.exceeded"
    
    # Error events
    ERROR_SERVER = "error.server"
    ERROR_CLIENT = "error.client"
    
    # Upload events (Implements Requirements 7.2, 7.3)
    UPLOAD_INITIATED = "upload.initiated"
    UPLOAD_COMPLETED = "upload.completed"
    UPLOAD_FAILED = "upload.failed"
    UPLOAD_BATCH_INITIATED = "upload.batch.initiated"
    UPLOAD_BATCH_COMPLETED = "upload.batch.completed"
    
    # Document modification events (Implements Requirement 7.3)
    DOCUMENT_REPLACED = "document.replaced"
    DOCUMENT_VERSION_CREATED = "document.version.created"
    DOCUMENT_METADATA_UPDATED = "document.metadata.updated"
    
    # Status events
    STATUS_QUERY = "status.query"
    BATCH_STATUS_QUERY = "batch_status.query"


@dataclass
class AuditEvent:
    """An audit log event."""
    
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_type: AuditEventType = AuditEventType.DOCUMENT_VIEW
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    client_id: Optional[str] = None
    user_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    request_id: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    action: Optional[str] = None
    status: str = "success"
    status_code: int = 200
    duration_ms: Optional[int] = None
    request_path: Optional[str] = None
    request_method: Optional[str] = None
    query_params: dict[str, Any] = field(default_factory=dict)
    response_size: Optional[int] = None
    error_message: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for logging/storage."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "timestamp": self.timestamp.isoformat(),
            "client_id": self.client_id,
            "user_id": self.user_id,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "request_id": self.request_id,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "action": self.action,
            "status": self.status,
            "status_code": self.status_code,
            "duration_ms": self.duration_ms,
            "request_path": self.request_path,
            "request_method": self.request_method,
            "query_params": self.query_params,
            "response_size": self.response_size,
            "error_message": self.error_message,
            "metadata": self.metadata,
        }
    
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())


class AuditLogger:
    """Audit logger for tracking API access and operations.
    
    Provides:
    - Structured audit logging
    - Event categorization
    - Request/response tracking
    - Security event logging
    """
    
    def __init__(self):
        """Initialize the audit logger."""
        self._events: list[AuditEvent] = []
        self._max_events: int = 10000  # In-memory limit
    
    def log(self, event: AuditEvent) -> None:
        """Log an audit event.
        
        Args:
            event: The audit event to log.
        """
        # Store in memory (for testing/development)
        self._events.append(event)
        if len(self._events) > self._max_events:
            self._events = self._events[-self._max_events:]
        
        # Log to structured logger
        logger.info(
            "audit_event",
            event_type=event.event_type.value,
            client_id=event.client_id,
            resource_type=event.resource_type,
            resource_id=event.resource_id,
            status=event.status,
            status_code=event.status_code,
            duration_ms=event.duration_ms,
        )
    
    def log_auth_success(
        self,
        client_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log a successful authentication.
        
        Args:
            client_id: Client identifier.
            ip_address: Client IP address.
            user_agent: Client user agent.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.AUTH_SUCCESS,
            client_id=client_id,
            ip_address=ip_address,
            user_agent=user_agent,
            action="authenticate",
            status="success",
            metadata=metadata or {},
        )
        self.log(event)
        return event
    
    def log_auth_failure(
        self,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        error_message: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log a failed authentication.
        
        Args:
            ip_address: Client IP address.
            user_agent: Client user agent.
            error_message: Error message.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.AUTH_FAILURE,
            ip_address=ip_address,
            user_agent=user_agent,
            action="authenticate",
            status="failure",
            status_code=401,
            error_message=error_message,
            metadata=metadata or {},
        )
        self.log(event)
        return event
    
    def log_document_access(
        self,
        client_id: str,
        document_id: str,
        action: str = "view",
        request_path: Optional[str] = None,
        duration_ms: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log document access.
        
        Args:
            client_id: Client identifier.
            document_id: Document identifier.
            action: Action performed (view, download, etc.).
            request_path: Request path.
            duration_ms: Request duration.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.DOCUMENT_VIEW,
            client_id=client_id,
            resource_type="document",
            resource_id=document_id,
            action=action,
            request_path=request_path,
            duration_ms=duration_ms,
            metadata=metadata or {},
        )
        self.log(event)
        return event
    
    def log_search(
        self,
        client_id: str,
        query_params: dict[str, Any],
        result_count: int,
        request_path: Optional[str] = None,
        duration_ms: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log a search operation.
        
        Args:
            client_id: Client identifier.
            query_params: Search parameters.
            result_count: Number of results returned.
            request_path: Request path.
            duration_ms: Request duration.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.DOCUMENT_SEARCH,
            client_id=client_id,
            resource_type="search",
            action="search",
            query_params=query_params,
            request_path=request_path,
            duration_ms=duration_ms,
            metadata={**(metadata or {}), "result_count": result_count},
        )
        self.log(event)
        return event
    
    def log_nl_query(
        self,
        client_id: str,
        query: str,
        has_citations: bool,
        confidence: float,
        request_path: Optional[str] = None,
        duration_ms: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log a natural language query.
        
        Args:
            client_id: Client identifier.
            query: The query text (truncated for privacy).
            has_citations: Whether response included citations.
            confidence: Response confidence score.
            request_path: Request path.
            duration_ms: Request duration.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        # Truncate query for privacy
        truncated_query = query[:100] + "..." if len(query) > 100 else query
        
        event = AuditEvent(
            event_type=AuditEventType.QUERY_NL,
            client_id=client_id,
            resource_type="query",
            action="natural_language_query",
            request_path=request_path,
            duration_ms=duration_ms,
            metadata={
                **(metadata or {}),
                "query_preview": truncated_query,
                "has_citations": has_citations,
                "confidence": confidence,
            },
        )
        self.log(event)
        return event
    
    def log_rate_limit_exceeded(
        self,
        client_id: str,
        limit: int,
        ip_address: Optional[str] = None,
        request_path: Optional[str] = None,
    ) -> AuditEvent:
        """Log a rate limit exceeded event.
        
        Args:
            client_id: Client identifier.
            limit: The rate limit that was exceeded.
            ip_address: Client IP address.
            request_path: Request path.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.RATE_LIMIT_EXCEEDED,
            client_id=client_id,
            ip_address=ip_address,
            action="rate_limit_check",
            status="failure",
            status_code=429,
            request_path=request_path,
            metadata={"limit": limit},
        )
        self.log(event)
        return event
    
    def log_error(
        self,
        error_message: str,
        client_id: Optional[str] = None,
        status_code: int = 500,
        request_path: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log an error event.
        
        Args:
            error_message: Error message.
            client_id: Client identifier.
            status_code: HTTP status code.
            request_path: Request path.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event_type = (
            AuditEventType.ERROR_CLIENT
            if 400 <= status_code < 500
            else AuditEventType.ERROR_SERVER
        )
        
        event = AuditEvent(
            event_type=event_type,
            client_id=client_id,
            action="error",
            status="failure",
            status_code=status_code,
            request_path=request_path,
            error_message=error_message,
            metadata=metadata or {},
        )
        self.log(event)
        return event
    
    def get_events(
        self,
        event_type: Optional[AuditEventType] = None,
        client_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[AuditEvent]:
        """Get audit events with optional filtering.
        
        Args:
            event_type: Filter by event type.
            client_id: Filter by client ID.
            limit: Maximum events to return.
            
        Returns:
            List of matching audit events.
        """
        events = self._events
        
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        
        if client_id:
            events = [e for e in events if e.client_id == client_id]
        
        return events[-limit:]
    
    def clear_events(self) -> None:
        """Clear all stored events."""
        self._events = []

    # ==================== Upload Audit Methods ====================
    # Implements Requirements 7.2, 7.3
    
    def log_upload_initiated(
        self,
        client_id: str,
        upload_id: str,
        file_name: str,
        file_size: int,
        file_type: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log an upload initiated event.
        
        Implements Requirement 7.2:
        - Log uploader identity, timestamp, and document details
        
        Args:
            client_id: Client/uploader identifier.
            upload_id: Upload identifier.
            file_name: Original file name.
            file_size: File size in bytes.
            file_type: File type (pdf, html).
            ip_address: Client IP address.
            user_agent: Client user agent.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.UPLOAD_INITIATED,
            client_id=client_id,
            user_id=client_id,
            ip_address=ip_address,
            user_agent=user_agent,
            resource_type="upload",
            resource_id=upload_id,
            action="upload_initiated",
            status="success",
            metadata={
                **(metadata or {}),
                "file_name": file_name,
                "file_size": file_size,
                "file_type": file_type,
            },
        )
        self.log(event)
        return event
    
    def log_upload_completed(
        self,
        client_id: str,
        upload_id: str,
        kb_document_id: str,
        file_name: str,
        processing_time_ms: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log an upload completed event.
        
        Implements Requirement 7.2:
        - Log successful upload completion
        
        Args:
            client_id: Client/uploader identifier.
            upload_id: Upload identifier.
            kb_document_id: Knowledge base document ID.
            file_name: Original file name.
            processing_time_ms: Processing duration.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.UPLOAD_COMPLETED,
            client_id=client_id,
            user_id=client_id,
            resource_type="upload",
            resource_id=upload_id,
            action="upload_completed",
            status="success",
            duration_ms=processing_time_ms,
            metadata={
                **(metadata or {}),
                "file_name": file_name,
                "kb_document_id": kb_document_id,
            },
        )
        self.log(event)
        return event
    
    def log_upload_failed(
        self,
        client_id: str,
        upload_id: str,
        file_name: str,
        error_message: str,
        error_stage: str,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log an upload failed event.
        
        Implements Requirement 7.2:
        - Log upload failures with error details
        
        Args:
            client_id: Client/uploader identifier.
            upload_id: Upload identifier.
            file_name: Original file name.
            error_message: Error message.
            error_stage: Stage where error occurred.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.UPLOAD_FAILED,
            client_id=client_id,
            user_id=client_id,
            resource_type="upload",
            resource_id=upload_id,
            action="upload_failed",
            status="failure",
            error_message=error_message,
            metadata={
                **(metadata or {}),
                "file_name": file_name,
                "error_stage": error_stage,
            },
        )
        self.log(event)
        return event
    
    def log_batch_upload_initiated(
        self,
        client_id: str,
        batch_id: str,
        document_count: int,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log a batch upload initiated event.
        
        Implements Requirement 7.2:
        - Log batch upload initiation
        
        Args:
            client_id: Client/uploader identifier.
            batch_id: Batch identifier.
            document_count: Number of documents in batch.
            ip_address: Client IP address.
            user_agent: Client user agent.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.UPLOAD_BATCH_INITIATED,
            client_id=client_id,
            user_id=client_id,
            ip_address=ip_address,
            user_agent=user_agent,
            resource_type="batch_upload",
            resource_id=batch_id,
            action="batch_upload_initiated",
            status="success",
            metadata={
                **(metadata or {}),
                "document_count": document_count,
            },
        )
        self.log(event)
        return event
    
    def log_batch_upload_completed(
        self,
        client_id: str,
        batch_id: str,
        total_documents: int,
        accepted: int,
        rejected: int,
        processing_time_ms: Optional[int] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log a batch upload completed event.
        
        Implements Requirement 7.2:
        - Log batch upload completion with results
        
        Args:
            client_id: Client/uploader identifier.
            batch_id: Batch identifier.
            total_documents: Total documents submitted.
            accepted: Number accepted.
            rejected: Number rejected.
            processing_time_ms: Processing duration.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.UPLOAD_BATCH_COMPLETED,
            client_id=client_id,
            user_id=client_id,
            resource_type="batch_upload",
            resource_id=batch_id,
            action="batch_upload_completed",
            status="success",
            duration_ms=processing_time_ms,
            metadata={
                **(metadata or {}),
                "total_documents": total_documents,
                "accepted": accepted,
                "rejected": rejected,
            },
        )
        self.log(event)
        return event
    
    def log_document_replaced(
        self,
        client_id: str,
        new_document_id: str,
        previous_document_id: str,
        title: str,
        version_number: int,
        before_state: Optional[dict[str, Any]] = None,
        after_state: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log a document replacement event.
        
        Implements Requirement 7.3:
        - Log document modifications with before/after states
        
        Args:
            client_id: Client/uploader identifier.
            new_document_id: New document ID.
            previous_document_id: Previous version document ID.
            title: Document title.
            version_number: New version number.
            before_state: State before modification.
            after_state: State after modification.
            ip_address: Client IP address.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.DOCUMENT_REPLACED,
            client_id=client_id,
            user_id=client_id,
            ip_address=ip_address,
            resource_type="document",
            resource_id=new_document_id,
            action="document_replaced",
            status="success",
            metadata={
                **(metadata or {}),
                "title": title,
                "previous_document_id": previous_document_id,
                "version_number": version_number,
                "before_state": before_state,
                "after_state": after_state,
            },
        )
        self.log(event)
        return event
    
    def log_metadata_updated(
        self,
        client_id: str,
        document_id: str,
        before_state: dict[str, Any],
        after_state: dict[str, Any],
        ip_address: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log a metadata update event.
        
        Implements Requirement 7.3:
        - Log metadata modifications with before/after states
        
        Args:
            client_id: Client/uploader identifier.
            document_id: Document ID.
            before_state: Metadata before modification.
            after_state: Metadata after modification.
            ip_address: Client IP address.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.DOCUMENT_METADATA_UPDATED,
            client_id=client_id,
            user_id=client_id,
            ip_address=ip_address,
            resource_type="document",
            resource_id=document_id,
            action="metadata_updated",
            status="success",
            metadata={
                **(metadata or {}),
                "before_state": before_state,
                "after_state": after_state,
            },
        )
        self.log(event)
        return event
    
    def log_status_query(
        self,
        client_id: str,
        upload_id: str,
        status_found: bool,
        request_path: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> AuditEvent:
        """Log a status query event.
        
        Args:
            client_id: Client identifier.
            upload_id: Upload ID being queried.
            status_found: Whether status was found.
            request_path: Request path.
            metadata: Additional metadata.
            
        Returns:
            The logged audit event.
        """
        event = AuditEvent(
            event_type=AuditEventType.STATUS_QUERY,
            client_id=client_id,
            resource_type="upload_status",
            resource_id=upload_id,
            action="status_query",
            status="success" if status_found else "not_found",
            status_code=200 if status_found else 404,
            request_path=request_path,
            metadata=metadata or {},
        )
        self.log(event)
        return event
    
    # ==================== Query Methods with Filtering ====================
    # Implements Requirement 7.4
    
    def query_events(
        self,
        uploader_id: Optional[str] = None,
        document_id: Optional[str] = None,
        event_types: Optional[list[AuditEventType]] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[AuditEvent], int]:
        """Query audit events with filtering and pagination.
        
        Implements Requirement 7.4:
        - Support filtering by uploader, date range, document ID
        - Paginate results for large log sets
        
        Args:
            uploader_id: Filter by uploader/client ID.
            document_id: Filter by document/resource ID.
            event_types: Filter by event types.
            start_date: Filter events after this date.
            end_date: Filter events before this date.
            limit: Maximum events to return.
            offset: Number of events to skip.
            
        Returns:
            Tuple of (matching events, total count).
        """
        events = self._events.copy()
        
        # Apply filters
        if uploader_id:
            events = [e for e in events if e.client_id == uploader_id or e.user_id == uploader_id]
        
        if document_id:
            events = [e for e in events if e.resource_id == document_id]
        
        if event_types:
            events = [e for e in events if e.event_type in event_types]
        
        if start_date:
            events = [e for e in events if e.timestamp >= start_date]
        
        if end_date:
            events = [e for e in events if e.timestamp <= end_date]
        
        # Sort by timestamp descending (most recent first)
        events.sort(key=lambda e: e.timestamp, reverse=True)
        
        total_count = len(events)
        
        # Apply pagination
        events = events[offset:offset + limit]
        
        return events, total_count
