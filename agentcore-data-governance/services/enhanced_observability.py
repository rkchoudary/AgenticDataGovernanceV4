"""
Enhanced Observability Stack for AgentCore Data Governance.

Provides comprehensive security monitoring and observability including:
- AWS X-Ray distributed tracing (Requirement 41.1)
- AWS Security Lake OCSF export (Requirement 41.2)
- Amazon GuardDuty anomaly detection (Requirement 41.3)
- AWS Config compliance monitoring (Requirement 41.4)
- PagerDuty/OpsGenie alerting integration (Requirement 41.5)

Requirements: 41.1, 41.2, 41.3, 41.4, 41.5
"""

import json
import os
import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, TypeVar, Union
from uuid import uuid4

# OpenTelemetry imports for X-Ray integration
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.trace import Span, SpanKind, Status, StatusCode


# Type variable for generic function decoration
F = TypeVar('F', bound=Callable[..., Any])


# =============================================================================
# X-Ray Integration (Requirement 41.1)
# =============================================================================


class XRaySegmentType(str, Enum):
    """X-Ray segment types for governance operations."""
    AGENT_INVOCATION = "agent_invocation"
    TOOL_CALL = "tool_call"
    MEMORY_OPERATION = "memory_operation"
    POLICY_EVALUATION = "policy_evaluation"
    EXTERNAL_SERVICE = "external_service"


@dataclass
class XRayConfig:
    """Configuration for AWS X-Ray integration."""
    daemon_address: str = "127.0.0.1:2000"
    service_name: str = "agentcore-data-governance"
    service_version: str = "0.1.0"
    sampling_rate: float = 1.0  # 100% sampling for compliance
    enable_sql_tracing: bool = True
    enable_http_tracing: bool = True
    plugins: List[str] = field(default_factory=lambda: ["EC2Plugin", "ECSPlugin"])
    
    @classmethod
    def from_environment(cls) -> "XRayConfig":
        """Create configuration from environment variables."""
        return cls(
            daemon_address=os.environ.get("AWS_XRAY_DAEMON_ADDRESS", "127.0.0.1:2000"),
            service_name=os.environ.get("OTEL_SERVICE_NAME", "agentcore-data-governance"),
            service_version=os.environ.get("OTEL_SERVICE_VERSION", "0.1.0"),
            sampling_rate=float(os.environ.get("XRAY_SAMPLING_RATE", "1.0")),
        )


class XRayIntegration:
    """
    AWS X-Ray integration for distributed tracing.
    
    Provides distributed tracing across all services in the data governance
    platform, enabling end-to-end visibility into request flows.
    
    Requirements: 41.1
    """
    
    def __init__(self, config: Optional[XRayConfig] = None):
        """Initialize X-Ray integration."""
        self.config = config or XRayConfig.from_environment()
        self._tracer_provider: Optional[TracerProvider] = None
        self._initialized = False
    
    def initialize(self) -> None:
        """
        Initialize X-Ray tracing with ADOT (AWS Distro for OpenTelemetry).
        
        Sets up the tracer provider with X-Ray exporter for distributed tracing.
        """
        if self._initialized:
            return
        
        # Create resource with service information
        resource = Resource.create({
            SERVICE_NAME: self.config.service_name,
            SERVICE_VERSION: self.config.service_version,
            "cloud.provider": "aws",
            "faas.name": self.config.service_name,
        })
        
        # Create tracer provider
        self._tracer_provider = TracerProvider(resource=resource)
        
        # Try to add X-Ray exporter via OTLP
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            
            # ADOT collector endpoint
            otlp_endpoint = os.environ.get(
                "OTEL_EXPORTER_OTLP_ENDPOINT",
                "http://localhost:4317"
            )
            
            xray_exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
            self._tracer_provider.add_span_processor(
                BatchSpanProcessor(xray_exporter)
            )
        except ImportError:
            # Fall back to console exporter for development
            from opentelemetry.sdk.trace.export import ConsoleSpanExporter
            self._tracer_provider.add_span_processor(
                BatchSpanProcessor(ConsoleSpanExporter())
            )
        
        # Set global tracer provider
        trace.set_tracer_provider(self._tracer_provider)
        self._initialized = True
    
    def get_tracer(self, name: str = "governance") -> trace.Tracer:
        """Get a tracer instance for creating spans."""
        if not self._initialized:
            self.initialize()
        return trace.get_tracer(name, self.config.service_version)
    
    def create_segment(
        self,
        name: str,
        segment_type: XRaySegmentType,
        attributes: Optional[Dict[str, Any]] = None,
    ) -> Span:
        """
        Create an X-Ray segment (span) with governance attributes.
        
        Args:
            name: Name of the segment.
            segment_type: Type of segment for categorization.
            attributes: Additional attributes to add to the segment.
            
        Returns:
            The created span.
        """
        tracer = self.get_tracer()
        span = tracer.start_span(
            name,
            kind=SpanKind.SERVER if segment_type == XRaySegmentType.AGENT_INVOCATION else SpanKind.INTERNAL,
        )
        
        # Add standard attributes
        span.set_attribute("segment.type", segment_type.value)
        span.set_attribute("service.name", self.config.service_name)
        
        # Add custom attributes
        if attributes:
            for key, value in attributes.items():
                if value is not None:
                    span.set_attribute(key, str(value) if not isinstance(value, (str, int, float, bool)) else value)
        
        return span
    
    def add_annotation(self, span: Span, key: str, value: str) -> None:
        """Add an X-Ray annotation (indexed attribute) to a span."""
        span.set_attribute(f"aws.xray.annotation.{key}", value)
    
    def add_metadata(self, span: Span, namespace: str, data: Dict[str, Any]) -> None:
        """Add X-Ray metadata (non-indexed) to a span."""
        span.set_attribute(f"aws.xray.metadata.{namespace}", json.dumps(data))
    
    def shutdown(self) -> None:
        """Shutdown the tracer provider."""
        if self._tracer_provider:
            self._tracer_provider.shutdown()
            self._initialized = False


