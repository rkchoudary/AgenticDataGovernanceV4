import { cn } from '@/lib/utils'
import { useMobileDetect } from './useMobileDetect'

interface QuickAction {
  id: string
  icon: React.ElementType
  label: string
  color?: string
  bgColor?: string
  onAction: () => void
  disabled?: boolean
}

interface MobileQuickActionsProps {
  actions: QuickAction[]
  className?: string
  variant?: 'horizontal' | 'grid'
}

/**
 * MobileQuickActions - Touch-optimized quick action buttons
 * Provides large touch targets for common actions on mobile
 */
export function MobileQuickActions({
  actions,
  className,
  variant = 'horizontal',
}: MobileQuickActionsProps) {
  const { isMobile } = useMobileDetect()

  if (variant === 'grid') {
    return (
      <div className={cn(
        'grid gap-3',
        isMobile ? 'grid-cols-2' : 'grid-cols-4',
        className
      )}>
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={action.onAction}
            disabled={action.disabled}
            className={cn(
              'flex flex-col items-center justify-center',
              'p-4 rounded-xl border border-border',
              'touch-manipulation transition-all duration-150',
              'active:scale-95 active:opacity-90',
              'hover:bg-accent/50',
              'min-h-[80px]',
              action.disabled && 'opacity-50 cursor-not-allowed',
              action.bgColor || 'bg-card'
            )}
          >
            <action.icon
              className={cn('h-6 w-6 mb-2', action.color || 'text-primary')}
            />
            <span className="text-sm font-medium text-center">{action.label}</span>
          </button>
        ))}
      </div>
    )
  }

  // Horizontal scrollable variant
  return (
    <div className={cn('overflow-x-auto scrollbar-hide', className)}>
      <div className="flex gap-3 pb-2">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={action.onAction}
            disabled={action.disabled}
            className={cn(
              'flex items-center gap-2 px-4 py-3',
              'rounded-full border border-border',
              'touch-manipulation transition-all duration-150',
              'active:scale-95 active:opacity-90',
              'hover:bg-accent/50',
              'whitespace-nowrap flex-shrink-0',
              action.disabled && 'opacity-50 cursor-not-allowed',
              action.bgColor || 'bg-card'
            )}
          >
            <action.icon
              className={cn('h-5 w-5', action.color || 'text-primary')}
            />
            <span className="text-sm font-medium">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Floating action button for mobile
interface FloatingActionButtonProps {
  icon: React.ElementType
  label: string
  onClick: () => void
  className?: string
  position?: 'bottom-right' | 'bottom-center'
}

export function FloatingActionButton({
  icon: Icon,
  label,
  onClick,
  className,
  position = 'bottom-right',
}: FloatingActionButtonProps) {
  const { isMobile } = useMobileDetect()

  if (!isMobile) return null

  const positionStyles = {
    'bottom-right': 'right-4 bottom-20',
    'bottom-center': 'left-1/2 -translate-x-1/2 bottom-20',
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'fixed z-40',
        'flex items-center justify-center',
        'w-14 h-14 rounded-full',
        'bg-primary text-primary-foreground',
        'shadow-lg',
        'touch-manipulation transition-transform duration-150',
        'active:scale-90',
        positionStyles[position],
        className
      )}
      aria-label={label}
    >
      <Icon className="h-6 w-6" />
    </button>
  )
}

export type { QuickAction }
