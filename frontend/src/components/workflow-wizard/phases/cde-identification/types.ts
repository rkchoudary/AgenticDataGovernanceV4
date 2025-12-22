/**
 * Types for CDE Identification Phase
 * 
 * Defines data structures for CDE scoring review, inventory approval,
 * ownership assignment, and reconciliation workflow.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

/**
 * CDE status in the identification workflow
 */
export type CDEStatus = 'pending' | 'approved' | 'rejected' | 'needs_review'

/**
 * CDE scoring factors for radar chart display
 */
export interface CDEScoringFactors {
  regulatoryCalculationUsage: number  // 0-100
  crossReportUsage: number            // 0-100
  financialImpact: number             // 0-100
  regulatoryScrutiny: number          // 0-100
}

/**
 * Lineage information for a CDE
 * Populated after Lineage Mapping phase completes
 */
export interface CDELineageInfo {
  /** Source nodes in the lineage graph that feed this CDE */
  sourceNodes: Array<{
    nodeId: string
    nodeName: string
    nodeType: 'source_table' | 'transformation' | 'staging_table'
    database?: string
    schema?: string
    tableName?: string
  }>
  /** Report fields that use this CDE */
  targetReportFields: Array<{
    nodeId: string
    fieldName: string
    reportId: string
    schedule?: string
  }>
  /** Number of upstream nodes in the lineage path */
  upstreamCount: number
  /** Number of downstream nodes in the lineage path */
  downstreamCount: number
  /** Whether lineage is complete from source to report */
  hasCompleteLineage: boolean
  /** Business terms linked to this CDE's lineage nodes */
  linkedBusinessTerms: Array<{
    termId: string
    termName: string
    category: string
  }>
  /** Last time lineage was updated */
  lineageUpdatedAt?: string
}

/**
 * Critical Data Element with scoring and ownership
 */
export interface CDE {
  id: string
  elementId: string
  name: string
  businessDefinition: string
  dataType: string
  sourceSystem: string
  sourceTable: string
  sourceField: string
  criticalityRationale: string
  overallScore: number
  scoringFactors: CDEScoringFactors
  aiRationale: string
  status: CDEStatus
  owner?: CDEOwner
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
  /** Lineage information - populated after Lineage Mapping phase */
  lineageInfo?: CDELineageInfo
}

/**
 * CDE Owner information
 */
export interface CDEOwner {
  userId: string
  name: string
  email: string
  department: string
  role: string
  assignedAt: string
  assignedBy: string
}

/**
 * User for owner assignment directory
 */
export interface User {
  id: string
  name: string
  email: string
  department: string
  role: string
  avatarUrl?: string
}

/**
 * Owner suggestion from AI
 */
export interface OwnerSuggestion {
  cdeId: string
  suggestedUser: User
  confidence: number
  rationale: string
}

/**
 * CDE Inventory for a report
 */
export interface CDEInventory {
  id: string
  reportId: string
  reportName: string
  cdes: CDE[]
  version: number
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
  approvedBy?: string
  approvedAt?: string
}

/**
 * External CDE list for reconciliation
 */
export interface ExternalCDEList {
  id: string
  name: string
  source: 'enterprise_catalog' | 'regulatory_list' | 'previous_cycle'
  cdes: ExternalCDE[]
  lastUpdated: string
}

/**
 * External CDE for reconciliation comparison
 */
export interface ExternalCDE {
  id: string
  name: string
  definition: string
  owner?: string
  status: 'active' | 'deprecated' | 'pending'
}

/**
 * Reconciliation match result
 */
export interface ReconciliationMatch {
  currentCDEId: string
  externalCDEId?: string
  externalListId: string
  matchType: 'exact' | 'partial' | 'new' | 'missing'
  confidence: number
  suggestedAction: 'keep' | 'merge' | 'add' | 'remove'
  actionTaken?: 'keep' | 'merge' | 'add' | 'remove' | 'skip'
  notes?: string
}

/**
 * CDE Identification summary
 */
