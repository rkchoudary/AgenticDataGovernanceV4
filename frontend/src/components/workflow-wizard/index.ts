/**
 * Workflow Wizard Components
 * 
 * Step-by-step wizard UI for guiding users through the 9-phase
 * regulatory reporting cycle.
 */

export { WorkflowWizard } from './WorkflowWizard'
export { ProgressStepper } from './ProgressStepper'
export { PhaseContainer } from './PhaseContainer'
export { ContextSidebar } from './ContextSidebar'
export type { ExtendedContextSidebarProps } from './ContextSidebar'
export { HumanGate, DEFAULT_MIN_RATIONALE_LENGTH } from './HumanGate'
export type { DecisionType } from './HumanGate'
export { 
  AgentPanel, 
  AIIndicatorBadge,
  AgentInputPrompt,
  isAIGeneratedContent,
  getAIGeneratedActivities,
  validateAIContentDistinction,
} from './AgentPanel'
export type { AgentStatus, ExtendedAgentPanelProps } from './AgentPanel'

// Collaboration Components - Requirements 13.4, 13.5
export { 
  ActiveUserIndicators, 
  StepUserIndicator 
} from './ActiveUserIndicators'
export type { 
  ActiveUserIndicatorsProps, 
  StepUserIndicatorProps 
} from './ActiveUserIndicators'
export { 
  ConflictResolutionDialog, 
  ConflictBanner, 
  ConflictIndicator 
} from './ConflictResolution'
export type { 
  ConflictResolutionProps, 
  ConflictBannerProps, 
  ConflictIndicatorProps 
} from './ConflictResolution'

// Mobile Components - Requirements 15.1, 15.4, 15.5
export {
  MobileWizardLayout,
  MobileDocumentViewer,
  useOfflineQueue,
  OfflineQueueProvider,
  OfflineStatusBanner,
} from './mobile'

// Help System Components - Requirements 14.1, 14.2, 14.3, 14.4, 14.5
export {
  ContextualHelpPanel,
  FieldTooltip,
  FieldLabel,
  ValidationMessageItem,
  InlineFieldError,
  ValidationSummary,
  FieldValidationWrapper,
  AssistanceRequestDialog,
  PHASE_HELP_CONTENT,
  FIELD_TOOLTIPS,
  getStepHelp,
  getPhaseHelp,
  getFieldTooltip,
  createValidationMessage,
  createEmptyValidationState,
  addValidationMessage,
  touchField,
  clearFieldMessages,
} from './help'
export type {
  StepHelpContent,
  CommonIssue,
  PhaseHelpContent,
  FAQ,
  FieldTooltipConfig,
  ValidationRuleInfo,
  ValidationMessage,
  ValidationState,
  AssistanceRequest,
  AssistanceRequestContext,
  AssistanceRequestResult,
  HelpPanelState,
  SearchResult,
} from './help'

// Phase Components
export {
  RegulatoryIntelligencePhase,
  ScanResultsStep,
  ChangeAnalysisStep,
  CatalogUpdatesStep,
  StakeholderApprovalStep,
  REGULATORY_INTELLIGENCE_STEPS,
  CHANGE_TYPE_CONFIG,
} from './phases'

export type {
  DetectedChange,
  ScanResults,
  CatalogUpdateSummary,
  RegulatoryIntelligenceState,
  RegulatoryIntelligenceStepId,
} from './phases'
