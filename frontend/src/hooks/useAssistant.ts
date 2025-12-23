/**
 * useAssistant Hook - React integration for the Assistant Service
 * 
 * Provides a React hook for interacting with the AI Assistant including:
 * - Streaming chat responses
 * - Tool execution tracking
 * - Human gate handling
 * - Session management with Memory Service
 * 
 * Validates: Requirements 1.1, 1.2, 13.1
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiResponse } from '@/api/client'
import { useChatStore, ChatMessage, ToolCall, Reference } from '@/stores/chatStore'

// ==================== Types ====================

/**
 * Page context for contextual suggestions
 */
export interface PageContext {
  path: string
  pageType: string
  entityId?: string
  entityType?: string
  metadata?: Record<string, unknown>
}

/**
 * Human gate action requiring approval
 */
export interface HumanGateAction {
  id: string
  type: 'approval' | 'sign_off' | 'mapping_change' | 'ownership_change' | 'control_effectiveness'
  title: string
  description: string
  impact: string
  requiredRole: string
  entityType: string
  entityId: string
  proposedChanges?: Record<string, unknown>
  aiRationale: string
  toolName?: string
  toolParameters?: Record<string, unknown>
  expiresAt?: string
}

/**
 * Human gate decision result
 */
export interface HumanGateResult {
  actionId: string
  decision: 'approved' | 'rejected' | 'deferred'
  rationale: string
  decidedBy: string
  decidedAt: string
  signature?: string
}

/**
 * Chat request to the assistant
 */
export interface AssistantChatRequest {
  sessionId: string
  message: string
  userId: string
  tenantId: string
  pageContext?: PageContext
}

/**
 * Streaming response chunk types
 */
export type StreamChunkType = 
  | 'text'
  | 'tool_start'
  | 'tool_result'
  | 'reference'
  | 'quick_action'
  | 'human_gate'
  | 'error'
  | 'context_summary'
  | 'complete'

/**
 * Streaming response chunk
 */
export interface StreamChunk {
  type: StreamChunkType
  content: unknown
  messageId?: string
  timestamp?: string
}

/**
 * Quick action suggestion
 */
export interface QuickAction {
  id: string
  label: string
  type: 'query' | 'command' | 'navigation'
  action: string
  icon?: string
}

/**
 * Assistant hook options
 */
export interface UseAssistantOptions {
  /** Session ID for the conversation */
  sessionId: string
  /** User ID for memory service */
  userId: string
  /** Tenant ID for data isolation */
  tenantId: string
  /** Current page context */
  pageContext?: PageContext
  /** Callback when a human gate action is required */
  onHumanGateRequired?: (action: HumanGateAction) => void
  /** Callback when a tool call starts */
  onToolCallStart?: (toolCall: ToolCall) => void
  /** Callback when a tool call completes */
  onToolCallComplete?: (toolCall: ToolCall) => void
  /** Callback when quick actions are suggested */
  onQuickActions?: (actions: QuickAction[]) => void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
}

/**
 * Assistant hook return type
 */
export interface UseAssistantReturn {
  /** Send a message to the assistant */
  sendMessage: (message: string) => Promise<void>
  /** Whether a message is being sent */
  isSending: boolean
  /** Current streaming content */
  streamingContent: string | null
  /** Whether the assistant is typing */
  isTyping: boolean
  /** Current error if any */
  error: Error | null
  /** Clear the current error */
  clearError: () => void
  /** Retry the last failed message */
  retryLastMessage: () => Promise<void>
  /** Execute a tool manually */
  executeTool: (toolName: string, parameters: Record<string, unknown>) => Promise<void>
  /** Submit a human gate decision */
  submitHumanGateDecision: (
    actionId: string,
    decision: 'approved' | 'rejected' | 'deferred',
    rationale: string
  ) => Promise<HumanGateResult>
  /** Restore session from memory */
  restoreSession: () => Promise<void>
  /** Clear the current session */
  clearSession: () => Promise<void>
  /** Pending human gate actions */
  pendingHumanGates: HumanGateAction[]
}

// ==================== API Functions ====================

/**
 * Send a chat message with streaming response
 */
