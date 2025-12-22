import { useState, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Check, X, MoreHorizontal } from 'lucide-react'

interface SwipeAction {
  icon: React.ElementType
  label: string
  color: string
  bgColor: string
  onAction: () => void
}

interface SwipeableCardProps {
  children: ReactNode
  className?: string
  leftActions?: SwipeAction[]
  rightActions?: SwipeAction[]
  onTap?: () => void
  swipeThreshold?: number
  disabled?: boolean
}

const DEFAULT_LEFT_ACTIONS: SwipeAction[] = [
  {
    icon: Check,
    label: 'Approve',
    color: 'text-white',
    bgColor: 'bg-green-500',
    onAction: () => {},
  },
]

const DEFAULT_RIGHT_ACTIONS: SwipeAction[] = [
  {
    icon: X,
    label: 'Reject',
    color: 'text-white',
    bgColor: 'bg-red-500',
    onAction: () => {},
  },
  {
    icon: MoreHorizontal,
    label: 'More',
    color: 'text-white',
    bgColor: 'bg-gray-500',
    onAction: () => {},
  },
]

/**
 * SwipeableCard - A card component with swipe gesture support
 * Reveals action buttons when swiped left or right
 */
export function SwipeableCard({
  children,
  className,
  leftActions = DEFAULT_LEFT_ACTIONS,
  rightActions = DEFAULT_RIGHT_ACTIONS,
  onTap,
  swipeThreshold = 80,
  disabled = false,
}: SwipeableCardProps) {
  const [translateX, setTranslateX] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const startX = useRef(0)
  const currentX = useRef(0)
  const isDragging = useRef(false)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return
    startX.current = e.touches[0].clientX
    currentX.current = e.touches[0].clientX
    isDragging.current = true
    setIsAnimating(false)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || disabled) return
    
    currentX.current = e.touches[0].clientX
    const diff = currentX.current - startX.current
    
    // Limit the swipe distance
    const maxSwipe = Math.max(leftActions.length, rightActions.length) * 80
    const clampedDiff = Math.max(-maxSwipe, Math.min(maxSwipe, diff))
    
    // Apply resistance at the edges
    const resistance = 0.5
    const resistedDiff = clampedDiff * (1 - Math.abs(clampedDiff) / (maxSwipe * 2) * resistance)
    
    setTranslateX(resistedDiff)
  }

  const handleTouchEnd = () => {
    if (!isDragging.current || disabled) return
    isDragging.current = false
    setIsAnimating(true)

    const diff = currentX.current - startX.current
    
    // Determine if we should snap to an action or reset
    if (Math.abs(diff) < 10 && onTap) {
      // This was a tap, not a swipe
      onTap()
      setTranslateX(0)
      return
    }

    if (diff > swipeThreshold && leftActions.length > 0) {
      // Swiped right - show left actions
      setTranslateX(leftActions.length * 80)
    } else if (diff < -swipeThreshold && rightActions.length > 0) {
      // Swiped left - show right actions
      setTranslateX(-rightActions.length * 80)
    } else {
      // Reset position
      setTranslateX(0)
    }
  }

  const handleActionClick = (action: SwipeAction) => {
    setIsAnimating(true)
    setTranslateX(0)
    action.onAction()
  }

  const resetPosition = () => {
    setIsAnimating(true)
    setTranslateX(0)
  }

  return (
    <div className={cn('relative overflow-hidden rounded-lg', className)}>
      {/* Left actions (revealed when swiping right) */}
      <div className="absolute inset-y-0 left-0 flex">
        {leftActions.map((action, index) => (
          <button
            key={index}
            className={cn(
              'flex flex-col items-center justify-center w-20 h-full',
              'touch-manipulation transition-opacity',
              action.bgColor,
              action.color
            )}
            onClick={() => handleActionClick(action)}
            style={{
              opacity: translateX > 0 ? Math.min(1, translateX / 80) : 0,
            }}
          >
            <action.icon className="h-6 w-6" />
            <span className="text-xs mt-1 font-medium">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Right actions (revealed when swiping left) */}
      <div className="absolute inset-y-0 right-0 flex">
        {rightActions.map((action, index) => (
          <button
            key={index}
            className={cn(
              'flex flex-col items-center justify-center w-20 h-full',
              'touch-manipulation transition-opacity',
              action.bgColor,
              action.color
            )}
            onClick={() => handleActionClick(action)}
            style={{
              opacity: translateX < 0 ? Math.min(1, Math.abs(translateX) / 80) : 0,
            }}
          >
            <action.icon className="h-6 w-6" />
            <span className="text-xs mt-1 font-medium">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div
        className={cn(
          'relative bg-card border border-border',
          isAnimating && 'transition-transform duration-200 ease-out'
        )}
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => translateX !== 0 && resetPosition()}
      >
        {children}
      </div>
    </div>
  )
}

export type { SwipeAction }
