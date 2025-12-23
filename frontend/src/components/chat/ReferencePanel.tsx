import * as React from 'react'
import { useState } from 'react'
import { 
  FileText, 
  Database, 
  GitBranch, 
  AlertTriangle, 
  ClipboardList,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  X,
  Link2,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Reference } from '@/stores/chatStore'
import { cn } from '@/lib/utils'

/**
 * Props for ReferencePanel component
 * Validates: Requirements 1.4, 7.2, 11.2
 */
interface ReferencePanelProps {
  /** List of references to display */
  references: Reference[]
  /** Callback when a reference is clicked */
  onReferenceClick?: (reference: Reference) => void
  /** Callback to remove a reference */
  onRemoveReference?: (reference: Reference) => void
  /** CSS class name */
  className?: string
  /** Whether the panel is collapsible */
  collapsible?: boolean
  /** Initial collapsed state */
  defaultCollapsed?: boolean
}

/**
 * Icon mapping for reference types
 */
const REFERENCE_ICONS: Record<Reference['type'], React.ElementType> = {
  report: FileText,
  cde: Database,
  lineage: GitBranch,
  issue: AlertTriangle,
  audit: ClipboardList,
}

/**
 * Color mapping for reference types
 */
const REFERENCE_COLORS: Record<Reference['type'], string> = {
  report: 'text-blue-500 bg-blue-50 dark:bg-blue-950',
  cde: 'text-purple-500 bg-purple-50 dark:bg-purple-950',
  lineage: 'text-green-500 bg-green-50 dark:bg-green-950',
  issue: 'text-orange-500 bg-orange-50 dark:bg-orange-950',
  audit: 'text-gray-500 bg-gray-50 dark:bg-gray-950',
}

/**
 * Label mapping for reference types
 */
const REFERENCE_LABELS: Record<Reference['type'], string> = {
  report: 'Report',
  cde: 'CDE',
  lineage: 'Lineage',
  issue: 'Issue',
  audit: 'Audit',
}

/**
 * ReferencePanel component for displaying source citations and lineage context
 * 
 * Features:
 * - Groups references by type
 * - Shows source information
 * - Links to related entities
 * - Collapsible sections
 * 
 * Validates: Requirements 1.4, 7.2, 11.2
 */
