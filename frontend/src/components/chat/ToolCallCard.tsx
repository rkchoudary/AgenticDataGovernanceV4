import { useState } from 'react'
import { 
  Wrench, 
  ChevronDown, 
  ChevronRight, 
  Check, 
  X, 
  Loader2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  LucideIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ToolCall } from '@/stores/chatStore'
import { cn } from '@/lib/utils'

interface ToolCallCardProps {
  toolCall: ToolCall
  className?: string
}

interface StatusConfig {
  icon: LucideIcon
  color: string
  bgColor: string
  label: string
  animate?: boolean
}

const STATUS_CONFIG: Record<ToolCall['status'], StatusConfig> = {
  pending: {
    icon: Clock,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    label: 'Pending',
  },
  running: {
    icon: Loader2,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    label: 'Running',
    animate: true,
  },
  completed: {
    icon: Check,
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-950',
    label: 'Completed',
  },
  failed: {
    icon: X,
    color: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-950',
    label: 'Failed',
  },
}

export function ToolCallCard({ toolCall, className }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showParams, setShowParams] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [copied, setCopied] = useState(false)

  const statusConfig = STATUS_CONFIG[toolCall.status]
  const StatusIcon = statusConfig.icon

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatToolName = (name: string) => {
    return name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const hasParams = Object.keys(toolCall.parameters).length > 0
  const hasResult = toolCall.result !== undefined

  return (
    <Card className={cn('border', statusConfig.bgColor, className)}>
      <CardHeader className="p-3 pb-0">
        <div className="flex items-center justify-between">
          <button
            className="flex items-center gap-2 text-left flex-1"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {formatToolName(toolCall.name)}
            </span>
          </button>
          <div className="flex items-center gap-2">
            <StatusIcon
              className={cn(
                'h-4 w-4',
                statusConfig.color,
                statusConfig.animate && 'animate-spin'
              )}
            />
            <span className={cn('text-xs', statusConfig.color)}>
              {statusConfig.label}
            </span>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="p-3 pt-2 space-y-3">
          {/* Parameters Section */}
          {hasParams && (
            <div>
              <button
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowParams(!showParams)}
              >
                {showParams ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                Parameters
              </button>
              {showParams && (
                <div className="mt-2 relative">
                  <pre className="p-2 rounded bg-background border text-xs overflow-x-auto">
                    <code>{JSON.stringify(toolCall.parameters, null, 2)}</code>
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={() => handleCopy(JSON.stringify(toolCall.parameters, null, 2))}
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Result Section */}
          {hasResult && (
            <div>
              <button
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowResult(!showResult)}
              >
                {showResult ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                Result Preview
              </button>
              {showResult && (
                <div className="mt-2">
                  <ResultPreview result={toolCall.result} />
                </div>
              )}
            </div>
          )}

          {/* Tool ID */}
          <div className="text-xs text-muted-foreground">
            ID: <code className="font-mono">{toolCall.id}</code>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

interface ResultPreviewProps {
  result: unknown
}

function ResultPreview({ result }: ResultPreviewProps) {
  if (result === null || result === undefined) {
    return (
      <span className="text-xs text-muted-foreground italic">No result</span>
    )
  }

  if (typeof result === 'string') {
    // Truncate long strings
    const displayText = result.length > 500 ? result.slice(0, 500) + '...' : result
    return (
      <div className="p-2 rounded bg-background border text-xs whitespace-pre-wrap">
        {displayText}
      </div>
    )
  }

  if (typeof result === 'object') {
    // Check if it's an array
    if (Array.isArray(result)) {
      return (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">
            Array with {result.length} items
          </span>
          <pre className="p-2 rounded bg-background border text-xs overflow-x-auto max-h-48">
            <code>{JSON.stringify(result, null, 2)}</code>
          </pre>
        </div>
      )
    }

    // Object
    return (
      <pre className="p-2 rounded bg-background border text-xs overflow-x-auto max-h-48">
        <code>{JSON.stringify(result, null, 2)}</code>
      </pre>
    )
  }

  // Primitive types
  return (
    <div className="p-2 rounded bg-background border text-xs">
      {String(result)}
    </div>
  )
}
