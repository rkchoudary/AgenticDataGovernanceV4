import { MessageSquare, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface Session {
  id: string
  title: string
  messages: unknown[]
  createdAt: Date
  updatedAt: Date
}

interface SessionListProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  className?: string
}

export function SessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  className,
}: SessionListProps) {
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return (
    <div className={cn('flex flex-col bg-muted/30', className)}>
      <div className="p-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          History
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sortedSessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                'group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors',
                activeSessionId === session.id
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted'
              )}
              onClick={() => onSelectSession(session.id)}
            >
              <MessageSquare className="h-4 w-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {session.title || 'New Chat'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteSession(session.id)
                }}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
