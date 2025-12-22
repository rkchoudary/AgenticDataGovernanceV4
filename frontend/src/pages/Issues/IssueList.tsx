import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  ArrowUpDown,
  AlertTriangle,
  Filter,
  User,
  Calendar,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useIssues, type Issue } from '@/hooks/useIssues'
import { cn } from '@/lib/utils'

type SortField = 'title' | 'severity' | 'status' | 'createdAt' | 'updatedAt'
type SortOrder = 'asc' | 'desc'

interface IssueFilters {
  search: string
  severity: string
  status: string
  assignee: string
}

const severityOrder: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

const statusOrder: Record<string, number> = {
  open: 4,
  in_progress: 3,
  resolved: 2,
  closed: 1,
}

export function IssueList() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<IssueFilters>({
    search: '',
    severity: 'all',
    status: 'all',
    assignee: 'all',
  })
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const { data: issuesData, isLoading } = useIssues({
    search: filters.search || undefined,
    severity: filters.severity !== 'all' ? filters.severity : undefined,
    status: filters.status !== 'all' ? filters.status : undefined,
    assignee: filters.assignee !== 'all' ? filters.assignee : undefined,
  })


  // Get unique assignees for filter dropdown
  const uniqueAssignees = useMemo(() => {
    if (!issuesData?.items) return []
    const assignees = new Set<string>()
    issuesData.items.forEach((issue) => {
      if (issue.assignee) assignees.add(issue.assignee)
    })
    return Array.from(assignees)
  }, [issuesData?.items])

  const sortedIssues = useMemo(() => {
    if (!issuesData?.items) return []
    return [...issuesData.items].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
        case 'severity':
          comparison = (severityOrder[a.severity] || 0) - (severityOrder[b.severity] || 0)
          break
        case 'status':
          comparison = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0)
          break
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [issuesData?.items, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const getSeverityBadge = (severity: Issue['severity']) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-700 border-red-200',
      high: 'bg-orange-100 text-orange-700 border-orange-200',
      medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      low: 'bg-blue-100 text-blue-700 border-blue-200',
    }
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium border capitalize', colors[severity])}>
        {severity}
      </span>
    )
  }

  const getStatusBadge = (status: Issue['status']) => {
    const colors: Record<string, string> = {
      open: 'bg-red-100 text-red-700 border-red-200',
      in_progress: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      resolved: 'bg-green-100 text-green-700 border-green-200',
      closed: 'bg-gray-100 text-gray-700 border-gray-200',
    }
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium border capitalize', colors[status])}>
        {status.replace('_', ' ')}
      </span>
    )
  }

  const getAgeDisplay = (createdAt: string) => {
    const created = new Date(createdAt)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return '1 day'
    if (diffDays < 7) return `${diffDays} days`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks`
    return `${Math.floor(diffDays / 30)} months`
  }


  // Summary stats
  const stats = useMemo(() => {
    if (!issuesData?.items) return { total: 0, critical: 0, open: 0, avgAge: 0 }
    const items = issuesData.items
    const critical = items.filter((i) => i.severity === 'critical').length
    const open = items.filter((i) => i.status === 'open' || i.status === 'in_progress').length
    const totalAge = items.reduce((sum, i) => {
      const days = Math.floor((Date.now() - new Date(i.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      return sum + days
    }, 0)
    return {
      total: items.length,
      critical,
      open,
      avgAge: items.length > 0 ? Math.round(totalAge / items.length) : 0,
    }
  }, [issuesData?.items])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Issue Management</h1>
          <p className="text-muted-foreground">
            Track and resolve data quality issues
          </p>
        </div>
        <Button onClick={() => navigate('/issues/new')}>
          <AlertTriangle className="h-4 w-4 mr-2" />
          Create Issue
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Issues</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Issues</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.open}</p>
              </div>
              <Filter className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Age (days)</p>
                <p className="text-2xl font-bold">{stats.avgAge}</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search issues by title or description..."
                className="w-full pl-10 pr-4 py-2 border rounded-md bg-background"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
            <Select
              value={filters.severity}
              onValueChange={(value) => setFilters({ ...filters, severity: value })}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value })}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.assignee}
              onValueChange={(value) => setFilters({ ...filters, assignee: value })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignees</SelectItem>
                {uniqueAssignees.map((assignee) => (
                  <SelectItem key={assignee} value={assignee}>
                    {assignee}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>


      {/* Issues Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {issuesData?.total ?? 0} Issues
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading issues...</p>
            </div>
          ) : sortedIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No issues found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('title')}
                      >
                        Title
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('severity')}
                      >
                        Severity
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('status')}
                      >
                        Status
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">Assignee</th>
                    <th className="text-left py-3 px-2">Age</th>
                    <th className="text-left py-3 px-2">Impacted Reports</th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('updatedAt')}
                      >
                        Updated
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedIssues.map((issue) => (
                    <tr
                      key={issue.id}
                      className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/issues/${issue.id}`)}
                    >
                      <td className="py-3 px-2">
                        <div>
                          <p className="font-medium">{issue.title}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-xs">
                            {issue.description}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        {getSeverityBadge(issue.severity)}
                      </td>
                      <td className="py-3 px-2">
                        {getStatusBadge(issue.status)}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{issue.assignee || 'Unassigned'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">
                        {getAgeDisplay(issue.createdAt)}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex flex-wrap gap-1">
                          {issue.impactedReports.slice(0, 2).map((report) => (
                            <span
                              key={report}
                              className="px-2 py-0.5 bg-muted rounded text-xs"
                            >
                              {report}
                            </span>
                          ))}
                          {issue.impactedReports.length > 2 && (
                            <span className="px-2 py-0.5 bg-muted rounded text-xs">
                              +{issue.impactedReports.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">
                        {new Date(issue.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default IssueList
