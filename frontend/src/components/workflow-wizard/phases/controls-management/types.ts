/**
 * Types for Controls Management Phase
 * 
 * Defines data structures for control status review, evidence collection,
 * compensating control management, and effectiveness sign-off.
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

/**
 * Control type categories
 */
export type ControlType = 'organizational' | 'process' | 'access' | 'change_management'

/**
 * Control category (preventive vs detective)
 */
export type ControlCategory = 'preventive' | 'detective'

/**
 * Control status
 */
export type ControlStatus = 'active' | 'inactive' | 'compensating'

/**
 * Automation status
 */
export type AutomationStatus = 'manual' | 'semi_automated' | 'fully_automated'

/**
 * Control evidence outcome
 */
export type ControlEvidenceOutcome = 'pass' | 'fail' | 'exception'

/**
 * Evidence type
 */
export type EvidenceType = 
  | 'screenshot'
  | 'document'
  | 'log'
  | 'report'
  | 'attestation'
  | 'approval'

/**
 * Control frequency
 */
export type ControlFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'continuous'

/**
 * Control evidence record
 */
export interface ControlEvidence {
  id: string
  controlId: string
  type: EvidenceType
  name: string
  description: string
  executionDate: string
  outcome: ControlEvidenceOutcome
  details: string
  uploadedBy: string
  uploadedAt: string
  url?: string
  metadata?: Record<string, string>
}

/**
 * Control definition
 */
export interface Control {
  id: string
  name: string
  description: string
  type: ControlType
  category: ControlCategory
  owner: string
  ownerName?: string
  frequency: ControlFrequency
  linkedCDEs: string[]
  linkedProcesses: string[]
  automationStatus: AutomationStatus
  ruleId?: string
  status: ControlStatus
  expirationDate?: string
  linkedIssueId?: string
  evidence: ControlEvidence[]
  lastReviewedAt?: string
  lastReviewedBy?: string
  nextReviewDate?: string
  effectivenessRating?: number
  isAIGenerated?: boolean
  aiConfidence?: number
}

/**
 * Compensating control with expiration tracking
 */
export interface CompensatingControl extends Control {
  status: 'compensating'
  linkedIssueId: string
  expirationDate: string
  renewalRequired: boolean
  renewalConfirmedAt?: string
  renewalConfirmedBy?: string
}

/**
 * Control summary statistics
 */
export interface ControlSummary {
  totalControls: number
  activeControls: number
  inactiveControls: number
  compensatingControls: number
  passedControls: number
  failedControls: number
  exceptionControls: number
  pendingReviewControls: number
  expiringCompensatingControls: number
  overallEffectiveness: number
}

/**
 * Effectiveness attestation
 */
export interface EffectivenessAttestation {
  controlId: string
  attestedBy: string
  attestedAt: string
  effectivenessRating: number
  rationale: string
  signature?: string
  isEffective: boolean
}

/**
 * Step IDs for Controls Management phase
 */
export const CONTROLS_MANAGEMENT_STEPS = {
  STATUS_REVIEW: 'control_status_review',
  EVIDENCE_COLLECTION: 'evidence_collection',
  COMPENSATING_CHECK: 'compensating_control_check',
  EFFECTIVENESS_SIGNOFF: 'effectiveness_signoff',
} as const

export type ControlsManagementStepId = typeof CONTROLS_MANAGEMENT_STEPS[keyof typeof CONTROLS_MANAGEMENT_STEPS]

/**
 * Control type display configuration
 */
export const CONTROL_TYPE_CONFIG: Record<ControlType, {
  label: string
  description: string
  icon: string
}> = {
  organizational: {
    label: 'Organizational',
    description: 'Governance and oversight controls',
    icon: 'Building2',
  },
  process: {
    label: 'Process',
    description: 'Operational process controls',
    icon: 'Workflow',
  },
  access: {
    label: 'Access',
    description: 'Access and authorization controls',
    icon: 'Lock',
  },
  change_management: {
    label: 'Change Management',
    description: 'Change control and approval processes',
    icon: 'GitBranch',
  },
}

/**
 * Control category display configuration
 */
export const CONTROL_CATEGORY_CONFIG: Record<ControlCategory, {
  label: string
  description: string
  color: string
  bgColor: string
}> = {
  preventive: {
    label: 'Preventive',
    description: 'Controls that prevent issues from occurring',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
  },
  detective: {
    label: 'Detective',
    description: 'Controls that detect issues after they occur',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
  },
}

/**
 * Control status display configuration
 */
export const CONTROL_STATUS_CONFIG: Record<ControlStatus, {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  active: {
    label: 'Active',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle',
  },
  inactive: {
    label: 'Inactive',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: 'XCircle',
  },
  compensating: {
    label: 'Compensating',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: 'AlertTriangle',
  },
}

/**
 * Evidence outcome display configuration
 */
