"""
Unit tests for Enhanced Observability Stack.

Tests for:
- AWS X-Ray integration (Requirement 41.1)
- AWS Security Lake OCSF export (Requirement 41.2)
- Amazon GuardDuty anomaly detection (Requirement 41.3)
- PagerDuty/OpsGenie alerting integration (Requirement 41.5)
"""

import json
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

from services.enhanced_observability import (
    # X-Ray
    XRayIntegration,
    XRayConfig,
    XRaySegmentType,
    # Security Lake
    SecurityLakeExporter,
    SecurityLakeConfig,
    OCSFEvent,
    OCSFEventClass,
    OCSFSeverity,
    # GuardDuty
    GuardDutyIntegration,
    GuardDutyConfig,
    GuardDutyFindingType,
    AnomalyPattern,
    # Alerting
    AlertingIntegration,
    AlertingConfig,
    Alert,
    AlertSeverity,
    AlertStatus,
    # Unified Stack
    EnhancedObservabilityStack,
    get_enhanced_observability,
    initialize_enhanced_observability,
)


class TestXRayIntegration:
    """Tests for AWS X-Ray integration (Requirement 41.1)."""
    
    def test_xray_config_from_environment(self):
        """Test X-Ray configuration from environment variables."""
        with patch.dict('os.environ', {
            'AWS_XRAY_DAEMON_ADDRESS': '192.168.1.1:2000',
            'OTEL_SERVICE_NAME': 'test-service',
            'OTEL_SERVICE_VERSION': '1.0.0',
            'XRAY_SAMPLING_RATE': '0.5',
        }):
            config = XRayConfig.from_environment()
            
            assert config.daemon_address == '192.168.1.1:2000'
            assert config.service_name == 'test-service'
            assert config.service_version == '1.0.0'
            assert config.sampling_rate == 0.5
    
    def test_xray_config_defaults(self):
        """Test X-Ray configuration defaults."""
        config = XRayConfig()
        
        assert config.daemon_address == '127.0.0.1:2000'
        assert config.service_name == 'agentcore-data-governance'
        assert config.sampling_rate == 1.0
    
    def test_xray_integration_initialization(self):
        """Test X-Ray integration initialization."""
        config = XRayConfig(service_name='test-service')
        integration = XRayIntegration(config)
        
        assert not integration._initialized
        
        integration.initialize()
        
        assert integration._initialized
        assert integration._tracer_provider is not None
    
    def test_xray_get_tracer(self):
        """Test getting tracer from X-Ray integration."""
        integration = XRayIntegration()
        tracer = integration.get_tracer('test')
        
        assert tracer is not None
        assert integration._initialized
    
    def test_xray_create_segment(self):
        """Test creating X-Ray segment with attributes."""
        integration = XRayIntegration()
        
        span = integration.create_segment(
            name='test-segment',
            segment_type=XRaySegmentType.AGENT_INVOCATION,
            attributes={'custom.attr': 'value'},
        )
        
        assert span is not None
        span.end()
    
    def test_xray_shutdown(self):
        """Test X-Ray integration shutdown."""
        integration = XRayIntegration()
        integration.initialize()
        
        assert integration._initialized
        
        integration.shutdown()
        
        assert not integration._initialized


