import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Edit,
  AlertTriangle,
  User,
  Calendar,
  FileText,
  GitBranch,
  Clock,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Paperclip,
  TrendingUp,
  Target,
  History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useIssue, type Issue } from '@/hooks/useIssues'
import { cn } from '@/lib/utils'

type TabId = 'details' | 'rootCause' | 'similar' | 'timeline'

interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

const tabs: Tab[] = [
  { id: 'details', label: 'Details', icon: <FileText className="h-4 w-4" /> },
  { id: 'rootCause', label: 'Root Cause', icon: <Target className="h-4 w-4" /> },
  { id: 'similar', label: 'Similar Issues', icon: <GitBranch className="h-4 w-4" /> },
  { id: 'timeline', label: 'Timeline', icon: <History className="h-4 w-4" /> },
]

// Mock data for similar issues
const mockSimilarIssues = [
  { id: 'sim-1', title: 'Missing values in Q3 data', similarity: 85, status: 'resolved' },
  { id: 'sim-2', title: 'Data format inconsistency in balance field', similarity: 72, status: 'closed' },
  { id: 'sim-3', title: 'Null values in customer ID', similarity: 68, status: 'resolved' },
]

// Mock timeline events
const mockTimelineEvents = [
  { id: '1', type: 'created', actor: 'System', timestamp: '2024-12-10T09:00:00Z', description: 'Issue created automatically from DQ rule failure' },
  { id: '2', type: 'assigned', actor: 'John Smith', timestamp: '2024-12-10T10:30:00Z', description: 'Assigned to Jane Doe' },
  { id: '3', type: 'comment', actor: 'Jane Doe', timestamp: '2024-12-10T14:00:00Z', description: 'Investigating the root cause' },
  { id: '4', type: 'status_change', actor: 'Jane Doe', timestamp: '2024-12-11T09:00:00Z', description: 'Status changed from Open to In Progress' },
  { id: '5', type: 'comment', actor: 'Jane Doe', timestamp: '2024-12-12T11:00:00Z', description: 'Found the issue - upstream data source has missing records' },
]


// Mock root cause suggestions
const mockRootCauseSuggestions = [
  { id: '1', cause: 'Upstream data source has missing records for the reporting period', confidence: 92, category: 'Data Source' },
  { id: '2', cause: 'ETL job failed to process all records due to timeout', confidence: 78, category: 'Processing' },
  { id: '3', cause: 'Schema change in source system not reflected in mapping', confidence: 65, category: 'Schema' },
]

