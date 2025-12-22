/**
 * Types for Regulatory Intelligence Phase
 * 
 * Defines data structures for regulatory change detection,
 * analysis, and catalog approval workflow.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

/**
 * Detected regulatory change from AI scanning
 */
export interface DetectedChange {
  id: string
  source: string
  sourceUrl?: string
  changeType: 'new_requirement' | 'updated_requirement' | 'removed_requirement' | 'deadline_change' | 'format_change'
  title: string
  description: string
  currentValue?: string
  proposedValue?: string
  effectiveDate: string
  detectedAt: string
  confidence: number
  aiSummary: string
  impactedReports: string[]
  status: 'pending' | 'accepted' | 'rejected' | 'modified'
  reviewedBy?: string
  reviewedAt?: string
  modificationNotes?: string
}

/**
 * Change type display configuration
 */
export const CHANGE_TYPE_CONFIG: Record<DetectedChange['changeType'], {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  new_requirement: {
    label: 'New Requirement',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'Plus',
  },
  updated_requirement: {
    label: 'Updated Requirement',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: 'RefreshCw',
  },
  removed_requirement: {
    label: 'Removed Requirement',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'Minus',
  },
  deadline_change: {
    label: 'Deadline Change',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: 'Calendar',
  },
  format_change: {
    label: 'Format Change',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    icon: 'FileText',
  },
}

/**
 * Catalog update summary
 */
export interface CatalogUpdateSummary {
  totalChanges: number
  acceptedChanges: number
  rejectedChanges: number
  modifiedChanges: number
  pendingChanges: number
  impactedReports: string[]
  lastUpdated: string
}

/**
 * Scan results from regulatory intelligence agent
 */
export interface ScanResults {
  scanId: string
  scannedAt: string
  sourcesScanned: number
  changesDetected: DetectedChange[]
  scanDuration: number
  nextScheduledScan?: string
}

/**
 * Regulatory Intelligence phase state
 */
export interface RegulatoryIntelligenceState {
  scanResults: ScanResults | null
  changes: DetectedChange[]
  selectedChangeId: string | null
  catalogSummary: CatalogUpdateSummary | null
  isLoading: boolean
  error: string | null
}

/**
 * Step IDs for Regulatory Intelligence phase
 */
export const REGULATORY_INTELLIGENCE_STEPS = {
  SCAN_RESULTS: 'scan_results',
  CHANGE_ANALYSIS: 'change_analysis',
  CATALOG_UPDATES: 'catalog_updates',
  STAKEHOLDER_APPROVAL: 'stakeholder_approval',
} as const

export type RegulatoryIntelligenceStepId = typeof REGULATORY_INTELLIGENCE_STEPS[keyof typeof REGULATORY_INTELLIGENCE_STEPS]
