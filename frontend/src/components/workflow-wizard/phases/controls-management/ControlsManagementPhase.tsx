/**
 * ControlsManagementPhase Component
 * 
 * Phase 7 of the workflow wizard - guides users through verifying
 * control effectiveness and managing compensating controls.
 * 
 * Steps:
 * 1. Status Review - Review pass/fail indicators for each control
 * 2. Evidence Collection - Upload evidence with metadata tagging
 * 3. Compensating Control Check - Review expiration warnings
 * 4. Effectiveness Sign-off - Capture attestation for control effectiveness
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { useState, useCallback, useMemo } from 'react'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { PhaseState } from '@/types/workflow-wizard'
import { StatusReviewStep } from './StatusReviewStep'
import { EvidenceCollectionStep } from './EvidenceCollectionStep'
import { CompensatingControlStep } from './CompensatingControlStep'
import { EffectivenessSignoffStep } from './EffectivenessSignoffStep'
import {
  Control,
  ControlEvidence,
  ControlEvidenceOutcome,
  ControlSummary,
  EffectivenessAttestation,
  CONTROLS_MANAGEMENT_STEPS,
  calculateControlSummary,
  getExpiringCompensatingControls,
} from './types'

// ============================================================================
// Mock Data (will be replaced with API calls)
// ============================================================================

const MOCK_CONTROLS: Control[] = [
  {
    id: 'ctrl-001',
    name: 'Data Quality Monitoring',
    description: 'Automated monitoring of data quality metrics with alerting for threshold breaches',
    type: 'process',
    category: 'detective',
    owner: 'user-001',
    ownerName: 'John Smith',
    frequency: 'daily',
    linkedCDEs: ['cde-001', 'cde-002'],
    linkedProcesses: ['data-ingestion', 'data-validation'],
    automationStatus: 'fully_automated',
    ruleId: 'dq-rule-001',
    status: 'active',
    evidence: [
      {
        id: 'ev-001',
        controlId: 'ctrl-001',
        type: 'report',
        name: 'DQ Monitoring Report - Dec 2024',
        description: 'Monthly data quality monitoring report showing all metrics within thresholds',
        executionDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        outcome: 'pass',
        details: 'All 15 DQ rules passed. Average quality score: 98.5%',
        uploadedBy: 'system',
        uploadedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    lastReviewedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastReviewedBy: 'user-001',
    nextReviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    effectivenessRating: 95,
  },
  {
    id: 'ctrl-002',
    name: 'Access Control Review',
    description: 'Quarterly review of user access rights to critical data systems',
    type: 'access',
    category: 'preventive',
    owner: 'user-002',
    ownerName: 'Jane Doe',
    frequency: 'quarterly',
    linkedCDEs: ['cde-001', 'cde-003'],
    linkedProcesses: ['user-provisioning'],
    automationStatus: 'semi_automated',
    status: 'active',
    evidence: [
      {
        id: 'ev-002',
        controlId: 'ctrl-002',
        type: 'document',
        name: 'Q4 Access Review Report',
        description: 'Quarterly access review completed with 3 exceptions noted',
        executionDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        outcome: 'exception',
        details: '3 users with excessive privileges identified. Remediation in progress.',
        uploadedBy: 'user-002',
        uploadedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    lastReviewedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    lastReviewedBy: 'user-002',
    nextReviewDate: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString(),
    effectivenessRating: 85,
  },
  {
    id: 'ctrl-003',
    name: 'Change Management Approval',
    description: 'All changes to data pipelines require documented approval before deployment',
    type: 'change_management',
    category: 'preventive',
    owner: 'user-003',
    ownerName: 'Bob Johnson',
    frequency: 'continuous',
    linkedCDEs: [],
    linkedProcesses: ['data-pipeline-deployment'],
    automationStatus: 'manual',
    status: 'active',
    evidence: [],
    nextReviewDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'ctrl-004',
    name: 'Data Reconciliation',
    description: 'Daily reconciliation between source systems and data warehouse',
    type: 'process',
    category: 'detective',
    owner: 'user-001',
    ownerName: 'John Smith',
    frequency: 'daily',
    linkedCDEs: ['cde-003'],
    linkedProcesses: ['data-reconciliation'],
    automationStatus: 'fully_automated',
    status: 'active',
    evidence: [
      {
        id: 'ev-003',
        controlId: 'ctrl-004',
        type: 'log',
        name: 'Reconciliation Log - Dec 19',
        description: 'Daily reconciliation failed due to source system outage',
        executionDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        outcome: 'fail',
        details: 'Source system unavailable from 02:00-04:00 UTC. Reconciliation incomplete.',
        uploadedBy: 'system',
        uploadedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    lastReviewedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    lastReviewedBy: 'system',
    effectivenessRating: 75,
  },
  {
    id: 'ctrl-005',
    name: 'Compensating Control - Manual LTV Validation',
    description: 'Manual validation of LTV calculations while automated control is being remediated',
    type: 'process',
    category: 'detective',
    owner: 'user-004',
    ownerName: 'Alice Williams',
    frequency: 'daily',
    linkedCDEs: ['cde-001'],
    linkedProcesses: ['ltv-calculation'],
    automationStatus: 'manual',
    status: 'compensating',
    linkedIssueId: 'issue-001',
    expirationDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    evidence: [
      {
        id: 'ev-004',
        controlId: 'ctrl-005',
        type: 'attestation',
        name: 'Manual LTV Validation - Dec 19',
        description: 'Daily manual validation of LTV calculations completed',
        executionDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        outcome: 'pass',
        details: 'Validated 150 LTV calculations. All within acceptable variance.',
        uploadedBy: 'user-004',
        uploadedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    lastReviewedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    lastReviewedBy: 'user-004',
    effectivenessRating: 90,
  },
  {
    id: 'ctrl-006',
    name: 'Compensating Control - Credit Score Override Review',
    description: 'Manual review of credit score overrides pending system fix',
    type: 'process',
    category: 'detective',
    owner: 'user-002',
    ownerName: 'Jane Doe',
    frequency: 'weekly',
    linkedCDEs: ['cde-002'],
    linkedProcesses: ['credit-scoring'],
    automationStatus: 'manual',
    status: 'compensating',
    linkedIssueId: 'issue-002',
    expirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    evidence: [],
    nextReviewDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

// ============================================================================
// Component Props
// ============================================================================

interface ControlsManagementPhaseProps {
  phase: PhaseState
}

// ============================================================================
// Main Component
// ============================================================================

export function ControlsManagementPhase({ phase }: ControlsManagementPhaseProps) {
  const { currentStep, completeStep, updateStepData } = useWorkflowWizardStore()
  
  // Local state for phase data
  const [controls, setControls] = useState<Control[]>(MOCK_CONTROLS)
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null)
  const [attestations, setAttestations] = useState<EffectivenessAttestation[]>([])

  // Get current step info
  const currentStepData = phase.steps[currentStep]
  const currentStepId = currentStepData?.id

  // Calculate summary
  const summary = useMemo<ControlSummary>(() => {
    return calculateControlSummary(controls)
  }, [controls])

  // Get expiring compensating controls
  const expiringControls = useMemo(() => {
    return getExpiringCompensatingControls(controls, 30)
  }, [controls])

  // Handle evidence upload
  const handleEvidenceUpload = useCallback((
    controlId: string,
    evidence: Omit<ControlEvidence, 'id' | 'controlId'>
  ) => {
    const newEvidence: ControlEvidence = {
      ...evidence,
      id: `ev-${Date.now()}`,
      controlId,
    }

    setControls(prev => prev.map(control => {
      if (control.id !== controlId) return control
      return {
        ...control,
        evidence: [...control.evidence, newEvidence],
        lastReviewedAt: new Date().toISOString(),
        lastReviewedBy: 'current-user',
      }
    }))
  }, [])

  // Handle evidence outcome update
  const handleEvidenceOutcomeUpdate = useCallback((
    controlId: string,
    evidenceId: string,
    outcome: ControlEvidenceOutcome
  ) => {
    setControls(prev => prev.map(control => {
      if (control.id !== controlId) return control
      return {
        ...control,
        evidence: control.evidence.map(ev => {
          if (ev.id !== evidenceId) return ev
          return { ...ev, outcome }
        }),
      }
    }))
  }, [])

  // Handle compensating control renewal confirmation
  const handleRenewalConfirm = useCallback((
    controlId: string,
    newExpirationDate: string
  ) => {
    setControls(prev => prev.map(control => {
      if (control.id !== controlId) return control
      return {
        ...control,
        expirationDate: newExpirationDate,
        evidence: [
          ...control.evidence,
          {
            id: `ev-renewal-${Date.now()}`,
            controlId,
            type: 'approval' as const,
            name: 'Compensating Control Renewal',
            description: `Compensating control renewed until ${new Date(newExpirationDate).toLocaleDateString()}`,
            executionDate: new Date().toISOString(),
            outcome: 'pass' as const,
            details: 'Renewal confirmed by control owner',
            uploadedBy: 'current-user',
            uploadedAt: new Date().toISOString(),
          },
        ],
      }
    }))
  }, [])

  // Handle effectiveness attestation
  const handleAttestation = useCallback((
    attestation: EffectivenessAttestation
  ) => {
    setAttestations(prev => [...prev, attestation])
    
    setControls(prev => prev.map(control => {
      if (control.id !== attestation.controlId) return control
      return {
        ...control,
        effectivenessRating: attestation.effectivenessRating,
        lastReviewedAt: attestation.attestedAt,
        lastReviewedBy: attestation.attestedBy,
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
      case CONTROLS_MANAGEMENT_STEPS.STATUS_REVIEW:
        return (
          <StatusReviewStep
            controls={controls}
            summary={summary}
            onSelectControl={setSelectedControlId}
            selectedControlId={selectedControlId}
            onComplete={() => handleStepComplete(CONTROLS_MANAGEMENT_STEPS.STATUS_REVIEW, {
              reviewedControls: controls.length,
              passedControls: summary.passedControls,
              failedControls: summary.failedControls,
            })}
          />
        )
      
      case CONTROLS_MANAGEMENT_STEPS.EVIDENCE_COLLECTION:
        return (
          <EvidenceCollectionStep
            controls={controls}
            selectedControlId={selectedControlId}
            onSelectControl={setSelectedControlId}
            onEvidenceUpload={handleEvidenceUpload}
            onEvidenceOutcomeUpdate={handleEvidenceOutcomeUpdate}
            onComplete={() => handleStepComplete(CONTROLS_MANAGEMENT_STEPS.EVIDENCE_COLLECTION, {
              evidenceCollected: controls.reduce((sum, c) => sum + c.evidence.length, 0),
            })}
          />
        )
      
      case CONTROLS_MANAGEMENT_STEPS.COMPENSATING_CHECK:
        return (
          <CompensatingControlStep
            controls={controls.filter(c => c.status === 'compensating')}
            expiringControls={expiringControls}
            onRenewalConfirm={handleRenewalConfirm}
            onSelectControl={setSelectedControlId}
            selectedControlId={selectedControlId}
            onComplete={() => handleStepComplete(CONTROLS_MANAGEMENT_STEPS.COMPENSATING_CHECK, {
              compensatingControls: summary.compensatingControls,
              expiringControls: expiringControls.length,
            })}
          />
        )
      
      case CONTROLS_MANAGEMENT_STEPS.EFFECTIVENESS_SIGNOFF:
        return (
          <EffectivenessSignoffStep
            controls={controls}
            summary={summary}
            attestations={attestations}
            onAttestation={handleAttestation}
            onComplete={() => handleStepComplete(CONTROLS_MANAGEMENT_STEPS.EFFECTIVENESS_SIGNOFF, {
              attestedControls: attestations.length,
              overallEffectiveness: summary.overallEffectiveness,
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

export default ControlsManagementPhase
