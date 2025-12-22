/**
 * Attestation Phase Exports
 * 
 * Phase 9 of the workflow wizard - final review and executive sign-off.
 */

export { AttestationPhase } from './AttestationPhase'
export { ExecutiveSummaryStep } from './ExecutiveSummaryStep'
export { ComplianceChecklistStep } from './ComplianceChecklistStep'
export { DigitalAttestationStep } from './DigitalAttestationStep'
export { SubmissionConfirmationStep } from './SubmissionConfirmationStep'

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
} from './types'

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
} from './types'
