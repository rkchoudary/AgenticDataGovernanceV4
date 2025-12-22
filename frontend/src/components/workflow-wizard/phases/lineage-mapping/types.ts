/**
 * Lineage Mapping Phase Types
 * 
 * Types and interfaces for Phase 5 of the workflow wizard - Lineage Mapping.
 * Handles pipeline scanning, business term linking, impact analysis, and lineage approval.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

// ============================================================================
// Step Constants
// ============================================================================

export const LINEAGE_MAPPING_STEPS = {
  PIPELINE_SCAN: 'pipeline_scan',
  BUSINESS_TERMS: 'business_terms',
  IMPACT_ANALYSIS: 'impact_analysis',
  LINEAGE_APPROVAL: 'lineage_approval',
} as const

// ============================================================================
// Node Types
// ============================================================================

export type LineageNodeType = 'source_table' | 'transformation' | 'staging_table' | 'report_field'

export type NodeStatus = 'healthy' | 'warning' | 'error' | 'unknown'

export interface LineageNode {
  id: string
  label: string
  type: LineageNodeType
  description?: string
  owner?: string
  database?: string
  schema?: string
  tableName?: string
  qualityScore?: number
  lastUpdated?: string
  status: NodeStatus
  relatedCDEs: string[]
  businessTerms: BusinessTermLink[]
  /** Whether business term linking has been deferred for this node */
  businessTermsDeferred?: boolean
  /** Reason for deferring business term linking */
  businessTermsDeferredReason?: string
  /** When business term linking was deferred */
  businessTermsDeferredAt?: string
  metadata: Record<string, string>
  position: { x: number; y: number }
}

export interface LineageEdge {
  id: string
  source: string
  target: string
  transformationType?: string
  description?: string
  isAIGenerated: boolean
  confidence?: number
}

// ============================================================================
// Business Terms
// ============================================================================

export interface BusinessTerm {
  id: string
  name: string
  definition: string
  category: string
  domain: string
  synonyms: string[]
  relatedTerms: string[]
  owner?: string
  status: 'active' | 'deprecated' | 'pending'
}

export interface BusinessTermLink {
  termId: string
  termName: string
  linkedAt: string
  linkedBy: string
  confidence?: number
  isAISuggested: boolean
}

export interface BusinessTermSuggestion {
  term: BusinessTerm
  confidence: number
  rationale: string
  matchedMetadata: string[]
}

// ============================================================================
// Impact Analysis
// ============================================================================

export interface ImpactRule {
  id: string
  name: string
  description: string
  sourceNodeId: string
  sourceNodeName: string
  triggerType: 'schema_change' | 'data_change' | 'quality_drop' | 'availability'
  threshold?: number
  notificationChannels: NotificationChannel[]
  recipients: string[]
  enabled: boolean
  createdAt: string
  createdBy: string
}

export type NotificationChannel = 'email' | 'slack' | 'teams' | 'webhook'

export interface ImpactAnalysisConfig {
  rules: ImpactRule[]
  globalSettings: {
    defaultNotificationChannels: NotificationChannel[]
    defaultRecipients: string[]
    enableAutoDetection: boolean
    sensitivityLevel: 'low' | 'medium' | 'high'
  }
}

export interface ImpactPreview {
  affectedNodes: string[]
  affectedCDEs: string[]
  affectedReports: string[]
  estimatedImpactLevel: 'low' | 'medium' | 'high' | 'critical'
}

// ============================================================================
// Pipeline Scan
// ============================================================================

export interface PipelineScanResult {
  id: string
  pipelineName: string
  scanDate: string
  status: 'completed' | 'partial' | 'failed'
  nodesDiscovered: number
  edgesDiscovered: number
  newNodes: LineageNode[]
  newEdges: LineageEdge[]
  changedNodes: LineageNode[]
  removedNodeIds: string[]
  issues: ScanIssue[]
}

export interface ScanIssue {
  id: string
  type: 'missing_source' | 'orphan_node' | 'circular_dependency' | 'schema_mismatch' | 'cde_missing_lineage'
  severity: 'low' | 'medium' | 'high'
  nodeId?: string
  cdeId?: string
  cdeName?: string
  description: string
  suggestedAction?: string
}

// ============================================================================
// Lineage Graph State
// ============================================================================

export interface LineageGraphState {
  nodes: LineageNode[]
  edges: LineageEdge[]
  selectedNodeId: string | null
  highlightedPath: string[]
  zoomLevel: number
  panPosition: { x: number; y: number }
}

// ============================================================================
// Export Types
// ============================================================================

export type ExportFormat = 'png' | 'svg' | 'mermaid' | 'html'

export interface ExportConfig {
  format: ExportFormat
  includeMetadata: boolean
  includeBusinessTerms: boolean
  filename?: string
}

