/**
 * LineageMappingPhase Component
 * 
 * Phase 4 of the workflow wizard - guides users through reviewing
 * and enriching data lineage from source to report.
 * 
 * Note: This phase comes before Data Quality Rules (Phase 5) because
 * DQ rules reference lineage information established here.
 * 
 * Steps:
 * 1. Pipeline Scan Review - Review discovered lineage from pipeline scans
 * 2. Business Term Linking - Link business glossary terms to lineage nodes
 * 3. Impact Analysis Setup - Configure notification rules for source changes
 * 4. Lineage Approval - Approve lineage and generate export
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { useState, useCallback, useMemo } from 'react'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { PhaseState } from '@/types/workflow-wizard'
import { PipelineScanStep } from './PipelineScanStep'
import { BusinessTermsStep } from './BusinessTermsStep'
import { ImpactAnalysisStep } from './ImpactAnalysisStep'
import { LineageApprovalStep } from './LineageApprovalStep'
import {
  LineageNode,
  LineageEdge,
  BusinessTerm,
  BusinessTermLink,
  ImpactRule,
  ImpactAnalysisConfig,
  PipelineScanResult,
  ScanIssue,
  LineageMappingSummary,
  LINEAGE_MAPPING_STEPS,
  calculateLineageSummary,
} from './types'

// ============================================================================
// Mock Data (will be replaced with API calls)
// ============================================================================

const MOCK_NODES: LineageNode[] = [
  {
    id: 'node-001',
    label: 'loan_origination.loans',
    type: 'source_table',
    description: 'Primary loan origination table containing all loan applications',
    owner: 'Data Engineering',
    database: 'loan_origination',
    schema: 'public',
    tableName: 'loans',
    qualityScore: 98,
    lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    status: 'healthy',
    relatedCDEs: ['cde-001', 'cde-003'],
    businessTerms: [],
    metadata: { rowCount: '1,250,000', refreshFrequency: 'Daily' },
    position: { x: 50, y: 100 },
  },
  {
    id: 'node-002',
    label: 'credit_bureau.scores',
    type: 'source_table',
    description: 'Credit bureau score data for borrowers',
    owner: 'Credit Risk',
    database: 'credit_bureau',
    schema: 'external',
    tableName: 'scores',
    qualityScore: 95,
    lastUpdated: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    status: 'healthy',
    relatedCDEs: ['cde-002'],
    businessTerms: [],
    metadata: { rowCount: '2,100,000', refreshFrequency: 'Daily' },
    position: { x: 50, y: 250 },
  },
  {
    id: 'node-003',
    label: 'collections.delinquency',
    type: 'source_table',
    description: 'Delinquency tracking from collections system',
    owner: 'Collections',
    database: 'collections',
    schema: 'public',
    tableName: 'delinquency',
    qualityScore: 92,
    lastUpdated: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    status: 'warning',
    relatedCDEs: ['cde-004'],
    businessTerms: [],
    metadata: { rowCount: '450,000', refreshFrequency: 'Hourly' },
    position: { x: 50, y: 400 },
  },
  {
    id: 'node-004',
    label: 'etl_loan_enrichment',
    type: 'transformation',
    description: 'Enriches loan data with credit scores and delinquency status',
    owner: 'Data Engineering',
    qualityScore: 99,
    lastUpdated: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    status: 'healthy',
    relatedCDEs: [],
    businessTerms: [],
    metadata: { transformationType: 'SQL', runtime: '15 min' },
    position: { x: 300, y: 200 },
  },
  {
    id: 'node-005',
    label: 'etl_risk_calculation',
    type: 'transformation',
    description: 'Calculates risk metrics including LTV and PD',
    owner: 'Risk Analytics',
    qualityScore: 97,
    lastUpdated: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    status: 'healthy',
    relatedCDEs: [],
    businessTerms: [],
    metadata: { transformationType: 'Python', runtime: '25 min' },
    position: { x: 550, y: 200 },
  },
  {
    id: 'node-006',
    label: 'staging.loan_risk_metrics',
    type: 'staging_table',
    description: 'Staging table for calculated risk metrics',
    owner: 'Data Engineering',
    database: 'staging',
    schema: 'risk',
    tableName: 'loan_risk_metrics',
    qualityScore: 96,
    lastUpdated: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    status: 'healthy',
    relatedCDEs: ['cde-001', 'cde-002', 'cde-003', 'cde-004'],
    businessTerms: [],
    metadata: { rowCount: '1,250,000', refreshFrequency: 'Daily' },
    position: { x: 800, y: 200 },
  },
  {
    id: 'node-007',
    label: 'FR Y-14A Schedule A.1 - LTV Ratio',
    type: 'report_field',
    description: 'Loan-to-Value Ratio field in FR Y-14A Schedule A.1',
    owner: 'Regulatory Reporting',
    qualityScore: 99,
    lastUpdated: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    status: 'healthy',
    relatedCDEs: ['cde-001'],
    businessTerms: [],
    metadata: { reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '15' },
    position: { x: 1050, y: 100 },
  },
  {
    id: 'node-008',
    label: 'FR Y-14A Schedule A.1 - Credit Score',
    type: 'report_field',
    description: 'Borrower Credit Score field in FR Y-14A Schedule A.1',
    owner: 'Regulatory Reporting',
    qualityScore: 98,
    lastUpdated: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    status: 'healthy',
    relatedCDEs: ['cde-002'],
    businessTerms: [],
    metadata: { reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '22' },
    position: { x: 1050, y: 200 },
  },
  {
    id: 'node-009',
    label: 'FR Y-14A Schedule A.1 - Days Past Due',
    type: 'report_field',
    description: 'Days Past Due field in FR Y-14A Schedule A.1',
    owner: 'Regulatory Reporting',
    qualityScore: 97,
    lastUpdated: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    status: 'healthy',
    relatedCDEs: ['cde-004'],
    businessTerms: [],
    metadata: { reportId: 'FR Y-14A', schedule: 'A.1', fieldNumber: '35' },
    position: { x: 1050, y: 300 },
  },
]

const MOCK_EDGES: LineageEdge[] = [
  { id: 'edge-001', source: 'node-001', target: 'node-004', transformationType: 'JOIN', isAIGenerated: true, confidence: 0.95 },
  { id: 'edge-002', source: 'node-002', target: 'node-004', transformationType: 'JOIN', isAIGenerated: true, confidence: 0.92 },
  { id: 'edge-003', source: 'node-003', target: 'node-004', transformationType: 'JOIN', isAIGenerated: true, confidence: 0.88 },
  { id: 'edge-004', source: 'node-004', target: 'node-005', transformationType: 'TRANSFORM', isAIGenerated: true, confidence: 0.97 },
  { id: 'edge-005', source: 'node-005', target: 'node-006', transformationType: 'INSERT', isAIGenerated: true, confidence: 0.99 },
  { id: 'edge-006', source: 'node-006', target: 'node-007', transformationType: 'SELECT', isAIGenerated: true, confidence: 0.96 },
  { id: 'edge-007', source: 'node-006', target: 'node-008', transformationType: 'SELECT', isAIGenerated: true, confidence: 0.94 },
  { id: 'edge-008', source: 'node-006', target: 'node-009', transformationType: 'SELECT', isAIGenerated: true, confidence: 0.93 },
]

const MOCK_BUSINESS_TERMS: BusinessTerm[] = [
  { id: 'term-001', name: 'Loan-to-Value Ratio', definition: 'The ratio of a loan to the value of the asset purchased', category: 'Risk Metrics', domain: 'Credit Risk', synonyms: ['LTV', 'LTV Ratio'], relatedTerms: ['Collateral Value', 'Loan Amount'], owner: 'Risk Management', status: 'active' },
  { id: 'term-002', name: 'Credit Score', definition: 'A numerical expression of creditworthiness based on credit history', category: 'Credit Assessment', domain: 'Credit Risk', synonyms: ['FICO Score', 'Credit Rating'], relatedTerms: ['Credit History', 'Default Risk'], owner: 'Credit Risk', status: 'active' },
  { id: 'term-003', name: 'Days Past Due', definition: 'The number of days a payment is overdue', category: 'Delinquency', domain: 'Collections', synonyms: ['DPD', 'Delinquency Days'], relatedTerms: ['Payment Status', 'Default'], owner: 'Collections', status: 'active' },
  { id: 'term-004', name: 'Principal Balance', definition: 'The outstanding amount of a loan excluding interest', category: 'Loan Attributes', domain: 'Finance', synonyms: ['Outstanding Principal', 'Loan Balance'], relatedTerms: ['Interest', 'Total Balance'], owner: 'Finance', status: 'active' },
  { id: 'term-005', name: 'Probability of Default', definition: 'The likelihood that a borrower will default on a loan', category: 'Risk Metrics', domain: 'Credit Risk', synonyms: ['PD', 'Default Probability'], relatedTerms: ['Credit Score', 'Risk Rating'], owner: 'Risk Management', status: 'active' },
  { id: 'term-006', name: 'Exposure at Default', definition: 'The total value exposed to loss when a default occurs', category: 'Risk Metrics', domain: 'Credit Risk', synonyms: ['EAD'], relatedTerms: ['Principal Balance', 'Credit Limit'], owner: 'Risk Management', status: 'active' },
  { id: 'term-007', name: 'Loss Given Default', definition: 'The percentage of exposure lost when a default occurs', category: 'Risk Metrics', domain: 'Credit Risk', synonyms: ['LGD'], relatedTerms: ['Recovery Rate', 'Collateral'], owner: 'Risk Management', status: 'active' },
  { id: 'term-008', name: 'Risk-Weighted Assets', definition: 'Assets weighted by credit risk for capital calculation', category: 'Capital', domain: 'Regulatory', synonyms: ['RWA'], relatedTerms: ['Capital Ratio', 'Basel'], owner: 'Regulatory', status: 'active' },
]

const MOCK_SCAN_RESULT: PipelineScanResult = {
  id: 'scan-001',
  pipelineName: 'FR Y-14A Data Pipeline',
  scanDate: new Date().toISOString(),
  status: 'completed',
  nodesDiscovered: 9,
  edgesDiscovered: 8,
  newNodes: [],
  newEdges: [],
  changedNodes: [],
  removedNodeIds: [],
  issues: [
    { id: 'issue-001', type: 'missing_source', severity: 'medium', nodeId: 'node-003', description: 'Source table collections.delinquency has delayed refresh', suggestedAction: 'Verify ETL job status' },
  ],
}

const MOCK_IMPACT_CONFIG: ImpactAnalysisConfig = {
  rules: [],
  globalSettings: {
    defaultNotificationChannels: ['email'],
    defaultRecipients: ['data-governance@example.com'],
    enableAutoDetection: true,
    sensitivityLevel: 'medium',
  },
}

// Mock CDEs from CDE Identification phase (Phase 3)
// These represent CDEs that were identified and approved in previous steps
interface IdentifiedCDE {
  id: string
  name: string
  sourceSystem: string
  sourceTable: string
  owner: string
}

const MOCK_IDENTIFIED_CDES: IdentifiedCDE[] = [
  { id: 'cde-001', name: 'Loan-to-Value Ratio', sourceSystem: 'loan_origination', sourceTable: 'loans', owner: 'Risk Management' },
  { id: 'cde-002', name: 'Credit Score', sourceSystem: 'credit_bureau', sourceTable: 'scores', owner: 'Credit Risk' },
  { id: 'cde-003', name: 'Original Loan Amount', sourceSystem: 'loan_origination', sourceTable: 'loans', owner: 'Finance' },
  { id: 'cde-004', name: 'Days Past Due', sourceSystem: 'collections', sourceTable: 'delinquency', owner: 'Collections' },
  { id: 'cde-005', name: 'Probability of Default', sourceSystem: 'risk_models', sourceTable: 'pd_scores', owner: 'Risk Analytics' },
  { id: 'cde-006', name: 'Exposure at Default', sourceSystem: 'risk_models', sourceTable: 'ead_calculations', owner: 'Risk Analytics' },
]

/**
 * Check which CDEs from previous steps don't have lineage coverage
 * and generate issues for them
 */
