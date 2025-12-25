"""Core utilities and frameworks for the regulatory knowledge base."""

from regulatory_kb.core.logging import get_logger, configure_logging
from regulatory_kb.core.errors import (
    RegulatoryKBError,
    DocumentRetrievalError,
    DocumentParsingError,
    MetadataExtractionError,
    GraphStorageError,
    ValidationError,
)
from regulatory_kb.core.resilience import (
    RetryConfig,
    RetryHandler,
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerRegistry,
    CircuitOpenError,
    ErrorCategory,
    ErrorCategorizer,
    ErrorLogger,
    ErrorRecord,
    get_error_logger,
    get_circuit_registry,
    with_retry,
    with_circuit_breaker,
)

__all__ = [
    # Logging
    "get_logger",
    "configure_logging",
    # Errors
    "RegulatoryKBError",
    "DocumentRetrievalError",
    "DocumentParsingError",
    "MetadataExtractionError",
    "GraphStorageError",
    "ValidationError",
    # Resilience
    "RetryConfig",
    "RetryHandler",
    "CircuitBreaker",
    "CircuitBreakerConfig",
    "CircuitBreakerRegistry",
    "CircuitOpenError",
    "ErrorCategory",
    "ErrorCategorizer",
    "ErrorLogger",
    "ErrorRecord",
    "get_error_logger",
    "get_circuit_registry",
    "with_retry",
    "with_circuit_breaker",
]
