import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

interface KanbanColumnProps {
  id: string
  title: string
  color: string
  count: number
  children: React.ReactNode
}

export function KanbanColumn({
  id,
  title,
  color,
  count,
  children,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col w-72 min-w-72 bg-muted/50 rounded-lg',
        isOver && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      {/* Column Header */}
      <div className="flex items-center gap-2 p-3 border-b">
        <div className={cn('w-3 h-3 rounded-full', color)} />
        <h3 className="font-semibold text-sm flex-1">{title}</h3>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>

      {/* Column Content */}
      <ScrollArea className="flex-1 p-2">
        <div className="flex flex-col gap-2 min-h-[400px]">{children}</div>
      </ScrollArea>
    </div>
  )
}

export default KanbanColumn