function generateCDELineageIssues(
  identifiedCDEs: IdentifiedCDE[],
  lineageNodes: LineageNode[]
): ScanIssue[] {
  // Collect all CDE IDs that appear in lineage nodes
  const cdesWithLineage = new Set<string>()
  lineageNodes.forEach(node => {
    node.relatedCDEs.forEach(cdeId => cdesWithLineage.add(cdeId))
  })

  // Find CDEs without lineage coverage
  const cdesWithoutLineage = identifiedCDEs.filter(cde => !cdesWithLineage.has(cde.id))

  // Generate issues for each CDE without lineage
  return cdesWithoutLineage.map((cde, index) => ({
    id: `cde-lineage-issue-${index + 1}`,
    type: 'cde_missing_lineage' as const,
    severity: 'high' as const,
    cdeId: cde.id,
    cdeName: cde.name,
    description: `CDE "${cde.name}" (${cde.id}) identified in CDE Identification phase has no lineage mapping. Source: ${cde.sourceSystem}.${cde.sourceTable}`,
    suggestedAction: `Add lineage nodes for ${cde.sourceSystem}.${cde.sourceTable} or upload lineage data that includes this CDE. Contact ${cde.owner} for source system details.`,
  }))
}

// ============================================================================
// Component Props
// ============================================================================

