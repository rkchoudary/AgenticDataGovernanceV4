// ============================================
// AgentCore Data Governance Cedar Policies
// ============================================
// These policies implement role-based access control (RBAC)
// for the governance system using forbid-overrides-permit semantics.
// Default behavior: DENY (explicit permits required)
// Requirements: 15.1, 15.2, 15.3, 15.4

// ============================================
// Catalog Approval Policies
// ============================================

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

// Policy: Allow managers and above to approve catalogs
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"RegulatoryTools__approve_catalog",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["manager", "senior_manager", "director", "admin"]
};

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

// ============================================
// CDE Management Policies
// ============================================

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

// Policy: Allow managers and above to update CDE inventory
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"CDETools__update_inventory",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["manager", "senior_manager", "director", "admin"]
};

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

// Policy: Allow data stewards to score data elements
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"CDETools__score_data_elements",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["data_steward", "manager", "senior_manager", "director", "admin"]
};

// ============================================
// Issue Management Policies
// ============================================

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

// Policy: Allow most roles to create issues
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"IssueTools__create_issue",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["data_steward", "data_owner", "compliance_officer", "manager", "senior_manager", "director", "admin"]
};

// ============================================
// Data Quality Rule Policies
// ============================================

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

// Policy: Allow data stewards to enable/disable rules
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"DQRuleTools__enable_rule",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["data_steward", "manager", "senior_manager", "director", "admin"]
};

// ============================================
// Workflow Management Policies
// ============================================

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

// Policy: Allow managers and above to start cycles
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

// Policy: Allow managers and above to pause cycles
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"OrchestratorTools__pause_cycle",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["manager", "senior_manager", "director", "admin"]
};

// ============================================
// Catalog Modification Policies
// ============================================

// Policy: Allow managers and above to modify catalog
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"RegulatoryTools__modify_catalog",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["manager", "senior_manager", "director", "admin"]
};

// Policy: Allow compliance officers and above to submit for review
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"RegulatoryTools__submit_for_review",
  resource == AgentCore::Gateway::"${GOVERNANCE_GATEWAY_ARN}"
)
when {
  principal.hasTag("role") &&
  principal.getTag("role") in ["compliance_officer", "manager", "senior_manager", "director", "admin"]
};
