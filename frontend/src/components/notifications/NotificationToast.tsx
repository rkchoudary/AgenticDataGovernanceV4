import { useEffect } from 'react'
import { X, AlertCircle, AlertTriangle, Info, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type ToastType = 'info' | 'warning' | 'critical' | 'success'

export interface ToastNotification {
  id: string
  type: ToastType
  title: string
  message: string
  duration?: number
  actionLabel?: string
  onAction?: () => void
}

interface NotificationToastProps {
  notification: ToastNotification
  onDismiss: (id: string) => void
}

const iconMap = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertCircle,
  success: CheckCircle,
}

const styleMap = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-yellow-200 bg-yellow-50 text-yellow-900',
  critical: 'border-red-200 bg-red-50 text-red-900',
  success: 'border-green-200 bg-green-50 text-green-900',
}

const iconStyleMap = {
  info: 'text-blue-500',
  warning: 'text-yellow-500',
  critical: 'text-red-500',
  success: 'text-green-500',
}

export function NotificationToast({ notification, onDismiss }: NotificationToastProps) {
  const { id, type, title, message, duration = 5000, actionLabel, onAction } = notification
  const Icon = iconMap[type]

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => onDismiss(id), duration)
      return () => clearTimeout(timer)
    }
  }, [id, duration, onDismiss])

  return (
    <div
      className={cn(
        'pointer-events-auto w-full max-w-sm rounded-lg border p-4 shadow-lg',
        'animate-in slide-in-from-top-2 fade-in-0',
        styleMap[type]
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', iconStyleMap[type])} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-sm opacity-90">{message}</p>
          {actionLabel && onAction && (
            <Button
              variant="link"
              size="sm"
              className="mt-2 h-auto p-0 text-current underline"
              onClick={onAction}
            >
              {actionLabel}
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0 hover:bg-black/10"
          onClick={() => onDismiss(id)}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  )
}
