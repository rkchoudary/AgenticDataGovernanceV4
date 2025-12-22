/**
 * RegulatoryIntelligencePhase Component
 * 
 * Phase 1 of the workflow wizard - guides users through reviewing
 * AI-detected regulatory changes and approving catalog updates.
 * 
 * Steps:
 * 1. Scan Results Review - View detected changes
 * 2. Change Analysis - Review and accept/reject changes
 * 3. Catalog Updates - Summary of accepted changes
 * 4. Stakeholder Approval - Human gate for final approval
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { useState, useCallback, useMemo } from 'react'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { PhaseState } from '@/types/workflow-wizard'
import { ScanResultsStep } from './ScanResultsStep'
import { ChangeAnalysisStep } from './ChangeAnalysisStep'
import { CatalogUpdatesStep } from './CatalogUpdatesStep'
import { StakeholderApprovalStep } from './StakeholderApprovalStep'
import {
  DetectedChange,
  ScanResults,
  CatalogUpdateSummary,
  REGULATORY_INTELLIGENCE_STEPS,
} from './types'

// ============================================================================
// Mock Data (will be replaced with API calls)
// ============================================================================

const MOCK_SCAN_RESULTS: ScanResults = {
  scanId: 'scan-001',
  scannedAt: new Date().toISOString(),
  sourcesScanned: 12,
  changesDetected: [],
  scanDuration: 45,
  nextScheduledScan: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
}

const MOCK_CHANGES: DetectedChange[] = [
  {
    id: 'change-001',
    source: 'Federal Reserve',
    sourceUrl: 'https://www.federalreserve.gov/regulations',
    changeType: 'updated_requirement',
    title: 'FR Y-14A Schedule Update',
    description: 'Updated data field requirements for Schedule A.1 - Domestic First Lien Closed-End 1-4 Family Residential Loans',
    currentValue: 'Original LTV ratio required',
    proposedValue: 'Original LTV ratio and Combined LTV ratio required',
    effectiveDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    detectedAt: new Date().toISOString(),
    confidence: 0.94,
    aiSummary: 'The Federal Reserve has updated FR Y-14A Schedule A.1 to require Combined LTV (CLTV) ratio in addition to the existing Original LTV ratio. This change affects all domestic first lien closed-end 1-4 family residential loan reporting.',
    impactedReports: ['FR Y-14A', 'FR Y-14Q'],
    status: 'pending',
  },
  {
    id: 'change-002',
    source: 'OCC',
    sourceUrl: 'https://www.occ.gov/news-issuances',
    changeType: 'deadline_change',
    title: 'Call Report Submission Deadline Extension',
    description: 'Extended submission deadline for Q4 Call Reports',
    currentValue: '30 calendar days after quarter end',
    proposedValue: '35 calendar days after quarter end',
    effectiveDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    detectedAt: new Date().toISOString(),
    confidence: 0.98,
    aiSummary: 'The OCC has announced a 5-day extension to the Call Report submission deadline, effective Q4 2024. This provides additional time for data validation and quality checks.',
    impactedReports: ['Call Report (FFIEC 031/041/051)'],
    status: 'pending',
  },
  {
    id: 'change-003',
    source: 'SEC',
    sourceUrl: 'https://www.sec.gov/rules',
    changeType: 'new_requirement',
    title: 'Climate Risk Disclosure Requirements',
    description: 'New mandatory climate-related financial risk disclosures',
    effectiveDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    detectedAt: new Date().toISOString(),
    confidence: 0.87,
    aiSummary: 'The SEC has finalized rules requiring registrants to disclose climate-related risks, including greenhouse gas emissions, climate-related targets, and transition plans. Large accelerated filers must comply first.',
    impactedReports: ['10-K', '10-Q', 'Annual Report'],
    status: 'pending',
  },
  {
    id: 'change-004',
    source: 'FDIC',
    sourceUrl: 'https://www.fdic.gov/regulations',
    changeType: 'format_change',
    title: 'Summary of Deposits Format Update',
    description: 'Updated XML schema for Summary of Deposits submission',
    currentValue: 'XML Schema v2.1',
    proposedValue: 'XML Schema v3.0',
    effectiveDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    detectedAt: new Date().toISOString(),
    confidence: 0.92,
    aiSummary: 'The FDIC has released an updated XML schema (v3.0) for Summary of Deposits submissions. The new schema includes additional validation rules and supports new data elements for digital banking channels.',
    impactedReports: ['Summary of Deposits'],
    status: 'pending',
  },
]

// ============================================================================
// Component Props
// ============================================================================

interface RegulatoryIntelligencePhaseProps {
  phase: PhaseState
}

// ============================================================================
// Main Component
// ============================================================================

export function RegulatoryIntelligencePhase({ phase }: RegulatoryIntelligencePhaseProps) {
  const { currentStep, completeStep, updateStepData } = useWorkflowWizardStore()
  
  // Local state for phase data
  const [changes, setChanges] = useState<DetectedChange[]>(MOCK_CHANGES)
  const [scanResults] = useState<ScanResults>({
    ...MOCK_SCAN_RESULTS,
    changesDetected: MOCK_CHANGES,
  })
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null)

  // Get current step info
  const currentStepData = phase.steps[currentStep]
  const currentStepId = currentStepData?.id

  // Calculate catalog summary
  const catalogSummary = useMemo<CatalogUpdateSummary>(() => {
    const accepted = changes.filter(c => c.status === 'accepted')
    const rejected = changes.filter(c => c.status === 'rejected')
    const modified = changes.filter(c => c.status === 'modified')
    const pending = changes.filter(c => c.status === 'pending')
    
    const impactedReports = new Set<string>()
    accepted.forEach(c => c.impactedReports.forEach(r => impactedReports.add(r)))
    modified.forEach(c => c.impactedReports.forEach(r => impactedReports.add(r)))
    
    return {
      totalChanges: changes.length,
      acceptedChanges: accepted.length,
      rejectedChanges: rejected.length,
      modifiedChanges: modified.length,
      pendingChanges: pending.length,
      impactedReports: Array.from(impactedReports),
      lastUpdated: new Date().toISOString(),
    }
  }, [changes])

  // Handle change status update
  const handleChangeStatusUpdate = useCallback((
    changeId: string,
    status: DetectedChange['status'],
    notes?: string
  ) => {
    setChanges(prev => prev.map(change => {
      if (change.id !== changeId) return change
      return {
        ...change,
        status,
        modificationNotes: notes,
        reviewedAt: new Date().toISOString(),
        reviewedBy: 'current-user', // Would come from auth context
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

  // Handle approval submission
  const handleApprovalSubmit = useCallback((rationale: string, signature?: string) => {
    // Save approval data
    updateStepData(REGULATORY_INTELLIGENCE_STEPS.STAKEHOLDER_APPROVAL, {
      approved: true,
      rationale,
      signature,
      approvedAt: new Date().toISOString(),
      catalogSummary,
    })
    completeStep(REGULATORY_INTELLIGENCE_STEPS.STAKEHOLDER_APPROVAL)
    
    // Since this is the last step of the phase, complete the phase and navigate to next
    // The completePhase function will validate all steps are complete
    const phaseCompleted = useWorkflowWizardStore.getState().completePhase(rationale, signature)
    if (phaseCompleted) {
      useWorkflowWizardStore.getState().navigateToNextPhase()
    }
  }, [completeStep, updateStepData, catalogSummary])

  // Handle rejection
  const handleApprovalReject = useCallback((reason: string) => {
    updateStepData(REGULATORY_INTELLIGENCE_STEPS.STAKEHOLDER_APPROVAL, {
      approved: false,
      rejectionReason: reason,
      rejectedAt: new Date().toISOString(),
    })
    // Don't complete step on rejection - requires re-review
  }, [updateStepData])

  // Render current step content
  const renderStepContent = () => {
    switch (currentStepId) {
      case REGULATORY_INTELLIGENCE_STEPS.SCAN_RESULTS:
        return (
          <ScanResultsStep
            scanResults={scanResults}
            onComplete={() => handleStepComplete(REGULATORY_INTELLIGENCE_STEPS.SCAN_RESULTS, {
              scanId: scanResults.scanId,
              changesCount: scanResults.changesDetected.length,
            })}
          />
        )
      
      case REGULATORY_INTELLIGENCE_STEPS.CHANGE_ANALYSIS:
        return (
          <ChangeAnalysisStep
            changes={changes}
            selectedChangeId={selectedChangeId}
            onSelectChange={setSelectedChangeId}
            onUpdateStatus={handleChangeStatusUpdate}
            onComplete={() => handleStepComplete(REGULATORY_INTELLIGENCE_STEPS.CHANGE_ANALYSIS, {
              reviewedChanges: changes.filter(c => c.status !== 'pending').length,
              totalChanges: changes.length,
            })}
          />
        )
      
      case REGULATORY_INTELLIGENCE_STEPS.CATALOG_UPDATES:
        return (
          <CatalogUpdatesStep
            changes={changes}
            summary={catalogSummary}
            onComplete={() => handleStepComplete(REGULATORY_INTELLIGENCE_STEPS.CATALOG_UPDATES, {
              catalogSummary,
            })}
          />
        )
      
      case REGULATORY_INTELLIGENCE_STEPS.STAKEHOLDER_APPROVAL:
        return (
          <StakeholderApprovalStep
            changes={changes}
            summary={catalogSummary}
            onApprove={handleApprovalSubmit}
            onReject={handleApprovalReject}
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

export default RegulatoryIntelligencePhase
