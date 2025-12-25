import * as React from 'react'
import { Bot, User, Copy, Check, ExternalLink, Play, Download } from 'lucide-react'
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
  | { type: 'download-link'; text: string; url: string }

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

    // Check for download links in backticks format FIRST (before inline code)
    const backtickDownloadMatch = remaining.match(/`(\/api\/download\/[^`]+)`/)
    if (backtickDownloadMatch && backtickDownloadMatch.index !== undefined) {
      const url = backtickDownloadMatch[1]
      const filename = url.split('/').pop() || 'Download File'
      
      // Split the text before and after the backtick URL
      const beforeUrl = remaining.slice(0, backtickDownloadMatch.index)
      const afterUrl = remaining.slice(backtickDownloadMatch.index + backtickDownloadMatch[0].length)
      
      // Add text before URL if any
      if (beforeUrl) {
        parts.push({ type: 'text', content: beforeUrl })
      }
      
      // Add download link
      parts.push({ 
        type: 'download-link', 
        text: filename, 
        url: url 
      })
      
      // Continue with remaining text
      remaining = afterUrl
      continue
    }

    // Check for inline code (after backtick download check)
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

    // Check for download links - enhanced to detect /api/download/ URLs (anywhere in text)
    const downloadLinkMatch = remaining.match(/\[([^\]]+)\]\((\/api\/download\/[^)]+)\)/)
    if (downloadLinkMatch && downloadLinkMatch.index !== undefined) {
      const beforeLink = remaining.slice(0, downloadLinkMatch.index)
      const afterLink = remaining.slice(downloadLinkMatch.index + downloadLinkMatch[0].length)
      
      // Add text before link if any
      if (beforeLink) {
        parts.push({ type: 'text', content: beforeLink })
      }
      
      // Add download link
      parts.push({ 
        type: 'download-link', 
        text: downloadLinkMatch[1], 
        url: downloadLinkMatch[2] 
      })
      
      // Continue with remaining text
      remaining = afterLink
      continue
    }

    // Check for download links in backticks format: `download_url`
    const backtickDownloadMatch2 = remaining.match(/`(\/api\/download\/[^`]+)`/)
    if (backtickDownloadMatch2 && backtickDownloadMatch2.index !== undefined) {
      const url = backtickDownloadMatch2[1]
      const filename = url.split('/').pop() || 'Download File'
      
      // Split the text before and after the backtick URL
      const beforeUrl = remaining.slice(0, backtickDownloadMatch2.index)
      const afterUrl = remaining.slice(backtickDownloadMatch2.index + backtickDownloadMatch2[0].length)
      
      // Add text before URL if any
      if (beforeUrl) {
        parts.push({ type: 'text', content: beforeUrl })
      }
      
      // Add download link
      parts.push({ 
        type: 'download-link', 
        text: filename, 
        url: url 
      })
      
      // Continue with remaining text
      remaining = afterUrl
      continue
    }

    // Check for regular links [text](url) (anywhere in text)
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/)
    if (linkMatch && !linkMatch[2].startsWith('action:') && !linkMatch[2].includes('/api/download/') && linkMatch.index !== undefined) {
      const beforeLink = remaining.slice(0, linkMatch.index)
      const afterLink = remaining.slice(linkMatch.index + linkMatch[0].length)
      
      // Add text before link if any
      if (beforeLink) {
        parts.push({ type: 'text', content: beforeLink })
      }
      
      // Add regular link
      parts.push({ type: 'link', text: linkMatch[1], url: linkMatch[2] })
      
      // Continue with remaining text
      remaining = afterLink
      continue
    }

    // Check for bare download URLs in text (only match URLs that start with /api/download/)
    const bareDownloadMatch = remaining.match(/(?:^|\s)(\/api\/download\/[^\s\n,]+)/)
    if (bareDownloadMatch && bareDownloadMatch.index !== undefined) {
      const url = bareDownloadMatch[1]
      const filename = url.split('/').pop() || 'Download File'
      
      // Split the text before and after the URL
      const beforeUrl = remaining.slice(0, bareDownloadMatch.index + (bareDownloadMatch[0].length - bareDownloadMatch[1].length))
      const afterUrl = remaining.slice(bareDownloadMatch.index + bareDownloadMatch[0].length)
      
      // Add text before URL if any
      if (beforeUrl) {
        parts.push({ type: 'text', content: beforeUrl })
      }
      
      // Add download link
      parts.push({ 
        type: 'download-link', 
        text: filename, 
        url: url 
      })
      
      // Continue with remaining text
      remaining = afterUrl
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
    const nextSpecial = remaining.search(/```|`|\[|^\||\/api\/download\//m)
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

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Download failed')
      
      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Download error:', error)
      alert('Download failed. Please try again.')
    }
  }

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'json': return '🔧'
      case 'csv': return '📊'
      case 'pdf': return '📄'
      case 'txt': return '📝'
      case 'xlsx': case 'xls': return '📈'
      default: return '📁'
    }
  }

  const getHumanReadableFilename = (filename: string) => {
    // Convert technical filename to human-readable format
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')
    
    // Handle common patterns
    if (nameWithoutExt.includes('FR_2052A_Sample_')) {
      const bankName = nameWithoutExt.replace('FR_2052A_Sample_', '').replace(/_\d{8}_\d{6}$/, '').replace(/_/g, ' ')
      return `FR 2052A Template - ${bankName}`
    }
    
    if (nameWithoutExt.includes('Data_Quality_Rules_Template_')) {
      const orgName = nameWithoutExt.replace('Data_Quality_Rules_Template_', '').replace(/_\d{8}_\d{6}$/, '').replace(/_/g, ' ')
      return `Data Quality Rules - ${orgName}`
    }
    
    if (nameWithoutExt.includes('Compliance_Checklist_')) {
      const orgName = nameWithoutExt.replace('Compliance_Checklist_', '').replace(/_\d{8}_\d{6}$/, '').replace(/_/g, ' ')
      return `Compliance Checklist - ${orgName}`
    }
    
    if (nameWithoutExt.includes('Data_Catalog_Template_')) {
      const orgName = nameWithoutExt.replace('Data_Catalog_Template_', '').replace(/_\d{8}_\d{6}$/, '').replace(/_/g, ' ')
      return `Data Catalog Template - ${orgName}`
    }
    
    if (nameWithoutExt.includes('Sample_Customer_Data_')) {
      const recordCount = nameWithoutExt.match(/(\d+)records/)?.[1] || ''
      return `Customer Data Sample${recordCount ? ` (${recordCount} records)` : ''}`
    }
    
    if (nameWithoutExt.includes('Sample_Transaction_Data_')) {
      const recordCount = nameWithoutExt.match(/(\d+)records/)?.[1] || ''
      return `Transaction Data Sample${recordCount ? ` (${recordCount} records)` : ''}`
    }
    
    if (nameWithoutExt.includes('Sample_Product_Data_')) {
      const recordCount = nameWithoutExt.match(/(\d+)records/)?.[1] || ''
      return `Product Data Sample${recordCount ? ` (${recordCount} records)` : ''}`
    }
    
    // Fallback: clean up underscores and timestamps
    return nameWithoutExt
      .replace(/_\d{8}_\d{6}$/, '') // Remove timestamp
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/\b\w/g, l => l.toUpperCase()) // Title case
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

    case 'download-link':
      const humanReadableName = getHumanReadableFilename(part.text)
      return (
        <Button
          variant="outline"
          size="sm"
          className="my-2 mx-1 rounded-lg border-green-500/20 bg-green-50 hover:bg-green-100 text-green-700 hover:text-green-800 dark:bg-green-950 dark:hover:bg-green-900 dark:text-green-300"
          onClick={() => handleDownload(part.url, part.text)}
        >
          <span className="mr-2">{getFileIcon(part.text)}</span>
          <Download className="h-3 w-3 mr-2" />
          {humanReadableName}
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
