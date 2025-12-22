/**
 * AttestationPhase Component
 * 
 * Phase 9 of the workflow wizard - final review and executive sign-off.
 * 
 * Steps:
 * 1. Executive Summary Review - Display key metrics and phase completions
 * 2. Compliance Checklist - Acknowledgment of all required items
 * 3. Digital Attestation - Signature with identity verification
 * 4. Submission Confirmation - Lock artifacts and generate receipt
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 * Property 8: Artifact Lock Immutability
 */

import { useState, useCallback, useMemo } from 'react'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { PhaseState, PHASE_ORDER, PHASE_CONFIG } from '@/types/workflow-wizard'
import { ExecutiveSummaryStep } from './ExecutiveSummaryStep'
import { ComplianceChecklistStep } from './ComplianceChecklistStep'
import { DigitalAttestationStep } from './DigitalAttestationStep'
import { SubmissionConfirmationStep } from './SubmissionConfirmationStep'
import {
  ExecutiveSummary,
  ExecutiveSummaryMetrics,
  PhaseCompletionSummary,
  ChecklistItem,
  ChecklistItemStatus,
  AttestationRecord,
  SubmissionReceipt,
  ArtifactLock,
  AttestationSummary,
  ATTESTATION_STEPS,
  calculateAttestationSummary,
  generateConfirmationNumber,
  calculatePackageHash,
} from './types'

// ============================================================================
// Mock Data (will be replaced with API calls)
// ============================================================================

const MOCK_METRICS: ExecutiveSummaryMetrics = {
  dataQualityScore: 94,
  issueResolutionRate: 87,
  controlPassRate: 92,
  deadlineStatus: 'on_track',
  daysUntilDeadline: 5,
  totalCDEs: 156,
  totalRules: 423,
  totalControls: 48,
  totalIssues: 23,
  resolvedIssues: 20,
  criticalIssuesRemaining: 0,
}

const MOCK_PHASE_COMPLETIONS: PhaseCompletionSummary[] = PHASE_ORDER.slice(0, 8).map((phase, idx) => ({
  phaseId: phase,
  phaseName: PHASE_CONFIG[phase].name,
  status: 'completed' as const,
  completedAt: new Date(Date.now() - (8 - idx) * 24 * 60 * 60 * 1000).toISOString(),
  completedBy: 'user-001',
  keyFindings: [
    `Phase ${idx + 1} completed successfully`,
    'All requirements met',
  ],
  approvalRationale: idx % 2 === 0 ? 'Approved after thorough review' : undefined,
}))

const MOCK_EXECUTIVE_SUMMARY: ExecutiveSummary = {
  reportName: 'BCBS 239 Quarterly Report - Q4 2024',
  reportingPeriod: 'October 1, 2024 - December 31, 2024',
  cycleId: 'cycle-001',
  metrics: MOCK_METRICS,
  phaseCompletions: MOCK_PHASE_COMPLETIONS,
  highlights: [
    'Data quality score improved by 8% from previous quarter',
    'All critical data elements have assigned owners',
    'Zero critical issues remaining',
    'Control effectiveness at 92%',
  ],
  risks: [
    '3 medium-priority issues pending resolution',
    'Two compensating controls expiring next month',
  ],
  recommendations: [
    'Continue monitoring data quality trends',
    'Schedule control renewal reviews',
  ],
  generatedAt: new Date().toISOString(),
  isAIGenerated: true,
  aiConfidence: 0.95,
}

