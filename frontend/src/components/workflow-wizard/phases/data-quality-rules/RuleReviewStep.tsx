/**
 * RuleReviewStep Component
 * 
 * Step 1 of Data Quality Rules phase - displays AI-generated rules as cards
 * with dimension, logic, and threshold. Supports accept/modify/reject actions.
 * 
 * Requirements: 6.2
 */

import { useState } from 'react'
import { 
  CheckCircle, 
  XCircle, 
  Edit, 
  Clock, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  Database,
  FileText,
  GitBranch,
  ArrowRight,
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
  DQRule,
  DQRuleStatus,
  DQRulesSummary,
  DIMENSION_CONFIG,
  RULE_STATUS_CONFIG,
  SEVERITY_CONFIG,
} from './types'

// ============================================================================
// Component Props
// ============================================================================

interface RuleReviewStepProps {
  rules: DQRule[]
  onUpdateStatus: (ruleId: string, status: DQRuleStatus, rejectionReason?: string) => void
  onModifyRule: (ruleId: string, updates: Partial<DQRule>) => void
  summary: DQRulesSummary
  onComplete: () => void
}

// ============================================================================
// Rule Card Component
// ============================================================================

interface RuleCardProps {
  rule: DQRule
  isExpanded: boolean
  onToggleExpand: () => void
  onAccept: () => void
  onModify: () => void
  onReject: () => void
}

