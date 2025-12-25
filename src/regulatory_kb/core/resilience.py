"""Resilience patterns for error handling and fault tolerance.

Implements comprehensive error handling across all components:
- Retry logic with exponential backoff for external calls
- Circuit breakers for external dependencies
- Error logging and categorization system
- Fallback mechanisms for service failures
"""

import asyncio
import functools
import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Optional, TypeVar, Generic

import structlog

from regulatory_kb.core.errors import RegulatoryKBError, RetryableError

logger = structlog.get_logger(__name__)

T = TypeVar("T")


class ErrorCategory(str, Enum):
    """Categories for error classification."""

    NETWORK = "network"
    TIMEOUT = "timeout"
    RATE_LIMIT = "rate_limit"
    AUTHENTICATION = "authentication"
    VALIDATION = "validation"
    PARSING = "parsing"
    STORAGE = "storage"
    EXTERNAL_SERVICE = "external_service"
    INTERNAL = "internal"
    UNKNOWN = "unknown"


class CircuitState(str, Enum):
    """States for circuit breaker."""

    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""

    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0
    jitter: bool = True
    retryable_exceptions: tuple = (
        ConnectionError,
        TimeoutError,
        asyncio.TimeoutError,
    )


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker."""

    failure_threshold: int = 5
    success_threshold: int = 2
    timeout: float = 30.0
    half_open_max_calls: int = 3


@dataclass
class ErrorRecord:
    """Record of an error occurrence."""

    timestamp: datetime
    category: ErrorCategory
    error_type: str
    message: str
    component: str
    details: dict = field(default_factory=dict)
    retry_count: int = 0
    resolved: bool = False

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp.isoformat(),
            "category": self.category.value,
            "error_type": self.error_type,
            "message": self.message,
            "component": self.component,
            "details": self.details,
            "retry_count": self.retry_count,
            "resolved": self.resolved,
        }


class ErrorCategorizer:
    """Categorizes errors for logging and handling."""

    # Mapping of exception types to categories
    EXCEPTION_CATEGORIES = {
        ConnectionError: ErrorCategory.NETWORK,
        TimeoutError: ErrorCategory.TIMEOUT,
        asyncio.TimeoutError: ErrorCategory.TIMEOUT,
        PermissionError: ErrorCategory.AUTHENTICATION,
        ValueError: ErrorCategory.VALIDATION,
        KeyError: ErrorCategory.VALIDATION,
    }

    # Keywords in error messages that indicate categories
    MESSAGE_KEYWORDS = {
        ErrorCategory.NETWORK: ["connection", "network", "dns", "socket", "refused"],
        ErrorCategory.TIMEOUT: ["timeout", "timed out", "deadline"],
        ErrorCategory.RATE_LIMIT: ["rate limit", "429", "too many requests", "throttl"],
        ErrorCategory.AUTHENTICATION: ["auth", "401", "403", "forbidden", "unauthorized", "credential"],
        ErrorCategory.PARSING: ["parse", "decode", "invalid format", "malformed"],
        ErrorCategory.STORAGE: ["database", "storage", "disk", "write", "read error"],
    }

    @classmethod
    def categorize(cls, error: Exception) -> ErrorCategory:
        """Categorize an exception.

        Args:
            error: The exception to categorize.

        Returns:
            ErrorCategory for the exception.
        """
        # Check exception type first
        for exc_type, category in cls.EXCEPTION_CATEGORIES.items():
            if isinstance(error, exc_type):
                return category

        # Check error message for keywords
        error_msg = str(error).lower()
        for category, keywords in cls.MESSAGE_KEYWORDS.items():
            if any(kw in error_msg for kw in keywords):
                return category

        # Check for custom error types
        if isinstance(error, RegulatoryKBError):
            if error.error_code:
                code_mapping = {
                    "DOC_RETRIEVAL": ErrorCategory.NETWORK,
                    "DOC_PARSING": ErrorCategory.PARSING,
                    "METADATA_EXTRACTION": ErrorCategory.PARSING,
                    "GRAPH_STORAGE": ErrorCategory.STORAGE,
                    "VALIDATION": ErrorCategory.VALIDATION,
                    "BEDROCK_AGENT": ErrorCategory.EXTERNAL_SERVICE,
                    "QUERY_PROCESSING": ErrorCategory.INTERNAL,
                }
                return code_mapping.get(error.error_code, ErrorCategory.UNKNOWN)

        return ErrorCategory.UNKNOWN

    @classmethod
    def is_retryable(cls, error: Exception) -> bool:
        """Determine if an error is retryable.

        Args:
            error: The exception to check.

        Returns:
            True if the error can be retried.
        """
        category = cls.categorize(error)
        retryable_categories = {
            ErrorCategory.NETWORK,
            ErrorCategory.TIMEOUT,
            ErrorCategory.RATE_LIMIT,
            ErrorCategory.EXTERNAL_SERVICE,
        }
        return category in retryable_categories


class ErrorLogger:
    """Centralized error logging and tracking."""

    def __init__(self, max_history: int = 1000):
        """Initialize error logger.

        Args:
            max_history: Maximum number of errors to keep in history.
        """
        self._history: list[ErrorRecord] = []
        self._max_history = max_history
        self._error_counts: dict[ErrorCategory, int] = {cat: 0 for cat in ErrorCategory}

    def log_error(
        self,
        error: Exception,
        component: str,
        details: Optional[dict] = None,
        retry_count: int = 0,
    ) -> ErrorRecord:
        """Log an error occurrence.

        Args:
            error: The exception that occurred.
            component: Component where error occurred.
            details: Additional error details.
            retry_count: Number of retries attempted.

        Returns:
            ErrorRecord for the logged error.
        """
        category = ErrorCategorizer.categorize(error)

        record = ErrorRecord(
            timestamp=datetime.now(timezone.utc),
            category=category,
            error_type=type(error).__name__,
            message=str(error),
            component=component,
            details=details or {},
            retry_count=retry_count,
        )

        # Update counts
        self._error_counts[category] += 1

        # Add to history
        self._history.append(record)
        if len(self._history) > self._max_history:
            self._history.pop(0)

        # Log with structlog
        logger.error(
            "error_occurred",
            category=category.value,
            error_type=record.error_type,
            message=record.message,
            component=component,
            retry_count=retry_count,
            **record.details,
        )

        return record

    def get_error_counts(self) -> dict[str, int]:
        """Get error counts by category."""
        return {cat.value: count for cat, count in self._error_counts.items()}

    def get_recent_errors(
        self,
        limit: int = 100,
        category: Optional[ErrorCategory] = None,
    ) -> list[ErrorRecord]:
        """Get recent errors, optionally filtered by category."""
        errors = self._history
        if category:
            errors = [e for e in errors if e.category == category]
        return errors[-limit:]

    def clear_history(self) -> None:
        """Clear error history."""
        self._history.clear()
        self._error_counts = {cat: 0 for cat in ErrorCategory}


# Global error logger instance
_error_logger = ErrorLogger()


def get_error_logger() -> ErrorLogger:
    """Get the global error logger instance."""
    return _error_logger


class RetryHandler:
    """Handles retry logic with exponential backoff."""

    def __init__(self, config: Optional[RetryConfig] = None):
        """Initialize retry handler.

        Args:
            config: Retry configuration.
        """
        self.config = config or RetryConfig()

    def calculate_delay(self, attempt: int) -> float:
        """Calculate delay for a retry attempt.

        Args:
            attempt: Current attempt number (0-indexed).

        Returns:
            Delay in seconds.
        """
        delay = self.config.base_delay * (self.config.exponential_base ** attempt)
        delay = min(delay, self.config.max_delay)

        if self.config.jitter:
            # Add random jitter (±25%)
            jitter = delay * 0.25 * (2 * random.random() - 1)
            delay += jitter

        return max(0, delay)

    def should_retry(self, error: Exception, attempt: int) -> bool:
        """Determine if an operation should be retried.

        Args:
            error: The exception that occurred.
            attempt: Current attempt number.

        Returns:
            True if should retry.
        """
        if attempt >= self.config.max_retries:
            return False

        # Check if exception type is retryable
        if isinstance(error, self.config.retryable_exceptions):
            return True

        # Use categorizer for other errors
        return ErrorCategorizer.is_retryable(error)

    async def execute_with_retry(
        self,
        func: Callable[..., Any],
        *args,
        component: str = "unknown",
        **kwargs,
    ) -> Any:
        """Execute an async function with retry logic.

        Args:
            func: Async function to execute.
            *args: Positional arguments for func.
            component: Component name for logging.
            **kwargs: Keyword arguments for func.

        Returns:
            Result of the function.

        Raises:
            The last exception if all retries fail.
        """
        last_error: Optional[Exception] = None
        error_logger = get_error_logger()

        for attempt in range(self.config.max_retries + 1):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                last_error = e
                error_logger.log_error(e, component, retry_count=attempt)

                if not self.should_retry(e, attempt):
                    logger.warning(
                        "retry_not_possible",
                        component=component,
                        attempt=attempt,
                        error=str(e),
                    )
                    raise

                delay = self.calculate_delay(attempt)
                logger.info(
                    "retrying_operation",
                    component=component,
                    attempt=attempt + 1,
                    max_retries=self.config.max_retries,
                    delay=delay,
                )
                await asyncio.sleep(delay)

        # Should not reach here, but raise last error if we do
        if last_error:
            raise last_error

    def execute_sync_with_retry(
        self,
        func: Callable[..., Any],
        *args,
        component: str = "unknown",
        **kwargs,
    ) -> Any:
        """Execute a sync function with retry logic.

        Args:
            func: Function to execute.
            *args: Positional arguments for func.
            component: Component name for logging.
            **kwargs: Keyword arguments for func.

        Returns:
            Result of the function.

        Raises:
            The last exception if all retries fail.
        """
        last_error: Optional[Exception] = None
        error_logger = get_error_logger()

        for attempt in range(self.config.max_retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_error = e
                error_logger.log_error(e, component, retry_count=attempt)

                if not self.should_retry(e, attempt):
                    raise

                delay = self.calculate_delay(attempt)
                logger.info(
                    "retrying_operation",
                    component=component,
                    attempt=attempt + 1,
                    max_retries=self.config.max_retries,
                    delay=delay,
                )
                time.sleep(delay)

        if last_error:
            raise last_error


class CircuitBreaker:
    """Circuit breaker for external dependencies."""

    def __init__(
        self,
        name: str,
        config: Optional[CircuitBreakerConfig] = None,
    ):
        """Initialize circuit breaker.

        Args:
            name: Name of the circuit (for logging).
            config: Circuit breaker configuration.
        """
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[float] = None
        self._half_open_calls = 0

    @property
    def state(self) -> CircuitState:
        """Get current circuit state."""
        if self._state == CircuitState.OPEN:
            # Check if timeout has passed
            if self._last_failure_time:
                elapsed = time.time() - self._last_failure_time
                if elapsed >= self.config.timeout:
                    self._transition_to_half_open()
        return self._state

    def _transition_to_open(self) -> None:
        """Transition to open state."""
        self._state = CircuitState.OPEN
        self._last_failure_time = time.time()
        logger.warning(
            "circuit_opened",
            circuit=self.name,
            failure_count=self._failure_count,
        )

    def _transition_to_half_open(self) -> None:
        """Transition to half-open state."""
        self._state = CircuitState.HALF_OPEN
        self._half_open_calls = 0
        self._success_count = 0
        logger.info("circuit_half_open", circuit=self.name)

    def _transition_to_closed(self) -> None:
        """Transition to closed state."""
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        logger.info("circuit_closed", circuit=self.name)

    def record_success(self) -> None:
        """Record a successful call."""
        if self._state == CircuitState.HALF_OPEN:
            self._success_count += 1
            if self._success_count >= self.config.success_threshold:
                self._transition_to_closed()
        elif self._state == CircuitState.CLOSED:
            # Reset failure count on success
            self._failure_count = 0

    def record_failure(self) -> None:
        """Record a failed call."""
        self._failure_count += 1

        if self._state == CircuitState.HALF_OPEN:
            self._transition_to_open()
        elif self._state == CircuitState.CLOSED:
            if self._failure_count >= self.config.failure_threshold:
                self._transition_to_open()

    def can_execute(self) -> bool:
        """Check if a call can be executed.

        Returns:
            True if call is allowed.
        """
        state = self.state  # This may update state based on timeout

        if state == CircuitState.CLOSED:
            return True
        elif state == CircuitState.OPEN:
            return False
        else:  # HALF_OPEN
            if self._half_open_calls < self.config.half_open_max_calls:
                self._half_open_calls += 1
                return True
            return False

    async def execute(
        self,
        func: Callable[..., Any],
        *args,
        fallback: Optional[Callable[..., Any]] = None,
        **kwargs,
    ) -> Any:
        """Execute a function with circuit breaker protection.

        Args:
            func: Async function to execute.
            *args: Positional arguments.
            fallback: Optional fallback function if circuit is open.
            **kwargs: Keyword arguments.

        Returns:
            Result of function or fallback.

        Raises:
            CircuitOpenError if circuit is open and no fallback.
        """
        if not self.can_execute():
            if fallback:
                logger.info(
                    "circuit_fallback",
                    circuit=self.name,
                    state=self._state.value,
                )
                return await fallback(*args, **kwargs) if asyncio.iscoroutinefunction(fallback) else fallback(*args, **kwargs)
            raise CircuitOpenError(f"Circuit {self.name} is open")

        try:
            result = await func(*args, **kwargs)
            self.record_success()
            return result
        except Exception as e:
            self.record_failure()
            raise

    def execute_sync(
        self,
        func: Callable[..., Any],
        *args,
        fallback: Optional[Callable[..., Any]] = None,
        **kwargs,
    ) -> Any:
        """Execute a sync function with circuit breaker protection."""
        if not self.can_execute():
            if fallback:
                return fallback(*args, **kwargs)
            raise CircuitOpenError(f"Circuit {self.name} is open")

        try:
            result = func(*args, **kwargs)
            self.record_success()
            return result
        except Exception as e:
            self.record_failure()
            raise


class CircuitOpenError(RegulatoryKBError):
    """Error raised when circuit breaker is open."""

    def __init__(self, message: str):
        super().__init__(message, error_code="CIRCUIT_OPEN")


class CircuitBreakerRegistry:
    """Registry for managing multiple circuit breakers."""

    def __init__(self):
        self._breakers: dict[str, CircuitBreaker] = {}

    def get_or_create(
        self,
        name: str,
        config: Optional[CircuitBreakerConfig] = None,
    ) -> CircuitBreaker:
        """Get or create a circuit breaker.

        Args:
            name: Circuit breaker name.
            config: Optional configuration.

        Returns:
            CircuitBreaker instance.
        """
        if name not in self._breakers:
            self._breakers[name] = CircuitBreaker(name, config)
        return self._breakers[name]

    def get_all_states(self) -> dict[str, str]:
        """Get states of all circuit breakers."""
        return {name: cb.state.value for name, cb in self._breakers.items()}

    def reset_all(self) -> None:
        """Reset all circuit breakers to closed state."""
        for cb in self._breakers.values():
            cb._transition_to_closed()


# Global circuit breaker registry
_circuit_registry = CircuitBreakerRegistry()


def get_circuit_registry() -> CircuitBreakerRegistry:
    """Get the global circuit breaker registry."""
    return _circuit_registry


def with_retry(
    config: Optional[RetryConfig] = None,
    component: str = "unknown",
):
    """Decorator for adding retry logic to async functions.

    Args:
        config: Retry configuration.
        component: Component name for logging.
    """
    handler = RetryHandler(config)

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            return await handler.execute_with_retry(
                func, *args, component=component, **kwargs
            )
        return wrapper

    return decorator


def with_circuit_breaker(
    name: str,
    config: Optional[CircuitBreakerConfig] = None,
    fallback: Optional[Callable] = None,
):
    """Decorator for adding circuit breaker to async functions.

    Args:
        name: Circuit breaker name.
        config: Circuit breaker configuration.
        fallback: Optional fallback function.
    """
    def decorator(func: Callable) -> Callable:
        circuit = get_circuit_registry().get_or_create(name, config)

        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            return await circuit.execute(func, *args, fallback=fallback, **kwargs)
        return wrapper

    return decorator
