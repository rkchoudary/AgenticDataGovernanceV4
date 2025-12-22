/**
 * Workflow Persistence Service
 * 
 * Handles auto-save, resume, and session timeout for workflow wizard state.
 * Implements Property 5: State Persistence Round Trip
 * 
 * Requirements: 13.1, 13.2, 13.3
 */

import { apiClient, ApiResponse } from '@/api'
import { 
  Phase, 
  PhaseState, 
  StepState,
  PhaseRecord,
  StepRecord,
} from '@/types/workflow-wizard'
import { cacheData, getCachedData, queueAction } from './offlineCache'

// ============================================================================
// Types
// ============================================================================

export interface WorkflowSavePayload {
  cycleId: string
  currentPhase: Phase
  currentStep: number
  phases: PhaseState[]
  lastModifiedAt: string
}

export interface WorkflowResumeState {
  cycleId: string
  reportId: string
  reportName: string
  currentPhase: Phase
  currentStep: number
  phases: PhaseState[]
  lastModifiedAt: string
  lastModifiedBy: string
  hasUnsavedChanges: boolean
}

export interface SessionState {
  isAuthenticated: boolean
  expiresAt: number
  userId: string
}

export interface SaveResult {
  success: boolean
  savedAt: string
  error?: string
}

// ============================================================================
// Constants
// ============================================================================

const WORKFLOW_CACHE_KEY_PREFIX = 'workflow-state-'
const SESSION_CHECK_INTERVAL = 60000 // 1 minute
const SESSION_WARNING_THRESHOLD = 300000 // 5 minutes before expiry
const AUTO_SAVE_DEBOUNCE = 2000 // 2 seconds

// ============================================================================
// State Serialization (Property 5: State Persistence Round Trip)
// ============================================================================

/**
 * Serialize workflow state for persistence
 * Converts PhaseState[] to PhaseRecord[] for API compatibility
 */
export function serializeWorkflowState(
  cycleId: string,
  currentPhase: Phase,
  currentStep: number,
  phases: PhaseState[]
): WorkflowSavePayload {
  return {
    cycleId,
    currentPhase,
    currentStep,
    phases: phases.map(phase => ({
      ...phase,
      // Ensure dates are ISO strings
      completedAt: phase.completedAt,
    })),
    lastModifiedAt: new Date().toISOString(),
  }
}

/**
 * Deserialize workflow state from persistence
 * Converts API response back to PhaseState[]
 * Property 5: State Persistence Round Trip - ensures exact restoration
 */
export function deserializeWorkflowState(data: WorkflowResumeState): WorkflowResumeState {
  return {
    ...data,
    phases: data.phases.map(phase => ({
      ...phase,
      steps: phase.steps.map(step => ({
        ...step,
        // Ensure data is properly typed
        data: step.data || {},
        validationErrors: step.validationErrors || [],
      })),
    })),
  }
}

/**
 * Convert PhaseState to PhaseRecord for API
 */
export function phaseStateToRecord(phase: PhaseState): PhaseRecord {
  return {
    phase: phase.id,
    status: phase.status,
    startedAt: phase.status !== 'pending' ? new Date().toISOString() : undefined,
    completedAt: phase.completedAt,
    completedBy: phase.completedBy,
    approvalRationale: phase.approvalRationale,
    signatureData: phase.signatureData,
    steps: phase.steps.map(stepStateToRecord),
  }
}

/**
 * Convert StepState to StepRecord for API
 */
export function stepStateToRecord(step: StepState): StepRecord {
  return {
    stepId: step.id,
    status: step.status,
    completedAt: step.completedAt,
    completedBy: step.completedBy,
    data: step.data,
    validationErrors: step.validationErrors,
  }
}

// ============================================================================
// Auto-Save Service (Requirement 13.1)
// ============================================================================

let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null
let pendingSave: WorkflowSavePayload | null = null

/**
 * Save workflow progress to server
 * Called automatically after each step completion
 */