async function sendChatMessage(
  request: AssistantChatRequest,
  onChunk: (chunk: StreamChunk) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('/api/v1/assistant/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`,
    },
    body: JSON.stringify({
      session_id: request.sessionId,
      message: request.message,
      user_id: request.userId,
      tenant_id: request.tenantId,
      page_context: request.pageContext,
    }),
    signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.message || `HTTP error! status: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter(line => line.trim())

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)) as StreamChunk
            onChunk(data)
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Execute a tool via the assistant
 */
async function executeToolApi(
  sessionId: string,
  toolName: string,
  parameters: Record<string, unknown>,
  userId: string,
  tenantId: string
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const response = await apiClient.post<ApiResponse<{
    success: boolean
    result?: unknown
    error?: string
  }>>('/assistant/tool/execute', {
    session_id: sessionId,
    tool_name: toolName,
    parameters,
    user_id: userId,
    tenant_id: tenantId,
  })
  return response.data.data
}

/**
 * Submit a human gate decision
 */
async function submitHumanGateDecisionApi(
  actionId: string,
  decision: 'approved' | 'rejected' | 'deferred',
  rationale: string,
  userId: string
): Promise<HumanGateResult> {
  const response = await apiClient.post<ApiResponse<HumanGateResult>>(
    '/assistant/human-gate/decision',
    {
      action_id: actionId,
      decision,
      rationale,
      decided_by: userId,
    }
  )
  return response.data.data
}

/**
 * Restore session from memory service
 */
async function restoreSessionApi(
  sessionId: string,
  userId: string,
  tenantId: string
): Promise<{
  messages: ChatMessage[]
  contextSummary?: string
  entities?: Array<{ entityType: string; entityId: string; displayName: string; lastMentioned: string }>
}> {
  const response = await apiClient.post<ApiResponse<{
    messages: ChatMessage[]
    contextSummary?: string
    entities?: Array<{ entityType: string; entityId: string; displayName: string; lastMentioned: string }>
  }>>('/assistant/session/restore', {
    session_id: sessionId,
    user_id: userId,
    tenant_id: tenantId,
  })
  return response.data.data
}

/**
 * Clear session in memory service
 */
async function clearSessionApi(
  sessionId: string,
  userId: string,
  tenantId: string
): Promise<void> {
  await apiClient.post('/assistant/session/clear', {
    session_id: sessionId,
    user_id: userId,
    tenant_id: tenantId,
  })
}

/**
 * Get pending human gate actions
 */
async function getPendingHumanGatesApi(
  userId: string,
  tenantId: string
): Promise<HumanGateAction[]> {
  const response = await apiClient.get<ApiResponse<HumanGateAction[]>>(
    '/assistant/human-gate/pending',
    { params: { user_id: userId, tenant_id: tenantId } }
  )
  return response.data.data
}

// ==================== Hook Implementation ====================

/**
 * useAssistant Hook
 * 
 * Provides React integration for the AI Assistant with:
 * - Streaming chat responses
 * - Tool execution tracking
 * - Human gate handling
 * - Session management
 * 
 * Validates: Requirements 1.1, 1.2, 13.1
 */
export function useAssistant(options: UseAssistantOptions): UseAssistantReturn {
  const {
    sessionId,
    userId,
    tenantId,
    pageContext,
    onHumanGateRequired,
    onToolCallStart,
    onToolCallComplete,
    onQuickActions,
    onError,
  } = options

  const queryClient = useQueryClient()
  const abortControllerRef = useRef<AbortController | null>(null)
  const lastMessageRef = useRef<string | null>(null)

  const [isSending, setIsSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const {
    addMessage,
    restoreSession: restoreSessionStore,
    clearSession: clearSessionStore,
    updateSessionEntities,
    setTyping,
    setStreamingContent: setStoreStreamingContent,
    appendStreamingContent,
  } = useChatStore()

  // Query for pending human gates
  const { data: pendingHumanGates = [] } = useQuery({
    queryKey: ['pendingHumanGates', userId, tenantId],
    queryFn: () => getPendingHumanGatesApi(userId, tenantId),
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: !!userId && !!tenantId,
  })

  /**
   * Send a message to the assistant with streaming response
   * Validates: Requirements 1.1, 1.2
   */
  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || isSending) return

    setIsSending(true)
    setIsTyping(true)
    setTyping(true)
    setStreamingContent('')
    setStoreStreamingContent('')
    setError(null)
    lastMessageRef.current = message

    // Add user message immediately
    addMessage(sessionId, { role: 'user', content: message })

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController()

    let fullContent = ''
    const toolCalls: ToolCall[] = []
    const references: Reference[] = []
    const quickActions: QuickAction[] = []
    let messageId: string | undefined

    try {
      await sendChatMessage(
        { sessionId, message, userId, tenantId, pageContext },
        (chunk) => {
          messageId = chunk.messageId || messageId

          switch (chunk.type) {
            case 'text':
              fullContent += chunk.content as string
              setStreamingContent(fullContent)
              appendStreamingContent(chunk.content as string)
              break

            case 'tool_start': {
              const toolCall = chunk.content as ToolCall
              toolCalls.push({
                ...toolCall,
                status: 'running',
                startedAt: new Date(),
              })
              onToolCallStart?.(toolCall)
              break
            }

            case 'tool_result': {
              const result = chunk.content as { id: string; success: boolean; result?: unknown; error?: string; duration?: number }
              const tcIndex = toolCalls.findIndex(tc => tc.id === result.id)
              if (tcIndex >= 0) {
                toolCalls[tcIndex] = {
                  ...toolCalls[tcIndex],
                  status: result.success ? 'completed' : 'failed',
                  result: result.result,
                  error: result.error,
                  duration: result.duration,
                  completedAt: new Date(),
                }
                onToolCallComplete?.(toolCalls[tcIndex])
              }
              break
            }

            case 'reference':
              references.push(chunk.content as Reference)
              break

            case 'quick_action':
              quickActions.push(chunk.content as QuickAction)
              break

            case 'human_gate': {
              const action = chunk.content as HumanGateAction
              onHumanGateRequired?.(action)
              // Invalidate pending human gates query
              queryClient.invalidateQueries({ queryKey: ['pendingHumanGates'] })
              break
            }

            case 'context_summary':
              // Context summary is handled by the store
              break

            case 'error': {
              const errorContent = chunk.content as { message: string }
              throw new Error(errorContent.message)
            }

            case 'complete':
              // Stream complete
              break
          }
        },
        abortControllerRef.current.signal
      )

      // Add assistant message with all collected data
      addMessage(sessionId, {
        role: 'assistant',
        content: fullContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        references: references.length > 0 ? references : undefined,
      })

      // Notify about quick actions
      if (quickActions.length > 0) {
        onQuickActions?.(quickActions)
      }

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      
      // Don't report abort errors
      if (error.name !== 'AbortError') {
        setError(error)
        onError?.(error)
        
        // Add error message to chat
        addMessage(sessionId, {
          role: 'system',
          content: error.message || 'An error occurred. Please try again.',
        })
      }
    } finally {
      setIsSending(false)
      setIsTyping(false)
      setTyping(false)
      setStreamingContent(null)
      setStoreStreamingContent(null)
      abortControllerRef.current = null
    }
  }, [
    sessionId, userId, tenantId, pageContext, isSending,
    addMessage, appendStreamingContent, setTyping, setStoreStreamingContent,
    onHumanGateRequired, onToolCallStart, onToolCallComplete, onQuickActions, onError,
    queryClient,
  ])

  /**
   * Clear the current error
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * Retry the last failed message
   */
  const retryLastMessage = useCallback(async () => {
    if (lastMessageRef.current) {
      await sendMessage(lastMessageRef.current)
    }
  }, [sendMessage])

  /**
   * Execute a tool manually
   */
  const executeTool = useCallback(async (
    toolName: string,
    parameters: Record<string, unknown>
  ) => {
    try {
      const result = await executeToolApi(sessionId, toolName, parameters, userId, tenantId)
      
      if (!result.success && result.error) {
        throw new Error(result.error)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      onError?.(error)
      throw error
    }
  }, [sessionId, userId, tenantId, onError])

  /**
   * Submit a human gate decision
   */
  const submitHumanGateDecision = useCallback(async (
    actionId: string,
    decision: 'approved' | 'rejected' | 'deferred',
    rationale: string
  ): Promise<HumanGateResult> => {
    try {
      const result = await submitHumanGateDecisionApi(actionId, decision, rationale, userId)
      
      // Invalidate pending human gates query
      queryClient.invalidateQueries({ queryKey: ['pendingHumanGates'] })
      
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      onError?.(error)
      throw error
    }
  }, [userId, queryClient, onError])

  /**
   * Restore session from memory service
   * Validates: Requirements 13.1, 13.3
   */
  const restoreSession = useCallback(async () => {
    try {
      const data = await restoreSessionApi(sessionId, userId, tenantId)
      
      // Restore messages to store
      restoreSessionStore(
        sessionId,
        data.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
        data.contextSummary
      )

      // Restore entities for pronoun resolution
      if (data.entities) {
        const entitiesMap = new Map(
          data.entities.map(e => [
            e.entityId,
            {
              ...e,
              lastMentioned: new Date(e.lastMentioned),
            },
          ])
        )
        updateSessionEntities(sessionId, entitiesMap)
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      // Don't set error for restore failures - just log
      console.error('Failed to restore session:', error)
    }
  }, [sessionId, userId, tenantId, restoreSessionStore, updateSessionEntities])

  /**
   * Clear the current session
   * Validates: Requirements 13.5
   */
  const clearSession = useCallback(async () => {
    try {
      await clearSessionApi(sessionId, userId, tenantId)
      clearSessionStore(sessionId)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      onError?.(error)
    }
  }, [sessionId, userId, tenantId, clearSessionStore, onError])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  return {
    sendMessage,
    isSending,
    streamingContent,
    isTyping,
    error,
    clearError,
    retryLastMessage,
    executeTool,
    submitHumanGateDecision,
    restoreSession,
    clearSession,
    pendingHumanGates,
  }
}

export default useAssistant
