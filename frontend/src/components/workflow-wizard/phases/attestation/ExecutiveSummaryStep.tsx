/**
 * ExecutiveSummaryStep Component
 * 
 * Displays key metrics and summary for executive review before attestation.
 * Shows data quality score, issue resolution rate, control pass rate, and deadline status.
 * 
 * Requirements: 11.2
 */

import { useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  BarChart3,
  Shield,
  Target,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  ExecutiveSummary,
  PhaseCompletionSummary,
  DEADLINE_STATUS_CONFIG,
} from './types'

// ============================================================================
// Sub-Components
// ============================================================================

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  status?: 'good' | 'warning' | 'critical'
}

function MetricCard({ title, value, subtitle, icon, trend, status }: MetricCardProps) {
  const statusColors = {
    good: 'border-green-200 bg-green-50',
    warning: 'border-amber-200 bg-amber-50',
    critical: 'border-red-200 bg-red-50',
  }

  const trendIcons = {
    up: <TrendingUp className="h-4 w-4 text-green-600" />,
    down: <TrendingDown className="h-4 w-4 text-red-600" />,
    neutral: null,
  }

  return (
    <Card className={cn('border-2', status && statusColors[status])}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold">{value}</span>
              {trend && trendIcons[trend]}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="p-2 rounded-lg bg-background">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface PhaseCompletionCardProps {
  phase: PhaseCompletionSummary
  isExpanded: boolean
  onToggle: () => void
}

function PhaseCompletionCard({ phase, isExpanded, onToggle }: PhaseCompletionCardProps) {
  const statusConfig = {
    completed: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
    in_progress: { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100' },
    pending: { icon: AlertCircle, color: 'text-gray-400', bg: 'bg-gray-100' },
  }

  const config = statusConfig[phase.status]
  const StatusIcon = config.icon

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
        onClick={onToggle}
      >
        <div className={cn('p-1.5 rounded-full', config.bg)}>
          <StatusIcon className={cn('h-4 w-4', config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{phase.phaseName}</p>
          {phase.completedAt && (
            <p className="text-xs text-muted-foreground">
              Completed {new Date(phase.completedAt).toLocaleDateString()}
            </p>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      
      {isExpanded && phase.keyFindings.length > 0 && (
        <div className="px-3 pb-3 border-t bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mt-2 mb-1">Key Findings:</p>
          <ul className="space-y-1">
            {phase.keyFindings.map((finding, idx) => (
              <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                {finding}
              </li>
            ))}
          </ul>
          {phase.approvalRationale && (
            <div className="mt-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">Approval Rationale:</p>
              <p className="text-xs text-muted-foreground mt-1">{phase.approvalRationale}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface ExecutiveSummaryStepProps {
  summary: ExecutiveSummary
  onComplete: () => void
}

export function ExecutiveSummaryStep({ summary, onComplete }: ExecutiveSummaryStepProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [reviewed, setReviewed] = useState(false)

  const { metrics } = summary
  const deadlineConfig = DEADLINE_STATUS_CONFIG[metrics.deadlineStatus]

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev)
      if (next.has(phaseId)) {
        next.delete(phaseId)
      } else {
        next.add(phaseId)
      }
      return next
    })
  }

  const getScoreStatus = (score: number): 'good' | 'warning' | 'critical' => {
    if (score >= 90) return 'good'
    if (score >= 70) return 'warning'
    return 'critical'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">Executive Summary Review</h2>
          <p className="text-muted-foreground mt-1">
            Review key metrics and phase completions before attestation
          </p>
        </div>
        {summary.isAIGenerated && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
            <Sparkles className="h-3 w-3" />
            AI Generated
            {summary.aiConfidence && (
              <span className="ml-1 text-blue-500">
                ({Math.round(summary.aiConfidence * 100)}%)
              </span>
            )}
          </span>
        )}
      </div>

      {/* Report Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {summary.reportName}
          </CardTitle>
          <CardDescription>
            Reporting Period: {summary.reportingPeriod}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Key Metrics Grid */}
      <div>
        <h3 className="text-sm font-medium mb-3">Key Metrics</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Data Quality Score"
            value={`${metrics.dataQualityScore}%`}
            icon={<BarChart3 className="h-5 w-5 text-primary" />}
            status={getScoreStatus(metrics.dataQualityScore)}
            trend={metrics.dataQualityScore >= 90 ? 'up' : 'neutral'}
          />
          <MetricCard
            title="Issue Resolution Rate"
            value={`${metrics.issueResolutionRate}%`}
            subtitle={`${metrics.resolvedIssues}/${metrics.totalIssues} resolved`}
            icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
            status={getScoreStatus(metrics.issueResolutionRate)}
          />
          <MetricCard
            title="Control Pass Rate"
            value={`${metrics.controlPassRate}%`}
            subtitle={`${metrics.totalControls} controls`}
            icon={<Shield className="h-5 w-5 text-blue-600" />}
            status={getScoreStatus(metrics.controlPassRate)}
          />
          <MetricCard
            title="Deadline Status"
            value={deadlineConfig.label}
            subtitle={`${Math.abs(metrics.daysUntilDeadline)} days ${metrics.daysUntilDeadline >= 0 ? 'remaining' : 'overdue'}`}
            icon={
              metrics.deadlineStatus === 'on_track' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : metrics.deadlineStatus === 'at_risk' ? (
                <Clock className="h-5 w-5 text-amber-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )
            }
            status={
              metrics.deadlineStatus === 'on_track' ? 'good' :
              metrics.deadlineStatus === 'at_risk' ? 'warning' : 'critical'
            }
          />
        </div>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Target className="h-5 w-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{metrics.totalCDEs}</p>
            <p className="text-xs text-muted-foreground">Critical Data Elements</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="h-5 w-5 mx-auto text-primary mb-2" />
            <p className="text-2xl font-bold">{metrics.totalRules}</p>
            <p className="text-xs text-muted-foreground">Quality Rules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className={cn(
              "h-5 w-5 mx-auto mb-2",
              metrics.criticalIssuesRemaining > 0 ? "text-red-600" : "text-green-600"
            )} />
            <p className="text-2xl font-bold">{metrics.criticalIssuesRemaining}</p>
            <p className="text-xs text-muted-foreground">Critical Issues Remaining</p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Issues Warning */}
      {metrics.criticalIssuesRemaining > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Critical Issues Require Attention</p>
              <p className="text-sm text-red-700 mt-1">
                There are {metrics.criticalIssuesRemaining} unresolved critical issues. 
                These should be addressed before final attestation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Phase Completions */}
      <div>
        <h3 className="text-sm font-medium mb-3">Phase Completions</h3>
        <div className="space-y-2">
          {summary.phaseCompletions.map(phase => (
            <PhaseCompletionCard
              key={phase.phaseId}
              phase={phase}
              isExpanded={expandedPhases.has(phase.phaseId)}
              onToggle={() => togglePhase(phase.phaseId)}
            />
          ))}
        </div>
      </div>

      {/* Highlights & Risks */}
      <div className="grid md:grid-cols-2 gap-4">
        {summary.highlights.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Highlights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {summary.highlights.map((highlight, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-green-600 mt-0.5">✓</span>
                    {highlight}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {summary.risks.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Risks & Concerns
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {summary.risks.map((risk, idx) => (
                  <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-amber-600 mt-0.5">!</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Review Confirmation */}
      <Card className="border-2 border-primary/20">
        <CardContent className="p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <div>
              <p className="font-medium">I have reviewed the executive summary</p>
              <p className="text-sm text-muted-foreground mt-1">
                By checking this box, I confirm that I have reviewed all key metrics, 
                phase completions, and identified risks before proceeding to the attestation checklist.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end">
        <Button
          onClick={onComplete}
          disabled={!reviewed}
        >
          Continue to Checklist
        </Button>
      </div>
    </div>
  )
}

export default ExecutiveSummaryStep
