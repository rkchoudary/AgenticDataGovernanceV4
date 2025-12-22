/**
 * CDEIdentificationPhase Component
 * 
 * Phase 3 of the workflow wizard - guides users through reviewing
 * AI-identified CDEs, approving inventory, and assigning owners.
 * 
 * Steps:
 * 1. Scoring Review - Review CDE scores with radar chart
 * 2. Inventory Approval - Approve/reject CDEs for inventory
 * 3. Ownership Assignment - Assign owners to each CDE
 * 4. Reconciliation - Compare with external CDE lists
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { useState, useCallback, useMemo } from 'react'
import { Check, Target, ClipboardCheck, Users, GitCompare } from 'lucide-react'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { PhaseState } from '@/types/workflow-wizard'
import { cn } from '@/lib/utils'
import { ScoringReviewStep } from './ScoringReviewStep'
import { InventoryApprovalStep } from './InventoryApprovalStep'
import { OwnershipAssignmentStep } from './OwnershipAssignmentStep'
import { ReconciliationStep } from './ReconciliationStep'
import {
  CDE,
  CDEOwner,
  CDEInventory,
  CDEIdentificationSummary,
  ExternalCDEList,
  ReconciliationMatch,
  User,
  CDE_IDENTIFICATION_STEPS,
  allCDEsHaveOwners,
  getCDEsWithoutOwners,
  calculateAverageScore,
} from './types'

// ============================================================================
// Mock Data (will be replaced with API calls)
// ============================================================================

const MOCK_USERS: User[] = [
  { id: 'user-001', name: 'John Smith', email: 'john.smith@example.com', department: 'Risk Management', role: 'Data Steward' },
  { id: 'user-002', name: 'Sarah Johnson', email: 'sarah.johnson@example.com', department: 'Finance', role: 'Data Owner' },
  { id: 'user-003', name: 'Michael Chen', email: 'michael.chen@example.com', department: 'Compliance', role: 'Data Steward' },
  { id: 'user-004', name: 'Emily Davis', email: 'emily.davis@example.com', department: 'Operations', role: 'Business Analyst' },
  { id: 'user-005', name: 'Robert Wilson', email: 'robert.wilson@example.com', department: 'IT', role: 'Data Engineer' },
  { id: 'user-006', name: 'Lisa Anderson', email: 'lisa.anderson@example.com', department: 'Risk Management', role: 'Senior Analyst' },
  { id: 'user-007', name: 'David Martinez', email: 'david.martinez@example.com', department: 'Finance', role: 'Controller' },
  { id: 'user-008', name: 'Jennifer Taylor', email: 'jennifer.taylor@example.com', department: 'Compliance', role: 'Compliance Officer' },
]

const MOCK_CDES: CDE[] = [
  {
    id: 'cde-001',
    elementId: 'elem-001',
    name: 'Loan-to-Value Ratio',
    businessDefinition: 'The ratio of the loan amount to the appraised value of the property',
    dataType: 'decimal',
    sourceSystem: 'LOS',
    sourceTable: 'loan_details',
    sourceField: 'ltv_ratio',
    criticalityRationale: 'Used in multiple regulatory calculations including risk-weighted assets',
    overallScore: 92,
    scoringFactors: {
      regulatoryCalculationUsage: 95,
      crossReportUsage: 88,
      financialImpact: 90,
      regulatoryScrutiny: 95,
    },
    aiRationale: 'LTV ratio is a critical metric used in FR Y-14A Schedule A.1 for risk assessment. It directly impacts capital calculations and is subject to high regulatory scrutiny during stress testing.',
    status: 'pending',
  },
  {
    id: 'cde-002',
    elementId: 'elem-002',
    name: 'Borrower Credit Score',
    businessDefinition: 'FICO credit score of the primary borrower at loan origination',
    dataType: 'integer',
    sourceSystem: 'Credit Bureau',
    sourceTable: 'borrower_scores',
    sourceField: 'fico_score',
    criticalityRationale: 'Key input for probability of default models',
    overallScore: 88,
    scoringFactors: {
      regulatoryCalculationUsage: 90,
      crossReportUsage: 85,
      financialImpact: 85,
      regulatoryScrutiny: 92,
    },
    aiRationale: 'Credit score is fundamental to credit risk assessment and appears in multiple regulatory reports. It is a primary input for PD models used in capital calculations.',
    status: 'pending',
  },
  {
    id: 'cde-003',
    elementId: 'elem-003',
    name: 'Outstanding Principal Balance',
    businessDefinition: 'Current unpaid principal balance of the loan',
    dataType: 'decimal',
    sourceSystem: 'Core Banking',
    sourceTable: 'loan_balances',
    sourceField: 'principal_balance',
    criticalityRationale: 'Direct input to exposure calculations',
    overallScore: 95,
    scoringFactors: {
      regulatoryCalculationUsage: 98,
      crossReportUsage: 95,
      financialImpact: 95,
      regulatoryScrutiny: 92,
    },
    aiRationale: 'Principal balance is the foundation of exposure at default (EAD) calculations. It appears in virtually all regulatory reports and directly impacts capital requirements.',
    status: 'pending',
  },
  {
    id: 'cde-004',
    elementId: 'elem-004',
    name: 'Days Past Due',
    businessDefinition: 'Number of days the loan payment is overdue',
    dataType: 'integer',
    sourceSystem: 'Collections',
    sourceTable: 'delinquency',
    sourceField: 'days_past_due',
    criticalityRationale: 'Primary delinquency indicator for regulatory reporting',
    overallScore: 90,
    scoringFactors: {
      regulatoryCalculationUsage: 92,
      crossReportUsage: 90,
      financialImpact: 88,
      regulatoryScrutiny: 90,
    },
    aiRationale: 'Days past due is the primary indicator for loan delinquency status and drives classification into regulatory buckets (30, 60, 90+ days). Critical for allowance calculations.',
    status: 'pending',
  },
  {
    id: 'cde-005',
    elementId: 'elem-005',
    name: 'Property Type Code',
    businessDefinition: 'Classification code for the type of collateral property',
    dataType: 'string',
    sourceSystem: 'CRE System',
    sourceTable: 'properties',
    sourceField: 'property_type_code',
    criticalityRationale: 'Determines risk weight category',
    overallScore: 78,
    scoringFactors: {
      regulatoryCalculationUsage: 80,
      crossReportUsage: 75,
      financialImpact: 78,
      regulatoryScrutiny: 80,
    },
    aiRationale: 'Property type determines the applicable risk weight under Basel framework. Different property types have different loss characteristics and regulatory treatment.',
    status: 'pending',
  },
  {
    id: 'cde-006',
    elementId: 'elem-006',
    name: 'Interest Rate',
    businessDefinition: 'Current interest rate applied to the loan',
    dataType: 'decimal',
    sourceSystem: 'LOS',
    sourceTable: 'loan_terms',
    sourceField: 'interest_rate',
    criticalityRationale: 'Used in income projections and fair value calculations',
    overallScore: 82,
    scoringFactors: {
      regulatoryCalculationUsage: 85,
      crossReportUsage: 80,
      financialImpact: 85,
      regulatoryScrutiny: 78,
    },
    aiRationale: 'Interest rate is essential for calculating projected cash flows, net interest income, and fair value measurements required in regulatory reports.',
    status: 'pending',
  },
]

const MOCK_EXTERNAL_LISTS: ExternalCDEList[] = [
  {
    id: 'ext-001',
    name: 'Enterprise Data Catalog',
    source: 'enterprise_catalog',
    lastUpdated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    cdes: [
      { id: 'ext-cde-001', name: 'Loan-to-Value Ratio', definition: 'Ratio of loan amount to property value', owner: 'Risk Management', status: 'active' },
      { id: 'ext-cde-002', name: 'Credit Score', definition: 'Borrower FICO score', owner: 'Credit Risk', status: 'active' },
      { id: 'ext-cde-003', name: 'Principal Balance', definition: 'Outstanding loan principal', owner: 'Finance', status: 'active' },
      { id: 'ext-cde-004', name: 'Delinquency Days', definition: 'Days payment is overdue', owner: 'Collections', status: 'active' },
      { id: 'ext-cde-005', name: 'Collateral Type', definition: 'Type of property securing loan', owner: 'Risk Management', status: 'deprecated' },
    ],
  },
  {
    id: 'ext-002',
    name: 'Previous Cycle CDEs',
    source: 'previous_cycle',
    lastUpdated: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    cdes: [
      { id: 'prev-cde-001', name: 'LTV Ratio', definition: 'Loan to value ratio at origination', owner: 'John Smith', status: 'active' },
      { id: 'prev-cde-002', name: 'Borrower Credit Score', definition: 'FICO score of primary borrower', owner: 'Sarah Johnson', status: 'active' },
      { id: 'prev-cde-003', name: 'Outstanding Balance', definition: 'Current principal balance', owner: 'Michael Chen', status: 'active' },
      { id: 'prev-cde-004', name: 'Days Past Due', definition: 'Number of days delinquent', owner: 'Emily Davis', status: 'active' },
      { id: 'prev-cde-005', name: 'Maturity Date', definition: 'Loan maturity date', owner: 'Robert Wilson', status: 'active' },
    ],
  },
]

const MOCK_RECONCILIATION_MATCHES: ReconciliationMatch[] = [
  { currentCDEId: 'cde-001', externalCDEId: 'ext-cde-001', externalListId: 'ext-001', matchType: 'exact', confidence: 0.98, suggestedAction: 'keep' },
  { currentCDEId: 'cde-002', externalCDEId: 'ext-cde-002', externalListId: 'ext-001', matchType: 'partial', confidence: 0.85, suggestedAction: 'merge' },
  { currentCDEId: 'cde-003', externalCDEId: 'ext-cde-003', externalListId: 'ext-001', matchType: 'exact', confidence: 0.95, suggestedAction: 'keep' },
  { currentCDEId: 'cde-004', externalCDEId: 'ext-cde-004', externalListId: 'ext-001', matchType: 'exact', confidence: 0.92, suggestedAction: 'keep' },
  { currentCDEId: 'cde-005', externalCDEId: 'ext-cde-005', externalListId: 'ext-001', matchType: 'partial', confidence: 0.78, suggestedAction: 'merge' },
  { currentCDEId: 'cde-006', externalListId: 'ext-001', matchType: 'new', confidence: 1.0, suggestedAction: 'add' },
]

const MOCK_INVENTORY: CDEInventory = {
  id: 'inv-001',
  reportId: 'report-001',
  reportName: 'FR Y-14A',
  cdes: MOCK_CDES,
  version: 1,
  status: 'draft',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// ============================================================================
// Step Configuration
// ============================================================================

const STEP_CONFIG = [
  {
    id: CDE_IDENTIFICATION_STEPS.SCORING_REVIEW,
    name: 'Scoring Review',
    description: 'Review AI-identified CDEs and their scoring factors',
    icon: Target,
  },
  {
    id: CDE_IDENTIFICATION_STEPS.INVENTORY_APPROVAL,
    name: 'Inventory Approval',
    description: 'Approve or reject CDEs for the inventory',
    icon: ClipboardCheck,
  },
  {
    id: CDE_IDENTIFICATION_STEPS.OWNERSHIP_ASSIGNMENT,
    name: 'Ownership Assignment',
    description: 'Assign data owners to each CDE',
    icon: Users,
  },
  {
    id: CDE_IDENTIFICATION_STEPS.RECONCILIATION,
    name: 'Reconciliation',
    description: 'Compare with external CDE lists',
    icon: GitCompare,
  },
]

// ============================================================================
// Component Props
// ============================================================================

interface CDEIdentificationPhaseProps {
  phase: PhaseState
}

// ============================================================================
// Main Component
// ============================================================================

export function CDEIdentificationPhase({ phase }: CDEIdentificationPhaseProps) {
  const { currentStep, setCurrentStep, completeStep, updateStepData, setPhaseBlocked, clearPhaseBlocked, completePhase, navigateToNextPhase } = useWorkflowWizardStore()
  
  // Local state for phase data
  const [cdes, setCDEs] = useState<CDE[]>(MOCK_CDES)
  const [inventory] = useState<CDEInventory>(MOCK_INVENTORY)
  const [externalLists] = useState<ExternalCDEList[]>(MOCK_EXTERNAL_LISTS)
  const [reconciliationMatches, setReconciliationMatches] = useState<ReconciliationMatch[]>(MOCK_RECONCILIATION_MATCHES)
  const [users] = useState<User[]>(MOCK_USERS)
  const [selectedCDEId, setSelectedCDEId] = useState<string | null>(null)

  // Get current step info
  const currentStepData = phase.steps[currentStep]
  const currentStepId = currentStepData?.id

  // Calculate summary
  const summary = useMemo<CDEIdentificationSummary>(() => {
    const approved = cdes.filter(c => c.status === 'approved').length
    const rejected = cdes.filter(c => c.status === 'rejected').length
    const pending = cdes.filter(c => c.status === 'pending' || c.status === 'needs_review').length
    const withOwners = cdes.filter(c => c.owner).length
    const withoutOwners = cdes.filter(c => !c.owner).length
    const reconciled = reconciliationMatches.filter(m => m.actionTaken).length
    
    return {
      totalCDEs: cdes.length,
      approvedCDEs: approved,
      rejectedCDEs: rejected,
      pendingCDEs: pending,
      cdesWithOwners: withOwners,
      cdesWithoutOwners: withoutOwners,
      averageScore: calculateAverageScore(cdes),
      reconciliationComplete: reconciled === reconciliationMatches.length,
      lastUpdated: new Date().toISOString(),
    }
  }, [cdes, reconciliationMatches])

  // Handle CDE status update
  const handleCDEStatusUpdate = useCallback((
    cdeId: string,
    status: CDE['status'],
    rejectionReason?: string
  ) => {
    setCDEs(prev => prev.map(cde => {
      if (cde.id !== cdeId) return cde
      return {
        ...cde,
        status,
        rejectionReason,
        approvedBy: status === 'approved' ? 'current-user' : undefined,
        approvedAt: status === 'approved' ? new Date().toISOString() : undefined,
      }
    }))
  }, [])

  // Handle owner assignment
  const handleOwnerAssignment = useCallback((
    cdeId: string,
    user: User
  ) => {
    const owner: CDEOwner = {
      userId: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      assignedAt: new Date().toISOString(),
      assignedBy: 'current-user',
    }
    
    setCDEs(prev => prev.map(cde => {
      if (cde.id !== cdeId) return cde
      return { ...cde, owner }
    }))
  }, [])

  // Handle bulk owner assignment
  const handleBulkOwnerAssignment = useCallback((
    cdeIds: string[],
    user: User
  ) => {
    const owner: CDEOwner = {
      userId: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      assignedAt: new Date().toISOString(),
      assignedBy: 'current-user',
    }
    
    setCDEs(prev => prev.map(cde => {
      if (!cdeIds.includes(cde.id)) return cde
      return { ...cde, owner }
    }))
  }, [])

  // Handle reconciliation action
  const handleReconciliationAction = useCallback((
    currentCDEId: string,
    action: ReconciliationMatch['actionTaken'],
    notes?: string
  ) => {
    setReconciliationMatches(prev => prev.map(match => {
      if (match.currentCDEId !== currentCDEId) return match
      return { ...match, actionTaken: action, notes }
    }))
  }, [])

  // Handle bulk reconciliation action
  const handleBulkReconciliationAction = useCallback((
    cdeIds: string[],
    action: ReconciliationMatch['actionTaken']
  ) => {
    setReconciliationMatches(prev => prev.map(match => {
      if (!cdeIds.includes(match.currentCDEId)) return match
      return { ...match, actionTaken: action }
    }))
  }, [])

  // Handle step completion
  const handleStepComplete = useCallback((stepId: string, data?: Record<string, unknown>) => {
    if (data) {
      updateStepData(stepId, data)
    }
    completeStep(stepId)
  }, [completeStep, updateStepData])

  // Check ownership gate - Property 7: Ownership Gate Enforcement
  const checkOwnershipGate = useCallback(() => {
    const cdesWithoutOwners = getCDEsWithoutOwners(cdes)
    if (cdesWithoutOwners.length > 0) {
      setPhaseBlocked(
        'data_quality_rules',
        `${cdesWithoutOwners.length} CDE(s) require owner assignment before proceeding`
      )
      return false
    }
    clearPhaseBlocked('data_quality_rules')
    return true
  }, [cdes, setPhaseBlocked, clearPhaseBlocked])

  // Handle uploaded CDEs from manual inventory
  const handleUploadCDEs = useCallback((uploadedCDEs: CDE[]) => {
    setCDEs(prev => [...prev, ...uploadedCDEs])
  }, [])

  // Handle step click navigation
  const handleStepClick = (stepIndex: number) => {
    const step = phase.steps[stepIndex]
    // Can navigate to completed steps or current step or next step
    if (step.status === 'completed' || stepIndex === currentStep || stepIndex === currentStep + 1) {
      setCurrentStep(stepIndex)
    }
  }

  // Render current step content
  const renderStepContent = () => {
    switch (currentStepId) {
      case CDE_IDENTIFICATION_STEPS.SCORING_REVIEW:
        return (
          <ScoringReviewStep
            cdes={cdes}
            selectedCDEId={selectedCDEId}
            onSelectCDE={setSelectedCDEId}
            summary={summary}
            onComplete={() => handleStepComplete(CDE_IDENTIFICATION_STEPS.SCORING_REVIEW, {
              reviewedCDEs: cdes.length,
              averageScore: summary.averageScore,
            })}
            onUploadCDEs={handleUploadCDEs}
          />
        )
      
      case CDE_IDENTIFICATION_STEPS.INVENTORY_APPROVAL:
        return (
          <InventoryApprovalStep
            cdes={cdes}
            inventory={inventory}
            onUpdateStatus={handleCDEStatusUpdate}
            summary={summary}
            onComplete={() => handleStepComplete(CDE_IDENTIFICATION_STEPS.INVENTORY_APPROVAL, {
              approvedCDEs: summary.approvedCDEs,
              rejectedCDEs: summary.rejectedCDEs,
            })}
          />
        )
      
      case CDE_IDENTIFICATION_STEPS.OWNERSHIP_ASSIGNMENT:
        return (
          <OwnershipAssignmentStep
            cdes={cdes}
            users={users}
            onAssignOwner={handleOwnerAssignment}
            onBulkAssign={handleBulkOwnerAssignment}
            summary={summary}
            onComplete={() => {
              // Property 7: Check ownership gate before allowing completion
              if (!checkOwnershipGate()) {
                return // Block completion if CDEs without owners
              }
              handleStepComplete(CDE_IDENTIFICATION_STEPS.OWNERSHIP_ASSIGNMENT, {
                cdesWithOwners: summary.cdesWithOwners,
                allOwnersAssigned: allCDEsHaveOwners(cdes),
              })
            }}
          />
        )
      
      case CDE_IDENTIFICATION_STEPS.RECONCILIATION:
        return (
          <ReconciliationStep
            cdes={cdes}
            externalLists={externalLists}
            matches={reconciliationMatches}
            onReconciliationAction={handleReconciliationAction}
            onBulkAction={handleBulkReconciliationAction}
            onComplete={() => {
              handleStepComplete(CDE_IDENTIFICATION_STEPS.RECONCILIATION, {
                reconciliationComplete: summary.reconciliationComplete,
                matchesProcessed: reconciliationMatches.filter(m => m.actionTaken).length,
              })
              // Complete phase and navigate to next phase after last step
              completePhase()
              navigateToNextPhase()
            }}
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
      {/* Step Stepper */}
      <div className="flex items-center justify-between mb-6">
        {STEP_CONFIG.map((step, index) => {
          const phaseStep = phase.steps[index]
          const isCompleted = phaseStep?.status === 'completed'
          const isCurrent = index === currentStep
          const isClickable = isCompleted || isCurrent || index === currentStep + 1
          const Icon = step.icon
          
          return (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step indicator */}
              <button
                onClick={() => handleStepClick(index)}
                disabled={!isClickable}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg transition-all w-full',
                  isCurrent && 'bg-primary/10 border border-primary/30',
                  isCompleted && !isCurrent && 'hover:bg-muted/50 cursor-pointer',
                  !isClickable && 'opacity-50 cursor-not-allowed'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full shrink-0',
                    isCompleted && 'bg-primary text-primary-foreground',
                    isCurrent && !isCompleted && 'bg-primary/20 text-primary border-2 border-primary',
                    !isCompleted && !isCurrent && 'bg-muted text-muted-foreground'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <div className="text-left min-w-0">
                  <p className={cn(
                    'font-medium text-sm truncate',
                    isCurrent && 'text-primary',
                    isCompleted && 'text-primary'
                  )}>
                    {step.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate hidden lg:block">
                    {step.description}
                  </p>
                </div>
              </button>
              
              {/* Connector line */}
              {index < STEP_CONFIG.length - 1 && (
                <div className={cn(
                  'h-0.5 w-8 mx-2 shrink-0',
                  isCompleted ? 'bg-primary' : 'bg-muted'
                )} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step Content */}
      {renderStepContent()}
    </div>
  )
}

export default CDEIdentificationPhase
