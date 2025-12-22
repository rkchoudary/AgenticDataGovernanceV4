/**
 * Types for Data Quality Rules Phase
 * 
 * Defines data structures for rule review, threshold configuration,
 * coverage validation, and rule activation workflow.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

/**
 * Data Quality Dimensions (7 dimensions per BCBS 239)
 */
export type DQDimension = 
  | 'completeness'
  | 'accuracy'
  | 'validity'
  | 'consistency'
  | 'timeliness'
  | 'uniqueness'
  | 'integrity'

/**
 * Rule status in the review workflow
 */
export type DQRuleStatus = 'pending' | 'accepted' | 'modified' | 'rejected'

/**
 * Rule severity levels
 */
export type RuleSeverity = 'critical' | 'high' | 'medium' | 'low'

/**
 * Rule logic types
 */
export type RuleLogicType = 
  | 'null_check'
  | 'range_check'
  | 'format_check'
  | 'referential_check'
  | 'reconciliation'
  | 'custom'

/**
 * Threshold configuration for a rule
 */
export interface ThresholdConfig {
  type: 'percentage' | 'absolute' | 'range'
  value: number
  minValue?: number
  maxValue?: number
  suggestedValue: number
  historicalAverage?: number
}

/**
 * Rule logic definition
 */
export interface RuleLogic {
  type: RuleLogicType
  expression: string
  parameters?: Record<string, unknown>
  description: string
}

/**
 * Histogram data point for threshold visualization
 */
export interface HistogramBin {
  binStart: number
  binEnd: number
  count: number
  percentage: number
}

/**
 * Impact preview when adjusting threshold
 */
export interface ThresholdImpact {
  recordsFailing: number
  totalRecords: number
  failurePercentage: number
  previousFailurePercentage?: number
  trend: 'improving' | 'stable' | 'degrading'
}

/**
 * Lineage information for a CDE (from Lineage Mapping phase)
 */
export interface CDELineageInfo {
  sourceNodes: {
    nodeId: string
    nodeName: string
    nodeType: 'source_table' | 'transformation' | 'staging_table'
    database?: string
    schema?: string
    tableName?: string
  }[]
  targetReportFields: {
    nodeId: string
    fieldName: string
    reportId: string
    schedule?: string
    fieldNumber?: string
  }[]
  upstreamCount: number
  downstreamCount: number
  hasCompleteLineage: boolean
  linkedBusinessTerms: {
    termId: string
    termName: string
    category: string
  }[]
  lineageUpdatedAt?: string
}

/**
 * Lineage information for a DQ Rule
 */
export interface RuleLineageInfo {
  sourceNodes: {
    nodeId: string
    nodeName: string
    nodeType: 'source_table' | 'transformation' | 'staging_table' | 'report_field'
    database?: string
    schema?: string
  }[]
  targetReportFields: {
    nodeId: string
    nodeName: string
    reportId: string
    schedule?: string
    fieldNumber?: string
  }[]
  upstreamCount: number
  downstreamCount: number
  hasCompleteLineage: boolean
}

/**
 * Data Quality Rule with AI-generated content
 */
export interface DQRule {
  id: string
  cdeId: string
  cdeName: string
  dimension: DQDimension
  name: string
  description: string
  logic: RuleLogic
  threshold: ThresholdConfig
  severity: RuleSeverity
  status: DQRuleStatus
  isAIGenerated: boolean
  aiConfidence?: number
  aiRationale?: string
  owner?: string
  enabled: boolean
  createdAt: string
  modifiedAt?: string
  modifiedBy?: string
  rejectionReason?: string
  histogramData?: HistogramBin[]
  impactPreview?: ThresholdImpact
  lineageInfo?: RuleLineageInfo
}

/**
 * CDE with associated rules for coverage view
 * Includes lineage information from Lineage Mapping phase
 */
export interface CDEWithRules {
  id: string
  name: string
  businessDefinition: string
  sourceSystem: string
  rules: DQRule[]
  coverageByDimension: Record<DQDimension, boolean>
  overallCoverage: number
  /** Lineage information from Lineage Mapping phase */
  lineageInfo?: CDELineageInfo
}

/**
 * Coverage matrix cell
 */
export interface CoverageCell {
  cdeId: string
  cdeName: string
  dimension: DQDimension
  hasRule: boolean
  ruleId?: string
  ruleStatus?: DQRuleStatus
}

/**
 * Coverage summary
 */
export interface CoverageSummary {
  totalCDEs: number
  totalDimensions: number
  totalCells: number
  coveredCells: number
  coveragePercentage: number
  gapCount: number
  gapsByDimension: Record<DQDimension, number>
  gapsByCDE: Record<string, number>
}

/**
 * Weekday type for scheduling
 */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

/**
 * Rule activation schedule
 */
export interface ActivationSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'on_demand'
  startDate: string
  nextRunDate: string
  scheduledTime: string // HH:mm format
  scheduledDays: Weekday[] // Days of the week to run
  timezone: string
  notifyOnFailure: boolean
  notificationRecipients: string[]
}

/**
 * Rule activation confirmation
 */
export interface ActivationConfirmation {
  ruleIds: string[]
  schedule: ActivationSchedule
  confirmedBy: string
  confirmedAt: string
  notes?: string
}

/**
 * Data Quality Rules summary
 */
