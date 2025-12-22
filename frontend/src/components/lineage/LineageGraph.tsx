import { useCallback, useState, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  Panel,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Database,
  GitBranch,
  Table2,
  FileText,
  Download,
  Code,
  Share2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Node types for lineage
export type LineageNodeType = 'source_table' | 'transformation' | 'staging_table' | 'report_field'

export interface LineageNodeData {
  id: string
  label: string
  type: LineageNodeType
  description?: string
  owner?: string
  database?: string
  schema?: string
  relatedCDEs?: string[]
  metadata?: Record<string, string>
}

export interface LineageEdgeData {
  id: string
  source: string
  target: string
  transformationType?: string
  description?: string
}

interface LineageGraphProps {
  nodes: LineageNodeData[]
  edges: LineageEdgeData[]
  onNodeSelect?: (node: LineageNodeData | null) => void
  onExport?: (format: 'png' | 'svg' | 'mermaid' | 'html') => void
  className?: string
  highlightedNodeId?: string
}

// Custom node component for lineage nodes
function LineageNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as LineageNodeData
  const nodeConfig = getNodeConfig(nodeData.type)
  const Icon = nodeConfig.icon

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg border-2 shadow-sm min-w-[160px] transition-all',
        nodeConfig.bgColor,
        nodeConfig.borderColor,
        selected && 'ring-2 ring-blue-500 ring-offset-2'
      )}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3" />
      <div className="flex items-center gap-2">
        <div className={cn('p-1.5 rounded', nodeConfig.iconBg)}>
          <Icon className={cn('h-4 w-4', nodeConfig.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{nodeData.label}</div>
          <div className="text-xs text-muted-foreground truncate">
            {nodeData.type.replace('_', ' ')}
          </div>
        </div>
      </div>
      {nodeData.description && (
        <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
          {nodeData.description}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="w-3 h-3" />
    </div>
  )
}

function getNodeConfig(type: LineageNodeType) {
  const configs = {
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
  return configs[type]
}

const nodeTypes = {
  lineageNode: LineageNode,
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
  selected,
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
            className={cn(
              'px-2 py-1 bg-white border border-gray-300 rounded text-xs font-semibold text-gray-700 shadow-sm cursor-default hover:bg-gray-50 hover:border-gray-400 transition-colors',
              selected && 'border-blue-400 bg-blue-50'
            )}
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

export function LineageGraph({
  nodes: inputNodes,
  edges: inputEdges,
  onNodeSelect,
  onExport,
  className,
  highlightedNodeId,
}: LineageGraphProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Convert input data to React Flow format
  const initialNodes: Node[] = useMemo(() => {
    return inputNodes.map((node, index) => ({
      id: node.id,
      type: 'lineageNode',
      position: { x: (index % 4) * 250, y: Math.floor(index / 4) * 150 },
      data: node as unknown as Record<string, unknown>,
    }))
  }, [inputNodes])

  const initialEdges: Edge[] = useMemo(() => {
    return inputEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'tooltipEdge',
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
      },
      style: { strokeWidth: 2, stroke: '#94a3b8' },
      data: { transformationType: edge.transformationType },
    }))
  }, [inputEdges])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Find upstream and downstream nodes
  const { upstreamNodes, downstreamNodes } = useMemo(() => {
    if (!selectedNode) return { upstreamNodes: new Set<string>(), downstreamNodes: new Set<string>() }

    const upstream = new Set<string>()
    const downstream = new Set<string>()

    // Find upstream (sources)
    const findUpstream = (nodeId: string) => {
      edges.forEach((edge) => {
        if (edge.target === nodeId && !upstream.has(edge.source)) {
          upstream.add(edge.source)
          findUpstream(edge.source)
        }
      })
    }

    // Find downstream (targets)
    const findDownstream = (nodeId: string) => {
      edges.forEach((edge) => {
        if (edge.source === nodeId && !downstream.has(edge.target)) {
          downstream.add(edge.target)
          findDownstream(edge.target)
        }
      })
    }

    findUpstream(selectedNode)
    findDownstream(selectedNode)

    return { upstreamNodes: upstream, downstreamNodes: downstream }
  }, [selectedNode, edges])

  // Update node styles based on selection
  const styledNodes = useMemo(() => {
    return nodes.map((node) => {
      const isSelected = node.id === selectedNode
      const isUpstream = upstreamNodes.has(node.id)
      const isDownstream = downstreamNodes.has(node.id)
      const isHighlighted = node.id === highlightedNodeId

      let opacity = 1
      if (selectedNode && !isSelected && !isUpstream && !isDownstream) {
        opacity = 0.3
      }

      return {
        ...node,
        style: {
          ...node.style,
          opacity,
        },
        className: cn(
          isUpstream && 'ring-2 ring-blue-400',
          isDownstream && 'ring-2 ring-green-400',
          isHighlighted && 'ring-2 ring-yellow-400'
        ),
      }
    })
  }, [nodes, selectedNode, upstreamNodes, downstreamNodes, highlightedNodeId])

  // Update edge styles based on selection
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      const isUpstreamEdge = upstreamNodes.has(edge.source) || edge.target === selectedNode
      const isDownstreamEdge = downstreamNodes.has(edge.target) || edge.source === selectedNode

      let strokeColor = '#94a3b8'
      let animated = false

      if (selectedNode) {
        if (isUpstreamEdge && (upstreamNodes.has(edge.source) || edge.target === selectedNode)) {
          strokeColor = '#3b82f6'
          animated = true
        } else if (isDownstreamEdge && (downstreamNodes.has(edge.target) || edge.source === selectedNode)) {
          strokeColor = '#22c55e'
          animated = true
        } else {
          strokeColor = '#e2e8f0'
        }
      }

      return {
        ...edge,
        animated,
        style: { ...edge.style, stroke: strokeColor },
      }
    })
  }, [edges, selectedNode, upstreamNodes, downstreamNodes])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const nodeData = node.data as unknown as LineageNodeData
      setSelectedNode((prev) => (prev === node.id ? null : node.id))
      onNodeSelect?.(selectedNode === node.id ? null : nodeData)
    },
    [onNodeSelect, selectedNode]
  )

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null)
    onNodeSelect?.(null)
  }, [onNodeSelect])

  const minimapNodeColor = (node: Node) => {
    const nodeData = node.data as unknown as LineageNodeData
    return getNodeConfig(nodeData.type).minimapColor
  }

  return (
    <Card className={cn('h-[600px]', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Data Lineage
          </CardTitle>
          <div className="flex items-center gap-2">
            {onExport && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onExport('png')}
                  title="Export as PNG"
                >
                  <Download className="h-4 w-4 mr-1" />
                  PNG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onExport('svg')}
                  title="Export as SVG"
                >
                  <Download className="h-4 w-4 mr-1" />
                  SVG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onExport('mermaid')}
                  title="Export as Mermaid"
                >
                  <Code className="h-4 w-4 mr-1" />
                  Mermaid
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 h-[calc(100%-60px)]">
        <ReactFlow
          nodes={styledNodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          attributionPosition="bottom-left"
        >
          <Background color="#e2e8f0" gap={16} />
          <Controls />
          <MiniMap
            nodeColor={minimapNodeColor}
            nodeStrokeWidth={3}
            zoomable
            pannable
          />
          <Panel position="top-left" className="bg-white/90 p-3 rounded-lg shadow-sm border">
            <div className="text-sm font-medium mb-2">Legend</div>
            <div className="space-y-1.5">
              {(['source_table', 'transformation', 'staging_table', 'report_field'] as LineageNodeType[]).map(
                (type) => {
                  const config = getNodeConfig(type)
                  const Icon = config.icon
                  return (
                    <div key={type} className="flex items-center gap-2 text-xs">
                      <div className={cn('p-1 rounded', config.iconBg)}>
                        <Icon className={cn('h-3 w-3', config.iconColor)} />
                      </div>
                      <span className="capitalize">{type.replace('_', ' ')}</span>
                    </div>
                  )
                }
              )}
            </div>
            {selectedNode && (
              <div className="mt-3 pt-3 border-t">
                <div className="text-xs text-muted-foreground mb-1">Highlighting</div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded bg-blue-400" />
                  <span>Upstream ({upstreamNodes.size})</span>
                </div>
                <div className="flex items-center gap-2 text-xs mt-1">
                  <div className="w-3 h-3 rounded bg-green-400" />
                  <span>Downstream ({downstreamNodes.size})</span>
                </div>
              </div>
            )}
          </Panel>
        </ReactFlow>
      </CardContent>
    </Card>
  )
}

export default LineageGraph
