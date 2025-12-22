/**
 * Workflow Persistence Hook
 * 
 * Custom hook for managing workflow persistence, resume, and session timeout.
 * Provides a clean interface for components to interact with persistence features.
 * 
 * Requirements: 13.1, 13.2, 13.3
 */

import { useEffect, useCallback, useState } from 'react'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { Phase } from '@/types/workflow-wizard'
import { apiClient } from '@/api'

interface UseWorkflowPersistenceOptions {
  cycleId: string
  autoStartSessionMonitor?: boolean
}

interface UseWorkflowPersistenceReturn {
  // State
  isLoading: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  lastSavedAt: string | null
  sessionWarningMinutes: number | null
  isSessionExpired: boolean
  
  // Resume state
  canResume: boolean
  resumeInfo: {
    lastModifiedAt?: string
    currentPhase?: Phase
  } | null
  
  // Actions
  checkForResume: () => Promise<void>
  resumeWorkflow: () => Promise<boolean>
  startFresh: () => void
  saveNow: () => Promise<void>
  extendSession: () => Promise<void>
  handleReauthenticate: () => void
}

export function useWorkflowPersistence({
  cycleId,
  autoStartSessionMonitor = true,
}: UseWorkflowPersistenceOptions): UseWorkflowPersistenceReturn {
  const [canResume, setCanResume] = useState(false)
  const [resumeInfo, setResumeInfo] = useState<{
    lastModifiedAt?: string
    currentPhase?: Phase
  } | null>(null)

  const {
    isLoading,
    isSaving,
    hasUnsavedChanges,
    lastSavedAt,
    sessionWarningMinutes,
    isSessionExpired,
    checkResumable,
    resumeWorkflow: storeResumeWorkflow,
    saveProgress,
    startSessionMonitor,
    stopSessionMonitor,
    resetWorkflow,
    restoreAfterReauth,
  } = useWorkflowWizardStore()

  // Check if workflow can be resumed on mount
  const checkForResume = useCallback(async () => {
    if (!cycleId) return

    const result = await checkResumable(cycleId)
    setCanResume(result.canResume)
    
    if (result.canResume) {
      setResumeInfo({
        lastModifiedAt: result.lastModifiedAt,
        currentPhase: result.currentPhase,
      })
    }
  }, [cycleId, checkResumable])

  // Resume the workflow
  const resumeWorkflow = useCallback(async () => {
    if (!cycleId) return false
    
    const success = await storeResumeWorkflow(cycleId)
    if (success) {
      setCanResume(false)
      setResumeInfo(null)
    }
    return success
  }, [cycleId, storeResumeWorkflow])

  // Start fresh (reset and don't resume)
  const startFresh = useCallback(() => {
    resetWorkflow()
    setCanResume(false)
    setResumeInfo(null)
  }, [resetWorkflow])

  // Force save now
  const saveNow = useCallback(async () => {
    await saveProgress()
  }, [saveProgress])

  // Extend session
  const extendSession = useCallback(async () => {
    try {
      await apiClient.post('/auth/extend-session')
      // Session extended, warning will be cleared by the session monitor
    } catch (error) {
      console.error('Failed to extend session:', error)
    }
  }, [])

  // Handle re-authentication
  const handleReauthenticate = useCallback(() => {
    // Store current URL for redirect after login
    const currentUrl = window.location.href
    sessionStorage.setItem('workflow-redirect', currentUrl)
    
    // Redirect to login
    window.location.href = '/login'
  }, [])

  // Start session monitoring on mount
  useEffect(() => {
    if (autoStartSessionMonitor && cycleId) {
      startSessionMonitor()
      
      return () => {
        stopSessionMonitor()
      }
    }
  }, [autoStartSessionMonitor, cycleId, startSessionMonitor, stopSessionMonitor])

  // Check for resume on mount
  useEffect(() => {
    checkForResume()
  }, [checkForResume])

  // Handle page unload - save progress
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        // Trigger save
        saveProgress()
        
        // Show browser warning
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasUnsavedChanges, saveProgress])

  // Handle visibility change - save when tab becomes hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasUnsavedChanges) {
        saveProgress()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [hasUnsavedChanges, saveProgress])

  // Restore after re-auth if needed
  useEffect(() => {
    const redirectUrl = sessionStorage.getItem('workflow-redirect')
    if (redirectUrl && cycleId) {
      sessionStorage.removeItem('workflow-redirect')
      restoreAfterReauth()
    }
  }, [cycleId, restoreAfterReauth])

  return {
    isLoading,
    isSaving,
    hasUnsavedChanges,
    lastSavedAt,
    sessionWarningMinutes,
    isSessionExpired,
    canResume,
    resumeInfo,
    checkForResume,
    resumeWorkflow,
    startFresh,
    saveNow,
    extendSession,
    handleReauthenticate,
  }
}

export default useWorkflowPersistence