export interface DQRulesSummary {
  totalRules: number
  acceptedRules: number
  modifiedRules: number
  rejectedRules: number
  pendingRules: number
  activatedRules: number
  coveragePercentage: number
  lastUpdated: string
}

/**
 * Step IDs for Data Quality Rules phase
 */
export const DQ_RULES_STEPS = {
  RULE_REVIEW: 'rule_review',
  THRESHOLD_CONFIG: 'threshold_config',
  COVERAGE_VALIDATION: 'coverage_validation',
  RULE_ACTIVATION: 'rule_activation',
} as const

export type DQRulesStepId = typeof DQ_RULES_STEPS[keyof typeof DQ_RULES_STEPS]

/**
 * Dimension display configuration
 */
export const DIMENSION_CONFIG: Record<DQDimension, {
  label: string
  description: string
  color: string
  icon: string
}> = {
  completeness: {
    label: 'Completeness',
    description: 'Data is not missing and all required values are present',
    color: '#3b82f6', // blue
    icon: 'CheckSquare',
  },
  accuracy: {
    label: 'Accuracy',
    description: 'Data correctly represents the real-world entity',
    color: '#10b981', // green
    icon: 'Target',
  },
  validity: {
    label: 'Validity',
    description: 'Data conforms to defined formats and business rules',
    color: '#f59e0b', // amber
    icon: 'FileCheck',
  },
  consistency: {
    label: 'Consistency',
    description: 'Data is consistent across systems and time periods',
    color: '#8b5cf6', // purple
    icon: 'GitCompare',
  },
  timeliness: {
    label: 'Timeliness',
    description: 'Data is available when needed and up-to-date',
    color: '#ec4899', // pink
    icon: 'Clock',
  },
  uniqueness: {
    label: 'Uniqueness',
    description: 'No duplicate records exist for the same entity',
    color: '#06b6d4', // cyan
    icon: 'Fingerprint',
  },
  integrity: {
    label: 'Integrity',
    description: 'Referential relationships are maintained correctly',
    color: '#f97316', // orange
    icon: 'Link',
  },
}

/**
 * Rule status display configuration
 */
export const RULE_STATUS_CONFIG: Record<DQRuleStatus, {
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
  accepted: {
    label: 'Accepted',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle',
  },
  modified: {
    label: 'Modified',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: 'Edit',
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'XCircle',
  },
}

/**
 * Severity display configuration
 */
export const SEVERITY_CONFIG: Record<RuleSeverity, {
  label: string
  color: string
  bgColor: string
  priority: number
}> = {
  critical: {
    label: 'Critical',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    priority: 1,
  },
  high: {
    label: 'High',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    priority: 2,
  },
  medium: {
    label: 'Medium',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    priority: 3,
  },
  low: {
    label: 'Low',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    priority: 4,
  },
}

/**
 * All dimensions in display order
 */
export const ALL_DIMENSIONS: DQDimension[] = [
  'completeness',
  'accuracy',
  'validity',
  'consistency',
  'timeliness',
  'uniqueness',
  'integrity',
]

/**
 * Calculate coverage percentage for a CDE
 */
export function calculateCDECoverage(coverageByDimension: Record<DQDimension, boolean>): number {
  const covered = ALL_DIMENSIONS.filter(d => coverageByDimension[d]).length
  return Math.round((covered / ALL_DIMENSIONS.length) * 100)
}

/**
 * Calculate overall coverage summary
 */
export function calculateCoverageSummary(cdesWithRules: CDEWithRules[]): CoverageSummary {
  const totalCDEs = cdesWithRules.length
  const totalDimensions = ALL_DIMENSIONS.length
  const totalCells = totalCDEs * totalDimensions
  
  let coveredCells = 0
  const gapsByDimension: Record<DQDimension, number> = {} as Record<DQDimension, number>
  const gapsByCDE: Record<string, number> = {}
  
  // Initialize dimension gaps
  ALL_DIMENSIONS.forEach(d => { gapsByDimension[d] = 0 })
  
  cdesWithRules.forEach(cde => {
    let cdeGaps = 0
    ALL_DIMENSIONS.forEach(dimension => {
      if (cde.coverageByDimension[dimension]) {
        coveredCells++
      } else {
        gapsByDimension[dimension]++
        cdeGaps++
      }
    })
    if (cdeGaps > 0) {
      gapsByCDE[cde.id] = cdeGaps
    }
  })
  
  return {
    totalCDEs,
    totalDimensions,
    totalCells,
    coveredCells,
    coveragePercentage: totalCells > 0 ? Math.round((coveredCells / totalCells) * 100) : 0,
    gapCount: totalCells - coveredCells,
    gapsByDimension,
    gapsByCDE,
  }
}

/**
 * Get rules by status
 */
export function getRulesByStatus(rules: DQRule[], status: DQRuleStatus): DQRule[] {
  return rules.filter(r => r.status === status)
}

/**
 * Get rules by dimension
 */
export function getRulesByDimension(rules: DQRule[], dimension: DQDimension): DQRule[] {
  return rules.filter(r => r.dimension === dimension)
}

/**
 * Check if all rules have been reviewed (not pending)
 */
export function allRulesReviewed(rules: DQRule[]): boolean {
  return rules.every(r => r.status !== 'pending')
}

/**
 * Get accepted or modified rules (ready for activation)
 */
export function getActivatableRules(rules: DQRule[]): DQRule[] {
  return rules.filter(r => r.status === 'accepted' || r.status === 'modified')
}
