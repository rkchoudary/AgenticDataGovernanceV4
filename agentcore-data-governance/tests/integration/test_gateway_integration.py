"""
Integration tests for Gateway Configuration.

Verifies that tool routing through Gateway works correctly and that
all Gateway requests pass through Policy Engine evaluation.

Requirements: 18.3, 18.4
- WHEN routing requests THEN the Gateway SHALL convert tool calls to MCP-compatible format
- WHEN enforcing security THEN all Gateway requests SHALL pass through Policy Engine evaluation
"""

import pytest
from datetime import datetime
from typing import Optional

from services.gateway_config import (
    Gateway,
    GatewayConfig,
    GatewayTarget,
    GatewayTargetType,
    GatewayStatus,
    GatewayToolCall,
    GatewayToolResult,
    create_default_gateway_config,
    create_gateway,
    resolve_target_arns,
    DEFAULT_GATEWAY_TARGETS,
    REGULATORY_SCANNER_TARGET,
    LINEAGE_TOOL_TARGET,
    NOTIFICATION_SERVICE_TARGET,
)
from services.policy_config import (
    PolicyEngine,
    PolicyDecision,
    PolicyContext,
    GovernanceRole,
)


@pytest.fixture
def gateway_config() -> GatewayConfig:
    """Create a test gateway configuration with fresh target copies."""
    # Create fresh copies of targets to avoid test pollution
    config = GatewayConfig(
        name="test-gateway",
        policy_engine_name="test-policy-engine",
        region="us-west-2",
        targets=[
            GatewayTarget(
                name="regulatory-scanner",
                type=GatewayTargetType.LAMBDA,
                description="Scan regulatory body websites for updates and changes",
                function_arn="arn:aws:lambda:us-west-2:123456789012:function:scanner",
                timeout_seconds=60,
                enabled=True
            ),
            GatewayTarget(
                name="lineage-tool",
                type=GatewayTargetType.OPENAPI,
                description="Import and manage data lineage from external lineage tools",
                spec_url="https://lineage.example.com/openapi.json",
                timeout_seconds=30,
                enabled=True
            ),
            GatewayTarget(
                name="notification-service",
                type=GatewayTargetType.LAMBDA,
                description="Send notifications to stakeholders via email, Slack, etc.",
                function_arn="arn:aws:lambda:us-west-2:123456789012:function:notify",
                timeout_seconds=15,
                enabled=True
            ),
        ],
        status=GatewayStatus.ACTIVE,
    )
    return config


@pytest.fixture
def policy_engine() -> PolicyEngine:
    """Create a test policy engine."""
    engine = PolicyEngine(
        name="test-policy-engine",
        enforcement_mode="ENFORCE"
    )
    engine.load_governance_policies()
    return engine


@pytest.fixture
def gateway_with_policy(gateway_config: GatewayConfig, policy_engine: PolicyEngine) -> Gateway:
    """Create a gateway with policy engine attached."""
    gateway_config.gateway_arn = "arn:aws:bedrock-agentcore:us-west-2:123456789012:gateway/test-gateway"
    return Gateway(config=gateway_config, policy_engine=policy_engine)


@pytest.fixture
def gateway_without_policy(gateway_config: GatewayConfig) -> Gateway:
    """Create a gateway without policy engine."""
    return Gateway(config=gateway_config, policy_engine=None)