// ============================================================================
// Summary Types
// ============================================================================

export interface LineageMappingSummary {
  totalNodes: number
  totalEdges: number
  nodesWithBusinessTerms: number
  nodesWithoutBusinessTerms: number
  impactRulesConfigured: number
  scanIssuesCount: number
  healthyNodes: number
  warningNodes: number
  errorNodes: number
  lastScanDate?: string
  approvalStatus: 'pending' | 'approved' | 'rejected'
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate lineage mapping summary from graph state
 */
export function calculateLineageSummary(
  nodes: LineageNode[],
  edges: LineageEdge[],
  impactRules: ImpactRule[],
  scanIssues: ScanIssue[]
): LineageMappingSummary {
  const nodesWithTerms = nodes.filter(n => n.businessTerms.length > 0).length
  const healthyNodes = nodes.filter(n => n.status === 'healthy').length
  const warningNodes = nodes.filter(n => n.status === 'warning').length
  const errorNodes = nodes.filter(n => n.status === 'error').length

  return {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    nodesWithBusinessTerms: nodesWithTerms,
    nodesWithoutBusinessTerms: nodes.length - nodesWithTerms,
    impactRulesConfigured: impactRules.filter(r => r.enabled).length,
    scanIssuesCount: scanIssues.length,
    healthyNodes,
    warningNodes,
    errorNodes,
    approvalStatus: 'pending',
  }
}

/**
 * Get nodes without business terms (for linking step)
 * Excludes nodes that have been deferred
 */
export function getNodesWithoutBusinessTerms(nodes: LineageNode[]): LineageNode[] {
  return nodes.filter(n => n.businessTerms.length === 0 && !n.businessTermsDeferred)
}

/**
 * Get nodes that have been deferred for business term linking
 */
export function getDeferredNodes(nodes: LineageNode[]): LineageNode[] {
  return nodes.filter(n => n.businessTermsDeferred === true)
}

/**
 * Check if a node has business terms or has been deferred
 */
export function nodeHasTermsOrDeferred(node: LineageNode): boolean {
  return node.businessTerms.length > 0 || node.businessTermsDeferred === true
}

/**
 * Get upstream nodes for a given node
 */
export function getUpstreamNodes(nodeId: string, nodes: LineageNode[], edges: LineageEdge[]): LineageNode[] {
  const upstreamIds = new Set<string>()
  
  const findUpstream = (id: string) => {
    edges.forEach(edge => {
      if (edge.target === id && !upstreamIds.has(edge.source)) {
        upstreamIds.add(edge.source)
        findUpstream(edge.source)
      }
    })
  }
  
  findUpstream(nodeId)
  return nodes.filter(n => upstreamIds.has(n.id))
}

/**
 * Get downstream nodes for a given node
 */
export function getDownstreamNodes(nodeId: string, nodes: LineageNode[], edges: LineageEdge[]): LineageNode[] {
  const downstreamIds = new Set<string>()
  
  const findDownstream = (id: string) => {
    edges.forEach(edge => {
      if (edge.source === id && !downstreamIds.has(edge.target)) {
        downstreamIds.add(edge.target)
        findDownstream(edge.target)
      }
    })
  }
  
  findDownstream(nodeId)
  return nodes.filter(n => downstreamIds.has(n.id))
}

/**
 * Calculate impact preview for a source node change
 */
export function calculateImpactPreview(
  sourceNodeId: string,
  nodes: LineageNode[],
  edges: LineageEdge[]
): ImpactPreview {
  const downstream = getDownstreamNodes(sourceNodeId, nodes, edges)
  const affectedCDEs = new Set<string>()
  const affectedReports = new Set<string>()
  
  downstream.forEach(node => {
    node.relatedCDEs.forEach(cde => affectedCDEs.add(cde))
    if (node.type === 'report_field') {
      affectedReports.add(node.label)
    }
  })
  
  let impactLevel: ImpactPreview['estimatedImpactLevel'] = 'low'
  if (affectedReports.size > 0) impactLevel = 'high'
  if (affectedCDEs.size > 5) impactLevel = 'critical'
  else if (affectedCDEs.size > 2) impactLevel = 'medium'
  
  return {
    affectedNodes: downstream.map(n => n.id),
    affectedCDEs: Array.from(affectedCDEs),
    affectedReports: Array.from(affectedReports),
    estimatedImpactLevel: impactLevel,
  }
}

/**
 * Check if all critical nodes have business terms linked
 */
export function allCriticalNodesHaveTerms(nodes: LineageNode[]): boolean {
  const criticalNodes = nodes.filter(n => 
    n.type === 'report_field' || n.relatedCDEs.length > 0
  )
  return criticalNodes.every(n => n.businessTerms.length > 0)
}
