import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Chat Message interface
 * Validates: Requirements 1.1, 1.2
 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  agentId?: string
  toolCalls?: ToolCall[]
  references?: Reference[]
  isStreaming?: boolean
}

/**
 * Tool Call interface for tracking tool executions
 * Validates: Requirements 11.1, 11.2, 11.3
 */
export interface ToolCall {
  id: string
  name: string
  parameters: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: unknown
  error?: string
  duration?: number
  startedAt?: Date
  completedAt?: Date
}

/**
 * Reference interface for source citations
 * Validates: Requirements 1.4, 7.2, 11.2
 */
export interface Reference {
  type: 'report' | 'cde' | 'lineage' | 'issue' | 'audit'
  id: string
  title: string
  source: string
  url?: string
}

/**
 * Chat Session interface with Memory Service integration
 * Validates: Requirements 13.1, 13.2, 13.4
 */
export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
  agentId?: string
  /** User ID for memory service integration */
  userId?: string
  /** Tenant ID for data isolation */
  tenantId?: string
  /** Context summary from previous conversation */
  contextSummary?: string
  /** Whether the session has been restored from memory */
  isRestored?: boolean
  /** Entities mentioned for pronoun resolution */
  entities?: Map<string, EntityReference>
}

/**
 * Entity reference for pronoun resolution
 * Validates: Requirements 2.3
 */
export interface EntityReference {
  entityType: string
  entityId: string
  displayName: string
  lastMentioned: Date
}

/**
 * Chat Store State interface
 */
interface ChatState {
  sessions: ChatSession[]
  activeSessionId: string | null
  isTyping: boolean
  streamingContent: string | null
  
  // Session management
  createSession: (agentId?: string) => string
  initializeSessionWithContext: (sessionId?: string, userId?: string, tenantId?: string) => string
  setActiveSession: (sessionId: string | null) => void
  
  // Message management
  addMessage: (sessionId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateMessage: (sessionId: string, messageId: string, updates: Partial<ChatMessage>) => void
  
  // Tool call management
  updateToolCallStatus: (
    sessionId: string, 
    messageId: string, 
    toolCallId: string, 
    status: ToolCall['status'], 
    result?: unknown,
    error?: string
  ) => void
  
  // Streaming support
  setTyping: (isTyping: boolean) => void
  setStreamingContent: (content: string | null) => void
  appendStreamingContent: (content: string) => void
  
  // Session operations
  clearSession: (sessionId: string) => void
  deleteSession: (sessionId: string) => void
  renameSession: (sessionId: string, title: string) => void
  getSession: (sessionId: string) => ChatSession | undefined
  
  // Memory service integration
  restoreSession: (sessionId: string, messages: ChatMessage[], contextSummary?: string) => void
  setSessionContext: (sessionId: string, userId: string, tenantId: string) => void
  updateSessionEntities: (sessionId: string, entities: Map<string, EntityReference>) => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      isTyping: false,
      streamingContent: null,
      
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

      /**
       * Initialize a session with user and tenant context
       * Validates: Requirements 13.1, 17.3
       */
      initializeSessionWithContext: (sessionId?: string, userId?: string, tenantId?: string) => {
        const id = sessionId || crypto.randomUUID()
        const existingSession = get().sessions.find(s => s.id === id)
        
        if (existingSession) {
          // Update existing session with context
          set((state) => ({
            sessions: state.sessions.map((session) =>
              session.id === id
                ? { ...session, userId, tenantId, updatedAt: new Date() }
                : session
            ),
            activeSessionId: id,
          }))
        } else {
          // Create new session with context
          const newSession: ChatSession = {
            id,
            title: 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            userId,
            tenantId,
          }
          set((state) => ({
            sessions: [...state.sessions, newSession],
            activeSessionId: id,
          }))
        }
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

      /**
       * Update tool call status with timing information
       * Validates: Requirements 11.1, 11.3, 11.4
       */
      updateToolCallStatus: (sessionId, messageId, toolCallId, status, result, error) => {
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
                              ? { 
                                  ...tc, 
                                  status, 
                                  result: result ?? tc.result,
                                  error: error ?? tc.error,
                                  completedAt: status === 'completed' || status === 'failed' 
                                    ? new Date() 
                                    : tc.completedAt,
                                  duration: tc.startedAt && (status === 'completed' || status === 'failed')
                                    ? Date.now() - tc.startedAt.getTime()
                                    : tc.duration,
                                }
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

      /**
       * Set streaming content for real-time display
       * Validates: Requirements 1.1, 1.2
       */
      setStreamingContent: (content) => set({ streamingContent: content }),

      /**
       * Append to streaming content for incremental updates
       * Validates: Requirements 1.1, 1.2
       */
      appendStreamingContent: (content) => set((state) => ({
        streamingContent: (state.streamingContent || '') + content,
      })),
      
      clearSession: (sessionId) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? { 
                  ...session, 
                  messages: [], 
                  title: 'New Chat', 
                  updatedAt: new Date(),
                  contextSummary: undefined,
                  isRestored: false,
                }
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

      /**
       * Restore a session from Memory Service
       * Validates: Requirements 13.1, 13.3
       */
      restoreSession: (sessionId, messages, contextSummary) => {
        set((state) => {
          const existingSession = state.sessions.find(s => s.id === sessionId)
          
          if (existingSession) {
            // Update existing session
            return {
              sessions: state.sessions.map((session) =>
                session.id === sessionId
                  ? {
                      ...session,
                      messages,
                      contextSummary,
                      isRestored: true,
                      updatedAt: new Date(),
                      title: messages.length > 0 && messages[0].role === 'user'
                        ? messages[0].content.slice(0, 50) + (messages[0].content.length > 50 ? '...' : '')
                        : session.title,
                    }
                  : session
              ),
              activeSessionId: sessionId,
            }
          } else {
            // Create new session with restored data
            const newSession: ChatSession = {
              id: sessionId,
              title: messages.length > 0 && messages[0].role === 'user'
                ? messages[0].content.slice(0, 50) + (messages[0].content.length > 50 ? '...' : '')
                : 'Restored Chat',
              messages,
              createdAt: new Date(),
              updatedAt: new Date(),
              contextSummary,
              isRestored: true,
            }
            return {
              sessions: [...state.sessions, newSession],
              activeSessionId: sessionId,
            }
          }
        })
      },

      /**
       * Set session context for memory service integration
       * Validates: Requirements 17.3
       */
      setSessionContext: (sessionId, userId, tenantId) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? { ...session, userId, tenantId, updatedAt: new Date() }
              : session
          ),
        }))
      },

      /**
       * Update session entities for pronoun resolution
       * Validates: Requirements 2.3
       */
      updateSessionEntities: (sessionId, entities) => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? { ...session, entities, updatedAt: new Date() }
              : session
          ),
        }))
      },
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({
        sessions: state.sessions.map(session => ({
          id: session.id,
          title: session.title,
          messages: session.messages,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          agentId: session.agentId,
          userId: session.userId,
          tenantId: session.tenantId,
          contextSummary: session.contextSummary,
          isRestored: session.isRestored,
          // Don't persist entities Map - it's session-scoped
        })),
        activeSessionId: state.activeSessionId,
      }),
    }
  )
)
