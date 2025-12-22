import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { QualityTrend } from '@/hooks/useDashboard'

interface TrendChartProps {
  data: QualityTrend[]
  height?: number
  showLegend?: boolean
}

export function TrendChart({
  data,
  height = 300,
  showLegend = true,
}: TrendChartProps) {
  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'MMM d')
    } catch {
      return dateStr
    }
  }

  const formatTooltipDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'MMM d, yyyy')
    } catch {
      return dateStr
    }
  }

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        No data available
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <Tooltip
          labelFormatter={formatTooltipDate}
          formatter={(value) => [`${Number(value).toFixed(1)}%`, '']}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
        />
        {showLegend && (
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            formatter={(value) => (
              <span className="text-sm capitalize">{value}</span>
            )}
          />
        )}
        <Line
          type="monotone"
          dataKey="score"
          name="Overall Score"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="completeness"
          name="Completeness"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="accuracy"
          name="Accuracy"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="timeliness"
          name="Timeliness"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
