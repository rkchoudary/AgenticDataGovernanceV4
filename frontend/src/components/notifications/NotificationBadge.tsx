import { cn } from '@/lib/utils'

interface NotificationBadgeProps {
  count: number
  className?: string
  max?: number
}

export function NotificationBadge({ count, className, max = 99 }: NotificationBadgeProps) {
  if (count <= 0) return null

  const displayCount = count > max ? `${max}+` : count.toString()

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        'min-w-[18px] h-[18px] px-1 rounded-full',
        'bg-destructive text-destructive-foreground',
        'text-xs font-medium',
        className
      )}
    >
      {displayCount}
    </span>
  )
}
