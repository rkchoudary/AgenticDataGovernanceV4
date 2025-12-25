"""Tests for resilience patterns - retry logic, circuit breakers, and error handling."""

import asyncio
import pytest
import time

from regulatory_kb.core.resilience import (
    RetryConfig,
    RetryHandler,
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitState,
    CircuitOpenError,
    ErrorCategory,
    ErrorCategorizer,
    ErrorLogger,
    ErrorRecord,
    get_error_logger,
    get_circuit_registry,
)
from regulatory_kb.core.errors import (
    RegulatoryKBError,
    DocumentRetrievalError,
    DocumentParsingError,
)


class TestErrorCategorizer:
    """Tests for ErrorCategorizer class."""

    def test_categorize_connection_error(self):
        """Test categorization of connection errors."""
        error = ConnectionError("Connection refused")
        category = ErrorCategorizer.categorize(error)
        assert category == ErrorCategory.NETWORK

    def test_categorize_timeout_error(self):
        """Test categorization of timeout errors."""
        error = TimeoutError("Request timed out")
        category = ErrorCategorizer.categorize(error)
        assert category == ErrorCategory.TIMEOUT

    def test_categorize_by_message_rate_limit(self):
        """Test categorization by error message for rate limiting."""
        error = Exception("429 Too Many Requests")
        category = ErrorCategorizer.categorize(error)
        assert category == ErrorCategory.RATE_LIMIT

    def test_categorize_by_message_auth(self):
        """Test categorization by error message for auth errors."""
        error = Exception("401 Unauthorized access")
        category = ErrorCategorizer.categorize(error)
        assert category == ErrorCategory.AUTHENTICATION

    def test_categorize_custom_error(self):
        """Test categorization of custom RegulatoryKBError."""
        error = DocumentRetrievalError("Failed to retrieve", source_url="http://test.com")
        category = ErrorCategorizer.categorize(error)
        assert category == ErrorCategory.NETWORK

    def test_categorize_parsing_error(self):
        """Test categorization of parsing errors."""
        error = DocumentParsingError("Failed to parse PDF")
        category = ErrorCategorizer.categorize(error)
        assert category == ErrorCategory.PARSING

    def test_categorize_unknown(self):
        """Test categorization of unknown errors."""
        error = Exception("Some random error")
        category = ErrorCategorizer.categorize(error)
        assert category == ErrorCategory.UNKNOWN

    def test_is_retryable_network_error(self):
        """Test that network errors are retryable."""
        error = ConnectionError("Connection failed")
        assert ErrorCategorizer.is_retryable(error) is True

    def test_is_retryable_validation_error(self):
        """Test that validation errors are not retryable."""
        error = ValueError("Invalid input")
        assert ErrorCategorizer.is_retryable(error) is False


class TestErrorLogger:
    """Tests for ErrorLogger class."""

    @pytest.fixture
    def logger(self):
        return ErrorLogger(max_history=10)

    def test_log_error(self, logger):
        """Test logging an error."""
        error = ConnectionError("Test error")
        record = logger.log_error(error, "test_component")

        assert record.category == ErrorCategory.NETWORK
        assert record.error_type == "ConnectionError"
        assert record.component == "test_component"

    def test_error_counts(self, logger):
        """Test error counting by category."""
        logger.log_error(ConnectionError("Error 1"), "comp1")
        logger.log_error(ConnectionError("Error 2"), "comp1")
        logger.log_error(TimeoutError("Error 3"), "comp2")

        counts = logger.get_error_counts()
        assert counts["network"] == 2
        assert counts["timeout"] == 1

    def test_get_recent_errors(self, logger):
        """Test getting recent errors."""
        for i in range(5):
            logger.log_error(Exception(f"Error {i}"), "comp")

        recent = logger.get_recent_errors(limit=3)
        assert len(recent) == 3

    def test_max_history_limit(self, logger):
        """Test that history is limited."""
        for i in range(15):
            logger.log_error(Exception(f"Error {i}"), "comp")

        recent = logger.get_recent_errors(limit=100)
        assert len(recent) == 10  # max_history is 10

    def test_filter_by_category(self, logger):
        """Test filtering errors by category."""
        logger.log_error(ConnectionError("Net error"), "comp")
        logger.log_error(TimeoutError("Timeout error"), "comp")
        logger.log_error(ConnectionError("Net error 2"), "comp")

        network_errors = logger.get_recent_errors(category=ErrorCategory.NETWORK)
        assert len(network_errors) == 2


