/**
 * StatusReviewStep Component
 * 
 * Step 1 of Controls Management phase - displays a status board
 * with pass/fail indicators for each control.
 * 
 * Requirements: 9.2
 */

import { useState } from 'react'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Building2,
  Workflow,
  Lock,
  GitBranch,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Control,
  ControlSummary,
  ControlType,
  ControlEvidenceOutcome,
  CONTROL_TYPE_CONFIG,
  CONTROL_CATEGORY_CONFIG,
  CONTROL_STATUS_CONFIG,
  EVIDENCE_OUTCOME_CONFIG,
  AUTOMATION_STATUS_CONFIG,
  getLatestEvidence,
} from './types'
import { cn } from '@/lib/utils'

// ============================================================================
// Component Props
// ============================================================================

interface StatusReviewStepProps {
  controls: Control[]
  summary: ControlSummary
  selectedControlId: string | null
  onSelectControl: (controlId: string | null) => void
  onComplete: () => void
}

// ============================================================================
// Icon Mapping
// ============================================================================

const TYPE_ICONS: Record<ControlType, React.ReactNode> = {
  organizational: <Building2 className="h-4 w-4" />,
  process: <Workflow className="h-4 w-4" />,
  access: <Lock className="h-4 w-4" />,
  change_management: <GitBranch className="h-4 w-4" />,
}

const OUTCOME_ICONS: Record<ControlEvidenceOutcome | 'pending', React.ReactNode> = {
  pass: <CheckCircle className="h-5 w-5 text-green-600" />,
  fail: <XCircle className="h-5 w-5 text-red-600" />,
  exception: <AlertTriangle className="h-5 w-5 text-amber-600" />,
  pending: <Clock className="h-5 w-5 text-gray-400" />,
}

// ============================================================================
// Control Card Component
// ============================================================================

interface ControlCardProps {
  control: Control
  isExpanded: boolean
  onToggleExpand: () => void
}