const MOCK_CHECKLIST_ITEMS: ChecklistItem[] = [
  // Data Quality
  {
    id: 'chk-001',
    category: 'data_quality',
    title: 'Data Quality Rules Validated',
    description: 'All data quality rules have been reviewed and validated for accuracy',
    status: 'pending',
    isRequired: true,
    linkedArtifacts: ['Data Quality Report'],
  },
  {
    id: 'chk-002',
    category: 'data_quality',
    title: 'Quality Thresholds Met',
    description: 'Data quality scores meet or exceed defined thresholds',
    status: 'pending',
    isRequired: true,
  },
  // Regulatory Compliance
  {
    id: 'chk-003',
    category: 'regulatory_compliance',
    title: 'Regulatory Requirements Mapped',
    description: 'All regulatory requirements have been mapped to data elements',
    status: 'pending',
    isRequired: true,
    linkedArtifacts: ['Requirements Mapping'],
  },
  {
    id: 'chk-004',
    category: 'regulatory_compliance',
    title: 'BCBS 239 Principles Addressed',
    description: 'All 11 BCBS 239 principles have been assessed and documented',
    status: 'pending',
    isRequired: true,
    linkedArtifacts: ['BCBS 239 Compliance Matrix'],
  },
  // Controls
  {
    id: 'chk-005',
    category: 'controls',
    title: 'Control Effectiveness Verified',
    description: 'All controls have been tested and verified as effective',
    status: 'pending',
    isRequired: true,
    linkedArtifacts: ['Control Evidence'],
  },
  {
    id: 'chk-006',
    category: 'controls',
    title: 'Compensating Controls Documented',
    description: 'Any compensating controls have been properly documented',
    status: 'pending',
    isRequired: false,
  },
  // Documentation
  {
    id: 'chk-007',
    category: 'documentation',
    title: 'Documentation Complete',
    description: 'All required documentation has been generated and reviewed',
    status: 'pending',
    isRequired: true,
    linkedArtifacts: ['Data Dictionary', 'Lineage Documentation'],
  },
  {
    id: 'chk-008',
    category: 'documentation',
    title: 'Annotations Resolved',
    description: 'All document annotations have been addressed',
    status: 'pending',
    isRequired: true,
  },
  // Governance
  {
    id: 'chk-009',
    category: 'governance',
    title: 'Data Ownership Confirmed',
    description: 'All CDEs have confirmed data owners',
    status: 'pending',
    isRequired: true,
  },
  {
    id: 'chk-010',
    category: 'governance',
    title: 'Approval Chain Complete',
    description: 'All required approvals have been obtained',
    status: 'pending',
    isRequired: true,
  },
  // Risk Management
  {
    id: 'chk-011',
    category: 'risk_management',
    title: 'Issues Resolved or Escalated',
    description: 'All identified issues have been resolved or properly escalated',
    status: 'pending',
    isRequired: true,
    linkedArtifacts: ['Issue Summary'],
  },
  {
    id: 'chk-012',
    category: 'risk_management',
    title: 'Risk Assessment Complete',
    description: 'Risk assessment has been performed and documented',
    status: 'pending',
    isRequired: false,
  },
]

const MOCK_ATTESTOR = {
  id: 'user-001',
  name: 'John Smith',
  title: 'Chief Data Officer',
  email: 'john.smith@example.com',
}

const MOCK_ARTIFACT_IDS = [
  'art-001', 'art-002', 'art-003', 'art-004', 'art-005',
]

const MOCK_ARTIFACT_NAMES = [
  'Data Dictionary - Q4 2024',
  'Data Lineage Documentation',
  'Data Quality Assessment Report',
  'Control Effectiveness Evidence',
  'Issue Resolution Summary',
]

// ============================================================================
// Component Props
// ============================================================================

interface AttestationPhaseProps {
  phase: PhaseState
}

// ============================================================================
// Main Component
// ============================================================================

