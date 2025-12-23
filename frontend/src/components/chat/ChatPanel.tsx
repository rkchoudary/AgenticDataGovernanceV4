import * as React from 'react'
import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Bot, Loader2, MessageSquare, Plus, RefreshCw, AlertCircle, Maximize2, Minimize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useChatStore, Reference } from '@/stores/chatStore'
import { useSendMessage, useRestoreSession } from '@/hooks/useChat'
import { MessageBubble } from './MessageBubble'
import { SessionList } from './SessionList'
import { QuickActions, FollowUpSuggestions, getContextualSuggestions } from './QuickActions'
import { ReferencePanel } from './ReferencePanel'
import { cn } from '@/lib/utils'

/**
 * Enhanced ChatPanel Props
 * Validates: Requirements 1.1, 1.2, 13.1
 */
export interface ChatPanelProps {
  /** CSS class name for styling */
  className?: string
  /** Default agent ID to use */
  defaultAgentId?: string
  /** Whether to show the session list sidebar */
  showSessionList?: boolean
  /** Session ID for session persistence */
  sessionId?: string
  /** User ID for memory service integration */
  userId?: string
  /** Tenant ID for data isolation */
  tenantId?: string
  /** Callback when a tool call is executed */
  onToolCall?: (toolCall: ToolCallEvent) => void
  /** Callback when human gate approval is required */
  onHumanGateRequired?: (action: HumanGateAction) => void
  /** Current page context for contextual suggestions */
  pageContext?: PageContext
  /** Whether to show the reference panel */
  showReferencePanel?: boolean
  /** Callback when panel is closed */
  onClose?: () => void
}

/**
 * Tool call event for external handling
 */
export interface ToolCallEvent {
  id: string
  name: string
  parameters: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: unknown
}

/**
 * Human gate action for approval workflow
 */
export interface HumanGateAction {
  id: string
  type: 'approval' | 'sign_off' | 'mapping_change' | 'ownership_change'
  title: string
  description: string
  impact: string
  requiredRole: string
  entityType: string
  entityId: string
  proposedChanges?: Record<string, unknown>
  aiRationale: string
}

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

// Re-export Reference from chatStore for external use
export type { Reference } from '@/stores/chatStore'

const AGENT_NAMES: Record<string, string> = {
  regulatory: 'Regulatory Intelligence',
  data_requirements: 'Data Requirements',
  cde: 'CDE Identification',
  data_quality: 'Data Quality Rule',
  lineage: 'Lineage Mapping',
  issue: 'Issue Management',
  documentation: 'Documentation',
  orchestrator: 'Governance Orchestrator',
}

/**
 * Enhanced ChatPanel component with Memory Service integration
 * 
 * Features:
 * - Session persistence with Memory Service
 * - Streaming text display with typing indicator
 * - Tool call display and execution tracking
 * - Reference panel for source citations
 * - Quick actions based on context
 * - Human gate integration for critical actions
 * 
 * Validates: Requirements 1.1, 1.2, 13.1
 */
