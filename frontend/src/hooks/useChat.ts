import { useMutation } from '@tanstack/react-query'
import { apiClient, ApiResponse } from '@/api/client'
import { useChatStore } from '@/stores'

interface ChatRequest {
  sessionId: string
  message: string
  agentId?: string
}

interface ChatResponse {
  message: string
  agentId: string
  toolCalls?: {
    id: string
    name: string
    parameters: Record<string, unknown>
    result?: unknown
  }[]
}

export function useSendMessage() {
  const { addMessage, setTyping } = useChatStore()

  return useMutation({
    mutationFn: async ({ sessionId, message, agentId }: ChatRequest) => {
      // Add user message immediately
      addMessage(sessionId, { role: 'user', content: message })
      setTyping(true)

      const response = await apiClient.post<ApiResponse<ChatResponse>>(
        '/chat/message',
        { session_id: sessionId, message, agent_id: agentId }
      )
      return { sessionId, response: response.data.data }
    },
    onSuccess: ({ sessionId, response }) => {
      // Add assistant response
      addMessage(sessionId, {
        role: 'assistant',
        content: response.message,
        agentId: response.agentId,
        toolCalls: response.toolCalls?.map((tc) => ({
          ...tc,
          status: 'completed' as const,
        })),
      })
      setTyping(false)
    },
    onError: (_, { sessionId }) => {
      addMessage(sessionId, {
        role: 'system',
        content: 'Failed to send message. Please try again.',
      })
      setTyping(false)
    },
  })
}
