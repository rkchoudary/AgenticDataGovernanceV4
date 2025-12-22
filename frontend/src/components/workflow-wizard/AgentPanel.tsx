/**
 * AgentPanel Component
 * 
 * Displays AI agent activity, status, and interaction controls.
 * Shows agent name, current action, progress, and activity log.
 * Provides retry and manual override options when errors occur.
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { useState, useCallback } from 'react'
import {
  Bot,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Settings,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AgentPanelProps, AgentActivity } from '@/types/workflow-wizard'
import { cn } from '@/lib/utils'

// ============================================================================
// Constants
// ============================================================================

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'awaiting_input'

const STATUS_CONFIG: Record<AgentStatus, {
  icon: React.ReactNode
  color: string
  bgColor: string
  label: string
}> = {
  idle: {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    label: 'Idle',
  },
  running: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    label: 'Running',
  },
  completed: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    label: 'Completed',
  },
  error: {
    icon: <XCircle className="h-4 w-4" />,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    label: 'Error',
  },
  awaiting_input: {
    icon: <MessageSquare className="h-4 w-4" />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
    label: 'Awaiting Input',
  },
}

const ACTIVITY_STATUS_CONFIG: Record<AgentActivity['status'], {
  icon: React.ReactNode
  color: string
}> = {
  started: {
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    color: 'text-blue-500',
  },
  completed: {
    icon: <CheckCircle2 className="h-3 w-3" />,
    color: 'text-green-500',
  },
  failed: {
    icon: <XCircle className="h-3 w-3" />,
    color: 'text-red-500',
  },
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * AI Content Indicator Badge
 * Requirements: 12.4 - Clearly distinguish AI-generated content
 */
interface AIIndicatorBadgeProps {
  confidenceScore?: number
  size?: 'sm' | 'md'
}

export function AIIndicatorBadge({ confidenceScore, size = 'sm' }: AIIndicatorBadgeProps) {
  const sizeClasses = size === 'sm' 
    ? 'px-1.5 py-0.5 text-xs' 
    : 'px-2 py-1 text-sm'
  
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 font-medium',
      sizeClasses
    )}>
      <Sparkles className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />
      AI
      {confidenceScore !== undefined && (
        <span className="text-blue-500">
          {Math.round(confidenceScore * 100)}%
        </span>
      )}
    </span>
  )
}

/**
 * Agent Status Badge
 */
interface StatusBadgeProps {
  status: AgentStatus
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
      config.bgColor,
      config.color
    )}>
      {config.icon}
      {config.label}
    </span>
  )
}

/**
 * Progress Bar Component
 */
interface ProgressBarProps {
  progress: number
  showLabel?: boolean
}

function ProgressBar({ progress, showLabel = true }: ProgressBarProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100)
  
  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  )
}

/**
 * Activity Log Item
 */
interface ActivityLogItemProps {
  activity: AgentActivity
}

function ActivityLogItem({ activity }: ActivityLogItemProps) {
  const statusConfig = ACTIVITY_STATUS_CONFIG[activity.status]
  const timestamp = new Date(activity.timestamp)
  
  return (
    <div className="flex items-start gap-3 py-2">
      <div className={cn('mt-0.5', statusConfig.color)}>
        {statusConfig.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{activity.action}</span>
          {activity.confidenceScore !== undefined && (
            <AIIndicatorBadge confidenceScore={activity.confidenceScore} size="sm" />
          )}
        </div>
        {activity.details && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {activity.details}
          </p>
        )}
        <span className="text-xs text-muted-foreground">
          {formatTimestamp(timestamp)}
        </span>
      </div>
    </div>
  )
}

/**
 * Activity Log Component
 */
interface ActivityLogProps {
  activities: AgentActivity[]
  maxVisible?: number
}

function ActivityLog({ activities, maxVisible = 5 }: ActivityLogProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const visibleActivities = isExpanded 
    ? activities 
    : activities.slice(0, maxVisible)
  
  const hasMore = activities.length > maxVisible
  
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Activity Log</h4>
        <span className="text-xs text-muted-foreground">
          {activities.length} event{activities.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      <div className="divide-y">
        {visibleActivities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No activity yet
          </p>
        ) : (
          visibleActivities.map((activity, index) => (
            <ActivityLogItem key={`${activity.timestamp}-${index}`} activity={activity} />
          ))
        )}
      </div>
      
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Show {activities.length - maxVisible} more
            </>
          )}
        </Button>
      )}
    </div>
  )
}

/**
 * Agent Input Prompt Component
 * Requirements: 12.3 - Display prompts when agent requires input
 */
interface AgentInputPromptProps {
  prompt: string
  options?: string[]
  onSubmit: (response: string) => void
}

