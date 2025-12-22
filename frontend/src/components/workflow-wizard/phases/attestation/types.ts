/**
 * Types for Attestation Phase
 * 
 * Defines data structures for executive summary, compliance checklist,
 * digital attestation, and submission confirmation.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

/**
 * Attestation status
 */
export type AttestationStatus = 'pending' | 'in_progress' | 'completed' | 'rejected'

/**
 * Submission status
 */
export type SubmissionStatus = 'draft' | 'pending_submission' | 'submitted' | 'confirmed' | 'failed'

/**
 * Checklist item status
 */
export type ChecklistItemStatus = 'pending' | 'acknowledged' | 'not_applicable'

/**
 * Executive summary metrics
 * Requirements: 11.2 - Display key metrics
 */
export interface ExecutiveSummaryMetrics {
  dataQualityScore: number
  issueResolutionRate: number
  controlPassRate: number
  deadlineStatus: 'on_track' | 'at_risk' | 'overdue'
  daysUntilDeadline: number
  totalCDEs: number
  totalRules: number
  totalControls: number
  totalIssues: number
  resolvedIssues: number
  criticalIssuesRemaining: number
}

/**
 * Phase completion summary
 */
export interface PhaseCompletionSummary {
  phaseId: string
  phaseName: string
  status: 'completed' | 'in_progress' | 'pending'
  completedAt?: string
  completedBy?: string
  keyFindings: string[]
  approvalRationale?: string
}

/**
 * Executive summary data
 * Requirements: 11.2
 */
export interface ExecutiveSummary {
  reportName: string
  reportingPeriod: string
  cycleId: string
  metrics: ExecutiveSummaryMetrics
  phaseCompletions: PhaseCompletionSummary[]
  highlights: string[]
  risks: string[]
  recommendations: string[]
  generatedAt: string
  isAIGenerated: boolean
  aiConfidence?: number
}

/**
 * Checklist item
 * Requirements: 11.3 - Attestation items with acknowledgment
 */
export interface ChecklistItem {
  id: string
  category: ChecklistCategory
  title: string
  description: string
  status: ChecklistItemStatus
  isRequired: boolean
  acknowledgedAt?: string
  acknowledgedBy?: string
  notes?: string
  linkedArtifacts?: string[]
}

/**
 * Checklist category
 */
export type ChecklistCategory = 
  | 'data_quality'
  | 'regulatory_compliance'
  | 'controls'
  | 'documentation'
  | 'governance'
  | 'risk_management'

/**
 * Attestation record
 * Requirements: 11.4 - Digital attestation with identity verification
 */
export interface AttestationRecord {
  id: string
  cycleId: string
  attestorId: string
  attestorName: string
  attestorTitle: string
  attestorEmail: string
  attestationType: 'primary' | 'secondary' | 'witness'
  signatureData: string
  signatureType: 'drawn' | 'typed'
  rationale: string
  attestedAt: string
  ipAddress?: string
  userAgent?: string
  identityVerified: boolean
  verificationMethod?: 'mfa' | 'sso' | 'password'
}

/**
 * Submission receipt
 * Requirements: 11.5 - Generate submission receipt
 */
export interface SubmissionReceipt {
  id: string
  cycleId: string
  reportName: string
  submissionTimestamp: string
  submittedBy: string
  submittedByName: string
  confirmationNumber: string
  packageHash: string
  artifactCount: number
  totalPages: number
  attestations: AttestationRecord[]
  regulatorReference?: string
  status: SubmissionStatus
  lockedAt: string
}

/**
 * Artifact lock record
 * Requirements: 11.5 - Lock all artifacts after submission
 */
export interface ArtifactLock {
  artifactId: string
  artifactName: string
  lockedAt: string
  lockedBy: string
  submissionId: string
  hash: string
}

/**
 * Attestation phase summary
 */
export interface AttestationSummary {
  summaryReviewed: boolean
  checklistCompleted: boolean
  checklistItemsTotal: number
  checklistItemsAcknowledged: number
  attestationCaptured: boolean
  attestations: AttestationRecord[]
  submissionStatus: SubmissionStatus
  submissionReceipt?: SubmissionReceipt
  artifactsLocked: boolean
  lockedArtifacts: ArtifactLock[]
}

/**
 * Step IDs for Attestation phase
 */
export const ATTESTATION_STEPS = {
  EXECUTIVE_SUMMARY: 'executive_summary',
  COMPLIANCE_CHECKLIST: 'compliance_checklist',
  DIGITAL_ATTESTATION: 'digital_attestation',
  SUBMISSION_CONFIRMATION: 'submission_confirmation',
} as const

export type AttestationStepId = typeof ATTESTATION_STEPS[keyof typeof ATTESTATION_STEPS]

