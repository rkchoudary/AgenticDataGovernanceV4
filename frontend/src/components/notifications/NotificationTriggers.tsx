import { useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { showInfoToast, showWarningToast, showCriticalToast } from '@/stores'

export type TriggerType = 
  | 'deadline_approaching'
  | 'deadline_passed'
  | 'issue_created'
  | 'issue_escalated'
  | 'issue_resolved'
  | 'approval_requested'
  | 'approval_completed'
  | 'cycle_status_changed'
  | 'cde_quality_alert'
  | 'system_alert'

export interface NotificationTriggerEvent {
  type: TriggerType
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  actionUrl?: string
  metadata?: Record<string, unknown>
}

interface NotificationTriggersProps {
  enabled?: boolean
  pollInterval?: number
  onTrigger?: (event: NotificationTriggerEvent) => void
}

// Simulated WebSocket/SSE connection for real-time notifications
// In production, this would connect to a real WebSocket server
export function NotificationTriggers({
  enabled = true,
  pollInterval = 30000,
  onTrigger,
}: NotificationTriggersProps) {
  const queryClient = useQueryClient()
  const lastCheckRef = useRef<Date>(new Date())

  const handleTrigger = useCallback((event: NotificationTriggerEvent) => {
    // Show toast based on severity
    switch (event.severity) {
      case 'critical':
        showCriticalToast(event.title, event.message, {
          actionLabel: event.actionUrl ? 'View Details' : undefined,
          onAction: event.actionUrl ? () => window.location.href = event.actionUrl! : undefined,
        })
        break
      case 'warning':
        showWarningToast(event.title, event.message, {
          actionLabel: event.actionUrl ? 'View Details' : undefined,
          onAction: event.actionUrl ? () => window.location.href = event.actionUrl! : undefined,
        })
        break
      default:
        showInfoToast(event.title, event.message, {
          actionLabel: event.actionUrl ? 'View Details' : undefined,
          onAction: event.actionUrl ? () => window.location.href = event.actionUrl! : undefined,
        })
    }

    // Invalidate relevant queries based on trigger type
    switch (event.type) {
      case 'deadline_approaching':
      case 'deadline_passed':
      case 'cycle_status_changed':
        queryClient.invalidateQueries({ queryKey: ['cycles'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        break
      case 'issue_created':
      case 'issue_escalated':
      case 'issue_resolved':
        queryClient.invalidateQueries({ queryKey: ['issues'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        break
      case 'approval_requested':
      case 'approval_completed':
        queryClient.invalidateQueries({ queryKey: ['approvals'] })
        break
      case 'cde_quality_alert':
        queryClient.invalidateQueries({ queryKey: ['cdes'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        break
    }

    // Always refresh notifications
    queryClient.invalidateQueries({ queryKey: ['notifications'] })

    // Call custom handler if provided
    onTrigger?.(event)
  }, [queryClient, onTrigger])

  useEffect(() => {
    if (!enabled) return

    // In a real implementation, this would be a WebSocket connection
    // For now, we'll simulate with polling
    const checkForTriggers = async () => {
      try {
        // This would be replaced with actual API call or WebSocket message handling
        // const response = await apiClient.get('/notifications/triggers', {
        //   params: { since: lastCheckRef.current.toISOString() }
        // })
        // response.data.triggers.forEach(handleTrigger)
        lastCheckRef.current = new Date()
      } catch (error) {
        console.error('Failed to check notification triggers:', error)
      }
    }

    const interval = setInterval(checkForTriggers, pollInterval)
    return () => clearInterval(interval)
  }, [enabled, pollInterval, handleTrigger])

  return null // This is a headless component
}

// Helper functions to create trigger events
export function createDeadlineTrigger(
  daysRemaining: number,
  cycleName: string,
  cycleId: string
): NotificationTriggerEvent {
  const isPassed = daysRemaining < 0
  return {
    type: isPassed ? 'deadline_passed' : 'deadline_approaching',
    title: isPassed ? 'Deadline Passed' : 'Deadline Approaching',
    message: isPassed
      ? `${cycleName} deadline has passed by ${Math.abs(daysRemaining)} day(s)`
      : `${cycleName} deadline in ${daysRemaining} day(s)`,
    severity: isPassed ? 'critical' : daysRemaining <= 3 ? 'warning' : 'info',
    actionUrl: `/cycles/${cycleId}`,
    metadata: { cycleId, daysRemaining },
  }
}

export function createIssueTrigger(
  action: 'created' | 'escalated' | 'resolved',
  issueTitle: string,
  issueId: string,
  severity?: string
): NotificationTriggerEvent {
  const typeMap = {
    created: 'issue_created' as TriggerType,
    escalated: 'issue_escalated' as TriggerType,
    resolved: 'issue_resolved' as TriggerType,
  }
  
  const titleMap = {
    created: 'New Issue Created',
    escalated: 'Issue Escalated',
    resolved: 'Issue Resolved',
  }

  const severityMap = {
    created: severity === 'critical' ? 'critical' : 'warning',
    escalated: 'critical',
    resolved: 'info',
  } as const

  return {
    type: typeMap[action],
    title: titleMap[action],
    message: issueTitle,
    severity: severityMap[action],
    actionUrl: `/issues/${issueId}`,
    metadata: { issueId, action, severity },
  }
}

export function createApprovalTrigger(
  action: 'requested' | 'completed',
  artifactType: string,
  artifactName: string,
  approvalId: string,
  decision?: string
): NotificationTriggerEvent {
  return {
    type: action === 'requested' ? 'approval_requested' : 'approval_completed',
    title: action === 'requested' ? 'Approval Requested' : 'Approval Decision',
    message: action === 'requested'
      ? `${artifactType}: ${artifactName} requires your approval`
      : `${artifactType}: ${artifactName} was ${decision}`,
    severity: action === 'requested' ? 'warning' : 'info',
    actionUrl: `/approvals/${approvalId}`,
    metadata: { approvalId, artifactType, artifactName, decision },
  }
}

export function createCycleStatusTrigger(
  cycleName: string,
  cycleId: string,
  oldStatus: string,
  newStatus: string
): NotificationTriggerEvent {
  const isBlocked = newStatus === 'blocked'
  const isCompleted = newStatus === 'completed'
  
  return {
    type: 'cycle_status_changed',
    title: 'Cycle Status Changed',
    message: `${cycleName}: ${oldStatus} → ${newStatus}`,
    severity: isBlocked ? 'critical' : isCompleted ? 'info' : 'warning',
    actionUrl: `/cycles/${cycleId}`,
    metadata: { cycleId, oldStatus, newStatus },
  }
}

export function createQualityAlertTrigger(
  cdeName: string,
  cdeId: string,
  qualityScore: number,
  threshold: number
): NotificationTriggerEvent {
  return {
    type: 'cde_quality_alert',
    title: 'Data Quality Alert',
    message: `${cdeName} quality score (${qualityScore}%) below threshold (${threshold}%)`,
    severity: qualityScore < threshold * 0.5 ? 'critical' : 'warning',
    actionUrl: `/cdes/${cdeId}`,
    metadata: { cdeId, qualityScore, threshold },
  }
}
