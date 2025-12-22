/**
 * AnnotationResolutionStep Component
 * 
 * Step 2 of Documentation Phase - Resolve all flagged items before progression.
 * Blocks progression if unresolved flagged annotations exist.
 * 
 * Requirements: 10.3
 */

import { useState, useMemo } from 'react'
import {
  Flag,
  MessageSquare,
  Highlighter,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  FileText,
  Filter,
  Clock,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  DocumentArtifact,
  Annotation,
  AnnotationStatus,
  DocumentationSummary,
  ANNOTATION_TYPE_CONFIG,
  ANNOTATION_STATUS_CONFIG,
  ANNOTATION_PRIORITY_CONFIG,
  getBlockingAnnotations,
} from './types'

// ============================================================================
// Component Props
// ============================================================================

interface AnnotationResolutionStepProps {
  artifacts: DocumentArtifact[]
  summary: DocumentationSummary
  selectedArtifactId: string | null
  onSelectArtifact: (id: string | null) => void
  onAnnotationStatusUpdate: (
    artifactId: string,
    annotationId: string,
    status: AnnotationStatus,
    resolution?: string
  ) => void
  hasBlockingAnnotations: boolean
  onComplete: () => void
}

// ============================================================================
// Sub-Components
// ============================================================================

interface AnnotationCardProps {
  annotation: Annotation
  artifactName: string
  onResolve: (resolution: string) => void
  onDismiss: () => void
}

