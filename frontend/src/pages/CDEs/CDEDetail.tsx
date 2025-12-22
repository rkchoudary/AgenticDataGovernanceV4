import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Edit,
  Database,
  GitBranch,
  Shield,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Clock,
  AlertCircle,
  User,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useCDE } from '@/hooks/useCDEs'
import { cn } from '@/lib/utils'

type TabId = 'definition' | 'lineage' | 'rules' | 'scores' | 'issues'

interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

const tabs: Tab[] = [
  { id: 'definition', label: 'Definition', icon: <Database className="h-4 w-4" /> },
  { id: 'lineage', label: 'Lineage', icon: <GitBranch className="h-4 w-4" /> },
  { id: 'rules', label: 'Quality Rules', icon: <Shield className="h-4 w-4" /> },
  { id: 'scores', label: 'Scores', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'issues', label: 'Issues', icon: <AlertTriangle className="h-4 w-4" /> },
]

// Mock data for demonstration
const mockLineageNodes = [
  { id: '1', name: 'source_accounts', type: 'source_table' },
  { id: '2', name: 'transform_balance', type: 'transformation' },
  { id: '3', name: 'staging_balances', type: 'staging_table' },
  { id: '4', name: 'report_field_balance', type: 'report_field' },
]

const mockDQRules = [
  { id: '1', name: 'Completeness Check', dimension: 'completeness', threshold: 99, lastResult: 98.5, status: 'warning' },
  { id: '2', name: 'Accuracy Validation', dimension: 'accuracy', threshold: 95, lastResult: 97.2, status: 'pass' },
  { id: '3', name: 'Timeliness Check', dimension: 'timeliness', threshold: 100, lastResult: 100, status: 'pass' },
  { id: '4', name: 'Uniqueness Validation', dimension: 'uniqueness', threshold: 100, lastResult: 99.9, status: 'pass' },
]

const mockScoreHistory = [
  { date: '2024-12-01', score: 92 },
  { date: '2024-12-08', score: 94 },
  { date: '2024-12-15', score: 91 },
]

const mockIssues = [
  { id: '1', title: 'Missing values in Q4 data', severity: 'high', status: 'open', createdAt: '2024-12-10' },
  { id: '2', title: 'Format inconsistency', severity: 'medium', status: 'resolved', createdAt: '2024-12-05' },
]


export function CDEDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabId>('definition')

  const { data: cde, isLoading } = useCDE(id || '')

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading CDE details...</p>
      </div>
    )
  }

  if (!cde) {
    return (
      <div className="p-6 flex flex-col items-center justify-center">
        <Database className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">CDE not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/cdes')}>
          Back to CDEs
        </Button>
      </div>
    )
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'pending_review':
        return <Clock className="h-4 w-4 text-yellow-500" />
      case 'deprecated':
        return <AlertCircle className="h-4 w-4 text-gray-400" />
      default:
        return null
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/cdes')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{cde.name}</h1>
            <div className="flex items-center gap-1">
              {getStatusIcon(cde.status)}
              <span className="text-sm capitalize text-muted-foreground">
                {cde.status.replace('_', ' ')}
              </span>
            </div>
          </div>
          <p className="text-muted-foreground">{cde.description}</p>
        </div>
        <Button variant="outline">
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Criticality Score</p>
                <p className={cn('text-2xl font-bold', getScoreColor(cde.criticalityScore))}>
                  {cde.criticalityScore}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Quality Score</p>
                <p className={cn('text-2xl font-bold', getScoreColor(cde.qualityScore))}>
                  {cde.qualityScore}%
                </p>
              </div>
              <Shield className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Owner</p>
                <p className="text-lg font-medium">{cde.owner || 'Unassigned'}</p>
              </div>
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="text-lg font-medium">
                  {new Date(cde.updatedAt).toLocaleDateString()}
                </p>
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
        {activeTab === 'definition' && (
          <DefinitionTab cde={cde} />
        )}
        {activeTab === 'lineage' && (
          <LineageTab nodes={mockLineageNodes} />
        )}
        {activeTab === 'rules' && (
          <RulesTab rules={mockDQRules} />
        )}
        {activeTab === 'scores' && (
          <ScoresTab history={mockScoreHistory} currentScore={cde.qualityScore} />
        )}
        {activeTab === 'issues' && (
          <IssuesTab issues={mockIssues} />
        )}
      </div>
    </div>
  )
}