function ControlCard({ control, isExpanded, onToggleExpand }: ControlCardProps) {
  const typeConfig = CONTROL_TYPE_CONFIG[control.type]
  const categoryConfig = CONTROL_CATEGORY_CONFIG[control.category]
  const statusConfig = CONTROL_STATUS_CONFIG[control.status]
  const automationConfig = AUTOMATION_STATUS_CONFIG[control.automationStatus]
  
  const latestEvidence = getLatestEvidence(control)
  const outcomeStatus = latestEvidence?.outcome || 'pending'
  const outcomeConfig = outcomeStatus !== 'pending' 
    ? EVIDENCE_OUTCOME_CONFIG[outcomeStatus]
    : { label: 'Pending Review', color: 'text-gray-600', bgColor: 'bg-gray-100' }

  return (
    <Card className={cn(
      'transition-all',
      isExpanded && 'ring-2 ring-primary',
      outcomeStatus === 'fail' && 'border-l-4 border-l-red-500',
      outcomeStatus === 'exception' && 'border-l-4 border-l-amber-500',
      outcomeStatus === 'pass' && 'border-l-4 border-l-green-500',
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {/* Outcome Indicator */}
              <div className="flex items-center gap-1">
                {OUTCOME_ICONS[outcomeStatus]}
                <span className={cn('text-sm font-medium', outcomeConfig.color)}>
                  {outcomeConfig.label}
                </span>
              </div>
              
              {/* Control Type */}
              <Badge variant="outline" className="flex items-center gap-1">
                {TYPE_ICONS[control.type]}
                {typeConfig.label}
              </Badge>
              
              {/* Category */}
              <Badge className={cn(categoryConfig.bgColor, categoryConfig.color)}>
                {categoryConfig.label}
              </Badge>
              
              {/* Status */}
              <Badge className={cn(statusConfig.bgColor, statusConfig.color)}>
                {statusConfig.label}
              </Badge>
            </div>
            
            <CardTitle className="text-lg">{control.name}</CardTitle>
            
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {/* Owner */}
              {control.ownerName && (
                <span>Owner: {control.ownerName}</span>
              )}
              
              {/* Frequency */}
              <span className="capitalize">{control.frequency}</span>
              
              {/* Automation */}
              <Badge variant="outline" className={cn(automationConfig.bgColor, automationConfig.color)}>
                {automationConfig.label}
              </Badge>
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
          {control.description}
        </p>
        
        {/* Linked Items */}
        {(control.linkedCDEs.length > 0 || control.linkedProcesses.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {control.linkedCDEs.map(cde => (
              <Badge key={cde} variant="outline" className="text-xs">
                CDE: {cde}
              </Badge>
            ))}
            {control.linkedProcesses.map(process => (
              <Badge key={process} variant="outline" className="text-xs">
                Process: {process}
              </Badge>
            ))}
          </div>
        )}
        
        {/* Expanded Content */}
        {isExpanded && (
          <div className="space-y-4 pt-3 border-t">
            {/* Latest Evidence */}
            {latestEvidence ? (
              <div className="bg-muted/50 rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Latest Evidence</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(latestEvidence.executionDate).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm font-medium">{latestEvidence.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {latestEvidence.details}
                </p>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">No evidence collected</span>
                </div>
                <p className="text-sm text-amber-600 mt-1">
                  This control requires evidence to be collected before sign-off.
                </p>
              </div>
            )}
            
            {/* Effectiveness Rating */}
            {control.effectivenessRating !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Effectiveness:</span>
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      control.effectivenessRating >= 90 && 'bg-green-500',
                      control.effectivenessRating >= 70 && control.effectivenessRating < 90 && 'bg-amber-500',
                      control.effectivenessRating < 70 && 'bg-red-500',
                    )}
                    style={{ width: `${control.effectivenessRating}%` }}
                  />
                </div>
                <span className="text-sm font-medium">{control.effectivenessRating}%</span>
              </div>
            )}
            
            {/* Review Info */}
            {control.lastReviewedAt && (
              <div className="text-sm text-muted-foreground">
                Last reviewed: {new Date(control.lastReviewedAt).toLocaleDateString()}
                {control.lastReviewedBy && ` by ${control.lastReviewedBy}`}
              </div>
            )}
            
            {/* Compensating Control Info */}
            {control.status === 'compensating' && control.expirationDate && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">Compensating Control</span>
                </div>
                <p className="text-sm text-amber-600 mt-1">
                  Expires: {new Date(control.expirationDate).toLocaleDateString()}
                </p>
                {control.linkedIssueId && (
                  <p className="text-sm text-amber-600">
                    Linked Issue: {control.linkedIssueId}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function StatusReviewStep({
  controls,
  summary,
  selectedControlId,
  onSelectControl,
  onComplete,
}: StatusReviewStepProps) {
  const [filterType, setFilterType] = useState<string>('all')
  const [filterOutcome, setFilterOutcome] = useState<string>('all')

  // Filter controls
  const filteredControls = controls.filter(control => {
    if (filterType !== 'all' && control.type !== filterType) return false
    
    if (filterOutcome !== 'all') {
      const latestEvidence = getLatestEvidence(control)
      const outcome = latestEvidence?.outcome || 'pending'
      if (outcome !== filterOutcome) return false
    }
    
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Control Status Review</h2>
        <p className="text-muted-foreground mt-1">
          Review the status of all controls. Each control shows pass/fail indicators based on the latest evidence.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{summary.totalControls}</div>
            <div className="text-sm text-muted-foreground">Total Controls</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div className="text-2xl font-bold text-green-600">{summary.passedControls}</div>
            </div>
            <div className="text-sm text-muted-foreground">Passed</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <div className="text-2xl font-bold text-red-600">{summary.failedControls}</div>
            </div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div className="text-2xl font-bold text-amber-600">{summary.exceptionControls}</div>
            </div>
            <div className="text-sm text-muted-foreground">Exceptions</div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gray-400">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-400" />
              <div className="text-2xl font-bold text-gray-600">{summary.pendingReviewControls}</div>
            </div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
      </div>

      {/* Overall Effectiveness */}
      {summary.overallEffectiveness > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Control Effectiveness</span>
              <span className="text-lg font-bold">{summary.overallEffectiveness}%</span>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  summary.overallEffectiveness >= 90 && 'bg-green-500',
                  summary.overallEffectiveness >= 70 && summary.overallEffectiveness < 90 && 'bg-amber-500',
                  summary.overallEffectiveness < 70 && 'bg-red-500',
                )}
                style={{ width: `${summary.overallEffectiveness}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {summary.failedControls > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700">
            <XCircle className="h-5 w-5" />
            <span className="font-medium">
              {summary.failedControls} control{summary.failedControls !== 1 ? 's' : ''} failed
            </span>
          </div>
          <p className="text-sm text-red-600 mt-1">
            Failed controls require immediate attention and evidence collection.
          </p>
        </div>
      )}

      {summary.compensatingControls > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">
              {summary.compensatingControls} compensating control{summary.compensatingControls !== 1 ? 's' : ''} active
            </span>
          </div>
          {summary.expiringCompensatingControls > 0 && (
            <p className="text-sm text-amber-600 mt-1">
              {summary.expiringCompensatingControls} expiring within 30 days - renewal required.
            </p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filter:</span>
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Control Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="organizational">Organizational</SelectItem>
            <SelectItem value="process">Process</SelectItem>
            <SelectItem value="access">Access</SelectItem>
            <SelectItem value="change_management">Change Management</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterOutcome} onValueChange={setFilterOutcome}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Outcomes</SelectItem>
            <SelectItem value="pass">Passed</SelectItem>
            <SelectItem value="fail">Failed</SelectItem>
            <SelectItem value="exception">Exception</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          Showing {filteredControls.length} of {controls.length} controls
        </span>
      </div>

      {/* Control Cards */}
      <div className="space-y-4">
        {filteredControls.map(control => (
          <ControlCard
            key={control.id}
            control={control}
            isExpanded={selectedControlId === control.id}
            onToggleExpand={() => {
              onSelectControl(selectedControlId === control.id ? null : control.id)
            }}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredControls.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No controls match the current filters.
        </div>
      )}

      {/* Complete Step Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete}>
          Continue to Evidence Collection
        </Button>
      </div>
    </div>
  )
}

export default StatusReviewStep
