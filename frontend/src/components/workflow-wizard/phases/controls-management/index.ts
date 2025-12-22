/**
 * Controls Management Phase Components
 * 
 * Phase 7 of the workflow wizard - verifying control effectiveness
 * and managing compensating controls.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

export { ControlsManagementPhase } from './ControlsManagementPhase'
export { StatusReviewStep } from './StatusReviewStep'
export { EvidenceCollectionStep } from './EvidenceCollectionStep'
export { CompensatingControlStep } from './CompensatingControlStep'
export { EffectivenessSignoffStep } from './EffectivenessSignoffStep'

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
} from './types'

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
} from './types'
