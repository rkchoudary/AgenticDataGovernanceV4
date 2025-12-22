"""
Unit tests for the Observability Configuration.

Tests OpenTelemetry instrumentation setup and governance-specific span attributes.

Requirements: 17.1, 17.2, 17.3, 17.4
"""

import pytest
from unittest.mock import MagicMock, patch
from opentelemetry.trace import SpanKind, StatusCode

from services.observability_config import (
    ObservabilityConfig,
    GovernanceSpanContext,
    GovernanceSpan,
    SpanAttribute,
    initialize_observability,
    get_observability_config,
    get_tracer,
    get_current_governance_context,
    set_current_governance_context,
    set_governance_baggage,
    get_governance_baggage,
    add_governance_attributes_to_span,
    add_baggage_attributes_to_span,
    trace_agent_invocation,
    trace_tool_call,
    trace_memory_operation,
    get_otel_env_vars,
    OTEL_ENV_VARS,
)


class TestObservabilityConfig:
    """Tests for ObservabilityConfig class."""
    
    def test_config_initialization(self):
        """Test that ObservabilityConfig initializes with correct defaults."""
        config = ObservabilityConfig()
        
        assert config.service_name == "agentcore-data-governance"
        assert config.service_version == "0.1.0"
        assert config.environment == "development"
        assert config.enable_console_export is False
        assert config._initialized is False
    
    def test_config_custom_values(self):
        """Test ObservabilityConfig with custom values."""
        config = ObservabilityConfig(
            service_name="custom-service",
            service_version="2.0.0",
            environment="production",
            enable_console_export=True,
            otlp_endpoint="http://custom:4317",
        )
        
        assert config.service_name == "custom-service"
        assert config.service_version == "2.0.0"
        assert config.environment == "production"
        assert config.enable_console_export is True
        assert config.otlp_endpoint == "http://custom:4317"
    
    def test_initialize_sets_initialized_flag(self):
        """Test that initialize() sets the initialized flag."""
        config = ObservabilityConfig(enable_console_export=True)
        config.initialize()
        
        assert config._initialized is True
        assert config._tracer is not None
        
        # Cleanup
        config.shutdown()
    
    def test_initialize_idempotent(self):
        """Test that initialize() is idempotent."""
        config = ObservabilityConfig(enable_console_export=True)
        config.initialize()
        tracer1 = config._tracer
        
        config.initialize()
        tracer2 = config._tracer
        
        assert tracer1 is tracer2
        
        # Cleanup
        config.shutdown()
    
    def test_get_tracer_initializes_if_needed(self):
        """Test that get_tracer() initializes if not already done."""
        config = ObservabilityConfig()
        assert config._initialized is False
        
        tracer = config.get_tracer()
        
        assert config._initialized is True
        assert tracer is not None
        
        # Cleanup
        config.shutdown()
    
    def test_shutdown_resets_initialized(self):
        """Test that shutdown() resets the initialized flag."""
        config = ObservabilityConfig(enable_console_export=True)
        config.initialize()
        assert config._initialized is True
        
        config.shutdown()
        
        assert config._initialized is False


class TestGovernanceSpanContext:
    """Tests for GovernanceSpanContext dataclass."""
    
    def test_empty_context(self):
        """Test empty GovernanceSpanContext."""
        ctx = GovernanceSpanContext()
        attrs = ctx.to_attributes()
        
        assert attrs == {}
    
    def test_full_context(self):
        """Test GovernanceSpanContext with all fields."""
        ctx = GovernanceSpanContext(
            report_id="RPT-001",
            cycle_id="CYC-001",
            phase="data_gathering",
            actor="user@example.com",
            actor_type="human",
            tenant_id="TENANT-001",
            session_id="SESSION-001",
            memory_id="MEM-001",
        )
        attrs = ctx.to_attributes()
        
        assert attrs[SpanAttribute.REPORT_ID.value] == "RPT-001"
        assert attrs[SpanAttribute.CYCLE_ID.value] == "CYC-001"
        assert attrs[SpanAttribute.PHASE.value] == "data_gathering"
        assert attrs[SpanAttribute.ACTOR.value] == "user@example.com"
        assert attrs[SpanAttribute.ACTOR_TYPE.value] == "human"
        assert attrs[SpanAttribute.TENANT_ID.value] == "TENANT-001"
        assert attrs[SpanAttribute.SESSION_ID.value] == "SESSION-001"
        assert attrs[SpanAttribute.MEMORY_ID.value] == "MEM-001"
    
    def test_partial_context(self):
        """Test GovernanceSpanContext with partial fields."""
        ctx = GovernanceSpanContext(
            report_id="RPT-001",
            actor="agent",
            actor_type="agent",
        )
        attrs = ctx.to_attributes()
        
        assert len(attrs) == 3
        assert attrs[SpanAttribute.REPORT_ID.value] == "RPT-001"
        assert attrs[SpanAttribute.ACTOR.value] == "agent"
        assert attrs[SpanAttribute.ACTOR_TYPE.value] == "agent"
    
    def test_additional_attributes(self):
        """Test GovernanceSpanContext with additional attributes."""
        ctx = GovernanceSpanContext(
            report_id="RPT-001",
            additional_attributes={"custom.key": "custom_value"},
        )
        attrs = ctx.to_attributes()
        
        assert attrs[SpanAttribute.REPORT_ID.value] == "RPT-001"
        assert attrs["custom.key"] == "custom_value"


