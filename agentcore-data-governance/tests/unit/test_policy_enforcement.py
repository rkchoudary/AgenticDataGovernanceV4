"""
Unit tests for policy enforcement.

Tests allow/deny scenarios for each role based on Cedar policies.

Requirements: 15.3, 15.4
"""

import pytest
from services.policy_config import (
    GovernanceRole,
    PolicyAction,
    PolicyDecision,
    PolicyContext,
    PolicyEngine,
    PolicyEvaluationResult,
    evaluate_policy,
    check_permission,
    get_effective_roles,
    get_effective_permissions,
    ROLE_PERMISSIONS,
    ROLE_HIERARCHY,
)


class TestRoleHierarchy:
    """Tests for role hierarchy and inheritance."""
    
    def test_viewer_has_no_inherited_roles(self):
        """Viewer is the base role with no inheritance."""
        effective = get_effective_roles(GovernanceRole.VIEWER)
        assert effective == {GovernanceRole.VIEWER}
    
    def test_data_steward_inherits_viewer(self):
        """Data steward inherits viewer permissions."""
        effective = get_effective_roles(GovernanceRole.DATA_STEWARD)
        assert GovernanceRole.VIEWER in effective
        assert GovernanceRole.DATA_STEWARD in effective
    
    def test_manager_inherits_data_steward_and_owner(self):
        """Manager inherits from data steward and data owner."""
        effective = get_effective_roles(GovernanceRole.MANAGER)
        assert GovernanceRole.DATA_STEWARD in effective
        assert GovernanceRole.DATA_OWNER in effective
        assert GovernanceRole.VIEWER in effective
    
    def test_admin_inherits_all_roles(self):
        """Admin inherits from all roles in hierarchy."""
        effective = get_effective_roles(GovernanceRole.ADMIN)
        # Admin should have all roles through inheritance
        assert GovernanceRole.DIRECTOR in effective
        assert GovernanceRole.SENIOR_MANAGER in effective
        assert GovernanceRole.MANAGER in effective
        assert GovernanceRole.COMPLIANCE_OFFICER in effective
    
    def test_senior_manager_inherits_compliance_officer(self):
        """Senior manager inherits compliance officer permissions."""
        effective = get_effective_roles(GovernanceRole.SENIOR_MANAGER)
        assert GovernanceRole.COMPLIANCE_OFFICER in effective
        assert GovernanceRole.MANAGER in effective


class TestEffectivePermissions:
    """Tests for effective permission calculation."""
    
    def test_viewer_has_no_permissions(self):
        """Viewer role has no write permissions."""
        permissions = get_effective_permissions(GovernanceRole.VIEWER)
        assert len(permissions) == 0
    
    def test_data_steward_permissions(self):
        """Data steward has CDE and DQ rule permissions."""
        permissions = get_effective_permissions(GovernanceRole.DATA_STEWARD)
        assert PolicyAction.UPDATE_CDE_INVENTORY in permissions
        assert PolicyAction.SCORE_DATA_ELEMENTS in permissions
        assert PolicyAction.UPDATE_RULE_THRESHOLD in permissions
        assert PolicyAction.RESOLVE_ISSUE in permissions
    
    def test_compliance_officer_can_approve_catalog(self):
        """Compliance officer can approve catalogs."""
        permissions = get_effective_permissions(GovernanceRole.COMPLIANCE_OFFICER)
        assert PolicyAction.APPROVE_CATALOG in permissions
        assert PolicyAction.SUBMIT_FOR_REVIEW in permissions
    
    def test_manager_can_escalate_issues(self):
        """Manager can escalate issues."""
        permissions = get_effective_permissions(GovernanceRole.MANAGER)
        assert PolicyAction.ESCALATE_ISSUE in permissions
        assert PolicyAction.START_CYCLE in permissions
        assert PolicyAction.PAUSE_CYCLE in permissions
    
    def test_admin_has_all_permissions(self):
        """Admin has all permissions."""
        permissions = get_effective_permissions(GovernanceRole.ADMIN)
        assert permissions == set(PolicyAction)