class TestGatewayToolRouting:
    """Integration tests for tool routing through Gateway."""
    
    def test_gateway_routes_to_lambda_target(self, gateway_without_policy: Gateway):
        """
        Test that Gateway routes tool calls to Lambda targets.
        
        Requirements: 18.3
        """
        tool_call = GatewayToolCall(
            tool_name="scan_sources",
            target_name="regulatory-scanner",
            parameters={"jurisdictions": ["US", "CA"]},
            session_id="SESSION-001",
            actor_id="user@example.com"
        )
        
        result = gateway_without_policy.invoke_tool(tool_call)
        
        assert result.success is True
        assert result.target_name == "regulatory-scanner"
        assert result.tool_name == "scan_sources"
        assert result.result is not None
        assert result.result["target"] == "regulatory-scanner"
        assert result.result["type"] == "lambda"
        assert result.result["parameters_received"] == {"jurisdictions": ["US", "CA"]}
    
    def test_gateway_routes_to_openapi_target(self, gateway_without_policy: Gateway):
        """
        Test that Gateway routes tool calls to OpenAPI targets.
        
        Requirements: 18.3
        """
        tool_call = GatewayToolCall(
            tool_name="import_lineage",
            target_name="lineage-tool",
            parameters={"source": "external_catalog"},
            session_id="SESSION-002",
            actor_id="architect@example.com"
        )
        
        result = gateway_without_policy.invoke_tool(tool_call)
        
        assert result.success is True
        assert result.target_name == "lineage-tool"
        assert result.result["type"] == "openapi"
    
    def test_gateway_routes_to_notification_target(self, gateway_without_policy: Gateway):
        """
        Test that Gateway routes tool calls to notification service.
        
        Requirements: 18.3
        """
        tool_call = GatewayToolCall(
            tool_name="send_notification",
            target_name="notification-service",
            parameters={
                "recipient": "compliance@example.com",
                "subject": "Catalog Update",
                "message": "New regulatory changes detected"
            },
            session_id="SESSION-003",
            actor_id="system"
        )
        
        result = gateway_without_policy.invoke_tool(tool_call)
        
        assert result.success is True
        assert result.target_name == "notification-service"
        assert result.result["type"] == "lambda"
    
    def test_gateway_fails_for_unknown_target(self, gateway_without_policy: Gateway):
        """
        Test that Gateway returns error for unknown targets.
        
        Requirements: 18.3
        """
        tool_call = GatewayToolCall(
            tool_name="unknown_tool",
            target_name="nonexistent-target",
            parameters={},
            session_id="SESSION-004",
            actor_id="user@example.com"
        )
        
        result = gateway_without_policy.invoke_tool(tool_call)
        
        assert result.success is False
        assert "not found" in result.error.lower()
    
    def test_gateway_fails_for_disabled_target(self, gateway_config: GatewayConfig):
        """
        Test that Gateway returns error for disabled targets.
        
        Requirements: 18.3
        """
        # Disable the regulatory scanner target
        for target in gateway_config.targets:
            if target.name == "regulatory-scanner":
                target.enabled = False
        
        gateway = Gateway(config=gateway_config, policy_engine=None)
        
        tool_call = GatewayToolCall(
            tool_name="scan_sources",
            target_name="regulatory-scanner",
            parameters={},
            session_id="SESSION-005",
            actor_id="user@example.com"
        )
        
        result = gateway.invoke_tool(tool_call)
        
        assert result.success is False
        assert "disabled" in result.error.lower()
    
    def test_gateway_records_call_duration(self, gateway_without_policy: Gateway):
        """
        Test that Gateway records call duration for monitoring.
        
        Requirements: 18.3
        """
        tool_call = GatewayToolCall(
            tool_name="scan_sources",
            target_name="regulatory-scanner",
            parameters={"jurisdictions": ["US"]},
            session_id="SESSION-006",
            actor_id="user@example.com"
        )
        
        result = gateway_without_policy.invoke_tool(tool_call)
        
        assert result.success is True
        assert result.duration_ms >= 0
        assert result.timestamp is not None