class TestSecurityLakeExporter:
    """Tests for AWS Security Lake OCSF export (Requirement 41.2)."""
    
    def test_ocsf_event_creation(self):
        """Test OCSF event creation."""
        event = OCSFEvent(
            class_uid=3001,
            category_uid=3,
            severity_id=OCSFSeverity.MEDIUM,
            activity_id=1,
            type_uid=300101,
            time=datetime.now(timezone.utc),
            message='Test event',
        )
        
        assert event.uid is not None
        assert event.class_uid == 3001
        assert event.severity_id == OCSFSeverity.MEDIUM
    
    def test_ocsf_event_to_dict(self):
        """Test OCSF event serialization to dictionary."""
        now = datetime.now(timezone.utc)
        event = OCSFEvent(
            class_uid=3001,
            category_uid=3,
            severity_id=OCSFSeverity.HIGH,
            activity_id=1,
            type_uid=300101,
            time=now,
            message='Test event',
            actor={'user': {'uid': 'user-123'}},
        )
        
        data = event.to_dict()
        
        assert data['class_uid'] == 3001
        assert data['severity_id'] == 4  # HIGH = 4
        assert data['message'] == 'Test event'
        assert data['actor']['user']['uid'] == 'user-123'
        assert 'metadata' in data
        assert data['metadata']['product']['name'] == 'AgentCore Data Governance'
    
    def test_ocsf_event_to_json(self):
        """Test OCSF event serialization to JSON."""
        event = OCSFEvent(
            class_uid=3001,
            category_uid=3,
            severity_id=OCSFSeverity.LOW,
            activity_id=1,
            type_uid=300101,
            time=datetime.now(timezone.utc),
        )
        
        json_str = event.to_json()
        parsed = json.loads(json_str)
        
        assert parsed['class_uid'] == 3001
        assert parsed['severity_id'] == 2  # LOW = 2
    
    def test_security_lake_config_from_environment(self):
        """Test Security Lake configuration from environment."""
        with patch.dict('os.environ', {
            'SECURITY_LAKE_BUCKET': 'my-security-lake-bucket',
            'AWS_REGION': 'us-west-2',
            'AWS_ACCOUNT_ID': '123456789012',
        }):
            config = SecurityLakeConfig.from_environment()
            
            assert config.bucket_name == 'my-security-lake-bucket'
            assert config.region == 'us-west-2'
            assert config.account_id == '123456789012'
    
    def test_create_authentication_event(self):
        """Test creating authentication event."""
        exporter = SecurityLakeExporter()
        
        event = exporter.create_authentication_event(
            user_id='user-123',
            user_name='John Doe',
            success=True,
            source_ip='192.168.1.1',
            auth_method='oauth2',
            tenant_id='tenant-abc',
        )
        
        assert event.class_uid == 3001
        assert event.status == 'Success'
        assert event.actor['user']['uid'] == 'user-123'
        assert event.metadata['tenant_id'] == 'tenant-abc'
    
    def test_create_authentication_event_failure(self):
        """Test creating failed authentication event."""
        exporter = SecurityLakeExporter()
        
        event = exporter.create_authentication_event(
            user_id='user-123',
            user_name='John Doe',
            success=False,
        )
        
        assert event.status == 'Failure'
        assert event.severity_id == OCSFSeverity.MEDIUM
    
    def test_create_authorization_event(self):
        """Test creating authorization event."""
        exporter = SecurityLakeExporter()
        
        event = exporter.create_authorization_event(
            user_id='user-123',
            user_name='John Doe',
            resource='catalog:report-001',
            action='approve',
            allowed=True,
            policy_id='policy-xyz',
        )
        
        assert event.class_uid == 3002
        assert event.status == 'Success'
        assert event.resources[0]['uid'] == 'catalog:report-001'
    
    def test_create_api_activity_event(self):
        """Test creating API activity event."""
        exporter = SecurityLakeExporter()
        
        event = exporter.create_api_activity_event(
            user_id='user-123',
            api_operation='CreateCDE',
            resource_type='CDE',
            resource_id='cde-001',
            success=True,
            tenant_id='tenant-abc',
        )
        
        assert event.class_uid == 6003
        assert event.metadata['api_operation'] == 'CreateCDE'
        assert event.resources[0]['type'] == 'CDE'
    
    def test_create_compliance_finding(self):
        """Test creating compliance finding event."""
        exporter = SecurityLakeExporter()
        
        event = exporter.create_compliance_finding(
            finding_id='finding-001',
            title='Missing Data Owner',
            description='CDE does not have an assigned data owner',
            severity=OCSFSeverity.HIGH,
            compliance_standard='BCBS239',
            control_id='BCBS239-P1',
            resource_type='CDE',
            resource_id='cde-001',
        )
        
        assert event.class_uid == 2001
        assert event.severity_id == OCSFSeverity.HIGH
        assert event.metadata['compliance_standard'] == 'BCBS239'
    
    def test_buffer_and_flush_events(self):
        """Test buffering and flushing events."""
        config = SecurityLakeConfig(batch_size=3)
        exporter = SecurityLakeExporter(config)
        
        # Buffer events
        for i in range(2):
            event = exporter.create_authentication_event(
                user_id=f'user-{i}',
                user_name=f'User {i}',
                success=True,
            )
            exporter.buffer_event(event)
        
        assert len(exporter._event_buffer) == 2
        
        # Flush manually
        count = exporter.flush()
        
        assert count == 2
        assert len(exporter._event_buffer) == 0


