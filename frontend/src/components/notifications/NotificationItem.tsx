import { formatDistanceToNow } from 'date-fns'
import { AlertCircle, AlertTriangle, Info, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Notification } from '@/hooks/useNotifications'

interface NotificationItemProps {
  notification: Notification
  onMarkAsRead: (id: string) => void
  onNavigate?: (url: string) => void
}

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertCircle,
}

const dotStyleMap = {
  info: 'bg-blue-500',
  warning: 'bg-yellow-500',
  critical: 'bg-red-500',
}

export function NotificationItem({ notification, onMarkAsRead, onNavigate }: NotificationItemProps) {
  const { id, type, title, message, read, actionUrl, createdAt } = notification
  const Icon = iconMap[type]

  const handleClick = () => {
    if (!read) {
      onMarkAsRead(id)
    }
    if (actionUrl && onNavigate) {
      onNavigate(actionUrl)
    }
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer',
        'hover:bg-muted/50',
        !read && 'bg-muted/30'
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
    >
      <div className="relative flex-shrink-0">
        <Icon className={cn('h-5 w-5', {
          'text-blue-500': type === 'info',
          'text-yellow-500': type === 'warning',
          'text-red-500': type === 'critical',
        })} />
        {!read && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full',
            dotStyleMap[type]
          )} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm', !read && 'font-medium')}>{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{message}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </p>
      </div>
      {actionUrl && (
        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
          <ExternalLink className="h-3 w-3" />
          <span className="sr-only">View details</span>
        </Button>
      )}
    </div>
  )
}
