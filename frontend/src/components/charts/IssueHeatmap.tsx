import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { IssueHeatmapData } from '@/hooks/useDashboard'

interface IssueHeatmapProps {
  data: IssueHeatmapData[]
}

export function IssueHeatmap({ data }: IssueHeatmapProps) {
  const navigate = useNavigate()

  const { reports, domains, matrix } = useMemo(() => {
    const reportsSet = new Set<string>()
    const domainsSet = new Set<string>()
    const matrixMap = new Map<string, IssueHeatmapData>()

    data.forEach((item) => {
      reportsSet.add(item.report)
      domainsSet.add(item.domain)
      matrixMap.set(`${item.report}-${item.domain}`, item)
    })

    return {
      reports: Array.from(reportsSet),
      domains: Array.from(domainsSet),
      matrix: matrixMap,
    }
  }, [data])

  const getIntensity = (count: number): string => {
    if (count === 0) return 'bg-muted'
    if (count <= 2) return 'bg-blue-200 dark:bg-blue-900'
    if (count <= 5) return 'bg-yellow-200 dark:bg-yellow-900'
    if (count <= 8) return 'bg-orange-200 dark:bg-orange-900'
    return 'bg-red-200 dark:bg-red-900'
  }

  const getSeverityBorder = (severity?: string): string => {
    switch (severity) {
      case 'critical':
        return 'ring-2 ring-red-500'
      case 'high':
        return 'ring-2 ring-orange-500'
      case 'medium':
        return 'ring-1 ring-yellow-500'
      default:
        return ''
    }
  }

  if (reports.length === 0 || domains.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No issue data available
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[400px]">
        {/* Header row */}
        <div className="flex">
          <div className="w-24 shrink-0" />
          {reports.map((report) => (
            <div
              key={report}
              className="flex-1 text-xs font-medium text-center p-2 truncate"
              title={report}
            >
              {report}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {domains.map((domain) => (
          <div key={domain} className="flex">
            <div
              className="w-24 shrink-0 text-xs font-medium p-2 truncate"
              title={domain}
            >
              {domain}
            </div>
            {reports.map((report) => {
              const cell = matrix.get(`${report}-${domain}`)
              const count = cell?.count ?? 0
              const severity = cell?.severity

              return (
                <Tooltip key={`${report}-${domain}`}>
                  <TooltipTrigger asChild>
                    <div
                      className={`flex-1 aspect-square m-0.5 rounded cursor-pointer transition-all hover:scale-105 flex items-center justify-center ${getIntensity(
                        count
                      )} ${getSeverityBorder(severity)}`}
                      onClick={() =>
                        count > 0 &&
                        navigate(
                          `/issues?report=${encodeURIComponent(
                            report
                          )}&domain=${encodeURIComponent(domain)}`
                        )
                      }
                    >
                      {count > 0 && (
                        <span className="text-xs font-medium">{count}</span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-sm">
                      <div className="font-medium">
                        {report} - {domain}
                      </div>
                      <div>
                        {count} issue{count !== 1 ? 's' : ''}
                        {severity && (
                          <span className="ml-1 capitalize">({severity})</span>
                        )}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center justify-end gap-4 mt-4 text-xs text-muted-foreground">
          <span>Issues:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-muted" />
            <span>0</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-blue-200 dark:bg-blue-900" />
            <span>1-2</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-yellow-200 dark:bg-yellow-900" />
            <span>3-5</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-orange-200 dark:bg-orange-900" />
            <span>6-8</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-red-200 dark:bg-red-900" />
            <span>9+</span>
          </div>
        </div>
      </div>
    </div>
  )
}