export function AgentInputPrompt({ prompt, options, onSubmit }: AgentInputPromptProps) {
  const [response, setResponse] = useState('')
  
  const handleSubmit = useCallback(() => {
    if (response.trim()) {
      onSubmit(response.trim())
      setResponse('')
    }
  }, [response, onSubmit])
  
  return (
    <div className="border-2 border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-2">
        <MessageSquare className="h-5 w-5 text-amber-600 mt-0.5" />
        <div>
          <p className="font-medium text-amber-800">Agent requires input</p>
          <p className="text-sm text-amber-700 mt-1">{prompt}</p>
        </div>
      </div>
      
      {options && options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {options.map((option, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              onClick={() => onSubmit(option)}
              className="border-amber-300 hover:bg-amber-100"
            >
              {option}
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 px-3 py-2 border rounded-md text-sm"
            placeholder="Type your response..."
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <Button size="sm" onClick={handleSubmit} disabled={!response.trim()}>
            Submit
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Error Display Component
 * Requirements: 12.5 - Display error with retry and manual override options
 */
interface AgentErrorDisplayProps {
  error: string
  onRetry?: () => void
  onManualOverride?: () => void
}

function AgentErrorDisplay({ error, onRetry, onManualOverride }: AgentErrorDisplayProps) {
  return (
    <div className="border-2 border-red-200 bg-red-50 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
        <div>
          <p className="font-medium text-red-800">Agent encountered an error</p>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      </div>
      
      <div className="flex gap-2">
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="border-red-300 hover:bg-red-100 text-red-700"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry
          </Button>
        )}
        {onManualOverride && (
          <Button
            variant="outline"
            size="sm"
            onClick={onManualOverride}
            className="border-red-300 hover:bg-red-100 text-red-700"
          >
            <Settings className="h-4 w-4 mr-1" />
            Manual Override
          </Button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Main AgentPanel Component
// ============================================================================

export interface ExtendedAgentPanelProps extends AgentPanelProps {
  inputPrompt?: string
  inputOptions?: string[]
  onInputSubmit?: (response: string) => void
  errorMessage?: string
}

export function AgentPanel({
  agentId,
  agentName,
  status,
  currentAction,
  progress,
  activityLog,
  onRetry,
  onManualOverride,
  inputPrompt,
  inputOptions,
  onInputSubmit,
  errorMessage,
}: ExtendedAgentPanelProps) {
  // Determine effective status
  const effectiveStatus: AgentStatus = inputPrompt ? 'awaiting_input' : status

  return (
    <Card className="w-full" data-agent-id={agentId}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            {agentName}
            <AIIndicatorBadge size="sm" />
          </CardTitle>
          <StatusBadge status={effectiveStatus} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Action */}
        {currentAction && status === 'running' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-muted-foreground">Current action:</span>
            </div>
            <p className="text-sm font-medium pl-6">{currentAction}</p>
          </div>
        )}

        {/* Progress Bar */}
        {progress !== undefined && status === 'running' && (
          <ProgressBar progress={progress} />
        )}

        {/* Input Prompt */}
        {inputPrompt && onInputSubmit && (
          <AgentInputPrompt
            prompt={inputPrompt}
            options={inputOptions}
            onSubmit={onInputSubmit}
          />
        )}

        {/* Error Display */}
        {status === 'error' && errorMessage && (
          <AgentErrorDisplay
            error={errorMessage}
            onRetry={onRetry}
            onManualOverride={onManualOverride}
          />
        )}

        {/* Completion Summary */}
        {status === 'completed' && activityLog.length > 0 && (
          <CompletionSummary activities={activityLog} />
        )}

        {/* Activity Log */}
        <ActivityLog activities={activityLog} />
      </CardContent>
    </Card>
  )
}

/**
 * Completion Summary Component
 * Requirements: 12.2 - Display summary of results with confidence scores
 */
interface CompletionSummaryProps {
  activities: AgentActivity[]
}

function CompletionSummary({ activities }: CompletionSummaryProps) {
  const completedActivities = activities.filter(a => a.status === 'completed')
  const failedActivities = activities.filter(a => a.status === 'failed')
  
  // Calculate average confidence score
  const activitiesWithConfidence = activities.filter(a => a.confidenceScore !== undefined)
  const avgConfidence = activitiesWithConfidence.length > 0
    ? activitiesWithConfidence.reduce((sum, a) => sum + (a.confidenceScore || 0), 0) / activitiesWithConfidence.length
    : null

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <span className="font-medium text-green-800">Agent completed</span>
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Tasks completed:</span>
          <span className="ml-2 font-medium">{completedActivities.length}</span>
        </div>
        {failedActivities.length > 0 && (
          <div>
            <span className="text-muted-foreground">Tasks failed:</span>
            <span className="ml-2 font-medium text-red-600">{failedActivities.length}</span>
          </div>
        )}
        {avgConfidence !== null && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Avg. confidence:</span>
            <span className="ml-2 font-medium">{Math.round(avgConfidence * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)

  if (diffSecs < 60) {
    return 'Just now'
  } else if (diffMins < 60) {
    return `${diffMins}m ago`
  } else if (diffHours < 24) {
    return `${diffHours}h ago`
  } else {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}

/**
 * Check if content is AI-generated based on activity
 * Property 9: AI Content Distinction
 */
export function isAIGeneratedContent(activity: AgentActivity): boolean {
  return activity.confidenceScore !== undefined
}

/**
 * Get all AI-generated activities from a log
 * Property 9: AI Content Distinction
 */
export function getAIGeneratedActivities(activities: AgentActivity[]): AgentActivity[] {
  return activities.filter(isAIGeneratedContent)
}

/**
 * Validate that AI content has proper indicators
 * Property 9: AI Content Distinction - For testing
 */
export function validateAIContentDistinction(
  activities: AgentActivity[]
): { isValid: boolean; missingIndicators: AgentActivity[] } {
  const aiActivities = activities.filter(a => a.confidenceScore !== undefined)
  // All AI activities should have confidence scores (which they do by definition)
  // This function validates the structure is correct
  const missingIndicators = aiActivities.filter(
    a => a.confidenceScore === undefined || a.confidenceScore < 0 || a.confidenceScore > 1
  )
  
  return {
    isValid: missingIndicators.length === 0,
    missingIndicators,
  }
}

export default AgentPanel
