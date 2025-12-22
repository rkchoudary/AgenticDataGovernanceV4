/**
 * Types for Issue Management Phase
 * 
 * Defines data structures for issue triage, root cause analysis,
 * resolution workflow, and verification.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

/**
 * Issue severity levels
 */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'

/**
 * Issue status in the workflow
 */
export type IssueStatus = 
  | 'open'
  | 'triaged'
  | 'analyzing'
  | 'resolving'
  | 'pending_verification'
  | 'verified'
  | 'closed'
  | 'escalated'

/**
 * Issue source types
 */
export type IssueSource = 
  | 'dq_rule_failure'
  | 'reconciliation_mismatch'
  | 'lineage_break'
  | 'manual_report'
  | 'audit_finding'

/**
 * Resolution types
 */
export type ResolutionType = 
  | 'data_correction'
  | 'process_change'
  | 'system_fix'
  | 'exception_approved'
  | 'compensating_control'

/**
 * Root cause category
 */
export type RootCauseCategory = 
  | 'data_entry_error'
  | 'system_integration'
  | 'process_gap'
  | 'calculation_error'
  | 'timing_issue'
  | 'external_dependency'
  | 'unknown'

/**
 * AI-suggested root cause
 */
export interface RootCauseSuggestion {
  id: string
  category: RootCauseCategory
  description: string
  confidence: number
  evidence: string[]
  suggestedActions: string[]
  isAIGenerated: boolean
}

/**
 * Similar historical issue
 */
export interface SimilarIssue {
  id: string
  title: string
  severity: IssueSeverity
  rootCause: string
  resolution: string
  resolvedAt: string
  similarity: number
}

/**
 * Resolution evidence
 */
export interface ResolutionEvidence {
  id: string
  type: 'screenshot' | 'document' | 'log' | 'data_sample' | 'approval'
  name: string
  description: string
  uploadedAt: string
  uploadedBy: string
  url?: string
}

/**
 * Resolution details
 */
export interface Resolution {
  type: ResolutionType
  description: string
  rootCause: string
  rootCauseCategory: RootCauseCategory
  implementedBy: string
  implementedAt: string
  evidence: ResolutionEvidence[]
  verifiedBy?: string
  verifiedAt?: string
  verificationNotes?: string
}

/**
 * Issue record
 */
export interface Issue {
  id: string
  title: string
  description: string
  source: IssueSource
  severity: IssueSeverity
  status: IssueStatus
  priority: number
  aiSuggestedPriority?: number
  impactedCDEs: string[]
  impactedReports: string[]
  assignee?: string
  assigneeName?: string
  createdAt: string
  dueDate?: string
  rootCauseSuggestions?: RootCauseSuggestion[]
  similarIssues?: SimilarIssue[]
  resolution?: Resolution
  escalationLevel: number
  escalatedAt?: string
  escalationReason?: string
  isBlocking: boolean
  isAIGenerated: boolean
  aiConfidence?: number
}

/**
 * Issue triage action
 */
export interface TriageAction {
  issueId: string
  action: 'accept_priority' | 'change_priority' | 'assign' | 'escalate'
  newPriority?: number
  assigneeId?: string
  escalationReason?: string
}

/**
 * Issue summary statistics
 */
export interface IssueSummary {
  totalIssues: number
  openIssues: number
  criticalIssues: number
  highIssues: number
  mediumIssues: number
  lowIssues: number
  resolvedIssues: number
  verifiedIssues: number
  escalatedIssues: number
  blockingIssues: number
  avgResolutionTime: number
}

/**
 * Step IDs for Issue Management phase
 */
export const ISSUE_MANAGEMENT_STEPS = {
  TRIAGE: 'issue_triage',
  ROOT_CAUSE: 'root_cause_analysis',
  RESOLUTION: 'resolution_implementation',
  VERIFICATION: 'verification',
} as const

export type IssueManagementStepId = typeof ISSUE_MANAGEMENT_STEPS[keyof typeof ISSUE_MANAGEMENT_STEPS]

/**
 * Severity display configuration
 */
export const SEVERITY_CONFIG: Record<IssueSeverity, {
  label: string
  color: string
  bgColor: string
  borderColor: string
  priority: number
}> = {
  critical: {
    label: 'Critical',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-500',
    priority: 1,
  },
  high: {
    label: 'High',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    borderColor: 'border-orange-500',
    priority: 2,
  },
  medium: {
    label: 'Medium',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    borderColor: 'border-amber-500',
    priority: 3,
  },
  low: {
    label: 'Low',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-500',
    priority: 4,
  },
}

/**
 * Status display configuration
 */
export const STATUS_CONFIG: Record<IssueStatus, {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  open: {
    label: 'Open',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'AlertCircle',
  },
  triaged: {
    label: 'Triaged',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: 'ListChecks',
  },
  analyzing: {
    label: 'Analyzing',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    icon: 'Search',
  },
  resolving: {
    label: 'Resolving',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: 'Wrench',
  },
  pending_verification: {
    label: 'Pending Verification',
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-100',
    icon: 'Clock',
  },
  verified: {
    label: 'Verified',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle',
  },
  closed: {
    label: 'Closed',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: 'XCircle',
  },
  escalated: {
    label: 'Escalated',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'ArrowUpCircle',
  },
}

