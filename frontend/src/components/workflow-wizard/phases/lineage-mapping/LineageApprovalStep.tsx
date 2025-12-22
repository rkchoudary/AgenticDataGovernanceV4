/**
 * LineageApprovalStep Component
 * 
 * Step 4 of Lineage Mapping phase - Approve lineage and generate export.
 * Generates lineage diagram export for documentation.
 * 
 * Requirements: 7.5
 */

import { useState, useMemo, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  MarkerType,
  NodeProps,
  Handle,
  Position,
  EdgeProps,
  BaseEdge,
  getSmoothStepPath,
  EdgeLabelRenderer,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Database,
  GitBranch,
  Table2,
  FileText,
  CheckCircle2,
  AlertCircle,
  Tag,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  LineageNode,
  LineageEdge,
  LineageMappingSummary,
  LineageNodeType,
} from './types'
import { LineageExportPanel } from './LineageExportPanel'

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

// ============================================================================
// Custom Node Component
// ============================================================================

function LineageNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as LineageNode
  const config = nodeConfigs[nodeData.type]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg border-2 shadow-sm min-w-[180px] max-w-[220px] transition-all',
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
          <span className="font-medium text-sm truncate block">{nodeData.label}</span>
          <div className="text-xs text-muted-foreground capitalize">
            {nodeData.type.replace('_', ' ')}
          </div>
        </div>
      </div>

      {nodeData.businessTerms && nodeData.businessTerms.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {nodeData.businessTerms.slice(0, 2).map(term => (
            <Badge key={term.termId} variant="secondary" className="text-xs">
              <Tag className="h-2.5 w-2.5 mr-1" />
              {term.termName}
            </Badge>
          ))}
          {nodeData.businessTerms.length > 2 && (
            <Badge variant="secondary" className="text-xs">
              +{nodeData.businessTerms.length - 2}
            </Badge>
          )}
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
// Custom Edge Component with Tooltip
// ============================================================================

function TooltipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const transformationType = (data as { transformationType?: string })?.transformationType

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {transformationType && (
        <EdgeLabelRenderer>
          <div
            title={`${transformationType} - Transformation type between nodes`}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-semibold text-gray-700 shadow-sm cursor-default hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            {transformationType}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const edgeTypes = {
  tooltipEdge: TooltipEdge,
}

// ============================================================================
// Component Props
// ============================================================================

interface LineageApprovalStepProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
  summary: LineageMappingSummary
  approvalData: { rationale?: string; signature?: string } | null
  onApprove: (rationale: string, signature?: string) => void
  onComplete: () => void
}

// ============================================================================
// Main Component
// ============================================================================

export function LineageApprovalStep({
  nodes,
  edges,
  summary,
  approvalData,
  onApprove,
  onComplete,
}: LineageApprovalStepProps) {
  const [rationale, setRationale] = useState(approvalData?.rationale || '')
  const graphRef = useRef<HTMLDivElement>(null)

  // Convert to React Flow format
  const initialNodes: Node[] = useMemo(() => {
    return nodes.map(node => ({
      id: node.id,
      type: 'lineageNode',
      position: node.position,
      data: node as unknown as Record<string, unknown>,
    }))
  }, [nodes])

  const initialEdges: Edge[] = useMemo(() => {
    return edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'tooltipEdge',
      animated: edge.isAIGenerated,
      markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
      style: { strokeWidth: 2, stroke: '#94a3b8' },
      data: { transformationType: edge.transformationType },
    }))
  }, [edges])

  const [flowNodes, , onNodesChange] = useNodesState(initialNodes)
  const [flowEdges, , onEdgesChange] = useEdgesState(initialEdges)

  // Minimap node color
  const minimapNodeColor = (node: Node) => {
    const nodeData = node.data as unknown as LineageNode
    return nodeConfigs[nodeData.type].minimapColor
  }

  // Handle approval
  const handleApprove = () => {
    if (rationale.length >= 20) {
      onApprove(rationale)
    }
  }

  const isApproved = approvalData?.rationale !== undefined
  const canApprove = rationale.length >= 20

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Lineage Approval</h2>
        <p className="text-muted-foreground mt-1">
          Review the complete lineage mapping and approve for documentation.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{summary.totalNodes}</div>
            <div className="text-sm text-muted-foreground">Total Nodes</div>
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
            <div className="flex items-center gap-1">
              <Tag className="h-4 w-4 text-blue-500" />
              <span className="text-2xl font-bold">{summary.nodesWithBusinessTerms}</span>
            </div>
            <div className="text-sm text-muted-foreground">With Terms</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-1">
              <Bell className="h-4 w-4 text-purple-500" />
              <span className="text-2xl font-bold">{summary.impactRulesConfigured}</span>
            </div>
            <div className="text-sm text-muted-foreground">Impact Rules</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className={cn(
              'text-2xl font-bold',
              summary.scanIssuesCount === 0 ? 'text-green-600' : 'text-amber-600'
            )}>
              {summary.scanIssuesCount}
            </div>
            <div className="text-sm text-muted-foreground">Open Issues</div>
          </CardContent>
        </Card>
      </div>

      {/* Lineage Graph Preview */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-4">
            <div>
              <CardTitle className="text-lg">Lineage Diagram</CardTitle>
              <CardDescription>Final lineage mapping for approval</CardDescription>
            </div>
            {/* Export Panel - Requirements: 7.5 */}
            <LineageExportPanel
              nodes={flowNodes}
              edges={flowEdges}
              summary={summary}
              graphElement={graphRef.current?.querySelector('.react-flow') as HTMLElement | null}
              onExportComplete={(format, filename) => {
                console.log(`Exported lineage as ${format}: ${filename}`)
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 h-[400px]" ref={graphRef}>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            attributionPosition="bottom-left"
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          >
            <Background color="#e2e8f0" gap={16} />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={minimapNodeColor} zoomable pannable />
          </ReactFlow>
        </CardContent>
      </Card>

      {/* Approval Section */}
      <Card className={cn(isApproved && 'border-green-300 bg-green-50')}>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            {isApproved ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Lineage Approved
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-amber-500" />
                Approval Required
              </>
            )}
          </CardTitle>
          <CardDescription>
            {isApproved 
              ? 'The lineage mapping has been approved and is ready for documentation'
              : 'Provide your approval rationale to complete this step'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isApproved ? (
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Approval Rationale</Label>
                <p className="mt-1">{approvalData?.rationale}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Approved on {new Date().toLocaleDateString()}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Approval Rationale</Label>
                <Textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Provide your rationale for approving this lineage mapping (minimum 20 characters)..."
                  rows={4}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {rationale.length < 20 
                      ? `${20 - rationale.length} more characters required`
                      : 'Minimum requirement met'
                    }
                  </span>
                  <span>{rationale.length} / 20 min</span>
                </div>
              </div>

              <Button 
                onClick={handleApprove}
                disabled={!canApprove}
                className="w-full"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve Lineage Mapping
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Checklist Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Completion Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span>Pipeline scan reviewed ({summary.totalNodes} nodes, {summary.totalEdges} edges)</span>
            </div>
            <div className="flex items-center gap-3">
              {summary.nodesWithBusinessTerms > 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
              <span>Business terms linked ({summary.nodesWithBusinessTerms} of {summary.totalNodes} nodes)</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span>Impact analysis configured ({summary.impactRulesConfigured} rules)</span>
            </div>
            <div className="flex items-center gap-3">
              {isApproved ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
              <span>Lineage approved {isApproved ? '✓' : '(pending)'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          {isApproved ? (
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              Lineage mapping approved. Ready to proceed.
            </span>
          ) : (
            <span className="text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Approve the lineage mapping to continue
            </span>
          )}
        </div>
        <Button onClick={onComplete} disabled={!isApproved}>
          Complete Lineage Mapping Phase
        </Button>
      </div>
    </div>
  )
}

export default LineageApprovalStep
