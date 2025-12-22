"""
Services package for AgentCore Data Governance.

Contains shared services:
- ControlsManagementService
- DataQualityStandardsService
- DashboardService
- NotificationService
- PolicyEngine (Cedar policy enforcement)
- IdentityProvider (OAuth2 authentication)
- ObservabilityConfig (OpenTelemetry instrumentation)
- Gateway (MCP-compatible tool access)
"""

from .controls_management import (
    ControlsManagementService,
    categorize_control,
    activate_control,
    log_evidence,
    track_compensating_control,
    schedule_effectiveness_review,
    VALID_CONTROL_TYPES,
    VALID_CONTROL_CATEGORIES,
    VALID_CONTROL_STATUSES,
)

from .dashboard import (
    DashboardService,
    CDEDetail,
    get_cde_quality_scores,
    get_quality_trends,
    get_issues_summary,
    get_control_status,
    add_annotation,
)

from .policy_config import (
    PolicyEngine,
    PolicyAction,
    PolicyDecision,
    PolicyContext,
    PolicyEvaluationResult,
    GovernanceRole,
    ROLE_PERMISSIONS,
    ROLE_HIERARCHY,
    GOVERNANCE_POLICIES,
    evaluate_policy,
    check_permission,
    get_effective_roles,
    get_effective_permissions,
)

from .identity_config import (
    IdentityProvider,
    IdentityContext,
    UserClaims,
    OAuth2CredentialProviderConfig,
    TokenVaultConfig,
    AuthenticationError,
    AuthorizationError,
    requires_access_token,
    decode_jwt_claims,
    extract_user_for_audit,
    get_identity_context,
    get_current_identity_context,
    set_current_identity_context,
    create_identity_provider,
    create_token_for_user,
)

from .observability_config import (
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
    print_otel_config,
)

from .gateway_config import (
    Gateway,
    GatewayConfig,
    GatewayTarget,
    GatewayTargetType,
    GatewayStatus,
    GatewayToolCall,
    GatewayToolResult,
    REGULATORY_SCANNER_TARGET,
    LINEAGE_TOOL_TARGET,
    NOTIFICATION_SERVICE_TARGET,
    DATA_CATALOG_TARGET,
    QUALITY_EXECUTION_TARGET,
    DEFAULT_GATEWAY_TARGETS,
    GATEWAY_ENV_VARS,
    create_default_gateway_config,
    resolve_target_arns,
    create_gateway,
    get_gateway_env_vars,
    print_gateway_config,
)

from .tenant_context import (
    TenantContext,
    TenantContextManager,
    TenantMiddleware,
    get_current_tenant_id,
    set_current_tenant_id,
    clear_tenant_context,
    get_current_user_context,
    set_user_context,
    extract_tenant_from_jwt,
    require_tenant_context,
    create_tenant_scoped_key,
    parse_tenant_scoped_key,
)

from .tenant_provisioning import (
    TenantProvisioningService,
    TenantProvisioningError,
    TenantNotFoundError,
    TIER_CONFIGS,
    TIER_PRICING,
    provision_tenant,
    offboard_tenant,
)

from .metering import (
    MeteringService,
    get_metering_service,
    record_usage,
    record_agent_invocation,
    get_usage_summary,
)

from .billing import (
    BillingPipeline,
    BillingEvent,
    BillingEventType,
    get_billing_pipeline,
    emit_usage_report,
    create_stripe_handler,
    create_aws_marketplace_handler,
    create_azure_marketplace_handler,
)

from .usage_dashboard import (
    UsageDashboardService,
    UsageDashboardMetrics,
    UsageBreakdown,
    UsageHistory,
    BillingHistoryItem,
    QuotaStatus,
    UsageDashboardResponse,
    get_usage_dashboard_service,
    get_dashboard_metrics,
    get_full_usage_dashboard,
)

from .audit_integrity import (
    AuditIntegrityService,
    verify_exported_audit_trail,
    compute_merkle_root,
    verify_merkle_proof,
)

from .task_queue import (
    TaskQueueProvider,
    AWSSQSAdapter,
    AzureServiceBusAdapter,
    TaskQueueWorker,
    AutoScalingManager,
    TaskQueueService,
    create_task_queue_service,
)

from .business_rules_engine import (
    BusinessRulesEngine,
)

