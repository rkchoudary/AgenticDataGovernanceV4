"""
Integration tests for Observability Configuration.

Verifies that spans are created with correct governance-specific attributes
and that session correlation works across agent invocations.

Requirements: 17.2, 17.3
"""

import pytest
from unittest.mock import MagicMock, patch
from opentelemetry import trace, baggage, context
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanKind, StatusCode

from services.observability_config import (
    ObservabilityConfig,
    GovernanceSpan,
    GovernanceSpanContext,
    SpanAttribute,
    initialize_observability,
    get_tracer,
    set_current_governance_context,
    get_current_governance_context,
    set_governance_baggage,
    get_governance_baggage,
    add_governance_attributes_to_span,
    trace_agent_invocation,
    trace_tool_call,
    trace_memory_operation,
)


# Module-level setup for tracer provider
_test_exporter = InMemorySpanExporter()
_test_provider = TracerProvider()
_test_provider.add_span_processor(SimpleSpanProcessor(_test_exporter))
trace.set_tracer_provider(_test_provider)


@pytest.fixture(autouse=True)
def clear_spans():
    """Clear spans before each test."""
    _test_exporter.clear()
    yield
    _test_exporter.clear()


class TestSpanCreationWithAttributes:
    """Integration tests for span creation with governance attributes."""
    
    def test_governance_span_creates_span_with_attributes(self):
        """
        Test that GovernanceSpan creates spans with correct governance attributes.
        
        Requirements: 17.2, 17.3
        """
        with GovernanceSpan(
            "test_operation",
            report_id="RPT-001",
            cycle_id="CYC-001",
            phase="data_gathering",
            actor="user@example.com",
            actor_type="human",
            session_id="SESSION-001",
            tenant_id="TENANT-001",
        ):
            pass  # Span is created and ended
        
        spans = _test_exporter.get_finished_spans()
        assert len(spans) == 1
        
        span = spans[0]
        assert span.name == "test_operation"
        
        # Verify governance attributes
        attrs = dict(span.attributes)
        assert attrs.get(SpanAttribute.REPORT_ID.value) == "RPT-001"
        assert attrs.get(SpanAttribute.CYCLE_ID.value) == "CYC-001"
        assert attrs.get(SpanAttribute.PHASE.value) == "data_gathering"
        assert attrs.get(SpanAttribute.ACTOR.value) == "user@example.com"
        assert attrs.get(SpanAttribute.ACTOR_TYPE.value) == "human"
        assert attrs.get(SpanAttribute.SESSION_ID.value) == "SESSION-001"
        assert attrs.get(SpanAttribute.TENANT_ID.value) == "TENANT-001"
    
    def test_nested_spans_inherit_context(self):
        """
        Test that nested spans properly inherit parent context.
        
        Requirements: 17.2, 17.3
        """
        with GovernanceSpan(
            "parent_operation",
            report_id="RPT-001",
            cycle_id="CYC-001",
        ) as parent_span:
            with GovernanceSpan(
                "child_operation",
                phase="validation",
            ) as child_span:
                pass
        
        spans = _test_exporter.get_finished_spans()
        assert len(spans) == 2
        
        # Find parent and child spans
        parent = next(s for s in spans if s.name == "parent_operation")
        child = next(s for s in spans if s.name == "child_operation")
        
        # Child should have parent as its parent context
        assert child.parent is not None
        assert child.parent.span_id == parent.context.span_id
    
    def test_span_records_exception_on_error(self):
        """
        Test that spans properly record exceptions.
        
        Requirements: 17.2
        """
        with pytest.raises(ValueError, match="Test error"):
            with GovernanceSpan("failing_operation", report_id="RPT-001"):
                raise ValueError("Test error")
        
        spans = _test_exporter.get_finished_spans()
        assert len(spans) == 1
        
        span = spans[0]
        assert span.status.status_code == StatusCode.ERROR
        assert "Test error" in span.status.description
        
        # Check that exception was recorded
        events = span.events
        exception_events = [e for e in events if e.name == "exception"]
        assert len(exception_events) == 1


