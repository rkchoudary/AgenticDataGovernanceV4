/**
 * PipelineScanStep Component
 * 
 * Step 1 of Lineage Mapping phase - Review discovered lineage from pipeline scans.
 * Displays interactive graph with zoom, pan, and node expansion controls.
 * 
 * Requirements: 7.1, 7.2
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Panel,
  MarkerType,
  NodeProps,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Database,
  GitBranch,
  Table2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Info,
  Maximize2,
  Sparkles,
  Upload,
  Download,
  FileSpreadsheet,
  Wrench,
  ClipboardCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  LineageNode,
  LineageEdge,
  PipelineScanResult,
  ScanIssue,
  LineageMappingSummary,
  LineageNodeType,
} from './types'

// ============================================================================
// Node Configuration
// ============================================================================

const nodeConfigs: Record<LineageNodeType, {
  icon: typeof Database
  bgColor: string
  borderColor: string
  iconBg: string
  iconColor: string
  minimapColor: string
}> = {
  source_table: {
    icon: Database,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    minimapColor: '#3b82f6',
  },
  transformation: {
    icon: GitBranch,
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    minimapColor: '#8b5cf6',
  },
  staging_table: {
    icon: Table2,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    minimapColor: '#f59e0b',
  },
  report_field: {
    icon: FileText,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    minimapColor: '#22c55e',
  },
}

const statusIcons = {
  healthy: { icon: CheckCircle2, color: 'text-green-500' },
  warning: { icon: AlertCircle, color: 'text-amber-500' },
  error: { icon: AlertTriangle, color: 'text-red-500' },
  unknown: { icon: Info, color: 'text-gray-400' },
}

// ============================================================================
// Custom Node Component
// ============================================================================

function LineageNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as LineageNode
  const config = nodeConfigs[nodeData.type]
  const Icon = config.icon
  const StatusIcon = statusIcons[nodeData.status].icon

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg border-2 shadow-sm min-w-[180px] max-w-[220px] transition-all cursor-pointer',
        config.bgColor,
        config.borderColor,
        selected && 'ring-2 ring-blue-500 ring-offset-2 shadow-md'
      )}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-slate-400" />
      
      <div className="flex items-start gap-2">
        <div className={cn('p-1.5 rounded shrink-0', config.iconBg)}>
          <Icon className={cn('h-4 w-4', config.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-medium text-sm truncate">{nodeData.label}</span>
            <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', statusIcons[nodeData.status].color)} />
          </div>
          <div className="text-xs text-muted-foreground capitalize">
            {nodeData.type.replace('_', ' ')}
          </div>
        </div>
      </div>

      {nodeData.qualityScore !== undefined && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
            <div
              className={cn(
                'h-1.5 rounded-full',
                nodeData.qualityScore >= 90 ? 'bg-green-500' :
                nodeData.qualityScore >= 70 ? 'bg-amber-500' : 'bg-red-500'
              )}
              style={{ width: `${nodeData.qualityScore}%` }}
            />
          </div>
          <span className="text-xs font-medium">{nodeData.qualityScore}%</span>
        </div>
      )}

      {nodeData.relatedCDEs.length > 0 && (
        <div className="mt-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
            {nodeData.relatedCDEs.length} CDE{nodeData.relatedCDEs.length > 1 ? 's' : ''}
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-slate-400" />
    </div>
  )
}

const nodeTypes = {
  lineageNode: LineageNodeComponent,
}

// ============================================================================
// Lineage Template
// ============================================================================

const LINEAGE_TEMPLATE_CSV = `cde_id,cde_name,source_database,source_schema,source_table,source_column,target_report_field,data_owner,description
CDE-001,Customer LTV Ratio,DW_PROD,RAW,customer_data,ltv_ratio,FR Y-14A Schedule A.1 Field 15,Risk Management Team,Loan-to-value ratio for customer accounts
CDE-002,Account Balance,DW_PROD,CORE,account_master,current_balance,FR Y-14A Schedule A.1 Field 8,Finance Team,Current account balance
CDE-003,Transaction Amount,DW_PROD,RAW,transaction_log,amount,FR Y-14A Schedule H.1 Field 12,Operations Team,Individual transaction amount
CDE-004,Credit Score,DW_PROD,RISK,credit_scores,fico_score,FR Y-14A Schedule A.2 Field 3,Risk Analytics,Customer credit score from bureau`

// ============================================================================
// Component Props
// ============================================================================

interface PipelineScanStepProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
  scanResult: PipelineScanResult
  issues: ScanIssue[]
  selectedNodeId: string | null
  onSelectNode: (nodeId: string | null) => void
  onResolveIssue: (issueId: string) => void
  onUploadLineageFile?: (file: File) => void
  summary: LineageMappingSummary
  onComplete: () => void
}

// ============================================================================
// Main Component
// ============================================================================

export function PipelineScanStep({
  nodes,
  edges,
  scanResult,
  issues,
  selectedNodeId,
  onSelectNode,
  onResolveIssue,
  onUploadLineageFile,
  summary,
  onComplete,
}: PipelineScanStepProps) {
  const [showDetails, setShowDetails] = useState(true)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Resolution dialog state
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
  const [selectedIssue, setSelectedIssue] = useState<ScanIssue | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [acceptedResolution, setAcceptedResolution] = useState(false)
  
  // Resolution method selection
  const [resolutionMethod, setResolutionMethod] = useState<'upload' | 'manual' | 'defer' | null>(null)
  
  // Manual lineage entry state
  const [manualLineage, setManualLineage] = useState({
    sourceDatabase: '',
    sourceSchema: '',
    sourceTable: '',
    sourceColumn: '',
    targetReportField: '',
    dataOwner: '',
  })

  // Reset manual lineage when dialog opens
  const handleOpenResolveDialog = useCallback((issue: ScanIssue) => {
    setSelectedIssue(issue)
    setResolutionNote('')
    setAcceptedResolution(false)
    setResolutionMethod(null)
    setManualLineage({
      sourceDatabase: '',
      sourceSchema: '',
      sourceTable: '',
      sourceColumn: '',
      targetReportField: '',
      dataOwner: '',
    })
    setResolveDialogOpen(true)
  }, [])

  // Confirm resolution
  const handleConfirmResolution = useCallback(() => {
    if (selectedIssue && acceptedResolution) {
      onResolveIssue(selectedIssue.id)
      setResolveDialogOpen(false)
      setSelectedIssue(null)
      setResolutionNote('')
      setAcceptedResolution(false)
      setResolutionMethod(null)
    }
  }, [selectedIssue, acceptedResolution, onResolveIssue])

  // Handle template download
  const handleDownloadTemplate = useCallback(() => {
    const blob = new Blob([LINEAGE_TEMPLATE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lineage_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [])

  // Handle file upload
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setUploadedFileName(file.name)
      onUploadLineageFile?.(file)
    }
  }, [onUploadLineageFile])

  // Trigger file input click
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Convert to React Flow format
  const initialNodes: Node[] = useMemo(() => {
    return nodes.map(node => ({
      id: node.id,
      type: 'lineageNode',
      position: node.position,
      data: node as unknown as Record<string, unknown>,
      selected: node.id === selectedNodeId,
    }))
  }, [nodes, selectedNodeId])

  const initialEdges: Edge[] = useMemo(() => {
    return edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: edge.isAIGenerated,
      markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
      style: { strokeWidth: 2 },
      label: edge.transformationType,
    }))
  }, [edges])

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initialNodes)
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync flow nodes/edges when source data changes
  useEffect(() => {
    setFlowNodes(initialNodes)
  }, [initialNodes, setFlowNodes])

  useEffect(() => {
    setFlowEdges(initialEdges)
  }, [initialEdges, setFlowEdges])

  // Get selected node details
  const selectedNode = useMemo(() => {
    return nodes.find(n => n.id === selectedNodeId)
  }, [nodes, selectedNodeId])

  // Handle node click
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onSelectNode(selectedNodeId === node.id ? null : node.id)
  }, [onSelectNode, selectedNodeId])

  const handlePaneClick = useCallback(() => {
    onSelectNode(null)
  }, [onSelectNode])

  // Minimap node color
  const minimapNodeColor = (node: Node) => {
    const nodeData = node.data as unknown as LineageNode
    return nodeConfigs[nodeData.type].minimapColor
  }

  const canComplete = issues.length === 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Pipeline Scan Review</h2>
        <p className="text-muted-foreground mt-1">
          Review the discovered data lineage from pipeline scans. Verify connections and resolve any issues.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{summary.totalNodes}</div>
            <div className="text-sm text-muted-foreground">Nodes Discovered</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{summary.totalEdges}</div>
            <div className="text-sm text-muted-foreground">Connections</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{summary.healthyNodes}</div>
            <div className="text-sm text-muted-foreground">Healthy Nodes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            {(() => {
              const cdeIssues = issues.filter(i => i.type === 'cde_missing_lineage').length
              const totalCDEs = cdeIssues + new Set(nodes.flatMap(n => n.relatedCDEs)).size
              const coveredCDEs = totalCDEs - cdeIssues
              return (
                <>
                  <div className={cn('text-2xl font-bold', cdeIssues > 0 ? 'text-red-600' : 'text-green-600')}>
                    {coveredCDEs}/{totalCDEs}
                  </div>
                  <div className="text-sm text-muted-foreground">CDEs with Lineage</div>
                </>
              )
            })()}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className={cn('text-2xl font-bold', issues.length > 0 ? 'text-amber-600' : 'text-green-600')}>
              {issues.length}
            </div>
            <div className="text-sm text-muted-foreground">Issues to Resolve</div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Lineage File Section */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium">Import Lineage Data</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Upload a CSV file with your lineage data or download the template to get started.
                </p>
                {uploadedFileName && (
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {uploadedFileName}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="flex-1 sm:flex-none"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleUploadClick}
                className="flex-1 sm:flex-none"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload File
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Issues Banner - Always visible when there are issues */}
      {issues.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              {issues.length} Issue{issues.length !== 1 ? 's' : ''} Requiring Resolution
            </CardTitle>
            <CardDescription>
              {issues.filter(i => i.type === 'cde_missing_lineage').length > 0 && (
                <span className="text-red-600">
                  {issues.filter(i => i.type === 'cde_missing_lineage').length} CDE(s) from previous steps need lineage mapping
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {issues.map(issue => (
                <div 
                  key={issue.id} 
                  className={cn(
                    "p-3 bg-white rounded-lg border",
                    issue.type === 'cde_missing_lineage' 
                      ? "border-red-200" 
                      : "border-amber-200"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-xs",
                            issue.severity === 'high' 
                              ? "border-red-400 text-red-700" 
                              : "border-amber-400 text-amber-700"
                          )}
                        >
                          {issue.severity}
                        </Badge>
                        <span className="text-xs text-muted-foreground capitalize">
                          {issue.type.replace(/_/g, ' ')}
                        </span>
                        {issue.type === 'cde_missing_lineage' && issue.cdeName && (
                          <Badge variant="secondary" className="text-xs bg-red-100 text-red-700">
                            {issue.cdeName}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">{issue.description}</p>
                      {issue.suggestedAction && (
                        <p className="text-xs text-muted-foreground mt-1">
                          💡 {issue.suggestedAction}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      className="shrink-0 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleOpenResolveDialog(issue)}
                    >
                      <Wrench className="h-4 w-4 mr-1" />
                      Resolve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lineage Graph */}
        <Card className={cn('lg:col-span-2', showDetails ? '' : 'lg:col-span-3')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Data Lineage Graph</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDetails(!showDetails)}
                >
                  {showDetails ? <Maximize2 className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 h-[500px]">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-left"
            >
              <Background color="#e2e8f0" gap={16} />
              <Controls />
              <MiniMap nodeColor={minimapNodeColor} zoomable pannable />
              
              {/* Legend Panel */}
              <Panel position="top-left" className="bg-white/90 p-3 rounded-lg shadow-sm border">
                <div className="text-sm font-medium mb-2">Legend</div>
                <div className="space-y-1.5">
                  {(['source_table', 'transformation', 'staging_table', 'report_field'] as LineageNodeType[]).map(type => {
                    const config = nodeConfigs[type]
                    const Icon = config.icon
                    return (
                      <div key={type} className="flex items-center gap-2 text-xs">
                        <div className={cn('p-1 rounded', config.iconBg)}>
                          <Icon className={cn('h-3 w-3', config.iconColor)} />
                        </div>
                        <span className="capitalize">{type.replace('_', ' ')}</span>
                      </div>
                    )
                  })}
                </div>
                <Separator className="my-2" />
                <div className="flex items-center gap-2 text-xs">
                  <Sparkles className="h-3 w-3 text-purple-500" />
                  <span>AI-discovered connection</span>
                </div>
              </Panel>
            </ReactFlow>
          </CardContent>
        </Card>

        {/* Details Panel */}
        {showDetails && (
          <div className="space-y-4">
            {/* Scan Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Scan Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pipeline</span>
                  <span className="font-medium">{scanResult.pipelineName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={scanResult.status === 'completed' ? 'default' : 'secondary'}>
                    {scanResult.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scan Date</span>
                  <span>{new Date(scanResult.scanDate).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>

            {/* Selected Node Details */}
            {selectedNode && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Node Details</CardTitle>
                  <CardDescription className="truncate">{selectedNode.label}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="capitalize">{selectedNode.type.replace('_', ' ')}</span>
                  </div>
                  {selectedNode.database && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Database</span>
                      <span>{selectedNode.database}</span>
                    </div>
                  )}
                  {selectedNode.schema && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Schema</span>
                      <span>{selectedNode.schema}</span>
                    </div>
                  )}
                  {selectedNode.owner && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Owner</span>
                      <span>{selectedNode.owner}</span>
                    </div>
                  )}
                  {selectedNode.qualityScore !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quality Score</span>
                      <span className={cn(
                        'font-medium',
                        selectedNode.qualityScore >= 90 ? 'text-green-600' :
                        selectedNode.qualityScore >= 70 ? 'text-amber-600' : 'text-red-600'
                      )}>
                        {selectedNode.qualityScore}%
                      </span>
                    </div>
                  )}
                  {selectedNode.description && (
                    <div>
                      <span className="text-muted-foreground">Description</span>
                      <p className="mt-1 text-xs">{selectedNode.description}</p>
                    </div>
                  )}
                  {selectedNode.relatedCDEs.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Related CDEs</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedNode.relatedCDEs.map(cde => (
                          <Badge key={cde} variant="secondary" className="text-xs">
                            {cde}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          {canComplete ? (
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              All issues resolved. Ready to proceed.
            </span>
          ) : (
            <span className="text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              Resolve {issues.length} issue(s) to continue
            </span>
          )}
        </div>
        <Button onClick={onComplete} disabled={!canComplete}>
          Continue to Business Terms
        </Button>
      </div>

      {/* Resolution Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-amber-600" />
              Resolve Issue
            </DialogTitle>
            <DialogDescription>
              Review the issue details and confirm the resolution action.
            </DialogDescription>
          </DialogHeader>

          {selectedIssue && (
            <div className="space-y-4 py-4">
              {/* Issue Details */}
              <div className={cn(
                "border rounded-lg p-4 space-y-3",
                selectedIssue.type === 'cde_missing_lineage' 
                  ? "bg-red-50 border-red-200" 
                  : "bg-amber-50 border-amber-200"
              )}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className={cn(
                    "h-5 w-5",
                    selectedIssue.type === 'cde_missing_lineage' ? "text-red-600" : "text-amber-600"
                  )} />
                  <span className="font-medium">
                    {selectedIssue.type === 'cde_missing_lineage' ? 'CDE Missing Lineage' : 'Issue Details'}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Type:</span>
                    <span className="ml-2 capitalize">{selectedIssue.type.replace(/_/g, ' ')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Severity:</span>
                    <Badge variant="outline" className={cn(
                      "ml-2 text-xs",
                      selectedIssue.severity === 'high' 
                        ? "border-red-400 text-red-700" 
                        : "border-amber-400 text-amber-700"
                    )}>
                      {selectedIssue.severity}
                    </Badge>
                  </div>
                </div>

                {/* CDE-specific information */}
                {selectedIssue.type === 'cde_missing_lineage' && selectedIssue.cdeId && (
                  <div className="text-sm space-y-2">
                    <div>
                      <span className="text-muted-foreground">CDE ID:</span>
                      <span className="ml-2 font-mono text-xs bg-red-100 px-2 py-0.5 rounded">
                        {selectedIssue.cdeId}
                      </span>
                    </div>
                    {selectedIssue.cdeName && (
                      <div>
                        <span className="text-muted-foreground">CDE Name:</span>
                        <span className="ml-2 font-medium">{selectedIssue.cdeName}</span>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="text-sm">
                  <span className="text-muted-foreground">Description:</span>
                  <p className="mt-1 font-medium">{selectedIssue.description}</p>
                </div>

                {selectedIssue.nodeId && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Affected Node:</span>
                    <span className="ml-2 font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                      {selectedIssue.nodeId}
                    </span>
                  </div>
                )}
              </div>

              {/* Suggested Resolution */}
              {selectedIssue.suggestedAction && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-blue-800">Suggested Resolution</span>
                  </div>
                  <p className="text-sm text-blue-700">{selectedIssue.suggestedAction}</p>
                </div>
              )}

              {/* CDE Lineage Resolution Options */}
              {selectedIssue.type === 'cde_missing_lineage' && (
                <div className="space-y-4">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Info className="h-5 w-5 text-purple-600" />
                      <span className="font-medium text-purple-800">Choose Resolution Method</span>
                    </div>
                    
                    {/* Option 1: Upload Lineage File */}
                    <div 
                      className={cn(
                        "bg-white rounded-lg border p-3 cursor-pointer transition-all",
                        resolutionMethod === 'upload' 
                          ? "border-blue-400 ring-2 ring-blue-200" 
                          : "border-purple-100 hover:border-purple-300"
                      )}
                      onClick={() => setResolutionMethod('upload')}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="resolutionMethod"
                          checked={resolutionMethod === 'upload'}
                          onChange={() => setResolutionMethod('upload')}
                          className="mt-1 h-4 w-4 text-blue-600"
                        />
                        <div className="p-2 bg-blue-50 rounded-lg shrink-0">
                          <Upload className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">Upload Lineage Document</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Upload a CSV or Excel file containing lineage data for this CDE
                          </p>
                          {resolutionMethod === 'upload' && (
                            <div className="flex items-center gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(); }}
                                className="text-xs h-7"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                Template
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleUploadClick(); }}
                                className="text-xs h-7"
                              >
                                <Upload className="h-3 w-3 mr-1" />
                                Upload File
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Option 2: Manual Entry */}
                    <div 
                      className={cn(
                        "bg-white rounded-lg border p-3 cursor-pointer transition-all",
                        resolutionMethod === 'manual' 
                          ? "border-amber-400 ring-2 ring-amber-200" 
                          : "border-purple-100 hover:border-purple-300"
                      )}
                      onClick={() => setResolutionMethod('manual')}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="resolutionMethod"
                          checked={resolutionMethod === 'manual'}
                          onChange={() => setResolutionMethod('manual')}
                          className="mt-1 h-4 w-4 text-amber-600"
                        />
                        <div className="p-2 bg-amber-50 rounded-lg shrink-0">
                          <FileText className="h-4 w-4 text-amber-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">Enter Lineage Manually</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Provide source system details for this CDE
                          </p>
                          {resolutionMethod === 'manual' && (
                            <div className="grid grid-cols-2 gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                              <div>
                                <Label className="text-xs">Source Database</Label>
                                <input
                                  type="text"
                                  placeholder="e.g., DW_PROD"
                                  value={manualLineage.sourceDatabase}
                                  onChange={(e) => setManualLineage(prev => ({ ...prev, sourceDatabase: e.target.value }))}
                                  className="w-full mt-1 px-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Source Schema</Label>
                                <input
                                  type="text"
                                  placeholder="e.g., RAW"
                                  value={manualLineage.sourceSchema}
                                  onChange={(e) => setManualLineage(prev => ({ ...prev, sourceSchema: e.target.value }))}
                                  className="w-full mt-1 px-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Source Table</Label>
                                <input
                                  type="text"
                                  placeholder="e.g., customer_data"
                                  value={manualLineage.sourceTable}
                                  onChange={(e) => setManualLineage(prev => ({ ...prev, sourceTable: e.target.value }))}
                                  className="w-full mt-1 px-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Source Column</Label>
                                <input
                                  type="text"
                                  placeholder="e.g., ltv_ratio"
                                  value={manualLineage.sourceColumn}
                                  onChange={(e) => setManualLineage(prev => ({ ...prev, sourceColumn: e.target.value }))}
                                  className="w-full mt-1 px-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                              <div className="col-span-2">
                                <Label className="text-xs">Target Report Field</Label>
                                <input
                                  type="text"
                                  placeholder="e.g., FR Y-14A Schedule A.1 Field 15"
                                  value={manualLineage.targetReportField}
                                  onChange={(e) => setManualLineage(prev => ({ ...prev, targetReportField: e.target.value }))}
                                  className="w-full mt-1 px-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                              <div className="col-span-2">
                                <Label className="text-xs">Data Owner</Label>
                                <input
                                  type="text"
                                  placeholder="e.g., Risk Management Team"
                                  value={manualLineage.dataOwner}
                                  onChange={(e) => setManualLineage(prev => ({ ...prev, dataOwner: e.target.value }))}
                                  className="w-full mt-1 px-2 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Option 3: Defer Resolution */}
                    <div 
                      className={cn(
                        "bg-white rounded-lg border p-3 cursor-pointer transition-all",
                        resolutionMethod === 'defer' 
                          ? "border-gray-400 ring-2 ring-gray-200" 
                          : "border-purple-100 hover:border-purple-300"
                      )}
                      onClick={() => setResolutionMethod('defer')}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="resolutionMethod"
                          checked={resolutionMethod === 'defer'}
                          onChange={() => setResolutionMethod('defer')}
                          className="mt-1 h-4 w-4 text-gray-600"
                        />
                        <div className="p-2 bg-gray-50 rounded-lg shrink-0">
                          <AlertCircle className="h-4 w-4 text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-sm">Defer to Future Cycle</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Mark as acknowledged - lineage will be added in a future reporting cycle
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Resolution Note */}
              <div className="space-y-2">
                <Label htmlFor="resolution-note">Resolution Note (Optional)</Label>
                <Textarea
                  id="resolution-note"
                  placeholder={selectedIssue.type === 'cde_missing_lineage' 
                    ? "Describe how lineage will be established for this CDE (e.g., 'Lineage data uploaded', 'Will be added in next cycle', 'Source system not yet integrated')..."
                    : "Describe what action was taken to resolve this issue..."
                  }
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Acceptance Checkbox */}
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border">
                <Checkbox
                  id="accept-resolution"
                  checked={acceptedResolution}
                  onCheckedChange={(checked) => setAcceptedResolution(checked as boolean)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label htmlFor="accept-resolution" className="cursor-pointer font-medium">
                    {selectedIssue.type === 'cde_missing_lineage'
                      ? "I confirm this CDE lineage gap has been reviewed and addressed"
                      : "I confirm this issue has been reviewed and resolved"
                    }
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedIssue.type === 'cde_missing_lineage'
                      ? "By checking this box, you acknowledge that the CDE lineage gap has been addressed or documented for future resolution."
                      : "By checking this box, you acknowledge that the issue has been addressed and the lineage data is accurate for this node."
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmResolution}
              disabled={!acceptedResolution}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Confirm Resolution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default PipelineScanStep
