"""
AgentCore Observability Configuration.

Provides OpenTelemetry instrumentation for comprehensive tracing and monitoring
of all agents in the data governance system.

Requirements: 17.1, 17.2, 17.3, 17.4, 17.5
"""

import os
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from functools import wraps
from typing import Any, Callable, Dict, List, Optional, TypeVar, Union

# OpenTelemetry imports
from opentelemetry import trace, baggage, context
from opentelemetry.trace import Span, SpanKind, Status, StatusCode, Tracer
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.propagate import set_global_textmap, inject, extract
from opentelemetry.propagators.composite import CompositePropagator
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.baggage.propagation import W3CBaggagePropagator


# Type variable for generic function decoration
F = TypeVar('F', bound=Callable[..., Any])


class SpanAttribute(str, Enum):
    """Standard span attributes for governance operations."""
    # Governance-specific attributes
    REPORT_ID = "governance.report_id"
    CYCLE_ID = "governance.cycle_id"
    PHASE = "governance.phase"
    ACTOR = "governance.actor"
    ACTOR_TYPE = "governance.actor_type"
    
    # Agent attributes
    AGENT_NAME = "agent.name"
    AGENT_VERSION = "agent.version"
    
    # Tool attributes
    TOOL_NAME = "tool.name"
    TOOL_PARAMETERS = "tool.parameters"
    TOOL_RESULT = "tool.result"
    
    # Memory attributes
    MEMORY_ID = "memory.id"
    SESSION_ID = "memory.session_id"
    
    # Entity attributes
    ENTITY_TYPE = "entity.type"
    ENTITY_ID = "entity.id"
    
    # Tenant attributes (for multi-tenancy)
    TENANT_ID = "tenant.id"


@dataclass
class GovernanceSpanContext:
    """Context for governance-specific span attributes."""
    report_id: Optional[str] = None
    cycle_id: Optional[str] = None
    phase: Optional[str] = None
    actor: Optional[str] = None
    actor_type: Optional[str] = None
    tenant_id: Optional[str] = None
    session_id: Optional[str] = None
    memory_id: Optional[str] = None
    additional_attributes: Dict[str, Any] = field(default_factory=dict)
    
    def to_attributes(self) -> Dict[str, Any]:
        """Convert context to span attributes dictionary."""
        attrs = {}
        if self.report_id:
            attrs[SpanAttribute.REPORT_ID.value] = self.report_id
        if self.cycle_id:
            attrs[SpanAttribute.CYCLE_ID.value] = self.cycle_id
        if self.phase:
            attrs[SpanAttribute.PHASE.value] = self.phase
        if self.actor:
            attrs[SpanAttribute.ACTOR.value] = self.actor
        if self.actor_type:
            attrs[SpanAttribute.ACTOR_TYPE.value] = self.actor_type
        if self.tenant_id:
            attrs[SpanAttribute.TENANT_ID.value] = self.tenant_id
        if self.session_id:
            attrs[SpanAttribute.SESSION_ID.value] = self.session_id
        if self.memory_id:
            attrs[SpanAttribute.MEMORY_ID.value] = self.memory_id
        attrs.update(self.additional_attributes)
        return attrs


# Context variable for current governance span context
_current_governance_context: ContextVar[Optional[GovernanceSpanContext]] = ContextVar(
    'current_governance_context', default=None
)


def get_current_governance_context() -> Optional[GovernanceSpanContext]:
    """Get the current governance span context."""
    return _current_governance_context.get()


def set_current_governance_context(ctx: Optional[GovernanceSpanContext]) -> None:
    """Set the current governance span context."""
    _current_governance_context.set(ctx)


