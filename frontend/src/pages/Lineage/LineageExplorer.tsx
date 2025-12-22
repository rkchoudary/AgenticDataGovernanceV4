import { useState, useCallback, useRef } from 'react'
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
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Download,
  Code,
  Share2,
  Search,
  Filter,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LineageNode, getNodeConfig, type LineageNodeData, type LineageNodeType } from '@/components/lineage/LineageNode'
import { ImpactOverlay } from '@/components/lineage/ImpactOverlay'
import {
  exportToPNG,
  exportToSVG,
  downloadMermaid,
  downloadHTML,
} from '@/components/lineage/lineageExport'

// Sample data for demonstration
const sampleNodes: LineageNodeData[] = [
  {
    id: 'src-1',
    label: 'customer_accounts',
    type: 'source_table',
    database: 'core_banking',
    schema: 'accounts',
    owner: 'Data Engineering',
    qualityScore: 95,
    status: 'healthy',
    relatedCDEs: ['CDE-001', 'CDE-002'],
  },
  {
    id: 'src-2',
    label: 'transactions',
    type: 'source_table',
    database: 'core_banking',
    schema: 'transactions',
    owner: 'Data Engineering',
    qualityScore: 88,
    status: 'warning',
    relatedCDEs: ['CDE-003'],
  },
  {
    id: 'src-3',
    label: 'market_data',
    type: 'source_table',
    database: 'market_feeds',
    schema: 'prices',
    owner: 'Market Data Team',
    qualityScore: 92,
    status: 'healthy',
  },
  {
    id: 'trans-1',
    label: 'calc_daily_balance',
    type: 'transformation',
    description: 'Calculates end-of-day account balances',
    owner: 'Data Engineering',
    relatedCDEs: ['CDE-001'],
  },
  {
    id: 'trans-2',
    label: 'aggregate_positions',
    type: 'transformation',
    description: 'Aggregates trading positions by account',
    owner: 'Risk Analytics',
    relatedCDEs: ['CDE-002', 'CDE-003'],
  },
  {
    id: 'stg-1',
    label: 'stg_account_summary',
    type: 'staging_table',
    database: 'data_warehouse',
    schema: 'staging',
    qualityScore: 91,
    status: 'healthy',
    relatedCDEs: ['CDE-001', 'CDE-002'],
  },
  {
    id: 'stg-2',
    label: 'stg_risk_metrics',
    type: 'staging_table',
    database: 'data_warehouse',
    schema: 'staging',
    qualityScore: 78,
    status: 'warning',
    relatedCDEs: ['CDE-003'],
  },
  {
    id: 'rpt-1',
    label: 'FR Y-9C Line 1',
    type: 'report_field',
    description: 'Total Assets',
    owner: 'Regulatory Reporting',
    relatedCDEs: ['CDE-001'],
  },
  {
    id: 'rpt-2',
    label: 'FR Y-9C Line 15',
    type: 'report_field',
    description: 'Trading Assets',
    owner: 'Regulatory Reporting',
    relatedCDEs: ['CDE-002', 'CDE-003'],
  },
]

const sampleEdges = [
  { id: 'e1', source: 'src-1', target: 'trans-1' },
  { id: 'e2', source: 'src-2', target: 'trans-1' },
  { id: 'e3', source: 'src-2', target: 'trans-2' },
  { id: 'e4', source: 'src-3', target: 'trans-2' },
  { id: 'e5', source: 'trans-1', target: 'stg-1' },
  { id: 'e6', source: 'trans-2', target: 'stg-1' },
  { id: 'e7', source: 'trans-2', target: 'stg-2' },
  { id: 'e8', source: 'stg-1', target: 'rpt-1' },
  { id: 'e9', source: 'stg-1', target: 'rpt-2' },
  { id: 'e10', source: 'stg-2', target: 'rpt-2' },
]

const nodeTypes = {
  lineageNode: LineageNode,
}

// Auto-layout nodes in a hierarchical structure
function layoutNodes(nodes: LineageNodeData[]): Node[] {
  const typeOrder: LineageNodeType[] = ['source_table', 'transformation', 'staging_table', 'report_field']
  const nodesByType = new Map<LineageNodeType, LineageNodeData[]>()

  nodes.forEach((node) => {
    if (!nodesByType.has(node.type)) {
      nodesByType.set(node.type, [])
    }
    nodesByType.get(node.type)!.push(node)
  })

  const result: Node[] = []
  const xSpacing = 280
  const ySpacing = 120

  typeOrder.forEach((type, colIndex) => {
    const nodesOfType = nodesByType.get(type) || []
    nodesOfType.forEach((node, rowIndex) => {
      result.push({
        id: node.id,
        type: 'lineageNode',
        position: { x: colIndex * xSpacing + 50, y: rowIndex * ySpacing + 50 },
        data: node as unknown as Record<string, unknown>,
      })
    })
  })

  return result
}

