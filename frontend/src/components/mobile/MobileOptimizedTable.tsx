import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { TouchCard } from './TouchCard'
import { useMobileDetect } from './useMobileDetect'

interface Column<T> {
  key: keyof T | string
  header: string
  render?: (item: T) => ReactNode
  mobileHidden?: boolean
  mobilePriority?: number // Lower number = higher priority on mobile
}

interface MobileOptimizedTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyExtractor: (item: T) => string
  onRowClick?: (item: T) => void
  emptyMessage?: string
  isLoading?: boolean
  className?: string
}

/**
 * MobileOptimizedTable - A responsive table that transforms into cards on mobile
 * Shows simplified views on mobile with horizontal scroll for tables
 */
export function MobileOptimizedTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyExtractor,
  onRowClick,
  emptyMessage = 'No data available',
  isLoading = false,
  className,
}: MobileOptimizedTableProps<T>) {
  const { isMobile } = useMobileDetect()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  // Mobile card view
  if (isMobile) {
    const mobileColumns = columns
      .filter((col) => !col.mobileHidden)
      .sort((a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99))
      .slice(0, 4) // Show max 4 fields on mobile

    return (
      <div className={cn('space-y-3', className)}>
        {data.map((item) => (
          <TouchCard
            key={keyExtractor(item)}
            onTap={() => onRowClick?.(item)}
            variant="outlined"
            size="md"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 space-y-1">
                {mobileColumns.map((col, index) => {
                  const value = col.render
                    ? col.render(item)
                    : String(item[col.key as keyof T] ?? '')

                  return (
                    <div
                      key={String(col.key)}
                      className={cn(
                        index === 0
                          ? 'font-medium text-foreground'
                          : 'text-sm text-muted-foreground'
                      )}
                    >
                      {index > 0 && (
                        <span className="text-xs text-muted-foreground mr-1">
                          {col.header}:
                        </span>
                      )}
                      {value}
                    </div>
                  )
                })}
              </div>
              {onRowClick && (
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
              )}
            </div>
          </TouchCard>
        ))}
      </div>
    )
  }

  // Desktop table view with horizontal scroll
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className="border-b">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className="text-left py-3 px-3 font-medium text-muted-foreground text-sm"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr
              key={keyExtractor(item)}
              className={cn(
                'border-b transition-colors',
                onRowClick && 'hover:bg-muted/50 cursor-pointer'
              )}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <td key={String(col.key)} className="py-3 px-3">
                  {col.render
                    ? col.render(item)
                    : String(item[col.key as keyof T] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export type { Column }