export function ChatPanel({ 
  className, 
  defaultAgentId = 'orchestrator',
  showSessionList = true,
  sessionId: propSessionId,
  userId: propUserId,
  tenantId: propTenantId,
  pageContext,
  showReferencePanel = true,
  onClose,
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [selectedAgent] = useState(defaultAgentId)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restorationError, setRestorationError] = useState<string | null>(null)
  const [selectedReferences, setSelectedReferences] = useState<Reference[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  
  const { 
    sessions, 
    activeSessionId, 
    isTyping,
    streamingContent,
    createSession, 
    setActiveSession,
    deleteSession,
    initializeSessionWithContext,
  } = useChatStore()
  
  const sendMessage = useSendMessage()
  const restoreSession = useRestoreSession()
  
  // Use prop session ID or active session ID
  const effectiveSessionId = propSessionId || activeSessionId
  const activeSession = sessions.find(s => s.id === effectiveSessionId)
  const messages = activeSession?.messages || []

  // Get contextual suggestions based on last assistant message
  const lastAssistantMessage = useMemo(() => {
    const assistantMessages = messages.filter(m => m.role === 'assistant')
    return assistantMessages[assistantMessages.length - 1]?.content
  }, [messages])

  const followUpSuggestions = useMemo(() => {
    return getContextualSuggestions(lastAssistantMessage)
  }, [lastAssistantMessage])

  // Extract references from the last assistant message
  const currentReferences = useMemo(() => {
    const lastMessage = messages.filter(m => m.role === 'assistant').pop()
    if (lastMessage?.toolCalls) {
      // Extract references from tool call results
      const refs: Reference[] = []
      for (const toolCall of lastMessage.toolCalls) {
        if (toolCall.result && typeof toolCall.result === 'object') {
          const result = toolCall.result as Record<string, unknown>
          if (result.references && Array.isArray(result.references)) {
            refs.push(...(result.references as Reference[]))
          }
        }
      }
      return refs
    }
    return []
  }, [messages])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping, streamingContent])

  // Focus input on mount and session change
  useEffect(() => {
    inputRef.current?.focus()
  }, [effectiveSessionId])

  // Initialize session with user/tenant context if provided
  useEffect(() => {
    if (propSessionId && propUserId && propTenantId) {
      const existingSession = sessions.find(s => s.id === propSessionId)
      if (!existingSession) {
        initializeSessionWithContext(propSessionId, propUserId, propTenantId)
      }
    }
  }, [propSessionId, propUserId, propTenantId, sessions, initializeSessionWithContext])

  // Restore session on mount if session ID is provided
  // Validates: Requirements 13.1 - Browser refresh recovery
  useEffect(() => {
    const restoreExistingSession = async () => {
      if (propSessionId && propUserId && propTenantId) {
        const existingSession = sessions.find(s => s.id === propSessionId)
        if (!existingSession || existingSession.messages.length === 0) {
          setIsRestoring(true)
          setRestorationError(null)
          try {
            await restoreSession.mutateAsync({
              sessionId: propSessionId,
              userId: propUserId,
              tenantId: propTenantId,
            })
          } catch (error) {
            setRestorationError('Failed to restore previous conversation')
            console.error('Session restoration failed:', error)
          } finally {
            setIsRestoring(false)
          }
        }
      }
    }
    restoreExistingSession()
  }, [propSessionId, propUserId, propTenantId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sendMessage.isPending) return

    let sessionId = effectiveSessionId
    if (!sessionId) {
      sessionId = propUserId && propTenantId 
        ? initializeSessionWithContext(undefined, propUserId, propTenantId)
        : createSession()
    }

    sendMessage.mutate({
      sessionId,
      message: input.trim(),
      agentId: selectedAgent,
      userId: propUserId,
      tenantId: propTenantId,
      pageContext,
    })
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleNewChat = () => {
    if (propUserId && propTenantId) {
      initializeSessionWithContext(undefined, propUserId, propTenantId)
    } else {
      createSession()
    }
  }

  const handleRetryRestoration = async () => {
    if (propSessionId && propUserId && propTenantId) {
      setIsRestoring(true)
      setRestorationError(null)
      try {
        await restoreSession.mutateAsync({
          sessionId: propSessionId,
          userId: propUserId,
          tenantId: propTenantId,
        })
      } catch (error) {
        setRestorationError('Failed to restore previous conversation')
      } finally {
        setIsRestoring(false)
      }
    }
  }

  const handleReferenceClick = (reference: Reference) => {
    setSelectedReferences(prev => {
      const exists = prev.some(r => r.id === reference.id)
      if (exists) {
        return prev.filter(r => r.id !== reference.id)
      }
      return [...prev, reference]
    })
  }

  return (
    <div className={cn(
      'flex flex-col h-full bg-background border-l shadow-2xl transition-all duration-300',
      isExpanded ? 'w-full' : 'w-full max-w-2xl',
      className
    )}>
      {/* Enhanced Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b bg-gradient-to-r from-primary/5 to-primary/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">AI Assistant</h2>
              {selectedAgent && (
                <p className="text-sm text-muted-foreground">
                  {AGENT_NAMES[selectedAgent] || selectedAgent}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleNewChat}
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Chat
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-muted-foreground hover:text-foreground"
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            {onClose && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* Session List Sidebar - Only show when not expanded and has sessions */}
          {!isExpanded && showSessionList && sessions.length > 0 && (
            <SessionList
              sessions={sessions}
              activeSessionId={effectiveSessionId}
              onSelectSession={setActiveSession}
              onDeleteSession={deleteSession}
              className="w-64 border-r bg-muted/20"
            />
          )}

          {/* Main Chat Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Status Indicators */}
            {isRestoring && (
              <div className="flex items-center gap-3 px-6 py-3 bg-blue-50 dark:bg-blue-950/20 border-b">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  Restoring previous conversation...
                </span>
              </div>
            )}

            {restorationError && (
              <div className="flex items-center justify-between px-6 py-3 bg-red-50 dark:bg-red-950/20 border-b">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-700 dark:text-red-300">{restorationError}</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleRetryRestoration}
                  className="text-red-600 hover:text-red-700 dark:text-red-400"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            )}

            {/* Context Summary Banner */}
            {activeSession?.contextSummary && (
              <div className="px-6 py-3 bg-amber-50 dark:bg-amber-950/20 border-b">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Previous Context
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      {activeSession.contextSummary}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Messages Area */}
            <ScrollArea className="flex-1 px-6 py-4">
              {messages.length === 0 && !isRestoring ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                    <MessageSquare className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Welcome to AI Assistant
                  </h3>
                  <p className="text-muted-foreground mb-8 max-w-md">
                    I'm here to help you with data governance, compliance questions, and workflow guidance. 
                    What would you like to know?
                  </p>
                  <QuickActions 
                    onSelectAction={(prompt) => setInput(prompt)}
                    context="empty"
                    pageContext={pageContext}
                  />
                </div>
              ) : (
                <div className="space-y-6">
                  {messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      agentName={message.agentId ? AGENT_NAMES[message.agentId] : undefined}
                      sessionId={effectiveSessionId || undefined}
                      onReferenceClick={handleReferenceClick}
                    />
                  ))}
                  {/* Enhanced Streaming Indicator */}
                  {isTyping && (
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex flex-col gap-2 flex-1">
                        {streamingContent ? (
                          <div className="rounded-2xl px-6 py-4 bg-muted/50 border">
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{streamingContent}</p>
                            <div className="flex items-center gap-1 mt-2">
                              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                              <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-75" />
                              <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-150" />
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">AI is thinking...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Follow-up Suggestions */}
            {messages.length > 0 && !isTyping && followUpSuggestions.length > 0 && (
              <div className="flex-shrink-0 px-6 py-3 border-t bg-muted/20">
                <FollowUpSuggestions
                  suggestions={followUpSuggestions}
                  onSelectSuggestion={(suggestion) => setInput(suggestion)}
                />
              </div>
            )}

            {/* Enhanced Input Area */}
            <div className="flex-shrink-0 p-6 border-t bg-background">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything about data governance, compliance, or your workflows..."
                    className="w-full min-h-[60px] max-h-40 px-4 py-3 pr-16 rounded-xl border-2 bg-background resize-none focus:outline-none focus:border-primary transition-colors text-sm leading-relaxed"
                    rows={2}
                    disabled={sendMessage.isPending || isRestoring}
                  />
                  <Button 
                    type="submit" 
                    size="icon"
                    disabled={!input.trim() || sendMessage.isPending || isRestoring}
                    className="absolute right-2 bottom-2 h-10 w-10 rounded-lg"
                  >
                    {sendMessage.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Press Enter to send, Shift+Enter for new line</span>
                  <span>{input.length}/2000</span>
                </div>
              </form>
            </div>
          </div>

          {/* Enhanced Reference Panel */}
          {!isExpanded && showReferencePanel && (currentReferences.length > 0 || selectedReferences.length > 0) && (
            <ReferencePanel
              references={[...currentReferences, ...selectedReferences]}
              onReferenceClick={handleReferenceClick}
              className="w-80 border-l bg-muted/10"
            />
          )}
        </div>
      </div>
    </div>
  )
}
