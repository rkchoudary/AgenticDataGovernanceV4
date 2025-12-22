/**
 * Workflow Wizard Phase Components
 * 
 * Exports all phase-specific components for the 9-phase
 * regulatory reporting workflow.
 */

// Phase 1: Regulatory Intelligence
export {
  RegulatoryIntelligencePhase,
  ScanResultsStep,
  ChangeAnalysisStep,
  CatalogUpdatesStep,
  StakeholderApprovalStep,
} from './regulatory-intelligence'

export type {
  DetectedChange,
  ScanResults,
  CatalogUpdateSummary,
  RegulatoryIntelligenceState,
  RegulatoryIntelligenceStepId,
} from './regulatory-intelligence'

export { REGULATORY_INTELLIGENCE_STEPS, CHANGE_TYPE_CONFIG } from './regulatory-intelligence'

// Phase 4: Data Quality Rules
export {
  DataQualityRulesPhase,
  RuleReviewStep,
  ThresholdConfigStep,
  CoverageValidationStep,
  RuleActivationStep,
} from './data-quality-rules'

export type {
  DQRule,
  DQRuleStatus,
  DQDimension,
  RuleSeverity,
  RuleLogicType,
  ThresholdConfig,
  RuleLogic,
  HistogramBin,
  ThresholdImpact,
  CDEWithRules,
  CoverageCell,
  CoverageSummary,
  ActivationSchedule,
  ActivationConfirmation,
  DQRulesSummary,
  DQRulesStepId,
} from './data-quality-rules'

export { 
  DQ_RULES_STEPS, 
  DIMENSION_CONFIG, 
  RULE_STATUS_CONFIG, 
  SEVERITY_CONFIG as DQ_SEVERITY_CONFIG,
  ALL_DIMENSIONS,
} from './data-quality-rules'

// Phase 6: Issue Management
export {
  IssueManagementPhase,
  IssueTriageStep,
  RootCauseAnalysisStep,
  ResolutionStep,
  VerificationStep,
} from './issue-management'

export type {
  Issue,
  IssueStatus,
  IssueSeverity,
  IssueSource,
  ResolutionType,
  RootCauseCategory,
  RootCauseSuggestion,
  SimilarIssue,
  Resolution,
  ResolutionEvidence,
  TriageAction,
  IssueSummary,
  IssueManagementStepId,
} from './issue-management'

export {
  ISSUE_MANAGEMENT_STEPS,
  SEVERITY_CONFIG as ISSUE_SEVERITY_CONFIG,
  STATUS_CONFIG as ISSUE_STATUS_CONFIG,
  SOURCE_CONFIG,
  ROOT_CAUSE_CONFIG,
  RESOLUTION_TYPE_CONFIG,
  isCriticalUnresolved,
  hasBlockingIssues,
  getBlockingIssues,
  sortIssuesBySeverity,
  calculateIssueSummary,
} from './issue-management'

// Phase 7: Controls Management
export {
  ControlsManagementPhase,
  StatusReviewStep,
  EvidenceCollectionStep,
  CompensatingControlStep,
  EffectivenessSignoffStep,
} from './controls-management'

export type {
  Control,
  ControlEvidence,
  ControlType,
  ControlCategory,
  ControlStatus,
  AutomationStatus,
  ControlEvidenceOutcome,
  EvidenceType,
  ControlFrequency,
  CompensatingControl,
  ControlSummary,
  EffectivenessAttestation,
  ControlsManagementStepId,
} from './controls-management'

export {
  CONTROLS_MANAGEMENT_STEPS,
  CONTROL_TYPE_CONFIG,
  CONTROL_CATEGORY_CONFIG,
  CONTROL_STATUS_CONFIG,
  EVIDENCE_OUTCOME_CONFIG,
  EVIDENCE_TYPE_CONFIG,
  AUTOMATION_STATUS_CONFIG,
  calculateControlSummary,
  getControlsNeedingReview,
  getExpiringCompensatingControls,
  hasRecentEvidence,
  getLatestEvidence,
  allControlsAttested,
} from './controls-management'

// Phase 8: Documentation
export {
  DocumentationPhase,
  ArtifactReviewStep,
  AnnotationResolutionStep,
  BCBS239MappingStep,
  PackageCompilationStep,
} from './documentation'

export type {
  ArtifactType,
  ArtifactStatus,
  AnnotationType,
  AnnotationStatus,
  AnnotationPriority,
  BCBS239Principle,
  ComplianceStatus,
  DocumentArtifact,
  Annotation,
  AnnotationReply,
  BCBS239ComplianceEntry,
  EvidenceLink,
  CompiledPackage,
  TOCEntry,
  DocumentationSummary,
  DocumentationStepId,
} from './documentation'

export {
  DOCUMENTATION_STEPS,
  ARTIFACT_TYPE_CONFIG,
  ARTIFACT_STATUS_CONFIG,
  ANNOTATION_TYPE_CONFIG,
  ANNOTATION_STATUS_CONFIG,
  ANNOTATION_PRIORITY_CONFIG,
  BCBS239_PRINCIPLE_CONFIG,
  COMPLIANCE_STATUS_CONFIG,
  calculateDocumentationSummary,
  hasUnresolvedFlaggedAnnotations,
  getUnresolvedAnnotations,
  getBlockingAnnotations,
  allPrinciplesAssessed,
  getBCBS239CompliancePercentage,
} from './documentation'


// Phase 9: Attestation
export {
  AttestationPhase,
  ExecutiveSummaryStep,
  ComplianceChecklistStep,
  DigitalAttestationStep,
  SubmissionConfirmationStep,
} from './attestation'

export type {
  AttestationStatus,
  SubmissionStatus,
  ChecklistItemStatus,
  ExecutiveSummaryMetrics,
  PhaseCompletionSummary,
  ExecutiveSummary,
  ChecklistItem,
  ChecklistCategory,
  AttestationRecord,
  SubmissionReceipt,
  ArtifactLock,
  AttestationSummary,
  AttestationStepId,
} from './attestation'

export {
  ATTESTATION_STEPS,
  CHECKLIST_CATEGORY_CONFIG,
  DEADLINE_STATUS_CONFIG,
  SUBMISSION_STATUS_CONFIG,
  calculateAttestationSummary,
  allRequiredItemsAcknowledged,
  getPendingChecklistItems,
  isSubmissionComplete,
  canProceedToAttestation,
  canProceedToSubmission,
  generateConfirmationNumber,
  calculatePackageHash,
} from './attestation'
