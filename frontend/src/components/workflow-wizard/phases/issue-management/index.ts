/**
 * Issue Management Phase Components
 * 
 * Phase 6 of the workflow wizard - guides users through resolving
 * open issues before proceeding to the next phase.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

export { IssueManagementPhase } from './IssueManagementPhase'
export { IssueTriageStep } from './IssueTriageStep'
export { RootCauseAnalysisStep } from './RootCauseAnalysisStep'
export { ResolutionStep } from './ResolutionStep'
export { VerificationStep } from './VerificationStep'

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
} from './types'

export {
  ISSUE_MANAGEMENT_STEPS,
  SEVERITY_CONFIG,
  STATUS_CONFIG,
  SOURCE_CONFIG,
  ROOT_CAUSE_CONFIG,
  RESOLUTION_TYPE_CONFIG,
  isCriticalUnresolved,
  hasBlockingIssues,
  getBlockingIssues,
  sortIssuesBySeverity,
  calculateIssueSummary,
} from './types'

