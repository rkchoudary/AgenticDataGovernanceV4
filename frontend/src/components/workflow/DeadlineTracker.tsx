import { useEffect, useState } from 'react'
import { format, differenceInDays, differenceInHours } from 'date-fns'
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Timer,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface Deadline {
  id: string
  title: string
  description?: string
  dueDate: string
  type: 'submission' | 'review' | 'approval' | 'task'
  status: 'upcoming' | 'due_soon' | 'overdue' | 'completed'
  cycleId?: string
  reportName?: string
  notificationThresholds?: number[] // days before due date to notify
}

interface DeadlineTrackerProps {
  deadlines: Deadline[]
  onDeadlineClick?: (deadline: Deadline) => void
  onSetReminder?: (deadline: Deadline) => void
  showCompleted?: boolean
  className?: string
}

interface CountdownTime {
  days: number
  hours: number
  minutes: number
  seconds: number
  isOverdue: boolean
}

function useCountdown(targetDate: string): CountdownTime {
  const [countdown, setCountdown] = useState<CountdownTime>(() =>
    calculateCountdown(targetDate)
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(calculateCountdown(targetDate))
    }, 1000)

    return () => clearInterval(interval)
  }, [targetDate])

  return countdown
}

function calculateCountdown(targetDate: string): CountdownTime {
  const now = new Date()
  const target = new Date(targetDate)
  const diff = target.getTime() - now.getTime()
  const isOverdue = diff < 0
  const absDiff = Math.abs(diff)

  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((absDiff % (1000 * 60)) / 1000)

  return { days, hours, minutes, seconds, isOverdue }
}

function CountdownDisplay({ targetDate }: { targetDate: string }) {
  const { days, hours, minutes, seconds, isOverdue } = useCountdown(targetDate)

  return (
    <div
      className={cn(
        'flex items-center gap-1 font-mono text-sm',
        isOverdue ? 'text-red-500' : 'text-foreground'
      )}
    >
      {isOverdue && <span className="mr-1">-</span>}
      {days > 0 && (
        <>
          <span className="bg-muted px-2 py-1 rounded">{days}d</span>
          <span className="text-muted-foreground">:</span>
        </>
      )}
      <span className="bg-muted px-2 py-1 rounded">
        {hours.toString().padStart(2, '0')}h
      </span>
      <span className="text-muted-foreground">:</span>
      <span className="bg-muted px-2 py-1 rounded">
        {minutes.toString().padStart(2, '0')}m
      </span>
      {days === 0 && (
        <>
          <span className="text-muted-foreground">:</span>
          <span className="bg-muted px-2 py-1 rounded">
            {seconds.toString().padStart(2, '0')}s
          </span>
        </>
      )}
    </div>
  )
}

const typeIcons = {
  submission: Calendar,
  review: Clock,
  approval: CheckCircle2,
  task: Timer,
}

const typeColors = {
  submission: 'text-purple-500 bg-purple-100',
  review: 'text-blue-500 bg-blue-100',
  approval: 'text-green-500 bg-green-100',
  task: 'text-orange-500 bg-orange-100',
}

const statusColors = {
  upcoming: 'border-l-blue-500',
  due_soon: 'border-l-yellow-500',
  overdue: 'border-l-red-500',
  completed: 'border-l-green-500',
}