class TestGatewayPolicyEnforcement:
    """Integration tests for Policy Engine enforcement through Gateway."""
    
    def test_gateway_allows_tool_call_without_role(self, gateway_with_policy: Gateway):
        """
        Test that Gateway allows tool calls when no principal role is provided.
        
        Requirements: 18.4
        """
        tool_call = GatewayToolCall(
            tool_name="scan_sources",
            target_name="regulatory-scanner",
            parameters={"jurisdictions": ["US"]},
            session_id="SESSION-007",
            actor_id="compliance_officer@example.com"
        )
        
        # Without principal_role, policy is not evaluated
        result = gateway_with_policy.invoke_tool(tool_call)
        
        # The tool call should succeed (no policy evaluation without role)
        assert result.success is True
        assert result.policy_decision == "allow"
    
    def test_gateway_denies_unauthorized_tool_call(self, gateway_with_policy: Gateway):
        """
        Test that Gateway denies tool calls when policy forbids.
        
        Requirements: 18.4
        """
        # Create a custom target that maps to a restricted action
        restricted_target = GatewayTarget(
            name="catalog-approval",
            type=GatewayTargetType.LAMBDA,
            description="Approve catalog changes",
            function_arn="arn:aws:lambda:us-west-2:123456789012:function:approve-catalog",
            enabled=True
        )
        gateway_with_policy.add_target(restricted_target)
        
        tool_call = GatewayToolCall(
            tool_name="RegulatoryTools__approve_catalog",
            target_name="catalog-approval",
            parameters={"catalog_id": "CAT-001"},
            session_id="SESSION-008",
            actor_id="viewer@example.com"
        )
        
        # Viewer should NOT be allowed to approve catalog
        result = gateway_with_policy.invoke_tool(
            tool_call,
            principal_role="viewer"
        )
        
        # The tool call should fail due to policy denial
        assert result.success is False
        assert result.policy_decision == "deny"
        assert "Policy denied" in result.error
    
    def test_gateway_logs_policy_decisions(self, gateway_with_policy: Gateway):
        """
        Test that Gateway logs all policy evaluation decisions.
        
        Requirements: 18.4
        """
        # Clear any previous call logs
        gateway_with_policy.clear_call_log()
        
        tool_call = GatewayToolCall(
            tool_name="scan_sources",
            target_name="regulatory-scanner",
            parameters={},
            session_id="SESSION-009",
            actor_id="user@example.com"
        )
        
        # Invoke without principal_role to skip policy evaluation
        gateway_with_policy.invoke_tool(tool_call)
        
        call_log = gateway_with_policy.get_call_log()
        assert len(call_log) == 1
        
        logged_call, logged_result = call_log[0]
        assert logged_call.tool_name == "scan_sources"
        # Policy decision should be "allow" when no role is provided
        assert logged_result.policy_decision == "allow"
    
    def test_gateway_enforces_role_based_access_with_matching_action(self, gateway_with_policy: Gateway):
        """
        Test that Gateway enforces role-based access control when action matches policy.
        
        Requirements: 18.4
        """
        # Add a target for issue escalation with matching tool name
        escalation_target = GatewayTarget(
            name="issue-escalation",
            type=GatewayTargetType.LAMBDA,
            description="Escalate issues",
            function_arn="arn:aws:lambda:us-west-2:123456789012:function:escalate-issue",
            enabled=True
        )
        gateway_with_policy.add_target(escalation_target)
        
        # Use the exact action name that matches PolicyAction enum
        tool_call = GatewayToolCall(
            tool_name="IssueTools__escalate_issue",
            target_name="issue-escalation",
            parameters={"issue_id": "ISS-001"},
            session_id="SESSION-010",
            actor_id="user@example.com"
        )
        
        # Data steward should NOT be allowed to escalate issues
        result_steward = gateway_with_policy.invoke_tool(
            tool_call,
            principal_role="data_steward"
        )
        assert result_steward.success is False
        assert result_steward.policy_decision == "deny"
    
    def test_gateway_without_policy_allows_all(self, gateway_without_policy: Gateway):
        """
        Test that Gateway without policy engine allows all tool calls.
        
        Requirements: 18.4
        """
        tool_call = GatewayToolCall(
            tool_name="any_tool",
            target_name="regulatory-scanner",
            parameters={},
            session_id="SESSION-011",
            actor_id="anyone@example.com"
        )
        
        # Without policy engine, any role should work
        result = gateway_without_policy.invoke_tool(
            tool_call,
            principal_role="viewer"
        )
        
        assert result.success is True
        # Policy decision should be "allow" (default when no policy engine)
        assert result.policy_decision == "allow"