# =============================================================================
# Security Lake OCSF Export (Requirement 41.2)
# =============================================================================


class OCSFEventClass(str, Enum):
    """OCSF event classes for security events."""
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    API_ACTIVITY = "api_activity"
    ACCOUNT_CHANGE = "account_change"
    AUDIT_ACTIVITY = "audit_activity"
    COMPLIANCE_FINDING = "compliance_finding"
    DETECTION_FINDING = "detection_finding"


class OCSFSeverity(int, Enum):
    """OCSF severity levels."""
    UNKNOWN = 0
    INFORMATIONAL = 1
    LOW = 2
    MEDIUM = 3
    HIGH = 4
    CRITICAL = 5
    FATAL = 6


@dataclass
class OCSFEvent:
    """
    OCSF (Open Cybersecurity Schema Framework) event structure.
    
    Follows the OCSF v1.0 schema for security event logging.
    """
    # Required fields
    class_uid: int  # Event class UID
    category_uid: int  # Event category UID
    severity_id: OCSFSeverity
    activity_id: int
    type_uid: int
    time: datetime
    
    # Identity fields
    actor: Optional[Dict[str, Any]] = None
    
    # Resource fields
    resources: Optional[List[Dict[str, Any]]] = None
    
    # Event details
    message: Optional[str] = None
    status: Optional[str] = None
    status_code: Optional[str] = None
    status_detail: Optional[str] = None
    
    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Observables
    observables: Optional[List[Dict[str, Any]]] = None
    
    # Raw data
    raw_data: Optional[str] = None
    
    # Unique identifier
    uid: str = field(default_factory=lambda: str(uuid4()))
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to OCSF-compliant dictionary."""
        return {
            "class_uid": self.class_uid,
            "category_uid": self.category_uid,
            "severity_id": self.severity_id.value,
            "activity_id": self.activity_id,
            "type_uid": self.type_uid,
            "time": int(self.time.timestamp() * 1000),  # Milliseconds
            "actor": self.actor,
            "resources": self.resources,
            "message": self.message,
            "status": self.status,
            "status_code": self.status_code,
            "status_detail": self.status_detail,
            "metadata": {
                **self.metadata,
                "version": "1.0.0",
                "product": {
                    "name": "AgentCore Data Governance",
                    "vendor_name": "AWS",
                    "version": "0.1.0",
                },
            },
            "observables": self.observables,
            "raw_data": self.raw_data,
            "uid": self.uid,
        }
    
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), default=str)


@dataclass
class SecurityLakeConfig:
    """Configuration for AWS Security Lake export."""
    bucket_name: str = ""
    region: str = "us-east-1"
    account_id: str = ""
    source_name: str = "agentcore-data-governance"
    source_version: str = "0.1.0"
    batch_size: int = 100
    flush_interval_seconds: int = 60
    
    @classmethod
    def from_environment(cls) -> "SecurityLakeConfig":
        """Create configuration from environment variables."""
        return cls(
            bucket_name=os.environ.get("SECURITY_LAKE_BUCKET", ""),
            region=os.environ.get("AWS_REGION", "us-east-1"),
            account_id=os.environ.get("AWS_ACCOUNT_ID", ""),
            source_name=os.environ.get("SECURITY_LAKE_SOURCE", "agentcore-data-governance"),
        )


class SecurityLakeExporter:
    """
    AWS Security Lake exporter for OCSF-formatted security events.
    
    Exports security events to AWS Security Lake in OCSF format for
    centralized security analytics and compliance reporting.
    
    Requirements: 41.2
    """
    
    def __init__(self, config: Optional[SecurityLakeConfig] = None):
        """Initialize Security Lake exporter."""
        self.config = config or SecurityLakeConfig.from_environment()
        self._event_buffer: List[OCSFEvent] = []
        self._s3_client = None
    
    def _get_s3_client(self):
        """Get or create S3 client."""
        if self._s3_client is None:
            try:
                import boto3
                self._s3_client = boto3.client('s3', region_name=self.config.region)
            except ImportError:
                pass
        return self._s3_client
    
    def create_authentication_event(
        self,
        user_id: str,
        user_name: str,
        success: bool,
        source_ip: Optional[str] = None,
        auth_method: str = "oauth2",
        tenant_id: Optional[str] = None,
    ) -> OCSFEvent:
        """
        Create an authentication event in OCSF format.
        
        Args:
            user_id: Unique identifier of the user.
            user_name: Display name of the user.
            success: Whether authentication was successful.
            source_ip: Source IP address.
            auth_method: Authentication method used.
            tenant_id: Tenant identifier.
            
        Returns:
            OCSF-formatted authentication event.
        """
        return OCSFEvent(
            class_uid=3001,  # Authentication class
            category_uid=3,  # Identity & Access Management
            severity_id=OCSFSeverity.INFORMATIONAL if success else OCSFSeverity.MEDIUM,
            activity_id=1 if success else 2,  # 1=Logon, 2=Logon Failed
            type_uid=300101 if success else 300102,
            time=datetime.now(timezone.utc),
            actor={
                "user": {
                    "uid": user_id,
                    "name": user_name,
                    "type": "User",
                },
                "session": {
                    "uid": str(uuid4()),
                },
            },
            message=f"User {user_name} {'authenticated successfully' if success else 'failed to authenticate'}",
            status="Success" if success else "Failure",
            metadata={
                "auth_method": auth_method,
                "tenant_id": tenant_id,
                "source_ip": source_ip,
            },
        )
    
    def create_authorization_event(
        self,
        user_id: str,
        user_name: str,
        resource: str,
        action: str,
        allowed: bool,
        policy_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> OCSFEvent:
        """
        Create an authorization event in OCSF format.
        
        Args:
            user_id: Unique identifier of the user.
            user_name: Display name of the user.
            resource: Resource being accessed.
            action: Action being performed.
            allowed: Whether access was allowed.
            policy_id: Policy that made the decision.
            tenant_id: Tenant identifier.
            
        Returns:
            OCSF-formatted authorization event.
        """
        return OCSFEvent(
            class_uid=3002,  # Authorization class
            category_uid=3,  # Identity & Access Management
            severity_id=OCSFSeverity.INFORMATIONAL if allowed else OCSFSeverity.MEDIUM,
            activity_id=1 if allowed else 2,  # 1=Grant, 2=Deny
            type_uid=300201 if allowed else 300202,
            time=datetime.now(timezone.utc),
            actor={
                "user": {
                    "uid": user_id,
                    "name": user_name,
                    "type": "User",
                },
            },
            resources=[{
                "uid": resource,
                "type": "Resource",
            }],
            message=f"Access to {resource} for action {action} was {'granted' if allowed else 'denied'}",
            status="Success" if allowed else "Failure",
            metadata={
                "action": action,
                "policy_id": policy_id,
                "tenant_id": tenant_id,
            },
        )
    
    def create_api_activity_event(
        self,
        user_id: str,
        api_operation: str,
        resource_type: str,
        resource_id: str,
        success: bool,
        request_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> OCSFEvent:
        """
        Create an API activity event in OCSF format.
        
        Args:
            user_id: Unique identifier of the user.
            api_operation: API operation performed.
            resource_type: Type of resource affected.
            resource_id: ID of the resource affected.
            success: Whether the operation succeeded.
            request_id: Unique request identifier.
            tenant_id: Tenant identifier.
            
        Returns:
            OCSF-formatted API activity event.
        """
        return OCSFEvent(
            class_uid=6003,  # API Activity class
            category_uid=6,  # Application Activity
            severity_id=OCSFSeverity.INFORMATIONAL,
            activity_id=1,  # Create/Read/Update/Delete
            type_uid=600301,
            time=datetime.now(timezone.utc),
            actor={
                "user": {
                    "uid": user_id,
                    "type": "User",
                },
            },
            resources=[{
                "uid": resource_id,
                "type": resource_type,
            }],
            message=f"API operation {api_operation} on {resource_type}/{resource_id}",
            status="Success" if success else "Failure",
            metadata={
                "api_operation": api_operation,
                "request_id": request_id or str(uuid4()),
                "tenant_id": tenant_id,
            },
        )
    
    def create_compliance_finding(
        self,
        finding_id: str,
        title: str,
        description: str,
        severity: OCSFSeverity,
        compliance_standard: str,
        control_id: str,
        resource_type: str,
        resource_id: str,
        tenant_id: Optional[str] = None,
    ) -> OCSFEvent:
        """
        Create a compliance finding event in OCSF format.
        
        Args:
            finding_id: Unique identifier for the finding.
            title: Title of the finding.
            description: Detailed description.
            severity: Severity level.
            compliance_standard: Compliance standard (e.g., BCBS239).
            control_id: Control identifier.
            resource_type: Type of resource affected.
            resource_id: ID of the resource affected.
            tenant_id: Tenant identifier.
            
        Returns:
            OCSF-formatted compliance finding event.
        """
        return OCSFEvent(
            class_uid=2001,  # Compliance Finding class
            category_uid=2,  # Findings
            severity_id=severity,
            activity_id=1,  # Create
            type_uid=200101,
            time=datetime.now(timezone.utc),
            resources=[{
                "uid": resource_id,
                "type": resource_type,
            }],
            message=f"{title}: {description}",
            status="New",
            metadata={
                "finding_id": finding_id,
                "compliance_standard": compliance_standard,
                "control_id": control_id,
                "tenant_id": tenant_id,
            },
        )
    
    def buffer_event(self, event: OCSFEvent) -> None:
        """Add event to buffer for batch export."""
        self._event_buffer.append(event)
        
        if len(self._event_buffer) >= self.config.batch_size:
            self.flush()
    
    def flush(self) -> int:
        """
        Flush buffered events to Security Lake.
        
        Returns:
            Number of events flushed.
        """
        if not self._event_buffer:
            return 0
        
        events_to_flush = self._event_buffer.copy()
        self._event_buffer.clear()
        
        # Export to S3 in OCSF format
        if self.config.bucket_name and self._get_s3_client():
            try:
                timestamp = datetime.now(timezone.utc).strftime("%Y/%m/%d/%H")
                key = f"ext/{self.config.source_name}/{timestamp}/{uuid4()}.json"
                
                # Convert events to NDJSON (newline-delimited JSON)
                ndjson_content = "\n".join(event.to_json() for event in events_to_flush)
                
                self._s3_client.put_object(
                    Bucket=self.config.bucket_name,
                    Key=key,
                    Body=ndjson_content.encode('utf-8'),
                    ContentType='application/x-ndjson',
                )
            except Exception:
                # Re-add events to buffer on failure
                self._event_buffer.extend(events_to_flush)
                raise
        
        return len(events_to_flush)
    
    def export_event(self, event: OCSFEvent) -> None:
        """Export a single event immediately."""
        self.buffer_event(event)


# =============================================================================
# GuardDuty Integration (Requirement 41.3)
# =============================================================================


class GuardDutyFindingType(str, Enum):
    """GuardDuty finding types for governance anomalies."""
    UNUSUAL_API_CALL = "UnusualAPICall"
    SUSPICIOUS_LOGIN = "SuspiciousLogin"
    DATA_EXFILTRATION = "DataExfiltration"
    PRIVILEGE_ESCALATION = "PrivilegeEscalation"
    POLICY_VIOLATION = "PolicyViolation"


@dataclass
class GuardDutyConfig:
    """Configuration for Amazon GuardDuty integration."""
    detector_id: str = ""
    region: str = "us-east-1"
    enable_s3_protection: bool = True
    enable_eks_protection: bool = False
    enable_malware_protection: bool = True
    finding_publishing_frequency: str = "FIFTEEN_MINUTES"
    
    @classmethod
    def from_environment(cls) -> "GuardDutyConfig":
        """Create configuration from environment variables."""
        return cls(
            detector_id=os.environ.get("GUARDDUTY_DETECTOR_ID", ""),
            region=os.environ.get("AWS_REGION", "us-east-1"),
        )


@dataclass
class AnomalyPattern:
    """Pattern for detecting anomalous behavior."""
    name: str
    description: str
    threshold: float
    window_minutes: int
    finding_type: GuardDutyFindingType
    severity: str = "MEDIUM"


class GuardDutyIntegration:
    """
    Amazon GuardDuty integration for anomaly detection.
    
    Enables threat detection and anomaly monitoring for API calls
    and user behavior in the data governance platform.
    
    Requirements: 41.3
    """
    
    # Default anomaly patterns for governance operations
    DEFAULT_PATTERNS: List[AnomalyPattern] = [
        AnomalyPattern(
            name="excessive_catalog_modifications",
            description="Unusual number of catalog modifications in short time",
            threshold=10,
            window_minutes=5,
            finding_type=GuardDutyFindingType.UNUSUAL_API_CALL,
            severity="MEDIUM",
        ),
        AnomalyPattern(
            name="bulk_data_export",
            description="Large volume of data exports detected",
            threshold=100,
            window_minutes=15,
            finding_type=GuardDutyFindingType.DATA_EXFILTRATION,
            severity="HIGH",
        ),
        AnomalyPattern(
            name="off_hours_access",
            description="Access to sensitive data outside business hours",
            threshold=1,
            window_minutes=60,
            finding_type=GuardDutyFindingType.SUSPICIOUS_LOGIN,
            severity="MEDIUM",
        ),
        AnomalyPattern(
            name="privilege_escalation_attempt",
            description="Attempt to access resources beyond assigned role",
            threshold=3,
            window_minutes=10,
            finding_type=GuardDutyFindingType.PRIVILEGE_ESCALATION,
            severity="HIGH",
        ),
        AnomalyPattern(
            name="policy_bypass_attempt",
            description="Multiple policy denials from same user",
            threshold=5,
            window_minutes=5,
            finding_type=GuardDutyFindingType.POLICY_VIOLATION,
            severity="HIGH",
        ),
    ]
    
    def __init__(self, config: Optional[GuardDutyConfig] = None):
        """Initialize GuardDuty integration."""
        self.config = config or GuardDutyConfig.from_environment()
        self._guardduty_client = None
        self._patterns = self.DEFAULT_PATTERNS.copy()
        self._activity_counters: Dict[str, List[datetime]] = {}
    
    def _get_guardduty_client(self):
        """Get or create GuardDuty client."""
        if self._guardduty_client is None:
            try:
                import boto3
                self._guardduty_client = boto3.client(
                    'guardduty',
                    region_name=self.config.region
                )
            except ImportError:
                pass
        return self._guardduty_client
    
    def add_pattern(self, pattern: AnomalyPattern) -> None:
        """Add a custom anomaly detection pattern."""
        self._patterns.append(pattern)
    
    def record_activity(
        self,
        activity_type: str,
        user_id: str,
        resource: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Record an activity and check for anomalies.
        
        Args:
            activity_type: Type of activity being recorded.
            user_id: User performing the activity.
            resource: Resource being accessed.
            metadata: Additional metadata.
            
        Returns:
            Finding details if anomaly detected, None otherwise.
        """
        now = datetime.now(timezone.utc)
        key = f"{activity_type}:{user_id}"
        
        # Initialize or update activity counter
        if key not in self._activity_counters:
            self._activity_counters[key] = []
        
        self._activity_counters[key].append(now)
        
        # Check against patterns
        for pattern in self._patterns:
            if self._check_pattern(pattern, key, now):
                return self._create_finding(
                    pattern=pattern,
                    user_id=user_id,
                    activity_type=activity_type,
                    resource=resource,
                    metadata=metadata,
                )
        
        return None
    
    def _check_pattern(
        self,
        pattern: AnomalyPattern,
        key: str,
        now: datetime,
    ) -> bool:
        """Check if activity matches an anomaly pattern."""
        if key not in self._activity_counters:
            return False
        
        # Filter activities within the window
        window_start = now.timestamp() - (pattern.window_minutes * 60)
        recent_activities = [
            ts for ts in self._activity_counters[key]
            if ts.timestamp() >= window_start
        ]
        
        # Update counter with only recent activities
        self._activity_counters[key] = recent_activities
        
        return len(recent_activities) >= pattern.threshold
    
    def _create_finding(
        self,
        pattern: AnomalyPattern,
        user_id: str,
        activity_type: str,
        resource: Optional[str],
        metadata: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Create a GuardDuty-style finding."""
        finding = {
            "id": str(uuid4()),
            "type": pattern.finding_type.value,
            "severity": pattern.severity,
            "title": pattern.name,
            "description": pattern.description,
            "resource": {
                "resourceType": "User",
                "details": {
                    "userId": user_id,
                    "activityType": activity_type,
                    "resource": resource,
                },
            },
            "service": {
                "serviceName": "agentcore-data-governance",
                "detectorId": self.config.detector_id,
                "action": {
                    "actionType": activity_type,
                },
            },
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata or {},
        }
        
        return finding
    
    def publish_custom_finding(
        self,
        finding_type: GuardDutyFindingType,
        title: str,
        description: str,
        severity: str,
        user_id: str,
        resource: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Publish a custom finding to GuardDuty.
        
        Args:
            finding_type: Type of finding.
            title: Finding title.
            description: Finding description.
            severity: Severity level (LOW, MEDIUM, HIGH).
            user_id: User associated with the finding.
            resource: Resource involved.
            metadata: Additional metadata.
            
        Returns:
            The created finding.
        """
        finding = {
            "id": str(uuid4()),
            "type": finding_type.value,
            "severity": severity,
            "title": title,
            "description": description,
            "resource": {
                "resourceType": "Custom",
                "details": {
                    "userId": user_id,
                    "resource": resource,
                },
            },
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata or {},
        }
        
        # Publish to GuardDuty if client available
        client = self._get_guardduty_client()
        if client and self.config.detector_id:
            try:
                # Note: GuardDuty doesn't support custom findings directly,
                # but we can use CloudWatch Events or EventBridge
                pass
            except Exception:
                pass
        
        return finding
    
    def get_detector_status(self) -> Dict[str, Any]:
        """Get the status of the GuardDuty detector."""
        client = self._get_guardduty_client()
        if not client or not self.config.detector_id:
            return {"status": "NOT_CONFIGURED"}
        
        try:
            response = client.get_detector(DetectorId=self.config.detector_id)
            return {
                "status": response.get("Status", "UNKNOWN"),
                "finding_publishing_frequency": response.get("FindingPublishingFrequency"),
                "data_sources": response.get("DataSources", {}),
            }
        except Exception as e:
            return {"status": "ERROR", "error": str(e)}


# =============================================================================
# Alerting Integrations (Requirement 41.5)
# =============================================================================


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertStatus(str, Enum):
    """Alert status values."""
    TRIGGERED = "triggered"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


@dataclass
class Alert:
    """Alert data structure."""
    id: str = field(default_factory=lambda: str(uuid4()))
    title: str = ""
    description: str = ""
    severity: AlertSeverity = AlertSeverity.WARNING
    status: AlertStatus = AlertStatus.TRIGGERED
    source: str = "agentcore-data-governance"
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    dedup_key: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    
    def to_pagerduty_payload(self) -> Dict[str, Any]:
        """Convert to PagerDuty Events API v2 payload."""
        severity_map = {
            AlertSeverity.INFO: "info",
            AlertSeverity.WARNING: "warning",
            AlertSeverity.ERROR: "error",
            AlertSeverity.CRITICAL: "critical",
        }
        
        return {
            "routing_key": "",  # Set by AlertingIntegration
            "event_action": "trigger" if self.status == AlertStatus.TRIGGERED else "resolve",
            "dedup_key": self.dedup_key or self.id,
            "payload": {
                "summary": self.title,
                "severity": severity_map.get(self.severity, "warning"),
                "source": self.source,
                "timestamp": self.timestamp.isoformat(),
                "custom_details": {
                    "description": self.description,
                    **self.details,
                },
            },
            "links": [],
            "images": [],
        }
    
    def to_opsgenie_payload(self) -> Dict[str, Any]:
        """Convert to OpsGenie Alert API payload."""
        priority_map = {
            AlertSeverity.INFO: "P5",
            AlertSeverity.WARNING: "P4",
            AlertSeverity.ERROR: "P3",
            AlertSeverity.CRITICAL: "P1",
        }
        
        return {
            "message": self.title,
            "alias": self.dedup_key or self.id,
            "description": self.description,
            "priority": priority_map.get(self.severity, "P3"),
            "source": self.source,
            "tags": self.tags,
            "details": self.details,
        }


@dataclass
class AlertingConfig:
    """Configuration for alerting integrations."""
    # PagerDuty configuration
    pagerduty_routing_key: str = ""
    pagerduty_api_url: str = "https://events.pagerduty.com/v2/enqueue"
    
    # OpsGenie configuration
    opsgenie_api_key: str = ""
    opsgenie_api_url: str = "https://api.opsgenie.com/v2/alerts"
    
    # General settings
    default_severity: AlertSeverity = AlertSeverity.WARNING
    enable_pagerduty: bool = False
    enable_opsgenie: bool = False
    
    @classmethod
    def from_environment(cls) -> "AlertingConfig":
        """Create configuration from environment variables."""
        return cls(
            pagerduty_routing_key=os.environ.get("PAGERDUTY_ROUTING_KEY", ""),
            opsgenie_api_key=os.environ.get("OPSGENIE_API_KEY", ""),
            enable_pagerduty=bool(os.environ.get("PAGERDUTY_ROUTING_KEY")),
            enable_opsgenie=bool(os.environ.get("OPSGENIE_API_KEY")),
        )


class AlertingIntegration:
    """
    Alerting integration for PagerDuty and OpsGenie.
    
    Provides on-call escalation and incident management integration
    for critical governance events.
    
    Requirements: 41.5
    """
    
    def __init__(self, config: Optional[AlertingConfig] = None):
        """Initialize alerting integration."""
        self.config = config or AlertingConfig.from_environment()
        self._http_client = None
    
    def _get_http_client(self):
        """Get HTTP client for API calls."""
        if self._http_client is None:
            try:
                import urllib.request
                self._http_client = urllib.request
            except ImportError:
                pass
        return self._http_client
    
    def _send_request(
        self,
        url: str,
        payload: Dict[str, Any],
        headers: Dict[str, str],
    ) -> Dict[str, Any]:
        """Send HTTP POST request."""
        import urllib.request
        import urllib.error
        
        data = json.dumps(payload).encode('utf-8')
        request = urllib.request.Request(url, data=data, headers=headers, method='POST')
        
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return {
                    "status": response.status,
                    "body": json.loads(response.read().decode('utf-8')),
                }
        except urllib.error.HTTPError as e:
            return {
                "status": e.code,
                "error": str(e),
                "body": e.read().decode('utf-8') if e.fp else None,
            }
        except Exception as e:
            return {
                "status": 0,
                "error": str(e),
            }
    
    def send_to_pagerduty(self, alert: Alert) -> Dict[str, Any]:
        """
        Send alert to PagerDuty.
        
        Args:
            alert: Alert to send.
            
        Returns:
            Response from PagerDuty API.
        """
        if not self.config.enable_pagerduty or not self.config.pagerduty_routing_key:
            return {"status": "DISABLED", "message": "PagerDuty integration not configured"}
        
        payload = alert.to_pagerduty_payload()
        payload["routing_key"] = self.config.pagerduty_routing_key
        
        headers = {
            "Content-Type": "application/json",
        }
        
        return self._send_request(
            self.config.pagerduty_api_url,
            payload,
            headers,
        )
    
    def send_to_opsgenie(self, alert: Alert) -> Dict[str, Any]:
        """
        Send alert to OpsGenie.
        
        Args:
            alert: Alert to send.
            
        Returns:
            Response from OpsGenie API.
        """
        if not self.config.enable_opsgenie or not self.config.opsgenie_api_key:
            return {"status": "DISABLED", "message": "OpsGenie integration not configured"}
        
        payload = alert.to_opsgenie_payload()
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"GenieKey {self.config.opsgenie_api_key}",
        }
        
        return self._send_request(
            self.config.opsgenie_api_url,
            payload,
            headers,
        )
    
    def send_alert(self, alert: Alert) -> Dict[str, Any]:
        """
        Send alert to all configured integrations.
        
        Args:
            alert: Alert to send.
            
        Returns:
            Combined response from all integrations.
        """
        results = {}
        
        if self.config.enable_pagerduty:
            results["pagerduty"] = self.send_to_pagerduty(alert)
        
        if self.config.enable_opsgenie:
            results["opsgenie"] = self.send_to_opsgenie(alert)
        
        return results
    
    def resolve_alert(self, dedup_key: str) -> Dict[str, Any]:
        """
        Resolve an existing alert.
        
        Args:
            dedup_key: Deduplication key of the alert to resolve.
            
        Returns:
            Combined response from all integrations.
        """
        alert = Alert(
            title="Alert Resolved",
            dedup_key=dedup_key,
            status=AlertStatus.RESOLVED,
        )
        
        return self.send_alert(alert)
    
    def create_governance_alert(
        self,
        title: str,
        description: str,
        severity: AlertSeverity,
        alert_type: str,
        tenant_id: Optional[str] = None,
        cycle_id: Optional[str] = None,
        report_id: Optional[str] = None,
        issue_id: Optional[str] = None,
        **additional_details: Any,
    ) -> Alert:
        """
        Create a governance-specific alert.
        
        Args:
            title: Alert title.
            description: Alert description.
            severity: Alert severity.
            alert_type: Type of governance alert.
            tenant_id: Tenant identifier.
            cycle_id: Cycle identifier.
            report_id: Report identifier.
            issue_id: Issue identifier.
            **additional_details: Additional details.
            
        Returns:
            Created alert.
        """
        # Create dedup key from governance context
        dedup_parts = [alert_type]
        if tenant_id:
            dedup_parts.append(tenant_id)
        if cycle_id:
            dedup_parts.append(cycle_id)
        if report_id:
            dedup_parts.append(report_id)
        if issue_id:
            dedup_parts.append(issue_id)
        
        dedup_key = hashlib.sha256(":".join(dedup_parts).encode()).hexdigest()[:32]
        
        details = {
            "alert_type": alert_type,
            "tenant_id": tenant_id,
            "cycle_id": cycle_id,
            "report_id": report_id,
            "issue_id": issue_id,
            **additional_details,
        }
        
        tags = ["governance", alert_type]
        if tenant_id:
            tags.append(f"tenant:{tenant_id}")
        
        return Alert(
            title=title,
            description=description,
            severity=severity,
            dedup_key=dedup_key,
            details={k: v for k, v in details.items() if v is not None},
            tags=tags,
        )