export const EVIDENCE_OUTCOME_CONFIG: Record<ControlEvidenceOutcome, {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  pass: {
    label: 'Pass',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle',
  },
  fail: {
    label: 'Fail',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'XCircle',
  },
  exception: {
    label: 'Exception',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: 'AlertTriangle',
  },
}

/**
 * Evidence type display configuration
 */
export const EVIDENCE_TYPE_CONFIG: Record<EvidenceType, {
  label: string
  icon: string
  acceptedFormats: string[]
}> = {
  screenshot: {
    label: 'Screenshot',
    icon: 'Image',
    acceptedFormats: ['.png', '.jpg', '.jpeg', '.gif'],
  },
  document: {
    label: 'Document',
    icon: 'FileText',
    acceptedFormats: ['.pdf', '.doc', '.docx', '.xlsx'],
  },
  log: {
    label: 'Log File',
    icon: 'FileCode',
    acceptedFormats: ['.log', '.txt', '.csv'],
  },
  report: {
    label: 'Report',
    icon: 'FileBarChart',
    acceptedFormats: ['.pdf', '.xlsx', '.html'],
  },
  attestation: {
    label: 'Attestation',
    icon: 'FileCheck',
    acceptedFormats: ['.pdf', '.doc', '.docx'],
  },
  approval: {
    label: 'Approval',
    icon: 'CheckSquare',
    acceptedFormats: ['.pdf', '.eml', '.msg'],
  },
}

/**
 * Automation status display configuration
 */
export const AUTOMATION_STATUS_CONFIG: Record<AutomationStatus, {
  label: string
  color: string
  bgColor: string
}> = {
  manual: {
    label: 'Manual',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
  },
  semi_automated: {
    label: 'Semi-Automated',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
  },
  fully_automated: {
    label: 'Fully Automated',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
  },
}

/**
 * Calculate control summary statistics
 */
export function calculateControlSummary(controls: Control[]): ControlSummary {
  const summary: ControlSummary = {
    totalControls: controls.length,
    activeControls: 0,
    inactiveControls: 0,
    compensatingControls: 0,
    passedControls: 0,
    failedControls: 0,
    exceptionControls: 0,
    pendingReviewControls: 0,
    expiringCompensatingControls: 0,
    overallEffectiveness: 0,
  }

  let totalEffectiveness = 0
  let effectivenessCount = 0
  const now = new Date()
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  for (const control of controls) {
    // Count by status
    switch (control.status) {
      case 'active':
        summary.activeControls++
        break
      case 'inactive':
        summary.inactiveControls++
        break
      case 'compensating':
        summary.compensatingControls++
        // Check if expiring within 30 days
        if (control.expirationDate) {
          const expDate = new Date(control.expirationDate)
          if (expDate <= thirtyDaysFromNow) {
            summary.expiringCompensatingControls++
          }
        }
        break
    }

    // Get latest evidence outcome
    const latestEvidence = control.evidence
      .sort((a, b) => new Date(b.executionDate).getTime() - new Date(a.executionDate).getTime())[0]

    if (latestEvidence) {
      switch (latestEvidence.outcome) {
        case 'pass':
          summary.passedControls++
          break
        case 'fail':
          summary.failedControls++
          break
        case 'exception':
          summary.exceptionControls++
          break
      }
    } else {
      summary.pendingReviewControls++
    }

    // Calculate effectiveness
    if (control.effectivenessRating !== undefined) {
      totalEffectiveness += control.effectivenessRating
      effectivenessCount++
    }
  }

  if (effectivenessCount > 0) {
    summary.overallEffectiveness = Math.round(totalEffectiveness / effectivenessCount)
  }

  return summary
}

/**
 * Get controls that need review
 */
export function getControlsNeedingReview(controls: Control[]): Control[] {
  const now = new Date()
  return controls.filter(control => {
    if (control.status !== 'active') return false
    if (!control.nextReviewDate) return true
    return new Date(control.nextReviewDate) <= now
  })
}

/**
 * Get expiring compensating controls
 */
export function getExpiringCompensatingControls(
  controls: Control[],
  withinDays: number = 30
): Control[] {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() + withinDays)

  return controls.filter(control =>
    control.status === 'compensating' &&
    control.expirationDate &&
    new Date(control.expirationDate) <= cutoffDate
  )
}

/**
 * Check if control has recent evidence
 */
export function hasRecentEvidence(control: Control, withinDays: number = 30): boolean {
  if (control.evidence.length === 0) return false
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - withinDays)
  
  return control.evidence.some(e => new Date(e.executionDate) >= cutoffDate)
}

/**
 * Get latest evidence for a control
 */
export function getLatestEvidence(control: Control): ControlEvidence | undefined {
  if (control.evidence.length === 0) return undefined
  return control.evidence
    .sort((a, b) => new Date(b.executionDate).getTime() - new Date(a.executionDate).getTime())[0]
}

/**
 * Check if all controls have been attested
 */
export function allControlsAttested(controls: Control[]): boolean {
  return controls.every(control => 
    control.effectivenessRating !== undefined &&
    control.lastReviewedAt !== undefined
  )
}
