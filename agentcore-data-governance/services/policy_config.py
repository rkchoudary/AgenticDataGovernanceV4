"""
Cedar policy definitions for governance agent authorization.

This module defines Cedar policies for role-based access control (RBAC)
in the AgentCore Data Governance system.

Requirements: 15.1, 15.2, 15.3
- Create a Policy Engine with Cedar policies for governance operations
- Enforce role-based access for: catalog approval (compliance_officer),
  CDE updates (data_steward, data_owner), issue escalation (manager+)
- Use forbid-overrides-permit semantics with default deny
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field
from enum import Enum


# Valid roles in the governance system
class GovernanceRole(str, Enum):
    """Roles for governance system access control."""
    VIEWER = "viewer"
    DATA_STEWARD = "data_steward"
    DATA_OWNER = "data_owner"
    COMPLIANCE_OFFICER = "compliance_officer"
    MANAGER = "manager"
    SENIOR_MANAGER = "senior_manager"
    DIRECTOR = "director"
    ADMIN = "admin"


# Role hierarchy for permission inheritance
ROLE_HIERARCHY = {
    GovernanceRole.VIEWER: [],
    GovernanceRole.DATA_STEWARD: [GovernanceRole.VIEWER],
    GovernanceRole.DATA_OWNER: [GovernanceRole.VIEWER],
    GovernanceRole.COMPLIANCE_OFFICER: [GovernanceRole.VIEWER],
    GovernanceRole.MANAGER: [GovernanceRole.DATA_STEWARD, GovernanceRole.DATA_OWNER],
    GovernanceRole.SENIOR_MANAGER: [GovernanceRole.MANAGER, GovernanceRole.COMPLIANCE_OFFICER],
    GovernanceRole.DIRECTOR: [GovernanceRole.SENIOR_MANAGER],
    GovernanceRole.ADMIN: [GovernanceRole.DIRECTOR],
}


class PolicyAction(str, Enum):
    """Actions that can be controlled by policies."""
    # Catalog operations
    APPROVE_CATALOG = "RegulatoryTools__approve_catalog"
    MODIFY_CATALOG = "RegulatoryTools__modify_catalog"
    SUBMIT_FOR_REVIEW = "RegulatoryTools__submit_for_review"
    
    # CDE operations
    UPDATE_CDE_INVENTORY = "CDETools__update_inventory"
    ASSIGN_CDE_OWNER = "CDETools__assign_owner"
    SCORE_DATA_ELEMENTS = "CDETools__score_data_elements"
    
    # Issue operations
    ESCALATE_ISSUE = "IssueTools__escalate_issue"
    RESOLVE_ISSUE = "IssueTools__resolve_issue"
    CREATE_ISSUE = "IssueTools__create_issue"
    
    # DQ Rule operations
    UPDATE_RULE_THRESHOLD = "DQRuleTools__update_threshold"
    ENABLE_RULE = "DQRuleTools__enable_rule"
    
    # Workflow operations
    COMPLETE_HUMAN_TASK = "OrchestratorTools__complete_human_task"
    START_CYCLE = "OrchestratorTools__start_cycle"
    PAUSE_CYCLE = "OrchestratorTools__pause_cycle"


class PolicyDecision(str, Enum):
    """Policy evaluation decision."""
    ALLOW = "allow"
    DENY = "deny"


class PolicyEvaluationResult(BaseModel):
    """Result of a policy evaluation."""
    decision: PolicyDecision
    action: str
    principal_role: str
    resource: Optional[str] = None
    reason: str
    policy_id: Optional[str] = None


class PolicyContext(BaseModel):
    """Context for policy evaluation."""
    current_status: Optional[str] = None
    entity_owner: Optional[str] = None
    severity: Optional[str] = None
    escalation_level: Optional[int] = None


# Cedar policy definitions as strings
# These follow the Cedar policy language syntax

CATALOG_APPROVAL_POLICY = """
// Policy: Allow compliance officers to approve catalogs
// Requirements: 15.2
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"RegulatoryTools__approve_catalog",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") == "compliance_officer"
};
"""

CATALOG_APPROVAL_STATUS_CHECK_POLICY = """
// Policy: Forbid direct approval without review
// Requirements: 15.2, 15.4
forbid(
  principal,
  action == AgentCore::Action::"RegulatoryTools__approve_catalog",
  resource
)
when {
  context.input.current_status != "pending_review"
};
"""

CDE_UPDATE_POLICY = """
// Policy: Allow data stewards and data owners to update CDE inventory
// Requirements: 15.2
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"CDETools__update_inventory",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["data_steward", "data_owner"]
};
"""

CDE_OWNER_ASSIGNMENT_POLICY = """
// Policy: Allow data stewards and managers to assign CDE owners
// Requirements: 15.2
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"CDETools__assign_owner",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["data_steward", "manager", "senior_manager", "director", "admin"]
};
"""

ISSUE_ESCALATION_POLICY = """
// Policy: Restrict critical issue escalation to managers and above
// Requirements: 15.2
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"IssueTools__escalate_issue",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["manager", "senior_manager", "director", "admin"]
};
"""

ISSUE_RESOLUTION_POLICY = """
// Policy: Allow data stewards and above to resolve issues
// Requirements: 15.2
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"IssueTools__resolve_issue",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["data_steward", "data_owner", "compliance_officer", "manager", "senior_manager", "director", "admin"]
};
"""

DQ_RULE_THRESHOLD_POLICY = """
// Policy: Allow data stewards and compliance officers to update DQ rule thresholds
// Requirements: 15.2
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"DQRuleTools__update_threshold",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["data_steward", "compliance_officer", "manager", "senior_manager", "director", "admin"]
};
"""

WORKFLOW_TASK_COMPLETION_POLICY = """
// Policy: Allow assigned roles to complete human tasks
// Requirements: 15.2
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"OrchestratorTools__complete_human_task",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["data_steward", "data_owner", "compliance_officer", "manager", "senior_manager", "director", "admin"]
};
"""

CYCLE_MANAGEMENT_POLICY = """
// Policy: Allow managers and above to start/pause cycles
// Requirements: 15.2
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"OrchestratorTools__start_cycle",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["manager", "senior_manager", "director", "admin"]
};

permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"OrchestratorTools__pause_cycle",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["manager", "senior_manager", "director", "admin"]
};
"""

# Combined policy document
GOVERNANCE_POLICIES = f"""
// ============================================
// AgentCore Data Governance Cedar Policies
// ============================================
// These policies implement role-based access control (RBAC)
// for the governance system using forbid-overrides-permit semantics.
// Default behavior: DENY (explicit permits required)
// Requirements: 15.1, 15.2, 15.3, 15.4

{CATALOG_APPROVAL_POLICY}

{CATALOG_APPROVAL_STATUS_CHECK_POLICY}

{CDE_UPDATE_POLICY}

{CDE_OWNER_ASSIGNMENT_POLICY}

{ISSUE_ESCALATION_POLICY}

{ISSUE_RESOLUTION_POLICY}

{DQ_RULE_THRESHOLD_POLICY}

{WORKFLOW_TASK_COMPLETION_POLICY}

{CYCLE_MANAGEMENT_POLICY}
"""


# Role-to-action permission mapping for programmatic evaluation
ROLE_PERMISSIONS: dict[GovernanceRole, set[PolicyAction]] = {
    GovernanceRole.VIEWER: set(),  # Read-only, no write actions
    
    GovernanceRole.DATA_STEWARD: {
        PolicyAction.UPDATE_CDE_INVENTORY,
        PolicyAction.SCORE_DATA_ELEMENTS,
        PolicyAction.RESOLVE_ISSUE,
        PolicyAction.CREATE_ISSUE,
        PolicyAction.UPDATE_RULE_THRESHOLD,
        PolicyAction.ENABLE_RULE,
        PolicyAction.COMPLETE_HUMAN_TASK,
    },
    
    GovernanceRole.DATA_OWNER: {
        PolicyAction.UPDATE_CDE_INVENTORY,
        PolicyAction.RESOLVE_ISSUE,
        PolicyAction.CREATE_ISSUE,
        PolicyAction.COMPLETE_HUMAN_TASK,
    },
    
    GovernanceRole.COMPLIANCE_OFFICER: {
        PolicyAction.APPROVE_CATALOG,
        PolicyAction.SUBMIT_FOR_REVIEW,
        PolicyAction.RESOLVE_ISSUE,
        PolicyAction.CREATE_ISSUE,
        PolicyAction.UPDATE_RULE_THRESHOLD,
        PolicyAction.COMPLETE_HUMAN_TASK,
    },
    
    GovernanceRole.MANAGER: {
        PolicyAction.APPROVE_CATALOG,
        PolicyAction.MODIFY_CATALOG,
        PolicyAction.SUBMIT_FOR_REVIEW,
        PolicyAction.UPDATE_CDE_INVENTORY,
        PolicyAction.ASSIGN_CDE_OWNER,
        PolicyAction.SCORE_DATA_ELEMENTS,
        PolicyAction.ESCALATE_ISSUE,
        PolicyAction.RESOLVE_ISSUE,
        PolicyAction.CREATE_ISSUE,
        PolicyAction.UPDATE_RULE_THRESHOLD,
        PolicyAction.ENABLE_RULE,
        PolicyAction.COMPLETE_HUMAN_TASK,
        PolicyAction.START_CYCLE,
        PolicyAction.PAUSE_CYCLE,
    },
    
    GovernanceRole.SENIOR_MANAGER: {
        PolicyAction.APPROVE_CATALOG,
        PolicyAction.MODIFY_CATALOG,
        PolicyAction.SUBMIT_FOR_REVIEW,
        PolicyAction.UPDATE_CDE_INVENTORY,
        PolicyAction.ASSIGN_CDE_OWNER,
        PolicyAction.SCORE_DATA_ELEMENTS,
        PolicyAction.ESCALATE_ISSUE,
        PolicyAction.RESOLVE_ISSUE,
        PolicyAction.CREATE_ISSUE,
        PolicyAction.UPDATE_RULE_THRESHOLD,
        PolicyAction.ENABLE_RULE,
        PolicyAction.COMPLETE_HUMAN_TASK,
        PolicyAction.START_CYCLE,
        PolicyAction.PAUSE_CYCLE,
    },
    
    GovernanceRole.DIRECTOR: {
        PolicyAction.APPROVE_CATALOG,
        PolicyAction.MODIFY_CATALOG,
        PolicyAction.SUBMIT_FOR_REVIEW,
        PolicyAction.UPDATE_CDE_INVENTORY,
        PolicyAction.ASSIGN_CDE_OWNER,
        PolicyAction.SCORE_DATA_ELEMENTS,
        PolicyAction.ESCALATE_ISSUE,
        PolicyAction.RESOLVE_ISSUE,
        PolicyAction.CREATE_ISSUE,
        PolicyAction.UPDATE_RULE_THRESHOLD,
        PolicyAction.ENABLE_RULE,
        PolicyAction.COMPLETE_HUMAN_TASK,
        PolicyAction.START_CYCLE,
        PolicyAction.PAUSE_CYCLE,
    },
    
    GovernanceRole.ADMIN: set(PolicyAction),  # All permissions
}


def get_effective_roles(role: GovernanceRole) -> set[GovernanceRole]:
    """
    Get all effective roles including inherited roles from hierarchy.
    
    Args:
        role: The user's assigned role
        
    Returns:
        Set of all effective roles (assigned + inherited)
    """
    effective = {role}
    for inherited_role in ROLE_HIERARCHY.get(role, []):
        effective.update(get_effective_roles(inherited_role))
    return effective


def get_effective_permissions(role: GovernanceRole) -> set[PolicyAction]:
    """
    Get all effective permissions for a role including inherited permissions.
    
    Args:
        role: The user's assigned role
        
    Returns:
        Set of all permitted actions
    """
    permissions = set()
    for effective_role in get_effective_roles(role):
        permissions.update(ROLE_PERMISSIONS.get(effective_role, set()))
    return permissions


def evaluate_policy(
    principal_role: str,
    action: str,
    resource: Optional[str] = None,
    context: Optional[PolicyContext] = None
) -> PolicyEvaluationResult:
    """
    Evaluate a policy request against Cedar policies.
    
    Implements forbid-overrides-permit semantics with default deny.
    
    Args:
        principal_role: The role of the user making the request
        action: The action being requested
        resource: Optional resource identifier
        context: Optional context for conditional policies
        
    Returns:
        PolicyEvaluationResult with decision and reason
        
    Requirements: 15.3, 15.4
    """
    # Validate role
    try:
        role = GovernanceRole(principal_role)
    except ValueError:
        return PolicyEvaluationResult(
            decision=PolicyDecision.DENY,
            action=action,
            principal_role=principal_role,
            resource=resource,
            reason=f"Invalid role: {principal_role}",
            policy_id="default_deny"
        )
    
    # Validate action
    try:
        policy_action = PolicyAction(action)
    except ValueError:
        return PolicyEvaluationResult(
            decision=PolicyDecision.DENY,
            action=action,
            principal_role=principal_role,
            resource=resource,
            reason=f"Unknown action: {action}",
            policy_id="default_deny"
        )
    
    # Check forbid conditions first (forbid-overrides-permit)
    if context:
        # Forbid catalog approval if not in pending_review status
        if policy_action == PolicyAction.APPROVE_CATALOG:
            if context.current_status and context.current_status != "pending_review":
                return PolicyEvaluationResult(
                    decision=PolicyDecision.DENY,
                    action=action,
                    principal_role=principal_role,
                    resource=resource,
                    reason=f"Cannot approve catalog with status '{context.current_status}'. Must be 'pending_review'.",
                    policy_id="catalog_approval_status_check"
                )
    
    # Check permit conditions
    effective_permissions = get_effective_permissions(role)
    
    if policy_action in effective_permissions:
        return PolicyEvaluationResult(
            decision=PolicyDecision.ALLOW,
            action=action,
            principal_role=principal_role,
            resource=resource,
            reason=f"Action permitted for role '{principal_role}'",
            policy_id=f"{policy_action.value}_permit"
        )
    
    # Default deny
    return PolicyEvaluationResult(
        decision=PolicyDecision.DENY,
        action=action,
        principal_role=principal_role,
        resource=resource,
        reason=f"Action '{action}' not permitted for role '{principal_role}'",
        policy_id="default_deny"
    )


class PolicyEngine:
    """
    Policy Engine for evaluating Cedar policies.
    
    This class provides a programmatic interface for policy evaluation
    that mirrors the AgentCore Policy Engine behavior.
    
    Requirements: 15.1, 15.3, 15.4
    """
    
    def __init__(
        self,
        name: str = "governance-policy-engine",
        enforcement_mode: Literal["ENFORCE", "PERMISSIVE"] = "ENFORCE"
    ):
        """
        Initialize the Policy Engine.
        
        Args:
            name: Name of the policy engine
            enforcement_mode: ENFORCE (deny on policy violation) or PERMISSIVE (log only)
        """
        self.name = name
        self.enforcement_mode = enforcement_mode
        self._policies: list[str] = []
        self._evaluation_log: list[PolicyEvaluationResult] = []
    
    def add_policy(self, policy: str) -> None:
        """
        Add a Cedar policy to the engine.
        
        Args:
            policy: Cedar policy string
        """
        self._policies.append(policy)
    
    def load_governance_policies(self) -> None:
        """Load all governance policies into the engine."""
        self._policies = [
            CATALOG_APPROVAL_POLICY,
            CATALOG_APPROVAL_STATUS_CHECK_POLICY,
            CDE_UPDATE_POLICY,
            CDE_OWNER_ASSIGNMENT_POLICY,
            ISSUE_ESCALATION_POLICY,
            ISSUE_RESOLUTION_POLICY,
            DQ_RULE_THRESHOLD_POLICY,
            WORKFLOW_TASK_COMPLETION_POLICY,
            CYCLE_MANAGEMENT_POLICY,
        ]
    
    def evaluate(
        self,
        principal_role: str,
        action: str,
        resource: Optional[str] = None,
        context: Optional[PolicyContext] = None
    ) -> PolicyEvaluationResult:
        """
        Evaluate a policy request.
        
        Args:
            principal_role: The role of the user making the request
            action: The action being requested
            resource: Optional resource identifier
            context: Optional context for conditional policies
            
        Returns:
            PolicyEvaluationResult with decision and reason
        """
        result = evaluate_policy(principal_role, action, resource, context)
        
        # Log the evaluation for audit
        self._evaluation_log.append(result)
        
        # In PERMISSIVE mode, always allow but log the would-be decision
        if self.enforcement_mode == "PERMISSIVE" and result.decision == PolicyDecision.DENY:
            return PolicyEvaluationResult(
                decision=PolicyDecision.ALLOW,
                action=result.action,
                principal_role=result.principal_role,
                resource=result.resource,
                reason=f"[PERMISSIVE MODE] Would deny: {result.reason}",
                policy_id=result.policy_id
            )
        
        return result
    
    def get_evaluation_log(self) -> list[PolicyEvaluationResult]:
        """Get the evaluation log for audit purposes."""
        return self._evaluation_log.copy()
    
    def clear_evaluation_log(self) -> None:
        """Clear the evaluation log."""
        self._evaluation_log.clear()
    
    def get_policies(self) -> list[str]:
        """Get all loaded policies."""
        return self._policies.copy()
    
    def get_combined_policy_document(self) -> str:
        """Get all policies as a single Cedar document."""
        return GOVERNANCE_POLICIES


# Convenience function for quick policy checks
def check_permission(
    role: str,
    action: str,
    context: Optional[PolicyContext] = None
) -> bool:
    """
    Quick check if a role has permission for an action.
    
    Args:
        role: The user's role
        action: The action to check
        context: Optional context for conditional policies
        
    Returns:
        True if permitted, False otherwise
    """
    result = evaluate_policy(role, action, context=context)
    return result.decision == PolicyDecision.ALLOW
