/**
 * ArtifactReviewStep Component
 * 
 * Step 1 of Documentation Phase - Review generated documents with annotation tools.
 * Embeds PDF/HTML viewer with highlight, comment, and flag capabilities.
 * 
 * Requirements: 10.1, 10.2
 */

import { useState, useCallback } from 'react'
import {
  FileText,
  Eye,
  CheckCircle,
  XCircle,
  MessageSquare,
  Flag,
  Highlighter,
  ChevronRight,
  Download,
  ExternalLink,
  Sparkles,
  FileEdit,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DocumentArtifact,
  Annotation,
  AnnotationType,
  AnnotationPriority,
  ArtifactStatus,
  DocumentationSummary,
  ARTIFACT_TYPE_CONFIG,
  ARTIFACT_STATUS_CONFIG,
  ANNOTATION_TYPE_CONFIG,
  ANNOTATION_PRIORITY_CONFIG,
} from './types'

// ============================================================================
// Component Props
// ============================================================================

interface ArtifactReviewStepProps {
  artifacts: DocumentArtifact[]
  summary: DocumentationSummary
  selectedArtifactId: string | null
  onSelectArtifact: (id: string | null) => void
  onStatusUpdate: (artifactId: string, status: ArtifactStatus) => void
  onAnnotationCreate: (
    artifactId: string,
    annotation: Omit<Annotation, 'id' | 'artifactId' | 'createdAt' | 'createdBy' | 'replies'>
  ) => void
  onComplete: () => void
}

// ============================================================================
// Sub-Components
// ============================================================================

interface ArtifactCardProps {
  artifact: DocumentArtifact
  isSelected: boolean
  onSelect: () => void
}

