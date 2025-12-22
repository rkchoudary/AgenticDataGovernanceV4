import { useNavigate } from 'react-router-dom'
import {
  Check,
  X,
  MessageSquare,
  Clock,
  User,
  ChevronRight,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SwipeableCard, type SwipeAction } from './SwipeableCard'
import type { ApprovalRequest, UrgencyLevel } from '@/hooks/useApprovals'

interface MobileApprovalCardProps {
  approval: ApprovalRequest
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onRequestChanges?: (id: string) => void
  className?: string
}

/**
 * MobileApprovalCard - A swipeable approval card for mobile devices
 * Supports swipe gestures for quick approve/reject actions
 */
export function MobileApprovalCard({
  approval,
  onApprove,
  onReject,
  onRequestChanges,
  className,
}: MobileApprovalCardProps) {
  const navigate = useNavigate()

  const leftActions: SwipeAction[] = onApprove
    ? [
        {
          icon: Check,
          label: 'Approve',
          color: 'text-white',
          bgColor: 'bg-green-500',
          onAction: () => onApprove(approval.id),
        },
      ]
    : []

  const rightActions: SwipeAction[] = [
    ...(onReject
      ? [
          {
            icon: X,
            label: 'Reject',
            color: 'text-white',
            bgColor: 'bg-red-500',
            onAction: () => onReject(approval.id),
          },
        ]
      : []),
    ...(onRequestChanges
      ? [
          {
            icon: MessageSquare,
            label: 'Changes',
            color: 'text-white',
            bgColor: 'bg-orange-500',
            onAction: () => onRequestChanges(approval.id),
          },
        ]
      : []),
  ]

  const getUrgencyColor = (urgency: UrgencyLevel) => {
    const colors: Record<UrgencyLevel, string> = {
      critical: 'bg-red-500',
      high: 'bg-orange-500',
      normal: 'bg-blue-500',
      low: 'bg-gray-400',
    }
    return colors[urgency]
  }

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    return `${diffDays}d ago`
  }

  const getDueDateStatus = (dueDate?: string) => {
    if (!dueDate) return null
    const date = new Date(dueDate)
    const now = new Date()
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return { text: `Overdue`, color: 'text-red-600', urgent: true }
    }
    if (diffDays === 0) {
      return { text: 'Due today', color: 'text-orange-600', urgent: true }
    }
    if (diffDays <= 2) {
      return { text: `Due in ${diffDays}d`, color: 'text-yellow-600', urgent: false }
    }
    return { text: `Due in ${diffDays}d`, color: 'text-muted-foreground', urgent: false }
  }

  const dueStatus = getDueDateStatus(approval.dueDate)

  return (
    <SwipeableCard
      leftActions={leftActions}
      rightActions={rightActions}
      onTap={() => navigate(`/approvals/${approval.id}`)}
      className={className}
    >
      <div className="p-4">
        {/* Header with urgency indicator */}
        <div className="flex items-start gap-3">
          {/* Urgency dot */}
          <div
            className={cn(
              'w-3 h-3 rounded-full mt-1.5 flex-shrink-0',
              getUrgencyColor(approval.urgency)
            )}
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title and chevron */}
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium text-foreground truncate">
                {approval.artifactName}
              </h3>
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </div>

            {/* Artifact type */}
            <p className="text-sm text-muted-foreground mt-0.5">
              {approval.artifactType.replace('_', ' ')}
            </p>

            {/* Meta info */}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {/* Requester */}
              <div className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <span className="truncate max-w-[100px]">{approval.requester}</span>
              </div>

              {/* Time */}
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span>{getTimeAgo(approval.submittedAt)}</span>
              </div>

              {/* Due date */}
              {dueStatus && (
                <div className={cn('flex items-center gap-1', dueStatus.color)}>
                  {dueStatus.urgent && <AlertCircle className="h-3.5 w-3.5" />}
                  <span className="font-medium">{dueStatus.text}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick action hint */}
        {(leftActions.length > 0 || rightActions.length > 0) && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-[10px] text-muted-foreground text-center">
              Swipe right to approve • Swipe left for more options
            </p>
          </div>
        )}
      </div>
    </SwipeableCard>
  )
}

// Mobile approval list component
interface MobileApprovalListProps {
  approvals: ApprovalRequest[]
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onRequestChanges?: (id: string) => void
  emptyMessage?: string
  isLoading?: boolean
}

export function MobileApprovalList({
  approvals,
  onApprove,
  onReject,
  onRequestChanges,
  emptyMessage = 'No pending approvals',
  isLoading = false,
}: MobileApprovalListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 bg-muted/50 rounded-lg animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (approvals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Check className="h-12 w-12 mb-4 text-green-500" />
        <p className="text-lg font-medium">All caught up!</p>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {approvals.map((approval) => (
        <MobileApprovalCard
          key={approval.id}
          approval={approval}
          onApprove={onApprove}
          onReject={onReject}
          onRequestChanges={onRequestChanges}
        />
      ))}
    </div>
  )
}
