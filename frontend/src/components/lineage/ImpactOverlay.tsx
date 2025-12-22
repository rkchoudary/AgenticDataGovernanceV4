import { useMemo } from 'react'
import { Edge } from '@xyflow/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  X,
  Database,
  GitBranch,
  Table2,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LineageNodeData, LineageNodeType } from './LineageNode'

interface ImpactOverlayProps {
  selectedNode: LineageNodeData | null
  allNodes: LineageNodeData[]
  edges: Edge[]
  onClose: () => void
  onNodeClick: (nodeId: string) => void
  className?: string
}

const nodeIcons: Record<LineageNodeType, typeof Database> = {
  source_table: Database,
  transformation: GitBranch,
  staging_table: Table2,
  report_field: FileText,
}

export function ImpactOverlay({
  selectedNode,
  allNodes,
  edges,
  onClose,
  onNodeClick,
  className,
}: ImpactOverlayProps) {
  // Calculate upstream and downstream nodes
  const { upstreamNodes, downstreamNodes, impactedCDEs, impactedReports } = useMemo(() => {
    if (!selectedNode) {
      return {
        upstreamNodes: [],
        downstreamNodes: [],
        impactedCDEs: new Set<string>(),
        impactedReports: [],
      }
    }

    const upstreamIds = new Set<string>()
    const downstreamIds = new Set<string>()

    // Find upstream (sources)
    const findUpstream = (nodeId: string) => {
      edges.forEach((edge) => {
        if (edge.target === nodeId && !upstreamIds.has(edge.source)) {
          upstreamIds.add(edge.source)
          findUpstream(edge.source)
        }
      })
    }

    // Find downstream (targets)
    const findDownstream = (nodeId: string) => {
      edges.forEach((edge) => {
        if (edge.source === nodeId && !downstreamIds.has(edge.target)) {
          downstreamIds.add(edge.target)
          findDownstream(edge.target)
        }
      })
    }

    findUpstream(selectedNode.id)
    findDownstream(selectedNode.id)

    const upstream = allNodes.filter((n) => upstreamIds.has(n.id))
    const downstream = allNodes.filter((n) => downstreamIds.has(n.id))

    // Collect impacted CDEs
    const cdes = new Set<string>()
    ;[selectedNode, ...downstream].forEach((node) => {
      node.relatedCDEs?.forEach((cde) => cdes.add(cde))
    })

    // Find impacted reports (report_field nodes in downstream)
    const reports = downstream.filter((n) => n.type === 'report_field')

    return {
      upstreamNodes: upstream,
      downstreamNodes: downstream,
      impactedCDEs: cdes,
      impactedReports: reports,
    }
  }, [selectedNode, allNodes, edges])

  if (!selectedNode) return null

  const Icon = nodeIcons[selectedNode.type]

  return (
    <Card className={cn('w-80 shadow-lg', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Impact Analysis
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selected Node */}
        <div className="p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">{selectedNode.label}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {selectedNode.type.replace('_', ' ')}
          </div>
        </div>

        {/* Impact Summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-blue-50 rounded-lg text-center">
            <div className="text-lg font-bold text-blue-600">{upstreamNodes.length}</div>
            <div className="text-xs text-blue-600">Upstream</div>
          </div>
          <div className="p-2 bg-green-50 rounded-lg text-center">
            <div className="text-lg font-bold text-green-600">{downstreamNodes.length}</div>
            <div className="text-xs text-green-600">Downstream</div>
          </div>
        </div>

        {/* Impacted CDEs */}
        {impactedCDEs.size > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Impacted CDEs ({impactedCDEs.size})
            </div>
            <div className="flex flex-wrap gap-1">
              {Array.from(impactedCDEs)
                .slice(0, 8)
                .map((cde) => (
                  <span
                    key={cde}
                    className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs"
                  >
                    {cde}
                  </span>
                ))}
              {impactedCDEs.size > 8 && (
                <span className="text-xs text-muted-foreground">
                  +{impactedCDEs.size - 8} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Impacted Reports */}
        {impactedReports.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Impacted Reports ({impactedReports.length})
            </div>
            <div className="space-y-1">
              {impactedReports.slice(0, 5).map((report) => (
                <div
                  key={report.id}
                  className="flex items-center gap-2 p-1.5 bg-red-50 rounded text-xs cursor-pointer hover:bg-red-100"
                  onClick={() => onNodeClick(report.id)}
                >
                  <FileText className="h-3 w-3 text-red-500" />
                  <span className="text-red-700">{report.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upstream Dependencies */}
        {upstreamNodes.length > 0 && (
          <div>
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
              <ArrowUpRight className="h-3 w-3 text-blue-500" />
              Upstream Dependencies
            </div>
            <ScrollArea className="h-24">
              <div className="space-y-1">
                {upstreamNodes.map((node) => {
                  const NodeIcon = nodeIcons[node.type]
                  return (
                    <div
                      key={node.id}
                      className="flex items-center gap-2 p-1.5 bg-blue-50 rounded text-xs cursor-pointer hover:bg-blue-100"
                      onClick={() => onNodeClick(node.id)}
                    >
                      <NodeIcon className="h-3 w-3 text-blue-500" />
                      <span className="truncate">{node.label}</span>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Downstream Impact */}
        {downstreamNodes.length > 0 && (
          <div>
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground mb-2">
              <ArrowDownRight className="h-3 w-3 text-green-500" />
              Downstream Impact
            </div>
            <ScrollArea className="h-24">
              <div className="space-y-1">
                {downstreamNodes.map((node) => {
                  const NodeIcon = nodeIcons[node.type]
                  return (
                    <div
                      key={node.id}
                      className="flex items-center gap-2 p-1.5 bg-green-50 rounded text-xs cursor-pointer hover:bg-green-100"
                      onClick={() => onNodeClick(node.id)}
                    >
                      <NodeIcon className="h-3 w-3 text-green-500" />
                      <span className="truncate">{node.label}</span>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default ImpactOverlay
