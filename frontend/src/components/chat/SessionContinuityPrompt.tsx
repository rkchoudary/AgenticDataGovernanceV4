import { Clock, MessageSquare, RefreshCw, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/**
 * Previous session info for display
 */
export interface PreviousSessionInfo {
  sessionId: string
  lastActivity: Date
  messageCount: number
  summary?: string
  isWithinContinuityWindow: boolean
}

/**
 * Session continuity decision
 */
export type SessionContinuityDecision = 'continue' | 'new'

/**
 * Props for SessionContinuityPrompt component
 */
export interface SessionContinuityPromptProps {
  /** Whether the prompt is open */
  open: boolean
  /** Previous session information */
  previousSession: PreviousSessionInfo | null
  /** Callback when user makes a decision */
  onDecision: (decision: SessionContinuityDecision) => void
  /** Callback when prompt is dismissed */
  onDismiss?: () => void
  /** Whether recovery is in progress */
  isRecovering?: boolean
  /** CSS class name */
  className?: string
}

/**
 * Format relative time for display
 */
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffMins < 1) {
    return 'just now'
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  } else {
    return date.toLocaleDateString()
  }
}

/**
 * Session Continuity Prompt Component
 * 
 * Displays a dialog asking the user if they want to continue
 * their previous conversation or start a new one.
 * 
 * Validates: Requirements 13.2
 */
export function SessionContinuityPrompt({
  open,
  previousSession,
  onDecision,
  onDismiss,
  isRecovering = false,
  className,
}: SessionContinuityPromptProps) {
  if (!previousSession) return null

  const handleContinue = () => {
    onDecision('continue')
  }

  const handleNewConversation = () => {
    onDecision('new')
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDismiss?.()}>
      <DialogContent className={cn('sm:max-w-md', className)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Continue Previous Conversation?
          </DialogTitle>
          <DialogDescription>
            You have an unfinished conversation from earlier.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Previous session info */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Last active {formatRelativeTime(previousSession.lastActivity)}</span>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span>{previousSession.messageCount} messages</span>
            </div>

            {previousSession.summary && (
              <div className="pt-2 border-t">
                <p className="text-sm text-foreground">
                  {previousSession.summary}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleNewConversation}
            disabled={isRecovering}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Start New
          </Button>
          <Button
            onClick={handleContinue}
            disabled={isRecovering}
            className="w-full sm:w-auto"
          >
            {isRecovering ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Restoring...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Continue
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Inline version of the continuity prompt (for embedding in chat panel)
 */
export function SessionContinuityBanner({
  previousSession,
  onDecision,
  isRecovering = false,
  className,
}: Omit<SessionContinuityPromptProps, 'open' | 'onDismiss'> & { onDismiss?: () => void }) {
  if (!previousSession) return null

  return (
    <div className={cn(
      'flex items-center justify-between gap-4 px-4 py-3 bg-primary/5 border-b',
      className
    )}>
      <div className="flex items-center gap-3 min-w-0">
        <MessageSquare className="h-5 w-5 text-primary flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            Continue previous conversation?
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {previousSession.messageCount} messages • {formatRelativeTime(previousSession.lastActivity)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDecision('new')}
          disabled={isRecovering}
        >
          New
        </Button>
        <Button
          size="sm"
          onClick={() => onDecision('continue')}
          disabled={isRecovering}
        >
          {isRecovering ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </div>
  )
}