function ArtifactCard({ artifact, isSelected, onSelect }: ArtifactCardProps) {
  const typeConfig = ARTIFACT_TYPE_CONFIG[artifact.type]
  const statusConfig = ARTIFACT_STATUS_CONFIG[artifact.status]
  const openAnnotations = artifact.annotations.filter(a => a.status === 'open').length
  const flaggedAnnotations = artifact.annotations.filter(a => a.type === 'flag' && a.status === 'open').length

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="p-2 bg-muted rounded-lg shrink-0">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-sm truncate">{artifact.name}</h4>
                {artifact.isAIGenerated && (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                {artifact.description}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {typeConfig.label}
                </Badge>
                <Badge className={`${statusConfig.bgColor} ${statusConfig.color} text-xs`}>
                  {statusConfig.label}
                </Badge>
                {openAnnotations > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    {openAnnotations}
                  </Badge>
                )}
                {flaggedAnnotations > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    <Flag className="h-3 w-3 mr-1" />
                    {flaggedAnnotations}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </div>
      </CardContent>
    </Card>
  )
}

interface DocumentViewerProps {
  artifact: DocumentArtifact
  onStatusUpdate: (status: ArtifactStatus) => void
  onAnnotationCreate: (
    annotation: Omit<Annotation, 'id' | 'artifactId' | 'createdAt' | 'createdBy' | 'replies'>
  ) => void
  onBack: () => void
}

function DocumentViewer({ artifact, onStatusUpdate, onAnnotationCreate, onBack }: DocumentViewerProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [annotationMode, setAnnotationMode] = useState<AnnotationType | null>(null)
  const [showAnnotationForm, setShowAnnotationForm] = useState(false)
  const [newAnnotation, setNewAnnotation] = useState({
    type: 'comment' as AnnotationType,
    priority: 'medium' as AnnotationPriority,
    content: '',
  })

  const statusConfig = ARTIFACT_STATUS_CONFIG[artifact.status]
  const typeConfig = ARTIFACT_TYPE_CONFIG[artifact.type]

  const handleCreateAnnotation = useCallback(() => {
    if (!newAnnotation.content.trim()) return

    onAnnotationCreate({
      type: newAnnotation.type,
      status: 'open',
      priority: newAnnotation.priority,
      content: newAnnotation.content,
      pageNumber: currentPage,
    })

    setNewAnnotation({
      type: 'comment',
      priority: 'medium',
      content: '',
    })
    setShowAnnotationForm(false)
    setAnnotationMode(null)
  }, [newAnnotation, currentPage, onAnnotationCreate])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{artifact.name}</h3>
              {artifact.isAIGenerated && (
                <Badge variant="outline" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI Generated ({Math.round((artifact.aiConfidence || 0) * 100)}% confidence)
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {typeConfig.label} • Version {artifact.version} • {artifact.pageCount} pages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
            {statusConfig.label}
          </Badge>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            Download
          </Button>
          <Button variant="outline" size="sm">
            <ExternalLink className="h-4 w-4 mr-1" />
            Open
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Annotation Tools:</span>
              <Button
                variant={annotationMode === 'highlight' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setAnnotationMode(annotationMode === 'highlight' ? null : 'highlight')
                  setShowAnnotationForm(annotationMode !== 'highlight')
                  setNewAnnotation(prev => ({ ...prev, type: 'highlight' }))
                }}
              >
                <Highlighter className="h-4 w-4 mr-1" />
                Highlight
              </Button>
              <Button
                variant={annotationMode === 'comment' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setAnnotationMode(annotationMode === 'comment' ? null : 'comment')
                  setShowAnnotationForm(annotationMode !== 'comment')
                  setNewAnnotation(prev => ({ ...prev, type: 'comment' }))
                }}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Comment
              </Button>
              <Button
                variant={annotationMode === 'flag' ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => {
                  setAnnotationMode(annotationMode === 'flag' ? null : 'flag')
                  setShowAnnotationForm(annotationMode !== 'flag')
                  setNewAnnotation(prev => ({ ...prev, type: 'flag' }))
                }}
              >
                <Flag className="h-4 w-4 mr-1" />
                Flag
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setZoom(Math.max(50, zoom - 25))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm w-12 text-center">{zoom}%</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setZoom(Math.min(200, zoom + 25))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm">
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Annotation Form */}
      {showAnnotationForm && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {annotationMode === 'highlight' && <Highlighter className="h-4 w-4" />}
              {annotationMode === 'comment' && <MessageSquare className="h-4 w-4" />}
              {annotationMode === 'flag' && <Flag className="h-4 w-4" />}
              Add {ANNOTATION_TYPE_CONFIG[newAnnotation.type].label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select
                  value={newAnnotation.type}
                  onValueChange={(value: AnnotationType) => 
                    setNewAnnotation(prev => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="highlight">Highlight</SelectItem>
                    <SelectItem value="comment">Comment</SelectItem>
                    <SelectItem value="flag">Flag</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Select
                  value={newAnnotation.priority}
                  onValueChange={(value: AnnotationPriority) => 
                    setNewAnnotation(prev => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Content</Label>
              <Textarea
                value={newAnnotation.content}
                onChange={(e) => setNewAnnotation(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Enter your annotation..."
                className="h-20"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAnnotationForm(false)
                  setAnnotationMode(null)
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateAnnotation}
                disabled={!newAnnotation.content.trim()}
              >
                Add Annotation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document Preview */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div 
            className="bg-muted min-h-[500px] flex items-center justify-center"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          >
            <div className="bg-white shadow-lg p-8 max-w-2xl w-full min-h-[600px]">
              <div className="text-center text-muted-foreground">
                <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Document Preview</p>
                <p className="text-sm">
                  {artifact.fileType.toUpperCase()} document viewer would be embedded here.
                </p>
                <p className="text-sm mt-2">
                  Page {currentPage} of {artifact.pageCount || 1}
                </p>
              </div>
            </div>
          </div>
          {/* Page Navigation */}
          <div className="flex items-center justify-center gap-4 p-3 border-t bg-muted/50">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {currentPage} of {artifact.pageCount || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(artifact.pageCount || 1, currentPage + 1))}
              disabled={currentPage >= (artifact.pageCount || 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Annotations */}
      {artifact.annotations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Annotations ({artifact.annotations.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {artifact.annotations.map(annotation => {
              const typeConfig = ANNOTATION_TYPE_CONFIG[annotation.type]
              const priorityConfig = ANNOTATION_PRIORITY_CONFIG[annotation.priority]
              return (
                <div
                  key={annotation.id}
                  className={`p-3 rounded-lg border ${
                    annotation.status === 'resolved' ? 'bg-muted/50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <Badge className={`${typeConfig.bgColor} ${typeConfig.color} text-xs`}>
                        {typeConfig.label}
                      </Badge>
                      <Badge className={`${priorityConfig.bgColor} ${priorityConfig.color} text-xs`}>
                        {priorityConfig.label}
                      </Badge>
                      {annotation.pageNumber && (
                        <span className="text-xs text-muted-foreground">
                          Page {annotation.pageNumber}
                        </span>
                      )}
                    </div>
                    <Badge variant={annotation.status === 'resolved' ? 'secondary' : 'outline'}>
                      {annotation.status}
                    </Badge>
                  </div>
                  <p className="text-sm mt-2">{annotation.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    By {annotation.createdByName} • {new Date(annotation.createdAt).toLocaleDateString()}
                  </p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Review Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onStatusUpdate('rejected')}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onStatusUpdate('review')}
            >
              <FileEdit className="h-4 w-4 mr-2" />
              Request Changes
            </Button>
            <Button
              className="flex-1"
              onClick={() => onStatusUpdate('approved')}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ArtifactReviewStep({
  artifacts,
  summary,
  selectedArtifactId,
  onSelectArtifact,
  onStatusUpdate,
  onAnnotationCreate,
  onComplete,
}: ArtifactReviewStepProps) {
  const selectedArtifact = artifacts.find(a => a.id === selectedArtifactId)

  // If an artifact is selected, show the document viewer
  if (selectedArtifact) {
    return (
      <DocumentViewer
        artifact={selectedArtifact}
        onStatusUpdate={(status) => onStatusUpdate(selectedArtifact.id, status)}
        onAnnotationCreate={(annotation) => onAnnotationCreate(selectedArtifact.id, annotation)}
        onBack={() => onSelectArtifact(null)}
      />
    )
  }

  // Otherwise show the artifact list
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Artifact Review</h2>
        <p className="text-muted-foreground">
          Review all generated documentation artifacts. Use annotation tools to highlight,
          comment, or flag items that need attention.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.totalArtifacts}</p>
                <p className="text-xs text-muted-foreground">Total Artifacts</p>
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
                <p className="text-2xl font-bold">{summary.approvedArtifacts}</p>
                <p className="text-xs text-muted-foreground">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Eye className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.pendingArtifacts}</p>
                <p className="text-xs text-muted-foreground">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Flag className="h-5 w-5 text-red-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.flaggedAnnotations}</p>
                <p className="text-xs text-muted-foreground">Flagged Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Artifact List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentation Artifacts</CardTitle>
          <CardDescription>
            Click on an artifact to open the document viewer and add annotations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {artifacts.map(artifact => (
            <ArtifactCard
              key={artifact.id}
              artifact={artifact}
              isSelected={artifact.id === selectedArtifactId}
              onSelect={() => onSelectArtifact(artifact.id)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Complete Step */}
      <div className="flex justify-end">
        <Button onClick={onComplete}>
          Continue to Annotation Resolution
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

export default ArtifactReviewStep