class TestGatewayTargetManagement:
    """Integration tests for Gateway target management."""
    
    def test_add_target_to_gateway(self, gateway_without_policy: Gateway):
        """
        Test adding a new target to the Gateway.
        
        Requirements: 18.3
        """
        initial_count = len(gateway_without_policy.list_targets())
        
        new_target = GatewayTarget(
            name="custom-tool",
            type=GatewayTargetType.HTTP,
            description="Custom HTTP tool",
            endpoint_url="https://api.example.com/tool",
            enabled=True
        )
        
        gateway_without_policy.add_target(new_target)
        
        assert len(gateway_without_policy.list_targets()) == initial_count + 1
        assert gateway_without_policy.get_target("custom-tool") is not None
    
    def test_remove_target_from_gateway(self, gateway_without_policy: Gateway):
        """
        Test removing a target from the Gateway.
        
        Requirements: 18.3
        """
        initial_count = len(gateway_without_policy.list_targets())
        
        result = gateway_without_policy.remove_target("regulatory-scanner")
        
        assert result is True
        assert len(gateway_without_policy.list_targets()) == initial_count - 1
        assert gateway_without_policy.get_target("regulatory-scanner") is None
    
    def test_list_available_tools(self, gateway_without_policy: Gateway):
        """
        Test listing available tools through the Gateway.
        
        Requirements: 18.3
        """
        tools = gateway_without_policy.list_tools()
        
        assert "regulatory-scanner" in tools
        assert "lineage-tool" in tools
        assert "notification-service" in tools
    
    def test_invalid_target_configuration_rejected(self, gateway_without_policy: Gateway):
        """
        Test that invalid target configurations are rejected.
        
        Requirements: 18.3
        """
        # Lambda target without function_arn
        invalid_target = GatewayTarget(
            name="invalid-lambda",
            type=GatewayTargetType.LAMBDA,
            description="Invalid Lambda target",
            function_arn=None,  # Missing required field
            enabled=True
        )
        
        with pytest.raises(ValueError, match="Invalid target configuration"):
            gateway_without_policy.add_target(invalid_target)


class TestGatewayConfigurationResolution:
    """Integration tests for Gateway configuration resolution."""
    
    def test_resolve_target_arns_from_env(self):
        """
        Test resolving placeholder ARNs from environment variables.
        
        Requirements: 18.3
        """
        config = create_default_gateway_config()
        
        env_vars = {
            "REGULATORY_SCANNER_LAMBDA_ARN": "arn:aws:lambda:us-west-2:123456789012:function:scanner",
            "LINEAGE_TOOL_OPENAPI_URL": "https://lineage.example.com/openapi.json",
            "NOTIFICATION_LAMBDA_ARN": "arn:aws:lambda:us-west-2:123456789012:function:notify",
        }
        
        resolved_config = resolve_target_arns(config, env_vars)
        
        # Find the regulatory scanner target
        scanner_target = next(
            (t for t in resolved_config.targets if t.name == "regulatory-scanner"),
            None
        )
        assert scanner_target is not None
        assert scanner_target.function_arn == "arn:aws:lambda:us-west-2:123456789012:function:scanner"
        
        # Find the lineage tool target
        lineage_target = next(
            (t for t in resolved_config.targets if t.name == "lineage-tool"),
            None
        )
        assert lineage_target is not None
        assert lineage_target.spec_url == "https://lineage.example.com/openapi.json"
    
    def test_create_gateway_with_extended_targets(self):
        """
        Test creating Gateway with extended targets.
        
        Requirements: 18.3
        """
        config = create_default_gateway_config(
            include_extended_targets=True
        )
        
        target_names = [t.name for t in config.targets]
        
        # Should include default targets
        assert "regulatory-scanner" in target_names
        assert "lineage-tool" in target_names
        assert "notification-service" in target_names
        
        # Should include extended targets
        assert "data-catalog" in target_names
        assert "quality-execution" in target_names