class TestCatalogApprovalPolicy:
    """Tests for catalog approval policy enforcement."""
    
    def test_compliance_officer_can_approve_pending_catalog(self):
        """Compliance officer can approve catalog in pending_review status."""
        context = PolicyContext(current_status="pending_review")
        result = evaluate_policy(
            principal_role="compliance_officer",
            action=PolicyAction.APPROVE_CATALOG.value,
            context=context
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_compliance_officer_cannot_approve_draft_catalog(self):
        """Compliance officer cannot approve catalog in draft status."""
        context = PolicyContext(current_status="draft")
        result = evaluate_policy(
            principal_role="compliance_officer",
            action=PolicyAction.APPROVE_CATALOG.value,
            context=context
        )
        assert result.decision == PolicyDecision.DENY
        assert "pending_review" in result.reason
    
    def test_viewer_cannot_approve_catalog(self):
        """Viewer cannot approve catalog regardless of status."""
        context = PolicyContext(current_status="pending_review")
        result = evaluate_policy(
            principal_role="viewer",
            action=PolicyAction.APPROVE_CATALOG.value,
            context=context
        )
        assert result.decision == PolicyDecision.DENY
    
    def test_manager_can_approve_catalog(self):
        """Manager can approve catalog in pending_review status."""
        context = PolicyContext(current_status="pending_review")
        result = evaluate_policy(
            principal_role="manager",
            action=PolicyAction.APPROVE_CATALOG.value,
            context=context
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_forbid_overrides_permit_for_wrong_status(self):
        """Forbid policy overrides permit when status is wrong."""
        # Even admin cannot approve if status is not pending_review
        context = PolicyContext(current_status="approved")
        result = evaluate_policy(
            principal_role="admin",
            action=PolicyAction.APPROVE_CATALOG.value,
            context=context
        )
        assert result.decision == PolicyDecision.DENY
        assert result.policy_id == "catalog_approval_status_check"


class TestCDEUpdatePolicy:
    """Tests for CDE update policy enforcement."""
    
    def test_data_steward_can_update_cde(self):
        """Data steward can update CDE inventory."""
        result = evaluate_policy(
            principal_role="data_steward",
            action=PolicyAction.UPDATE_CDE_INVENTORY.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_data_owner_can_update_cde(self):
        """Data owner can update CDE inventory."""
        result = evaluate_policy(
            principal_role="data_owner",
            action=PolicyAction.UPDATE_CDE_INVENTORY.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_viewer_cannot_update_cde(self):
        """Viewer cannot update CDE inventory."""
        result = evaluate_policy(
            principal_role="viewer",
            action=PolicyAction.UPDATE_CDE_INVENTORY.value
        )
        assert result.decision == PolicyDecision.DENY
    
    def test_manager_can_assign_owner(self):
        """Manager can assign CDE owners."""
        result = evaluate_policy(
            principal_role="manager",
            action=PolicyAction.ASSIGN_CDE_OWNER.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_data_steward_cannot_assign_owner(self):
        """Data steward cannot assign CDE owners (manager+ only)."""
        result = evaluate_policy(
            principal_role="data_steward",
            action=PolicyAction.ASSIGN_CDE_OWNER.value
        )
        assert result.decision == PolicyDecision.DENY
    
    def test_data_owner_cannot_assign_owner(self):
        """Data owner cannot assign CDE owners (manager+ only)."""
        result = evaluate_policy(
            principal_role="data_owner",
            action=PolicyAction.ASSIGN_CDE_OWNER.value
        )
        assert result.decision == PolicyDecision.DENY


class TestIssueEscalationPolicy:
    """Tests for issue escalation policy enforcement."""
    
    def test_manager_can_escalate_issue(self):
        """Manager can escalate issues."""
        result = evaluate_policy(
            principal_role="manager",
            action=PolicyAction.ESCALATE_ISSUE.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_senior_manager_can_escalate_issue(self):
        """Senior manager can escalate issues."""
        result = evaluate_policy(
            principal_role="senior_manager",
            action=PolicyAction.ESCALATE_ISSUE.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_data_steward_cannot_escalate_issue(self):
        """Data steward cannot escalate issues (manager+ only)."""
        result = evaluate_policy(
            principal_role="data_steward",
            action=PolicyAction.ESCALATE_ISSUE.value
        )
        assert result.decision == PolicyDecision.DENY
    
    def test_compliance_officer_cannot_escalate_issue(self):
        """Compliance officer cannot escalate issues (manager+ only)."""
        result = evaluate_policy(
            principal_role="compliance_officer",
            action=PolicyAction.ESCALATE_ISSUE.value
        )
        assert result.decision == PolicyDecision.DENY


class TestIssueResolutionPolicy:
    """Tests for issue resolution policy enforcement."""
    
    def test_data_steward_can_resolve_issue(self):
        """Data steward can resolve issues."""
        result = evaluate_policy(
            principal_role="data_steward",
            action=PolicyAction.RESOLVE_ISSUE.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_data_owner_can_resolve_issue(self):
        """Data owner can resolve issues."""
        result = evaluate_policy(
            principal_role="data_owner",
            action=PolicyAction.RESOLVE_ISSUE.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_viewer_cannot_resolve_issue(self):
        """Viewer cannot resolve issues."""
        result = evaluate_policy(
            principal_role="viewer",
            action=PolicyAction.RESOLVE_ISSUE.value
        )
        assert result.decision == PolicyDecision.DENY


class TestDQRulePolicy:
    """Tests for DQ rule policy enforcement."""
    
    def test_data_steward_can_update_threshold(self):
        """Data steward can update DQ rule thresholds."""
        result = evaluate_policy(
            principal_role="data_steward",
            action=PolicyAction.UPDATE_RULE_THRESHOLD.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_compliance_officer_can_update_threshold(self):
        """Compliance officer can update DQ rule thresholds."""
        result = evaluate_policy(
            principal_role="compliance_officer",
            action=PolicyAction.UPDATE_RULE_THRESHOLD.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_viewer_cannot_update_threshold(self):
        """Viewer cannot update DQ rule thresholds."""
        result = evaluate_policy(
            principal_role="viewer",
            action=PolicyAction.UPDATE_RULE_THRESHOLD.value
        )
        assert result.decision == PolicyDecision.DENY
    
    def test_data_steward_can_enable_rule(self):
        """Data steward can enable/disable rules."""
        result = evaluate_policy(
            principal_role="data_steward",
            action=PolicyAction.ENABLE_RULE.value
        )
        assert result.decision == PolicyDecision.ALLOW


class TestWorkflowPolicy:
    """Tests for workflow management policy enforcement."""
    
    def test_manager_can_start_cycle(self):
        """Manager can start report cycles."""
        result = evaluate_policy(
            principal_role="manager",
            action=PolicyAction.START_CYCLE.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_manager_can_pause_cycle(self):
        """Manager can pause report cycles."""
        result = evaluate_policy(
            principal_role="manager",
            action=PolicyAction.PAUSE_CYCLE.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_data_steward_cannot_start_cycle(self):
        """Data steward cannot start cycles (manager+ only)."""
        result = evaluate_policy(
            principal_role="data_steward",
            action=PolicyAction.START_CYCLE.value
        )
        assert result.decision == PolicyDecision.DENY
    
    def test_data_steward_can_complete_task(self):
        """Data steward can complete human tasks."""
        result = evaluate_policy(
            principal_role="data_steward",
            action=PolicyAction.COMPLETE_HUMAN_TASK.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_viewer_cannot_complete_task(self):
        """Viewer cannot complete human tasks."""
        result = evaluate_policy(
            principal_role="viewer",
            action=PolicyAction.COMPLETE_HUMAN_TASK.value
        )
        assert result.decision == PolicyDecision.DENY


class TestPolicyEngine:
    """Tests for PolicyEngine class."""
    
    def test_engine_initialization(self):
        """Policy engine initializes correctly."""
        engine = PolicyEngine(name="test-engine", enforcement_mode="ENFORCE")
        assert engine.name == "test-engine"
        assert engine.enforcement_mode == "ENFORCE"
    
    def test_engine_loads_governance_policies(self):
        """Engine loads all governance policies."""
        engine = PolicyEngine()
        engine.load_governance_policies()
        policies = engine.get_policies()
        assert len(policies) > 0
    
    def test_engine_evaluate_allow(self):
        """Engine evaluates and allows permitted actions."""
        engine = PolicyEngine(enforcement_mode="ENFORCE")
        engine.load_governance_policies()
        
        result = engine.evaluate(
            principal_role="manager",
            action=PolicyAction.ESCALATE_ISSUE.value
        )
        assert result.decision == PolicyDecision.ALLOW
    
    def test_engine_evaluate_deny(self):
        """Engine evaluates and denies unpermitted actions."""
        engine = PolicyEngine(enforcement_mode="ENFORCE")
        engine.load_governance_policies()
        
        result = engine.evaluate(
            principal_role="viewer",
            action=PolicyAction.ESCALATE_ISSUE.value
        )
        assert result.decision == PolicyDecision.DENY
    
    def test_engine_permissive_mode_allows_denied(self):
        """Permissive mode allows but logs would-be denials."""
        engine = PolicyEngine(enforcement_mode="PERMISSIVE")
        engine.load_governance_policies()
        
        result = engine.evaluate(
            principal_role="viewer",
            action=PolicyAction.ESCALATE_ISSUE.value
        )
        # In permissive mode, denied actions are allowed but logged
        assert result.decision == PolicyDecision.ALLOW
        assert "PERMISSIVE MODE" in result.reason
    
    def test_engine_evaluation_log(self):
        """Engine maintains evaluation log for audit."""
        engine = PolicyEngine()
        engine.load_governance_policies()
        
        engine.evaluate(principal_role="manager", action=PolicyAction.START_CYCLE.value)
        engine.evaluate(principal_role="viewer", action=PolicyAction.START_CYCLE.value)
        
        log = engine.get_evaluation_log()
        assert len(log) == 2
    
    def test_engine_clear_log(self):
        """Engine can clear evaluation log."""
        engine = PolicyEngine()
        engine.evaluate(principal_role="manager", action=PolicyAction.START_CYCLE.value)
        
        engine.clear_evaluation_log()
        assert len(engine.get_evaluation_log()) == 0
    
    def test_engine_combined_policy_document(self):
        """Engine returns combined policy document."""
        engine = PolicyEngine()
        engine.load_governance_policies()
        
        doc = engine.get_combined_policy_document()
        assert "AgentCore Data Governance Cedar Policies" in doc
        assert "permit" in doc
        assert "forbid" in doc


class TestInvalidInputs:
    """Tests for handling invalid inputs."""
    
    def test_invalid_role_denied(self):
        """Invalid role is denied."""
        result = evaluate_policy(
            principal_role="invalid_role",
            action=PolicyAction.APPROVE_CATALOG.value
        )
        assert result.decision == PolicyDecision.DENY
        assert "Invalid role" in result.reason
    
    def test_invalid_action_denied(self):
        """Invalid action is denied."""
        result = evaluate_policy(
            principal_role="manager",
            action="invalid_action"
        )
        assert result.decision == PolicyDecision.DENY
        assert "Unknown action" in result.reason
    
    def test_default_deny_policy_id(self):
        """Default deny has correct policy ID."""
        result = evaluate_policy(
            principal_role="viewer",
            action=PolicyAction.APPROVE_CATALOG.value
        )
        assert result.policy_id == "default_deny"


class TestCheckPermissionHelper:
    """Tests for check_permission helper function."""
    
    def test_check_permission_returns_true_for_allowed(self):
        """check_permission returns True for allowed actions."""
        assert check_permission("manager", PolicyAction.ESCALATE_ISSUE.value) is True
    
    def test_check_permission_returns_false_for_denied(self):
        """check_permission returns False for denied actions."""
        assert check_permission("viewer", PolicyAction.ESCALATE_ISSUE.value) is False
    
    def test_check_permission_with_context(self):
        """check_permission works with context."""
        context = PolicyContext(current_status="pending_review")
        assert check_permission(
            "compliance_officer",
            PolicyAction.APPROVE_CATALOG.value,
            context=context
        ) is True
        
        context = PolicyContext(current_status="draft")
        assert check_permission(
            "compliance_officer",
            PolicyAction.APPROVE_CATALOG.value,
            context=context
        ) is False


class TestPolicyEvaluationResult:
    """Tests for PolicyEvaluationResult model."""
    
    def test_result_contains_all_fields(self):
        """Result contains all required fields."""
        result = PolicyEvaluationResult(
            decision=PolicyDecision.ALLOW,
            action="test_action",
            principal_role="manager",
            resource="test_resource",
            reason="Test reason",
            policy_id="test_policy"
        )
        assert result.decision == PolicyDecision.ALLOW
        assert result.action == "test_action"
        assert result.principal_role == "manager"
        assert result.resource == "test_resource"
        assert result.reason == "Test reason"
        assert result.policy_id == "test_policy"
    
    def test_result_optional_fields(self):
        """Result handles optional fields."""
        result = PolicyEvaluationResult(
            decision=PolicyDecision.DENY,
            action="test_action",
            principal_role="viewer",
            reason="Denied"
        )
        assert result.resource is None
        assert result.policy_id is None
