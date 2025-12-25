"""Custom exception classes for the regulatory knowledge base."""

from typing import Optional


class RegulatoryKBError(Exception):
    """Base exception for all regulatory knowledge base errors."""

    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        details: Optional[dict] = None,
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}

    def __str__(self) -> str:
        if self.error_code:
            return f"[{self.error_code}] {self.message}"
        return self.message


class DocumentRetrievalError(RegulatoryKBError):
    """Error during document retrieval from regulatory sources."""

    def __init__(
        self,
        message: str,
        source_url: Optional[str] = None,
        regulator: Optional[str] = None,
        retry_count: int = 0,
        **kwargs,
    ):
        super().__init__(message, error_code="DOC_RETRIEVAL", **kwargs)
        self.source_url = source_url
        self.regulator = regulator
        self.retry_count = retry_count
        self.details.update({
            "source_url": source_url,
            "regulator": regulator,
            "retry_count": retry_count,
        })


class DocumentParsingError(RegulatoryKBError):
    """Error during document parsing and text extraction."""

    def __init__(
        self,
        message: str,
        document_id: Optional[str] = None,
        document_type: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(message, error_code="DOC_PARSING", **kwargs)
        self.document_id = document_id
        self.document_type = document_type
        self.details.update({
            "document_id": document_id,
            "document_type": document_type,
        })


class MetadataExtractionError(RegulatoryKBError):
    """Error during metadata extraction from documents."""

    def __init__(
        self,
        message: str,
        document_id: Optional[str] = None,
        field: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(message, error_code="METADATA_EXTRACTION", **kwargs)
        self.document_id = document_id
        self.field = field
        self.details.update({
            "document_id": document_id,
            "field": field,
        })


class GraphStorageError(RegulatoryKBError):
    """Error during graph database operations."""

    def __init__(
        self,
        message: str,
        operation: Optional[str] = None,
        node_id: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(message, error_code="GRAPH_STORAGE", **kwargs)
        self.operation = operation
        self.node_id = node_id
        self.details.update({
            "operation": operation,
            "node_id": node_id,
        })


class ValidationError(RegulatoryKBError):
    """Error during document or data validation."""

    def __init__(
        self,
        message: str,
        document_id: Optional[str] = None,
        validation_type: Optional[str] = None,
        failed_checks: Optional[list] = None,
        **kwargs,
    ):
        super().__init__(message, error_code="VALIDATION", **kwargs)
        self.document_id = document_id
        self.validation_type = validation_type
        self.failed_checks = failed_checks or []
        self.details.update({
            "document_id": document_id,
            "validation_type": validation_type,
            "failed_checks": self.failed_checks,
        })


class RetryableError(RegulatoryKBError):
    """Error that can be retried with exponential backoff."""

    def __init__(
        self,
        message: str,
        max_retries: int = 3,
        current_retry: int = 0,
        **kwargs,
    ):
        super().__init__(message, error_code="RETRYABLE", **kwargs)
        self.max_retries = max_retries
        self.current_retry = current_retry
        self.details.update({
            "max_retries": max_retries,
            "current_retry": current_retry,
            "can_retry": current_retry < max_retries,
        })

    @property
    def can_retry(self) -> bool:
        return self.current_retry < self.max_retries


class BedrockAgentError(RegulatoryKBError):
    """Error during Bedrock Agent operations."""

    def __init__(
        self,
        message: str,
        session_id: Optional[str] = None,
        query: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(message, error_code="BEDROCK_AGENT", **kwargs)
        self.session_id = session_id
        self.query = query
        self.details.update({
            "session_id": session_id,
            "query": query[:100] if query else None,
        })


class QueryProcessingError(RegulatoryKBError):
    """Error during query processing."""

    def __init__(
        self,
        message: str,
        query: Optional[str] = None,
        intent: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(message, error_code="QUERY_PROCESSING", **kwargs)
        self.query = query
        self.intent = intent
        self.details.update({
            "query": query[:100] if query else None,
            "intent": intent,
        })
