/**
 * LineageExportPanel Component
 * 
 * Provides comprehensive lineage diagram export functionality for documentation.
 * Supports multiple export formats: PNG, SVG, Mermaid, and HTML.
 * 
 * Requirements: 7.5 - Generate lineage diagram export for documentation
 */

import { useState, useCallback } from 'react'
import { Node, Edge } from '@xyflow/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Download,
  Image,
  FileCode,
  Code,
  Globe,
  CheckCircle2,
  Loader2,
  FileText,
  Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  exportToPNG,
  exportToSVG,
  exportToMermaid,
  exportToHTML,
} from '@/components/lineage/lineageExport'
import { ExportFormat, LineageMappingSummary } from './types'

// ============================================================================
// Types
// ============================================================================

interface ExportConfig {
  format: ExportFormat
  filename: string
  includeMetadata: boolean
  includeBusinessTerms: boolean
  includeTimestamp: boolean
  backgroundColor: string
}

interface LineageExportPanelProps {
  nodes: Node[]
  edges: Edge[]
  summary: LineageMappingSummary
  graphElement?: HTMLElement | null
  onExportComplete?: (format: ExportFormat, filename: string) => void
}

// ============================================================================
// Format Configuration
// ============================================================================

const formatConfigs: Record<ExportFormat, {
  icon: typeof Image
  label: string
  description: string
  extension: string
}> = {
  png: {
    icon: Image,
    label: 'PNG Image',
    description: 'High-quality raster image, ideal for presentations and documents',
    extension: '.png',
  },
  svg: {
    icon: FileCode,
    label: 'SVG Vector',
    description: 'Scalable vector graphic, perfect for high-resolution printing',
    extension: '.svg',
  },
  mermaid: {
    icon: Code,
    label: 'Mermaid Markdown',
    description: 'Text-based diagram format, embeddable in documentation',
    extension: '.md',
  },
  html: {
    icon: Globe,
    label: 'Interactive HTML',
    description: 'Self-contained interactive diagram for web viewing',
    extension: '.html',
  },
}

// ============================================================================
// Helper Functions
// ============================================================================

function getTimestamp(): string {
  return new Date().toISOString().split('T')[0]
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}


// ============================================================================
// Main Component
// ============================================================================