class TestGuardDutyIntegration:
    """Tests for Amazon GuardDuty anomaly detection (Requirement 41.3)."""
    
    def test_guardduty_config_from_environment(self):
        """Test GuardDuty configuration from environment."""
        with patch.dict('os.environ', {
            'GUARDDUTY_DETECTOR_ID': 'detector-123',
            'AWS_REGION': 'us-west-2',
        }):
            config = GuardDutyConfig.from_environment()
            
            assert config.detector_id == 'detector-123'
            assert config.region == 'us-west-2'
    
    def test_default_anomaly_patterns(self):
        """Test default anomaly patterns are configured."""
        integration = GuardDutyIntegration()
        
        assert len(integration._patterns) > 0
        
        pattern_names = [p.name for p in integration._patterns]
        assert 'excessive_catalog_modifications' in pattern_names
        assert 'bulk_data_export' in pattern_names
        assert 'privilege_escalation_attempt' in pattern_names
    
    def test_add_custom_pattern(self):
        """Test adding custom anomaly pattern."""
        integration = GuardDutyIntegration()
        initial_count = len(integration._patterns)
        
        custom_pattern = AnomalyPattern(
            name='custom_pattern',
            description='Custom test pattern',
            threshold=5,
            window_minutes=10,
            finding_type=GuardDutyFindingType.UNUSUAL_API_CALL,
        )
        
        integration.add_pattern(custom_pattern)
        
        assert len(integration._patterns) == initial_count + 1
    
    def test_record_activity_no_anomaly(self):
        """Test recording activity without triggering anomaly."""
        # Create integration with no default patterns
        integration = GuardDutyIntegration()
        integration._patterns = []  # Clear default patterns
        
        result = integration.record_activity(
            activity_type='catalog_view',
            user_id='user-123',
            resource='catalog:report-001',
        )
        
        assert result is None
    
    def test_record_activity_triggers_anomaly(self):
        """Test recording activity that triggers anomaly detection."""
        integration = GuardDutyIntegration()
        integration._patterns = []  # Clear default patterns
        
        # Add a pattern with low threshold for testing
        test_pattern = AnomalyPattern(
            name='test_anomaly',
            description='Test anomaly pattern',
            threshold=2,
            window_minutes=60,
            finding_type=GuardDutyFindingType.UNUSUAL_API_CALL,
            severity='HIGH',
        )
        integration.add_pattern(test_pattern)
        
        # Record activities to trigger the pattern
        result = None
        for i in range(3):
            result = integration.record_activity(
                activity_type='test_anomaly',
                user_id='user-123',
            )
        
        # Should have triggered on the 2nd or 3rd call
        assert result is not None
        assert result['type'] == GuardDutyFindingType.UNUSUAL_API_CALL.value
        assert result['severity'] == 'HIGH'
    
    def test_publish_custom_finding(self):
        """Test publishing custom finding."""
        integration = GuardDutyIntegration()
        
        finding = integration.publish_custom_finding(
            finding_type=GuardDutyFindingType.POLICY_VIOLATION,
            title='Policy Violation Detected',
            description='User attempted to bypass policy controls',
            severity='HIGH',
            user_id='user-123',
            resource='catalog:report-001',
            metadata={'policy_id': 'policy-xyz'},
        )
        
        assert finding['type'] == 'PolicyViolation'
        assert finding['severity'] == 'HIGH'
        assert finding['resource']['details']['userId'] == 'user-123'
    
    def test_activity_window_cleanup(self):
        """Test that old activities are cleaned up from window."""
        integration = GuardDutyIntegration()
        
        # Add pattern with short window
        test_pattern = AnomalyPattern(
            name='window_test',
            description='Window test pattern',
            threshold=10,
            window_minutes=1,  # 1 minute window
            finding_type=GuardDutyFindingType.UNUSUAL_API_CALL,
        )
        integration.add_pattern(test_pattern)
        
        # Record activity
        integration.record_activity(
            activity_type='window_test',
            user_id='user-123',
        )
        
        key = 'window_test:user-123'
        assert key in integration._activity_counters
        assert len(integration._activity_counters[key]) == 1


