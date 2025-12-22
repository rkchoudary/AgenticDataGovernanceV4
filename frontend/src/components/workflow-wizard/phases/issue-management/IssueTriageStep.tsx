/**
 * IssueTriageStep Component
 * 
 * Step 1 of Issue Management phase - displays issues sorted by severity
 * with AI-suggested priorities for triage.
 * 
 * Requirements: 8.2
 */

import { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  User,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Issue,
  IssueStatus,
  IssueSummary,
  SEVERITY_CONFIG,
  STATUS_CONFIG,
  SOURCE_CONFIG,
  sortIssuesBySeverity,
} from './types'
import { cn } from '@/lib/utils'

// ============================================================================
// Component Props
// ============================================================================

interface IssueTriageStepProps {
  issues: Issue[]
  summary: IssueSummary
  onStatusUpdate: (issueId: string, status: IssueStatus) => void
  onPriorityUpdate: (issueId: string, priority: number) => void
  onAssign: (issueId: string, assigneeId: string, assigneeName: string) => void
  onEscalate: (issueId: string, reason: string) => void
  onSelectIssue: (issueId: string | null) => void
  onComplete: () => void
}

// ============================================================================
// Mock Users for Assignment
// ============================================================================

const MOCK_USERS = [
  { id: 'user-001', name: 'John Smith', role: 'Data Steward' },
  { id: 'user-002', name: 'Jane Doe', role: 'Data Quality Analyst' },
  { id: 'user-003', name: 'Bob Johnson', role: 'Data Engineer' },
  { id: 'user-004', name: 'Alice Williams', role: 'Compliance Officer' },
]

// ============================================================================
// Issue Card Component
// ============================================================================

interface IssueCardProps {
  issue: Issue
  isExpanded: boolean
  onToggleExpand: () => void
  onTriage: () => void
  onAssign: () => void
  onEscalate: () => void
  onAcceptPriority: () => void
}