export function ReferencePanel({
  references,
  onReferenceClick,
  onRemoveReference,
  className,
  collapsible = true,
  defaultCollapsed = false,
}: ReferencePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const [expandedTypes, setExpandedTypes] = useState<Set<Reference['type']>>(
    new Set(['report', 'cde', 'lineage', 'issue', 'audit'])
  )

  // Group references by type
  const groupedReferences = React.useMemo(() => {
    const groups: Record<Reference['type'], Reference[]> = {
      report: [],
      cde: [],
      lineage: [],
      issue: [],
      audit: [],
    }

    for (const ref of references) {
      if (groups[ref.type]) {
        // Avoid duplicates
        if (!groups[ref.type].some(r => r.id === ref.id)) {
          groups[ref.type].push(ref)
        }
      }
    }

    return groups
  }, [references])

  // Get non-empty groups
  const nonEmptyGroups = React.useMemo(() => {
    return (Object.entries(groupedReferences) as [Reference['type'], Reference[]][])
      .filter(([, refs]) => refs.length > 0)
  }, [groupedReferences])

  const toggleType = (type: Reference['type']) => {
    setExpandedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  if (references.length === 0) {
    return null
  }

  return (
    <div className={cn('flex flex-col bg-muted/30', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">References</span>
          <Badge variant="secondary" className="text-xs">
            {references.length}
          </Badge>
        </div>
        {collapsible && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Content */}
      {!isCollapsed && (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-3">
            {nonEmptyGroups.map(([type, refs]) => (
              <ReferenceGroup
                key={type}
                type={type}
                references={refs}
                isExpanded={expandedTypes.has(type)}
                onToggle={() => toggleType(type)}
                onReferenceClick={onReferenceClick}
                onRemoveReference={onRemoveReference}
              />
            ))}

            {/* Empty state */}
            {nonEmptyGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Info className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No references available</p>
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

/**
 * Props for ReferenceGroup component
 */
interface ReferenceGroupProps {
  type: Reference['type']
  references: Reference[]
  isExpanded: boolean
  onToggle: () => void
  onReferenceClick?: (reference: Reference) => void
  onRemoveReference?: (reference: Reference) => void
}

/**
 * ReferenceGroup component for displaying a group of references
 */
function ReferenceGroup({
  type,
  references,
  isExpanded,
  onToggle,
  onReferenceClick,
  onRemoveReference,
}: ReferenceGroupProps) {
  const Icon = REFERENCE_ICONS[type]
  const colorClass = REFERENCE_COLORS[type]
  const label = REFERENCE_LABELS[type]

  return (
    <div className="space-y-1">
      {/* Group header */}
      <button
        className="flex items-center gap-2 w-full p-1.5 rounded hover:bg-muted transition-colors"
        onClick={onToggle}
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <div className={cn('p-1 rounded', colorClass)}>
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-xs font-medium flex-1 text-left">{label}s</span>
        <Badge variant="outline" className="text-xs">
          {references.length}
        </Badge>
      </button>

      {/* Group items */}
      {isExpanded && (
        <div className="ml-5 space-y-1">
          {references.map((ref) => (
            <ReferenceItem
              key={ref.id}
              reference={ref}
              onClick={() => onReferenceClick?.(ref)}
              onRemove={onRemoveReference ? () => onRemoveReference(ref) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Props for ReferenceItem component
 */
interface ReferenceItemProps {
  reference: Reference
  onClick?: () => void
  onRemove?: () => void
}

/**
 * ReferenceItem component for displaying a single reference
 */
function ReferenceItem({ reference, onClick, onRemove }: ReferenceItemProps) {
  const Icon = REFERENCE_ICONS[reference.type]
  const colorClass = REFERENCE_COLORS[reference.type]

  return (
    <div
      className={cn(
        'group flex items-start gap-2 p-2 rounded border bg-background',
        'hover:border-primary/50 transition-colors cursor-pointer'
      )}
      onClick={onClick}
    >
      <div className={cn('p-1 rounded flex-shrink-0', colorClass)}>
        <Icon className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{reference.title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {reference.source}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {reference.url && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => {
              e.stopPropagation()
              window.open(reference.url, '_blank')
            }}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * LineageContext component for displaying lineage information
 * Validates: Requirements 7.2
 */
export function LineageContext({
  sourceSystem,
  sourcePath,
  transformations,
  className,
}: {
  sourceSystem: string
  sourcePath: string
  transformations?: string[]
  className?: string
}) {
  return (
    <div className={cn('p-3 rounded border bg-muted/30 space-y-2', className)}>
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-green-500" />
        <span className="text-sm font-medium">Data Lineage</span>
      </div>
      <Separator />
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Source:</span>
          <span className="font-mono">{sourceSystem}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Path:</span>
          <span className="font-mono truncate">{sourcePath}</span>
        </div>
        {transformations && transformations.length > 0 && (
          <div className="mt-2">
            <span className="text-xs text-muted-foreground">Transformations:</span>
            <div className="mt-1 space-y-1">
              {transformations.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span className="font-mono">{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * DataSourceCard component for displaying data source information
 * Validates: Requirements 7.2, 11.2
 */
export function DataSourceCard({
  name,
  type,
  description,
  lastUpdated,
  onClick,
  className,
}: {
  name: string
  type: string
  description?: string
  lastUpdated?: Date
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'p-3 rounded border bg-background hover:border-primary/50 transition-colors cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded bg-blue-50 dark:bg-blue-950">
          <Database className="h-4 w-4 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{type}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {description}
            </p>
          )}
          {lastUpdated && (
            <p className="text-xs text-muted-foreground mt-1">
              Updated: {lastUpdated.toLocaleDateString()}
            </p>
          )}
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  )
}
