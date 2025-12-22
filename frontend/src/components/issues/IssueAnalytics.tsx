import { useMemo } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  PieChart,
  Activity,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Issue } from '@/hooks/useIssues'

interface IssueAnalyticsProps {
  issues: Issue[]
  dateRange?: { start: Date; end: Date }
}

interface VelocityData {
  period: string
  opened: number
  resolved: number
  net: number
}

interface ThemeData {
  theme: string
  count: number
}

interface ResolutionTimeData {
  range: string
  count: number
  percentage: number
}

export function IssueAnalytics({ issues, dateRange: _dateRange }: IssueAnalyticsProps) {
  // Calculate velocity data (issues opened vs resolved over time)
  const velocityData = useMemo((): VelocityData[] => {
    const now = new Date()
    const periods: VelocityData[] = []
    
    for (let i = 5; i >= 0; i--) {
      const periodStart = new Date(now)
      periodStart.setMonth(periodStart.getMonth() - i)
      periodStart.setDate(1)
      
      const periodEnd = new Date(periodStart)
      periodEnd.setMonth(periodEnd.getMonth() + 1)
      periodEnd.setDate(0)
      
      const opened = issues.filter((issue) => {
        const created = new Date(issue.createdAt)
        return created >= periodStart && created <= periodEnd
      }).length
      
      const resolved = issues.filter((issue) => {
        if (!issue.resolvedAt) return false
        const resolved = new Date(issue.resolvedAt)
        return resolved >= periodStart && resolved <= periodEnd
      }).length
      
      periods.push({
        period: periodStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        opened,
        resolved,
        net: opened - resolved,
      })
    }
    
    return periods
  }, [issues])


  // Extract recurring themes from issue titles and descriptions
  const themeData = useMemo((): ThemeData[] => {
    const keywords: Record<string, number> = {}
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'with', 'this', 'that'])
    
    issues.forEach((issue) => {
      const text = `${issue.title} ${issue.description}`.toLowerCase()
      const words = text.split(/\W+/).filter((word) => word.length > 3 && !stopWords.has(word))
      
      words.forEach((word) => {
        keywords[word] = (keywords[word] || 0) + 1
      })
    })
    
    return Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([theme, count]) => ({ theme, count }))
  }, [issues])

  // Calculate resolution time distribution
  const resolutionTimeData = useMemo((): ResolutionTimeData[] => {
    const resolvedIssues = issues.filter((i) => i.resolvedAt)
    const ranges = [
      { label: '< 1 day', max: 1 },
      { label: '1-3 days', max: 3 },
      { label: '3-7 days', max: 7 },
      { label: '1-2 weeks', max: 14 },
      { label: '2-4 weeks', max: 28 },
      { label: '> 4 weeks', max: Infinity },
    ]
    
    const distribution = ranges.map((range) => ({
      range: range.label,
      count: 0,
      percentage: 0,
    }))
    
    resolvedIssues.forEach((issue) => {
      const created = new Date(issue.createdAt)
      const resolved = new Date(issue.resolvedAt!)
      const days = Math.ceil((resolved.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
      
      for (let i = 0; i < ranges.length; i++) {
        if (days <= ranges[i].max || i === ranges.length - 1) {
          distribution[i].count++
          break
        }
      }
    })
    
    const total = resolvedIssues.length || 1
    distribution.forEach((d) => {
      d.percentage = Math.round((d.count / total) * 100)
    })
    
    return distribution
  }, [issues])

  // Calculate summary metrics
  const metrics = useMemo(() => {
    const total = issues.length
    const open = issues.filter((i) => i.status === 'open' || i.status === 'in_progress').length
    const resolved = issues.filter((i) => i.status === 'resolved' || i.status === 'closed').length
    const critical = issues.filter((i) => i.severity === 'critical' && i.status !== 'closed').length
    
    const resolvedIssues = issues.filter((i) => i.resolvedAt)
    const avgResolutionTime = resolvedIssues.length > 0
      ? resolvedIssues.reduce((sum, i) => {
          const days = Math.ceil(
            (new Date(i.resolvedAt!).getTime() - new Date(i.createdAt).getTime()) / (1000 * 60 * 60 * 24)
          )
          return sum + days
        }, 0) / resolvedIssues.length
      : 0
    
    // Calculate trend (compare last 30 days to previous 30 days)
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    
    const recentOpen = issues.filter((i) => new Date(i.createdAt) >= thirtyDaysAgo).length
    const previousOpen = issues.filter(
      (i) => new Date(i.createdAt) >= sixtyDaysAgo && new Date(i.createdAt) < thirtyDaysAgo
    ).length
    
    const trend = previousOpen > 0 ? ((recentOpen - previousOpen) / previousOpen) * 100 : 0
    
    return { total, open, resolved, critical, avgResolutionTime: Math.round(avgResolutionTime), trend }
  }, [issues])


  const maxVelocity = Math.max(...velocityData.flatMap((d) => [d.opened, d.resolved]), 1)
  const maxThemeCount = Math.max(...themeData.map((d) => d.count), 1)

  return (
    <div className="space-y-6">
      {/* Summary Metrics */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Issues</p>
                <p className="text-2xl font-bold">{metrics.total}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open</p>
                <p className="text-2xl font-bold text-yellow-600">{metrics.open}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Resolved</p>
                <p className="text-2xl font-bold text-green-600">{metrics.resolved}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Resolution</p>
                <p className="text-2xl font-bold">{metrics.avgResolutionTime}d</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">30-Day Trend</p>
                <div className="flex items-center gap-1">
                  <p className={cn(
                    'text-2xl font-bold',
                    metrics.trend > 0 ? 'text-red-600' : metrics.trend < 0 ? 'text-green-600' : ''
                  )}>
                    {metrics.trend > 0 ? '+' : ''}{Math.round(metrics.trend)}%
                  </p>
                </div>
              </div>
              {metrics.trend > 0 ? (
                <TrendingUp className="h-8 w-8 text-red-500" />
              ) : (
                <TrendingDown className="h-8 w-8 text-green-500" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Velocity Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Issue Velocity
          </CardTitle>
          <CardDescription>
            Issues opened vs resolved over the last 6 months
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Chart Legend */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm">Opened</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm">Resolved</span>
              </div>
            </div>
            
            {/* Bar Chart */}
            <div className="flex items-end gap-4 h-48">
              {velocityData.map((data) => (
                <div key={data.period} className="flex-1 flex flex-col items-center gap-2">
                  <div className="flex gap-1 h-40 items-end">
                    <div
                      className="w-6 bg-red-500 rounded-t transition-all"
                      style={{ height: `${(data.opened / maxVelocity) * 100}%` }}
                      title={`Opened: ${data.opened}`}
                    />
                    <div
                      className="w-6 bg-green-500 rounded-t transition-all"
                      style={{ height: `${(data.resolved / maxVelocity) * 100}%` }}
                      title={`Resolved: ${data.resolved}`}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{data.period}</span>
                </div>
              ))}
            </div>
            
            {/* Net Change */}
            <div className="flex justify-between border-t pt-4">
              {velocityData.map((data) => (
                <div key={data.period} className="text-center flex-1">
                  <span className={cn(
                    'text-sm font-medium',
                    data.net > 0 ? 'text-red-600' : data.net < 0 ? 'text-green-600' : 'text-muted-foreground'
                  )}>
                    {data.net > 0 ? '+' : ''}{data.net}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Word Cloud / Recurring Themes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Recurring Themes
            </CardTitle>
            <CardDescription>
              Most common keywords in issue titles and descriptions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {themeData.map((theme) => {
                const size = Math.max(0.75, (theme.count / maxThemeCount) * 1.5)
                const opacity = Math.max(0.5, theme.count / maxThemeCount)
                return (
                  <span
                    key={theme.theme}
                    className="px-3 py-1 bg-primary/10 text-primary rounded-full transition-all hover:bg-primary/20"
                    style={{
                      fontSize: `${size}rem`,
                      opacity,
                    }}
                    title={`${theme.count} occurrences`}
                  >
                    {theme.theme}
                  </span>
                )
              })}
            </div>
            {themeData.length === 0 && (
              <p className="text-muted-foreground text-center py-4">
                Not enough data to identify themes
              </p>
            )}
          </CardContent>
        </Card>


        {/* Resolution Time Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Resolution Time Distribution
            </CardTitle>
            <CardDescription>
              How long it takes to resolve issues
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {resolutionTimeData.map((data) => (
                <div key={data.range} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{data.range}</span>
                    <span className="text-muted-foreground">
                      {data.count} ({data.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        data.range.includes('< 1') || data.range.includes('1-3')
                          ? 'bg-green-500'
                          : data.range.includes('3-7') || data.range.includes('1-2')
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      )}
                      style={{ width: `${data.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Severity Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Severity Distribution</CardTitle>
          <CardDescription>
            Breakdown of issues by severity level
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {(['critical', 'high', 'medium', 'low'] as const).map((severity) => {
              const count = issues.filter((i) => i.severity === severity).length
              const percentage = issues.length > 0 ? Math.round((count / issues.length) * 100) : 0
              const colors: Record<string, { bg: string; text: string; bar: string }> = {
                critical: { bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-500' },
                high: { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-500' },
                medium: { bg: 'bg-yellow-50', text: 'text-yellow-700', bar: 'bg-yellow-500' },
                low: { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500' },
              }
              
              return (
                <div
                  key={severity}
                  className={cn('p-4 rounded-lg', colors[severity].bg)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn('font-medium capitalize', colors[severity].text)}>
                      {severity}
                    </span>
                    <span className={cn('text-2xl font-bold', colors[severity].text)}>
                      {count}
                    </span>
                  </div>
                  <div className="h-2 bg-white/50 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', colors[severity].bar)}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className={cn('text-sm mt-1', colors[severity].text)}>
                    {percentage}% of total
                  </p>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default IssueAnalytics