from .enhanced_observability import (
    # X-Ray Integration (41.1)
    XRayIntegration,
    XRayConfig,
    XRaySegmentType,
    # Security Lake Export (41.2)
    SecurityLakeExporter,
    SecurityLakeConfig,
    OCSFEvent,
    OCSFEventClass,
    OCSFSeverity,
    # GuardDuty Integration (41.3)
    GuardDutyIntegration,
    GuardDutyConfig,
    GuardDutyFindingType,
    AnomalyPattern,
    # Alerting Integration (41.5)
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

__all__ = [
    # Controls Management Service
    "ControlsManagementService",
    "categorize_control",
    "activate_control",
    "log_evidence",
    "track_compensating_control",
    "schedule_effectiveness_review",
    "VALID_CONTROL_TYPES",
    "VALID_CONTROL_CATEGORIES",
    "VALID_CONTROL_STATUSES",
    # Dashboard Service
    "DashboardService",
    "CDEDetail",
    "get_cde_quality_scores",
    "get_quality_trends",
    "get_issues_summary",
    "get_control_status",
    "add_annotation",
    # Policy Engine
    "PolicyEngine",
    "PolicyAction",
    "PolicyDecision",
    "PolicyContext",
    "PolicyEvaluationResult",
    "GovernanceRole",
    "ROLE_PERMISSIONS",
    "ROLE_HIERARCHY",
    "GOVERNANCE_POLICIES",
    "evaluate_policy",
    "check_permission",
    "get_effective_roles",
    "get_effective_permissions",
    # Identity Provider
    "IdentityProvider",
    "IdentityContext",
    "UserClaims",
    "OAuth2CredentialProviderConfig",
    "TokenVaultConfig",
    "AuthenticationError",
    "AuthorizationError",
    "requires_access_token",
    "decode_jwt_claims",
    "extract_user_for_audit",
    "get_identity_context",
    "get_current_identity_context",
    "set_current_identity_context",
    "create_identity_provider",
    "create_token_for_user",
    # Observability
    "ObservabilityConfig",
    "GovernanceSpanContext",
    "GovernanceSpan",
    "SpanAttribute",
    "initialize_observability",
    "get_observability_config",
    "get_tracer",
    "get_current_governance_context",
    "set_current_governance_context",
    "set_governance_baggage",
    "get_governance_baggage",
    "add_governance_attributes_to_span",
    "add_baggage_attributes_to_span",
    "trace_agent_invocation",
    "trace_tool_call",
    "trace_memory_operation",
    "get_otel_env_vars",
    "print_otel_config",
    # Gateway
    "Gateway",
    "GatewayConfig",
    "GatewayTarget",
    "GatewayTargetType",
    "GatewayStatus",
    "GatewayToolCall",
    "GatewayToolResult",
    "REGULATORY_SCANNER_TARGET",
    "LINEAGE_TOOL_TARGET",
    "NOTIFICATION_SERVICE_TARGET",
    "DATA_CATALOG_TARGET",
    "QUALITY_EXECUTION_TARGET",
    "DEFAULT_GATEWAY_TARGETS",
    "GATEWAY_ENV_VARS",
    "create_default_gateway_config",
    "resolve_target_arns",
    "create_gateway",
    "get_gateway_env_vars",
    "print_gateway_config",
    # Tenant Context
    "TenantContext",
    "TenantContextManager",
    "TenantMiddleware",
    "get_current_tenant_id",
    "set_current_tenant_id",
    "clear_tenant_context",
    "get_current_user_context",
    "set_user_context",
    "extract_tenant_from_jwt",
    "require_tenant_context",
    "create_tenant_scoped_key",
    "parse_tenant_scoped_key",
    # Tenant Provisioning
    "TenantProvisioningService",
    "TenantProvisioningError",
    "TenantNotFoundError",
    "TIER_CONFIGS",
    "TIER_PRICING",
    "provision_tenant",
    "offboard_tenant",
    # Metering
    "MeteringService",
    "get_metering_service",
    "record_usage",
    "record_agent_invocation",
    "get_usage_summary",
    # Billing
    "BillingPipeline",
    "BillingEvent",
    "BillingEventType",
    "get_billing_pipeline",
    "emit_usage_report",
    "create_stripe_handler",
    "create_aws_marketplace_handler",
    "create_azure_marketplace_handler",
    # Usage Dashboard
    "UsageDashboardService",
    "UsageDashboardMetrics",
    "UsageBreakdown",
    "UsageHistory",
    "BillingHistoryItem",
    "QuotaStatus",
    "UsageDashboardResponse",
    "get_usage_dashboard_service",
    "get_dashboard_metrics",
    "get_full_usage_dashboard",
    # Audit Integrity
    "AuditIntegrityService",
    "verify_exported_audit_trail",
    "compute_merkle_root",
    "verify_merkle_proof",
    # Task Queue
    "TaskQueueProvider",
    "AWSSQSAdapter",
    "AzureServiceBusAdapter",
    "TaskQueueWorker",
    "AutoScalingManager",
    "TaskQueueService",
    "create_task_queue_service",
    # Business Rules Engine
    "BusinessRulesEngine",
    # Enhanced Observability (41.1, 41.2, 41.3, 41.5)
    "XRayIntegration",
    "XRayConfig",
    "XRaySegmentType",
    "SecurityLakeExporter",
    "SecurityLakeConfig",
    "OCSFEvent",
    "OCSFEventClass",
    "OCSFSeverity",
    "GuardDutyIntegration",
    "GuardDutyConfig",
    "GuardDutyFindingType",
    "AnomalyPattern",
    "AlertingIntegration",
    "AlertingConfig",
    "Alert",
    "AlertSeverity",
    "AlertStatus",
    "EnhancedObservabilityStack",
    "get_enhanced_observability",
    "initialize_enhanced_observability",
]