class TestSessionCorrelation:
    """Integration tests for session correlation with baggage."""
    
    def test_baggage_propagation_across_spans(self):
        """
        Test that baggage values are propagated across spans.
        
        Requirements: 17.4
        """
        # Set governance baggage
        ctx = set_governance_baggage(
            report_id="RPT-001",
            cycle_id="CYC-001",
            phase="data_gathering",
            actor="user@example.com",
            actor_type="human",
            session_id="SESSION-001",
            tenant_id="TENANT-001",
        )
        
        # Attach context
        token = context.attach(ctx)
        
        try:
            # Verify baggage values
            baggage_values = get_governance_baggage()
            assert baggage_values["report_id"] == "RPT-001"
            assert baggage_values["cycle_id"] == "CYC-001"
            assert baggage_values["phase"] == "data_gathering"
            assert baggage_values["actor"] == "user@example.com"
            assert baggage_values["actor_type"] == "human"
            assert baggage_values["session_id"] == "SESSION-001"
            assert baggage_values["tenant_id"] == "TENANT-001"
        finally:
            context.detach(token)
    
    def test_governance_context_propagation(self):
        """
        Test that governance context is properly propagated.
        
        Requirements: 17.3, 17.4
        """
        # Set governance context
        gov_ctx = GovernanceSpanContext(
            report_id="RPT-001",
            cycle_id="CYC-001",
            phase="validation",
            actor="agent",
            actor_type="agent",
        )
        set_current_governance_context(gov_ctx)
        
        # Verify context is retrievable
        retrieved = get_current_governance_context()
        assert retrieved is gov_ctx
        assert retrieved.report_id == "RPT-001"
        assert retrieved.cycle_id == "CYC-001"
        assert retrieved.phase == "validation"
        
        # Clear context
        set_current_governance_context(None)
        assert get_current_governance_context() is None


class TestDecoratorIntegration:
    """Integration tests for trace decorators."""
    
    def test_trace_agent_invocation_creates_span(self):
        """
        Test that trace_agent_invocation decorator creates proper spans.
        
        Requirements: 17.2, 17.3
        """
        @trace_agent_invocation("TestAgent", "1.0.0")
        def test_agent_function(prompt: str) -> str:
            return f"Response to: {prompt}"
        
        result = test_agent_function("Hello")
        assert result == "Response to: Hello"
        
        spans = _test_exporter.get_finished_spans()
        assert len(spans) == 1
        
        span = spans[0]
        assert span.name == "agent.TestAgent.invoke"
        assert span.kind == SpanKind.SERVER
        
        attrs = dict(span.attributes)
        assert attrs.get(SpanAttribute.AGENT_NAME.value) == "TestAgent"
        assert attrs.get(SpanAttribute.AGENT_VERSION.value) == "1.0.0"
    
    def test_trace_tool_call_creates_span(self):
        """
        Test that trace_tool_call decorator creates proper spans.
        
        Requirements: 17.2, 17.3
        """
        @trace_tool_call("scan_regulatory_sources")
        def scan_sources(jurisdictions: list) -> dict:
            return {"scanned": len(jurisdictions)}
        
        result = scan_sources(jurisdictions=["US", "CA"])
        assert result == {"scanned": 2}
        
        spans = _test_exporter.get_finished_spans()
        assert len(spans) == 1
        
        span = spans[0]
        assert span.name == "tool.scan_regulatory_sources"
        assert span.kind == SpanKind.INTERNAL
        
        attrs = dict(span.attributes)
        assert attrs.get(SpanAttribute.TOOL_NAME.value) == "scan_regulatory_sources"
    
    def test_trace_memory_operation_creates_span(self):
        """
        Test that trace_memory_operation decorator creates proper spans.
        
        Requirements: 17.2
        """
        @trace_memory_operation("write")
        def write_to_memory(key: str, value: str) -> bool:
            return True
        
        result = write_to_memory("test-key", "test-value")
        assert result is True
        
        spans = _test_exporter.get_finished_spans()
        assert len(spans) == 1
        
        span = spans[0]
        assert span.name == "memory.write"
        assert span.kind == SpanKind.CLIENT
        
        attrs = dict(span.attributes)
        assert attrs.get("memory.operation") == "write"


