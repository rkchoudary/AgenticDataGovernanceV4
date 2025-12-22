import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Clock,
  User,
  Calendar,
  FileCheck,
  History,
  Eye,
  GitCompare,
  CheckCircle2,
  XCircle,
  MessageSquare,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  useApproval,
  useApprovalHistory,
  type ApprovalRequest,
  type ApprovalHistory as ApprovalHistoryType,
  type ArtifactType,
  type UrgencyLevel,
} from '@/hooks/useApprovals'
import { DecisionForm } from '@/components/approvals/DecisionForm'
import { cn } from '@/lib/utils'

type TabType = 'diff' | 'preview' | 'history'

const artifactTypeLabels: Record<ArtifactType, string> = {
  report_catalog: 'Report Catalog',
  cde_inventory: 'CDE Inventory',
  dq_rules: 'DQ Rules',
  lineage_graph: 'Lineage Graph',
  control_matrix: 'Control Matrix',
  compliance_package: 'Compliance Package',
}

export function ApprovalDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('diff')
  const [showDecisionForm, setShowDecisionForm] = useState(false)

  const { data: approval, isLoading } = useApproval(id || '')
  const { data: history } = useApprovalHistory(id || '')

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
      <span className={cn('px-3 py-1.5 rounded-full text-sm font-medium border capitalize flex items-center gap-1.5', color)}>
        {icon}
        {status.replace('_', ' ')}
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading approval details...</p>
      </div>
    )
  }

  if (!approval) {
    return (
      <div className="p-6 flex flex-col items-center justify-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Approval request not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/approvals')}>
          Back to Inbox
        </Button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/approvals')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{approval.artifactName}</h1>
            {getStatusBadge(approval.status)}
          </div>
          <p className="text-muted-foreground">
            {artifactTypeLabels[approval.artifactType]} • Submitted by {approval.requester}
          </p>
        </div>
        {approval.status === 'pending' && (
          <Button onClick={() => setShowDecisionForm(true)}>
            Make Decision
          </Button>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Requester</p>
                <p className="font-medium">{approval.requester}</p>
                <p className="text-xs text-muted-foreground">{approval.requesterEmail}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="font-medium">{new Date(approval.submittedAt).toLocaleDateString()}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(approval.submittedAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Due Date</p>
                <p className="font-medium">
                  {approval.dueDate ? new Date(approval.dueDate).toLocaleDateString() : 'No deadline'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Urgency</p>
                <div className="mt-1">{getUrgencyBadge(approval.urgency)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delegation Info */}
      {approval.delegatedFrom && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-blue-700">
              <User className="h-4 w-4" />
              <span className="text-sm">
                Delegated from <strong>{approval.delegatedFrom}</strong> on{' '}
                {approval.delegatedAt && new Date(approval.delegatedAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          <button
            className={cn(
              'pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              activeTab === 'diff'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('diff')}
          >
            <GitCompare className="h-4 w-4" />
            Changes
          </button>
          <button
            className={cn(
              'pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              activeTab === 'preview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('preview')}
          >
            <Eye className="h-4 w-4" />
            Full Preview
          </button>
          <button
            className={cn(
              'pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              activeTab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveTab('history')}
          >
            <History className="h-4 w-4" />
            History
            {history && history.length > 0 && (
              <span className="bg-muted px-1.5 py-0.5 rounded text-xs">{history.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'diff' && <DiffView approval={approval} />}
        {activeTab === 'preview' && <PreviewView approval={approval} />}
        {activeTab === 'history' && <HistoryView history={history || []} />}
      </div>

      {/* Decision Form Modal */}
      {showDecisionForm && (
        <DecisionForm
          approvalId={approval.id}
          artifactName={approval.artifactName}
          onClose={() => setShowDecisionForm(false)}
          onSuccess={() => {
            setShowDecisionForm(false)
            navigate('/approvals')
          }}
        />
      )}
    </div>
  )
}

// Diff View Component
function DiffView({ approval }: { approval: ApprovalRequest }) {
  if (!approval.changes || approval.changes.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <GitCompare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No changes to display</p>
          <p className="text-sm text-muted-foreground mt-1">
            This is a new artifact without previous versions
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <GitCompare className="h-5 w-5" />
          Changes ({approval.changes.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {approval.changes.map((change, index) => (
            <div key={index} className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 flex items-center justify-between">
                <span className="font-medium">{change.field}</span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium',
                    change.changeType === 'added' && 'bg-green-100 text-green-700',
                    change.changeType === 'modified' && 'bg-yellow-100 text-yellow-700',
                    change.changeType === 'removed' && 'bg-red-100 text-red-700'
                  )}
                >
                  {change.changeType}
                </span>
              </div>
              <div className="grid md:grid-cols-2 divide-x">
                <div className="p-4">
                  <p className="text-xs text-muted-foreground mb-2">Previous Value</p>
                  <div className="bg-red-50 border border-red-200 rounded p-3 font-mono text-sm">
                    {change.oldValue || <span className="text-muted-foreground italic">Empty</span>}
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-xs text-muted-foreground mb-2">New Value</p>
                  <div className="bg-green-50 border border-green-200 rounded p-3 font-mono text-sm">
                    {change.newValue || <span className="text-muted-foreground italic">Empty</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Preview View Component
function PreviewView({ approval }: { approval: ApprovalRequest }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Full Artifact Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Artifact Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Artifact Type</p>
              <p className="font-medium">{artifactTypeLabels[approval.artifactType]}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Artifact ID</p>
              <p className="font-mono text-sm">{approval.artifactId}</p>
            </div>
            {approval.currentVersion && (
              <div>
                <p className="text-sm text-muted-foreground">Current Version</p>
                <p className="font-medium">{approval.currentVersion}</p>
              </div>
            )}
            {approval.previousVersion && (
              <div>
                <p className="text-sm text-muted-foreground">Previous Version</p>
                <p className="font-medium">{approval.previousVersion}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Description */}
          {approval.description && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">Description</p>
              <div className="bg-muted rounded-lg p-4">
                <p className="whitespace-pre-wrap">{approval.description}</p>
              </div>
            </div>
          )}

          {/* Placeholder for actual artifact content */}
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <FileCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Full artifact content would be rendered here based on artifact type
            </p>
            <Button variant="outline" className="mt-4">
              Open in New Tab
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// History View Component
function HistoryView({ history }: { history: ApprovalHistoryType[] }) {
  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No history available</p>
        </CardContent>
      </Card>
    )
  }

  const getActionIcon = (_action: string, decision?: string) => {
    if (decision === 'approve') return <CheckCircle2 className="h-4 w-4 text-green-600" />
    if (decision === 'reject') return <XCircle className="h-4 w-4 text-red-600" />
    if (decision === 'request_changes') return <MessageSquare className="h-4 w-4 text-purple-600" />
    return <ChevronRight className="h-4 w-4 text-muted-foreground" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-5 w-5" />
          Approval History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-6">
            {history.map((entry) => (
              <div key={entry.id} className="relative pl-10">
                {/* Timeline dot */}
                <div className="absolute left-2 top-1 w-5 h-5 rounded-full bg-background border-2 border-border flex items-center justify-center">
                  {getActionIcon(entry.action, entry.decision)}
                </div>

                <div className="bg-muted rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium">{entry.action}</p>
                      <p className="text-sm text-muted-foreground">
                        by {entry.actor} ({entry.actorEmail})
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                  </div>

                  {entry.decision && (
                    <div className="mt-2">
                      <span
                        className={cn(
                          'px-2 py-1 rounded text-xs font-medium',
                          entry.decision === 'approve' && 'bg-green-100 text-green-700',
                          entry.decision === 'reject' && 'bg-red-100 text-red-700',
                          entry.decision === 'request_changes' && 'bg-purple-100 text-purple-700'
                        )}
                      >
                        {entry.decision.replace('_', ' ')}
                      </span>
                    </div>
                  )}

                  {entry.rationale && (
                    <div className="mt-3 p-3 bg-background rounded border">
                      <p className="text-xs text-muted-foreground mb-1">Rationale</p>
                      <p className="text-sm">{entry.rationale}</p>
                    </div>
                  )}

                  {entry.signature && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Digital signature: {entry.signature.substring(0, 20)}...
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default ApprovalDetail
