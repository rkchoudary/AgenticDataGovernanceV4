import { useQuery } from '@tanstack/react-query'
import { apiClient, ApiResponse } from '@/api/client'

export interface DashboardKPIs {
  complianceScore: number
  complianceScoreTrend: number
  activeCycles: number
  activeCyclesTrend: number
  openIssues: number
  openIssuesTrend: number
  pendingApprovals: number
  pendingApprovalsTrend: number
}

export interface QualityTrend {
  date: string
  score: number
  completeness: number
  accuracy: number
  timeliness: number
}

export interface IssueBySeverity {
  severity: 'critical' | 'high' | 'medium' | 'low'
  count: number
  trend: number
}

export interface IssueHeatmapData {
  report: string
  domain: string
  count: number
  severity: 'critical' | 'high' | 'medium' | 'low'
}

export interface DashboardFilters {
  dateFrom?: string
  dateTo?: string
  reportId?: string
  jurisdiction?: string
  severity?: string
}

export function useDashboardKPIs(filters?: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'kpis', filters],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<DashboardKPIs>>(
        '/dashboard/kpis',
        { params: filters }
      )
      return response.data.data
    },
    // Provide mock data for development
    placeholderData: {
      complianceScore: 87,
      complianceScoreTrend: 2.5,
      activeCycles: 12,
      activeCyclesTrend: -1,
      openIssues: 23,
      openIssuesTrend: 5,
      pendingApprovals: 8,
      pendingApprovalsTrend: 3,
    },
  })
}

export function useQualityTrends(filters?: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'quality-trends', filters],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<QualityTrend[]>>(
        '/dashboard/quality-trends',
        { params: filters }
      )
      return response.data.data
    },
    placeholderData: generateMockQualityTrends(),
  })
}

export function useIssuesBySeverity(filters?: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'issues-by-severity', filters],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<IssueBySeverity[]>>(
        '/dashboard/issues-by-severity',
        { params: filters }
      )
      return response.data.data
    },
    placeholderData: [
      { severity: 'critical', count: 3, trend: 1 },
      { severity: 'high', count: 8, trend: -2 },
      { severity: 'medium', count: 12, trend: 3 },
      { severity: 'low', count: 5, trend: 0 },
    ] as IssueBySeverity[],
  })
}

export function useIssueHeatmap(filters?: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard', 'issue-heatmap', filters],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<IssueHeatmapData[]>>(
        '/dashboard/issue-heatmap',
        { params: filters }
      )
      return response.data.data
    },
    placeholderData: generateMockHeatmapData(),
  })
}

// Helper functions to generate mock data for development
function generateMockQualityTrends(): QualityTrend[] {
  const trends: QualityTrend[] = []
  const now = new Date()
  
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    trends.push({
      date: date.toISOString().split('T')[0],
      score: 75 + Math.random() * 20,
      completeness: 80 + Math.random() * 15,
      accuracy: 85 + Math.random() * 12,
      timeliness: 70 + Math.random() * 25,
    })
  }
  
  return trends
}

function generateMockHeatmapData(): IssueHeatmapData[] {
  const reports = ['CCAR', 'FR Y-14Q', 'Call Report', 'DFAST', 'LCR']
  const domains = ['Credit Risk', 'Market Risk', 'Liquidity', 'Operations', 'Compliance']
  const severities: Array<'critical' | 'high' | 'medium' | 'low'> = ['critical', 'high', 'medium', 'low']
  
  const data: IssueHeatmapData[] = []
  
  reports.forEach(report => {
    domains.forEach(domain => {
      if (Math.random() > 0.3) {
        data.push({
          report,
          domain,
          count: Math.floor(Math.random() * 10) + 1,
          severity: severities[Math.floor(Math.random() * severities.length)],
        })
      }
    })
  })
  
  return data
}