class TestAlertingIntegration:
    """Tests for PagerDuty/OpsGenie alerting integration (Requirement 41.5)."""
    
    def test_alerting_config_from_environment(self):
        """Test alerting configuration from environment."""
        with patch.dict('os.environ', {
            'PAGERDUTY_ROUTING_KEY': 'pd-key-123',
            'OPSGENIE_API_KEY': 'og-key-456',
        }):
            config = AlertingConfig.from_environment()
            
            assert config.pagerduty_routing_key == 'pd-key-123'
            assert config.opsgenie_api_key == 'og-key-456'
            assert config.enable_pagerduty is True
            assert config.enable_opsgenie is True
    
    def test_alert_creation(self):
        """Test alert creation."""
        alert = Alert(
            title='Test Alert',
            description='This is a test alert',
            severity=AlertSeverity.WARNING,
        )
        
        assert alert.id is not None
        assert alert.title == 'Test Alert'
        assert alert.severity == AlertSeverity.WARNING
        assert alert.status == AlertStatus.TRIGGERED
    
    def test_alert_to_pagerduty_payload(self):
        """Test converting alert to PagerDuty payload."""
        alert = Alert(
            title='Critical Issue',
            description='A critical issue has occurred',
            severity=AlertSeverity.CRITICAL,
            dedup_key='issue-123',
            details={'issue_id': 'ISS-001'},
        )
        
        payload = alert.to_pagerduty_payload()
        
        assert payload['event_action'] == 'trigger'
        assert payload['dedup_key'] == 'issue-123'
        assert payload['payload']['summary'] == 'Critical Issue'
        assert payload['payload']['severity'] == 'critical'
        assert payload['payload']['custom_details']['issue_id'] == 'ISS-001'
    
    def test_alert_to_opsgenie_payload(self):
        """Test converting alert to OpsGenie payload."""
        alert = Alert(
            title='High Priority Alert',
            description='High priority issue detected',
            severity=AlertSeverity.ERROR,
            tags=['governance', 'critical'],
            details={'cycle_id': 'CYC-001'},
        )
        
        payload = alert.to_opsgenie_payload()
        
        assert payload['message'] == 'High Priority Alert'
        assert payload['priority'] == 'P3'  # ERROR = P3
        assert 'governance' in payload['tags']
        assert payload['details']['cycle_id'] == 'CYC-001'
    
    def test_send_to_pagerduty_disabled(self):
        """Test sending to PagerDuty when disabled."""
        config = AlertingConfig(enable_pagerduty=False)
        integration = AlertingIntegration(config)
        
        alert = Alert(title='Test', description='Test')
        result = integration.send_to_pagerduty(alert)
        
        assert result['status'] == 'DISABLED'
    
    def test_send_to_opsgenie_disabled(self):
        """Test sending to OpsGenie when disabled."""
        config = AlertingConfig(enable_opsgenie=False)
        integration = AlertingIntegration(config)
        
        alert = Alert(title='Test', description='Test')
        result = integration.send_to_opsgenie(alert)
        
        assert result['status'] == 'DISABLED'
    
    def test_create_governance_alert(self):
        """Test creating governance-specific alert."""
        integration = AlertingIntegration()
        
        alert = integration.create_governance_alert(
            title='Cycle Deadline Approaching',
            description='Report cycle CYC-001 deadline is in 24 hours',
            severity=AlertSeverity.WARNING,
            alert_type='deadline_warning',
            tenant_id='tenant-abc',
            cycle_id='CYC-001',
            report_id='RPT-001',
        )
        
        assert alert.title == 'Cycle Deadline Approaching'
        assert alert.severity == AlertSeverity.WARNING
        assert alert.dedup_key is not None
        assert 'governance' in alert.tags
        assert 'deadline_warning' in alert.tags
        assert alert.details['tenant_id'] == 'tenant-abc'
        assert alert.details['cycle_id'] == 'CYC-001'
    
    def test_resolve_alert(self):
        """Test resolving an alert."""
        integration = AlertingIntegration()
        
        # This will return disabled status since no integrations are configured
        result = integration.resolve_alert('issue-123')
        
        # Should return empty dict since no integrations enabled
        assert isinstance(result, dict)


