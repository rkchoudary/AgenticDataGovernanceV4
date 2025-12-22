import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { format } from 'date-fns'
import {
  AlertTriangle,
  Calendar,
  GripVertical,
  User,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Phase } from './KanbanBoard'

export interface Task {
  id: string
  title: string
  description?: string
  phase: Phase
  assignee?: {
    id: string
    name: string
    avatar?: string
  }
  dueDate?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'in_progress' | 'blocked' | 'completed'
  issueCount?: number
}

interface TaskCardProps {
  task: Task
  onClick?: () => void
  isDragging?: boolean
}

const priorityColors = {
  low: 'border-l-blue-400',
  medium: 'border-l-yellow-400',
  high: 'border-l-orange-400',
  critical: 'border-l-red-500',
}

const statusBadgeColors = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  blocked: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
}

export function TaskCard({ task, onClick, isDragging }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date()

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'cursor-pointer border-l-4 transition-all hover:shadow-md',
        priorityColors[task.priority],
        isDragging || isSortableDragging
          ? 'opacity-50 shadow-lg rotate-2'
          : 'opacity-100',
        task.status === 'blocked' && 'bg-red-50'
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        {/* Drag Handle & Title */}
        <div className="flex items-start gap-2">
          <button
            className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm truncate">{task.title}</h4>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <div className="mt-2">
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full capitalize',
              statusBadgeColors[task.status]
            )}
          >
            {task.status.replace('_', ' ')}
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t">
          {/* Assignee */}
          {task.assignee ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {task.assignee.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{task.assignee.name}</TooltipContent>
            </Tooltip>
          ) : (
            <div className="h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
              <User className="h-3 w-3 text-muted-foreground/50" />
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Issue Count */}
            {task.issueCount && task.issueCount > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-orange-500">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="text-xs">{task.issueCount}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {task.issueCount} blocking issue{task.issueCount > 1 ? 's' : ''}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Due Date */}
            {task.dueDate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'flex items-center gap-1 text-xs',
                      isOverdue ? 'text-red-500' : 'text-muted-foreground'
                    )}
                  >
                    <Calendar className="h-3 w-3" />
                    <span>{format(new Date(task.dueDate), 'MMM d')}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Due: {format(new Date(task.dueDate), 'PPP')}
                  {isOverdue && ' (Overdue)'}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default TaskCard
