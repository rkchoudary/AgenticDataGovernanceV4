import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

interface QualityGaugeProps {
  value: number
  size?: number
  showLabel?: boolean
}

export function QualityGauge({
  value,
  size = 200,
  showLabel = true,
}: QualityGaugeProps) {
  const normalizedValue = Math.min(100, Math.max(0, value))
  
  const data = [
    { name: 'value', value: normalizedValue },
    { name: 'remaining', value: 100 - normalizedValue },
  ]

  const getColor = (score: number): string => {
    if (score >= 80) return '#22c55e' // green
    if (score >= 60) return '#f59e0b' // yellow/amber
    return '#ef4444' // red
  }

  const getLabel = (score: number): string => {
    if (score >= 90) return 'Excellent'
    if (score >= 80) return 'Good'
    if (score >= 70) return 'Fair'
    if (score >= 60) return 'Needs Attention'
    return 'Critical'
  }

  const color = getColor(normalizedValue)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            startAngle={180}
            endAngle={0}
            innerRadius="60%"
            outerRadius="80%"
            paddingAngle={0}
            dataKey="value"
          >
            <Cell fill={color} />
            <Cell fill="hsl(var(--muted))" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      
      {/* Center label */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ paddingTop: size * 0.1 }}
      >
        <span className="text-4xl font-bold" style={{ color }}>
          {normalizedValue.toFixed(0)}%
        </span>
        {showLabel && (
          <span className="text-sm text-muted-foreground mt-1">
            {getLabel(normalizedValue)}
          </span>
        )}
      </div>
    </div>
  )
}