export function DeadlineTracker({
  deadlines,
  onDeadlineClick,
  onSetReminder,
  showCompleted = false,
  className,
}: DeadlineTrackerProps) {
  const filteredDeadlines = showCompleted
    ? deadlines
    : deadlines.filter((d) => d.status !== 'completed')

  const sortedDeadlines = [...filteredDeadlines].sort((a, b) => {
    // Overdue first, then by due date
    if (a.status === 'overdue' && b.status !== 'overdue') return -1
    if (b.status === 'overdue' && a.status !== 'overdue') return 1
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  })

  const overdueCount = deadlines.filter((d) => d.status === 'overdue').length
  const dueSoonCount = deadlines.filter((d) => d.status === 'due_soon').length

  return (
    <div className={cn('space-y-4', className)}>
      {/* Summary Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold">Upcoming Deadlines</h3>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 text-sm text-red-500 bg-red-100 px-2 py-0.5 rounded-full">
              <AlertTriangle className="h-3 w-3" />
              {overdueCount} overdue
            </span>
          )}
          {dueSoonCount > 0 && (
            <span className="flex items-center gap-1 text-sm text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">
              <Clock className="h-3 w-3" />
              {dueSoonCount} due soon
            </span>
          )}
        </div>
      </div>

      {/* Deadline List */}
      {sortedDeadlines.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p>No upcoming deadlines</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedDeadlines.map((deadline) => {
            const Icon = typeIcons[deadline.type]
            const daysUntil = differenceInDays(
              new Date(deadline.dueDate),
              new Date()
            )
            const hoursUntil = differenceInHours(
              new Date(deadline.dueDate),
              new Date()
            )

            return (
              <Card
                key={deadline.id}
                className={cn(
                  'border-l-4 cursor-pointer hover:shadow-md transition-shadow',
                  statusColors[deadline.status],
                  deadline.status === 'overdue' && 'bg-red-50'
                )}
                onClick={() => onDeadlineClick?.(deadline)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Icon and Info */}
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-full flex items-center justify-center',
                          typeColors[deadline.type]
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-medium">{deadline.title}</h4>
                        {deadline.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {deadline.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="capitalize">{deadline.type}</span>
                          {deadline.reportName && (
                            <>
                              <span>•</span>
                              <span>{deadline.reportName}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>
                            {format(new Date(deadline.dueDate), 'PPP p')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Countdown and Actions */}
                    <div className="flex flex-col items-end gap-2">
                      {deadline.status !== 'completed' && (
                        <CountdownDisplay targetDate={deadline.dueDate} />
                      )}

                      {deadline.status === 'completed' ? (
                        <span className="text-sm text-green-500 flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" />
                          Completed
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          {/* Urgency Indicator */}
                          {deadline.status === 'overdue' && (
                            <span className="text-xs text-red-500 font-medium">
                              {Math.abs(daysUntil)} days overdue
                            </span>
                          )}
                          {deadline.status === 'due_soon' && daysUntil <= 1 && (
                            <span className="text-xs text-yellow-600 font-medium">
                              {hoursUntil <= 0
                                ? 'Due now!'
                                : hoursUntil < 24
                                ? `${hoursUntil}h remaining`
                                : `${daysUntil}d remaining`}
                            </span>
                          )}

                          {/* Reminder Button */}
                          {onSetReminder && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onSetReminder(deadline)
                                  }}
                                >
                                  <Bell className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Set reminder</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notification Thresholds */}
                  {deadline.notificationThresholds &&
                    deadline.notificationThresholds.length > 0 &&
                    deadline.status !== 'completed' && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Bell className="h-3 w-3" />
                          <span>
                            Reminders at:{' '}
                            {deadline.notificationThresholds
                              .sort((a, b) => b - a)
                              .map((d) => `${d}d`)
                              .join(', ')}{' '}
                            before due
                          </span>
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Compact version for dashboard widgets
export function DeadlineWidget({
  deadlines,
  onDeadlineClick,
  maxItems = 5,
  className,
}: {
  deadlines: Deadline[]
  onDeadlineClick?: (deadline: Deadline) => void
  maxItems?: number
  className?: string
}) {
  const activeDeadlines = deadlines
    .filter((d) => d.status !== 'completed')
    .sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1
      if (b.status === 'overdue' && a.status !== 'overdue') return 1
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
    .slice(0, maxItems)

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Timer className="h-5 w-5" />
          Deadlines
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeDeadlines.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No upcoming deadlines
          </p>
        ) : (
          <div className="space-y-3">
            {activeDeadlines.map((deadline) => {
              const daysUntil = differenceInDays(
                new Date(deadline.dueDate),
                new Date()
              )

              return (
                <div
                  key={deadline.id}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors',
                    deadline.status === 'overdue' && 'bg-red-50'
                  )}
                  onClick={() => onDeadlineClick?.(deadline)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        deadline.status === 'overdue' && 'bg-red-500',
                        deadline.status === 'due_soon' && 'bg-yellow-500',
                        deadline.status === 'upcoming' && 'bg-blue-500'
                      )}
                    />
                    <span className="text-sm truncate">{deadline.title}</span>
                  </div>
                  <span
                    className={cn(
                      'text-xs font-medium whitespace-nowrap ml-2',
                      deadline.status === 'overdue' && 'text-red-500',
                      deadline.status === 'due_soon' && 'text-yellow-600',
                      deadline.status === 'upcoming' && 'text-muted-foreground'
                    )}
                  >
                    {deadline.status === 'overdue'
                      ? `${Math.abs(daysUntil)}d overdue`
                      : daysUntil === 0
                      ? 'Today'
                      : daysUntil === 1
                      ? 'Tomorrow'
                      : `${daysUntil}d`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default DeadlineTracker