export async function saveWorkflowProgress(
  payload: WorkflowSavePayload
): Promise<SaveResult> {
  try {
    // First, cache locally for offline support
    await cacheData(
      `${WORKFLOW_CACHE_KEY_PREFIX}${payload.cycleId}`,
      payload,
      24 * 60 * 60 * 1000 // 24 hour TTL
    )

    // Then save to server
    const response = await apiClient.put<ApiResponse<{ savedAt: string }>>(
      `/workflows/${payload.cycleId}/progress`,
      {
        currentPhase: payload.currentPhase,
        currentStep: payload.currentStep,
        phases: payload.phases.map(phaseStateToRecord),
        lastModifiedAt: payload.lastModifiedAt,
      }
    )

    return {
      success: true,
      savedAt: response.data.data.savedAt,
    }
  } catch (error) {
    // If offline, queue for later sync
    if (!navigator.onLine) {
      await queueAction({
        url: `/workflows/${payload.cycleId}/progress`,
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPhase: payload.currentPhase,
          currentStep: payload.currentStep,
          phases: payload.phases.map(phaseStateToRecord),
          lastModifiedAt: payload.lastModifiedAt,
        }),
      })

      return {
        success: true,
        savedAt: payload.lastModifiedAt,
        error: 'Saved locally, will sync when online',
      }
    }

    return {
      success: false,
      savedAt: '',
      error: error instanceof Error ? error.message : 'Failed to save progress',
    }
  }
}

/**
 * Debounced auto-save function
 * Prevents excessive API calls during rapid step completions
 */
export function scheduleAutoSave(payload: WorkflowSavePayload): void {
  pendingSave = payload

  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout)
  }

  autoSaveTimeout = setTimeout(async () => {
    if (pendingSave) {
      await saveWorkflowProgress(pendingSave)
      pendingSave = null
    }
  }, AUTO_SAVE_DEBOUNCE)
}

/**
 * Force immediate save (e.g., before navigation)
 */
export async function flushPendingSave(): Promise<SaveResult | null> {
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout)
    autoSaveTimeout = null
  }

  if (pendingSave) {
    const result = await saveWorkflowProgress(pendingSave)
    pendingSave = null
    return result
  }

  return null
}

// ============================================================================
// Workflow Resume Service (Requirement 13.2)
// ============================================================================

/**
 * Load workflow state from server
 * Returns the saved state for resuming an in-progress workflow
 */
export async function loadWorkflowState(
  cycleId: string
): Promise<WorkflowResumeState | null> {
  try {
    // Try server first
    const response = await apiClient.get<ApiResponse<WorkflowResumeState>>(
      `/workflows/${cycleId}/state`
    )

    const state = deserializeWorkflowState(response.data.data)
    
    // Update local cache
    await cacheData(
      `${WORKFLOW_CACHE_KEY_PREFIX}${cycleId}`,
      state,
      24 * 60 * 60 * 1000
    )

    return state
  } catch (error) {
    // If offline or error, try local cache
    const cached = await getCachedData<WorkflowResumeState>(
      `${WORKFLOW_CACHE_KEY_PREFIX}${cycleId}`
    )

    if (cached) {
      return {
        ...deserializeWorkflowState(cached),
        hasUnsavedChanges: true,
      }
    }

    return null
  }
}

/**
 * Check if a workflow has saved progress that can be resumed
 */
export async function checkForResumableWorkflow(
  cycleId: string
): Promise<{ canResume: boolean; lastModifiedAt?: string; currentPhase?: Phase }> {
  try {
    const response = await apiClient.get<ApiResponse<{
      hasProgress: boolean
      lastModifiedAt: string
      currentPhase: Phase
      currentStep: number
    }>>(`/workflows/${cycleId}/resume-check`)

    return {
      canResume: response.data.data.hasProgress,
      lastModifiedAt: response.data.data.lastModifiedAt,
      currentPhase: response.data.data.currentPhase,
    }
  } catch {
    // Check local cache
    const cached = await getCachedData<WorkflowSavePayload>(
      `${WORKFLOW_CACHE_KEY_PREFIX}${cycleId}`
    )

    if (cached) {
      return {
        canResume: true,
        lastModifiedAt: cached.lastModifiedAt,
        currentPhase: cached.currentPhase,
      }
    }

    return { canResume: false }
  }
}

// ============================================================================
// Session Timeout Handling (Requirement 13.3)
// ============================================================================