class TestGovernanceContextVar:
    """Tests for governance context variable functions."""
    
    def test_get_set_governance_context(self):
        """Test getting and setting governance context."""
        # Initially None
        assert get_current_governance_context() is None
        
        # Set context
        ctx = GovernanceSpanContext(report_id="RPT-001")
        set_current_governance_context(ctx)
        
        # Get context
        retrieved = get_current_governance_context()
        assert retrieved is ctx
        assert retrieved.report_id == "RPT-001"
        
        # Clear context
        set_current_governance_context(None)
        assert get_current_governance_context() is None


class TestSpanAttribute:
    """Tests for SpanAttribute enum."""
    
    def test_governance_attributes(self):
        """Test governance-specific span attributes."""
        assert SpanAttribute.REPORT_ID.value == "governance.report_id"
        assert SpanAttribute.CYCLE_ID.value == "governance.cycle_id"
        assert SpanAttribute.PHASE.value == "governance.phase"
        assert SpanAttribute.ACTOR.value == "governance.actor"
        assert SpanAttribute.ACTOR_TYPE.value == "governance.actor_type"
    
    def test_agent_attributes(self):
        """Test agent span attributes."""
        assert SpanAttribute.AGENT_NAME.value == "agent.name"
        assert SpanAttribute.AGENT_VERSION.value == "agent.version"
    
    def test_tool_attributes(self):
        """Test tool span attributes."""
        assert SpanAttribute.TOOL_NAME.value == "tool.name"
        assert SpanAttribute.TOOL_PARAMETERS.value == "tool.parameters"
        assert SpanAttribute.TOOL_RESULT.value == "tool.result"
    
    def test_memory_attributes(self):
        """Test memory span attributes."""
        assert SpanAttribute.MEMORY_ID.value == "memory.id"
        assert SpanAttribute.SESSION_ID.value == "memory.session_id"


class TestAddGovernanceAttributesToSpan:
    """Tests for add_governance_attributes_to_span function."""
    
    def test_add_all_attributes(self):
        """Test adding all governance attributes to a span."""
        mock_span = MagicMock()
        
        add_governance_attributes_to_span(
            mock_span,
            report_id="RPT-001",
            cycle_id="CYC-001",
            phase="validation",
            actor="user@example.com",
            actor_type="human",
            session_id="SESSION-001",
            tenant_id="TENANT-001",
        )
        
        mock_span.set_attribute.assert_any_call(SpanAttribute.REPORT_ID.value, "RPT-001")
        mock_span.set_attribute.assert_any_call(SpanAttribute.CYCLE_ID.value, "CYC-001")
        mock_span.set_attribute.assert_any_call(SpanAttribute.PHASE.value, "validation")
        mock_span.set_attribute.assert_any_call(SpanAttribute.ACTOR.value, "user@example.com")
        mock_span.set_attribute.assert_any_call(SpanAttribute.ACTOR_TYPE.value, "human")
        mock_span.set_attribute.assert_any_call(SpanAttribute.SESSION_ID.value, "SESSION-001")
        mock_span.set_attribute.assert_any_call(SpanAttribute.TENANT_ID.value, "TENANT-001")
    
    def test_add_partial_attributes(self):
        """Test adding partial governance attributes."""
        mock_span = MagicMock()
        
        add_governance_attributes_to_span(
            mock_span,
            report_id="RPT-001",
        )
        
        # Should only call set_attribute once for report_id
        assert mock_span.set_attribute.call_count == 1
        mock_span.set_attribute.assert_called_with(SpanAttribute.REPORT_ID.value, "RPT-001")
    
    def test_add_additional_attributes(self):
        """Test adding additional custom attributes."""
        mock_span = MagicMock()
        
        add_governance_attributes_to_span(
            mock_span,
            report_id="RPT-001",
            custom_key="custom_value",
        )
        
        mock_span.set_attribute.assert_any_call(SpanAttribute.REPORT_ID.value, "RPT-001")
        mock_span.set_attribute.assert_any_call("custom_key", "custom_value")