export function LineageExportPanel({
  nodes,
  edges,
  summary,
  graphElement,
  onExportComplete,
}: LineageExportPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportSuccess, setExportSuccess] = useState<ExportFormat | null>(null)
  const [config, setConfig] = useState<ExportConfig>({
    format: 'png',
    filename: `lineage_${getTimestamp()}`,
    includeMetadata: true,
    includeBusinessTerms: true,
    includeTimestamp: true,
    backgroundColor: '#ffffff',
  })

  // Handle export
  const handleExport = useCallback(async () => {
    setIsExporting(true)
    setExportSuccess(null)
    
    const filename = config.includeTimestamp 
      ? `${config.filename}_${getTimestamp()}`
      : config.filename
    
    try {
      switch (config.format) {
        case 'png':
          if (graphElement) {
            await exportToPNG(graphElement, { 
              filename,
              backgroundColor: config.backgroundColor,
            })
          }
          break
        
        case 'svg':
          if (graphElement) {
            await exportToSVG(graphElement, { 
              filename,
              backgroundColor: config.backgroundColor,
            })
          }
          break
        
        case 'mermaid':
          const mermaidContent = exportToMermaid(nodes, edges)
          downloadFile(mermaidContent, `${filename}.md`, 'text/markdown;charset=utf-8')
          break
        
        case 'html':
          const htmlContent = exportToHTML(nodes, edges, { filename: config.filename })
          downloadFile(htmlContent, `${filename}.html`, 'text/html;charset=utf-8')
          break
      }
      
      setExportSuccess(config.format)
      onExportComplete?.(config.format, filename)
      
      // Auto-close after success
      setTimeout(() => {
        setIsOpen(false)
        setExportSuccess(null)
      }, 1500)
    } catch (error) {
      console.error(`Failed to export as ${config.format}:`, error)
    } finally {
      setIsExporting(false)
    }
  }, [config, nodes, edges, graphElement, onExportComplete])

  // Quick export buttons
  const handleQuickExport = useCallback(async (format: ExportFormat) => {
    setIsExporting(true)
    const filename = `lineage_${getTimestamp()}`
    
    try {
      switch (format) {
        case 'png':
          if (graphElement) {
            await exportToPNG(graphElement, { filename })
          }
          break
        case 'svg':
          if (graphElement) {
            await exportToSVG(graphElement, { filename })
          }
          break
        case 'mermaid':
          const mermaidContent = exportToMermaid(nodes, edges)
          downloadFile(mermaidContent, `${filename}.md`, 'text/markdown;charset=utf-8')
          break
        case 'html':
          const htmlContent = exportToHTML(nodes, edges, { filename })
          downloadFile(htmlContent, `${filename}.html`, 'text/html;charset=utf-8')
          break
      }
      onExportComplete?.(format, filename)
    } catch (error) {
      console.error(`Failed to export as ${format}:`, error)
    } finally {
      setIsExporting(false)
    }
  }, [nodes, edges, graphElement, onExportComplete])

  return (
    <div className="space-y-4">
      {/* Quick Export Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground mr-2">Quick Export:</span>
        {(Object.keys(formatConfigs) as ExportFormat[]).map((format) => {
          const formatConfig = formatConfigs[format]
          const Icon = formatConfig.icon
          const isDisabled = (format === 'png' || format === 'svg') && !graphElement
          
          return (
            <Button
              key={format}
              variant="outline"
              size="sm"
              onClick={() => handleQuickExport(format)}
              disabled={isExporting || isDisabled}
              title={isDisabled ? 'Graph element not available' : formatConfig.description}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Icon className="h-4 w-4 mr-1" />
              )}
              {formatConfig.label.split(' ')[0]}
            </Button>
          )
        })}
        
        <Separator orientation="vertical" className="h-6 mx-2" />
        
        {/* Advanced Export Dialog */}
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings2 className="h-4 w-4 mr-1" />
              Advanced
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Export Lineage Diagram
              </DialogTitle>
              <DialogDescription>
                Configure export settings for documentation
              </DialogDescription>
            </DialogHeader>
            
            {exportSuccess ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <p className="text-lg font-medium">Export Successful!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your {formatConfigs[exportSuccess].label} has been downloaded
                </p>
              </div>
            ) : (
              <div className="space-y-6 py-4">
                {/* Format Selection */}
                <div className="space-y-3">
                  <Label>Export Format</Label>
                  <RadioGroup
                    value={config.format}
                    onValueChange={(value) => setConfig(prev => ({ ...prev, format: value as ExportFormat }))}
                    className="grid grid-cols-2 gap-3"
                  >
                    {(Object.keys(formatConfigs) as ExportFormat[]).map((format) => {
                      const formatConfig = formatConfigs[format]
                      const Icon = formatConfig.icon
                      const isDisabled = (format === 'png' || format === 'svg') && !graphElement
                      
                      return (
                        <div key={format}>
                          <RadioGroupItem
                            value={format}
                            id={format}
                            className="peer sr-only"
                            disabled={isDisabled}
                          />
                          <Label
                            htmlFor={format}
                            className={cn(
                              'flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer',
                              isDisabled && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            <Icon className="h-6 w-6 mb-2" />
                            <span className="text-sm font-medium">{formatConfig.label}</span>
                          </Label>
                        </div>
                      )
                    })}
                  </RadioGroup>
                  <p className="text-xs text-muted-foreground">
                    {formatConfigs[config.format].description}
                  </p>
                </div>

                <Separator />

                {/* Filename */}
                <div className="space-y-2">
                  <Label htmlFor="filename">Filename</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="filename"
                      value={config.filename}
                      onChange={(e) => setConfig(prev => ({ ...prev, filename: e.target.value }))}
                      placeholder="lineage_export"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatConfigs[config.format].extension}
                    </span>
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <Label>Options</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeTimestamp"
                        checked={config.includeTimestamp}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, includeTimestamp: checked as boolean }))
                        }
                      />
                      <Label htmlFor="includeTimestamp" className="text-sm font-normal cursor-pointer">
                        Include timestamp in filename
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeMetadata"
                        checked={config.includeMetadata}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, includeMetadata: checked as boolean }))
                        }
                      />
                      <Label htmlFor="includeMetadata" className="text-sm font-normal cursor-pointer">
                        Include node metadata
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="includeBusinessTerms"
                        checked={config.includeBusinessTerms}
                        onCheckedChange={(checked) => 
                          setConfig(prev => ({ ...prev, includeBusinessTerms: checked as boolean }))
                        }
                      />
                      <Label htmlFor="includeBusinessTerms" className="text-sm font-normal cursor-pointer">
                        Include business term links
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Nodes:</span>
                        <span className="font-medium">{summary.totalNodes}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Edges:</span>
                        <span className="font-medium">{summary.totalEdges}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">With Terms:</span>
                        <span className="font-medium">{summary.nodesWithBusinessTerms}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Impact Rules:</span>
                        <span className="font-medium">{summary.impactRulesConfigured}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <DialogFooter>
              {!exportSuccess && (
                <>
                  <Button variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleExport} disabled={isExporting}>
                    {isExporting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </>
                    )}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Export Info */}
      <div className="text-xs text-muted-foreground">
        <FileText className="h-3 w-3 inline mr-1" />
        Export includes {summary.totalNodes} nodes and {summary.totalEdges} connections
      </div>
    </div>
  )
}

export default LineageExportPanel
