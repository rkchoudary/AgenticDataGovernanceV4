/**
 * ScanResultsStep Component
 * 
 * Step 1 of Regulatory Intelligence phase - displays scan results
 * with cards for each detected change showing source, change type,
 * confidence score, and AI summary.
 * 
 * Requirements: 3.2
 */

import { useMemo } from 'react'
import {
  FileSearch,
  Clock,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Calendar,
  RefreshCw,
  Plus,
  Minus,
  FileText,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ScanResults, DetectedChange, CHANGE_TYPE_CONFIG } from './types'

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Scan Summary Card
 */
interface ScanSummaryProps {
  scanResults: ScanResults
}

function ScanSummary({ scanResults }: ScanSummaryProps) {
  const scanDate = new Date(scanResults.scannedAt)
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-primary" />
            Scan Summary
          </CardTitle>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {scanDate.toLocaleDateString()} at {scanDate.toLocaleTimeString()}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-primary">{scanResults.sourcesScanned}</p>
            <p className="text-xs text-muted-foreground">Sources Scanned</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-amber-600">{scanResults.changesDetected.length}</p>
            <p className="text-xs text-muted-foreground">Changes Detected</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{scanResults.scanDuration}s</p>
            <p className="text-xs text-muted-foreground">Scan Duration</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">
              {scanResults.nextScheduledScan 
                ? new Date(scanResults.nextScheduledScan).toLocaleDateString()
                : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground">Next Scan</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Change Type Icon Component
 */
function ChangeTypeIcon({ type }: { type: DetectedChange['changeType'] }) {
  const iconMap = {
    new_requirement: Plus,
    updated_requirement: RefreshCw,
    removed_requirement: Minus,
    deadline_change: Calendar,
    format_change: FileText,
  }
  const Icon = iconMap[type]
  return <Icon className="h-4 w-4" />
}

/**
 * Confidence Score Badge
 */
interface ConfidenceBadgeProps {
  confidence: number
}

function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const percentage = Math.round(confidence * 100)
  const colorClass = percentage >= 90 
    ? 'text-green-700 bg-green-100' 
    : percentage >= 70 
      ? 'text-amber-700 bg-amber-100'
      : 'text-red-700 bg-red-100'
  
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      colorClass
    )}>
      <Sparkles className="h-3 w-3" />
      {percentage}% confidence
    </span>
  )
}

/**
 * Detected Change Card
 * Requirements: 3.2 - Display card for each detected change
 */
interface ChangeCardProps {
  change: DetectedChange
}

function ChangeCard({ change }: ChangeCardProps) {
  const config = CHANGE_TYPE_CONFIG[change.changeType]
  const effectiveDate = new Date(change.effectiveDate)
  const daysUntilEffective = Math.ceil(
    (effectiveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
              config.bgColor,
              config.color
            )}>
              <ChangeTypeIcon type={change.changeType} />
              {config.label}
            </span>
            <ConfidenceBadge confidence={change.confidence} />
          </div>
          {change.sourceUrl && (
            <a
              href={change.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        {/* Title and Source */}
        <h3 className="font-semibold text-base mb-1">{change.title}</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Source: {change.source}
        </p>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {change.description}
        </p>

        {/* AI Summary */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-1 text-xs text-blue-700 font-medium mb-1">
            <Sparkles className="h-3 w-3" />
            AI Summary
          </div>
          <p className="text-sm text-blue-800 line-clamp-3">
            {change.aiSummary}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Effective: {effectiveDate.toLocaleDateString()}
            {daysUntilEffective > 0 && (
              <span className="text-amber-600 ml-1">
                ({daysUntilEffective} days)
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {change.impactedReports.length} report{change.impactedReports.length !== 1 ? 's' : ''} impacted
          </div>
        </div>

        {/* Impacted Reports */}
        {change.impactedReports.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-1">Impacted Reports:</p>
            <div className="flex flex-wrap gap-1">
              {change.impactedReports.map((report, index) => (
                <span
                  key={index}
                  className="px-2 py-0.5 bg-muted rounded text-xs"
                >
                  {report}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Changes by Type Summary
 */
interface ChangesByTypeSummaryProps {
  changes: DetectedChange[]
}

function ChangesByTypeSummary({ changes }: ChangesByTypeSummaryProps) {
  const byType = useMemo(() => {
    const counts: Record<string, number> = {}
    changes.forEach(change => {
      counts[change.changeType] = (counts[change.changeType] || 0) + 1
    })
    return counts
  }, [changes])

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(byType).map(([type, count]) => {
        const config = CHANGE_TYPE_CONFIG[type as DetectedChange['changeType']]
        return (
          <span
            key={type}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
              config.bgColor,
              config.color
            )}
          >
            <ChangeTypeIcon type={type as DetectedChange['changeType']} />
            {count} {config.label}
          </span>
        )
      })}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface ScanResultsStepProps {
  scanResults: ScanResults
  onComplete: () => void
}

export function ScanResultsStep({ scanResults, onComplete }: ScanResultsStepProps) {
  const hasChanges = scanResults.changesDetected.length > 0

  return (
    <div className="space-y-6">
      {/* Scan Summary */}
      <ScanSummary scanResults={scanResults} />

      {/* Changes Overview */}
      {hasChanges ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Detected Changes</h3>
              <p className="text-sm text-muted-foreground">
                Review the following regulatory changes detected by AI scanning
              </p>
            </div>
            <ChangesByTypeSummary changes={scanResults.changesDetected} />
          </div>

          {/* Change Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {scanResults.changesDetected.map(change => (
              <ChangeCard key={change.id} change={change} />
            ))}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Changes Detected</h3>
            <p className="text-muted-foreground">
              The regulatory scan did not detect any new changes since the last review.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Action */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete} className="gap-2">
          {hasChanges ? 'Proceed to Change Analysis' : 'Complete Review'}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default ScanResultsStep
