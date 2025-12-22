/**
 * Workflow Wizard Types and Interfaces
 * 
 * Defines the type system for the step-by-step workflow wizard UI
 * that guides users through the 9-phase regulatory reporting cycle.
 * 
 * Requirements: 1.1, 1.2
 */

import { ReactNode } from 'react'

// ============================================================================
// Phase Types
// ============================================================================

/**
 * The 9 phases of the regulatory reporting workflow
 */
export type Phase =
  | 'regulatory_intelligence'
  | 'data_requirements'
  | 'cde_identification'
  | 'data_quality_rules'
  | 'lineage_mapping'
  | 'issue_management'
  | 'controls_management'
  | 'documentation'
  | 'attestation'

/**
 * Phase metadata for display purposes
 */
export const PHASE_CONFIG: Record<Phase, PhaseConfig> = {
  regulatory_intelligence: {
    id: 'regulatory_intelligence',
    name: 'Regulatory Intelligence',
    description: 'Review AI-detected regulatory changes and approve catalog updates',
    icon: 'FileSearch',
    estimatedMinutes: 30,
    stepCount: 4,
    hasHumanGate: true,
  },
  data_requirements: {
    id: 'data_requirements',
    name: 'Data Requirements',
    description: 'Validate data element mappings and resolve gaps',
    icon: 'Database',
    estimatedMinutes: 45,
    stepCount: 4,
    hasHumanGate: false,
  },
  cde_identification: {
    id: 'cde_identification',
    name: 'CDE Identification',
    description: 'Review AI-identified CDEs and assign owners',
    icon: 'Target',
    estimatedMinutes: 40,
    stepCount: 4,
    hasHumanGate: true,
  },
  data_quality_rules: {
    id: 'data_quality_rules',
    name: 'Data Quality Rules',
    description: 'Configure quality rules and thresholds for each CDE',
    icon: 'CheckSquare',
    estimatedMinutes: 35,
    stepCount: 4,
    hasHumanGate: false,
  },
  lineage_mapping: {
    id: 'lineage_mapping',
    name: 'Lineage Mapping',
    description: 'Review and enrich data lineage from source to report',
    icon: 'GitBranch',
    estimatedMinutes: 30,
    stepCount: 4,
    hasHumanGate: false,
  },
  issue_management: {
    id: 'issue_management',
    name: 'Issue Management',
    description: 'Resolve open issues before proceeding',
    icon: 'AlertTriangle',
    estimatedMinutes: 60,
    stepCount: 4,
    hasHumanGate: true,
  },
  controls_management: {
    id: 'controls_management',
    name: 'Controls Management',
    description: 'Verify control effectiveness and collect evidence',
    icon: 'Shield',
    estimatedMinutes: 45,
    stepCount: 4,
    hasHumanGate: false,
  },
  documentation: {
    id: 'documentation',
    name: 'Documentation',
    description: 'Review generated documentation and compile package',
    icon: 'FileText',
    estimatedMinutes: 40,
    stepCount: 4,
    hasHumanGate: false,
  },
  attestation: {
    id: 'attestation',
    name: 'Attestation',
    description: 'Final review and executive sign-off',
    icon: 'Award',
    estimatedMinutes: 20,
    stepCount: 4,
    hasHumanGate: true,
  },
}

/**
 * Ordered list of phases for navigation
 * Note: Lineage Mapping comes before Data Quality Rules because DQ rules reference lineage information
 */
export const PHASE_ORDER: Phase[] = [
  'regulatory_intelligence',
  'data_requirements',
  'cde_identification',
  'lineage_mapping',
  'data_quality_rules',
  'issue_management',
  'controls_management',
  'documentation',
  'attestation',
]

// ============================================================================
// Status Types
// ============================================================================

export type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'
export type CycleStatus = 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'submitted' | 'rejected'

// ============================================================================
// Step State
// ============================================================================

export interface StepState {
  id: string
  name: string
  status: StepStatus
  isRequired: boolean
  validationErrors: string[]
  data: Record<string, unknown>
  completedAt?: string
  completedBy?: string
}

// ============================================================================
// Phase State
// ============================================================================

export interface PhaseState {
  id: Phase
  name: string
  description: string
  estimatedMinutes: number
  status: PhaseStatus
  blockingReason?: string
  steps: StepState[]
  completedAt?: string
  completedBy?: string
  approvalRationale?: string
  signatureData?: string
}

export interface PhaseConfig {
  id: Phase
  name: string
  description: string
  icon: string
  estimatedMinutes: number
  stepCount: number
  hasHumanGate: boolean
}

// ============================================================================
// Workflow State
// ============================================================================

export interface WorkflowState {
  currentPhase: Phase
  currentStep: number
  phases: PhaseState[]
  isLoading: boolean
  error: Error | null
}

// ============================================================================
// Workflow Cycle Model (Persistence)
// ============================================================================

export interface WorkflowCycle {
  id: string
  reportId: string
  reportName: string
  periodEndDate: string
  deadline: string
  status: CycleStatus
  currentPhase: Phase
  phases: PhaseRecord[]
  createdAt: string
  createdBy: string
  lastModifiedAt: string
  lastModifiedBy: string
  submittedAt?: string
  submittedBy?: string
}

export interface PhaseRecord {
  phase: Phase
  status: PhaseStatus
  startedAt?: string
  completedAt?: string
  completedBy?: string
  approvalRationale?: string
  signatureData?: string
  steps: StepRecord[]
}

export interface StepRecord {
  stepId: string
  status: StepStatus
  completedAt?: string
  completedBy?: string
  data: Record<string, unknown>
  validationErrors: string[]
}

// ============================================================================
// Progress Tracking
// ============================================================================