/**
 * Source display configuration
 */
export const SOURCE_CONFIG: Record<IssueSource, {
  label: string
  icon: string
}> = {
  dq_rule_failure: {
    label: 'DQ Rule Failure',
    icon: 'AlertTriangle',
  },
  reconciliation_mismatch: {
    label: 'Reconciliation Mismatch',
    icon: 'GitCompare',
  },
  lineage_break: {
    label: 'Lineage Break',
    icon: 'Unlink',
  },
  manual_report: {
    label: 'Manual Report',
    icon: 'FileText',
  },
  audit_finding: {
    label: 'Audit Finding',
    icon: 'Search',
  },
}

/**
 * Root cause category configuration
 */
export const ROOT_CAUSE_CONFIG: Record<RootCauseCategory, {
  label: string
  description: string
}> = {
  data_entry_error: {
    label: 'Data Entry Error',
    description: 'Incorrect data entered by users or systems',
  },
  system_integration: {
    label: 'System Integration',
    description: 'Issues with data transfer between systems',
  },
  process_gap: {
    label: 'Process Gap',
    description: 'Missing or inadequate business processes',
  },
  calculation_error: {
    label: 'Calculation Error',
    description: 'Errors in formulas or business logic',
  },
  timing_issue: {
    label: 'Timing Issue',
    description: 'Data synchronization or timing problems',
  },
  external_dependency: {
    label: 'External Dependency',
    description: 'Issues with external data sources or vendors',
  },
  unknown: {
    label: 'Unknown',
    description: 'Root cause not yet determined',
  },
}

/**
 * Resolution type configuration
 */
export const RESOLUTION_TYPE_CONFIG: Record<ResolutionType, {
  label: string
  description: string
}> = {
  data_correction: {
    label: 'Data Correction',
    description: 'Direct correction of the affected data',
  },
  process_change: {
    label: 'Process Change',
    description: 'Modification to business processes',
  },
  system_fix: {
    label: 'System Fix',
    description: 'Technical fix to systems or code',
  },
  exception_approved: {
    label: 'Exception Approved',
    description: 'Approved exception with documented rationale',
  },
  compensating_control: {
    label: 'Compensating Control',
    description: 'Alternative control implemented',
  },
}

/**
 * Check if an issue is critical and unresolved (blocking)
 * Property 2: Blocking Condition Enforcement
 */
export function isCriticalUnresolved(issue: Issue): boolean {
  return (
    issue.severity === 'critical' &&
    !['verified', 'closed', 'escalated'].includes(issue.status)
  )
}

/**
 * Check if there are any blocking issues
 * Property 2: Blocking Condition Enforcement
 */
export function hasBlockingIssues(issues: Issue[]): boolean {
  return issues.some(issue => isCriticalUnresolved(issue))
}

/**
 * Get blocking issues
 */
export function getBlockingIssues(issues: Issue[]): Issue[] {
  return issues.filter(issue => isCriticalUnresolved(issue))
}

/**
 * Sort issues by severity and priority
 */
export function sortIssuesBySeverity(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const severityDiff = SEVERITY_CONFIG[a.severity].priority - SEVERITY_CONFIG[b.severity].priority
    if (severityDiff !== 0) return severityDiff
    return a.priority - b.priority
  })
}

/**
 * Calculate issue summary
 */
export function calculateIssueSummary(issues: Issue[]): IssueSummary {
  const summary: IssueSummary = {
    totalIssues: issues.length,
    openIssues: 0,
    criticalIssues: 0,
    highIssues: 0,
    mediumIssues: 0,
    lowIssues: 0,
    resolvedIssues: 0,
    verifiedIssues: 0,
    escalatedIssues: 0,
    blockingIssues: 0,
    avgResolutionTime: 0,
  }

  let totalResolutionTime = 0
  let resolvedCount = 0

  for (const issue of issues) {
    // Count by status
    if (!['verified', 'closed'].includes(issue.status)) {
      summary.openIssues++
    }
    if (issue.status === 'verified' || issue.status === 'closed') {
      summary.resolvedIssues++
    }
    if (issue.status === 'verified') {
      summary.verifiedIssues++
    }
    if (issue.status === 'escalated') {
      summary.escalatedIssues++
    }

    // Count by severity
    switch (issue.severity) {
      case 'critical':
        summary.criticalIssues++
        break
      case 'high':
        summary.highIssues++
        break
      case 'medium':
        summary.mediumIssues++
        break
      case 'low':
        summary.lowIssues++
        break
    }

    // Count blocking
    if (isCriticalUnresolved(issue)) {
      summary.blockingIssues++
    }

    // Calculate resolution time
    if (issue.resolution?.implementedAt) {
      const created = new Date(issue.createdAt).getTime()
      const resolved = new Date(issue.resolution.implementedAt).getTime()
      totalResolutionTime += resolved - created
      resolvedCount++
    }
  }

  if (resolvedCount > 0) {
    summary.avgResolutionTime = totalResolutionTime / resolvedCount / (1000 * 60 * 60 * 24) // days
  }

  return summary
}