class TestEnhancedObservabilityStack:
    """Tests for unified Enhanced Observability Stack."""
    
    def test_stack_initialization(self):
        """Test stack initialization."""
        stack = EnhancedObservabilityStack()
        
        assert stack.xray is not None
        assert stack.security_lake is not None
        assert stack.guardduty is not None
        assert stack.alerting is not None
        assert not stack._initialized
    
    def test_stack_initialize(self):
        """Test stack initialize method."""
        stack = EnhancedObservabilityStack()
        stack.initialize()
        
        assert stack._initialized
        assert stack.xray._initialized
    
    def test_stack_shutdown(self):
        """Test stack shutdown."""
        stack = EnhancedObservabilityStack()
        stack.initialize()
        
        stack.shutdown()
        
        assert not stack._initialized
    
    def test_record_authentication_success(self):
        """Test recording successful authentication."""
        stack = EnhancedObservabilityStack()
        stack.initialize()
        
        # Should not raise
        stack.record_authentication(
            user_id='user-123',
            user_name='John Doe',
            success=True,
            source_ip='192.168.1.1',
            tenant_id='tenant-abc',
        )
        
        # Check event was buffered
        assert len(stack.security_lake._event_buffer) >= 1
    
    def test_record_authentication_failure(self):
        """Test recording failed authentication."""
        stack = EnhancedObservabilityStack()
        stack.initialize()
        
        stack.record_authentication(
            user_id='user-123',
            user_name='John Doe',
            success=False,
            source_ip='192.168.1.1',
        )
        
        # Check event was buffered
        assert len(stack.security_lake._event_buffer) >= 1
    
    def test_record_authorization(self):
        """Test recording authorization event."""
        stack = EnhancedObservabilityStack()
        stack.initialize()
        
        stack.record_authorization(
            user_id='user-123',
            user_name='John Doe',
            resource='catalog:report-001',
            action='approve',
            allowed=True,
            policy_id='policy-xyz',
            tenant_id='tenant-abc',
        )
        
        assert len(stack.security_lake._event_buffer) >= 1
    
    def test_record_api_activity(self):
        """Test recording API activity."""
        stack = EnhancedObservabilityStack()
        stack.initialize()
        
        stack.record_api_activity(
            user_id='user-123',
            api_operation='CreateCDE',
            resource_type='CDE',
            resource_id='cde-001',
            success=True,
            tenant_id='tenant-abc',
        )
        
        assert len(stack.security_lake._event_buffer) >= 1
    
    def test_send_critical_alert(self):
        """Test sending critical alert."""
        stack = EnhancedObservabilityStack()
        
        result = stack.send_critical_alert(
            title='Critical Issue',
            description='A critical issue has occurred',
            alert_type='critical_issue',
            tenant_id='tenant-abc',
            issue_id='ISS-001',
        )
        
        # Should return empty dict since no integrations configured
        assert isinstance(result, dict)
    
    def test_get_enhanced_observability_singleton(self):
        """Test getting global enhanced observability instance."""
        # Reset global instance
        import services.enhanced_observability as module
        module._enhanced_observability = None
        
        stack1 = get_enhanced_observability()
        stack2 = get_enhanced_observability()
        
        assert stack1 is stack2
        assert stack1._initialized
    
    def test_initialize_enhanced_observability_custom_config(self):
        """Test initializing with custom configuration."""
        xray_config = XRayConfig(service_name='custom-service')
        alerting_config = AlertingConfig(
            pagerduty_routing_key='test-key',
            enable_pagerduty=True,
        )
        
        stack = initialize_enhanced_observability(
            xray_config=xray_config,
            alerting_config=alerting_config,
        )
        
        assert stack.xray.config.service_name == 'custom-service'
        assert stack.alerting.config.enable_pagerduty is True


class TestOCSFSeverityMapping:
    """Tests for OCSF severity level mapping."""
    
    def test_severity_values(self):
        """Test OCSF severity enum values."""
        assert OCSFSeverity.UNKNOWN.value == 0
        assert OCSFSeverity.INFORMATIONAL.value == 1
        assert OCSFSeverity.LOW.value == 2
        assert OCSFSeverity.MEDIUM.value == 3
        assert OCSFSeverity.HIGH.value == 4
        assert OCSFSeverity.CRITICAL.value == 5
        assert OCSFSeverity.FATAL.value == 6


class TestAlertSeverityMapping:
    """Tests for alert severity level mapping."""
    
    def test_alert_severity_to_pagerduty(self):
        """Test alert severity mapping to PagerDuty."""
        for severity in AlertSeverity:
            alert = Alert(
                title='Test',
                description='Test',
                severity=severity,
            )
            payload = alert.to_pagerduty_payload()
            
            assert payload['payload']['severity'] in ['info', 'warning', 'error', 'critical']
    
    def test_alert_severity_to_opsgenie(self):
        """Test alert severity mapping to OpsGenie priority."""
        severity_to_priority = {
            AlertSeverity.INFO: 'P5',
            AlertSeverity.WARNING: 'P4',
            AlertSeverity.ERROR: 'P3',
            AlertSeverity.CRITICAL: 'P1',
        }
        
        for severity, expected_priority in severity_to_priority.items():
            alert = Alert(
                title='Test',
                description='Test',
                severity=severity,
            )
            payload = alert.to_opsgenie_payload()
            
            assert payload['priority'] == expected_priority