class ObservabilityConfig:
    """Configuration for OpenTelemetry observability."""
    
    def __init__(
        self,
        service_name: str = "agentcore-data-governance",
        service_version: str = "0.1.0",
        environment: Optional[str] = None,
        enable_console_export: bool = False,
        otlp_endpoint: Optional[str] = None,
    ):
        """
        Initialize observability configuration.
        
        Args:
            service_name: Name of the service for tracing.
            service_version: Version of the service.
            environment: Deployment environment (dev, staging, prod).
            enable_console_export: Whether to export spans to console.
            otlp_endpoint: OTLP exporter endpoint (for AWS X-Ray, etc.).
        """
        self.service_name = service_name
        self.service_version = service_version
        self.environment = environment or os.environ.get("ENVIRONMENT", "development")
        self.enable_console_export = enable_console_export
        self.otlp_endpoint = otlp_endpoint or os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
        
        self._tracer_provider: Optional[TracerProvider] = None
        self._tracer: Optional[Tracer] = None
        self._initialized = False
    
    def initialize(self) -> None:
        """
        Initialize OpenTelemetry instrumentation.
        
        Sets up the tracer provider with appropriate exporters and propagators.
        This should be called once at application startup.
        """
        if self._initialized:
            return
        
        # Create resource with service information
        resource = Resource.create({
            SERVICE_NAME: self.service_name,
            SERVICE_VERSION: self.service_version,
            "deployment.environment": self.environment,
        })
        
        # Create tracer provider
        self._tracer_provider = TracerProvider(resource=resource)
        
        # Add console exporter for development
        if self.enable_console_export:
            console_exporter = ConsoleSpanExporter()
            self._tracer_provider.add_span_processor(
                BatchSpanProcessor(console_exporter)
            )
        
        # Add OTLP exporter for production (AWS X-Ray via ADOT)
        if self.otlp_endpoint:
            try:
                from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
                otlp_exporter = OTLPSpanExporter(endpoint=self.otlp_endpoint)
                self._tracer_provider.add_span_processor(
                    BatchSpanProcessor(otlp_exporter)
                )
            except ImportError:
                # OTLP exporter not available, skip
                pass
        
        # Set global tracer provider
        trace.set_tracer_provider(self._tracer_provider)
        
        # Set up propagators for context propagation
        propagator = CompositePropagator([
            TraceContextTextMapPropagator(),
            W3CBaggagePropagator(),
        ])
        set_global_textmap(propagator)
        
        # Get tracer
        self._tracer = trace.get_tracer(
            self.service_name,
            self.service_version
        )
        
        self._initialized = True
    
    def get_tracer(self) -> Tracer:
        """Get the configured tracer instance."""
        if not self._initialized:
            self.initialize()
        return self._tracer
    
    def shutdown(self) -> None:
        """Shutdown the tracer provider and flush pending spans."""
        if self._tracer_provider:
            self._tracer_provider.shutdown()
            self._initialized = False


# Global observability configuration instance
_observability_config: Optional[ObservabilityConfig] = None


def get_observability_config() -> ObservabilityConfig:
    """Get or create the global observability configuration."""
    global _observability_config
    if _observability_config is None:
        _observability_config = ObservabilityConfig(
            enable_console_export=os.environ.get("OTEL_CONSOLE_EXPORT", "").lower() == "true"
        )
    return _observability_config


def initialize_observability(
    service_name: str = "agentcore-data-governance",
    service_version: str = "0.1.0",
    environment: Optional[str] = None,
    enable_console_export: bool = False,
    otlp_endpoint: Optional[str] = None,
) -> ObservabilityConfig:
    """
    Initialize observability for the application.
    
    This should be called once at application startup.
    
    Args:
        service_name: Name of the service for tracing.
        service_version: Version of the service.
        environment: Deployment environment.
        enable_console_export: Whether to export spans to console.
        otlp_endpoint: OTLP exporter endpoint.
        
    Returns:
        The configured ObservabilityConfig instance.
    """
    global _observability_config
    _observability_config = ObservabilityConfig(
        service_name=service_name,
        service_version=service_version,
        environment=environment,
        enable_console_export=enable_console_export,
        otlp_endpoint=otlp_endpoint,
    )
    _observability_config.initialize()
    return _observability_config


def get_tracer() -> Tracer:
    """Get the global tracer instance."""
    return get_observability_config().get_tracer()




