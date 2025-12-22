import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface KPICardProps {
  title: string
  value: string | number
  trend?: number
  trendLabel?: string
  icon?: React.ReactNode
  onClick?: () => void
  className?: string
  valueClassName?: string
}

export function KPICard({
  title,
  value,
  trend,
  trendLabel = 'vs last period',
  icon,
  onClick,
  className,
  valueClassName,
}: KPICardProps) {
  const getTrendIcon = () => {
    if (trend === undefined || trend === 0) {
      return <Minus className="h-4 w-4 text-muted-foreground" />
    }
    if (trend > 0) {
      return <TrendingUp className="h-4 w-4 text-green-500" />
    }
    return <TrendingDown className="h-4 w-4 text-red-500" />
  }

  const getTrendColor = () => {
    if (trend === undefined || trend === 0) return 'text-muted-foreground'
    if (trend > 0) return 'text-green-500'
    return 'text-red-500'
  }

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:shadow-md hover:border-primary/50',
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className={cn('text-3xl font-bold', valueClassName)}>{value}</div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 mt-2 text-xs">
            {getTrendIcon()}
            <span className={getTrendColor()}>
              {trend > 0 ? '+' : ''}{trend}%
            </span>
            <span className="text-muted-foreground">{trendLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
