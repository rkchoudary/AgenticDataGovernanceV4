import * as React from 'react'
import { useState, useRef, useEffect, useMemo } from 'react'
import { Send, Bot, Loader2, MessageSquare, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useChatStore } from '@/stores/chatStore'
import { useSendMessage } from '@/hooks/useChat'
import { MessageBubble } from './MessageBubble'
import { SessionList } from './SessionList'
import { QuickActions, FollowUpSuggestions, getContextualSuggestions } from './QuickActions'
import { cn } from '@/lib/utils'

interface ChatPanelProps {
  className?: string
  defaultAgentId?: string
  showSessionList?: boolean
}

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

export function ChatPanel({ 
  className, 
  defaultAgentId = 'orchestrator',
  showSessionList = true 
}: ChatPanelProps) {
  const [input, setInput] = useState('')
  const [selectedAgent] = useState(defaultAgentId)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  
  const { 
    sessions, 
    activeSessionId, 
    isTyping, 
    createSession, 
    setActiveSession,
    deleteSession 
  } = useChatStore()
  
  const sendMessage = useSendMessage()
  
  const activeSession = sessions.find(s => s.id === activeSessionId)
  const messages = activeSession?.messages || []

  // Get contextual suggestions based on last assistant message
  const lastAssistantMessage = useMemo(() => {
    const assistantMessages = messages.filter(m => m.role === 'assistant')
    return assistantMessages[assistantMessages.length - 1]?.content
  }, [messages])

  const followUpSuggestions = useMemo(() => {
    return getContextualSuggestions(lastAssistantMessage)
  }, [lastAssistantMessage])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [activeSessionId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sendMessage.isPending) return

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = createSession()
    }

    sendMessage.mutate({
      sessionId,
      message: input.trim(),
      agentId: selectedAgent,
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
    createSession()
  }

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <CardHeader className="flex-shrink-0 pb-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">AI Assistant</CardTitle>
            {selectedAgent && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                {AGENT_NAMES[selectedAgent] || selectedAgent}
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleNewChat}>
            <Plus className="h-4 w-4 mr-1" />
            New Chat
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* Session List Sidebar */}
          {showSessionList && sessions.length > 0 && (
            <SessionList
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={setActiveSession}
              onDeleteSession={deleteSession}
              className="w-48 border-r"
            />
          )}

          {/* Chat Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">Start a conversation</p>
                  <p className="text-sm mt-1 mb-6">
                    Ask questions about data governance, compliance, or get help with tasks.
                  </p>
                  <QuickActions 
                    onSelectAction={(prompt) => setInput(prompt)}
                    context="empty"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      agentName={message.agentId ? AGENT_NAMES[message.agentId] : undefined}
                    />
                  ))}
                  {isTyping && (
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          <Bot className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Follow-up Suggestions */}
            {messages.length > 0 && !isTyping && followUpSuggestions.length > 0 && (
              <div className="flex-shrink-0 px-4 py-2 border-t">
                <FollowUpSuggestions
                  suggestions={followUpSuggestions}
                  onSelectSuggestion={(suggestion) => setInput(suggestion)}
                />
              </div>
            )}

            {/* Input Area */}
            <div className="flex-shrink-0 p-4 border-t bg-background">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
                    className="w-full min-h-[44px] max-h-32 px-4 py-3 pr-12 rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    rows={1}
                    disabled={sendMessage.isPending}
                  />
                </div>
                <Button 
                  type="submit" 
                  size="icon"
                  disabled={!input.trim() || sendMessage.isPending}
                  className="h-11 w-11"
                >
                  {sendMessage.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
