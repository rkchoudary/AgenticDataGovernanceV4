import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { KanbanColumn } from './KanbanColumn'
import { TaskCard, type Task } from './TaskCard'
import { cn } from '@/lib/utils'

export type Phase = 'data_gathering' | 'validation' | 'review' | 'approval' | 'submission'

export interface KanbanBoardProps {
  tasks: Task[]
  onTaskMove?: (taskId: string, newPhase: Phase) => void
  onTaskClick?: (task: Task) => void
  className?: string
}

const PHASES: { id: Phase; title: string; color: string }[] = [
  { id: 'data_gathering', title: 'Data Gathering', color: 'bg-blue-500' },
  { id: 'validation', title: 'Validation', color: 'bg-yellow-500' },
  { id: 'review', title: 'Review', color: 'bg-purple-500' },
  { id: 'approval', title: 'Approval', color: 'bg-orange-500' },
  { id: 'submission', title: 'Submission', color: 'bg-green-500' },
]

export function KanbanBoard({
  tasks,
  onTaskMove,
  onTaskClick,
  className,
}: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const getTasksByPhase = (phase: Phase) => {
    return tasks.filter((task) => task.phase === phase)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id)
    if (task) {
      setActiveTask(task)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const taskId = active.id as string
    const overId = over.id as string

    // Check if dropped on a column
    const targetPhase = PHASES.find((p) => p.id === overId)?.id
    if (targetPhase && onTaskMove) {
      const task = tasks.find((t) => t.id === taskId)
      if (task && task.phase !== targetPhase) {
        onTaskMove(taskId, targetPhase)
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className={cn(
          'flex gap-4 overflow-x-auto pb-4 min-h-[500px]',
          className
        )}
      >
        {PHASES.map((phase) => {
          const phaseTasks = getTasksByPhase(phase.id)
          return (
            <KanbanColumn
              key={phase.id}
              id={phase.id}
              title={phase.title}
              color={phase.color}
              count={phaseTasks.length}
            >
              <SortableContext
                items={phaseTasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {phaseTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => onTaskClick?.(task)}
                  />
                ))}
              </SortableContext>
            </KanbanColumn>
          )
        })}
      </div>

      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}

export default KanbanBoard