export interface CDEIdentificationSummary {
  totalCDEs: number
  approvedCDEs: number
  rejectedCDEs: number
  pendingCDEs: number
  cdesWithOwners: number
  cdesWithoutOwners: number
  averageScore: number
  reconciliationComplete: boolean
  lastUpdated: string
}

/**
 * Step IDs for CDE Identification phase
 */
export const CDE_IDENTIFICATION_STEPS = {
  SCORING_REVIEW: 'scoring_review',
  INVENTORY_APPROVAL: 'inventory_approval',
  OWNERSHIP_ASSIGNMENT: 'ownership_assignment',
  RECONCILIATION: 'reconciliation',
} as const

export type CDEIdentificationStepId = typeof CDE_IDENTIFICATION_STEPS[keyof typeof CDE_IDENTIFICATION_STEPS]

/**
 * Scoring factor display configuration
 */
export const SCORING_FACTOR_CONFIG: Record<keyof CDEScoringFactors, {
  label: string
  description: string
  color: string
}> = {
  regulatoryCalculationUsage: {
    label: 'Regulatory Calculation',
    description: 'Usage in regulatory calculations and formulas',
    color: '#3b82f6', // blue
  },
  crossReportUsage: {
    label: 'Cross-Report Usage',
    description: 'Usage across multiple regulatory reports',
    color: '#10b981', // green
  },
  financialImpact: {
    label: 'Financial Impact',
    description: 'Impact on financial statements and metrics',
    color: '#f59e0b', // amber
  },
  regulatoryScrutiny: {
    label: 'Regulatory Scrutiny',
    description: 'Level of regulatory attention and audit focus',
    color: '#ef4444', // red
  },
}

/**
 * CDE status display configuration
 */
export const CDE_STATUS_CONFIG: Record<CDEStatus, {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  pending: {
    label: 'Pending Review',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: 'Clock',
  },
  approved: {
    label: 'Approved',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle',
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'XCircle',
  },
  needs_review: {
    label: 'Needs Review',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: 'AlertTriangle',
  },
}

/**
 * Match type display configuration for reconciliation
 */
export const MATCH_TYPE_CONFIG: Record<ReconciliationMatch['matchType'], {
  label: string
  color: string
  bgColor: string
  description: string
}> = {
  exact: {
    label: 'Exact Match',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    description: 'CDE exists in both lists with matching definition',
  },
  partial: {
    label: 'Partial Match',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    description: 'Similar CDE found but with differences',
  },
  new: {
    label: 'New CDE',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    description: 'CDE identified in current cycle but not in external list',
  },
  missing: {
    label: 'Missing',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    description: 'CDE exists in external list but not identified in current cycle',
  },
}

/**
 * Check if all CDEs have owners assigned
 * Property 7: Ownership Gate Enforcement
 */
export function allCDEsHaveOwners(cdes: CDE[]): boolean {
  return cdes.every(cde => cde.owner !== undefined && cde.owner !== null)
}

/**
 * Get CDEs without owners
 */
export function getCDEsWithoutOwners(cdes: CDE[]): CDE[] {
  return cdes.filter(cde => !cde.owner)
}

/**
 * Calculate average CDE score
 */
export function calculateAverageScore(cdes: CDE[]): number {
  if (cdes.length === 0) return 0
  const total = cdes.reduce((sum, cde) => sum + cde.overallScore, 0)
  return Math.round(total / cdes.length)
}

/**
 * Get CDEs without lineage information
 */
export function getCDEsWithoutLineage(cdes: CDE[]): CDE[] {
  return cdes.filter(cde => !cde.lineageInfo || !cde.lineageInfo.hasCompleteLineage)
}

/**
 * Check if all CDEs have complete lineage
 */
export function allCDEsHaveLineage(cdes: CDE[]): boolean {
  return cdes.every(cde => cde.lineageInfo?.hasCompleteLineage === true)
}

/**
 * Calculate lineage coverage percentage
 */
export function calculateLineageCoverage(cdes: CDE[]): number {
  if (cdes.length === 0) return 0
  const withLineage = cdes.filter(cde => cde.lineageInfo?.hasCompleteLineage).length
  return Math.round((withLineage / cdes.length) * 100)
}