function AnnotationCard({ annotation, artifactName, onResolve, onDismiss }: AnnotationCardProps) {
  const [showResolutionForm, setShowResolutionForm] = useState(false)
  const [resolution, setResolution] = useState('')

  const typeConfig = ANNOTATION_TYPE_CONFIG[annotation.type]
  const priorityConfig = ANNOTATION_PRIORITY_CONFIG[annotation.priority]
  const statusConfig = ANNOTATION_STATUS_CONFIG[annotation.status]

  const handleResolve = () => {
    if (resolution.trim()) {
      onResolve(resolution)
      setShowResolutionForm(false)
      setResolution('')
    }
  }

  const isResolved = annotation.status === 'resolved' || annotation.status === 'dismissed'

  return (
    <Card className={isResolved ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge className={`${typeConfig.bgColor} ${typeConfig.color}`}>
                {annotation.type === 'flag' && <Flag className="h-3 w-3 mr-1" />}
                {annotation.type === 'comment' && <MessageSquare className="h-3 w-3 mr-1" />}
                {annotation.type === 'highlight' && <Highlighter className="h-3 w-3 mr-1" />}
                {typeConfig.label}
              </Badge>
              <Badge className={`${priorityConfig.bgColor} ${priorityConfig.color}`}>
                {priorityConfig.label}
              </Badge>
              <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
                {statusConfig.label}
              </Badge>
            </div>

            {/* Content */}
            <p className="text-sm mb-2">{annotation.content}</p>

            {/* Metadata */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {artifactName}
                {annotation.pageNumber && ` (Page ${annotation.pageNumber})`}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {annotation.createdByName}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(annotation.createdAt).toLocaleDateString()}
              </span>
            </div>

            {/* Resolution Info */}
            {annotation.resolution && (
              <div className="mt-3 p-2 bg-green-50 rounded-lg border border-green-200">
                <p className="text-xs font-medium text-green-800 mb-1">Resolution:</p>
                <p className="text-sm text-green-700">{annotation.resolution}</p>
                <p className="text-xs text-green-600 mt-1">
                  Resolved by {annotation.resolvedByName} on{' '}
                  {new Date(annotation.resolvedAt!).toLocaleDateString()}
                </p>
              </div>
            )}

            {/* Resolution Form */}
            {showResolutionForm && !isResolved && (
              <div className="mt-3 space-y-2">
                <Label className="text-xs">Resolution Notes</Label>
                <Textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  placeholder="Describe how this item was resolved..."
                  className="h-20"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResolutionForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleResolve}
                    disabled={!resolution.trim()}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Mark Resolved
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          {!isResolved && !showResolutionForm && (
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                onClick={() => setShowResolutionForm(true)}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Resolve
              </Button>
              {annotation.type !== 'flag' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDismiss}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Dismiss
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function AnnotationResolutionStep({
  artifacts,
  summary,
  selectedArtifactId: _selectedArtifactId,
  onSelectArtifact: _onSelectArtifact,
  onAnnotationStatusUpdate,
  hasBlockingAnnotations,
  onComplete,
}: AnnotationResolutionStepProps) {
  const [filterType, setFilterType] = useState<'all' | 'flag' | 'comment' | 'highlight'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'resolved'>('all')

  // Get all annotations with artifact info
  const allAnnotations = useMemo(() => {
    return artifacts.flatMap(artifact =>
      artifact.annotations.map(annotation => ({
        ...annotation,
        artifactName: artifact.name,
        artifactId: artifact.id,
      }))
    )
  }, [artifacts])

  // Filter annotations
  const filteredAnnotations = useMemo(() => {
    return allAnnotations.filter(annotation => {
      if (filterType !== 'all' && annotation.type !== filterType) return false
      if (filterStatus === 'open' && annotation.status !== 'open') return false
      if (filterStatus === 'resolved' && annotation.status === 'open') return false
      return true
    })
  }, [allAnnotations, filterType, filterStatus])

  // Get blocking annotations
  const blockingAnnotations = useMemo(() => {
    return getBlockingAnnotations(artifacts)
  }, [artifacts])

  // Sort annotations: flags first, then by priority, then by date
  const sortedAnnotations = useMemo(() => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    return [...filteredAnnotations].sort((a, b) => {
      // Flags first
      if (a.type === 'flag' && b.type !== 'flag') return -1
      if (a.type !== 'flag' && b.type === 'flag') return 1
      // Then by status (open first)
      if (a.status === 'open' && b.status !== 'open') return -1
      if (a.status !== 'open' && b.status === 'open') return 1
      // Then by priority
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      // Then by date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [filteredAnnotations])

  const handleResolve = (artifactId: string, annotationId: string, resolution: string) => {
    onAnnotationStatusUpdate(artifactId, annotationId, 'resolved', resolution)
  }

  const handleDismiss = (artifactId: string, annotationId: string) => {
    onAnnotationStatusUpdate(artifactId, annotationId, 'dismissed')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Annotation Resolution</h2>
        <p className="text-muted-foreground">
          Review and resolve all annotations before proceeding. Flagged items must be
          resolved to continue to the next step.
        </p>
      </div>

      {/* Blocking Warning */}
      {hasBlockingAnnotations && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Blocking Items</AlertTitle>
          <AlertDescription>
            There are {blockingAnnotations.length} flagged annotation(s) that must be resolved
            before you can proceed to the next step.
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MessageSquare className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.totalAnnotations}</p>
                <p className="text-xs text-muted-foreground">Total Annotations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.openAnnotations}</p>
                <p className="text-xs text-muted-foreground">Open</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.resolvedAnnotations}</p>
                <p className="text-xs text-muted-foreground">Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={hasBlockingAnnotations ? 'border-red-300 bg-red-50' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${hasBlockingAnnotations ? 'bg-red-200' : 'bg-red-100'}`}>
                <Flag className={`h-5 w-5 ${hasBlockingAnnotations ? 'text-red-700' : 'text-red-600'}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.flaggedAnnotations}</p>
                <p className="text-xs text-muted-foreground">Flagged (Blocking)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Type:</Label>
              <Select value={filterType} onValueChange={(v: typeof filterType) => setFilterType(v)}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="flag">Flags</SelectItem>
                  <SelectItem value="comment">Comments</SelectItem>
                  <SelectItem value="highlight">Highlights</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Status:</Label>
              <Select value={filterStatus} onValueChange={(v: typeof filterStatus) => setFilterStatus(v)}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              Showing {sortedAnnotations.length} of {allAnnotations.length} annotations
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Annotation List */}
      <div className="space-y-3">
        {sortedAnnotations.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p className="text-lg font-medium mb-2">No Annotations Found</p>
              <p className="text-muted-foreground">
                {filterType !== 'all' || filterStatus !== 'all'
                  ? 'No annotations match the current filters.'
                  : 'All documents have been reviewed without any annotations.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          sortedAnnotations.map(annotation => (
            <AnnotationCard
              key={annotation.id}
              annotation={annotation}
              artifactName={annotation.artifactName}
              onResolve={(resolution) => handleResolve(annotation.artifactId, annotation.id, resolution)}
              onDismiss={() => handleDismiss(annotation.artifactId, annotation.id)}
            />
          ))
        )}
      </div>

      {/* Complete Step */}
      <div className="flex justify-end">
        <Button
          onClick={onComplete}
          disabled={hasBlockingAnnotations}
        >
          {hasBlockingAnnotations ? (
            <>
              <AlertTriangle className="h-4 w-4 mr-2" />
              Resolve Flagged Items to Continue
            </>
          ) : (
            <>
              Continue to BCBS 239 Mapping
              <ChevronRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

export default AnnotationResolutionStep
