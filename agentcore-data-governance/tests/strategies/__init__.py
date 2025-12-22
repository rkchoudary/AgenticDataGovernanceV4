"""
Hypothesis strategies for property-based testing.

Contains test data generators for all Pydantic models.

**Feature: agentcore-python-refactor**
**Validates: Requirements 15.1, 15.2, 19.1, 19.2**
"""

# Regulatory strategies
from tests.strategies.regulatory_strategies import (
    jurisdiction_strategy,
    frequency_strategy,
    artifact_status_strategy,
    change_type_strategy,
    due_date_rule_strategy,
    regulatory_report_strategy,
    report_catalog_strategy,
    regulatory_change_strategy,
    non_empty_string_strategy,
)

# Data element strategies
from tests.strategies.data_element_strategies import (
    data_type_strategy,
    data_gap_reason_strategy,
    data_element_strategy,
    template_element_strategy,
    json_template_content_strategy,
    text_template_content_strategy,
)

# CDE strategies
from tests.strategies.cde_strategies import (
    cde_status_strategy,
    cde_scoring_factors_strategy,
    cde_score_strategy,
    cde_strategy,
    cde_inventory_strategy,
    owner_suggestion_strategy,
    scoring_context_strategy,
)

# Data quality strategies
from tests.strategies.data_quality_strategies import (
    dq_dimension_strategy,
    severity_strategy,
    rule_logic_type_strategy,
    threshold_type_strategy,
    threshold_strategy,
    rule_logic_strategy,
    dq_rule_strategy,
    rule_execution_result_strategy,
    data_snapshot_strategy,
    data_profile_strategy,
    dq_rule_repository_strategy,
    dq_dimension_definition_strategy,
    dq_threshold_strategy,
    data_quality_standards_strategy,
)

# Lineage strategies
from tests.strategies.lineage_strategies import (
    lineage_node_type_strategy,
    data_source_type_strategy,
    diagram_format_strategy,
    report_format_strategy,
    lineage_node_strategy,
    lineage_edge_strategy,
    lineage_graph_strategy,
    enriched_lineage_strategy,
    impact_analysis_strategy,
    lineage_diagram_strategy,
    lineage_report_strategy,
    glossary_term_strategy,
    business_glossary_strategy,
    connection_config_strategy,
    data_source_strategy,
)

# Issue strategies
from tests.strategies.issue_strategies import (
    issue_status_strategy,
    resolution_type_strategy,
    data_domain_strategy,
    resolution_strategy,
    issue_strategy,
    issue_context_strategy,
    root_cause_suggestion_strategy,
    recurring_theme_strategy,
    issue_metrics_strategy,
    issue_filters_strategy,
    critical_issue_strategy,
    resolved_issue_strategy,
)

# Control strategies
from tests.strategies.control_strategies import (
    control_type_strategy,
    control_category_strategy,
    control_status_strategy,
    automation_status_strategy,
    evidence_outcome_strategy,
    control_frequency_strategy,
    control_evidence_strategy,
    control_strategy,
    control_matrix_strategy,
    compensating_control_strategy,
    active_control_strategy,
    control_with_type_strategy,
)

# Workflow strategies
from tests.strategies.workflow_strategies import (
    cycle_status_strategy,
    phase_strategy,
    task_type_strategy,
    task_status_strategy,
    decision_outcome_strategy,
    agent_type_strategy,
    agent_status_strategy,
    workflow_action_type_strategy,
    workflow_step_status_strategy,
    decision_strategy,
    checkpoint_strategy,
    human_task_strategy,
    cycle_instance_strategy,
    agent_context_strategy,
    agent_result_strategy,
    agent_status_info_strategy,
    notification_strategy,
    workflow_action_strategy,
    workflow_step_strategy,
    validation_error_strategy,
    active_cycle_strategy,
    paused_cycle_strategy,
)

# Audit strategies
from tests.strategies.audit_strategies import (
    actor_type_strategy,
    entity_type_strategy,
    action_strategy,
    agent_name_strategy,
    audit_entry_strategy,
    create_audit_entry_params_strategy,
    agent_audit_entry_strategy,
    human_audit_entry_strategy,
    approval_audit_entry_strategy,
    audit_trail_strategy,
)

# Tenant strategies
from tests.strategies.tenant_strategies import (
    tenant_status_strategy,
    subscription_tier_strategy,
    subscription_status_strategy,
    billing_provider_strategy,
    tenant_branding_strategy,
    tenant_config_strategy,
    subscription_strategy,
    tenant_strategy,
    tenant_usage_strategy,
    tenant_provisioning_request_strategy,
    tenant_offboarding_request_strategy,
    active_tenant_strategy,
    pending_tenant_strategy,
    enterprise_tenant_strategy,
    free_tier_tenant_strategy,
    tenant_pair_strategy,
)