function LineageExplorerContent() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [selectedNode, setSelectedNode] = useState<LineageNodeData | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Filter nodes based on type and search
  const filteredNodes = sampleNodes.filter((node) => {
    const matchesType = filterType === 'all' || node.type === filterType
    const matchesSearch =
      !searchQuery ||
      node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.description?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesType && matchesSearch
  })

  const initialNodes = layoutNodes(filteredNodes)
  const initialEdges: Edge[] = sampleEdges
    .filter(
      (e) =>
        filteredNodes.some((n) => n.id === e.source) &&
        filteredNodes.some((n) => n.id === e.target)
    )
    .map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 20,
        height: 20,
      },
      style: { strokeWidth: 2, stroke: '#94a3b8' },
    }))

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const nodeData = node.data as unknown as LineageNodeData
    setSelectedNode((prev) => (prev?.id === nodeData.id ? null : nodeData))
  }, [])

  const handlePaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const handleExport = useCallback(
    async (format: 'png' | 'svg' | 'mermaid' | 'html') => {
      const element = reactFlowWrapper.current?.querySelector('.react-flow') as HTMLElement
      if (!element) return

      try {
        switch (format) {
          case 'png':
            await exportToPNG(element, { filename: 'data-lineage' })
            break
          case 'svg':
            await exportToSVG(element, { filename: 'data-lineage' })
            break
          case 'mermaid':
            downloadMermaid(nodes, edges, 'data-lineage')
            break
          case 'html':
            downloadHTML(nodes, edges, 'data-lineage')
            break
        }
      } catch (error) {
        console.error('Export failed:', error)
      }
    },
    [nodes, edges]
  )

  const minimapNodeColor = (node: Node) => {
    const nodeData = node.data as unknown as LineageNodeData
    const colors: Record<LineageNodeType, string> = {
      source_table: '#3b82f6',
      transformation: '#8b5cf6',
      staging_table: '#f59e0b',
      report_field: '#22c55e',
    }
    return colors[nodeData.type]
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Data Lineage Explorer</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border rounded-md text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Filter */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="source_table">Source Tables</SelectItem>
              <SelectItem value="transformation">Transformations</SelectItem>
              <SelectItem value="staging_table">Staging Tables</SelectItem>
              <SelectItem value="report_field">Report Fields</SelectItem>
            </SelectContent>
          </Select>

          {/* Export Options */}
          <div className="flex items-center gap-1 border-l pl-2 ml-2">
            <Button variant="outline" size="sm" onClick={() => handleExport('png')}>
              <Download className="h-4 w-4 mr-1" />
              PNG
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('svg')}>
              <Download className="h-4 w-4 mr-1" />
              SVG
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('mermaid')}>
              <Code className="h-4 w-4 mr-1" />
              Mermaid
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('html')}>
              <Share2 className="h-4 w-4 mr-1" />
              HTML
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
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

          {/* Legend Panel */}
          <Panel position="top-left" className="bg-white/95 p-3 rounded-lg shadow-sm border m-2">
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
          </Panel>

          {/* Stats Panel */}
          <Panel position="bottom-left" className="bg-white/95 p-3 rounded-lg shadow-sm border m-2">
            <div className="text-xs text-muted-foreground">
              <div>Nodes: {nodes.length}</div>
              <div>Edges: {edges.length}</div>
            </div>
          </Panel>
        </ReactFlow>

        {/* Impact Overlay */}
        {selectedNode && (
          <div className="absolute top-4 right-4 z-10">
            <ImpactOverlay
              selectedNode={selectedNode}
              allNodes={sampleNodes}
              edges={edges}
              onClose={() => setSelectedNode(null)}
              onNodeClick={(nodeId) => {
                const node = sampleNodes.find((n) => n.id === nodeId)
                if (node) setSelectedNode(node)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export function LineageExplorer() {
  return (
    <ReactFlowProvider>
      <LineageExplorerContent />
    </ReactFlowProvider>
  )
}

export default LineageExplorer
