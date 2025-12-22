import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import {
  Database,
  GitBranch,
  Table2,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export type LineageNodeType = 'source_table' | 'transformation' | 'staging_table' | 'report_field'

export interface LineageNodeData {
  id: string
  label: string
  type: LineageNodeType
  description?: string
  owner?: string
  database?: string
  schema?: string
  tableName?: string
  relatedCDEs?: string[]
  qualityScore?: number
  lastUpdated?: string
  status?: 'healthy' | 'warning' | 'error'
  metadata?: Record<string, string>
}

const nodeConfigs = {
  source_table: {
    icon: Database,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    label: 'Source Table',
  },
  transformation: {
    icon: GitBranch,
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-300',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    label: 'Transformation',
  },
  staging_table: {
    icon: Table2,
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    label: 'Staging Table',
  },
  report_field: {
    icon: FileText,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    iconBg: 'bg-green-100',
    iconColor: 'text-green-600',
    label: 'Report Field',
  },
}

const statusIcons = {
  healthy: { icon: CheckCircle2, color: 'text-green-500' },
  warning: { icon: AlertCircle, color: 'text-amber-500' },
  error: { icon: AlertCircle, color: 'text-red-500' },
}

function LineageNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as LineageNodeData
  const config = nodeConfigs[nodeData.type]
  const Icon = config.icon
  const StatusIcon = nodeData.status ? statusIcons[nodeData.status].icon : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'px-4 py-3 rounded-lg border-2 shadow-sm min-w-[180px] max-w-[220px] transition-all cursor-pointer',
            config.bgColor,
            config.borderColor,
            selected && 'ring-2 ring-blue-500 ring-offset-2 shadow-md'
          )}
        >
          <Handle
            type="target"
            position={Position.Left}
            className="w-3 h-3 !bg-slate-400"
          />
          
          {/* Header */}
          <div className="flex items-start gap-2">
            <div className={cn('p-1.5 rounded shrink-0', config.iconBg)}>
              <Icon className={cn('h-4 w-4', config.iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-medium text-sm truncate">{nodeData.label}</span>
                {StatusIcon && (
                  <StatusIcon
                    className={cn('h-3.5 w-3.5 shrink-0', statusIcons[nodeData.status!].color)}
                  />
                )}
              </div>
              <div className="text-xs text-muted-foreground">{config.label}</div>
            </div>
          </div>

          {/* Details */}
          {(nodeData.database || nodeData.schema) && (
            <div className="mt-2 text-xs text-muted-foreground">
              {nodeData.database && nodeData.schema
                ? `${nodeData.database}.${nodeData.schema}`
                : nodeData.database || nodeData.schema}
            </div>
          )}

          {/* Quality Score */}
          {nodeData.qualityScore !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div
                  className={cn(
                    'h-1.5 rounded-full',
                    nodeData.qualityScore >= 90
                      ? 'bg-green-500'
                      : nodeData.qualityScore >= 70
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                  )}
                  style={{ width: `${nodeData.qualityScore}%` }}
                />
              </div>
              <span className="text-xs font-medium">{nodeData.qualityScore}%</span>
            </div>
          )}

          {/* Related CDEs Badge */}
          {nodeData.relatedCDEs && nodeData.relatedCDEs.length > 0 && (
            <div className="mt-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                {nodeData.relatedCDEs.length} CDE{nodeData.relatedCDEs.length > 1 ? 's' : ''}
              </span>
            </div>
          )}

          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 !bg-slate-400"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs">
        <div className="space-y-2">
          <div>
            <div className="font-medium">{nodeData.label}</div>
            <div className="text-xs text-muted-foreground">{config.label}</div>
          </div>
          
          {nodeData.description && (
            <p className="text-sm">{nodeData.description}</p>
          )}
          
          {nodeData.owner && (
            <div className="text-xs">
              <span className="text-muted-foreground">Owner:</span> {nodeData.owner}
            </div>
          )}
          
          {nodeData.lastUpdated && (
            <div className="text-xs flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span>Updated: {nodeData.lastUpdated}</span>
            </div>
          )}
          
          {nodeData.relatedCDEs && nodeData.relatedCDEs.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">Related CDEs:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {nodeData.relatedCDEs.slice(0, 5).map((cde) => (
                  <span
                    key={cde}
                    className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded"
                  >
                    {cde}
                  </span>
                ))}
                {nodeData.relatedCDEs.length > 5 && (
                  <span className="text-muted-foreground">
                    +{nodeData.relatedCDEs.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}
          
          {nodeData.metadata && Object.keys(nodeData.metadata).length > 0 && (
            <div className="text-xs border-t pt-2 mt-2">
              {Object.entries(nodeData.metadata).map(([key, value]) => (
                <div key={key}>
                  <span className="text-muted-foreground">{key}:</span> {value}
                </div>
              ))}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

export const LineageNode = memo(LineageNodeComponent)

export function getNodeConfig(type: LineageNodeType) {
  return nodeConfigs[type]
}

export default LineageNode
