/**
 * Workflow Wizard Store
 * 
 * Zustand store for managing workflow wizard state including phases, steps, and progress.
 * Implements state management for the 9-phase regulatory reporting workflow.
 * 
 * Requirements: 1.1, 2.1, 13.1, 13.2, 13.3
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  Phase,
  PhaseState,
  StepState,
  WorkflowCycle,
  PhaseStatus,
  StepStatus,
  PHASE_ORDER,
  PHASE_CONFIG,
  getPhaseIndex,
  getNextPhase,
  getPreviousPhase,
  areAllRequiredStepsCompleted,
  hasValidationErrors,
  calculateOverallProgress,
} from '@/types/workflow-wizard'
import {
  scheduleAutoSave,
  serializeWorkflowState,
  loadWorkflowState,
  checkForResumableWorkflow,
  flushPendingSave,
  preserveWorkflowOnTimeout,
  restoreAfterReauth,
  startSessionMonitoring,
  stopSessionMonitoring,
  SaveResult,
} from '@/services/workflowPersistence'

// ============================================================================
// Store State Interface
// ============================================================================

export interface WorkflowWizardState {
  // Core state
  cycleId: string | null
  reportId: string | null
  reportName: string
  cycleDeadline: string | null
  currentPhase: Phase
  currentStep: number
  phases: PhaseState[]
  isLoading: boolean
  error: Error | null
  
  // Computed values (cached)
  overallProgress: number
  
  // Persistence state (Requirements 13.1, 13.2, 13.3)
  lastSavedAt: string | null
  isSaving: boolean
  hasUnsavedChanges: boolean
  isResuming: boolean
  sessionWarningMinutes: number | null
  isSessionExpired: boolean
  
  // Actions
  initializeWorkflow: (cycle: WorkflowCycle) => void
  setCurrentPhase: (phase: Phase) => void
  setCurrentStep: (step: number) => void
  
  // Step actions
  completeStep: (stepId: string, data?: Record<string, unknown>) => void
  updateStepData: (stepId: string, data: Record<string, unknown>) => void
  setStepValidationErrors: (stepId: string, errors: string[]) => void
  
  // Phase actions
  completePhase: (rationale?: string, signature?: string) => boolean
  navigateToPhase: (phase: Phase) => boolean
  navigateToNextPhase: () => boolean
  navigateToPreviousPhase: () => boolean
  
  // Blocking conditions
  setPhaseBlocked: (phase: Phase, reason: string) => void
  clearPhaseBlocked: (phase: Phase) => void
  
  // Persistence actions (Requirements 13.1, 13.2, 13.3)
  saveProgress: () => Promise<SaveResult>
  loadSavedProgress: (cycleId: string) => Promise<boolean>
  checkResumable: (cycleId: string) => Promise<{ canResume: boolean; lastModifiedAt?: string; currentPhase?: Phase }>
  resumeWorkflow: (cycleId: string) => Promise<boolean>
  preserveOnTimeout: () => Promise<void>
  restoreAfterReauth: () => Promise<boolean>
  startSessionMonitor: () => void
  stopSessionMonitor: () => void
  setSessionWarning: (minutes: number | null) => void
  setSessionExpired: (expired: boolean) => void
  
  // Utility
  resetWorkflow: () => void
  getPhaseState: (phase: Phase) => PhaseState | undefined
  getCurrentPhaseState: () => PhaseState | undefined
  canProceedToNextPhase: () => boolean
}

// ============================================================================
// Default Step Configurations per Phase
// ============================================================================

function createDefaultSteps(phase: Phase): StepState[] {
  const stepConfigs: Record<Phase, Array<{ id: string; name: string; isRequired: boolean }>> = {
    regulatory_intelligence: [
      { id: 'scan_results', name: 'Scan Results Review', isRequired: true },
      { id: 'change_analysis', name: 'Change Analysis', isRequired: true },
      { id: 'catalog_updates', name: 'Catalog Updates', isRequired: true },
      { id: 'stakeholder_approval', name: 'Stakeholder Approval', isRequired: true },
    ],
    data_requirements: [
      { id: 'template_parsing', name: 'Template Parsing Review', isRequired: true },
      { id: 'source_mapping', name: 'Source Mapping Validation', isRequired: true },
      { id: 'gap_analysis', name: 'Gap Analysis', isRequired: true },
      { id: 'document_approval', name: 'Document Approval', isRequired: true },
    ],
    cde_identification: [
      { id: 'scoring_review', name: 'Scoring Review', isRequired: true },
      { id: 'inventory_approval', name: 'Inventory Approval', isRequired: true },
      { id: 'ownership_assignment', name: 'Ownership Assignment', isRequired: true },
      { id: 'reconciliation', name: 'Reconciliation', isRequired: true },
    ],
    data_quality_rules: [
      { id: 'rule_review', name: 'Rule Review', isRequired: true },
      { id: 'threshold_config', name: 'Threshold Configuration', isRequired: true },
      { id: 'coverage_validation', name: 'Coverage Validation', isRequired: true },
      { id: 'rule_activation', name: 'Rule Activation', isRequired: true },
    ],
    lineage_mapping: [
      { id: 'pipeline_scan', name: 'Pipeline Scan Review', isRequired: true },
      { id: 'business_terms', name: 'Business Term Linking', isRequired: true },
      { id: 'impact_analysis', name: 'Impact Analysis Setup', isRequired: true },
      { id: 'lineage_approval', name: 'Lineage Approval', isRequired: true },
    ],
    issue_management: [
      { id: 'issue_triage', name: 'Issue Triage', isRequired: true },
      { id: 'root_cause', name: 'Root Cause Analysis', isRequired: true },
      { id: 'resolution', name: 'Resolution Implementation', isRequired: true },
      { id: 'verification', name: 'Verification', isRequired: true },
    ],
    controls_management: [
      { id: 'status_review', name: 'Control Status Review', isRequired: true },
      { id: 'evidence_collection', name: 'Evidence Collection', isRequired: true },
      { id: 'compensating_check', name: 'Compensating Control Check', isRequired: true },
      { id: 'effectiveness_signoff', name: 'Effectiveness Sign-off', isRequired: true },
    ],
    documentation: [
      { id: 'artifact_review', name: 'Artifact Review', isRequired: true },
      { id: 'annotation_resolution', name: 'Annotation Resolution', isRequired: true },
      { id: 'bcbs_mapping', name: 'BCBS 239 Mapping', isRequired: true },
      { id: 'package_compilation', name: 'Package Compilation', isRequired: true },
    ],
    attestation: [
      { id: 'executive_summary', name: 'Executive Summary Review', isRequired: true },
      { id: 'compliance_checklist', name: 'Compliance Checklist', isRequired: true },
      { id: 'digital_attestation', name: 'Digital Attestation', isRequired: true },
      { id: 'submission_confirmation', name: 'Submission Confirmation', isRequired: true },
    ],
  }

  return stepConfigs[phase].map(config => ({
    ...config,
    status: 'pending' as StepStatus,
    validationErrors: [],
    data: {},
  }))
}

function createDefaultPhases(): PhaseState[] {
  return PHASE_ORDER.map((phase, index) => {
    const config = PHASE_CONFIG[phase]
    return {
      id: phase,
      name: config.name,
      description: config.description,
      estimatedMinutes: config.estimatedMinutes,
      status: index === 0 ? 'in_progress' : 'pending' as PhaseStatus,
      steps: createDefaultSteps(phase),
    }
  })
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useWorkflowWizardStore = create<WorkflowWizardState>()(
  persist(
    (set, get) => ({
      // Initial state
      cycleId: null,
      reportId: null,
      reportName: '',
      cycleDeadline: null,
      currentPhase: 'regulatory_intelligence',
      currentStep: 0,
      phases: createDefaultPhases(),
      isLoading: false,
      error: null,
      overallProgress: 0,
      
      // Persistence state (Requirements 13.1, 13.2, 13.3)
      lastSavedAt: null,
      isSaving: false,
      hasUnsavedChanges: false,
      isResuming: false,
      sessionWarningMinutes: null,
      isSessionExpired: false,

      // Initialize workflow from a cycle
      initializeWorkflow: (cycle: WorkflowCycle) => {
        const phases = cycle.phases.length > 0
          ? cycle.phases.map(record => {
              const config = PHASE_CONFIG[record.phase]
              return {
                id: record.phase,
                name: config.name,
                description: config.description,
                estimatedMinutes: config.estimatedMinutes,
                status: record.status,
                steps: record.steps.length > 0
                  ? record.steps.map(s => ({
                      id: s.stepId,
                      name: s.stepId, // Will be enriched by component
                      status: s.status,
                      isRequired: true,
                      validationErrors: s.validationErrors,
                      data: s.data,
                      completedAt: s.completedAt,
                      completedBy: s.completedBy,
                    }))
                  : createDefaultSteps(record.phase),
                completedAt: record.completedAt,
                completedBy: record.completedBy,
                approvalRationale: record.approvalRationale,
                signatureData: record.signatureData,
              } as PhaseState
            })
          : createDefaultPhases()

        set({
          cycleId: cycle.id,
          reportId: cycle.reportId,
          reportName: cycle.reportName,
          cycleDeadline: cycle.deadline,
          currentPhase: cycle.currentPhase,
          currentStep: 0,
          phases,
          overallProgress: calculateOverallProgress(phases),
          isLoading: false,
          error: null,
          hasUnsavedChanges: false,
          lastSavedAt: cycle.lastModifiedAt,
        })
      },

      setCurrentPhase: (phase: Phase) => {
        set({ currentPhase: phase, currentStep: 0 })
      },

      setCurrentStep: (step: number) => {
        set({ currentStep: step })
      },

      // Complete a step within the current phase
      // Requirement 13.1: Auto-save on step completion
      completeStep: (stepId: string, data?: Record<string, unknown>) => {
        const { cycleId, currentPhase, currentStep, phases } = get()
        
        const currentPhaseState = phases.find(p => p.id === currentPhase)
        const stepIndex = currentPhaseState?.steps.findIndex(s => s.id === stepId) ?? -1
        
        const updatedPhases = phases.map(phase => {
          if (phase.id !== currentPhase) return phase
          
          const updatedSteps = phase.steps.map(step => {
            if (step.id !== stepId) return step
            return {
              ...step,
              status: 'completed' as StepStatus,
              data: data ?? step.data,
              completedAt: new Date().toISOString(),
              validationErrors: [],
            }
          })
          
          return { ...phase, steps: updatedSteps }
        })
        
        const newProgress = calculateOverallProgress(updatedPhases)
        
        // Auto-advance to next step if there is one
        const totalSteps = currentPhaseState?.steps.length ?? 0
        const nextStep = stepIndex >= 0 && stepIndex < totalSteps - 1 
          ? stepIndex + 1 
          : currentStep
        
        set({
          phases: updatedPhases,
          overallProgress: newProgress,
          hasUnsavedChanges: true,
          currentStep: nextStep,
        })
        
        // Trigger auto-save (Requirement 13.1)
        if (cycleId) {
          const payload = serializeWorkflowState(
            cycleId,
            currentPhase,
            nextStep,
            updatedPhases
          )
          scheduleAutoSave(payload)
        }
      },

      // Update step data without completing
      updateStepData: (stepId: string, data: Record<string, unknown>) => {
        const { currentPhase, phases } = get()
        
        const updatedPhases = phases.map(phase => {
          if (phase.id !== currentPhase) return phase
          
          const updatedSteps = phase.steps.map(step => {
            if (step.id !== stepId) return step
            return {
              ...step,
              data: { ...step.data, ...data },
              status: step.status === 'pending' ? 'in_progress' : step.status,
            }
          })
          
          return { ...phase, steps: updatedSteps }
        })
        
        set({ phases: updatedPhases })
      },

      // Set validation errors for a step
      setStepValidationErrors: (stepId: string, errors: string[]) => {
        const { currentPhase, phases } = get()
        
        const updatedPhases = phases.map(phase => {
          if (phase.id !== currentPhase) return phase
          
          const updatedSteps = phase.steps.map(step => {
            if (step.id !== stepId) return step
            return { ...step, validationErrors: errors }
          })
          
          return { ...phase, steps: updatedSteps }
        })
        
        set({ phases: updatedPhases })
      },

      /**
       * Complete the current phase
       * Property 1: Phase Progression Invariant - validates all required steps are completed
       */
      completePhase: (rationale?: string, signature?: string) => {
        const { currentPhase, phases } = get()
        const phaseState = phases.find(p => p.id === currentPhase)
        
        if (!phaseState) return false
        
        // Property 1: Check all required steps are completed
        if (!areAllRequiredStepsCompleted(phaseState)) {
          return false
        }
        
        // Check for validation errors
        if (hasValidationErrors(phaseState)) {
          return false
        }
        
        const updatedPhases = phases.map(phase => {
          if (phase.id !== currentPhase) return phase
          return {
            ...phase,
            status: 'completed' as PhaseStatus,
            completedAt: new Date().toISOString(),
            approvalRationale: rationale,
            signatureData: signature,
          }
        })
        
        set({
          phases: updatedPhases,
          overallProgress: calculateOverallProgress(updatedPhases),
        })
        
        return true
      },

      // Navigate to a specific phase (only completed or current phases)
      navigateToPhase: (phase: Phase) => {
        const { phases, currentPhase } = get()
        const targetPhase = phases.find(p => p.id === phase)
        const currentPhaseState = phases.find(p => p.id === currentPhase)
        
        if (!targetPhase) return false
        
        // Can navigate to completed phases or current phase
        if (targetPhase.status === 'completed' || 
            targetPhase.status === 'in_progress' ||
            phase === currentPhase) {
          set({ currentPhase: phase, currentStep: 0 })
          return true
        }
        
        // Can navigate to next phase if current is completed
        const targetIndex = getPhaseIndex(phase)
        const currentIndex = getPhaseIndex(currentPhase)
        
        if (targetIndex === currentIndex + 1 && currentPhaseState?.status === 'completed') {
          // Mark the target phase as in_progress
          const updatedPhases = phases.map(p => {
            if (p.id === phase) {
              return { ...p, status: 'in_progress' as PhaseStatus }
            }
            return p
          })
          set({ currentPhase: phase, currentStep: 0, phases: updatedPhases })
          return true
        }
        
        return false
      },

      // Navigate to next phase
      navigateToNextPhase: () => {
        const { currentPhase, phases } = get()
        const nextPhase = getNextPhase(currentPhase)
        
        if (!nextPhase) return false
        
        const currentPhaseState = phases.find(p => p.id === currentPhase)
        
        // Property 1: Must complete current phase first
        if (currentPhaseState?.status !== 'completed') {
          return false
        }
        
        // Check if next phase is blocked
        const nextPhaseState = phases.find(p => p.id === nextPhase)
        if (nextPhaseState?.status === 'blocked') {
          return false
        }
        
        // Mark next phase as in_progress
        const updatedPhases = phases.map(p => {
          if (p.id === nextPhase) {
            return { ...p, status: 'in_progress' as PhaseStatus }
          }
          return p
        })
        
        set({ currentPhase: nextPhase, currentStep: 0, phases: updatedPhases })
        return true
      },

      // Navigate to previous phase (for review)
      navigateToPreviousPhase: () => {
        const { currentPhase } = get()
        const prevPhase = getPreviousPhase(currentPhase)
        
        if (!prevPhase) return false
        
        set({ currentPhase: prevPhase, currentStep: 0 })
        return true
      },

      // Set a phase as blocked
      setPhaseBlocked: (phase: Phase, reason: string) => {
        const { phases } = get()
        
        const updatedPhases = phases.map(p => {
          if (p.id !== phase) return p
          return {
            ...p,
            status: 'blocked' as PhaseStatus,
            blockingReason: reason,
          }
        })
        
        set({ phases: updatedPhases })
      },

      // Clear blocking condition
      clearPhaseBlocked: (phase: Phase) => {
        const { phases } = get()
        
        const updatedPhases = phases.map(p => {
          if (p.id !== phase) return p
          return {
            ...p,
            status: 'pending' as PhaseStatus,
            blockingReason: undefined,
          }
        })
        
        set({ phases: updatedPhases })
      },

      // Reset workflow to initial state
      resetWorkflow: () => {
        set({
          cycleId: null,
          reportId: null,
          reportName: '',
          cycleDeadline: null,
          currentPhase: 'regulatory_intelligence',
          currentStep: 0,
          phases: createDefaultPhases(),
          isLoading: false,
          error: null,
          overallProgress: 0,
          lastSavedAt: null,
          isSaving: false,
          hasUnsavedChanges: false,
          isResuming: false,
          sessionWarningMinutes: null,
          isSessionExpired: false,
        })
      },

      // ========================================================================
      // Persistence Actions (Requirements 13.1, 13.2, 13.3)
      // ========================================================================

      /**
       * Save current progress to server
       * Requirement 13.1: Auto-save on step completion
       */
      saveProgress: async () => {
        const { cycleId, currentPhase, currentStep, phases } = get()
        
        if (!cycleId) {
          return { success: false, savedAt: '', error: 'No cycle ID' }
        }
        
        set({ isSaving: true })
        
        const payload = serializeWorkflowState(cycleId, currentPhase, currentStep, phases)
        const flushedResult = await flushPendingSave()
        const result: SaveResult = flushedResult ?? await import('@/services/workflowPersistence').then(
          m => m.saveWorkflowProgress(payload)
        )
        
        set({
          isSaving: false,
          hasUnsavedChanges: !result.success,
          lastSavedAt: result.success ? result.savedAt : get().lastSavedAt,
        })
        
        return result
      },

      /**
       * Load saved progress from server
       * Requirement 13.2: Workflow resume
       */
      loadSavedProgress: async (cycleId: string) => {
        set({ isLoading: true, isResuming: true })
        
        try {
          const state = await loadWorkflowState(cycleId)
          
          if (!state) {
            set({ isLoading: false, isResuming: false })
            return false
          }
          
          set({
            cycleId: state.cycleId,
            reportId: state.reportId,
            reportName: state.reportName,
            currentPhase: state.currentPhase,
            currentStep: state.currentStep,
            phases: state.phases,
            overallProgress: calculateOverallProgress(state.phases),
            lastSavedAt: state.lastModifiedAt,
            hasUnsavedChanges: state.hasUnsavedChanges || false,
            isLoading: false,
            isResuming: false,
            error: null,
          })
          
          return true
        } catch (error) {
          set({
            isLoading: false,
            isResuming: false,
            error: error instanceof Error ? error : new Error('Failed to load progress'),
          })
          return false
        }
      },

      /**
       * Check if workflow can be resumed
       * Requirement 13.2: Display "Resume" prompt
       */
      checkResumable: async (cycleId: string) => {
        return checkForResumableWorkflow(cycleId)
      },

      /**
       * Resume an in-progress workflow
       * Requirement 13.2: Restore position when returning
       */
      resumeWorkflow: async (cycleId: string) => {
        return get().loadSavedProgress(cycleId)
      },

      /**
       * Preserve workflow state on session timeout
       * Requirement 13.3: Preserve unsaved work on timeout
       */
      preserveOnTimeout: async () => {
        const { cycleId, currentPhase, currentStep, phases } = get()
        
        if (!cycleId) return
        
        await preserveWorkflowOnTimeout(cycleId, currentPhase, currentStep, phases)
      },

      /**
       * Restore workflow after re-authentication
       * Requirement 13.3: Prompt re-authentication
       */
      restoreAfterReauth: async () => {
        const { cycleId } = get()
        
        if (!cycleId) return false
        
        set({ isLoading: true, isResuming: true })
        
        try {
          const state = await restoreAfterReauth(cycleId)
          
          if (!state) {
            set({ isLoading: false, isResuming: false })
            return false
          }
          
          set({
            currentPhase: state.currentPhase,
            currentStep: state.currentStep,
            phases: state.phases,
            overallProgress: calculateOverallProgress(state.phases),
            lastSavedAt: state.lastModifiedAt,
            hasUnsavedChanges: false,
            isLoading: false,
            isResuming: false,
            isSessionExpired: false,
          })
          
          return true
        } catch {
          set({ isLoading: false, isResuming: false })
          return false
        }
      },

      /**
       * Start session timeout monitoring
       * Requirement 13.3: Session timeout handling
       */
      startSessionMonitor: () => {
        startSessionMonitoring(
          (minutes) => get().setSessionWarning(minutes),
          () => {
            get().preserveOnTimeout()
            get().setSessionExpired(true)
          }
        )
      },

      /**
       * Stop session monitoring
       */
      stopSessionMonitor: () => {
        stopSessionMonitoring()
      },

      /**
       * Set session warning state
       */
      setSessionWarning: (minutes: number | null) => {
        set({ sessionWarningMinutes: minutes })
      },

      /**
       * Set session expired state
       */
      setSessionExpired: (expired: boolean) => {
        set({ isSessionExpired: expired })
      },

      // Get state for a specific phase
      getPhaseState: (phase: Phase) => {
        return get().phases.find(p => p.id === phase)
      },

      // Get current phase state
      getCurrentPhaseState: () => {
        const { currentPhase, phases } = get()
        return phases.find(p => p.id === currentPhase)
      },

      /**
       * Check if can proceed to next phase
       * Property 1: Phase Progression Invariant
       */
      canProceedToNextPhase: () => {
        const { currentPhase, phases } = get()
        const phaseState = phases.find(p => p.id === currentPhase)
        
        if (!phaseState) return false
        
        // All required steps must be completed
        if (!areAllRequiredStepsCompleted(phaseState)) {
          return false
        }
        
        // No validation errors
        if (hasValidationErrors(phaseState)) {
          return false
        }
        
        // Check if next phase exists and is not blocked
        const nextPhase = getNextPhase(currentPhase)
        if (!nextPhase) return false
        
        const nextPhaseState = phases.find(p => p.id === nextPhase)
        if (nextPhaseState?.status === 'blocked') {
          return false
        }
        
        return true
      },
    }),
    {
      name: 'workflow-wizard-storage',
      version: 2, // Incremented to force migration for phase order fix
      partialize: (state) => ({
        cycleId: state.cycleId,
        reportId: state.reportId,
        reportName: state.reportName,
        cycleDeadline: state.cycleDeadline,
        currentPhase: state.currentPhase,
        currentStep: state.currentStep,
        phases: state.phases,
        overallProgress: state.overallProgress,
        lastSavedAt: state.lastSavedAt,
      }),
      migrate: (persistedState, version) => {
        const state = persistedState as {
          cycleId: string | null
          reportId: string | null
          reportName: string
          cycleDeadline: string | null
          currentPhase: Phase
          currentStep: number
          phases: PhaseState[]
          overallProgress: number
          lastSavedAt: string | null
        }
        
        // Version 2: Fix phase order (lineage_mapping before data_quality_rules)
        if (version < 2) {
          // Reset phases to use correct order from PHASE_ORDER
          return {
            cycleId: state.cycleId ?? null,
            reportId: state.reportId ?? null,
            reportName: state.reportName ?? '',
            cycleDeadline: state.cycleDeadline ?? null,
            currentPhase: 'regulatory_intelligence' as Phase,
            currentStep: 0,
            phases: createDefaultPhases(),
            overallProgress: 0,
            lastSavedAt: state.lastSavedAt ?? null,
          }
        }
        return state
      },
    }
  )
)
