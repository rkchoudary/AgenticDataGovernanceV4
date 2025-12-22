import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  agentId?: string
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  id: string
  name: string
  parameters: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: unknown
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
  agentId?: string
}

interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  isTyping: boolean
  createSession: (agentId?: string) => string
  setActiveSession: (sessionId: string | null) => void
  addMessage: (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void
  updateToolCallStatus: (sessionId: string, messageId: string, toolCallId: string, status: ToolCall['status'], result?: unknown) => void
  setTyping: (isTyping: boolean) => void
  clearSession: (sessionId: string) => void
  deleteSession: (sessionId: string) => void
  renameSession: (sessionId: string, title: string) => void
  getSession: (sessionId: string) => ChatSession | undefined
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      isTyping: false,
      
      createSession: (agentId?: string) => {
        const id = crypto.randomUUID()
        const newSession: ChatSession = {
          id,
          title: 'New Chat',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          agentId,
        }
        set((state) => ({
          sessions: [...state.sessions, newSession],
          activeSessionId: id,
        }))
        return id
      },
      
      setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),
      
      addMessage: (sessionId, message) => {
        const newMessage: ChatMessage = {
          ...message,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        }
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: [...session.messages, newMessage],
                  updatedAt: new Date(),
                  title: session.messages.length === 0 && message.role === 'user'
                    ? message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '')
                    : session.title,
                }
              : session
          ),
        }))
      },
      
      updateMessage: (sessionId, messageId, updates) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: session.messages.map((msg) =>
                    msg.id === messageId ? { ...msg, ...updates } : msg
                  ),
                  updatedAt: new Date(),
                }
              : session
          ),
        }))
      },

      updateToolCallStatus: (sessionId, messageId, toolCallId, status, result) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? {
                  ...session,
                  messages: session.messages.map((msg) =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          toolCalls: msg.toolCalls?.map((tc) =>
                            tc.id === toolCallId
                              ? { ...tc, status, result: result ?? tc.result }
                              : tc
                          ),
                        }
                      : msg
                  ),
                  updatedAt: new Date(),
                }
              : session
          ),
        }))
      },
      
      setTyping: (isTyping) => set({ isTyping }),
      
      clearSession: (sessionId) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? { ...session, messages: [], title: 'New Chat', updatedAt: new Date() }
              : session
          ),
        }))
      },
      
      deleteSession: (sessionId) => {
        const { sessions, activeSessionId } = get()
        const newSessions = sessions.filter((s) => s.id !== sessionId)
        set({
          sessions: newSessions,
          activeSessionId: activeSessionId === sessionId 
            ? (newSessions.length > 0 ? newSessions[0].id : null)
            : activeSessionId,
        })
      },

      renameSession: (sessionId, title) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? { ...session, title, updatedAt: new Date() }
              : session
          ),
        }))
      },

      getSession: (sessionId) => {
        return get().sessions.find((s) => s.id === sessionId)
      },
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    }
  )
)