class TestRetryHandler:
    """Tests for RetryHandler class."""

    @pytest.fixture
    def handler(self):
        config = RetryConfig(
            max_retries=3,
            base_delay=0.01,  # Short delay for tests
            max_delay=0.1,
            jitter=False,
        )
        return RetryHandler(config)

    def test_calculate_delay_exponential(self, handler):
        """Test exponential backoff calculation."""
        delays = [handler.calculate_delay(i) for i in range(4)]
        assert delays[0] == 0.01
        assert delays[1] == 0.02
        assert delays[2] == 0.04
        assert delays[3] == 0.08

    def test_calculate_delay_max_cap(self):
        """Test delay is capped at max_delay."""
        config = RetryConfig(base_delay=1.0, max_delay=5.0, jitter=False)
        handler = RetryHandler(config)

        delay = handler.calculate_delay(10)  # Would be 1024 without cap
        assert delay == 5.0

    def test_should_retry_retryable_error(self, handler):
        """Test should_retry for retryable errors."""
        error = ConnectionError("Connection failed")
        assert handler.should_retry(error, 0) is True
        assert handler.should_retry(error, 2) is True
        assert handler.should_retry(error, 3) is False  # max_retries reached

    def test_should_retry_non_retryable_error(self, handler):
        """Test should_retry for non-retryable errors."""
        error = ValueError("Invalid input")
        assert handler.should_retry(error, 0) is False

    @pytest.mark.asyncio
    async def test_execute_with_retry_success(self, handler):
        """Test successful execution without retry."""
        call_count = 0

        async def success_func():
            nonlocal call_count
            call_count += 1
            return "success"

        result = await handler.execute_with_retry(success_func, component="test")
        assert result == "success"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_execute_with_retry_eventual_success(self, handler):
        """Test retry leading to eventual success."""
        call_count = 0

        async def eventual_success():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError("Temporary failure")
            return "success"

        result = await handler.execute_with_retry(eventual_success, component="test")
        assert result == "success"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_execute_with_retry_all_fail(self, handler):
        """Test all retries failing."""
        call_count = 0

        async def always_fail():
            nonlocal call_count
            call_count += 1
            raise ConnectionError("Persistent failure")

        with pytest.raises(ConnectionError):
            await handler.execute_with_retry(always_fail, component="test")

        assert call_count == 4  # Initial + 3 retries


class TestCircuitBreaker:
    """Tests for CircuitBreaker class."""

    @pytest.fixture
    def circuit(self):
        config = CircuitBreakerConfig(
            failure_threshold=3,
            success_threshold=2,
            timeout=0.1,  # Short timeout for tests
        )
        return CircuitBreaker("test_circuit", config)

    def test_initial_state_closed(self, circuit):
        """Test circuit starts in closed state."""
        assert circuit.state == CircuitState.CLOSED

    def test_opens_after_failures(self, circuit):
        """Test circuit opens after failure threshold."""
        for _ in range(3):
            circuit.record_failure()

        assert circuit.state == CircuitState.OPEN

    def test_can_execute_when_closed(self, circuit):
        """Test can execute when circuit is closed."""
        assert circuit.can_execute() is True

    def test_cannot_execute_when_open(self, circuit):
        """Test cannot execute when circuit is open."""
        for _ in range(3):
            circuit.record_failure()

        assert circuit.can_execute() is False

    def test_transitions_to_half_open_after_timeout(self, circuit):
        """Test circuit transitions to half-open after timeout."""
        for _ in range(3):
            circuit.record_failure()

        assert circuit.state == CircuitState.OPEN

        # Wait for timeout
        time.sleep(0.15)

        assert circuit.state == CircuitState.HALF_OPEN

    def test_closes_after_successes_in_half_open(self, circuit):
        """Test circuit closes after successes in half-open state."""
        # Open the circuit
        for _ in range(3):
            circuit.record_failure()

        # Wait for half-open
        time.sleep(0.15)
        _ = circuit.state  # Trigger state check

        # Record successes
        circuit.record_success()
        circuit.record_success()

        assert circuit.state == CircuitState.CLOSED

    def test_reopens_on_failure_in_half_open(self, circuit):
        """Test circuit reopens on failure in half-open state."""
        # Open the circuit
        for _ in range(3):
            circuit.record_failure()

        # Wait for half-open
        time.sleep(0.15)
        _ = circuit.state

        # Record failure
        circuit.record_failure()

        assert circuit.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_execute_success(self, circuit):
        """Test successful execution through circuit."""
        async def success_func():
            return "success"

        result = await circuit.execute(success_func)
        assert result == "success"

    @pytest.mark.asyncio
    async def test_execute_with_fallback_when_open(self, circuit):
        """Test fallback is called when circuit is open."""
        # Open the circuit
        for _ in range(3):
            circuit.record_failure()

        async def main_func():
            return "main"

        async def fallback_func():
            return "fallback"

        result = await circuit.execute(main_func, fallback=fallback_func)
        assert result == "fallback"

    @pytest.mark.asyncio
    async def test_execute_raises_when_open_no_fallback(self, circuit):
        """Test CircuitOpenError when open without fallback."""
        for _ in range(3):
            circuit.record_failure()

        async def main_func():
            return "main"

        with pytest.raises(CircuitOpenError):
            await circuit.execute(main_func)


class TestCircuitBreakerRegistry:
    """Tests for CircuitBreakerRegistry."""

    def test_get_or_create(self):
        """Test getting or creating circuit breakers."""
        registry = get_circuit_registry()
        registry._breakers.clear()  # Reset for test

        cb1 = registry.get_or_create("service_a")
        cb2 = registry.get_or_create("service_a")
        cb3 = registry.get_or_create("service_b")

        assert cb1 is cb2  # Same instance
        assert cb1 is not cb3  # Different instance

    def test_get_all_states(self):
        """Test getting all circuit states."""
        registry = get_circuit_registry()
        registry._breakers.clear()

        registry.get_or_create("service_a")
        cb_b = registry.get_or_create("service_b")

        # Open one circuit
        for _ in range(5):
            cb_b.record_failure()

        states = registry.get_all_states()
        assert states["service_a"] == "closed"
        assert states["service_b"] == "open"
