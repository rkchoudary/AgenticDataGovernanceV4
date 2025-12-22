import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TouchCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  onTap?: () => void
  onLongPress?: () => void
  disabled?: boolean
  variant?: 'default' | 'elevated' | 'outlined'
  size?: 'sm' | 'md' | 'lg'
}

/**
 * TouchCard - A touch-optimized card component for mobile interfaces
 * Features larger touch targets, visual feedback, and gesture support
 */
export const TouchCard = forwardRef<HTMLDivElement, TouchCardProps>(
  (
    {
      children,
      className,
      onTap,
      onLongPress,
      disabled = false,
      variant = 'default',
      size = 'md',
      ...props
    },
    ref
  ) => {
    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    let isLongPress = false

    const handleTouchStart = () => {
      if (disabled || !onLongPress) return
      
      isLongPress = false
      longPressTimer = setTimeout(() => {
        isLongPress = true
        onLongPress?.()
      }, 500)
    }

    const handleTouchEnd = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
      
      if (!isLongPress && onTap && !disabled) {
        onTap()
      }
    }

    const handleTouchMove = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
    }

    const variantStyles = {
      default: 'bg-card border border-border',
      elevated: 'bg-card shadow-md',
      outlined: 'bg-transparent border-2 border-border',
    }

    const sizeStyles = {
      sm: 'p-3 min-h-[60px]',
      md: 'p-4 min-h-[80px]',
      lg: 'p-5 min-h-[100px]',
    }

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg transition-all duration-150',
          'touch-manipulation select-none',
          variantStyles[variant],
          sizeStyles[size],
          (onTap || onLongPress) && !disabled && [
            'cursor-pointer',
            'active:scale-[0.98] active:opacity-90',
            'hover:bg-accent/50',
          ],
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onClick={() => !disabled && onTap?.()}
        role={onTap ? 'button' : undefined}
        tabIndex={onTap && !disabled ? 0 : undefined}
        {...props}
      >
        {children}
      </div>
    )
  }
)

TouchCard.displayName = 'TouchCard'
