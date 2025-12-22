import { useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Pause,
  Play,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { Phase } from './KanbanBoard'
import type { Task } from './TaskCard'

export interface CycleDetailProps {
  cycle: {
    id: string
    reportId: string
    reportName: string
    periodEnd: string
    status: 'active' | 'paused' | 'completed' | 'cancelled'
    currentPhase: Phase
    progress: number
    dueDate: string
    createdAt: string
    updatedAt: string
  }
  tasks: Task[]
  issues: {
    id: string
    title: string
    severity: 'critical' | 'high' | 'medium' | 'low'
    status: string
  }[]
  timeline: {
    id: string
    timestamp: string
    action: string
    actor: string
    actorType: 'agent' | 'human' | 'system'
    details?: string
  }[]
  onPause?: () => void
  onResume?: () => void
  onTaskClick?: (task: Task) => void
  onIssueClick?: (issueId: string) => void
}

const phaseLabels: Record<Phase, string> = {
  data_gathering: 'Data Gathering',
  validation: 'Validation',
  review: 'Review',
  approval: 'Approval',
  submission: 'Submission',
}

const phaseOrder: Phase[] = [
  'data_gathering',
  'validation',
  'review',
  'approval',
  'submission',
]

const severityColors = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
}

export function CycleDetail({
  cycle,
  tasks,
  issues,
  timeline,
  onPause,
  onResume,
  onTaskClick,
  onIssueClick,
}: CycleDetailProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'issues' | 'timeline'>(
    'tasks'
  )

  const currentPhaseIndex = phaseOrder.indexOf(cycle.currentPhase)
  const isOverdue = new Date(cycle.dueDate) < new Date()
  const daysUntilDue = Math.ceil(
    (new Date(cycle.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  const tasksByStatus = {
    pending: tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  }

  const criticalIssues = issues.filter((i) => i.severity === 'critical').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <FileText className="h-4 w-4" />
            <span>{cycle.reportName}</span>
            <ChevronRight className="h-4 w-4" />
            <span>Period ending {format(new Date(cycle.periodEnd), 'MMM d, yyyy')}</span>
          </div>
          <h1 className="text-2xl font-bold">Cycle Details</h1>
        </div>
        <div className="flex items-center gap-2">
          {cycle.status === 'active' && onPause && (
            <Button variant="outline" size="sm" onClick={onPause}>
              <Pause className="h-4 w-4 mr-2" />
              Pause Cycle
            </Button>
          )}
          {cycle.status === 'paused' && onResume && (
            <Button variant="outline" size="sm" onClick={onResume}>
              <Play className="h-4 w-4 mr-2" />
              Resume Cycle
            </Button>
          )}
        </div>
      </div>

      {/* Progress Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Progress Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Progress</span>
              <span className="text-2xl font-bold">{cycle.progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={cn(
                  'h-2 rounded-full transition-all',
                  cycle.progress >= 80
                    ? 'bg-green-500'
                    : cycle.progress >= 50
                    ? 'bg-yellow-500'
                    : 'bg-blue-500'
                )}
                style={{ width: `${cycle.progress}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Current Phase Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Current Phase</span>
            </div>
            <p className="text-lg font-semibold">{phaseLabels[cycle.currentPhase]}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Step {currentPhaseIndex + 1} of {phaseOrder.length}
            </p>
          </CardContent>
        </Card>

        {/* Due Date Card */}
        <Card className={cn(isOverdue && 'border-red-500')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Due Date</span>
            </div>
            <p className={cn('text-lg font-semibold', isOverdue && 'text-red-500')}>
              {format(new Date(cycle.dueDate), 'MMM d, yyyy')}
            </p>
            <p
              className={cn(
                'text-xs mt-1',
                isOverdue ? 'text-red-500' : 'text-muted-foreground'
              )}
            >
              {isOverdue
                ? `${Math.abs(daysUntilDue)} days overdue`
                : `${daysUntilDue} days remaining`}
            </p>
          </CardContent>
        </Card>

        {/* Issues Card */}
        <Card className={cn(criticalIssues > 0 && 'border-orange-500')}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Open Issues</span>
            </div>
            <p className="text-lg font-semibold">{issues.length}</p>
            {criticalIssues > 0 && (
              <p className="text-xs text-orange-500 mt-1">
                {criticalIssues} critical
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Phase Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Phase Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {phaseOrder.map((phase, index) => {
              const isCompleted = index < currentPhaseIndex
              const isCurrent = index === currentPhaseIndex
              const isPending = index > currentPhaseIndex

              return (
                <div key={phase} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors',
                        isCompleted && 'bg-green-500 border-green-500 text-white',
                        isCurrent && 'bg-blue-500 border-blue-500 text-white',
                        isPending && 'bg-muted border-muted-foreground/30'
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <span className="text-sm font-medium">{index + 1}</span>
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-xs mt-2 text-center',
                        isCurrent ? 'font-medium' : 'text-muted-foreground'
                      )}
                    >
                      {phaseLabels[phase]}
                    </span>
                  </div>
                  {index < phaseOrder.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-0.5 mx-2',
                        index < currentPhaseIndex ? 'bg-green-500' : 'bg-muted'
                      )}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex gap-4 border-b">
            <button
              className={cn(
                'pb-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'tasks'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('tasks')}
            >
              Tasks ({tasks.length})
            </button>
            <button
              className={cn(
                'pb-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'issues'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('issues')}
            >
              Issues ({issues.length})
            </button>
            <button
              className={cn(
                'pb-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'timeline'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('timeline')}
            >
              Timeline
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              {/* Task Summary */}
              <div className="flex gap-4 text-sm">
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {tasksByStatus.completed}
                  </span>{' '}
                  completed
                </span>
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {tasksByStatus.in_progress}
                  </span>{' '}
                  in progress
                </span>
                {tasksByStatus.blocked > 0 && (
                  <span className="text-red-500">
                    <span className="font-medium">{tasksByStatus.blocked}</span>{' '}
                    blocked
                  </span>
                )}
              </div>

              {/* Task List */}
              <ScrollArea className="h-[300px]">
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => onTaskClick?.(task)}
                    >
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full',
                          task.status === 'completed' && 'bg-green-500',
                          task.status === 'in_progress' && 'bg-blue-500',
                          task.status === 'blocked' && 'bg-red-500',
                          task.status === 'pending' && 'bg-gray-400'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {phaseLabels[task.phase]}
                        </p>
                      </div>
                      {task.assignee && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs">
                                {task.assignee.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')}
                              </AvatarFallback>
                            </Avatar>
                          </TooltipTrigger>
                          <TooltipContent>{task.assignee.name}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {activeTab === 'issues' && (
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {issues.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p>No open issues</p>
                  </div>
                ) : (
                  issues.map((issue) => (
                    <div
                      key={issue.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => onIssueClick?.(issue.id)}
                    >
                      <div
                        className={cn(
                          'w-2 h-2 rounded-full',
                          severityColors[issue.severity]
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{issue.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {issue.severity} • {issue.status}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          )}

          {activeTab === 'timeline' && (
            <ScrollArea className="h-[300px]">
              <div className="space-y-4">
                {timeline.map((event, index) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center',
                          event.actorType === 'human'
                            ? 'bg-blue-100'
                            : event.actorType === 'agent'
                            ? 'bg-purple-100'
                            : 'bg-gray-100'
                        )}
                      >
                        {event.actorType === 'human' ? (
                          <Users className="h-4 w-4 text-blue-600" />
                        ) : event.actorType === 'agent' ? (
                          <Activity className="h-4 w-4 text-purple-600" />
                        ) : (
                          <Clock className="h-4 w-4 text-gray-600" />
                        )}
                      </div>
                      {index < timeline.length - 1 && (
                        <div className="w-0.5 flex-1 bg-muted mt-2" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="font-medium text-sm">{event.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.actor} •{' '}
                        {formatDistanceToNow(new Date(event.timestamp), {
                          addSuffix: true,
                        })}
                      </p>
                      {event.details && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {event.details}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default CycleDetail