/**
 * Checklist category configuration
 */
export const CHECKLIST_CATEGORY_CONFIG: Record<ChecklistCategory, {
  label: string
  description: string
  icon: string
}> = {
  data_quality: {
    label: 'Data Quality',
    description: 'Data quality rules and validation',
    icon: 'CheckSquare',
  },
  regulatory_compliance: {
    label: 'Regulatory Compliance',
    description: 'Regulatory requirements and mappings',
    icon: 'FileText',
  },
  controls: {
    label: 'Controls',
    description: 'Control effectiveness and evidence',
    icon: 'Shield',
  },
  documentation: {
    label: 'Documentation',
    description: 'Documentation completeness',
    icon: 'Book',
  },
  governance: {
    label: 'Governance',
    description: 'Governance framework compliance',
    icon: 'Building',
  },
  risk_management: {
    label: 'Risk Management',
    description: 'Risk identification and mitigation',
    icon: 'AlertTriangle',
  },
}

/**
 * Deadline status configuration
 */
export const DEADLINE_STATUS_CONFIG: Record<ExecutiveSummaryMetrics['deadlineStatus'], {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  on_track: {
    label: 'On Track',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle',
  },
  at_risk: {
    label: 'At Risk',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: 'AlertTriangle',
  },
  overdue: {
    label: 'Overdue',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'XCircle',
  },
}

/**
 * Submission status configuration
 */
export const SUBMISSION_STATUS_CONFIG: Record<SubmissionStatus, {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  draft: {
    label: 'Draft',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: 'FileEdit',
  },
  pending_submission: {
    label: 'Pending Submission',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: 'Clock',
  },
  submitted: {
    label: 'Submitted',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    icon: 'Send',
  },
  confirmed: {
    label: 'Confirmed',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle',
  },
  failed: {
    label: 'Failed',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'XCircle',
  },
}


/**
 * Calculate attestation summary
 */
export function calculateAttestationSummary(
  summaryReviewed: boolean,
  checklistItems: ChecklistItem[],
  attestations: AttestationRecord[],
  submissionStatus: SubmissionStatus,
  submissionReceipt?: SubmissionReceipt,
  lockedArtifacts: ArtifactLock[] = []
): AttestationSummary {
  const requiredItems = checklistItems.filter(item => item.isRequired)
  const acknowledgedItems = checklistItems.filter(
    item => item.status === 'acknowledged' || item.status === 'not_applicable'
  )
  
  return {
    summaryReviewed,
    checklistCompleted: requiredItems.every(
      item => item.status === 'acknowledged' || item.status === 'not_applicable'
    ),
    checklistItemsTotal: checklistItems.length,
    checklistItemsAcknowledged: acknowledgedItems.length,
    attestationCaptured: attestations.length > 0,
    attestations,
    submissionStatus,
    submissionReceipt,
    artifactsLocked: lockedArtifacts.length > 0,
    lockedArtifacts,
  }
}

/**
 * Check if all required checklist items are acknowledged
 */
export function allRequiredItemsAcknowledged(items: ChecklistItem[]): boolean {
  return items
    .filter(item => item.isRequired)
    .every(item => item.status === 'acknowledged' || item.status === 'not_applicable')
}

/**
 * Get pending checklist items
 */
export function getPendingChecklistItems(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter(item => item.status === 'pending' && item.isRequired)
}

/**
 * Check if submission is complete
 * Property 8: Artifact Lock Immutability - artifacts locked after submission
 */
export function isSubmissionComplete(summary: AttestationSummary): boolean {
  return (
    summary.summaryReviewed &&
    summary.checklistCompleted &&
    summary.attestationCaptured &&
    summary.submissionStatus === 'confirmed' &&
    summary.artifactsLocked
  )
}

/**
 * Validate attestation can proceed
 */
export function canProceedToAttestation(
  summaryReviewed: boolean,
  checklistItems: ChecklistItem[]
): boolean {
  return summaryReviewed && allRequiredItemsAcknowledged(checklistItems)
}

/**
 * Validate submission can proceed
 */
export function canProceedToSubmission(
  summaryReviewed: boolean,
  checklistItems: ChecklistItem[],
  attestations: AttestationRecord[]
): boolean {
  return (
    summaryReviewed &&
    allRequiredItemsAcknowledged(checklistItems) &&
    attestations.length > 0
  )
}

/**
 * Generate confirmation number
 */
export function generateConfirmationNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `REG-${timestamp}-${random}`
}

/**
 * Calculate package hash (simplified for demo)
 */
export function calculatePackageHash(artifactIds: string[]): string {
  const combined = artifactIds.sort().join(':')
  let hash = 0
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(16, '0').toUpperCase()
}