function DefinitionTab({ cde }: { cde: any }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Business Definition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Name</p>
            <p>{cde.name}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Description</p>
            <p>{cde.description}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Data Type</p>
            <p>{cde.dataType}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Metadata</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Owner</p>
            <p>{cde.owner || 'Unassigned'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Owner Email</p>
            <p>{cde.ownerEmail || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Related Reports</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {cde.reportIds?.map((reportId: string) => (
                <span
                  key={reportId}
                  className="px-2 py-1 bg-muted rounded-md text-sm"
                >
                  {reportId}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function LineageTab({ nodes }: { nodes: any[] }) {
  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'source_table':
        return <Database className="h-4 w-4" />
      case 'transformation':
        return <GitBranch className="h-4 w-4" />
      case 'staging_table':
        return <Database className="h-4 w-4" />
      case 'report_field':
        return <BarChart3 className="h-4 w-4" />
      default:
        return <Database className="h-4 w-4" />
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Data Lineage</CardTitle>
        <CardDescription>Trace data flow from source to report</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 overflow-x-auto py-4">
          {nodes.map((node, index) => (
            <div key={node.id} className="flex items-center">
              <div className="flex flex-col items-center p-4 border rounded-lg min-w-[150px] hover:bg-muted/50 transition-colors">
                <div className="p-2 bg-muted rounded-full mb-2">
                  {getNodeIcon(node.type)}
                </div>
                <p className="font-medium text-sm text-center">{node.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {node.type.replace('_', ' ')}
                </p>
              </div>
              {index < nodes.length - 1 && (
                <div className="w-8 h-0.5 bg-border mx-2" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}


function RulesTab({ rules }: { rules: any[] }) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pass':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">Pass</span>
      case 'warning':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">Warning</span>
      case 'fail':
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">Fail</span>
      default:
        return null
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Data Quality Rules</CardTitle>
        <CardDescription>Validation rules applied to this CDE</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <Shield className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{rule.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">{rule.dimension}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Threshold</p>
                  <p className="font-medium">{rule.threshold}%</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Last Result</p>
                  <p className="font-medium">{rule.lastResult}%</p>
                </div>
                {getStatusBadge(rule.status)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ScoresTab({ history, currentScore }: { history: any[]; currentScore: number }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Current Quality Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  className="text-muted"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={`${(currentScore / 100) * 352} 352`}
                  className={cn(
                    currentScore >= 80 ? 'text-green-500' :
                    currentScore >= 60 ? 'text-yellow-500' : 'text-red-500'
                  )}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold">{currentScore}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Score History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {history.map((entry, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{entry.date}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        entry.score >= 80 ? 'bg-green-500' :
                        entry.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                      )}
                      style={{ width: `${entry.score}%` }}
                    />
                  </div>
                  <span className="font-medium w-12 text-right">{entry.score}%</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function IssuesTab({ issues }: { issues: any[] }) {
  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-700',
      high: 'bg-orange-100 text-orange-700',
      medium: 'bg-yellow-100 text-yellow-700',
      low: 'bg-blue-100 text-blue-700',
    }
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs capitalize', colors[severity])}>
        {severity}
      </span>
    )
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-red-100 text-red-700',
      in_progress: 'bg-yellow-100 text-yellow-700',
      resolved: 'bg-green-100 text-green-700',
      closed: 'bg-gray-100 text-gray-700',
    }
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs capitalize', colors[status])}>
        {status.replace('_', ' ')}
      </span>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Related Issues</CardTitle>
        <CardDescription>Issues impacting this CDE</CardDescription>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-muted-foreground">No open issues</p>
          </div>
        ) : (
          <div className="space-y-4">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-4">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{issue.title}</p>
                    <p className="text-sm text-muted-foreground">
                      Created {new Date(issue.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getSeverityBadge(issue.severity)}
                  {getStatusBadge(issue.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default CDEDetail
