import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Download,
} from 'lucide-react'
import { KPICard } from '@/components/dashboard/KPICard'
import { TrendChart } from '@/components/charts/TrendChart'
import { QualityGauge } from '@/components/charts/QualityGauge'
import { IssueHeatmap } from '@/components/charts/IssueHeatmap'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useDashboardKPIs,
  useQualityTrends,
  useIssuesBySeverity,
  useIssueHeatmap,
  type DashboardFilters as FilterType,
} from '@/hooks/useDashboard'
import { exportToPDF, exportToCSV } from '@/lib/export'

export function Dashboard() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<FilterType>({})

  const { data: kpis, isLoading: kpisLoading } = useDashboardKPIs(filters)
  const { data: qualityTrends } = useQualityTrends(filters)
  const { data: issuesBySeverity } = useIssuesBySeverity(filters)
  const { data: heatmapData } = useIssueHeatmap(filters)

  const handleExportPDF = () => {
    exportToPDF('dashboard-report', {
      kpis,
      qualityTrends,
      issuesBySeverity,
    })
  }

  const handleExportCSV = () => {
    if (qualityTrends) {
      exportToCSV(qualityTrends, 'quality-trends')
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor your data governance health at a glance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <DashboardFilters filters={filters} onFiltersChange={setFilters} />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Compliance Score"
          value={kpisLoading ? '...' : `${kpis?.complianceScore ?? 0}%`}
          trend={kpis?.complianceScoreTrend}
          icon={<CheckCircle2 className="h-5 w-5" />}
          onClick={() => navigate('/compliance')}
          valueClassName={
            (kpis?.complianceScore ?? 0) >= 80
              ? 'text-green-600'
              : (kpis?.complianceScore ?? 0) >= 60
              ? 'text-yellow-600'
              : 'text-red-600'
          }
        />
        <KPICard
          title="Active Cycles"
          value={kpisLoading ? '...' : kpis?.activeCycles ?? 0}
          trend={kpis?.activeCyclesTrend}
          icon={<Activity className="h-5 w-5" />}
          onClick={() => navigate('/cycles')}
        />
        <KPICard
          title="Open Issues"
          value={kpisLoading ? '...' : kpis?.openIssues ?? 0}
          trend={kpis?.openIssuesTrend}
          icon={<AlertTriangle className="h-5 w-5" />}
          onClick={() => navigate('/issues')}
          valueClassName={
            (kpis?.openIssues ?? 0) > 20
              ? 'text-red-600'
              : (kpis?.openIssues ?? 0) > 10
              ? 'text-yellow-600'
              : 'text-green-600'
          }
        />
        <KPICard
          title="Pending Approvals"
          value={kpisLoading ? '...' : kpis?.pendingApprovals ?? 0}
          trend={kpis?.pendingApprovalsTrend}
          icon={<Clock className="h-5 w-5" />}
          onClick={() => navigate('/approvals')}
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quality Trends Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Quality Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={qualityTrends ?? []} height={300} />
          </CardContent>
        </Card>

        {/* Quality Gauge */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Overall Quality</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <QualityGauge value={kpis?.complianceScore ?? 0} />
          </CardContent>
        </Card>
      </div>

      {/* Issues Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Issues by Severity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Issues by Severity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {issuesBySeverity?.map((item) => (
                <div
                  key={item.severity}
                  className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-2 rounded-md transition-colors"
                  onClick={() => navigate(`/issues?severity=${item.severity}`)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${getSeverityColor(
                        item.severity
                      )}`}
                    />
                    <span className="capitalize font-medium">
                      {item.severity}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold">{item.count}</span>
                    {item.trend !== 0 && (
                      <span
                        className={`text-sm ${
                          item.trend > 0 ? 'text-red-500' : 'text-green-500'
                        }`}
                      >
                        {item.trend > 0 ? '+' : ''}
                        {item.trend}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Issue Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Issue Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <IssueHeatmap data={heatmapData ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'bg-red-500'
    case 'high':
      return 'bg-orange-500'
    case 'medium':
      return 'bg-yellow-500'
    case 'low':
      return 'bg-blue-500'
    default:
      return 'bg-gray-500'
  }
}

export default Dashboard