export interface ProgressSnapshot {
  cycleId: string
  timestamp: string
  overallProgress: number
  phaseProgress: Record<Phase, number>
  blockers: Blocker[]
  estimatedCompletion: string
}

export interface Blocker {
  type: 'critical_issue' | 'missing_owner' | 'pending_approval' | 'validation_error'
  description: string
  phase: Phase
  stepId?: string
  linkedEntityId?: string
  linkedEntityType?: string
}

// ============================================================================
// Collaboration
// ============================================================================

export interface CollaborationState {
  cycleId: string
  activeUsers: ActiveUser[]
  locks: StepLock[]
  pendingChanges: PendingChange[]
}

export interface ActiveUser {
  userId: string
  userName: string
  avatarUrl?: string
  currentPhase: Phase
  currentStep?: string
  lastActivity: string
}

export interface StepLock {
  stepId: string
  lockedBy: string
  lockedAt: string
  expiresAt: string
}

export interface PendingChange {
  id: string
  stepId: string
  userId: string
  changeType: 'update' | 'complete' | 'revert'
  data: Record<string, unknown>
  timestamp: string
  synced: boolean
}

// ============================================================================
// Component Props Interfaces
// ============================================================================

export interface WorkflowWizardProps {
  cycleId: string
  reportId: string
  initialPhase?: Phase
}

export interface ProgressStepperProps {
  phases: PhaseState[]
  currentPhase: Phase
  onPhaseClick: (phase: Phase) => void
  isMobile?: boolean
}

export interface StepperItem {
  phase: Phase
  label: string
  icon: ReactNode
  status: 'pending' | 'current' | 'completed' | 'blocked'
  tooltip?: string
}

export interface PhaseContainerProps {
  phase: PhaseState
  onStepComplete: (stepId: string, data: Record<string, unknown>) => void
  onPhaseComplete: () => void
  onNavigateBack: () => void
}

export interface HumanGateProps {
  gateType: 'approval' | 'attestation' | 'signature'
  title: string
  description: string
  items: GateItem[]
  onApprove: (rationale: string, signature?: string) => void
  onReject: (reason: string) => void
  requiresSignature: boolean
  minimumRationaleLength: number
}

export interface GateItem {
  id: string
  label: string
  value: string | ReactNode
  isAIGenerated: boolean
  confidenceScore?: number
}

export interface AgentPanelProps {
  agentId: string
  agentName: string
  status: 'idle' | 'running' | 'completed' | 'error'
  currentAction?: string
  progress?: number
  activityLog: AgentActivity[]
  onRetry?: () => void
  onManualOverride?: () => void
}

export interface AgentActivity {
  timestamp: string
  action: string
  status: 'started' | 'completed' | 'failed'
  details?: string
  confidenceScore?: number
}

export interface ContextSidebarProps {
  reportName: string
  cycleDeadline: string
  overallProgress: number
  quickLinks: QuickLink[]
  currentPhaseInfo: PhaseInfo
}

export interface QuickLink {
  label: string
  href: string
  icon: ReactNode
}

export interface PhaseInfo {
  name: string
  stepsCompleted: number
  totalSteps: number
  estimatedTimeRemaining: number
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationRule {
  id: string
  field: string
  type: 'required' | 'minLength' | 'pattern' | 'custom'
  value?: unknown
  message: string
  validator?: (value: unknown, data: Record<string, unknown>) => boolean
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  field: string
  message: string
  stepId?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the index of a phase in the workflow order
 */
export function getPhaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase)
}

/**
 * Get the next phase in the workflow
 */
export function getNextPhase(currentPhase: Phase): Phase | null {
  const currentIndex = getPhaseIndex(currentPhase)
  if (currentIndex < PHASE_ORDER.length - 1) {
    return PHASE_ORDER[currentIndex + 1]
  }
  return null
}

/**
 * Get the previous phase in the workflow
 */
export function getPreviousPhase(currentPhase: Phase): Phase | null {
  const currentIndex = getPhaseIndex(currentPhase)
  if (currentIndex > 0) {
    return PHASE_ORDER[currentIndex - 1]
  }
  return null
}

/**
 * Check if a phase can be navigated to (completed phases only)
 */
export function canNavigateToPhase(targetPhase: Phase, phases: PhaseState[]): boolean {
  const targetState = phases.find(p => p.id === targetPhase)
  return targetState?.status === 'completed' || targetState?.status === 'in_progress'
}

/**
 * Calculate overall progress percentage
 * Property 4: Progress Calculation Accuracy - equal weight per phase
 */
export function calculateOverallProgress(phases: PhaseState[]): number {
  if (phases.length === 0) return 0
  
  let totalSteps = 0
  let completedSteps = 0
  
  for (const phase of phases) {
    totalSteps += phase.steps.length
    completedSteps += phase.steps.filter(s => s.status === 'completed').length
  }
  
  if (totalSteps === 0) return 0
  return Math.round((completedSteps / totalSteps) * 100)
}

/**
 * Check if all required steps in a phase are completed
 * Property 1: Phase Progression Invariant
 */
export function areAllRequiredStepsCompleted(phase: PhaseState): boolean {
  return phase.steps
    .filter(step => step.isRequired)
    .every(step => step.status === 'completed')
}

/**
 * Check if a phase has any validation errors
 */
export function hasValidationErrors(phase: PhaseState): boolean {
  return phase.steps.some(step => step.validationErrors.length > 0)
}

/**
 * Get all validation errors for a phase
 */
export function getPhaseValidationErrors(phase: PhaseState): ValidationError[] {
  return phase.steps.flatMap(step => 
    step.validationErrors.map(message => ({
      field: step.id,
      message,
      stepId: step.id,
    }))
  )
}