type SessionWarningCallback = (minutesRemaining: number) => void
type SessionExpiredCallback = () => void

let sessionCheckInterval: ReturnType<typeof setInterval> | null = null
let sessionWarningCallback: SessionWarningCallback | null = null
let sessionExpiredCallback: SessionExpiredCallback | null = null

/**
 * Start monitoring session timeout
 */
export function startSessionMonitoring(
  onWarning: SessionWarningCallback,
  onExpired: SessionExpiredCallback
): void {
  sessionWarningCallback = onWarning
  sessionExpiredCallback = onExpired

  // Clear any existing interval
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval)
  }

  sessionCheckInterval = setInterval(checkSessionStatus, SESSION_CHECK_INTERVAL)
}

/**
 * Stop session monitoring
 */
export function stopSessionMonitoring(): void {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval)
    sessionCheckInterval = null
  }
  sessionWarningCallback = null
  sessionExpiredCallback = null
}

/**
 * Check current session status
 */
async function checkSessionStatus(): Promise<void> {
  try {
    const response = await apiClient.get<ApiResponse<SessionState>>('/auth/session')
    const session = response.data.data

    if (!session.isAuthenticated) {
      // Session expired
      await handleSessionExpired()
      return
    }

    const timeRemaining = session.expiresAt - Date.now()

    if (timeRemaining <= 0) {
      await handleSessionExpired()
    } else if (timeRemaining <= SESSION_WARNING_THRESHOLD) {
      // Warn user about impending expiry
      const minutesRemaining = Math.ceil(timeRemaining / 60000)
      sessionWarningCallback?.(minutesRemaining)
    }
  } catch {
    // Network error - assume session might be expired
    // Don't immediately expire, let the next check handle it
  }
}

/**
 * Handle session expiration
 * Preserves unsaved work before prompting re-authentication
 */
async function handleSessionExpired(): Promise<void> {
  // Stop monitoring
  stopSessionMonitoring()

  // Flush any pending saves to local cache
  await flushPendingSave()

  // Notify callback
  sessionExpiredCallback?.()
}

/**
 * Preserve current workflow state before session timeout
 */
export async function preserveWorkflowOnTimeout(
  cycleId: string,
  currentPhase: Phase,
  currentStep: number,
  phases: PhaseState[]
): Promise<void> {
  const payload = serializeWorkflowState(cycleId, currentPhase, currentStep, phases)
  
  // Save to local cache with extended TTL
  await cacheData(
    `${WORKFLOW_CACHE_KEY_PREFIX}${cycleId}`,
    {
      ...payload,
      preservedOnTimeout: true,
      preservedAt: new Date().toISOString(),
    },
    7 * 24 * 60 * 60 * 1000 // 7 day TTL for timeout-preserved data
  )
}

/**
 * Restore workflow state after re-authentication
 */
export async function restoreAfterReauth(
  cycleId: string
): Promise<WorkflowResumeState | null> {
  // First check local cache for timeout-preserved data
  const cached = await getCachedData<WorkflowSavePayload & { 
    preservedOnTimeout?: boolean 
  }>(`${WORKFLOW_CACHE_KEY_PREFIX}${cycleId}`)

  if (cached?.preservedOnTimeout) {
    // Try to sync the preserved state to server
    try {
      await saveWorkflowProgress(cached)
    } catch {
      // Continue with local state if sync fails
    }
  }

  // Load the full state
  return loadWorkflowState(cycleId)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clear all cached workflow data for a cycle
 */
export async function clearWorkflowCache(cycleId: string): Promise<void> {
  const { removeCachedData } = await import('./offlineCache')
  await removeCachedData(`${WORKFLOW_CACHE_KEY_PREFIX}${cycleId}`)
}

/**
 * Get the last save timestamp for a workflow
 */
export async function getLastSaveTime(cycleId: string): Promise<string | null> {
  const cached = await getCachedData<WorkflowSavePayload>(
    `${WORKFLOW_CACHE_KEY_PREFIX}${cycleId}`
  )
  return cached?.lastModifiedAt || null
}

/**
 * Check if there are unsaved changes
 */
export function hasUnsavedChanges(): boolean {
  return pendingSave !== null
}
