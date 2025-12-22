import * as React from 'react'
import { Bot, User, Copy, Check, ExternalLink, Play } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ChatMessage } from '@/stores/chatStore'
import { ToolCallCard } from './ToolCallCard'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: ChatMessage
  agentName?: string
}

export function MessageBubble({ message, agentName }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback
          className={cn(
            isUser
              ? 'bg-secondary text-secondary-foreground'
              : isSystem
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary text-primary-foreground'
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          'flex flex-col max-w-[80%]',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Agent name badge */}
        {!isUser && agentName && (
          <span className="text-xs text-muted-foreground mb-1">{agentName}</span>
        )}

        {/* Message content */}
        <div
          className={cn(
            'rounded-lg px-4 py-2',
            isUser
              ? 'bg-primary text-primary-foreground'
              : isSystem
              ? 'bg-destructive/10 text-destructive border border-destructive/20'
              : 'bg-muted'
          )}
        >
          <MessageContent content={message.content} isUser={isUser} />
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-2 w-full">
            {message.toolCalls.map((toolCall) => (
              <ToolCallCard key={toolCall.id} toolCall={toolCall} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <span className="text-xs text-muted-foreground mt-1">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}

interface MessageContentProps {
  content: string
  isUser: boolean
}

function MessageContent({ content, isUser }: MessageContentProps) {
  // Parse and render markdown-like content
  const parts = parseContent(content)

  return (
    <div className={cn('text-sm', isUser ? '' : 'prose prose-sm dark:prose-invert max-w-none')}>
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

  // Simple markdown-like parsing
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

    // Regular text - find next special character or end
    const nextSpecial = remaining.search(/```|`|\[|^\|/m)
    if (nextSpecial === -1 || nextSpecial === 0) {
      // No more special content or at start, take one character
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
        <div className="my-2 rounded-md overflow-hidden border bg-muted/50">
          <div className="flex items-center justify-between px-3 py-1 bg-muted border-b">
            <span className="text-xs text-muted-foreground font-mono">
              {part.language}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => handleCopy(part.content)}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
          <pre className="p-3 overflow-x-auto">
            <code className="text-xs font-mono">{part.content}</code>
          </pre>
        </div>
      )

    case 'inline-code':
      return (
        <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
          {part.content}
        </code>
      )

    case 'table':
      return (
        <div className="my-2 overflow-x-auto">
          <table className="min-w-full border-collapse border rounded-md">
            <thead>
              <tr className="bg-muted">
                {part.headers.map((header, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left text-xs font-medium border"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {part.rows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/50">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 text-xs border">
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
          className="my-1 mx-1"
          onClick={() => console.log('Action:', part.action)}
        >
          <Play className="h-3 w-3 mr-1" />
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
