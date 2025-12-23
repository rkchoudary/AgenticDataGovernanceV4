import { useMutation } from '@tanstack/react-query'
import { apiClient, ApiResponse } from '@/api/client'
import { useChatStore, ChatMessage, ToolCall, Reference } from '@/stores/chatStore'

/**
 * Chat request interface with Memory Service integration
 * Validates: Requirements 1.1, 13.1, 17.3
 */
interface ChatRequest {
  sessionId: string
  message: string
  agentId?: string
  userId?: string
  tenantId?: string
  pageContext?: {
    path: string
    pageType: string
    entityId?: string
    entityType?: string
    metadata?: Record<string, unknown>
  }
}

/**
 * Chat response interface with streaming support
 * Validates: Requirements 1.1, 1.2, 11.1
 */
interface ChatResponse {
  message: string
  agentId: string
  toolCalls?: {
    id: string
    name: string
    parameters: Record<string, unknown>
    result?: unknown
    status: 'pending' | 'running' | 'completed' | 'failed'
    error?: string
    duration?: number
  }[]
  references?: Reference[]
  contextSummary?: string
  humanGateRequired?: {
    id: string
    type: string
    title: string
    description: string
    impact: string
    requiredRole: string
    entityType: string
    entityId: string
    proposedChanges?: Record<string, unknown>
    aiRationale: string
  }
}

/**
 * Session restoration request
 * Validates: Requirements 13.1, 13.3
 */
interface RestoreSessionRequest {
  sessionId: string
  userId: string
  tenantId: string
}

/**
 * Session restoration response
 * Validates: Requirements 13.1, 13.3
 */
interface RestoreSessionResponse {
  messages: ChatMessage[]
  contextSummary?: string
  entities?: Array<{
    entityType: string
    entityId: string
    displayName: string
    lastMentioned: string
  }>
}

/**
 * Hook for sending messages with streaming support
 * Validates: Requirements 1.1, 1.2
 */
export function useSendMessage() {
  const { 
    addMessage, 
    setTyping, 
    setStreamingContent,
  } = useChatStore()

  return useMutation({
    mutationFn: async ({ 
      sessionId, 
      message, 
      agentId,
      userId,
      tenantId,
      pageContext,
    }: ChatRequest) => {
      // Add user message immediately
      addMessage(sessionId, { role: 'user', content: message })
      setTyping(true)
      setStreamingContent(null)

      try {
        const response = await apiClient.post<ApiResponse<ChatResponse>>(
          '/chat/message',
          { 
            session_id: sessionId, 
            message, 
            agent_id: agentId,
            user_id: userId,
            tenant_id: tenantId,
            page_context: pageContext,
          }
        )
        return { sessionId, response: response.data.data }
      } catch (error) {
        // Re-throw to trigger onError
        throw error
      }
    },
    onSuccess: ({ sessionId, response }) => {
      // Add assistant response with tool calls and references
      addMessage(sessionId, {
        role: 'assistant',
        content: response.message,
        agentId: response.agentId,
        toolCalls: response.toolCalls?.map((tc) => ({
          ...tc,
          status: tc.status || 'completed',
          startedAt: new Date(),
          completedAt: tc.status === 'completed' || tc.status === 'failed' 
            ? new Date() 
            : undefined,
        })),
        references: response.references,
      })
      setTyping(false)
      setStreamingContent(null)
    },
    onError: (error, { sessionId }) => {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to send message. Please try again.'
      
      addMessage(sessionId, {
        role: 'system',
        content: errorMessage,
      })
      setTyping(false)
      setStreamingContent(null)
    },
  })
}

/**
 * Hook for sending messages with streaming response
 * Validates: Requirements 1.1, 1.2
 */
