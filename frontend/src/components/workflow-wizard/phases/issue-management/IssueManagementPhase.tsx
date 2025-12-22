/**
 * IssueManagementPhase Component
 * 
 * Phase 6 of the workflow wizard - guides users through resolving
 * open issues before proceeding to the next phase.
 * 
 * Steps:
 * 1. Issue Triage - Review and prioritize issues by severity
 * 2. Root Cause Analysis - Analyze root causes with AI suggestions
 * 3. Resolution Implementation - Document fixes with evidence
 * 4. Verification - Verify resolutions with four-eyes confirmation
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { useState, useCallback, useMemo } from 'react'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { PhaseState } from '@/types/workflow-wizard'
import { IssueTriageStep } from './IssueTriageStep'
import { RootCauseAnalysisStep } from './RootCauseAnalysisStep'
import { ResolutionStep } from './ResolutionStep'
import { VerificationStep } from './VerificationStep'
import {
  Issue,
  IssueStatus,
  IssueSummary,
  Resolution,
  RootCauseSuggestion,
  ISSUE_MANAGEMENT_STEPS,
  calculateIssueSummary,
  hasBlockingIssues,
  getBlockingIssues,
} from './types'

// ============================================================================
// Mock Data (will be replaced with API calls)
// ============================================================================

const MOCK_ISSUES: Issue[] = [
  {
    id: 'issue-001',
    title: 'LTV Ratio Completeness Below Threshold',
    description: 'LTV ratio completeness dropped to 98.5%, below the 99.5% threshold. 150 loans missing LTV values.',
    source: 'dq_rule_failure',
    severity: 'critical',
    status: 'open',
    priority: 1,
    aiSuggestedPriority: 1,
    impactedCDEs: ['cde-001'],
    impactedReports: ['FR Y-14Q'],
    assignee: 'user-001',
    assigneeName: 'John Smith',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    rootCauseSuggestions: [
      {
        id: 'rc-001',
        category: 'system_integration',
        description: 'Data feed from LOS system failed to include LTV values for recent originations',
        confidence: 0.87,
        evidence: ['150 loans originated in last 48 hours', 'LOS feed timestamp shows gap'],
        suggestedActions: ['Contact LOS team', 'Request data resend', 'Validate feed configuration'],
        isAIGenerated: true,
      },
      {
        id: 'rc-002',
        category: 'process_gap',
        description: 'Manual entry process for LTV not followed for batch uploads',
        confidence: 0.65,
        evidence: ['Batch upload logs show missing fields'],
        suggestedActions: ['Review batch upload procedures', 'Add validation checks'],
        isAIGenerated: true,
      },
    ],
    similarIssues: [
      {
        id: 'hist-001',
        title: 'LTV Data Missing After System Upgrade',
        severity: 'critical',
        rootCause: 'System integration mapping error after LOS upgrade',
        resolution: 'Updated field mapping configuration and reprocessed affected records',
        resolvedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        similarity: 0.82,
      },
    ],
    escalationLevel: 0,
    isBlocking: true,
    isAIGenerated: true,
    aiConfidence: 0.92,
  },
  {
    id: 'issue-002',
    title: 'Credit Score Range Validation Failures',
    description: '25 records have credit scores outside valid FICO range (300-850). Values range from -1 to 999.',
    source: 'dq_rule_failure',
    severity: 'high',
    status: 'open',
    priority: 2,
    aiSuggestedPriority: 2,
    impactedCDEs: ['cde-002'],
    impactedReports: ['FR Y-14Q', 'CCAR'],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    rootCauseSuggestions: [
      {
        id: 'rc-003',
        category: 'data_entry_error',
        description: 'Credit bureau data contains placeholder values (-1) for unavailable scores',
        confidence: 0.91,
        evidence: ['All -1 values from same credit bureau', 'Bureau documentation confirms placeholder usage'],
        suggestedActions: ['Map -1 to NULL', 'Update data transformation logic'],
        isAIGenerated: true,
      },
    ],
    similarIssues: [],
    escalationLevel: 0,
    isBlocking: false,
    isAIGenerated: true,
    aiConfidence: 0.88,
  },
  {
    id: 'issue-003',
    title: 'Principal Balance Reconciliation Variance',
    description: 'Reconciliation between core banking and data warehouse shows $2.3M variance across 45 accounts.',
    source: 'reconciliation_mismatch',
    severity: 'critical',
    status: 'triaged',
    priority: 1,
    aiSuggestedPriority: 1,
    impactedCDEs: ['cde-003'],
    impactedReports: ['FR Y-14Q', 'Call Report'],
    assignee: 'user-002',
    assigneeName: 'Jane Doe',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    rootCauseSuggestions: [
      {
        id: 'rc-004',
        category: 'timing_issue',
        description: 'End-of-day cutoff timing difference between systems',
        confidence: 0.78,
        evidence: ['Variance concentrated in accounts with same-day transactions', 'Timestamp analysis shows 2-hour gap'],
        suggestedActions: ['Align cutoff times', 'Implement T+1 reconciliation'],
        isAIGenerated: true,
      },
    ],
    similarIssues: [
      {
        id: 'hist-002',
        title: 'Month-End Reconciliation Timing Issue',
        severity: 'high',
        rootCause: 'Different cutoff times between source and target systems',
        resolution: 'Standardized cutoff time to 6PM EST across all systems',
        resolvedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        similarity: 0.75,
      },
    ],
    escalationLevel: 0,
    isBlocking: true,
    isAIGenerated: true,
    aiConfidence: 0.85,
  },
  {
    id: 'issue-004',
    title: 'Days Past Due Calculation Inconsistency',
    description: 'DPD values inconsistent with loan status for 100 accounts. Loans marked performing have DPD > 90.',
    source: 'dq_rule_failure',
    severity: 'medium',
    status: 'analyzing',
    priority: 3,
    aiSuggestedPriority: 3,
    impactedCDEs: ['cde-004'],
    impactedReports: ['FR Y-14Q'],
    assignee: 'user-001',
    assigneeName: 'John Smith',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    rootCauseSuggestions: [
      {
        id: 'rc-005',
        category: 'process_gap',
        description: 'Restructured loans not properly flagged, causing status mismatch',
        confidence: 0.83,
        evidence: ['All affected accounts have recent modification dates', 'Restructure flag missing'],
        suggestedActions: ['Update restructure identification logic', 'Backfill restructure flags'],
        isAIGenerated: true,
      },
    ],
    similarIssues: [],
    escalationLevel: 0,
    isBlocking: false,
    isAIGenerated: true,
    aiConfidence: 0.79,
  },
  {
    id: 'issue-005',
    title: 'Lineage Break: Property Valuation Source',
    description: 'Lineage connection broken between appraisal system and LTV calculation. Unable to trace valuation source.',
    source: 'lineage_break',
    severity: 'low',
    status: 'open',
    priority: 4,
    aiSuggestedPriority: 4,
    impactedCDEs: ['cde-001'],
    impactedReports: ['FR Y-14Q'],
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    rootCauseSuggestions: [
      {
        id: 'rc-006',
        category: 'system_integration',
        description: 'Appraisal system API endpoint changed without lineage metadata update',
        confidence: 0.72,
        evidence: ['API version mismatch in logs', 'Lineage scan shows orphaned node'],
        suggestedActions: ['Update lineage configuration', 'Re-scan appraisal system'],
        isAIGenerated: true,
      },
    ],
    similarIssues: [],
    escalationLevel: 0,
    isBlocking: false,
    isAIGenerated: true,
    aiConfidence: 0.68,
  },
]

// ============================================================================
// Component Props
// ============================================================================

interface IssueManagementPhaseProps {
  phase: PhaseState
}

// ============================================================================
// Main Component
// ============================================================================

export function IssueManagementPhase({ phase }: IssueManagementPhaseProps) {
  const { currentStep, completeStep, updateStepData } = useWorkflowWizardStore()
  
  // Local state for phase data
  const [issues, setIssues] = useState<Issue[]>(MOCK_ISSUES)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)

  // Get current step info
  const currentStepData = phase.steps[currentStep]
  const currentStepId = currentStepData?.id

  // Calculate summary
  const summary = useMemo<IssueSummary>(() => {
    return calculateIssueSummary(issues)
  }, [issues])

  // Get blocking issues for Property 2: Blocking Condition Enforcement
  const blockingIssues = useMemo(() => {
    return getBlockingIssues(issues)
  }, [issues])

  // Check if phase can proceed (no blocking issues)
  const canProceed = useMemo(() => {
    return !hasBlockingIssues(issues)
  }, [issues])

  // Handle issue status update
  const handleStatusUpdate = useCallback((
    issueId: string,
    status: IssueStatus
  ) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id !== issueId) return issue
      return { ...issue, status }
    }))
  }, [])

  // Handle issue priority update
  const handlePriorityUpdate = useCallback((
    issueId: string,
    priority: number
  ) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id !== issueId) return issue
      return { ...issue, priority }
    }))
  }, [])

  // Handle issue assignment
  const handleAssign = useCallback((
    issueId: string,
    assigneeId: string,
    assigneeName: string
  ) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id !== issueId) return issue
      return { ...issue, assignee: assigneeId, assigneeName }
    }))
  }, [])

  // Handle issue escalation
  const handleEscalate = useCallback((
    issueId: string,
    reason: string
  ) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id !== issueId) return issue
      return {
        ...issue,
        status: 'escalated' as IssueStatus,
        escalationLevel: issue.escalationLevel + 1,
        escalatedAt: new Date().toISOString(),
        escalationReason: reason,
      }
    }))
  }, [])

  // Handle root cause selection
  const handleRootCauseSelect = useCallback((
    issueId: string,
    rootCause: RootCauseSuggestion
  ) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id !== issueId) return issue
      return {
        ...issue,
        status: 'resolving' as IssueStatus,
        resolution: {
          type: 'data_correction',
          description: '',
          rootCause: rootCause.description,
          rootCauseCategory: rootCause.category,
          implementedBy: '',
          implementedAt: '',
          evidence: [],
        },
      }
    }))
  }, [])

  // Handle resolution update
  const handleResolutionUpdate = useCallback((
    issueId: string,
    resolution: Partial<Resolution>
  ) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id !== issueId) return issue
      return {
        ...issue,
        resolution: {
          ...issue.resolution!,
          ...resolution,
        },
      }
    }))
  }, [])

  // Handle resolution submit
  const handleResolutionSubmit = useCallback((
    issueId: string,
    resolution: Resolution
  ) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id !== issueId) return issue
      return {
        ...issue,
        status: 'pending_verification' as IssueStatus,
        resolution: {
          ...resolution,
          implementedAt: new Date().toISOString(),
          implementedBy: 'current-user',
        },
      }
    }))
  }, [])

  // Handle verification (four-eyes confirmation)
  const handleVerify = useCallback((
    issueId: string,
    verifiedBy: string,
    notes: string
  ) => {
    setIssues(prev => prev.map(issue => {
      if (issue.id !== issueId) return issue
      return {
        ...issue,
        status: 'verified' as IssueStatus,
        resolution: {
          ...issue.resolution!,
          verifiedBy,
          verifiedAt: new Date().toISOString(),
          verificationNotes: notes,
        },
      }
    }))
  }, [])

  // Handle step completion
  const handleStepComplete = useCallback((stepId: string, data?: Record<string, unknown>) => {
    if (data) {
      updateStepData(stepId, data)
    }
    completeStep(stepId)
  }, [completeStep, updateStepData])

  // Render current step content
  const renderStepContent = () => {
    switch (currentStepId) {
      case ISSUE_MANAGEMENT_STEPS.TRIAGE:
        return (
          <IssueTriageStep
            issues={issues}
            summary={summary}
            onStatusUpdate={handleStatusUpdate}
            onPriorityUpdate={handlePriorityUpdate}
            onAssign={handleAssign}
            onEscalate={handleEscalate}
            onSelectIssue={setSelectedIssueId}
            onComplete={() => handleStepComplete(ISSUE_MANAGEMENT_STEPS.TRIAGE, {
              triagedIssues: issues.filter(i => i.status !== 'open').length,
              totalIssues: issues.length,
            })}
          />
        )
      
      case ISSUE_MANAGEMENT_STEPS.ROOT_CAUSE:
        return (
          <RootCauseAnalysisStep
            issues={issues.filter(i => ['triaged', 'analyzing'].includes(i.status))}
            selectedIssueId={selectedIssueId}
            onSelectIssue={setSelectedIssueId}
            onSelectRootCause={handleRootCauseSelect}
            onStatusUpdate={handleStatusUpdate}
            onComplete={() => handleStepComplete(ISSUE_MANAGEMENT_STEPS.ROOT_CAUSE, {
              analyzedIssues: issues.filter(i => i.resolution?.rootCause).length,
            })}
          />
        )
      
      case ISSUE_MANAGEMENT_STEPS.RESOLUTION:
        return (
          <ResolutionStep
            issues={issues.filter(i => ['resolving', 'pending_verification'].includes(i.status))}
            selectedIssueId={selectedIssueId}
            onSelectIssue={setSelectedIssueId}
            onResolutionUpdate={handleResolutionUpdate}
            onResolutionSubmit={handleResolutionSubmit}
            onComplete={() => handleStepComplete(ISSUE_MANAGEMENT_STEPS.RESOLUTION, {
              resolvedIssues: issues.filter(i => i.status === 'pending_verification').length,
            })}
          />
        )
      
      case ISSUE_MANAGEMENT_STEPS.VERIFICATION:
        return (
          <VerificationStep
            issues={issues.filter(i => i.status === 'pending_verification')}
            allIssues={issues}
            summary={summary}
            blockingIssues={blockingIssues}
            canProceed={canProceed}
            onVerify={handleVerify}
            onComplete={() => handleStepComplete(ISSUE_MANAGEMENT_STEPS.VERIFICATION, {
              verifiedIssues: issues.filter(i => i.status === 'verified').length,
              blockingIssuesRemaining: blockingIssues.length,
            })}
          />
        )
      
      default:
        return (
          <div className="text-center text-muted-foreground py-8">
            Unknown step: {currentStepId}
          </div>
        )
    }
  }

  return (
    <div className="space-y-6">
      {renderStepContent()}
    </div>
  )
}

export default IssueManagementPhase