interface LineageMappingPhaseProps {
  phase: PhaseState
}

// ============================================================================
// Main Component
// ============================================================================

export function LineageMappingPhase({ phase }: LineageMappingPhaseProps) {
  const { currentStep, completeStep, updateStepData } = useWorkflowWizardStore()
  
  // Local state for phase data
  const [nodes, setNodes] = useState<LineageNode[]>(MOCK_NODES)
  const [edges] = useState<LineageEdge[]>(MOCK_EDGES)
  const [businessTerms] = useState<BusinessTerm[]>(MOCK_BUSINESS_TERMS)
  const [scanResult] = useState<PipelineScanResult>(MOCK_SCAN_RESULT)
  
  // Generate initial issues: scan issues + CDE lineage coverage issues
  const initialIssues = useMemo(() => {
    const cdeIssues = generateCDELineageIssues(MOCK_IDENTIFIED_CDES, MOCK_NODES)
    return [...MOCK_SCAN_RESULT.issues, ...cdeIssues]
  }, [])
  
  const [scanIssues, setScanIssues] = useState<ScanIssue[]>(initialIssues)
  const [impactConfig, setImpactConfig] = useState<ImpactAnalysisConfig>(MOCK_IMPACT_CONFIG)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [approvalData, setApprovalData] = useState<{ rationale?: string; signature?: string } | null>(null)

  // Get current step info
  const currentStepData = phase.steps[currentStep]
  const currentStepId = currentStepData?.id

  // Calculate summary
  const summary = useMemo<LineageMappingSummary>(() => {
    return calculateLineageSummary(nodes, edges, impactConfig.rules, scanIssues)
  }, [nodes, edges, impactConfig.rules, scanIssues])

  // Handle business term linking
  const handleLinkBusinessTerm = useCallback((
    nodeId: string,
    term: BusinessTerm,
    isAISuggested: boolean = false,
    confidence?: number
  ) => {
    const link: BusinessTermLink = {
      termId: term.id,
      termName: term.name,
      linkedAt: new Date().toISOString(),
      linkedBy: 'current-user',
      isAISuggested,
      confidence,
    }
    
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node
      // Avoid duplicate links
      if (node.businessTerms.some(t => t.termId === term.id)) return node
      return {
        ...node,
        businessTerms: [...node.businessTerms, link],
      }
    }))
  }, [])

  // Handle removing business term link
  const handleUnlinkBusinessTerm = useCallback((nodeId: string, termId: string) => {
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node
      return {
        ...node,
        businessTerms: node.businessTerms.filter(t => t.termId !== termId),
      }
    }))
  }, [])

  // Handle deferring business term linking for a node
  const handleDeferNode = useCallback((nodeId: string, reason?: string) => {
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node
      return {
        ...node,
        businessTermsDeferred: true,
        businessTermsDeferredReason: reason || 'Deferred to future cycle',
        businessTermsDeferredAt: new Date().toISOString(),
      }
    }))
  }, [])

  // Handle undeferring business term linking for a node
  const handleUndeferNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node
      return {
        ...node,
        businessTermsDeferred: false,
        businessTermsDeferredReason: undefined,
        businessTermsDeferredAt: undefined,
      }
    }))
  }, [])

  // Handle impact rule creation
  const handleCreateImpactRule = useCallback((rule: Omit<ImpactRule, 'id' | 'createdAt' | 'createdBy'>) => {
    const newRule: ImpactRule = {
      ...rule,
      id: `rule-${Date.now()}`,
      createdAt: new Date().toISOString(),
      createdBy: 'current-user',
    }
    
    setImpactConfig(prev => ({
      ...prev,
      rules: [...prev.rules, newRule],
    }))
  }, [])

  // Handle impact rule update
  const handleUpdateImpactRule = useCallback((ruleId: string, updates: Partial<ImpactRule>) => {
    setImpactConfig(prev => ({
      ...prev,
      rules: prev.rules.map(rule => 
        rule.id === ruleId ? { ...rule, ...updates } : rule
      ),
    }))
  }, [])

  // Handle impact rule deletion
  const handleDeleteImpactRule = useCallback((ruleId: string) => {
    setImpactConfig(prev => ({
      ...prev,
      rules: prev.rules.filter(rule => rule.id !== ruleId),
    }))
  }, [])

  // Handle scan issue resolution
  const handleResolveIssue = useCallback((issueId: string) => {
    setScanIssues(prev => prev.filter(issue => issue.id !== issueId))
  }, [])

  // Handle lineage file upload
  const handleUploadLineageFile = useCallback((file: File) => {
    // In a real implementation, this would parse the CSV/Excel file
    // and update the nodes and edges state
    console.log('Uploading lineage file:', file.name)
    // TODO: Parse file and update nodes/edges
  }, [])

  // Handle approval
  const handleApproval = useCallback((rationale: string, signature?: string) => {
    setApprovalData({ rationale, signature })
  }, [])

  // Handle step completion
  const handleStepComplete = useCallback((stepId: string, data?: Record<string, unknown>) => {
    if (data) {
      updateStepData(stepId, data)
    }
    completeStep(stepId)
  }, [completeStep, updateStepData])

  // Handle phase completion (called when final step is completed)
  const handlePhaseComplete = useCallback((stepId: string, data?: Record<string, unknown>) => {
    // First complete the step
    if (data) {
      updateStepData(stepId, data)
    }
    completeStep(stepId)
    
    // Then complete the phase
    const { completePhase, navigateToNextPhase } = useWorkflowWizardStore.getState()
    const success = completePhase(data?.rationale as string | undefined)
    if (success) {
      navigateToNextPhase()
    }
  }, [completeStep, updateStepData])

  // Render current step content
  const renderStepContent = () => {
    switch (currentStepId) {
      case LINEAGE_MAPPING_STEPS.PIPELINE_SCAN:
        return (
          <PipelineScanStep
            nodes={nodes}
            edges={edges}
            scanResult={scanResult}
            issues={scanIssues}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onResolveIssue={handleResolveIssue}
            onUploadLineageFile={handleUploadLineageFile}
            summary={summary}
            onComplete={() => handleStepComplete(LINEAGE_MAPPING_STEPS.PIPELINE_SCAN, {
              nodesReviewed: nodes.length,
              edgesReviewed: edges.length,
              issuesResolved: MOCK_SCAN_RESULT.issues.length - scanIssues.length,
            })}
          />
        )
      
      case LINEAGE_MAPPING_STEPS.BUSINESS_TERMS:
        return (
          <BusinessTermsStep
            nodes={nodes}
            businessTerms={businessTerms}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onLinkTerm={handleLinkBusinessTerm}
            onUnlinkTerm={handleUnlinkBusinessTerm}
            onDeferNode={handleDeferNode}
            onUndeferNode={handleUndeferNode}
            summary={summary}
            onComplete={() => handleStepComplete(LINEAGE_MAPPING_STEPS.BUSINESS_TERMS, {
              nodesWithTerms: summary.nodesWithBusinessTerms,
              totalTermsLinked: nodes.reduce((acc, n) => acc + n.businessTerms.length, 0),
              deferredNodes: nodes.filter(n => n.businessTermsDeferred).length,
            })}
          />
        )
      
      case LINEAGE_MAPPING_STEPS.IMPACT_ANALYSIS:
        return (
          <ImpactAnalysisStep
            nodes={nodes}
            edges={edges}
            impactConfig={impactConfig}
            onCreateRule={handleCreateImpactRule}
            onUpdateRule={handleUpdateImpactRule}
            onDeleteRule={handleDeleteImpactRule}
            summary={summary}
            onComplete={() => handleStepComplete(LINEAGE_MAPPING_STEPS.IMPACT_ANALYSIS, {
              rulesConfigured: impactConfig.rules.filter(r => r.enabled).length,
            })}
          />
        )
      
      case LINEAGE_MAPPING_STEPS.LINEAGE_APPROVAL:
        return (
          <LineageApprovalStep
            nodes={nodes}
            edges={edges}
            summary={summary}
            approvalData={approvalData}
            onApprove={handleApproval}
            onComplete={() => handlePhaseComplete(LINEAGE_MAPPING_STEPS.LINEAGE_APPROVAL, {
              approved: true,
              rationale: approvalData?.rationale,
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

export default LineageMappingPhase