class TestAgentInvocationWithObservability:
    """Integration tests for agent invocation with observability."""
    
    def test_full_agent_workflow_creates_spans(self):
        """
        Test that a full agent workflow creates proper span hierarchy.
        
        Requirements: 17.2, 17.3, 17.4
        """
        # Set up governance context
        gov_ctx = GovernanceSpanContext(
            report_id="RPT-001",
            cycle_id="CYC-001",
            phase="data_gathering",
            actor="compliance_officer",
            actor_type="human",
            session_id="SESSION-001",
        )
        set_current_governance_context(gov_ctx)
        
        # Set baggage for correlation
        ctx = set_governance_baggage(
            report_id="RPT-001",
            cycle_id="CYC-001",
            session_id="SESSION-001",
        )
        token = context.attach(ctx)
        
        try:
            # Simulate agent invocation with tool calls
            with GovernanceSpan(
                "agent.regulatory_intelligence.invoke",
                report_id="RPT-001",
                cycle_id="CYC-001",
            ):
                # Simulate tool call
                @trace_tool_call("scan_regulatory_sources")
                def scan_sources():
                    return {"reports": 5}
                
                scan_sources()
                
                # Simulate memory operation
                @trace_memory_operation("write")
                def save_results():
                    return True
                
                save_results()
        finally:
            context.detach(token)
            set_current_governance_context(None)
        
        spans = _test_exporter.get_finished_spans()
        assert len(spans) == 3
        
        # Verify span names
        span_names = {s.name for s in spans}
        assert "agent.regulatory_intelligence.invoke" in span_names
        assert "tool.scan_regulatory_sources" in span_names
        assert "memory.write" in span_names
        
        # Verify parent-child relationships
        agent_span = next(s for s in spans if "invoke" in s.name)
        tool_span = next(s for s in spans if "tool" in s.name)
        memory_span = next(s for s in spans if "memory" in s.name)
        
        # Tool and memory spans should have agent span as parent
        assert tool_span.parent.span_id == agent_span.context.span_id
        assert memory_span.parent.span_id == agent_span.context.span_id


class TestMultiAgentCorrelation:
    """Integration tests for multi-agent trace correlation."""
    
    def test_baggage_correlates_across_agents(self):
        """
        Test that baggage enables correlation across agent invocations.
        
        Requirements: 17.4
        """
        # Set up shared baggage for correlation
        ctx = set_governance_baggage(
            report_id="RPT-001",
            cycle_id="CYC-001",
            session_id="SESSION-001",
        )
        token = context.attach(ctx)
        
        try:
            # First agent invocation
            with GovernanceSpan(
                "agent.regulatory_intelligence.invoke",
                report_id="RPT-001",
            ):
                pass
            
            # Second agent invocation (simulating orchestrator calling another agent)
            with GovernanceSpan(
                "agent.data_requirements.invoke",
                report_id="RPT-001",
            ):
                pass
        finally:
            context.detach(token)
        
        spans = _test_exporter.get_finished_spans()
        assert len(spans) == 2
        
        # Both spans should have the same report_id attribute
        for span in spans:
            attrs = dict(span.attributes)
            assert attrs.get(SpanAttribute.REPORT_ID.value) == "RPT-001"


class TestObservabilityConfiguration:
    """Integration tests for observability configuration."""
    
    def test_initialize_observability_configures_tracer(self):
        """
        Test that initialize_observability properly configures the tracer.
        
        Requirements: 17.1, 17.2
        """
        config = initialize_observability(
            service_name="test-service",
            service_version="1.0.0",
            environment="test",
            enable_console_export=False,
        )
        
        assert config._initialized is True
        assert config.service_name == "test-service"
        assert config.service_version == "1.0.0"
        assert config.environment == "test"
        
        # Verify tracer is available
        tracer = config.get_tracer()
        assert tracer is not None
        
        # Cleanup
        config.shutdown()
    
    def test_get_tracer_returns_valid_tracer(self):
        """
        Test that get_tracer returns a valid tracer instance.
        
        Requirements: 17.1
        """
        tracer = get_tracer()
        assert tracer is not None
        
        # Verify tracer can create spans
        with tracer.start_as_current_span("test_span") as span:
            assert span is not None