function RuleCard({ 
  rule, 
  isExpanded, 
  onToggleExpand, 
  onAccept, 
  onModify, 
  onReject 
}: RuleCardProps) {
  const dimensionConfig = DIMENSION_CONFIG[rule.dimension]
  const statusConfig = RULE_STATUS_CONFIG[rule.status]
  const severityConfig = SEVERITY_CONFIG[rule.severity]

  return (
    <Card className={`transition-all ${isExpanded ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {/* AI Generated Indicator */}
              {rule.isAIGenerated && (
                <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI Generated
                  {rule.aiConfidence && (
                    <span className="ml-1 text-xs">
                      ({Math.round(rule.aiConfidence * 100)}%)
                    </span>
                  )}
                </Badge>
              )}
              
              {/* Dimension Badge */}
              <Badge 
                variant="outline" 
                style={{ 
                  borderColor: dimensionConfig.color,
                  color: dimensionConfig.color,
                  backgroundColor: `${dimensionConfig.color}10`,
                }}
              >
                {dimensionConfig.label}
              </Badge>
              
              {/* Severity Badge */}
              <Badge className={`${severityConfig.bgColor} ${severityConfig.color}`}>
                {severityConfig.label}
              </Badge>
              
              {/* Status Badge */}
              <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
                {statusConfig.label}
              </Badge>
            </div>
            
            <CardTitle className="text-lg">{rule.name}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              CDE: {rule.cdeName}
            </p>
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
          {rule.description}
        </p>
        
        {/* Rule Logic Summary */}
        <div className="bg-muted/50 rounded-md p-3 mb-3">
          <div className="flex items-center gap-2 text-sm font-medium mb-1">
            <Info className="h-4 w-4" />
            Rule Logic
          </div>
          <code className="text-xs bg-background px-2 py-1 rounded">
            {rule.logic.expression}
          </code>
          <p className="text-xs text-muted-foreground mt-1">
            {rule.logic.description}
          </p>
        </div>
        
        {/* Threshold Summary */}
        <div className="flex items-center gap-4 text-sm mb-3">
          <div>
            <span className="text-muted-foreground">Threshold:</span>{' '}
            <span className="font-medium">{rule.threshold.value}%</span>
          </div>
          {rule.threshold.historicalAverage && (
            <div>
              <span className="text-muted-foreground">Historical Avg:</span>{' '}
              <span className="font-medium">{rule.threshold.historicalAverage}%</span>
            </div>
          )}
        </div>
        
        {/* Expanded Content */}
        {isExpanded && (
          <div className="space-y-4 pt-3 border-t">
            {/* AI Rationale */}
            {rule.aiRationale && (
              <div className="bg-purple-50 border border-purple-200 rounded-md p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-purple-700 mb-1">
                  <Sparkles className="h-4 w-4" />
                  AI Rationale
                </div>
                <p className="text-sm text-purple-900">
                  {rule.aiRationale}
                </p>
              </div>
            )}
            
            {/* Impact Preview */}
            {rule.impactPreview && (
              <div className="bg-muted/50 rounded-md p-3">
                <div className="text-sm font-medium mb-2">Impact Preview</div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Records Failing</div>
                    <div className="font-medium">
                      {rule.impactPreview.recordsFailing.toLocaleString()} / {rule.impactPreview.totalRecords.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Failure Rate</div>
                    <div className="font-medium">
                      {rule.impactPreview.failurePercentage.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Trend</div>
                    <div className={`font-medium ${
                      rule.impactPreview.trend === 'improving' ? 'text-green-600' :
                      rule.impactPreview.trend === 'degrading' ? 'text-red-600' :
                      'text-gray-600'
                    }`}>
                      {rule.impactPreview.trend.charAt(0).toUpperCase() + rule.impactPreview.trend.slice(1)}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Rejection Reason (if rejected) */}
            {rule.status === 'rejected' && rule.rejectionReason && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-red-700 mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  Rejection Reason
                </div>
                <p className="text-sm text-red-900">
                  {rule.rejectionReason}
                </p>
              </div>
            )}

            {/* Lineage Information */}
            {rule.lineageInfo && (
              <div className={`rounded-md p-3 border ${
                rule.lineageInfo.hasCompleteLineage 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <GitBranch className={`h-4 w-4 ${
                      rule.lineageInfo.hasCompleteLineage ? 'text-green-600' : 'text-amber-600'
                    }`} />
                    <span className={rule.lineageInfo.hasCompleteLineage ? 'text-green-700' : 'text-amber-700'}>
                      Data Lineage
                    </span>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={rule.lineageInfo.hasCompleteLineage 
                      ? 'border-green-400 text-green-700 bg-green-100' 
                      : 'border-amber-400 text-amber-700 bg-amber-100'
                    }
                  >
                    {rule.lineageInfo.hasCompleteLineage ? 'Complete' : 'Incomplete'}
                  </Badge>
                </div>
                
                {/* Source to Target Flow */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-1">Source Tables</div>
                    <div className="space-y-1">
                      {rule.lineageInfo.sourceNodes.map(node => (
                        <div key={node.nodeId} className="flex items-center gap-2 text-sm">
                          <Database className="h-3.5 w-3.5 text-blue-500" />
                          <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border">
                            {node.nodeName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                  
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-1">Report Fields</div>
                    <div className="space-y-1">
                      {rule.lineageInfo.targetReportFields.length > 0 ? (
                        rule.lineageInfo.targetReportFields.map(field => (
                          <div key={field.nodeId} className="flex items-center gap-2 text-sm">
                            <FileText className="h-3.5 w-3.5 text-green-500" />
                            <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border">
                              {field.reportId} {field.schedule && `(${field.schedule})`}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-amber-600 italic">
                          No report fields mapped
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Lineage Stats */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-dashed">
                  <span>{rule.lineageInfo.upstreamCount} upstream node(s)</span>
                  <span>{rule.lineageInfo.downstreamCount} downstream node(s)</span>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Action Buttons */}
        {rule.status === 'pending' && (
          <div className="flex items-center gap-2 pt-3 border-t mt-3">
            <Button
              size="sm"
              variant="default"
              className="bg-green-600 hover:bg-green-700"
              onClick={onAccept}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onModify}
            >
              <Edit className="h-4 w-4 mr-1" />
              Modify
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={onReject}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
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

export function RuleReviewStep({
  rules,
  onUpdateStatus,
  summary,
  onComplete,
}: RuleReviewStepProps) {
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectingRuleId, setRejectingRuleId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [filterStatus, setFilterStatus] = useState<DQRuleStatus | null>(null)

  // Filter rules
  const filteredRules = rules.filter(rule => {
    if (filterStatus && rule.status !== filterStatus) return false
    return true
  })

  // Handle accept
  const handleAccept = (ruleId: string) => {
    onUpdateStatus(ruleId, 'accepted')
  }

  // Handle modify (for now, just mark as modified)
  const handleModify = (ruleId: string) => {
    onUpdateStatus(ruleId, 'modified')
  }

  // Handle reject dialog open
  const handleRejectClick = (ruleId: string) => {
    setRejectingRuleId(ruleId)
    setRejectionReason('')
    setRejectDialogOpen(true)
  }

  // Handle reject confirm
  const handleRejectConfirm = () => {
    if (rejectingRuleId && rejectionReason.trim()) {
      onUpdateStatus(rejectingRuleId, 'rejected', rejectionReason)
      setRejectDialogOpen(false)
      setRejectingRuleId(null)
      setRejectionReason('')
    }
  }

  // Check if all rules have been reviewed
  const allReviewed = rules.every(r => r.status !== 'pending')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Rule Review</h2>
        <p className="text-muted-foreground mt-1">
          Review AI-generated data quality rules. Accept, modify, or reject each rule.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{summary.totalRules}</div>
            <div className="text-sm text-muted-foreground">Total Rules</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">{summary.pendingRules}</div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{summary.acceptedRules}</div>
            <div className="text-sm text-muted-foreground">Accepted</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{summary.modifiedRules}</div>
            <div className="text-sm text-muted-foreground">Modified</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{summary.rejectedRules}</div>
            <div className="text-sm text-muted-foreground">Rejected</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filterStatus === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus(null)}
        >
          All
        </Button>
        <Button
          variant={filterStatus === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('pending')}
        >
          <Clock className="h-4 w-4 mr-1" />
          Pending
        </Button>
        <Button
          variant={filterStatus === 'accepted' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('accepted')}
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          Accepted
        </Button>
        <Button
          variant={filterStatus === 'modified' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('modified')}
        >
          <Edit className="h-4 w-4 mr-1" />
          Modified
        </Button>
        <Button
          variant={filterStatus === 'rejected' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('rejected')}
        >
          <XCircle className="h-4 w-4 mr-1" />
          Rejected
        </Button>
      </div>

      {/* Rule Cards */}
      <div className="space-y-4">
        {filteredRules.map(rule => (
          <RuleCard
            key={rule.id}
            rule={rule}
            isExpanded={expandedRuleId === rule.id}
            onToggleExpand={() => setExpandedRuleId(
              expandedRuleId === rule.id ? null : rule.id
            )}
            onAccept={() => handleAccept(rule.id)}
            onModify={() => handleModify(rule.id)}
            onReject={() => handleRejectClick(rule.id)}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredRules.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No rules match the current filter.
        </div>
      )}

      {/* Rejection Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Rule</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this rule. This will be recorded for audit purposes.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter rejection reason..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleRejectConfirm}
              disabled={!rejectionReason.trim()}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Step Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={onComplete}
          disabled={!allReviewed}
        >
          {allReviewed ? 'Continue to Threshold Configuration' : `${summary.pendingRules} rules pending review`}
        </Button>
      </div>
    </div>
  )
}

export default RuleReviewStep
