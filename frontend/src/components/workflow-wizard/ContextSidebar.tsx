/**
 * ContextSidebar Component
 * 
 * Persistent sidebar showing report context, progress, and quick links.
 * Displays current phase info, estimated time remaining, and active users.
 * 
 * Requirements: 1.5, 1.2, 13.4
 */

import { useState } from 'react'
import { Calendar, Clock, ExternalLink, FileText, RotateCcw, Target, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ContextSidebarProps, QuickLink, ActiveUser } from '@/types/workflow-wizard'
import { ActiveUserIndicators } from './ActiveUserIndicators'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { cn } from '@/lib/utils'

export interface ExtendedContextSidebarProps extends ContextSidebarProps {
  activeUsers?: ActiveUser[]
  currentUserId?: string
}

export function ContextSidebar({
  reportName,
  cycleDeadline,
  overallProgress,
  quickLinks,
  currentPhaseInfo,
  activeUsers = [],
  currentUserId,
}: ExtendedContextSidebarProps) {
  const [showResetDialog, setShowResetDialog] = useState(false)
  const resetWorkflow = useWorkflowWizardStore((state) => state.resetWorkflow)

  const handleReset = () => {
    // Clear localStorage and reset store
    localStorage.removeItem('workflow-wizard-storage')
    resetWorkflow()
    setShowResetDialog(false)
    // Reload to ensure clean state
    window.location.reload()
  }

  const deadlineDate = new Date(cycleDeadline)
  const daysUntilDeadline = Math.ceil(
    (deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const isDeadlineNear = daysUntilDeadline <= 7
  const isOverdue = daysUntilDeadline < 0

  return (
    <div className="p-4 space-y-4">
      {/* Report Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="font-semibold">{reportName}</p>
          </div>

          {/* Deadline */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Deadline:</span>
            <span
              className={cn(
                'font-medium',
                isOverdue && 'text-destructive',
                isDeadlineNear && !isOverdue && 'text-amber-600'
              )}
            >
              {deadlineDate.toLocaleDateString()}
            </span>
          </div>

          {/* Days Remaining */}
          <div
            className={cn(
              'text-sm px-2 py-1 rounded-md inline-block',
              isOverdue && 'bg-destructive/10 text-destructive',
              isDeadlineNear && !isOverdue && 'bg-amber-100 text-amber-700',
              !isDeadlineNear && !isOverdue && 'bg-muted text-muted-foreground'
            )}
          >
            {isOverdue
              ? `${Math.abs(daysUntilDeadline)} days overdue`
              : `${daysUntilDeadline} days remaining`}
          </div>
        </CardContent>
      </Card>

      {/* Overall Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Overall Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{overallProgress}%</span>
              <span className="text-sm text-muted-foreground">complete</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-500',
                  overallProgress >= 100 && 'bg-green-500',
                  overallProgress >= 75 && overallProgress < 100 && 'bg-primary',
                  overallProgress >= 50 && overallProgress < 75 && 'bg-amber-500',
                  overallProgress < 50 && 'bg-primary'
                )}
                style={{ width: `${Math.min(overallProgress, 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Phase Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Current Phase
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="font-semibold">{currentPhaseInfo.name}</p>
          </div>

          {/* Steps Progress */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Steps</span>
              <span className="font-medium">
                {currentPhaseInfo.stepsCompleted} / {currentPhaseInfo.totalSteps}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${
                    currentPhaseInfo.totalSteps > 0
                      ? (currentPhaseInfo.stepsCompleted / currentPhaseInfo.totalSteps) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* Estimated Time */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Est. time:</span>
            <span className="font-medium">
              {formatTime(currentPhaseInfo.estimatedTimeRemaining)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      {quickLinks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quick Links</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {quickLinks.map((link, index) => (
                <QuickLinkItem key={index} link={link} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Users - Requirement 13.4 */}
      {activeUsers.length > 0 && (
        <ActiveUserIndicators
          activeUsers={activeUsers}
          currentUserId={currentUserId}
          variant="sidebar"
        />
      )}

      {/* Help Section */}
      <Card className="bg-muted/50">
        <CardContent className="pt-4">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium">Need help?</p>
            <p className="text-xs text-muted-foreground">
              Click the help icon in the header for contextual guidance
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Reset Workflow Button */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-muted-foreground hover:text-destructive hover:border-destructive"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset & Start Over
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all progress and start the workflow from the beginning.
              All completed steps and saved data will be lost. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset Workflow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Quick Link Item Component
 */
function QuickLinkItem({ link }: { link: QuickLink }) {
  return (
    <a
      href={link.href}
      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted transition-colors text-sm"
    >
      {link.icon}
      <span className="flex-1">{link.label}</span>
      <ExternalLink className="h-3 w-3 text-muted-foreground" />
    </a>
  )
}

/**
 * Format minutes into human-readable time
 */
function formatTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (mins === 0) {
    return `${hours}h`
  }
  return `${hours}h ${mins}m`
}