function IssueCard({
  issue,
  isExpanded,
  onToggleExpand,
  onTriage,
  onAssign,
  onEscalate,
  onAcceptPriority,
}: IssueCardProps) {
  const severityConfig = SEVERITY_CONFIG[issue.severity]
  const statusConfig = STATUS_CONFIG[issue.status]
  const sourceConfig = SOURCE_CONFIG[issue.source]

  const daysUntilDue = issue.dueDate
    ? Math.ceil((new Date(issue.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <Card className={cn(
      'transition-all',
      isExpanded && 'ring-2 ring-primary',
      issue.severity === 'critical' && 'border-l-4 border-l-red-500'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {/* AI Generated Indicator */}
              {issue.isAIGenerated && (
                <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI Detected
                  {issue.aiConfidence && (
                    <span className="ml-1 text-xs">
                      ({Math.round(issue.aiConfidence * 100)}%)
                    </span>
                  )}
                </Badge>
              )}
              
              {/* Severity Badge */}
              <Badge className={cn(severityConfig.bgColor, severityConfig.color)}>
                {severityConfig.label}
              </Badge>
              
              {/* Status Badge */}
              <Badge className={cn(statusConfig.bgColor, statusConfig.color)}>
                {statusConfig.label}
              </Badge>
              
              {/* Source Badge */}
              <Badge variant="outline">
                {sourceConfig.label}
              </Badge>

              {/* Blocking Indicator */}
              {issue.isBlocking && (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Blocking
                </Badge>
              )}
            </div>
            
            <CardTitle className="text-lg">{issue.title}</CardTitle>
            
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {/* Priority */}
              <div className="flex items-center gap-1">
                <span>Priority:</span>
                <span className="font-medium">{issue.priority}</span>
                {issue.aiSuggestedPriority && issue.aiSuggestedPriority !== issue.priority && (
                  <span className="text-purple-600">
                    (AI: {issue.aiSuggestedPriority})
                  </span>
                )}
              </div>
              
              {/* Due Date */}
              {daysUntilDue !== null && (
                <div className={cn(
                  'flex items-center gap-1',
                  daysUntilDue <= 0 && 'text-red-600',
                  daysUntilDue > 0 && daysUntilDue <= 3 && 'text-amber-600'
                )}>
                  <Clock className="h-3 w-3" />
                  {daysUntilDue <= 0 ? 'Overdue' : `${daysUntilDue} days`}
                </div>
              )}
              
              {/* Assignee */}
              {issue.assigneeName && (
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {issue.assigneeName}
                </div>
              )}
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {issue.description}
        </p>
        
        {/* Impacted Items */}
        <div className="flex flex-wrap gap-2 mb-3">
          {issue.impactedCDEs.map(cde => (
            <Badge key={cde} variant="outline" className="text-xs">
              CDE: {cde}
            </Badge>
          ))}
          {issue.impactedReports.map(report => (
            <Badge key={report} variant="outline" className="text-xs">
              Report: {report}
            </Badge>
          ))}
        </div>
        
        {/* Expanded Content */}
        {isExpanded && (
          <div className="space-y-4 pt-3 border-t">
            {/* AI Suggested Priority */}
            {issue.aiSuggestedPriority && (
              <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-purple-700 mb-1">
                  <Sparkles className="h-4 w-4" />
                  AI Priority Suggestion
                </div>
                <p className="text-sm text-purple-900">
                  Suggested priority: <strong>{issue.aiSuggestedPriority}</strong>
                  {issue.aiSuggestedPriority === 1 && ' (Highest - Critical impact on regulatory submission)'}
                  {issue.aiSuggestedPriority === 2 && ' (High - Significant data quality impact)'}
                  {issue.aiSuggestedPriority === 3 && ' (Medium - Moderate impact, can be addressed in sequence)'}
                  {issue.aiSuggestedPriority === 4 && ' (Low - Minor impact, address when resources available)'}
                </p>
              </div>
            )}
            
            {/* Root Cause Suggestions Preview */}
            {issue.rootCauseSuggestions && issue.rootCauseSuggestions.length > 0 && (
              <div className="bg-muted/50 rounded-md p-3">
                <div className="text-sm font-medium mb-2">
                  AI Root Cause Suggestions ({issue.rootCauseSuggestions.length})
                </div>
                <div className="text-sm text-muted-foreground">
                  Top suggestion: {issue.rootCauseSuggestions[0].description}
                  <span className="ml-2 text-purple-600">
                    ({Math.round(issue.rootCauseSuggestions[0].confidence * 100)}% confidence)
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Action Buttons */}
        {issue.status === 'open' && (
          <div className="flex items-center gap-2 pt-3 border-t mt-3">
            {issue.aiSuggestedPriority && (
              <Button
                size="sm"
                variant="default"
                onClick={onAcceptPriority}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Accept AI Priority
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={onTriage}
            >
              Mark Triaged
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onAssign}
            >
              <UserPlus className="h-4 w-4 mr-1" />
              Assign
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={onEscalate}
            >
              <ArrowUpCircle className="h-4 w-4 mr-1" />
              Escalate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function IssueTriageStep({
  issues,
  summary,
  onStatusUpdate,
  onPriorityUpdate,
  onAssign,
  onEscalate,
  onSelectIssue,
  onComplete,
}: IssueTriageStepProps) {
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [escalateDialogOpen, setEscalateDialogOpen] = useState(false)
  const [selectedIssueForAction, setSelectedIssueForAction] = useState<string | null>(null)
  const [selectedAssignee, setSelectedAssignee] = useState<string>('')
  const [escalationReason, setEscalationReason] = useState('')
  const [filterSeverity, setFilterSeverity] = useState<string>('all')

  // Sort and filter issues
  const sortedIssues = sortIssuesBySeverity(issues)
  const filteredIssues = filterSeverity === 'all'
    ? sortedIssues
    : sortedIssues.filter(i => i.severity === filterSeverity)

  // Handle triage
  const handleTriage = (issueId: string) => {
    onStatusUpdate(issueId, 'triaged')
  }

  // Handle accept AI priority
  const handleAcceptPriority = (issue: Issue) => {
    if (issue.aiSuggestedPriority) {
      onPriorityUpdate(issue.id, issue.aiSuggestedPriority)
      onStatusUpdate(issue.id, 'triaged')
    }
  }

  // Handle assign dialog
  const handleAssignClick = (issueId: string) => {
    setSelectedIssueForAction(issueId)
    setSelectedAssignee('')
    setAssignDialogOpen(true)
  }

  // Handle assign confirm
  const handleAssignConfirm = () => {
    if (selectedIssueForAction && selectedAssignee) {
      const user = MOCK_USERS.find(u => u.id === selectedAssignee)
      if (user) {
        onAssign(selectedIssueForAction, user.id, user.name)
        onStatusUpdate(selectedIssueForAction, 'triaged')
      }
      setAssignDialogOpen(false)
      setSelectedIssueForAction(null)
    }
  }

  // Handle escalate dialog
  const handleEscalateClick = (issueId: string) => {
    setSelectedIssueForAction(issueId)
    setEscalationReason('')
    setEscalateDialogOpen(true)
  }

  // Handle escalate confirm
  const handleEscalateConfirm = () => {
    if (selectedIssueForAction && escalationReason.trim()) {
      onEscalate(selectedIssueForAction, escalationReason)
      setEscalateDialogOpen(false)
      setSelectedIssueForAction(null)
    }
  }

  // Check if all open issues have been triaged
  const allTriaged = issues.every(i => i.status !== 'open')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Issue Triage</h2>
        <p className="text-muted-foreground mt-1">
          Review and prioritize issues by severity. Accept AI-suggested priorities or adjust manually.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{summary.totalIssues}</div>
            <div className="text-sm text-muted-foreground">Total Issues</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{summary.criticalIssues}</div>
            <div className="text-sm text-muted-foreground">Critical</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-orange-600">{summary.highIssues}</div>
            <div className="text-sm text-muted-foreground">High</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">{summary.mediumIssues}</div>
            <div className="text-sm text-muted-foreground">Medium</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-600">{summary.lowIssues}</div>
            <div className="text-sm text-muted-foreground">Low</div>
          </CardContent>
        </Card>
      </div>

      {/* Blocking Issues Warning */}
      {summary.blockingIssues > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">
              {summary.blockingIssues} critical issue{summary.blockingIssues !== 1 ? 's' : ''} blocking progression
            </span>
          </div>
          <p className="text-sm text-red-600 mt-1">
            Critical issues must be resolved or escalated before proceeding to the next phase.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          Showing {filteredIssues.length} of {issues.length} issues
        </span>
      </div>

      {/* Issue Cards */}
      <div className="space-y-4">
        {filteredIssues.map(issue => (
          <IssueCard
            key={issue.id}
            issue={issue}
            isExpanded={expandedIssueId === issue.id}
            onToggleExpand={() => {
              setExpandedIssueId(expandedIssueId === issue.id ? null : issue.id)
              onSelectIssue(expandedIssueId === issue.id ? null : issue.id)
            }}
            onTriage={() => handleTriage(issue.id)}
            onAssign={() => handleAssignClick(issue.id)}
            onEscalate={() => handleEscalateClick(issue.id)}
            onAcceptPriority={() => handleAcceptPriority(issue)}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredIssues.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No issues match the current filter.
        </div>
      )}

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Issue</DialogTitle>
            <DialogDescription>
              Select a team member to assign this issue to.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
              <SelectTrigger>
                <SelectValue placeholder="Select assignee" />
              </SelectTrigger>
              <SelectContent>
                {MOCK_USERS.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} - {user.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignConfirm} disabled={!selectedAssignee}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate Issue</DialogTitle>
            <DialogDescription>
              Provide a reason for escalating this issue. This will notify senior management.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter escalation reason..."
              value={escalationReason}
              onChange={(e) => setEscalationReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleEscalateConfirm}
              disabled={!escalationReason.trim()}
            >
              Escalate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Step Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={onComplete}
          disabled={!allTriaged}
        >
          {allTriaged
            ? 'Continue to Root Cause Analysis'
            : `${issues.filter(i => i.status === 'open').length} issues pending triage`}
        </Button>
      </div>
    </div>
  )
}

export default IssueTriageStep

