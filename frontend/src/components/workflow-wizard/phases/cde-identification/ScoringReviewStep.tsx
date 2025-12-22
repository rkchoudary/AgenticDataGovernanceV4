/**
 * ScoringReviewStep Component
 * 
 * Step 1 of CDE Identification phase - displays CDE scores with radar chart
 * visualization and AI rationale for each CDE.
 * 
 * Requirements: 5.2
 */

import { useMemo, useState, useRef } from 'react'
import {
  Target,
  Sparkles,
  ChevronRight,
  TrendingUp,
  BarChart3,
  Upload,
  FileSpreadsheet,
  X,
  AlertCircle,
  CheckCircle2,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  CDE,
  CDEIdentificationSummary,
  CDEScoringFactors,
  SCORING_FACTOR_CONFIG,
} from './types'

// ============================================================================
// Radar Chart Component
// ============================================================================

interface RadarChartProps {
  factors: CDEScoringFactors
  size?: number
}

function RadarChart({ factors, size = 200 }: RadarChartProps) {
  const center = size / 2
  const radius = (size / 2) - 30
  const factorKeys = Object.keys(factors) as (keyof CDEScoringFactors)[]
  const angleStep = (2 * Math.PI) / factorKeys.length
  
  // Calculate points for the data polygon
  const dataPoints = factorKeys.map((key, index) => {
    const angle = index * angleStep - Math.PI / 2 // Start from top
    const value = factors[key] / 100 // Normalize to 0-1
    const x = center + radius * value * Math.cos(angle)
    const y = center + radius * value * Math.sin(angle)
    return { x, y, key, value: factors[key] }
  })
  
  // Create polygon path
  const polygonPath = dataPoints.map((p, i) => 
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ') + ' Z'
  
  // Create grid circles
  const gridCircles = [0.25, 0.5, 0.75, 1].map(scale => ({
    r: radius * scale,
    label: `${scale * 100}%`,
  }))
  
  // Create axis lines
  const axisLines = factorKeys.map((_, index) => {
    const angle = index * angleStep - Math.PI / 2
    return {
      x2: center + radius * Math.cos(angle),
      y2: center + radius * Math.sin(angle),
    }
  })
  
  // Label positions
  const labelPositions = factorKeys.map((key, index) => {
    const angle = index * angleStep - Math.PI / 2
    const labelRadius = radius + 20
    return {
      x: center + labelRadius * Math.cos(angle),
      y: center + labelRadius * Math.sin(angle),
      key,
      config: SCORING_FACTOR_CONFIG[key],
    }
  })

  return (
    <svg width={size} height={size} className="mx-auto">
      {/* Grid circles */}
      {gridCircles.map((circle, i) => (
        <circle
          key={i}
          cx={center}
          cy={center}
          r={circle.r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.1}
          strokeWidth={1}
        />
      ))}
      
      {/* Axis lines */}
      {axisLines.map((line, i) => (
        <line
          key={i}
          x1={center}
          y1={center}
          x2={line.x2}
          y2={line.y2}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={1}
        />
      ))}
      
      {/* Data polygon */}
      <path
        d={polygonPath}
        fill="hsl(var(--primary))"
        fillOpacity={0.2}
        stroke="hsl(var(--primary))"
        strokeWidth={2}
      />
      
      {/* Data points */}
      {dataPoints.map((point, i) => (
        <circle
          key={i}
          cx={point.x}
          cy={point.y}
          r={4}
          fill="hsl(var(--primary))"
          stroke="white"
          strokeWidth={2}
        />
      ))}
      
      {/* Labels */}
      {labelPositions.map((label, i) => (
        <text
          key={i}
          x={label.x}
          y={label.y}
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-[10px] fill-muted-foreground font-medium"
        >
          {label.config.label.split(' ')[0]}
        </text>
      ))}
    </svg>
  )
}

// ============================================================================
// CDE Upload Panel Component
// ============================================================================

interface CDEUploadPanelProps {
  onUpload: (cdes: CDE[]) => void
}

function CDEUploadPanel({ onUpload }: CDEUploadPanelProps) {
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'parsing' | 'success' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [parsedCDEs, setParsedCDEs] = useState<CDE[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadedFile(file)
      setUploadStatus('parsing')
      setUploadError(null)
      
      // Simulate parsing the file
      setTimeout(() => {
        // In a real implementation, this would parse CSV/Excel
        // For now, we'll simulate successful parsing with sample data
        const mockParsedCDEs: CDE[] = [
          {
            id: `uploaded-${Date.now()}-1`,
            elementId: 'manual-001',
            name: 'Custom CDE 1',
            businessDefinition: 'Manually uploaded CDE from inventory file',
            dataType: 'string',
            sourceSystem: 'Manual Upload',
            sourceTable: 'custom_table',
            sourceField: 'custom_field',
            criticalityRationale: 'Uploaded from external inventory',
            overallScore: 75,
            scoringFactors: {
              regulatoryCalculationUsage: 70,
              crossReportUsage: 75,
              financialImpact: 80,
              regulatoryScrutiny: 75,
            },
            aiRationale: 'This CDE was manually uploaded from an external inventory file.',
            status: 'pending',
          },
        ]
        setParsedCDEs(mockParsedCDEs)
        setUploadStatus('success')
      }, 1500)
    }
  }

  const handleConfirmUpload = () => {
    onUpload(parsedCDEs)
    setShowUploadDialog(false)
    setUploadedFile(null)
    setUploadStatus('idle')
    setParsedCDEs([])
  }

  const handleDownloadTemplate = () => {
    // Create CSV template
    const headers = 'name,businessDefinition,dataType,sourceSystem,sourceTable,sourceField,criticalityRationale,overallScore'
    const sampleRow = 'Sample CDE,Description of the CDE,string,Source System,table_name,field_name,Why this is critical,85'
    const csvContent = `${headers}\n${sampleRow}`
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cde_inventory_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <Upload className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="font-medium">Upload CDE Inventory</p>
                <p className="text-sm text-muted-foreground">
                  Import CDEs from CSV or Excel file
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setShowUploadDialog(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload File
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Upload CDE Inventory
            </DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file containing your CDE inventory. 
              The file should include CDE name, definition, source system, and other attributes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Download Template */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="text-sm">
                <p className="font-medium">Need a template?</p>
                <p className="text-muted-foreground">Download our CSV template</p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleDownloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Template
              </Button>
            </div>

            {/* Upload Area */}
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                uploadedFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {!uploadedFile ? (
                <>
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">Click to upload or drag and drop</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    CSV, XLS, or XLSX (max 10MB)
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <FileSpreadsheet className="h-10 w-10 mx-auto text-primary" />
                  <div>
                    <p className="font-medium">{uploadedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(uploadedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  
                  {uploadStatus === 'parsing' && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Parsing file...
                    </div>
                  )}
                  
                  {uploadStatus === 'success' && (
                    <div className="flex items-center justify-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Found {parsedCDEs.length} CDE(s)
                    </div>
                  )}
                  
                  {uploadStatus === 'error' && (
                    <div className="flex items-center justify-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      {uploadError}
                    </div>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setUploadedFile(null)
                      setUploadStatus('idle')
                      setParsedCDEs([])
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              )}
            </div>

            {/* Preview */}
            {uploadStatus === 'success' && parsedCDEs.length > 0 && (
              <div className="border rounded-lg p-3">
                <p className="text-sm font-medium mb-2">Preview</p>
                <div className="space-y-2 max-h-32 overflow-auto">
                  {parsedCDEs.slice(0, 3).map((cde, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Target className="h-3 w-3 text-primary" />
                      <span className="font-medium">{cde.name}</span>
                      <span className="text-muted-foreground">- {cde.sourceSystem}</span>
                    </div>
                  ))}
                  {parsedCDEs.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{parsedCDEs.length - 3} more CDEs
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmUpload}
              disabled={uploadStatus !== 'success' || parsedCDEs.length === 0}
            >
              Import {parsedCDEs.length} CDE(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================================
// Score Badge Component
// ============================================================================

interface ScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
}

function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const getScoreColor = (s: number) => {
    if (s >= 90) return 'bg-green-100 text-green-700 border-green-200'
    if (s >= 75) return 'bg-blue-100 text-blue-700 border-blue-200'
    if (s >= 60) return 'bg-amber-100 text-amber-700 border-amber-200'
    return 'bg-red-100 text-red-700 border-red-200'
  }
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-lg px-3 py-1.5 font-semibold',
  }

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border font-medium',
      getScoreColor(score),
      sizeClasses[size]
    )}>
      {score}
    </span>
  )
}

// ============================================================================
// CDE Card Component
// ============================================================================

interface CDECardProps {
  cde: CDE
  isSelected: boolean
  onSelect: () => void
}

function CDECard({ cde, isSelected, onSelect }: CDECardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left p-4 rounded-lg border transition-all',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium truncate">{cde.name}</span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {cde.businessDefinition}
          </p>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <span>{cde.sourceSystem}</span>
            <span>•</span>
            <span>{cde.dataType}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ScoreBadge score={cde.overallScore} />
          <ChevronRight className={cn(
            'h-4 w-4 transition-transform',
            isSelected ? 'rotate-90 text-primary' : 'text-muted-foreground'
          )} />
        </div>
      </div>
    </button>
  )
}

// ============================================================================
// CDE Detail Panel Component
// ============================================================================

interface CDEDetailPanelProps {
  cde: CDE
}

function CDEDetailPanel({ cde }: CDEDetailPanelProps) {
  const factorKeys = Object.keys(cde.scoringFactors) as (keyof CDEScoringFactors)[]
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">{cde.name}</h3>
          <ScoreBadge score={cde.overallScore} size="lg" />
        </div>
        <p className="text-muted-foreground">{cde.businessDefinition}</p>
      </div>
      
      {/* Radar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Scoring Factors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RadarChart factors={cde.scoringFactors} size={220} />
          
          {/* Factor breakdown */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {factorKeys.map(key => {
              const config = SCORING_FACTOR_CONFIG[key]
              const value = cde.scoringFactors[key]
              return (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: config.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">
                        {config.label}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {value}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full mt-1">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${value}%`,
                          backgroundColor: config.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
      
      {/* AI Rationale */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            AI Rationale
            <span className="ml-auto text-xs font-normal text-muted-foreground bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              AI Generated
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {cde.aiRationale}
          </p>
        </CardContent>
      </Card>
      
      {/* Source Information */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Source Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">System</dt>
            <dd className="font-medium">{cde.sourceSystem}</dd>
            <dt className="text-muted-foreground">Table</dt>
            <dd className="font-medium font-mono text-xs">{cde.sourceTable}</dd>
            <dt className="text-muted-foreground">Field</dt>
            <dd className="font-medium font-mono text-xs">{cde.sourceField}</dd>
            <dt className="text-muted-foreground">Data Type</dt>
            <dd className="font-medium">{cde.dataType}</dd>
          </dl>
        </CardContent>
      </Card>
      
      {/* Criticality Rationale */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Criticality Rationale</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {cde.criticalityRationale}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface ScoringReviewStepProps {
  cdes: CDE[]
  selectedCDEId: string | null
  onSelectCDE: (id: string | null) => void
  summary: CDEIdentificationSummary
  onComplete: () => void
  onUploadCDEs?: (cdes: CDE[]) => void
}

export function ScoringReviewStep({
  cdes,
  selectedCDEId,
  onSelectCDE,
  summary,
  onComplete,
  onUploadCDEs,
}: ScoringReviewStepProps) {
  // Sort CDEs by score descending
  const sortedCDEs = useMemo(() => 
    [...cdes].sort((a, b) => b.overallScore - a.overallScore),
    [cdes]
  )
  
  const selectedCDE = selectedCDEId 
    ? cdes.find(c => c.id === selectedCDEId) 
    : sortedCDEs[0]
  
  // Auto-select first CDE if none selected
  if (!selectedCDEId && sortedCDEs.length > 0) {
    onSelectCDE(sortedCDEs[0].id)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          CDE Scoring Review
        </h2>
        <p className="text-muted-foreground mt-1">
          Review AI-identified Critical Data Elements and their scoring factors.
          Each CDE is scored based on regulatory importance, cross-report usage,
          financial impact, and regulatory scrutiny.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.totalCDEs}</p>
                <p className="text-xs text-muted-foreground">Total CDEs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.averageScore}</p>
                <p className="text-xs text-muted-foreground">Avg Score</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Sparkles className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{cdes.filter(c => c.overallScore >= 80).length}</p>
                <p className="text-xs text-muted-foreground">High Priority</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload CDE Inventory Option */}
      {onUploadCDEs && (
        <CDEUploadPanel onUpload={onUploadCDEs} />
      )}

      {/* Main Content - Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CDE List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Critical Data Elements</CardTitle>
            <CardDescription>
              Select a CDE to view detailed scoring breakdown
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[500px] overflow-auto pr-2">
              {sortedCDEs.map(cde => (
                <CDECard
                  key={cde.id}
                  cde={cde}
                  isSelected={selectedCDE?.id === cde.id}
                  onSelect={() => onSelectCDE(cde.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Detail Panel */}
        <div className="lg:sticky lg:top-4">
          {selectedCDE ? (
            <CDEDetailPanel cde={selectedCDE} />
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center text-muted-foreground py-12">
                <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a CDE to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete}>
          Continue to Inventory Approval
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

export default ScoringReviewStep