export function useSendMessageStreaming() {
  const { 
    addMessage, 
    setTyping, 
    setStreamingContent,
    appendStreamingContent,
  } = useChatStore()

  return useMutation({
    mutationFn: async ({ 
      sessionId, 
      message, 
      agentId,
      userId,
      tenantId,
      pageContext,
    }: ChatRequest) => {
      // Add user message immediately
      addMessage(sessionId, { role: 'user', content: message })
      setTyping(true)
      setStreamingContent('')

      // Create a placeholder message for streaming
      const messageId = crypto.randomUUID()
      
      try {
        // Use fetch for streaming support
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: sessionId,
            message,
            agent_id: agentId,
            user_id: userId,
            tenant_id: tenantId,
            page_context: pageContext,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let fullContent = ''
        let toolCalls: ToolCall[] = []
        let references: Reference[] = []
        let agentIdFromResponse = agentId || 'orchestrator'

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n').filter(line => line.trim())

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                
                switch (data.type) {
                  case 'text':
                    fullContent += data.content
                    appendStreamingContent(data.content)
                    break
                  case 'tool_start':
                    toolCalls.push({
                      id: data.content.id,
                      name: data.content.name,
                      parameters: data.content.parameters,
                      status: 'running',
                      startedAt: new Date(),
                    })
                    break
                  case 'tool_result':
                    const tcIndex = toolCalls.findIndex(tc => tc.id === data.content.id)
                    if (tcIndex >= 0) {
                      toolCalls[tcIndex] = {
                        ...toolCalls[tcIndex],
                        status: data.content.success ? 'completed' : 'failed',
                        result: data.content.result,
                        error: data.content.error,
                        completedAt: new Date(),
                        duration: data.content.duration,
                      }
                    }
                    break
                  case 'reference':
                    references.push(data.content)
                    break
                  case 'agent_id':
                    agentIdFromResponse = data.content
                    break
                }
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }

        return { 
          sessionId, 
          messageId,
          content: fullContent,
          agentId: agentIdFromResponse,
          toolCalls,
          references,
        }
      } catch (error) {
        throw error
      }
    },
    onSuccess: ({ sessionId, content, agentId, toolCalls, references }) => {
      // Add the complete assistant message
      addMessage(sessionId, {
        role: 'assistant',
        content,
        agentId,
        toolCalls,
        references,
      })
      setTyping(false)
      setStreamingContent(null)
    },
    onError: (error, { sessionId }) => {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to send message. Please try again.'
      
      addMessage(sessionId, {
        role: 'system',
        content: errorMessage,
      })
      setTyping(false)
      setStreamingContent(null)
    },
  })
}

/**
 * Hook for restoring a session from Memory Service
 * Validates: Requirements 13.1, 13.3
 */
export function useRestoreSession() {
  const { restoreSession, updateSessionEntities } = useChatStore()

  return useMutation({
    mutationFn: async ({ sessionId, userId, tenantId }: RestoreSessionRequest) => {
      const response = await apiClient.post<ApiResponse<RestoreSessionResponse>>(
        '/chat/restore',
        { 
          session_id: sessionId, 
          user_id: userId,
          tenant_id: tenantId,
        }
      )
      return { sessionId, response: response.data.data }
    },
    onSuccess: ({ sessionId, response }) => {
      // Restore messages and context summary
      restoreSession(
        sessionId, 
        response.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
        response.contextSummary
      )

      // Restore entities for pronoun resolution
      if (response.entities) {
        const entitiesMap = new Map(
          response.entities.map(e => [
            e.entityId,
            {
              ...e,
              lastMentioned: new Date(e.lastMentioned),
            },
          ])
        )
        updateSessionEntities(sessionId, entitiesMap)
      }
    },
  })
}

/**
 * Hook for clearing a session
 * Validates: Requirements 13.5
 */
export function useClearSession() {
  const { clearSession } = useChatStore()

  return useMutation({
    mutationFn: async ({ sessionId, userId, tenantId }: RestoreSessionRequest) => {
      // Notify backend to clear session in Memory Service
      await apiClient.post('/chat/clear', {
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
}

/**
 * Hook for retrying a failed tool call
 * Validates: Requirements 11.4
 */
export function useRetryToolCall() {
  const { updateToolCallStatus } = useChatStore()

  return useMutation({
    mutationFn: async ({ 
      sessionId, 
      messageId, 
      toolCallId,
      toolName,
      parameters,
    }: {
      sessionId: string
      messageId: string
      toolCallId: string
      toolName: string
      parameters: Record<string, unknown>
    }) => {
      // Update status to running
      updateToolCallStatus(sessionId, messageId, toolCallId, 'running')

      const response = await apiClient.post<ApiResponse<{
        success: boolean
        result?: unknown
        error?: string
        duration?: number
      }>>('/chat/retry-tool', {
        session_id: sessionId,
        tool_call_id: toolCallId,
        tool_name: toolName,
        parameters,
      })

      return { 
        sessionId, 
        messageId, 
        toolCallId, 
        response: response.data.data,
      }
    },
    onSuccess: ({ sessionId, messageId, toolCallId, response }) => {
      updateToolCallStatus(
        sessionId,
        messageId,
        toolCallId,
        response.success ? 'completed' : 'failed',
        response.result,
        response.error
      )
    },
    onError: (error, { sessionId, messageId, toolCallId }) => {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Retry failed'
      
      updateToolCallStatus(
        sessionId,
        messageId,
        toolCallId,
        'failed',
        undefined,
        errorMessage
      )
    },
  })
}