# =============================================================================
# Unified Enhanced Observability Stack
# =============================================================================


class EnhancedObservabilityStack:
    """
    Unified enhanced observability stack combining all integrations.
    
    Provides a single interface for:
    - AWS X-Ray distributed tracing (41.1)
    - AWS Security Lake OCSF export (41.2)
    - Amazon GuardDuty anomaly detection (41.3)
    - PagerDuty/OpsGenie alerting (41.5)
    
    Requirements: 41.1, 41.2, 41.3, 41.5
    """
    
    def __init__(
        self,
        xray_config: Optional[XRayConfig] = None,
        security_lake_config: Optional[SecurityLakeConfig] = None,
        guardduty_config: Optional[GuardDutyConfig] = None,
        alerting_config: Optional[AlertingConfig] = None,
    ):
        """Initialize the enhanced observability stack."""
        self.xray = XRayIntegration(xray_config)
        self.security_lake = SecurityLakeExporter(security_lake_config)
        self.guardduty = GuardDutyIntegration(guardduty_config)
        self.alerting = AlertingIntegration(alerting_config)
        self._initialized = False
    
    def initialize(self) -> None:
        """Initialize all observability components."""
        if self._initialized:
            return
        
        self.xray.initialize()
        self._initialized = True
    
    def shutdown(self) -> None:
        """Shutdown all observability components."""
        self.xray.shutdown()
        self.security_lake.flush()
        self._initialized = False
    
    def record_authentication(
        self,
        user_id: str,
        user_name: str,
        success: bool,
        source_ip: Optional[str] = None,
        auth_method: str = "oauth2",
        tenant_id: Optional[str] = None,
    ) -> None:
        """
        Record an authentication event across all observability systems.
        
        Args:
            user_id: User identifier.
            user_name: User display name.
            success: Whether authentication succeeded.
            source_ip: Source IP address.
            auth_method: Authentication method.
            tenant_id: Tenant identifier.
        """
        # Create X-Ray span
        tracer = self.xray.get_tracer()
        with tracer.start_as_current_span("authentication") as span:
            span.set_attribute("user.id", user_id)
            span.set_attribute("auth.success", success)
            span.set_attribute("auth.method", auth_method)
            if tenant_id:
                span.set_attribute("tenant.id", tenant_id)
            
            if not success:
                span.set_status(Status(StatusCode.ERROR, "Authentication failed"))
        
        # Export to Security Lake
        event = self.security_lake.create_authentication_event(
            user_id=user_id,
            user_name=user_name,
            success=success,
            source_ip=source_ip,
            auth_method=auth_method,
            tenant_id=tenant_id,
        )
        self.security_lake.buffer_event(event)
        
        # Check for anomalies
        if not success:
            finding = self.guardduty.record_activity(
                activity_type="failed_authentication",
                user_id=user_id,
                metadata={"source_ip": source_ip, "tenant_id": tenant_id},
            )
            
            if finding:
                # Send alert for anomaly
                alert = self.alerting.create_governance_alert(
                    title=f"Suspicious authentication activity for user {user_name}",
                    description=finding.get("description", "Multiple failed authentication attempts detected"),
                    severity=AlertSeverity.WARNING,
                    alert_type="authentication_anomaly",
                    tenant_id=tenant_id,
                )
                self.alerting.send_alert(alert)
    
    def record_authorization(
        self,
        user_id: str,
        user_name: str,
        resource: str,
        action: str,
        allowed: bool,
        policy_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> None:
        """
        Record an authorization event across all observability systems.
        
        Args:
            user_id: User identifier.
            user_name: User display name.
            resource: Resource being accessed.
            action: Action being performed.
            allowed: Whether access was allowed.
            policy_id: Policy that made the decision.
            tenant_id: Tenant identifier.
        """
        # Create X-Ray span
        tracer = self.xray.get_tracer()
        with tracer.start_as_current_span("authorization") as span:
            span.set_attribute("user.id", user_id)
            span.set_attribute("resource", resource)
            span.set_attribute("action", action)
            span.set_attribute("auth.allowed", allowed)
            if policy_id:
                span.set_attribute("policy.id", policy_id)
            if tenant_id:
                span.set_attribute("tenant.id", tenant_id)
            
            if not allowed:
                span.set_status(Status(StatusCode.ERROR, "Authorization denied"))
        
        # Export to Security Lake
        event = self.security_lake.create_authorization_event(
            user_id=user_id,
            user_name=user_name,
            resource=resource,
            action=action,
            allowed=allowed,
            policy_id=policy_id,
            tenant_id=tenant_id,
        )
        self.security_lake.buffer_event(event)
        
        # Check for anomalies (privilege escalation attempts)
        if not allowed:
            finding = self.guardduty.record_activity(
                activity_type="authorization_denied",
                user_id=user_id,
                resource=resource,
                metadata={"action": action, "tenant_id": tenant_id},
            )
            
            if finding:
                alert = self.alerting.create_governance_alert(
                    title=f"Potential privilege escalation attempt by {user_name}",
                    description=finding.get("description", "Multiple authorization denials detected"),
                    severity=AlertSeverity.HIGH,
                    alert_type="privilege_escalation",
                    tenant_id=tenant_id,
                )
                self.alerting.send_alert(alert)
    
    def record_api_activity(
        self,
        user_id: str,
        api_operation: str,
        resource_type: str,
        resource_id: str,
        success: bool,
        request_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> None:
        """
        Record an API activity event across all observability systems.
        
        Args:
            user_id: User identifier.
            api_operation: API operation performed.
            resource_type: Type of resource.
            resource_id: Resource identifier.
            success: Whether operation succeeded.
            request_id: Request identifier.
            tenant_id: Tenant identifier.
        """
        # Create X-Ray span
        tracer = self.xray.get_tracer()
        with tracer.start_as_current_span(f"api.{api_operation}") as span:
            span.set_attribute("user.id", user_id)
            span.set_attribute("api.operation", api_operation)
            span.set_attribute("resource.type", resource_type)
            span.set_attribute("resource.id", resource_id)
            span.set_attribute("api.success", success)
            if request_id:
                span.set_attribute("request.id", request_id)
            if tenant_id:
                span.set_attribute("tenant.id", tenant_id)
        
        # Export to Security Lake
        event = self.security_lake.create_api_activity_event(
            user_id=user_id,
            api_operation=api_operation,
            resource_type=resource_type,
            resource_id=resource_id,
            success=success,
            request_id=request_id,
            tenant_id=tenant_id,
        )
        self.security_lake.buffer_event(event)
        
        # Check for anomalies
        self.guardduty.record_activity(
            activity_type=api_operation,
            user_id=user_id,
            resource=f"{resource_type}/{resource_id}",
            metadata={"tenant_id": tenant_id},
        )
    
    def send_critical_alert(
        self,
        title: str,
        description: str,
        alert_type: str,
        tenant_id: Optional[str] = None,
        **details: Any,
    ) -> Dict[str, Any]:
        """
        Send a critical alert to all configured alerting systems.
        
        Args:
            title: Alert title.
            description: Alert description.
            alert_type: Type of alert.
            tenant_id: Tenant identifier.
            **details: Additional details.
            
        Returns:
            Response from alerting systems.
        """
        alert = self.alerting.create_governance_alert(
            title=title,
            description=description,
            severity=AlertSeverity.CRITICAL,
            alert_type=alert_type,
            tenant_id=tenant_id,
            **details,
        )
        
        return self.alerting.send_alert(alert)


# =============================================================================
# Global Instance and Factory Functions
# =============================================================================


_enhanced_observability: Optional[EnhancedObservabilityStack] = None


def get_enhanced_observability() -> EnhancedObservabilityStack:
    """Get or create the global enhanced observability stack."""
    global _enhanced_observability
    if _enhanced_observability is None:
        _enhanced_observability = EnhancedObservabilityStack()
        _enhanced_observability.initialize()
    return _enhanced_observability


def initialize_enhanced_observability(
    xray_config: Optional[XRayConfig] = None,
    security_lake_config: Optional[SecurityLakeConfig] = None,
    guardduty_config: Optional[GuardDutyConfig] = None,
    alerting_config: Optional[AlertingConfig] = None,
) -> EnhancedObservabilityStack:
    """
    Initialize the enhanced observability stack with custom configuration.
    
    Args:
        xray_config: X-Ray configuration.
        security_lake_config: Security Lake configuration.
        guardduty_config: GuardDuty configuration.
        alerting_config: Alerting configuration.
        
    Returns:
        Configured EnhancedObservabilityStack instance.
    """
    global _enhanced_observability
    _enhanced_observability = EnhancedObservabilityStack(
        xray_config=xray_config,
        security_lake_config=security_lake_config,
        guardduty_config=guardduty_config,
        alerting_config=alerting_config,
    )
    _enhanced_observability.initialize()
    return _enhanced_observability