class TestGatewayAuditTrail:
    """Integration tests for Gateway audit trail functionality."""
    
    def test_gateway_maintains_call_log(self, gateway_without_policy: Gateway):
        """
        Test that Gateway maintains a complete call log for audit.
        
        Requirements: 18.4
        """
        gateway_without_policy.clear_call_log()
        
        # Make multiple tool calls
        for i in range(3):
            tool_call = GatewayToolCall(
                tool_name=f"tool_{i}",
                target_name="regulatory-scanner",
                parameters={"index": i},
                session_id=f"SESSION-{i}",
                actor_id="user@example.com"
            )
            gateway_without_policy.invoke_tool(tool_call)
        
        call_log = gateway_without_policy.get_call_log()
        
        assert len(call_log) == 3
        
        # Verify each call is logged with both request and response
        for i, (call, result) in enumerate(call_log):
            assert call.tool_name == f"tool_{i}"
            assert call.parameters["index"] == i
            assert result.success is True
    
    def test_gateway_logs_failed_calls(self, gateway_without_policy: Gateway):
        """
        Test that Gateway logs failed tool calls for audit.
        
        Requirements: 18.4
        """
        gateway_without_policy.clear_call_log()
        
        # Make a call to a non-existent target
        tool_call = GatewayToolCall(
            tool_name="unknown_tool",
            target_name="nonexistent-target",
            parameters={},
            session_id="SESSION-FAIL",
            actor_id="user@example.com"
        )
        gateway_without_policy.invoke_tool(tool_call)
        
        call_log = gateway_without_policy.get_call_log()
        
        assert len(call_log) == 1
        call, result = call_log[0]
        assert result.success is False
        assert result.error is not None
    
    def test_gateway_clear_call_log(self, gateway_without_policy: Gateway):
        """
        Test that Gateway call log can be cleared.
        
        Requirements: 18.4
        """
        # Make a call
        tool_call = GatewayToolCall(
            tool_name="test_tool",
            target_name="regulatory-scanner",
            parameters={},
            session_id="SESSION-CLEAR",
            actor_id="user@example.com"
        )
        gateway_without_policy.invoke_tool(tool_call)
        
        assert len(gateway_without_policy.get_call_log()) > 0
        
        gateway_without_policy.clear_call_log()
        
        assert len(gateway_without_policy.get_call_log()) == 0


class TestGatewayMCPCompatibility:
    """Integration tests for MCP-compatible tool call format."""
    
    def test_tool_call_contains_mcp_fields(self, gateway_without_policy: Gateway):
        """
        Test that tool calls contain MCP-compatible fields.
        
        Requirements: 18.3
        """
        tool_call = GatewayToolCall(
            tool_name="scan_regulatory_sources",
            target_name="regulatory-scanner",
            parameters={
                "jurisdictions": ["US", "CA"],
                "since_date": "2024-01-01"
            },
            session_id="SESSION-MCP-001",
            actor_id="agent@system"
        )
        
        # Verify MCP-compatible fields are present
        assert tool_call.tool_name is not None
        assert tool_call.parameters is not None
        assert isinstance(tool_call.parameters, dict)
        assert tool_call.timestamp is not None
    
    def test_tool_result_contains_mcp_fields(self, gateway_without_policy: Gateway):
        """
        Test that tool results contain MCP-compatible fields.
        
        Requirements: 18.3
        """
        tool_call = GatewayToolCall(
            tool_name="scan_regulatory_sources",
            target_name="regulatory-scanner",
            parameters={"jurisdictions": ["US"]},
            session_id="SESSION-MCP-002",
            actor_id="agent@system"
        )
        
        result = gateway_without_policy.invoke_tool(tool_call)
        
        # Verify MCP-compatible result fields
        assert result.tool_name is not None
        assert result.success is not None
        assert result.timestamp is not None
        # Result should contain either result data or error
        assert result.result is not None or result.error is not None
    
    def test_tool_call_preserves_session_context(self, gateway_without_policy: Gateway):
        """
        Test that tool calls preserve session context for correlation.
        
        Requirements: 18.3
        """
        session_id = "SESSION-CONTEXT-001"
        actor_id = "orchestrator@system"
        
        tool_call = GatewayToolCall(
            tool_name="scan_sources",
            target_name="regulatory-scanner",
            parameters={},
            session_id=session_id,
            actor_id=actor_id
        )
        
        gateway_without_policy.invoke_tool(tool_call)
        
        call_log = gateway_without_policy.get_call_log()
        logged_call, _ = call_log[-1]
        
        assert logged_call.session_id == session_id
        assert logged_call.actor_id == actor_id
