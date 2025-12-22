/**
 * useOfflineWorkflow Hook
 * 
 * Bridges the offline queue with workflow wizard actions.
 * Automatically queues actions when offline and syncs when connectivity is restored.
 * 
 * Requirements: 15.5
 */

import { useCallback, useEffect } from 'react'
import { useOfflineQueue, ActionType } from '@/components/workflow-wizard/mobile/OfflineQueue'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { Phase } from '@/types/workflow-wizard'

export interface UseOfflineWorkflowOptions {
  /** Cycle ID for the current workflow */
  cycleId: string
  /** Whether to automatically queue actions when offline */
  autoQueue?: boolean
}

export interface UseOfflineWorkflowReturn {
  /** Whether the device is online */
  isOnline: boolean
  /** Whether there are pending actions for this cycle */
  hasPendingActions: boolean
  /** Number of pending actions */
  pendingCount: number
  /** Number of failed actions */
  failedCount: number
  /** Queue a step completion action */
  queueStepComplete: (phaseId: Phase, stepId: string, data?: Record<string, unknown>) => Promise<string>
  /** Queue a step update action */
  queueStepUpdate: (phaseId: Phase, stepId: string, data: Record<string, unknown>) => Promise<string>
  /** Queue a phase completion action */
  queuePhaseComplete: (phaseId: Phase, rationale?: string, signature?: string) => Promise<string>
  /** Queue an approval action */
  queueApproval: (phaseId: Phase, stepId: string, decision: string, rationale: string) => Promise<string>
  /** Queue a signature action */
  queueSignature: (phaseId: Phase, stepId: string, signatureData: string) => Promise<string>
  /** Manually trigger sync */
  syncNow: () => Promise<{ success: number; failed: number }>
  /** Retry failed actions */
  retryFailed: () => Promise<void>
}

export function useOfflineWorkflow({
  cycleId,
  autoQueue = true,
}: UseOfflineWorkflowOptions): UseOfflineWorkflowReturn {
  const {
    isOnline,
    queuedActions,
    failedActions,
    queueAction,
    syncNow,
    retryFailed,
    hasPendingActions,
    registerBackgroundSync,
  } = useOfflineQueue()

  const { completeStep, updateStepData, completePhase } = useWorkflowWizardStore()

  // Register for background sync when component mounts
  useEffect(() => {
    registerBackgroundSync().catch(console.error)
  }, [registerBackgroundSync])

  // Listen for sync completion messages from service worker
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'WORKFLOW_SYNC_COMPLETE') {
        // Refresh the workflow state after sync
        console.log('Workflow sync completed at:', event.data.timestamp)
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage)
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage)
      }
    }
  }, [])

  // Queue step completion
  const queueStepComplete = useCallback(async (
    phaseId: Phase,
    stepId: string,
    data?: Record<string, unknown>
  ): Promise<string> => {
    // If online, try to complete directly first
    if (isOnline && autoQueue) {
      try {
        completeStep(stepId, data)
        // Still queue for persistence
        return queueAction({
          type: 'step_complete' as ActionType,
          cycleId,
          phaseId,
          stepId,
          data: data || {},
          maxRetries: 3,
          priority: 4,
        })
      } catch {
        // Fall through to queue
      }
    }

    // Queue for later sync
    return queueAction({
      type: 'step_complete' as ActionType,
      cycleId,
      phaseId,
      stepId,
      data: data || {},
      maxRetries: 3,
      priority: 4,
    })
  }, [isOnline, autoQueue, cycleId, queueAction, completeStep])

  // Queue step update
  const queueStepUpdate = useCallback(async (
    phaseId: Phase,
    stepId: string,
    data: Record<string, unknown>
  ): Promise<string> => {
    // Update local state immediately
    if (autoQueue) {
      updateStepData(stepId, data)
    }

    return queueAction({
      type: 'step_update' as ActionType,
      cycleId,
      phaseId,
      stepId,
      data,
      maxRetries: 3,
      priority: 5,
    })
  }, [cycleId, queueAction, updateStepData, autoQueue])

  // Queue phase completion
  const queuePhaseComplete = useCallback(async (
    phaseId: Phase,
    rationale?: string,
    signature?: string
  ): Promise<string> => {
    // Try to complete locally first
    if (autoQueue) {
      completePhase(rationale, signature)
    }

    return queueAction({
      type: 'phase_complete' as ActionType,
      cycleId,
      phaseId,
      data: { rationale, signature },
      maxRetries: 3,
      priority: 3,
    })
  }, [cycleId, queueAction, completePhase, autoQueue])

  // Queue approval
  const queueApproval = useCallback(async (
    phaseId: Phase,
    stepId: string,
    decision: string,
    rationale: string
  ): Promise<string> => {
    return queueAction({
      type: 'approval' as ActionType,
      cycleId,
      phaseId,
      stepId,
      data: { decision, rationale },
      maxRetries: 3,
      priority: 2,
    })
  }, [cycleId, queueAction])

  // Queue signature
  const queueSignature = useCallback(async (
    phaseId: Phase,
    stepId: string,
    signatureData: string
  ): Promise<string> => {
    return queueAction({
      type: 'signature' as ActionType,
      cycleId,
      phaseId,
      stepId,
      data: { signatureData },
      maxRetries: 3,
      priority: 1,
    })
  }, [cycleId, queueAction])

  // Calculate counts for this cycle
  const cycleQueuedActions = queuedActions.filter(a => a.cycleId === cycleId)
  const cycleFailedActions = failedActions.filter(a => a.cycleId === cycleId)

  return {
    isOnline,
    hasPendingActions: hasPendingActions(cycleId),
    pendingCount: cycleQueuedActions.length,
    failedCount: cycleFailedActions.length,
    queueStepComplete,
    queueStepUpdate,
    queuePhaseComplete,
    queueApproval,
    queueSignature,
    syncNow: async () => {
      const result = await syncNow()
      return { success: result.success, failed: result.failed }
    },
    retryFailed,
  }
}