export function IssueDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('details')

  const { data: issue, isLoading } = useIssue(id || '')

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading issue details...</p>
      </div>
    )
  }

  if (!issue) {
    return (
      <div className="p-6 flex flex-col items-center justify-center">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Issue not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/issues')}>
          Back to Issues
        </Button>
      </div>
    )
  }

  const getSeverityBadge = (severity: Issue['severity']) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-700 border-red-200',
      high: 'bg-orange-100 text-orange-700 border-orange-200',
      medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      low: 'bg-blue-100 text-blue-700 border-blue-200',
    }
    return (
      <span className={cn('px-3 py-1 rounded-full text-sm font-medium border capitalize', colors[severity])}>
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
      <span className={cn('px-3 py-1 rounded-full text-sm font-medium border capitalize', colors[status])}>
        {status.replace('_', ' ')}
      </span>
    )
  }

  const getAgeDisplay = (createdAt: string) => {
    const created = new Date(createdAt)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return '1 day ago'
    return `${diffDays} days ago`
  }


  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/issues')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{issue.title}</h1>
            {getSeverityBadge(issue.severity)}
            {getStatusBadge(issue.status)}
          </div>
          <p className="text-muted-foreground mt-1">
            Created {getAgeDisplay(issue.createdAt)} • Last updated {new Date(issue.updatedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          {(issue.status === 'open' || issue.status === 'in_progress') && (
            <Button onClick={() => navigate(`/issues/${issue.id}/resolve`)}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Resolve
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Assignee</p>
                <p className="text-lg font-medium">{issue.assignee || 'Unassigned'}</p>
              </div>
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Impacted Reports</p>
                <p className="text-lg font-medium">{issue.impactedReports.length}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Impacted CDEs</p>
                <p className="text-lg font-medium">{issue.impactedCDEs.length}</p>
              </div>
              <Target className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Age</p>
                <p className="text-lg font-medium">{getAgeDisplay(issue.createdAt)}</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'details' && <DetailsTab issue={issue} />}
        {activeTab === 'rootCause' && <RootCauseTab issue={issue} suggestions={mockRootCauseSuggestions} />}
        {activeTab === 'similar' && <SimilarIssuesTab similarIssues={mockSimilarIssues} />}
        {activeTab === 'timeline' && <TimelineTab events={mockTimelineEvents} />}
      </div>
    </div>
  )
}

function DetailsTab({ issue }: { issue: Issue }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Description</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{issue.description}</p>
          {issue.rootCause && (
            <div className="mt-4">
              <p className="text-sm font-medium text-muted-foreground">Root Cause</p>
              <p className="mt-1">{issue.rootCause}</p>
            </div>
          )}
          {issue.resolution && (
            <div className="mt-4">
              <p className="text-sm font-medium text-muted-foreground">Resolution</p>
              <p className="mt-1">{issue.resolution}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Impact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Impacted Reports</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {issue.impactedReports.length > 0 ? (
                issue.impactedReports.map((report) => (
                  <span key={report} className="px-2 py-1 bg-muted rounded-md text-sm">
                    {report}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground text-sm">None</span>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Impacted CDEs</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {issue.impactedCDEs.length > 0 ? (
                issue.impactedCDEs.map((cde) => (
                  <span key={cde} className="px-2 py-1 bg-muted rounded-md text-sm">
                    {cde}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground text-sm">None</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


function RootCauseTab({ issue, suggestions }: { issue: Issue; suggestions: typeof mockRootCauseSuggestions }) {
  return (
    <div className="space-y-6">
      {issue.rootCause && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Confirmed Root Cause</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium text-green-800">{issue.rootCause}</p>
                <p className="text-sm text-green-600 mt-1">Confirmed by analysis</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">AI-Suggested Root Causes</CardTitle>
          <CardDescription>Based on historical issue patterns and data analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion.id}
                className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-medium">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{suggestion.cause}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-sm text-muted-foreground">
                      Category: {suggestion.category}
                    </span>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{suggestion.confidence}% confidence</span>
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Confirm
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SimilarIssuesTab({ similarIssues }: { similarIssues: typeof mockSimilarIssues }) {
  const navigate = useNavigate()

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'closed':
        return <XCircle className="h-4 w-4 text-gray-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Similar Issues</CardTitle>
        <CardDescription>Issues with similar patterns that may provide resolution insights</CardDescription>
      </CardHeader>
      <CardContent>
        {similarIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No similar issues found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {similarIssues.map((similar) => (
              <div
                key={similar.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/issues/${similar.id}`)}
              >
                <div className="flex items-center gap-4">
                  {getStatusIcon(similar.status)}
                  <div>
                    <p className="font-medium">{similar.title}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {similar.status}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${similar.similarity}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-12 text-right">
                    {similar.similarity}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}


function TimelineTab({ events }: { events: typeof mockTimelineEvents }) {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'created':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'assigned':
        return <User className="h-4 w-4 text-blue-500" />
      case 'comment':
        return <MessageSquare className="h-4 w-4 text-gray-500" />
      case 'status_change':
        return <TrendingUp className="h-4 w-4 text-green-500" />
      case 'attachment':
        return <Paperclip className="h-4 w-4 text-purple-500" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Activity Timeline</CardTitle>
        <CardDescription>Complete history of issue activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
          
          <div className="space-y-6">
            {events.map((event) => (
              <div key={event.id} className="relative flex gap-4 pl-10">
                {/* Timeline dot */}
                <div className="absolute left-0 w-8 h-8 rounded-full bg-background border-2 border-border flex items-center justify-center">
                  {getEventIcon(event.type)}
                </div>
                
                <div className="flex-1 pb-6">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{event.actor}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{event.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default IssueDetail
