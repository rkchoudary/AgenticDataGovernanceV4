/**
 * RootCauseAnalysisStep Component
 * 
 * Step 2 of Issue Management phase - displays AI suggestions with
 * confidence scores and similar historical issues.
 * 
 * Requirements: 8.3
 */

import { useState } from 'react'
import {
  History,
  Lightbulb,
  Search,
  Sparkles,
  Target,
  CheckCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Issue,
  IssueStatus,
  RootCauseSuggestion,
  SimilarIssue,
  SEVERITY_CONFIG,
  ROOT_CAUSE_CONFIG,
} from './types'
import { cn } from '@/lib/utils'

// ============================================================================
// Component Props
// ============================================================================

interface RootCauseAnalysisStepProps {
  issues: Issue[]
  selectedIssueId: string | null
  onSelectIssue: (issueId: string | null) => void
  onSelectRootCause: (issueId: string, rootCause: RootCauseSuggestion) => void
  onStatusUpdate: (issueId: string, status: IssueStatus) => void
  onComplete: () => void
}

// ============================================================================
// Root Cause Suggestion Card
// ============================================================================

interface RootCauseSuggestionCardProps {
  suggestion: RootCauseSuggestion
  isSelected: boolean
  onSelect: () => void
}

function RootCauseSuggestionCard({
  suggestion,
  isSelected,
  onSelect,
}: RootCauseSuggestionCardProps) {
  const categoryConfig = ROOT_CAUSE_CONFIG[suggestion.category]
  const confidencePercent = Math.round(suggestion.confidence * 100)

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:border-primary/50',
        isSelected && 'ring-2 ring-primary border-primary'
      )}
      onClick={onSelect}
    >
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {suggestion.isAIGenerated && (
              <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50">
                <Sparkles className="h-3 w-3 mr-1" />
                AI Suggested
              </Badge>
            )}
            <Badge variant="outline">
              {categoryConfig.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Confidence:</span>
            <div className="flex items-center gap-2">
              <Progress value={confidencePercent} className="w-20 h-2" />
              <span className={cn(
                'text-sm font-medium',
                confidencePercent >= 80 && 'text-green-600',
                confidencePercent >= 60 && confidencePercent < 80 && 'text-amber-600',
                confidencePercent < 60 && 'text-red-600'
              )}>
                {confidencePercent}%
              </span>
            </div>
          </div>
        </div>

        <p className="text-sm font-medium mb-2">{suggestion.description}</p>

        {/* Evidence */}
        {suggestion.evidence.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">Evidence:</div>
            <ul className="text-xs text-muted-foreground space-y-1">
              {suggestion.evidence.map((e, idx) => (
                <li key={idx} className="flex items-start gap-1">
                  <span className="text-primary">•</span>
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggested Actions */}
        {suggestion.suggestedActions.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Suggested Actions:</div>
            <div className="flex flex-wrap gap-1">
              {suggestion.suggestedActions.map((action, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {action}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {isSelected && (
          <div className="mt-3 pt-3 border-t flex items-center gap-2 text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Selected as root cause</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Similar Issue Card
// ============================================================================

interface SimilarIssueCardProps {
  issue: SimilarIssue
}

function SimilarIssueCard({ issue }: SimilarIssueCardProps) {
  const severityConfig = SEVERITY_CONFIG[issue.severity]
  const resolvedDate = new Date(issue.resolvedAt)
  const daysAgo = Math.floor((Date.now() - resolvedDate.getTime()) / (1000 * 60 * 60 * 24))

  return (
    <Card className="bg-muted/30">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{issue.title}</span>
          </div>
          <Badge className={cn(severityConfig.bgColor, severityConfig.color, 'text-xs')}>
            {severityConfig.label}
          </Badge>
        </div>

        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Root Cause: </span>
            <span>{issue.rootCause}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Resolution: </span>
            <span>{issue.resolution}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Resolved {daysAgo} days ago</span>
            <span className="text-purple-600 font-medium">
              {Math.round(issue.similarity * 100)}% similar
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Issue Analysis Panel
// ============================================================================

interface IssueAnalysisPanelProps {
  issue: Issue
  selectedRootCauseId: string | null
  onSelectRootCause: (rootCause: RootCauseSuggestion) => void
}

function IssueAnalysisPanel({
  issue,
  selectedRootCauseId,
  onSelectRootCause,
}: IssueAnalysisPanelProps) {
  const severityConfig = SEVERITY_CONFIG[issue.severity]

  return (
    <div className="space-y-6">
      {/* Issue Header */}
      <div className="bg-muted/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Badge className={cn(severityConfig.bgColor, severityConfig.color)}>
            {severityConfig.label}
          </Badge>
          <span className="text-lg font-semibold">{issue.title}</span>
        </div>
        <p className="text-sm text-muted-foreground">{issue.description}</p>
      </div>

      {/* Root Cause Suggestions */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          <h3 className="text-lg font-semibold">AI Root Cause Suggestions</h3>
        </div>

        {issue.rootCauseSuggestions && issue.rootCauseSuggestions.length > 0 ? (
          <div className="space-y-3">
            {issue.rootCauseSuggestions.map(suggestion => (
              <RootCauseSuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                isSelected={selectedRootCauseId === suggestion.id}
                onSelect={() => onSelectRootCause(suggestion)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No AI suggestions available for this issue.</p>
            <p className="text-sm">Manual root cause analysis required.</p>
          </div>
        )}
      </div>

      {/* Similar Historical Issues */}
      {issue.similarIssues && issue.similarIssues.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <History className="h-5 w-5 text-blue-500" />
            <h3 className="text-lg font-semibold">Similar Historical Issues</h3>
          </div>

          <div className="space-y-3">
            {issue.similarIssues.map(similarIssue => (
              <SimilarIssueCard key={similarIssue.id} issue={similarIssue} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Issue List Item
// ============================================================================

interface IssueListItemProps {
  issue: Issue
  isSelected: boolean
  hasRootCause: boolean
  onClick: () => void
}

function IssueListItem({ issue, isSelected, hasRootCause, onClick }: IssueListItemProps) {
  const severityConfig = SEVERITY_CONFIG[issue.severity]

  return (
    <button
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <Badge className={cn(severityConfig.bgColor, severityConfig.color, 'text-xs')}>
          {severityConfig.label}
        </Badge>
        {hasRootCause && (
          <CheckCircle className="h-4 w-4 text-green-500" />
        )}
      </div>
      <p className="text-sm font-medium truncate">{issue.title}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {issue.rootCauseSuggestions?.length || 0} AI suggestions
      </p>
    </button>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function RootCauseAnalysisStep({
  issues,
  selectedIssueId,
  onSelectIssue,
  onSelectRootCause,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onStatusUpdate: _onStatusUpdate,
  onComplete,
}: RootCauseAnalysisStepProps) {
  const [selectedRootCauses, setSelectedRootCauses] = useState<Record<string, string>>({})

  // Get selected issue
  const selectedIssue = issues.find(i => i.id === selectedIssueId)

  // Handle root cause selection
  const handleSelectRootCause = (issueId: string, rootCause: RootCauseSuggestion) => {
    setSelectedRootCauses(prev => ({
      ...prev,
      [issueId]: rootCause.id,
    }))
    onSelectRootCause(issueId, rootCause)
  }

  // Check if all issues have root causes selected
  const allAnalyzed = issues.every(
    issue => selectedRootCauses[issue.id] || issue.resolution?.rootCause
  )

  // Count analyzed issues
  const analyzedCount = issues.filter(
    issue => selectedRootCauses[issue.id] || issue.resolution?.rootCause
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Root Cause Analysis</h2>
        <p className="text-muted-foreground mt-1">
          Review AI-suggested root causes and select the most likely cause for each issue.
        </p>
      </div>

      {/* Progress */}
      <div className="bg-muted/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Analysis Progress</span>
          <span className="text-sm text-muted-foreground">
            {analyzedCount} of {issues.length} issues analyzed
          </span>
        </div>
        <Progress value={(analyzedCount / issues.length) * 100} className="h-2" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Issue List */}
        <div className="lg:col-span-1">
          <h3 className="text-sm font-medium mb-3">Issues to Analyze</h3>
          <div className="space-y-2">
            {issues.map(issue => (
              <IssueListItem
                key={issue.id}
                issue={issue}
                isSelected={selectedIssueId === issue.id}
                hasRootCause={!!selectedRootCauses[issue.id] || !!issue.resolution?.rootCause}
                onClick={() => onSelectIssue(issue.id)}
              />
            ))}
          </div>
        </div>

        {/* Analysis Panel */}
        <div className="lg:col-span-2">
          {selectedIssue ? (
            <IssueAnalysisPanel
              issue={selectedIssue}
              selectedRootCauseId={selectedRootCauses[selectedIssue.id] || null}
              onSelectRootCause={(rootCause) => handleSelectRootCause(selectedIssue.id, rootCause)}
            />
          ) : (
            <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg">
              <div className="text-center text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Select an issue to analyze</p>
                <p className="text-sm">Choose from the list on the left</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Complete Step Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={onComplete}
          disabled={!allAnalyzed}
        >
          {allAnalyzed
            ? 'Continue to Resolution'
            : `${issues.length - analyzedCount} issues need analysis`}
        </Button>
      </div>
    </div>
  )
}

export default RootCauseAnalysisStep