# =============================================================================
# Governance-Specific Span Attributes and Session Correlation
# Requirements: 17.3, 17.4
# =============================================================================


def set_governance_baggage(
    report_id: Optional[str] = None,
    cycle_id: Optional[str] = None,
    phase: Optional[str] = None,
    actor: Optional[str] = None,
    actor_type: Optional[str] = None,
    session_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> context.Context:
    """
    Set governance-specific baggage for cross-agent correlation.
    
    Baggage is propagated across service boundaries, allowing traces
    to be correlated across agent invocations.
    
    Args:
        report_id: The regulatory report ID.
        cycle_id: The report cycle ID.
        phase: The current workflow phase.
        actor: The actor performing the action.
        actor_type: Type of actor (agent, human, system).
        session_id: The session ID for conversation grouping.
        tenant_id: The tenant ID for multi-tenancy.
        
    Returns:
        Updated context with baggage set.
    """
    ctx = context.get_current()
    
    if report_id:
        ctx = baggage.set_baggage("governance.report_id", report_id, ctx)
    if cycle_id:
        ctx = baggage.set_baggage("governance.cycle_id", cycle_id, ctx)
    if phase:
        ctx = baggage.set_baggage("governance.phase", phase, ctx)
    if actor:
        ctx = baggage.set_baggage("governance.actor", actor, ctx)
    if actor_type:
        ctx = baggage.set_baggage("governance.actor_type", actor_type, ctx)
    if session_id:
        ctx = baggage.set_baggage("governance.session_id", session_id, ctx)
    if tenant_id:
        ctx = baggage.set_baggage("governance.tenant_id", tenant_id, ctx)
    
    return ctx


def get_governance_baggage() -> Dict[str, Optional[str]]:
    """
    Get governance-specific baggage from the current context.
    
    Returns:
        Dictionary of governance baggage values.
    """
    return {
        "report_id": baggage.get_baggage("governance.report_id"),
        "cycle_id": baggage.get_baggage("governance.cycle_id"),
        "phase": baggage.get_baggage("governance.phase"),
        "actor": baggage.get_baggage("governance.actor"),
        "actor_type": baggage.get_baggage("governance.actor_type"),
        "session_id": baggage.get_baggage("governance.session_id"),
        "tenant_id": baggage.get_baggage("governance.tenant_id"),
    }


def add_governance_attributes_to_span(
    span: Span,
    report_id: Optional[str] = None,
    cycle_id: Optional[str] = None,
    phase: Optional[str] = None,
    actor: Optional[str] = None,
    actor_type: Optional[str] = None,
    session_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    **additional_attributes: Any,
) -> None:
    """
    Add governance-specific attributes to a span.
    
    Args:
        span: The span to add attributes to.
        report_id: The regulatory report ID.
        cycle_id: The report cycle ID.
        phase: The current workflow phase.
        actor: The actor performing the action.
        actor_type: Type of actor (agent, human, system).
        session_id: The session ID.
        tenant_id: The tenant ID.
        **additional_attributes: Additional custom attributes.
    """
    if report_id:
        span.set_attribute(SpanAttribute.REPORT_ID.value, report_id)
    if cycle_id:
        span.set_attribute(SpanAttribute.CYCLE_ID.value, cycle_id)
    if phase:
        span.set_attribute(SpanAttribute.PHASE.value, phase)
    if actor:
        span.set_attribute(SpanAttribute.ACTOR.value, actor)
    if actor_type:
        span.set_attribute(SpanAttribute.ACTOR_TYPE.value, actor_type)
    if session_id:
        span.set_attribute(SpanAttribute.SESSION_ID.value, session_id)
    if tenant_id:
        span.set_attribute(SpanAttribute.TENANT_ID.value, tenant_id)
    
    for key, value in additional_attributes.items():
        if value is not None:
            span.set_attribute(key, str(value) if not isinstance(value, (str, int, float, bool)) else value)


def add_baggage_attributes_to_span(span: Span) -> None:
    """
    Add governance baggage values as span attributes.
    
    This ensures that baggage values are recorded in the span
    for visibility in trace viewers.
    
    Args:
        span: The span to add attributes to.
    """
    baggage_values = get_governance_baggage()
    for key, value in baggage_values.items():
        if value:
            span.set_attribute(f"governance.{key}", value)


# =============================================================================
# Decorators for Instrumentation
# =============================================================================


def trace_agent_invocation(
    agent_name: str,
    agent_version: str = "1.0.0",
) -> Callable[[F], F]:
    """
    Decorator to trace agent invocations.
    
    Creates a span for the agent invocation with governance-specific attributes.
    
    Args:
        agent_name: Name of the agent being invoked.
        agent_version: Version of the agent.
        
    Returns:
        Decorated function.
    """
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            tracer = get_tracer()
            
            with tracer.start_as_current_span(
                f"agent.{agent_name}.invoke",
                kind=SpanKind.SERVER,
            ) as span:
                # Add agent attributes
                span.set_attribute(SpanAttribute.AGENT_NAME.value, agent_name)
                span.set_attribute(SpanAttribute.AGENT_VERSION.value, agent_version)
                
                # Add baggage attributes
                add_baggage_attributes_to_span(span)
                
                # Add governance context if available
                gov_ctx = get_current_governance_context()
                if gov_ctx:
                    for key, value in gov_ctx.to_attributes().items():
                        span.set_attribute(key, value)
                
                try:
                    result = func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    return result
                except Exception as e:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    span.record_exception(e)
                    raise
        
        return wrapper  # type: ignore
    return decorator


def trace_tool_call(tool_name: str) -> Callable[[F], F]:
    """
    Decorator to trace tool calls.
    
    Creates a span for the tool call with parameters and results.
    
    Args:
        tool_name: Name of the tool being called.
        
    Returns:
        Decorated function.
    """
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            tracer = get_tracer()
            
            with tracer.start_as_current_span(
                f"tool.{tool_name}",
                kind=SpanKind.INTERNAL,
            ) as span:
                # Add tool attributes
                span.set_attribute(SpanAttribute.TOOL_NAME.value, tool_name)
                
                # Add parameters (sanitized)
                if kwargs:
                    # Only include non-sensitive parameters
                    safe_params = {
                        k: str(v)[:100] for k, v in kwargs.items()
                        if k not in ('password', 'token', 'secret', 'key')
                    }
                    span.set_attribute(SpanAttribute.TOOL_PARAMETERS.value, str(safe_params))
                
                # Add baggage attributes
                add_baggage_attributes_to_span(span)
                
                try:
                    result = func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    
                    # Record result type (not full result for privacy)
                    if result is not None:
                        span.set_attribute("tool.result_type", type(result).__name__)
                    
                    return result
                except Exception as e:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    span.record_exception(e)
                    raise
        
        return wrapper  # type: ignore
    return decorator


def trace_memory_operation(operation: str) -> Callable[[F], F]:
    """
    Decorator to trace memory operations.
    
    Creates a span for memory read/write operations.
    
    Args:
        operation: Type of memory operation (read, write, query).
        
    Returns:
        Decorated function.
    """
    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            tracer = get_tracer()
            
            with tracer.start_as_current_span(
                f"memory.{operation}",
                kind=SpanKind.CLIENT,
            ) as span:
                # Add memory operation attributes
                span.set_attribute("memory.operation", operation)
                
                # Extract memory_id if available
                if hasattr(args[0], 'memory_id') if args else False:
                    span.set_attribute(SpanAttribute.MEMORY_ID.value, args[0].memory_id)
                
                # Add baggage attributes
                add_baggage_attributes_to_span(span)
                
                try:
                    result = func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    return result
                except Exception as e:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    span.record_exception(e)
                    raise
        
        return wrapper  # type: ignore
    return decorator


# =============================================================================
# Context Manager for Governance Spans
# =============================================================================


class GovernanceSpan:
    """
    Context manager for creating governance-specific spans.
    
    Usage:
        with GovernanceSpan("process_report", report_id="RPT-001", cycle_id="CYC-001") as span:
            # Do work
            span.add_event("Processing started")
    """
    
    def __init__(
        self,
        name: str,
        kind: SpanKind = SpanKind.INTERNAL,
        report_id: Optional[str] = None,
        cycle_id: Optional[str] = None,
        phase: Optional[str] = None,
        actor: Optional[str] = None,
        actor_type: Optional[str] = None,
        session_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        **attributes: Any,
    ):
        """
        Initialize a governance span.
        
        Args:
            name: Name of the span.
            kind: Kind of span (INTERNAL, SERVER, CLIENT, etc.).
            report_id: The regulatory report ID.
            cycle_id: The report cycle ID.
            phase: The current workflow phase.
            actor: The actor performing the action.
            actor_type: Type of actor.
            session_id: The session ID.
            tenant_id: The tenant ID.
            **attributes: Additional span attributes.
        """
        self.name = name
        self.kind = kind
        self.report_id = report_id
        self.cycle_id = cycle_id
        self.phase = phase
        self.actor = actor
        self.actor_type = actor_type
        self.session_id = session_id
        self.tenant_id = tenant_id
        self.attributes = attributes
        self._span: Optional[Span] = None
        self._token = None
    
    def __enter__(self) -> Span:
        """Enter the span context."""
        tracer = get_tracer()
        self._span = tracer.start_span(self.name, kind=self.kind)
        self._token = context.attach(trace.set_span_in_context(self._span))
        
        # Add governance attributes
        add_governance_attributes_to_span(
            self._span,
            report_id=self.report_id,
            cycle_id=self.cycle_id,
            phase=self.phase,
            actor=self.actor,
            actor_type=self.actor_type,
            session_id=self.session_id,
            tenant_id=self.tenant_id,
            **self.attributes,
        )
        
        # Add baggage attributes
        add_baggage_attributes_to_span(self._span)
        
        return self._span
    
    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Exit the span context."""
        if self._span:
            if exc_type is not None:
                self._span.set_status(Status(StatusCode.ERROR, str(exc_val)))
                self._span.record_exception(exc_val)
            else:
                self._span.set_status(Status(StatusCode.OK))
            self._span.end()
        
        if self._token:
            context.detach(self._token)


# =============================================================================
# Environment Variable Configuration
# =============================================================================

# Standard OpenTelemetry environment variables for AWS ADOT
OTEL_ENV_VARS = {
    # Service identification
    "OTEL_SERVICE_NAME": "agentcore-data-governance",
    "OTEL_SERVICE_VERSION": "0.1.0",
    
    # OTLP exporter configuration (for AWS X-Ray via ADOT)
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
    
    # Propagators for context propagation
    "OTEL_PROPAGATORS": "tracecontext,baggage,xray",
    
    # Resource attributes
    "OTEL_RESOURCE_ATTRIBUTES": "service.namespace=data-governance,deployment.environment=development",
    
    # Sampling (1.0 = 100% sampling for development)
    "OTEL_TRACES_SAMPLER": "parentbased_always_on",
    
    # AWS X-Ray specific
    "AWS_XRAY_DAEMON_ADDRESS": "127.0.0.1:2000",
    
    # Console export for development
    "OTEL_CONSOLE_EXPORT": "false",
}


def get_otel_env_vars() -> Dict[str, str]:
    """
    Get OpenTelemetry environment variables with defaults.
    
    Returns:
        Dictionary of environment variable names and values.
    """
    return {
        key: os.environ.get(key, default)
        for key, default in OTEL_ENV_VARS.items()
    }


def print_otel_config() -> None:
    """Print current OpenTelemetry configuration for debugging."""
    print("OpenTelemetry Configuration:")
    print("-" * 40)
    for key, value in get_otel_env_vars().items():
        print(f"  {key}: {value}")
    print("-" * 40)
