import * as React from 'react'
import { Bot, User, Copy, Check, ExternalLink, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatMessage, Reference } from '@/stores/chatStore'
import { ToolCallSequence } from './ToolCallCard'
import { cn } from '@/lib/utils'

/**
 * Props for MessageBubble component
 */
interface MessageBubbleProps {
  message: ChatMessage
  agentName?: string
  sessionId?: string
  onReferenceClick?: (reference: Reference) => void
}

/**
 * MessageBubble component for displaying chat messages
 * 
 * Features:
 * - Displays user and assistant messages with appropriate styling
 * - Shows tool calls with execution details
 * - Displays references with clickable links
 * - Supports markdown-like content formatting
 * 
 * Validates: Requirements 1.1, 1.2, 11.1, 11.2
 */
export function MessageBubble({ 
  message, 
  agentName,
  sessionId,
  onReferenceClick,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  return (
    <div
      className={cn(
        'flex gap-4 group',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <div className="flex-shrink-0">
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center',
            isUser
              ? 'bg-primary text-primary-foreground'
              : isSystem
              ? 'bg-destructive/10 text-destructive border border-destructive/20'
              : 'bg-primary/10 text-primary border border-primary/20'
          )}
        >
          {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
        </div>
      </div>

      <div
        className={cn(
          'flex flex-col flex-1 max-w-[85%]',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Agent name and timestamp */}
        <div className={cn(
          'flex items-center gap-2 mb-2',
          isUser ? 'flex-row-reverse' : 'flex-row'
        )}>
          {!isUser && agentName && (
            <span className="text-sm font-medium text-foreground">{agentName}</span>
          )}
          {isUser && (
            <span className="text-sm font-medium text-foreground">You</span>
          )}
          <span className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {/* Message content */}
        <div
          className={cn(
            'rounded-2xl px-6 py-4 shadow-sm border',
            isUser
              ? 'bg-primary text-primary-foreground border-primary/20'
              : isSystem
              ? 'bg-destructive/5 text-destructive border-destructive/20'
              : 'bg-muted/50 border-border'
          )}
        >
          <MessageContent content={message.content} isUser={isUser} />
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 w-full">
            <ToolCallSequence
              toolCalls={message.toolCalls}
              sessionId={sessionId}
              messageId={message.id}
              onReferenceClick={onReferenceClick}
            />
          </div>
        )}

        {/* References */}
        {message.references && message.references.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.references.map((ref, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                className="h-auto py-2 px-3 text-xs bg-background/50 hover:bg-background border-border/50"
                onClick={() => onReferenceClick?.(ref)}
              >
                <ExternalLink className="h-3 w-3 mr-2" />
                {ref.title}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Props for MessageContent component
 */
interface MessageContentProps {
  content: string
  isUser: boolean
}

/**
 * MessageContent component for rendering message text with formatting
 */
function MessageContent({ content, isUser }: MessageContentProps) {
  const parts = parseContent(content)

  return (
    <div className={cn(
      'text-sm leading-relaxed',
      isUser 
        ? 'text-primary-foreground' 
        : 'prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-code:text-foreground'
    )}>
      {parts.map((part, index) => (
        <ContentPart key={index} part={part} />
      ))}
    </div>
  )
}

type ContentPartType = 
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'inline-code'; content: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'action'; label: string; action: string }
  | { type: 'link'; text: string; url: string }

function parseContent(content: string): ContentPartType[] {
  const parts: ContentPartType[] = []
  let remaining = content

  while (remaining.length > 0) {
    // Check for code blocks
    const codeBlockMatch = remaining.match(/^```(\w*)\n([\s\S]*?)```/)
    if (codeBlockMatch) {
      parts.push({
        type: 'code',
        language: codeBlockMatch[1] || 'text',
        content: codeBlockMatch[2],
      })
      remaining = remaining.slice(codeBlockMatch[0].length)
      continue
    }

    // Check for inline code
    const inlineCodeMatch = remaining.match(/^`([^`]+)`/)
    if (inlineCodeMatch) {
      parts.push({ type: 'inline-code', content: inlineCodeMatch[1] })
      remaining = remaining.slice(inlineCodeMatch[0].length)
      continue
    }

    // Check for action buttons [Action Label](action:action_name)
    const actionMatch = remaining.match(/^\[([^\]]+)\]\(action:([^)]+)\)/)
    if (actionMatch) {
      parts.push({ type: 'action', label: actionMatch[1], action: actionMatch[2] })
      remaining = remaining.slice(actionMatch[0].length)
      continue
    }

    // Check for links [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch && !linkMatch[2].startsWith('action:')) {
      parts.push({ type: 'link', text: linkMatch[1], url: linkMatch[2] })
      remaining = remaining.slice(linkMatch[0].length)
      continue
    }

    // Check for tables
    const tableMatch = remaining.match(/^(\|[^\n]+\|\n)+/)
    if (tableMatch) {
      const tableContent = tableMatch[0]
      const lines = tableContent.trim().split('\n')
      if (lines.length >= 2) {
        const headers = lines[0].split('|').filter(Boolean).map(h => h.trim())
        const rows = lines.slice(2).map(line => 
          line.split('|').filter(Boolean).map(cell => cell.trim())
        )
        parts.push({ type: 'table', headers, rows })
        remaining = remaining.slice(tableMatch[0].length)
        continue
      }
    }

    // Regular text
    const nextSpecial = remaining.search(/```|`|\[|^\|/m)
    if (nextSpecial === -1 || nextSpecial === 0) {
      const textEnd = nextSpecial === 0 ? 1 : remaining.length
      parts.push({ type: 'text', content: remaining.slice(0, textEnd) })
      remaining = remaining.slice(textEnd)
    } else {
      parts.push({ type: 'text', content: remaining.slice(0, nextSpecial) })
      remaining = remaining.slice(nextSpecial)
    }
  }

  // Merge consecutive text parts
  const merged: ContentPartType[] = []
  for (const part of parts) {
    const last = merged[merged.length - 1]
    if (part.type === 'text' && last?.type === 'text') {
      last.content += part.content
    } else {
      merged.push(part)
    }
  }

  return merged
}

function ContentPart({ part }: { part: ContentPartType }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  switch (part.type) {
    case 'text':
      return <span className="whitespace-pre-wrap">{part.content}</span>

    case 'code':
      return (
        <div className="my-3 rounded-xl overflow-hidden border bg-muted/30 shadow-sm">
          <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
            <span className="text-xs text-muted-foreground font-mono font-medium">
              {part.language || 'code'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-background/50"
              onClick={() => handleCopy(part.content)}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
          <pre className="p-4 overflow-x-auto bg-muted/20">
            <code className="text-xs font-mono leading-relaxed">{part.content}</code>
          </pre>
        </div>
      )

    case 'inline-code':
      return (
        <code className="px-2 py-1 rounded-md bg-muted/50 font-mono text-xs border">
          {part.content}
        </code>
      )

    case 'table':
      return (
        <div className="my-4 overflow-x-auto rounded-xl border shadow-sm">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="bg-muted/50">
                {part.headers.map((header, i) => (
                  <th
                    key={i}
                    className="px-4 py-3 text-left text-xs font-semibold border-b text-foreground"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {part.rows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-3 text-xs border-b border-border/50">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case 'action':
      return (
        <Button
          variant="outline"
          size="sm"
          className="my-2 mx-1 rounded-lg border-primary/20 hover:bg-primary/5"
          onClick={() => console.log('Action:', part.action)}
        >
          <Play className="h-3 w-3 mr-2" />
          {part.label}
        </Button>
      )

    case 'link':
      return (
        <a
          href={part.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-1"
        >
          {part.text}
          <ExternalLink className="h-3 w-3" />
        </a>
      )

    default:
      return null
  }
}