export function AttestationPhase({ phase }: AttestationPhaseProps) {
  const { currentStep, completeStep, updateStepData } = useWorkflowWizardStore()
  
  // Local state for phase data
  const [summaryReviewed, setSummaryReviewed] = useState(false)
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(MOCK_CHECKLIST_ITEMS)
  const [attestations, setAttestations] = useState<AttestationRecord[]>([])
  const [submissionReceipt, setSubmissionReceipt] = useState<SubmissionReceipt | null>(null)
  const [lockedArtifacts, setLockedArtifacts] = useState<ArtifactLock[]>([])

  // Get current step info
  const currentStepData = phase.steps[currentStep]
  const currentStepId = currentStepData?.id

  // Calculate summary
  const summary = useMemo<AttestationSummary>(() => {
    return calculateAttestationSummary(
      summaryReviewed,
      checklistItems,
      attestations,
      submissionReceipt?.status || 'draft',
      submissionReceipt || undefined,
      lockedArtifacts
    )
  }, [summaryReviewed, checklistItems, attestations, submissionReceipt, lockedArtifacts])

  // Handle checklist item status change
  const handleChecklistItemStatusChange = useCallback((
    itemId: string,
    status: ChecklistItemStatus,
    notes?: string
  ) => {
    setChecklistItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      return {
        ...item,
        status,
        notes,
        acknowledgedAt: status === 'acknowledged' ? new Date().toISOString() : undefined,
        acknowledgedBy: status === 'acknowledged' ? 'current-user' : undefined,
      }
    }))
  }, [])

  // Handle attestation
  const handleAttest = useCallback((rationale: string, signature: string) => {
    const newAttestation: AttestationRecord = {
      id: `att-${Date.now()}`,
      cycleId: MOCK_EXECUTIVE_SUMMARY.cycleId,
      attestorId: MOCK_ATTESTOR.id,
      attestorName: MOCK_ATTESTOR.name,
      attestorTitle: MOCK_ATTESTOR.title,
      attestorEmail: MOCK_ATTESTOR.email,
      attestationType: 'primary',
      signatureData: signature,
      signatureType: signature.startsWith('data:') ? 'drawn' : 'typed',
      rationale,
      attestedAt: new Date().toISOString(),
      identityVerified: true,
      verificationMethod: 'sso',
    }
    setAttestations(prev => [...prev, newAttestation])
  }, [])

  // Handle submission
  const handleSubmit = useCallback(async () => {
    // Simulate submission process
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Lock artifacts
    const locks: ArtifactLock[] = MOCK_ARTIFACT_IDS.map((id, idx) => ({
      artifactId: id,
      artifactName: MOCK_ARTIFACT_NAMES[idx],
      lockedAt: new Date().toISOString(),
      lockedBy: 'current-user',
      submissionId: `sub-${Date.now()}`,
      hash: calculatePackageHash([id]),
    }))
    setLockedArtifacts(locks)

    // Generate receipt
    const receipt: SubmissionReceipt = {
      id: `sub-${Date.now()}`,
      cycleId: MOCK_EXECUTIVE_SUMMARY.cycleId,
      reportName: MOCK_EXECUTIVE_SUMMARY.reportName,
      submissionTimestamp: new Date().toISOString(),
      submittedBy: 'current-user',
      submittedByName: MOCK_ATTESTOR.name,
      confirmationNumber: generateConfirmationNumber(),
      packageHash: calculatePackageHash(MOCK_ARTIFACT_IDS),
      artifactCount: MOCK_ARTIFACT_IDS.length,
      totalPages: 185,
      attestations,
      status: 'confirmed',
      lockedAt: new Date().toISOString(),
    }
    setSubmissionReceipt(receipt)
  }, [attestations])

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
      case ATTESTATION_STEPS.EXECUTIVE_SUMMARY:
        return (
          <ExecutiveSummaryStep
            summary={MOCK_EXECUTIVE_SUMMARY}
            onComplete={() => {
              setSummaryReviewed(true)
              handleStepComplete(ATTESTATION_STEPS.EXECUTIVE_SUMMARY, {
                reviewed: true,
                metrics: MOCK_METRICS,
              })
            }}
          />
        )
      
      case ATTESTATION_STEPS.COMPLIANCE_CHECKLIST:
        return (
          <ComplianceChecklistStep
            items={checklistItems}
            onItemStatusChange={handleChecklistItemStatusChange}
            onComplete={() => handleStepComplete(ATTESTATION_STEPS.COMPLIANCE_CHECKLIST, {
              itemsAcknowledged: summary.checklistItemsAcknowledged,
              totalItems: summary.checklistItemsTotal,
            })}
          />
        )
      
      case ATTESTATION_STEPS.DIGITAL_ATTESTATION:
        return (
          <DigitalAttestationStep
            attestor={MOCK_ATTESTOR}
            metrics={MOCK_METRICS}
            reportName={MOCK_EXECUTIVE_SUMMARY.reportName}
            reportingPeriod={MOCK_EXECUTIVE_SUMMARY.reportingPeriod}
            existingAttestations={attestations}
            onAttest={handleAttest}
            onComplete={() => handleStepComplete(ATTESTATION_STEPS.DIGITAL_ATTESTATION, {
              attestationCount: attestations.length + 1,
            })}
          />
        )
      
      case ATTESTATION_STEPS.SUBMISSION_CONFIRMATION:
        return (
          <SubmissionConfirmationStep
            reportName={MOCK_EXECUTIVE_SUMMARY.reportName}
            reportingPeriod={MOCK_EXECUTIVE_SUMMARY.reportingPeriod}
            attestations={attestations}
            artifactIds={MOCK_ARTIFACT_IDS}
            artifactNames={MOCK_ARTIFACT_NAMES}
            totalPages={185}
            submissionReceipt={submissionReceipt}
            lockedArtifacts={lockedArtifacts}
            onSubmit={handleSubmit}
            onComplete={() => handleStepComplete(ATTESTATION_STEPS.SUBMISSION_CONFIRMATION, {
              submissionId: submissionReceipt?.id,
              confirmationNumber: submissionReceipt?.confirmationNumber,
              lockedArtifacts: lockedArtifacts.length,
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

export default AttestationPhase
