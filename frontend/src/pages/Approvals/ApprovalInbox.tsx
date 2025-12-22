import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  ArrowUpDown,
  Clock,
  FileCheck,
  AlertCircle,
  User,
  Calendar,
  Filter,
  Inbox,
  CheckCircle2,
  XCircle,
  MessageSquare,
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
import { useApprovals, type ApprovalRequest, type ArtifactType, type UrgencyLevel } from '@/hooks/useApprovals'
import { cn } from '@/lib/utils'
import { useMobileDetect } from '@/components/mobile'
import { MobileApprovalInbox } from './MobileApprovalInbox'

type SortField = 'submittedAt' | 'dueDate' | 'urgency' | 'artifactType'
type SortOrder = 'asc' | 'desc'

interface ApprovalFilters {
  search: string
  artifactType: string
  urgency: string
  status: string
}

const urgencyOrder: Record<UrgencyLevel, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
}

const artifactTypeLabels: Record<ArtifactType, string> = {
  report_catalog: 'Report Catalog',
  cde_inventory: 'CDE Inventory',
  dq_rules: 'DQ Rules',
  lineage_graph: 'Lineage Graph',
  control_matrix: 'Control Matrix',
  compliance_package: 'Compliance Package',
}

export function ApprovalInbox() {
  const navigate = useNavigate()
  const { isMobile } = useMobileDetect()
  const [filters, setFilters] = useState<ApprovalFilters>({
    search: '',
    artifactType: 'all',
    urgency: 'all',
    status: 'pending',
  })
  const [sortField, setSortField] = useState<SortField>('submittedAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const { data: approvalsData, isLoading } = useApprovals({
    status: filters.status !== 'all' ? filters.status : undefined,
    artifactType: filters.artifactType !== 'all' ? filters.artifactType : undefined,
    urgency: filters.urgency !== 'all' ? filters.urgency : undefined,
  })

  const filteredAndSortedApprovals = useMemo(() => {
    if (!approvalsData?.items) return []
    
    let items = [...approvalsData.items]
    
    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      items = items.filter(
        (a) =>
          a.artifactName.toLowerCase().includes(searchLower) ||
          a.requester.toLowerCase().includes(searchLower) ||
          a.description?.toLowerCase().includes(searchLower)
      )
    }
    
    // Sort
    items.sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'submittedAt':
          comparison = new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
          break
        case 'dueDate': {
          const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
          const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
          comparison = aDate - bDate
          break
        }
        case 'urgency':
          comparison = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
          break
        case 'artifactType':
          comparison = a.artifactType.localeCompare(b.artifactType)
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
    
    return items
  }, [approvalsData?.items, filters.search, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const getUrgencyBadge = (urgency: UrgencyLevel) => {
    const colors: Record<UrgencyLevel, string> = {
      critical: 'bg-red-100 text-red-700 border-red-200',
      high: 'bg-orange-100 text-orange-700 border-orange-200',
      normal: 'bg-blue-100 text-blue-700 border-blue-200',
      low: 'bg-gray-100 text-gray-700 border-gray-200',
    }
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium border capitalize', colors[urgency])}>
        {urgency}
      </span>
    )
  }

  const getStatusBadge = (status: ApprovalRequest['status']) => {
    const config: Record<string, { color: string; icon: React.ReactNode }> = {
      pending: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: <Clock className="h-3 w-3" /> },
      approved: { color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 className="h-3 w-3" /> },
      rejected: { color: 'bg-red-100 text-red-700 border-red-200', icon: <XCircle className="h-3 w-3" /> },
      changes_requested: { color: 'bg-purple-100 text-purple-700 border-purple-200', icon: <MessageSquare className="h-3 w-3" /> },
    }
    const { color, icon } = config[status] || config.pending
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium border capitalize flex items-center gap-1', color)}>
        {icon}
        {status.replace('_', ' ')}
      </span>
    )
  }

  const getArtifactIcon = (_type: ArtifactType) => {
    return <FileCheck className="h-4 w-4 text-muted-foreground" />
  }

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    
    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  const getDueDateDisplay = (dueDate?: string) => {
    if (!dueDate) return null
    const date = new Date(dueDate)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) {
      return <span className="text-red-600 font-medium">Overdue by {Math.abs(diffDays)} days</span>
    }
    if (diffDays === 0) {
      return <span className="text-orange-600 font-medium">Due today</span>
    }
    if (diffDays === 1) {
      return <span className="text-orange-500">Due tomorrow</span>
    }
    if (diffDays <= 3) {
      return <span className="text-yellow-600">Due in {diffDays} days</span>
    }
    return <span className="text-muted-foreground">Due {date.toLocaleDateString()}</span>
  }

  // Summary stats
  const stats = useMemo(() => {
    if (!approvalsData?.items) return { total: 0, pending: 0, critical: 0, overdue: 0 }
    const items = approvalsData.items
    const pending = items.filter((a) => a.status === 'pending').length
    const critical = items.filter((a) => a.urgency === 'critical' && a.status === 'pending').length
    const overdue = items.filter((a) => {
      if (!a.dueDate || a.status !== 'pending') return false
      return new Date(a.dueDate) < new Date()
    }).length
    return { total: items.length, pending, critical, overdue }
  }, [approvalsData?.items])

  // Use mobile-optimized view on mobile devices
  if (isMobile) {
    return <MobileApprovalInbox />
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Approval Inbox</h1>
          <p className="text-muted-foreground">
            Review and approve governance artifacts
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/approvals/settings')}>
          <Filter className="h-4 w-4 mr-2" />
          Delegation Settings
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
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
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-orange-600">{stats.overdue}</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-500" />
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
                placeholder="Search by artifact name, requester..."
                className="w-full pl-10 pr-4 py-2 border rounded-md bg-background"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="changes_requested">Changes Requested</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.artifactType}
              onValueChange={(value) => setFilters({ ...filters, artifactType: value })}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Artifact Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="report_catalog">Report Catalog</SelectItem>
                <SelectItem value="cde_inventory">CDE Inventory</SelectItem>
                <SelectItem value="dq_rules">DQ Rules</SelectItem>
                <SelectItem value="lineage_graph">Lineage Graph</SelectItem>
                <SelectItem value="control_matrix">Control Matrix</SelectItem>
                <SelectItem value="compliance_package">Compliance Package</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.urgency}
              onValueChange={(value) => setFilters({ ...filters, urgency: value })}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Urgencies</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Approvals List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {filteredAndSortedApprovals.length} Approval Requests
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading approvals...</p>
            </div>
          ) : filteredAndSortedApprovals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No approval requests found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('artifactType')}
                      >
                        Artifact
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">Requester</th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('submittedAt')}
                      >
                        Submitted
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('dueDate')}
                      >
                        Due Date
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('urgency')}
                      >
                        Urgency
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedApprovals.map((approval) => (
                    <tr
                      key={approval.id}
                      className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/approvals/${approval.id}`)}
                    >
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          {getArtifactIcon(approval.artifactType)}
                          <div>
                            <p className="font-medium">{approval.artifactName}</p>
                            <p className="text-sm text-muted-foreground">
                              {artifactTypeLabels[approval.artifactType]}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm">{approval.requester}</p>
                            <p className="text-xs text-muted-foreground">{approval.requesterEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">
                        {getTimeAgo(approval.submittedAt)}
                      </td>
                      <td className="py-3 px-2 text-sm">
                        {getDueDateDisplay(approval.dueDate)}
                      </td>
                      <td className="py-3 px-2">
                        {getUrgencyBadge(approval.urgency)}
                      </td>
                      <td className="py-3 px-2">
                        {getStatusBadge(approval.status)}
                      </td>
                      <td className="py-3 px-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/approvals/${approval.id}`)
                          }}
                        >
                          Review
                        </Button>
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

export default ApprovalInbox
