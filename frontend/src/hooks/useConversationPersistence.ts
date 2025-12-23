import { useState, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiClient, ApiResponse } from '@/api/client'
import { useChatStore, ChatMessage } from '@/stores/chatStore'

/**
 * Session continuity window in milliseconds (24 hours)
 * Validates: Requirements 13.2
 */
const SESSION_CONTINUITY_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Previous session info for continuity prompt
 * Validates: Requirements 13.2
 */
export interface PreviousSessionInfo {
  sessionId: string
  lastActivity: Date
  messageCount: number
  summary?: string
  isWithinContinuityWindow: boolean
}

/**
 * Session recovery result
 * Validates: Requirements 13.1, 13.3
 */
export interface SessionRecoveryResult {
  success: boolean
  messages?: ChatMessage[]
  contextSummary?: string
  foundInMemory: boolean
  foundInLocalStorage: boolean
  error?: string
}

/**
 * Session continuity decision
 * Validates: Requirements 13.2, 13.5
 */
export type SessionContinuityDecision = 'continue' | 'new'

/**
 * Hook for managing conversation persistence
 * 
 * Features:
 * - Browser refresh recovery from Short_Term_Memory
 * - Session continuity within 24 hours
 * - Clear session on explicit new conversation
 * 
 * Validates: Requirements 13.1, 13.2, 13.3, 13.5
 */