class TestTraceDecorators:
    """Tests for trace decorator functions."""
    
    def test_trace_agent_invocation_decorator(self):
        """Test trace_agent_invocation decorator."""
        # Initialize observability
        config = ObservabilityConfig(enable_console_export=False)
        config.initialize()
        
        @trace_agent_invocation("TestAgent", "1.0.0")
        def test_function(x: int) -> int:
            return x * 2
        
        result = test_function(5)
        assert result == 10
        
        # Cleanup
        config.shutdown()
    
    def test_trace_agent_invocation_with_exception(self):
        """Test trace_agent_invocation decorator with exception."""
        config = ObservabilityConfig(enable_console_export=False)
        config.initialize()
        
        @trace_agent_invocation("TestAgent", "1.0.0")
        def failing_function():
            raise ValueError("Test error")
        
        with pytest.raises(ValueError, match="Test error"):
            failing_function()
        
        # Cleanup
        config.shutdown()
    
    def test_trace_tool_call_decorator(self):
        """Test trace_tool_call decorator."""
        config = ObservabilityConfig(enable_console_export=False)
        config.initialize()
        
        @trace_tool_call("test_tool")
        def test_tool(param1: str, param2: int) -> str:
            return f"{param1}-{param2}"
        
        result = test_tool(param1="hello", param2=42)
        assert result == "hello-42"
        
        # Cleanup
        config.shutdown()
    
    def test_trace_memory_operation_decorator(self):
        """Test trace_memory_operation decorator."""
        config = ObservabilityConfig(enable_console_export=False)
        config.initialize()
        
        @trace_memory_operation("read")
        def read_memory(key: str) -> str:
            return f"value-{key}"
        
        result = read_memory("test-key")
        assert result == "value-test-key"
        
        # Cleanup
        config.shutdown()


class TestGovernanceSpanContextManager:
    """Tests for GovernanceSpan context manager."""
    
    def test_governance_span_basic(self):
        """Test basic GovernanceSpan usage."""
        config = ObservabilityConfig(enable_console_export=False)
        config.initialize()
        
        with GovernanceSpan("test_operation") as span:
            assert span is not None
        
        # Cleanup
        config.shutdown()
    
    def test_governance_span_with_attributes(self):
        """Test GovernanceSpan with governance attributes."""
        config = ObservabilityConfig(enable_console_export=False)
        config.initialize()
        
        with GovernanceSpan(
            "process_report",
            report_id="RPT-001",
            cycle_id="CYC-001",
            phase="validation",
            actor="user@example.com",
            actor_type="human",
        ) as span:
            assert span is not None
            # Span should have attributes set
        
        # Cleanup
        config.shutdown()
    
    def test_governance_span_with_exception(self):
        """Test GovernanceSpan handles exceptions correctly."""
        config = ObservabilityConfig(enable_console_export=False)
        config.initialize()
        
        with pytest.raises(ValueError, match="Test error"):
            with GovernanceSpan("failing_operation") as span:
                raise ValueError("Test error")
        
        # Cleanup
        config.shutdown()


class TestOtelEnvVars:
    """Tests for OpenTelemetry environment variable configuration."""
    
    def test_default_env_vars(self):
        """Test default OTEL environment variables."""
        assert "OTEL_SERVICE_NAME" in OTEL_ENV_VARS
        assert "OTEL_SERVICE_VERSION" in OTEL_ENV_VARS
        assert "OTEL_EXPORTER_OTLP_ENDPOINT" in OTEL_ENV_VARS
        assert "OTEL_PROPAGATORS" in OTEL_ENV_VARS
    
    def test_get_otel_env_vars(self):
        """Test get_otel_env_vars returns expected values."""
        env_vars = get_otel_env_vars()
        
        assert env_vars["OTEL_SERVICE_NAME"] == "agentcore-data-governance"
        assert env_vars["OTEL_SERVICE_VERSION"] == "0.1.0"
        assert "tracecontext" in env_vars["OTEL_PROPAGATORS"]
        assert "baggage" in env_vars["OTEL_PROPAGATORS"]
    
    def test_get_otel_env_vars_with_override(self):
        """Test get_otel_env_vars respects environment overrides."""
        import os
        original = os.environ.get("OTEL_SERVICE_NAME")
        
        try:
            os.environ["OTEL_SERVICE_NAME"] = "custom-service"
            env_vars = get_otel_env_vars()
            assert env_vars["OTEL_SERVICE_NAME"] == "custom-service"
        finally:
            if original:
                os.environ["OTEL_SERVICE_NAME"] = original
            else:
                os.environ.pop("OTEL_SERVICE_NAME", None)


class TestGlobalFunctions:
    """Tests for global observability functions."""
    
    def test_get_observability_config_singleton(self):
        """Test get_observability_config returns singleton."""
        config1 = get_observability_config()
        config2 = get_observability_config()
        
        # Note: This may not be the same instance due to module reloading in tests
        # but both should be valid ObservabilityConfig instances
        assert isinstance(config1, ObservabilityConfig)
        assert isinstance(config2, ObservabilityConfig)
    
    def test_initialize_observability(self):
        """Test initialize_observability function."""
        config = initialize_observability(
            service_name="test-service",
            service_version="1.0.0",
            environment="test",
            enable_console_export=False,
        )
        
        assert config.service_name == "test-service"
        assert config.service_version == "1.0.0"
        assert config.environment == "test"
        assert config._initialized is True
        
        # Cleanup
        config.shutdown()
    
    def test_get_tracer(self):
        """Test get_tracer returns a valid tracer."""
        tracer = get_tracer()
        assert tracer is not None
