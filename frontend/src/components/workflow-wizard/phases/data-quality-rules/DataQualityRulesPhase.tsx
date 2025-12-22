/**
 * DataQualityRulesPhase Component
 * 
 * Phase 5 of the workflow wizard - guides users through reviewing
 * AI-generated DQ rules, configuring thresholds, validating coverage,
 * and activating rules.
 * 
 * Note: This phase comes after Lineage Mapping (Phase 4) because DQ rules
 * reference lineage information from CDEs established in the previous phase.
 * 
 * Steps:
 * 1. Rule Review - Review AI-generated rules with dimension, logic, threshold
 * 2. Threshold Configuration - Configure thresholds with histogram visualization
 * 3. Coverage Validation - Validate CDE vs dimension coverage matrix
 * 4. Rule Activation - Confirm and activate rules with schedule
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { useState, useCallback, useMemo } from 'react'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { PhaseState } from '@/types/workflow-wizard'
import { RuleReviewStep } from './RuleReviewStep'
import { ThresholdConfigStep } from './ThresholdConfigStep'
import { CoverageValidationStep } from './CoverageValidationStep'
import { RuleActivationStep } from './RuleActivationStep'
import {
  DQRule,
  DQRuleStatus,
  DQDimension,
  CDEWithRules,
  DQRulesSummary,
  ActivationSchedule,
  ActivationConfirmation,
  DQ_RULES_STEPS,
  calculateCoverageSummary,
  getActivatableRules,
} from './types'

// ============================================================================
// Mock Data (will be replaced with API calls)
// ============================================================================

const MOCK_RULES: DQRule[] = [
  {
    id: 'rule-001',
    cdeId: 'cde-001',
    cdeName: 'Loan-to-Value Ratio',
    dimension: 'completeness',
    name: 'LTV Ratio Completeness Check',
    description: 'Ensures LTV ratio is populated for all active loans',
    logic: {
      type: 'null_check',
      expression: 'ltv_ratio IS NOT NULL',
      description: 'Check that LTV ratio field is not null',
    },
    threshold: {
      type: 'percentage',
      value: 99.5,
      suggestedValue: 99.5,
      historicalAverage: 99.2,
    },
    severity: 'critical',
    status: 'pending',
    isAIGenerated: true,
    aiConfidence: 0.95,
    aiRationale: 'LTV ratio is a critical regulatory field. Historical data shows 99.2% completeness. Recommended threshold of 99.5% aligns with regulatory expectations.',
    enabled: false,
    createdAt: new Date().toISOString(),
    histogramData: [
      { binStart: 95, binEnd: 96, count: 5, percentage: 0.5 },
      { binStart: 96, binEnd: 97, count: 10, percentage: 1.0 },
      { binStart: 97, binEnd: 98, count: 25, percentage: 2.5 },
      { binStart: 98, binEnd: 99, count: 60, percentage: 6.0 },
      { binStart: 99, binEnd: 100, count: 900, percentage: 90.0 },
    ],
    impactPreview: {
      recordsFailing: 50,
      totalRecords: 10000,
      failurePercentage: 0.5,
      previousFailurePercentage: 0.8,
      trend: 'improving',
    },
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-001', nodeName: 'loan_origination.loans', nodeType: 'source_table', database: 'loan_origination', schema: 'public' },
      ],
      targetReportFields: [
        { nodeId: 'node-007', nodeName: 'FR Y-14A Schedule A.1 - LTV Ratio', reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '15' },
      ],
      upstreamCount: 1,
      downstreamCount: 3,
      hasCompleteLineage: true,
    },
  },
  {
    id: 'rule-002',
    cdeId: 'cde-001',
    cdeName: 'Loan-to-Value Ratio',
    dimension: 'validity',
    name: 'LTV Ratio Range Check',
    description: 'Validates LTV ratio is within acceptable range (0-200%)',
    logic: {
      type: 'range_check',
      expression: 'ltv_ratio BETWEEN 0 AND 200',
      parameters: { min: 0, max: 200 },
      description: 'Check that LTV ratio is between 0% and 200%',
    },
    threshold: {
      type: 'percentage',
      value: 99.9,
      suggestedValue: 99.9,
      historicalAverage: 99.8,
    },
    severity: 'high',
    status: 'pending',
    isAIGenerated: true,
    aiConfidence: 0.92,
    aiRationale: 'LTV ratios outside 0-200% range indicate data quality issues. Historical analysis shows 99.8% of records fall within this range.',
    enabled: false,
    createdAt: new Date().toISOString(),
    histogramData: [
      { binStart: 0, binEnd: 50, count: 2000, percentage: 20.0 },
      { binStart: 50, binEnd: 80, count: 4500, percentage: 45.0 },
      { binStart: 80, binEnd: 100, count: 2500, percentage: 25.0 },
      { binStart: 100, binEnd: 150, count: 800, percentage: 8.0 },
      { binStart: 150, binEnd: 200, count: 200, percentage: 2.0 },
    ],
    impactPreview: {
      recordsFailing: 10,
      totalRecords: 10000,
      failurePercentage: 0.1,
      trend: 'stable',
    },
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-001', nodeName: 'loan_origination.loans', nodeType: 'source_table', database: 'loan_origination', schema: 'public' },
      ],
      targetReportFields: [
        { nodeId: 'node-007', nodeName: 'FR Y-14A Schedule A.1 - LTV Ratio', reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '15' },
      ],
      upstreamCount: 1,
      downstreamCount: 3,
      hasCompleteLineage: true,
    },
  },
  {
    id: 'rule-003',
    cdeId: 'cde-002',
    cdeName: 'Borrower Credit Score',
    dimension: 'completeness',
    name: 'Credit Score Completeness Check',
    description: 'Ensures credit score is populated for all borrowers',
    logic: {
      type: 'null_check',
      expression: 'credit_score IS NOT NULL',
      description: 'Check that credit score field is not null',
    },
    threshold: {
      type: 'percentage',
      value: 98.0,
      suggestedValue: 98.0,
      historicalAverage: 97.5,
    },
    severity: 'critical',
    status: 'pending',
    isAIGenerated: true,
    aiConfidence: 0.88,
    aiRationale: 'Credit score is essential for risk assessment. Some legacy loans may not have scores. 98% threshold accounts for historical gaps.',
    enabled: false,
    createdAt: new Date().toISOString(),
    impactPreview: {
      recordsFailing: 200,
      totalRecords: 10000,
      failurePercentage: 2.0,
      trend: 'stable',
    },
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-002', nodeName: 'credit_bureau.scores', nodeType: 'source_table', database: 'credit_bureau', schema: 'external' },
      ],
      targetReportFields: [
        { nodeId: 'node-008', nodeName: 'FR Y-14A Schedule A.1 - Credit Score', reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '22' },
      ],
      upstreamCount: 1,
      downstreamCount: 3,
      hasCompleteLineage: true,
    },
  },
  {
    id: 'rule-004',
    cdeId: 'cde-002',
    cdeName: 'Borrower Credit Score',
    dimension: 'validity',
    name: 'Credit Score Range Check',
    description: 'Validates credit score is within FICO range (300-850)',
    logic: {
      type: 'range_check',
      expression: 'credit_score BETWEEN 300 AND 850',
      parameters: { min: 300, max: 850 },
      description: 'Check that credit score is between 300 and 850',
    },
    threshold: {
      type: 'percentage',
      value: 99.9,
      suggestedValue: 99.9,
      historicalAverage: 99.95,
    },
    severity: 'high',
    status: 'pending',
    isAIGenerated: true,
    aiConfidence: 0.96,
    aiRationale: 'FICO scores must be within 300-850 range. Values outside this range indicate data corruption or mapping errors.',
    enabled: false,
    createdAt: new Date().toISOString(),
    impactPreview: {
      recordsFailing: 5,
      totalRecords: 10000,
      failurePercentage: 0.05,
      trend: 'improving',
    },
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-002', nodeName: 'credit_bureau.scores', nodeType: 'source_table', database: 'credit_bureau', schema: 'external' },
      ],
      targetReportFields: [
        { nodeId: 'node-008', nodeName: 'FR Y-14A Schedule A.1 - Credit Score', reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '22' },
      ],
      upstreamCount: 1,
      downstreamCount: 3,
      hasCompleteLineage: true,
    },
  },
  {
    id: 'rule-005',
    cdeId: 'cde-003',
    cdeName: 'Outstanding Principal Balance',
    dimension: 'completeness',
    name: 'Principal Balance Completeness Check',
    description: 'Ensures principal balance is populated for all loans',
    logic: {
      type: 'null_check',
      expression: 'principal_balance IS NOT NULL',
      description: 'Check that principal balance field is not null',
    },
    threshold: {
      type: 'percentage',
      value: 100.0,
      suggestedValue: 100.0,
      historicalAverage: 100.0,
    },
    severity: 'critical',
    status: 'pending',
    isAIGenerated: true,
    aiConfidence: 0.99,
    aiRationale: 'Principal balance is mandatory for all loans. 100% completeness is required for accurate exposure calculations.',
    enabled: false,
    createdAt: new Date().toISOString(),
    impactPreview: {
      recordsFailing: 0,
      totalRecords: 10000,
      failurePercentage: 0,
      trend: 'stable',
    },
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-001', nodeName: 'loan_origination.loans', nodeType: 'source_table', database: 'loan_origination', schema: 'public' },
      ],
      targetReportFields: [],
      upstreamCount: 1,
      downstreamCount: 2,
      hasCompleteLineage: false,
    },
  },
  {
    id: 'rule-006',
    cdeId: 'cde-003',
    cdeName: 'Outstanding Principal Balance',
    dimension: 'accuracy',
    name: 'Principal Balance Reconciliation',
    description: 'Reconciles principal balance with source system',
    logic: {
      type: 'reconciliation',
      expression: 'ABS(principal_balance - source_balance) < 0.01',
      parameters: { tolerance: 0.01 },
      description: 'Check that principal balance matches source within $0.01',
    },
    threshold: {
      type: 'percentage',
      value: 99.5,
      suggestedValue: 99.5,
      historicalAverage: 99.3,
    },
    severity: 'critical',
    status: 'pending',
    isAIGenerated: true,
    aiConfidence: 0.91,
    aiRationale: 'Principal balance must reconcile with source system. Small timing differences may cause minor discrepancies.',
    enabled: false,
    createdAt: new Date().toISOString(),
    impactPreview: {
      recordsFailing: 50,
      totalRecords: 10000,
      failurePercentage: 0.5,
      trend: 'stable',
    },
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-001', nodeName: 'loan_origination.loans', nodeType: 'source_table', database: 'loan_origination', schema: 'public' },
      ],
      targetReportFields: [],
      upstreamCount: 1,
      downstreamCount: 2,
      hasCompleteLineage: false,
    },
  },
  {
    id: 'rule-007',
    cdeId: 'cde-004',
    cdeName: 'Days Past Due',
    dimension: 'timeliness',
    name: 'Days Past Due Currency Check',
    description: 'Ensures days past due is calculated from current date',
    logic: {
      type: 'custom',
      expression: 'calculation_date = CURRENT_DATE',
      description: 'Check that DPD is calculated using current date',
    },
    threshold: {
      type: 'percentage',
      value: 100.0,
      suggestedValue: 100.0,
      historicalAverage: 100.0,
    },
    severity: 'high',
    status: 'pending',
    isAIGenerated: true,
    aiConfidence: 0.94,
    aiRationale: 'Days past due must be calculated daily to ensure accurate delinquency reporting.',
    enabled: false,
    createdAt: new Date().toISOString(),
    impactPreview: {
      recordsFailing: 0,
      totalRecords: 10000,
      failurePercentage: 0,
      trend: 'stable',
    },
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-003', nodeName: 'collections.delinquency', nodeType: 'source_table', database: 'collections', schema: 'public' },
      ],
      targetReportFields: [
        { nodeId: 'node-009', nodeName: 'FR Y-14A Schedule A.1 - Days Past Due', reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '35' },
      ],
      upstreamCount: 1,
      downstreamCount: 3,
      hasCompleteLineage: true,
    },
  },
  {
    id: 'rule-008',
    cdeId: 'cde-004',
    cdeName: 'Days Past Due',
    dimension: 'consistency',
    name: 'Days Past Due Status Consistency',
    description: 'Ensures DPD aligns with loan status classification',
    logic: {
      type: 'custom',
      expression: '(days_past_due >= 90 AND status = "non_performing") OR (days_past_due < 90 AND status = "performing")',
      description: 'Check that DPD aligns with performing/non-performing status',
    },
    threshold: {
      type: 'percentage',
      value: 99.0,
      suggestedValue: 99.0,
      historicalAverage: 98.5,
    },
    severity: 'high',
    status: 'pending',
    isAIGenerated: true,
    aiConfidence: 0.87,
    aiRationale: 'Loan status must be consistent with days past due. Some exceptions may exist for restructured loans.',
    enabled: false,
    createdAt: new Date().toISOString(),
    impactPreview: {
      recordsFailing: 100,
      totalRecords: 10000,
      failurePercentage: 1.0,
      trend: 'degrading',
    },
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-003', nodeName: 'collections.delinquency', nodeType: 'source_table', database: 'collections', schema: 'public' },
      ],
      targetReportFields: [
        { nodeId: 'node-009', nodeName: 'FR Y-14A Schedule A.1 - Days Past Due', reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '35' },
      ],
      upstreamCount: 1,
      downstreamCount: 3,
      hasCompleteLineage: true,
    },
  },
]

const MOCK_CDES_WITH_RULES: CDEWithRules[] = [
  {
    id: 'cde-001',
    name: 'Loan-to-Value Ratio',
    businessDefinition: 'The ratio of the loan amount to the appraised value of the property',
    sourceSystem: 'LOS',
    rules: MOCK_RULES.filter(r => r.cdeId === 'cde-001'),
    coverageByDimension: {
      completeness: true,
      accuracy: false,
      validity: true,
      consistency: false,
      timeliness: false,
      uniqueness: false,
      integrity: false,
    },
    overallCoverage: 29,
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-001', nodeName: 'loan_origination.loans', nodeType: 'source_table', database: 'loan_origination', schema: 'public', tableName: 'loans' },
      ],
      targetReportFields: [
        { nodeId: 'node-007', fieldName: 'FR Y-14A Schedule A.1 - LTV Ratio', reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '15' },
      ],
      upstreamCount: 1,
      downstreamCount: 3,
      hasCompleteLineage: true,
      linkedBusinessTerms: [
        { termId: 'term-001', termName: 'Loan-to-Value Ratio', category: 'Risk Metrics' },
      ],
      lineageUpdatedAt: new Date().toISOString(),
    },
  },
  {
    id: 'cde-002',
    name: 'Borrower Credit Score',
    businessDefinition: 'FICO credit score of the primary borrower at loan origination',
    sourceSystem: 'Credit Bureau',
    rules: MOCK_RULES.filter(r => r.cdeId === 'cde-002'),
    coverageByDimension: {
      completeness: true,
      accuracy: false,
      validity: true,
      consistency: false,
      timeliness: false,
      uniqueness: false,
      integrity: false,
    },
    overallCoverage: 29,
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-002', nodeName: 'credit_bureau.scores', nodeType: 'source_table', database: 'credit_bureau', schema: 'external', tableName: 'scores' },
      ],
      targetReportFields: [
        { nodeId: 'node-008', fieldName: 'FR Y-14A Schedule A.1 - Credit Score', reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '22' },
      ],
      upstreamCount: 1,
      downstreamCount: 3,
      hasCompleteLineage: true,
      linkedBusinessTerms: [
        { termId: 'term-002', termName: 'Credit Score', category: 'Credit Assessment' },
      ],
      lineageUpdatedAt: new Date().toISOString(),
    },
  },
  {
    id: 'cde-003',
    name: 'Outstanding Principal Balance',
    businessDefinition: 'Current unpaid principal balance of the loan',
    sourceSystem: 'Core Banking',
    rules: MOCK_RULES.filter(r => r.cdeId === 'cde-003'),
    coverageByDimension: {
      completeness: true,
      accuracy: true,
      validity: false,
      consistency: false,
      timeliness: false,
      uniqueness: false,
      integrity: false,
    },
    overallCoverage: 29,
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-001', nodeName: 'loan_origination.loans', nodeType: 'source_table', database: 'loan_origination', schema: 'public', tableName: 'loans' },
      ],
      targetReportFields: [],
      upstreamCount: 1,
      downstreamCount: 2,
      hasCompleteLineage: false,
      linkedBusinessTerms: [
        { termId: 'term-004', termName: 'Principal Balance', category: 'Loan Attributes' },
      ],
      lineageUpdatedAt: new Date().toISOString(),
    },
  },
  {
    id: 'cde-004',
    name: 'Days Past Due',
    businessDefinition: 'Number of days the loan payment is overdue',
    sourceSystem: 'Collections',
    rules: MOCK_RULES.filter(r => r.cdeId === 'cde-004'),
    coverageByDimension: {
      completeness: false,
      accuracy: false,
      validity: false,
      consistency: true,
      timeliness: true,
      uniqueness: false,
      integrity: false,
    },
    overallCoverage: 29,
    lineageInfo: {
      sourceNodes: [
        { nodeId: 'node-003', nodeName: 'collections.delinquency', nodeType: 'source_table', database: 'collections', schema: 'public', tableName: 'delinquency' },
      ],
      targetReportFields: [
        { nodeId: 'node-009', fieldName: 'FR Y-14A Schedule A.1 - Days Past Due', reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '35' },
      ],
      upstreamCount: 1,
      downstreamCount: 3,
      hasCompleteLineage: true,
      linkedBusinessTerms: [
        { termId: 'term-003', termName: 'Days Past Due', category: 'Delinquency' },
      ],
      lineageUpdatedAt: new Date().toISOString(),
    },
  },
]

const MOCK_SCHEDULE: ActivationSchedule = {
  frequency: 'daily',
  startDate: new Date().toISOString(),
  nextRunDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  scheduledTime: '06:00',
  scheduledDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  timezone: 'America/New_York',
  notifyOnFailure: true,
  notificationRecipients: ['dq-team@example.com', 'data-steward@example.com'],
}

// ============================================================================
// Component Props
// ============================================================================

interface DataQualityRulesPhaseProps {
  phase: PhaseState
}

// ============================================================================
// Main Component
// ============================================================================

export function DataQualityRulesPhase({ phase }: DataQualityRulesPhaseProps) {
  const { currentStep, completeStep, updateStepData, completePhase, navigateToNextPhase } = useWorkflowWizardStore()
  
  // Local state for phase data
  const [rules, setRules] = useState<DQRule[]>(MOCK_RULES)
  const [cdesWithRules, setCdesWithRules] = useState<CDEWithRules[]>(MOCK_CDES_WITH_RULES)
  const [schedule, setSchedule] = useState<ActivationSchedule>(MOCK_SCHEDULE)
  const [activationConfirmation, setActivationConfirmation] = useState<ActivationConfirmation | null>(null)
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)

  // Get current step info
  const currentStepData = phase.steps[currentStep]
  const currentStepId = currentStepData?.id

  // Calculate summary
  const summary = useMemo<DQRulesSummary>(() => {
    const accepted = rules.filter(r => r.status === 'accepted').length
    const modified = rules.filter(r => r.status === 'modified').length
    const rejected = rules.filter(r => r.status === 'rejected').length
    const pending = rules.filter(r => r.status === 'pending').length
    const activated = rules.filter(r => r.enabled).length
    const coverageSummary = calculateCoverageSummary(cdesWithRules)
    
    return {
      totalRules: rules.length,
      acceptedRules: accepted,
      modifiedRules: modified,
      rejectedRules: rejected,
      pendingRules: pending,
      activatedRules: activated,
      coveragePercentage: coverageSummary.coveragePercentage,
      lastUpdated: new Date().toISOString(),
    }
  }, [rules, cdesWithRules])

  // Coverage summary
  const coverageSummary = useMemo(() => {
    return calculateCoverageSummary(cdesWithRules)
  }, [cdesWithRules])

  // Handle rule status update
  const handleRuleStatusUpdate = useCallback((
    ruleId: string,
    status: DQRuleStatus,
    rejectionReason?: string
  ) => {
    setRules(prev => prev.map(rule => {
      if (rule.id !== ruleId) return rule
      return {
        ...rule,
        status,
        rejectionReason,
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'current-user',
      }
    }))
  }, [])

  // Handle threshold update
  const handleThresholdUpdate = useCallback((
    ruleId: string,
    newThreshold: number
  ) => {
    setRules(prev => prev.map(rule => {
      if (rule.id !== ruleId) return rule
      return {
        ...rule,
        threshold: {
          ...rule.threshold,
          value: newThreshold,
        },
        status: rule.status === 'pending' ? 'modified' : rule.status,
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'current-user',
      }
    }))
  }, [])

  // Handle rule modification
  const handleRuleModify = useCallback((
    ruleId: string,
    updates: Partial<DQRule>
  ) => {
    setRules(prev => prev.map(rule => {
      if (rule.id !== ruleId) return rule
      return {
        ...rule,
        ...updates,
        status: 'modified',
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'current-user',
      }
    }))
  }, [])

  // Handle schedule update
  const handleScheduleUpdate = useCallback((
    updates: Partial<ActivationSchedule>
  ) => {
    setSchedule(prev => ({ ...prev, ...updates }))
  }, [])

  // Handle rule activation
  const handleActivateRules = useCallback((
    ruleIds: string[],
    notes?: string
  ) => {
    // Enable selected rules
    setRules(prev => prev.map(rule => {
      if (!ruleIds.includes(rule.id)) return rule
      return { ...rule, enabled: true }
    }))
    
    // Create confirmation record
    const confirmation: ActivationConfirmation = {
      ruleIds,
      schedule,
      confirmedBy: 'current-user',
      confirmedAt: new Date().toISOString(),
      notes,
    }
    setActivationConfirmation(confirmation)
  }, [schedule])

  // Handle adding a new rule from coverage matrix
  const handleAddRule = useCallback((
    cdeId: string,
    dimension: DQDimension,
    ruleData: Partial<DQRule>
  ) => {
    const newRule: DQRule = {
      id: `rule-${Date.now()}`,
      cdeId,
      cdeName: ruleData.cdeName || '',
      dimension,
      name: ruleData.name || '',
      description: ruleData.description || '',
      logic: ruleData.logic || {
        type: 'custom',
        expression: '',
        description: '',
      },
      threshold: ruleData.threshold || {
        type: 'percentage',
        value: 95,
        suggestedValue: 95,
      },
      severity: ruleData.severity || 'medium',
      status: 'accepted',
      isAIGenerated: ruleData.isAIGenerated || false,
      aiConfidence: ruleData.aiConfidence,
      aiRationale: ruleData.aiRationale,
      enabled: false,
      createdAt: new Date().toISOString(),
    }
    
    // Add rule to rules list
    setRules(prev => [...prev, newRule])
    
    // Update CDE coverage
    setCdesWithRules(prev => prev.map(cde => {
      if (cde.id !== cdeId) return cde
      const newCoverage = { ...cde.coverageByDimension, [dimension]: true }
      const coveredCount = Object.values(newCoverage).filter(Boolean).length
      return {
        ...cde,
        rules: [...cde.rules, newRule],
        coverageByDimension: newCoverage,
        overallCoverage: Math.round((coveredCount / 7) * 100),
      }
    }))
  }, [])

  // Handle updating an existing rule from coverage matrix
  const handleUpdateRuleFromMatrix = useCallback((
    ruleId: string,
    updates: Partial<DQRule>
  ) => {
    setRules(prev => prev.map(rule => {
      if (rule.id !== ruleId) return rule
      return {
        ...rule,
        ...updates,
        modifiedAt: new Date().toISOString(),
        modifiedBy: 'current-user',
      }
    }))
    
    // Also update in cdesWithRules
    setCdesWithRules(prev => prev.map(cde => ({
      ...cde,
      rules: cde.rules.map(rule => {
        if (rule.id !== ruleId) return rule
        return {
          ...rule,
          ...updates,
          modifiedAt: new Date().toISOString(),
          modifiedBy: 'current-user',
        }
      }),
    })))
  }, [])

  // Handle step completion
  const handleStepComplete = useCallback((stepId: string, data?: Record<string, unknown>) => {
    if (data) {
      updateStepData(stepId, data)
    }
    completeStep(stepId)
    
    // If this is the last step (Rule Activation), complete the phase and navigate to next
    if (stepId === DQ_RULES_STEPS.RULE_ACTIVATION) {
      completePhase()
      navigateToNextPhase()
    }
  }, [completeStep, updateStepData, completePhase, navigateToNextPhase])

  // Render current step content
  const renderStepContent = () => {
    switch (currentStepId) {
      case DQ_RULES_STEPS.RULE_REVIEW:
        return (
          <RuleReviewStep
            rules={rules}
            onUpdateStatus={handleRuleStatusUpdate}
            onModifyRule={handleRuleModify}
            summary={summary}
            onComplete={() => handleStepComplete(DQ_RULES_STEPS.RULE_REVIEW, {
              reviewedRules: rules.length,
              acceptedRules: summary.acceptedRules,
              modifiedRules: summary.modifiedRules,
              rejectedRules: summary.rejectedRules,
            })}
          />
        )
      
      case DQ_RULES_STEPS.THRESHOLD_CONFIG:
        return (
          <ThresholdConfigStep
            rules={rules.filter(r => r.status === 'accepted' || r.status === 'modified')}
            selectedRuleId={selectedRuleId}
            onSelectRule={setSelectedRuleId}
            onUpdateThreshold={handleThresholdUpdate}
            onComplete={() => handleStepComplete(DQ_RULES_STEPS.THRESHOLD_CONFIG, {
              configuredRules: getActivatableRules(rules).length,
            })}
          />
        )
      
      case DQ_RULES_STEPS.COVERAGE_VALIDATION:
        return (
          <CoverageValidationStep
            cdesWithRules={cdesWithRules}
            coverageSummary={coverageSummary}
            onAddRule={handleAddRule}
            onUpdateRule={handleUpdateRuleFromMatrix}
            onComplete={() => handleStepComplete(DQ_RULES_STEPS.COVERAGE_VALIDATION, {
              coveragePercentage: coverageSummary.coveragePercentage,
              gapCount: coverageSummary.gapCount,
            })}
          />
        )
      
      case DQ_RULES_STEPS.RULE_ACTIVATION:
        return (
          <RuleActivationStep
            rules={rules.filter(r => r.status !== 'rejected')}
            schedule={schedule}
            onUpdateSchedule={handleScheduleUpdate}
            onActivate={handleActivateRules}
            onUpdateRuleStatus={handleRuleStatusUpdate}
            activationConfirmation={activationConfirmation}
            onComplete={() => handleStepComplete(DQ_RULES_STEPS.RULE_ACTIVATION, {
              activatedRules: rules.filter(r => r.enabled).length,
              schedule: schedule,
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

export default DataQualityRulesPhase