export function useConversationPersistence(
  userId?: string,
  tenantId?: string
) {
  const [previousSession, setPreviousSession] = useState<PreviousSessionInfo | null>(null)
  const [showContinuityPrompt, setShowContinuityPrompt] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)

  const {
    sessions,
    restoreSession,
    clearSession,
    initializeSessionWithContext,
  } = useChatStore()

  /**
   * Check for previous session within continuity window
   * Validates: Requirements 13.2
   */
  const checkPreviousSession = useCallback(async (): Promise<PreviousSessionInfo | null> => {
    if (!userId || !tenantId) return null

    try {
      const response = await apiClient.post<ApiResponse<PreviousSessionInfo | null>>(
        '/chat/check-previous-session',
        { user_id: userId, tenant_id: tenantId }
      )
      return response.data.data
    } catch (error) {
      console.error('Failed to check previous session:', error)
      
      // Fall back to local check
      return checkLocalPreviousSession()
    }
  }, [userId, tenantId])

  /**
   * Check local storage for previous session
   */
  const checkLocalPreviousSession = useCallback((): PreviousSessionInfo | null => {
    if (!userId || !tenantId) return null

    const cutoffTime = Date.now() - SESSION_CONTINUITY_WINDOW_MS

    // Find most recent session for this user/tenant
    const userSessions = sessions.filter(
      s => s.userId === userId && s.tenantId === tenantId
    )

    if (userSessions.length === 0) return null

    // Sort by updatedAt descending
    const sortedSessions = [...userSessions].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )

    const mostRecent = sortedSessions[0]
    const lastActivityTime = new Date(mostRecent.updatedAt).getTime()

    if (lastActivityTime < cutoffTime) return null

    return {
      sessionId: mostRecent.id,
      lastActivity: new Date(mostRecent.updatedAt),
      messageCount: mostRecent.messages.length,
      summary: mostRecent.contextSummary,
      isWithinContinuityWindow: true,
    }
  }, [sessions, userId, tenantId])

  /**
   * Recover session after browser refresh
   * Validates: Requirements 13.1, 13.3
   */
  const recoverSessionMutation = useMutation({
    mutationFn: async ({ sessionId }: { sessionId: string }) => {
      if (!userId || !tenantId) {
        throw new Error('User and tenant ID required for session recovery')
      }

      const response = await apiClient.post<ApiResponse<SessionRecoveryResult>>(
        '/chat/recover-session',
        {
          session_id: sessionId,
          user_id: userId,
          tenant_id: tenantId,
        }
      )
      return { sessionId, result: response.data.data }
    },
    onSuccess: ({ sessionId, result }) => {
      if (result.success && result.messages) {
        restoreSession(
          sessionId,
          result.messages.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          })),
          result.contextSummary
        )
      }
      setIsRecovering(false)
      setRecoveryError(null)
    },
    onError: (error) => {
      setIsRecovering(false)
      setRecoveryError(
        error instanceof Error ? error.message : 'Failed to recover session'
      )
    },
  })

  /**
   * Handle session continuity decision
   * Validates: Requirements 13.2, 13.5
   */
  const handleContinuityDecision = useCallback(
    async (decision: SessionContinuityDecision) => {
      setShowContinuityPrompt(false)

      if (decision === 'new') {
        // Clear previous session if exists
        if (previousSession) {
          await clearSessionMutation.mutateAsync(previousSession.sessionId)
        }
        // Create new session
        const newSessionId = initializeSessionWithContext(undefined, userId, tenantId)
        return newSessionId
      }

      // Continue previous session
      if (previousSession) {
        setIsRecovering(true)
        await recoverSessionMutation.mutateAsync({ sessionId: previousSession.sessionId })
        return previousSession.sessionId
      }

      // No previous session, create new
      return initializeSessionWithContext(undefined, userId, tenantId)
    },
    [previousSession, userId, tenantId, initializeSessionWithContext]
  )

  /**
   * Clear session mutation
   * Validates: Requirements 13.5
   */
  const clearSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!userId || !tenantId) {
        throw new Error('User and tenant ID required')
      }

      await apiClient.post('/chat/clear-session', {
        session_id: sessionId,
        user_id: userId,
        tenant_id: tenantId,
      })
      return sessionId
    },
    onSuccess: (sessionId) => {
      clearSession(sessionId)
    },
  })

  /**
   * Start new conversation (clears current session)
   * Validates: Requirements 13.5
   */
  const startNewConversation = useCallback(
    async (currentSessionId?: string) => {
      if (currentSessionId) {
        await clearSessionMutation.mutateAsync(currentSessionId)
      }
      return initializeSessionWithContext(undefined, userId, tenantId)
    },
    [userId, tenantId, initializeSessionWithContext]
  )

  /**
   * Check for previous session on mount
   */
  useEffect(() => {
    const checkSession = async () => {
      if (!userId || !tenantId) return

      const prevSession = await checkPreviousSession()
      if (prevSession && prevSession.isWithinContinuityWindow && prevSession.messageCount > 0) {
        setPreviousSession(prevSession)
        setShowContinuityPrompt(true)
      }
    }

    checkSession()
  }, [userId, tenantId, checkPreviousSession])

  return {
    // State
    previousSession,
    showContinuityPrompt,
    isRecovering,
    recoveryError,

    // Actions
    handleContinuityDecision,
    startNewConversation,
    recoverSession: recoverSessionMutation.mutate,
    clearSession: clearSessionMutation.mutate,

    // Utilities
    checkPreviousSession,
    dismissContinuityPrompt: () => setShowContinuityPrompt(false),
  }
}

/**
 * Hook for auto-persisting conversation state
 * Validates: Requirements 13.4
 */
export function useAutoSaveConversation(
  sessionId?: string,
  userId?: string,
  tenantId?: string,
  enabled: boolean = true
) {
  const { sessions } = useChatStore()
  const session = sessions.find(s => s.id === sessionId)

  const persistMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId || !userId || !tenantId || !session) {
        return
      }

      await apiClient.post('/chat/persist-state', {
        session_id: sessionId,
        user_id: userId,
        tenant_id: tenantId,
        messages: session.messages,
        context_summary: session.contextSummary,
      })
    },
  })

  // Auto-save on message changes
  useEffect(() => {
    if (!enabled || !session || session.messages.length === 0) return

    // Debounce persistence
    const timeoutId = setTimeout(() => {
      persistMutation.mutate()
    }, 2000) // Save 2 seconds after last change

    return () => clearTimeout(timeoutId)
  }, [session?.messages.length, enabled])

  return {
    isPersisting: persistMutation.isPending,
    persistError: persistMutation.error,
    persistNow: persistMutation.mutate,
  }
}