__all__ = [
    # Regulatory strategies
    'jurisdiction_strategy',
    'frequency_strategy',
    'artifact_status_strategy',
    'change_type_strategy',
    'due_date_rule_strategy',
    'regulatory_report_strategy',
    'report_catalog_strategy',
    'regulatory_change_strategy',
    'non_empty_string_strategy',
    
    # Data element strategies
    'data_type_strategy',
    'data_gap_reason_strategy',
    'data_element_strategy',
    'template_element_strategy',
    'json_template_content_strategy',
    'text_template_content_strategy',
    
    # CDE strategies
    'cde_status_strategy',
    'cde_scoring_factors_strategy',
    'cde_score_strategy',
    'cde_strategy',
    'cde_inventory_strategy',
    'owner_suggestion_strategy',
    'scoring_context_strategy',
    
    # Data quality strategies
    'dq_dimension_strategy',
    'severity_strategy',
    'rule_logic_type_strategy',
    'threshold_type_strategy',
    'threshold_strategy',
    'rule_logic_strategy',
    'dq_rule_strategy',
    'rule_execution_result_strategy',
    'data_snapshot_strategy',
    'data_profile_strategy',
    'dq_rule_repository_strategy',
    'dq_dimension_definition_strategy',
    'dq_threshold_strategy',
    'data_quality_standards_strategy',
    
    # Lineage strategies
    'lineage_node_type_strategy',
    'data_source_type_strategy',
    'diagram_format_strategy',
    'report_format_strategy',
    'lineage_node_strategy',
    'lineage_edge_strategy',
    'lineage_graph_strategy',
    'enriched_lineage_strategy',
    'impact_analysis_strategy',
    'lineage_diagram_strategy',
    'lineage_report_strategy',
    'glossary_term_strategy',
    'business_glossary_strategy',
    'connection_config_strategy',
    'data_source_strategy',
    
    # Issue strategies
    'issue_status_strategy',
    'resolution_type_strategy',
    'data_domain_strategy',
    'resolution_strategy',
    'issue_strategy',
    'issue_context_strategy',
    'root_cause_suggestion_strategy',
    'recurring_theme_strategy',
    'issue_metrics_strategy',
    'issue_filters_strategy',
    'critical_issue_strategy',
    'resolved_issue_strategy',
    
    # Control strategies
    'control_type_strategy',
    'control_category_strategy',
    'control_status_strategy',
    'automation_status_strategy',
    'evidence_outcome_strategy',
    'control_frequency_strategy',
    'control_evidence_strategy',
    'control_strategy',
    'control_matrix_strategy',
    'compensating_control_strategy',
    'active_control_strategy',
    'control_with_type_strategy',
    
    # Workflow strategies
    'cycle_status_strategy',
    'phase_strategy',
    'task_type_strategy',
    'task_status_strategy',
    'decision_outcome_strategy',
    'agent_type_strategy',
    'agent_status_strategy',
    'workflow_action_type_strategy',
    'workflow_step_status_strategy',
    'decision_strategy',
    'checkpoint_strategy',
    'human_task_strategy',
    'cycle_instance_strategy',
    'agent_context_strategy',
    'agent_result_strategy',
    'agent_status_info_strategy',
    'notification_strategy',
    'workflow_action_strategy',
    'workflow_step_strategy',
    'validation_error_strategy',
    'active_cycle_strategy',
    'paused_cycle_strategy',
    
    # Audit strategies
    'actor_type_strategy',
    'entity_type_strategy',
    'action_strategy',
    'agent_name_strategy',
    'audit_entry_strategy',
    'create_audit_entry_params_strategy',
    'agent_audit_entry_strategy',
    'human_audit_entry_strategy',
    'approval_audit_entry_strategy',
    'audit_trail_strategy',
    
    # Tenant strategies
    'tenant_status_strategy',
    'subscription_tier_strategy',
    'subscription_status_strategy',
    'billing_provider_strategy',
    'tenant_branding_strategy',
    'tenant_config_strategy',
    'subscription_strategy',
    'tenant_strategy',
    'tenant_usage_strategy',
    'tenant_provisioning_request_strategy',
    'tenant_offboarding_request_strategy',
    'active_tenant_strategy',
    'pending_tenant_strategy',
    'enterprise_tenant_strategy',
    'free_tier_tenant_strategy',
    'tenant_pair_strategy',
]
