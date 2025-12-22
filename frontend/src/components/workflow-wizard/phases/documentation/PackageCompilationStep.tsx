/**
 * PackageCompilationStep Component
 * 
 * Step 4 of Documentation Phase - Generate consolidated PDF with table of contents.
 * Compiles all approved artifacts into a single compliance package.
 * 
 * Requirements: 10.5
 */

import { useState, useMemo } from 'react'
import {
  FileText,
  Download,
  CheckCircle,
  Clock,
  AlertTriangle,
  Package,
  ChevronRight,
  Loader2,
  FileCheck,
  List,
  RefreshCw,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  DocumentArtifact,
  BCBS239ComplianceEntry,
  CompiledPackage,
  TOCEntry,
  DocumentationSummary,
  ARTIFACT_TYPE_CONFIG,
  ARTIFACT_STATUS_CONFIG,
} from './types'

// ============================================================================
// Component Props
// ============================================================================

interface PackageCompilationStepProps {
  artifacts: DocumentArtifact[]
  bcbs239Entries: BCBS239ComplianceEntry[]
  compiledPackage: CompiledPackage | null
  summary: DocumentationSummary
  onCompile: () => Promise<void>
  onComplete: () => void
}

// ============================================================================
// Sub-Components
// ============================================================================

interface ArtifactSelectionProps {
  artifacts: DocumentArtifact[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

function ArtifactSelection({
  artifacts,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: ArtifactSelectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Select Artifacts to Include</CardTitle>
            <CardDescription>
              Choose which artifacts to include in the compiled package
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onSelectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={onDeselectAll}>
              Deselect All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {artifacts.map(artifact => {
          const typeConfig = ARTIFACT_TYPE_CONFIG[artifact.type]
          const statusConfig = ARTIFACT_STATUS_CONFIG[artifact.status]
          const isSelected = selectedIds.has(artifact.id)
          const isApproved = artifact.status === 'approved'

          return (
            <div
              key={artifact.id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                isSelected ? 'bg-primary/5 border-primary' : 'bg-muted/30'
              } ${!isApproved ? 'opacity-60' : ''}`}
            >
              <Checkbox
                id={artifact.id}
                checked={isSelected}
                onCheckedChange={() => onToggle(artifact.id)}
                disabled={!isApproved}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor={artifact.id}
                    className="font-medium cursor-pointer"
                  >
                    {artifact.name}
                  </Label>
                  <Badge variant="secondary" className="text-xs">
                    {typeConfig.label}
                  </Badge>
                  <Badge className={`${statusConfig.bgColor} ${statusConfig.color} text-xs`}>
                    {statusConfig.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {artifact.pageCount} pages • {(artifact.fileSize || 0 / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              {!isApproved && (
                <Badge variant="outline" className="text-amber-600">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Not Approved
                </Badge>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

interface TableOfContentsPreviewProps {
  entries: TOCEntry[]
}

function TableOfContentsPreview({ entries }: TableOfContentsPreviewProps) {
  const renderEntry = (entry: TOCEntry, depth: number = 0) => (
    <div key={entry.id}>
      <div
        className="flex items-center justify-between py-1 hover:bg-muted/50 rounded px-2"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="text-sm">{entry.title}</span>
        <span className="text-sm text-muted-foreground">{entry.pageNumber}</span>
      </div>
      {entry.children?.map(child => renderEntry(child, depth + 1))}
    </div>
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <List className="h-4 w-4" />
          Table of Contents Preview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg p-3 bg-muted/30 max-h-64 overflow-y-auto">
          {entries.map(entry => renderEntry(entry))}
        </div>
      </CardContent>
    </Card>
  )
}

interface CompilationProgressProps {
  package_: CompiledPackage
}

function CompilationProgress({ package_: _package }: CompilationProgressProps) {
  const [progress, setProgress] = useState(0)

  // Simulate progress
  useState(() => {
    if (_package.status === 'compiling') {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            clearInterval(interval)
            return prev
          }
          return prev + Math.random() * 15
        })
      }, 500)
      return () => clearInterval(interval)
    }
  })

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            </div>
          </div>
          <h3 className="text-lg font-semibold mb-2">Compiling Package...</h3>
          <p className="text-muted-foreground mb-4">
            Generating consolidated PDF with table of contents
          </p>
          <div className="w-full max-w-md">
            <Progress value={progress} className="h-2 mb-2" />
            <p className="text-sm text-muted-foreground">
              {Math.round(progress)}% complete
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface CompilationResultProps {
  package_: CompiledPackage
  onRecompile: () => void
}

function CompilationResult({ package_, onRecompile }: CompilationResultProps) {
  if (package_.status === 'failed') {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Compilation Failed</AlertTitle>
        <AlertDescription>
          {package_.error || 'An error occurred while compiling the package.'}
          <Button variant="outline" size="sm" className="mt-2" onClick={onRecompile}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry Compilation
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Card className="border-green-300 bg-green-50">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-green-100 rounded-full">
            <FileCheck className="h-8 w-8 text-green-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-green-800 mb-1">
              Package Compiled Successfully
            </h3>
            <p className="text-green-700 mb-4">
              Your compliance package has been generated and is ready for download.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-green-800">{package_.totalPages}</p>
                <p className="text-xs text-green-600">Total Pages</p>
              </div>
              <div className="p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-green-800">{package_.artifacts.length}</p>
                <p className="text-xs text-green-600">Artifacts Included</p>
              </div>
              <div className="p-3 bg-white rounded-lg">
                <p className="text-2xl font-bold text-green-800">
                  {((package_.fileSize || 0) / 1024 / 1024).toFixed(1)} MB
                </p>
                <p className="text-xs text-green-600">File Size</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="bg-green-700 hover:bg-green-800">
                <Download className="h-4 w-4 mr-2" />
                Download Package
              </Button>
              <Button variant="outline">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
              <Button variant="outline" onClick={onRecompile}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Recompile
              </Button>
            </div>
            <p className="text-xs text-green-600 mt-3">
              Compiled on {new Date(package_.compiledAt!).toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function PackageCompilationStep({
  artifacts,
  bcbs239Entries: _bcbs239Entries,
  compiledPackage,
  summary,
  onCompile,
  onComplete,
}: PackageCompilationStepProps) {
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<Set<string>>(() => {
    // Default to all approved artifacts
    return new Set(artifacts.filter(a => a.status === 'approved').map(a => a.id))
  })
  const [isCompiling, setIsCompiling] = useState(false)

  // Calculate package stats
  const packageStats = useMemo(() => {
    const selectedArtifacts = artifacts.filter(a => selectedArtifactIds.has(a.id))
    return {
      artifactCount: selectedArtifacts.length,
      totalPages: selectedArtifacts.reduce((sum, a) => sum + (a.pageCount || 0), 0),
      totalSize: selectedArtifacts.reduce((sum, a) => sum + (a.fileSize || 0), 0),
    }
  }, [artifacts, selectedArtifactIds])

  // Check if ready to compile
  const canCompile = useMemo(() => {
    return selectedArtifactIds.size > 0 && !isCompiling && compiledPackage?.status !== 'compiling'
  }, [selectedArtifactIds, isCompiling, compiledPackage])

  // Preview TOC
  const previewTOC: TOCEntry[] = useMemo(() => {
    const entries: TOCEntry[] = [
      { id: 'toc-exec', title: 'Executive Summary', pageNumber: 1, level: 1 },
    ]
    let currentPage = 5

    artifacts
      .filter(a => selectedArtifactIds.has(a.id))
      .forEach((artifact) => {
        entries.push({
          id: `toc-${artifact.id}`,
          title: artifact.name,
          pageNumber: currentPage,
          level: 1,
          artifactId: artifact.id,
        })
        currentPage += artifact.pageCount || 10
      })

    entries.push({
      id: 'toc-bcbs',
      title: 'BCBS 239 Compliance Matrix',
      pageNumber: currentPage,
      level: 1,
    })
    currentPage += 15

    entries.push({
      id: 'toc-attestation',
      title: 'Attestation',
      pageNumber: currentPage,
      level: 1,
    })

    return entries
  }, [artifacts, selectedArtifactIds])

  const handleToggleArtifact = (id: string) => {
    setSelectedArtifactIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedArtifactIds(new Set(artifacts.filter(a => a.status === 'approved').map(a => a.id)))
  }

  const handleDeselectAll = () => {
    setSelectedArtifactIds(new Set())
  }

  const handleCompile = async () => {
    setIsCompiling(true)
    try {
      await onCompile()
    } finally {
      setIsCompiling(false)
    }
  }

  const isPackageReady = compiledPackage?.status === 'completed'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Package Compilation</h2>
        <p className="text-muted-foreground">
          Generate a consolidated compliance package with all approved documentation,
          BCBS 239 compliance matrix, and table of contents.
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
                <p className="text-2xl font-bold">{packageStats.artifactCount}</p>
                <p className="text-xs text-muted-foreground">Selected Artifacts</p>
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
              <div className="p-2 bg-purple-100 rounded-lg">
                <List className="h-5 w-5 text-purple-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">~{packageStats.totalPages + 20}</p>
                <p className="text-xs text-muted-foreground">Est. Pages</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Package className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {((packageStats.totalSize + 2000000) / 1024 / 1024).toFixed(1)} MB
                </p>
                <p className="text-xs text-muted-foreground">Est. Size</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compilation Result or Progress */}
      {compiledPackage?.status === 'compiling' && (
        <CompilationProgress package_={compiledPackage} />
      )}

      {compiledPackage && (compiledPackage.status === 'completed' || compiledPackage.status === 'failed') && (
        <CompilationResult package_={compiledPackage} onRecompile={handleCompile} />
      )}

      {/* Artifact Selection */}
      {!compiledPackage || compiledPackage.status === 'pending' ? (
        <>
          <ArtifactSelection
            artifacts={artifacts}
            selectedIds={selectedArtifactIds}
            onToggle={handleToggleArtifact}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
          />

          {/* TOC Preview */}
          <TableOfContentsPreview entries={previewTOC} />

          {/* Package Contents Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Package Contents</CardTitle>
              <CardDescription>
                The compiled package will include the following sections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Executive Summary
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Selected Documentation Artifacts
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    BCBS 239 Compliance Matrix
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Table of Contents
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Attestation Section
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Appendices
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compile Button */}
          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={handleCompile}
              disabled={!canCompile}
              className="px-8"
            >
              {isCompiling ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Compiling...
                </>
              ) : (
                <>
                  <Package className="h-5 w-5 mr-2" />
                  Compile Package
                </>
              )}
            </Button>
          </div>
        </>
      ) : null}

      {/* Complete Step */}
      <div className="flex justify-end">
        <Button
          onClick={onComplete}
          disabled={!isPackageReady}
        >
          {isPackageReady ? (
            <>
              Continue to Attestation
              <ChevronRight className="h-4 w-4 ml-2" />
            </>
          ) : (
            <>
              <Clock className="h-4 w-4 mr-2" />
              Compile Package to Continue
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

export default PackageCompilationStep
