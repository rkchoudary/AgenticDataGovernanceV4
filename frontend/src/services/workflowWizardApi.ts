/**
 * Workflow Wizard API Service
 * 
 * Integrates the workflow wizard with backend APIs for cycles, CDEs, 
 * data quality rules, issues, lineage, and other governance data.
 * 
 * Requirements: All - Connect wizard to backend APIs
 */

import { apiClient, ApiResponse } from '@/api/client'
import { 
  Phase, 
  WorkflowCycle,
  PhaseRecord,
} from '@/types/workflow-wizard'

// ============================================================================
// Types
// ============================================================================

// Regulatory Intelligence Types
export interface RegulatoryChange {
  id: string
  source: string
  changeType: 'new' | 'modified' | 'deprecated'
  title: string
  summary: string
  confidenceScore: number
  currentValue?: string
  proposedValue?: string
  detectedAt: string
  status: 'pending' | 'accepted' | 'rejected'
}

// Data Requirements Types
export interface DataElement {
  id: string
  name: string
  description: string
  dataType: string
  sourceSystem?: string
  sourceField?: string
  status: 'mapped' | 'gap' | 'validated'
  sampleData?: string[]
  children?: DataElement[]
}

// CDE Types
export interface CDEScore {
  id: string
  name: string
  description: string
  regulatoryImpact: number
  businessCriticality: number
  dataQualityRisk: number
  operationalDependency: number
  overallScore: number
  aiRationale: string
  owner?: {
    id: string
    name: string
    email: string
  }
  status: 'pending' | 'approved' | 'rejected'
}

// Data Quality Rule Types
export interface DQRule {
  id: string
  name: string
  cdeId: string
  cdeName: string
  dimension: 'completeness' | 'accuracy' | 'consistency' | 'timeliness' | 'validity' | 'uniqueness' | 'integrity'
  logic: string
  threshold: number
  suggestedThreshold: number
  status: 'draft' | 'active' | 'inactive'
  executionSchedule?: string
  lastExecutedAt?: string
  passRate?: number
}

// Lineage Types
export interface LineageNode {
  id: string
  name: string
  type: 'source' | 'transformation' | 'target' | 'report'
  system?: string
  metadata?: Record<string, string>
  businessTerms?: string[]
}

export interface LineageEdge {
  source: string
  target: string
  transformationType?: string
}

export interface LineageGraph {
  nodes: LineageNode[]
  edges: LineageEdge[]
}

// Issue Types (extended for wizard)
export interface WizardIssue {
  id: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated'
  assignee?: string
  domain?: string
  aiSuggestedPriority?: number
  aiSuggestedRootCause?: string
  rootCauseConfidence?: number
  similarIssues?: Array<{ id: string; title: string; resolution: string }>
  evidence?: Array<{ id: string; name: string; url: string }>
  createdAt: string
  resolvedAt?: string
}

// Control Types
export interface Control {
  id: string
  name: string
  description: string
  category: 'preventive' | 'detective' | 'corrective'
  status: 'effective' | 'ineffective' | 'not_tested'
  lastTestedAt?: string
  evidence?: Array<{ id: string; name: string; uploadedAt: string }>
  isCompensating: boolean
  expiresAt?: string
}

// Documentation Types
export interface DocumentArtifact {
  id: string
  name: string
  type: 'data_dictionary' | 'lineage_diagram' | 'qa_report' | 'compliance_matrix'
  url: string
  status: 'draft' | 'reviewed' | 'approved'
  annotations?: Array<{
    id: string
    text: string
    resolved: boolean
    resolvedBy?: string
  }>
}

// Attestation Types
export interface AttestationSummary {
  dataQualityScore: number
  issueResolutionRate: number
  controlPassRate: number
  deadlineStatus: 'on_track' | 'at_risk' | 'overdue'
  checklistItems: Array<{
    id: string
    text: string
    acknowledged: boolean
  }>
}

// ============================================================================
// Workflow Cycle API
// ============================================================================

/**
 * Fetch workflow cycle details
 */
export async function fetchWorkflowCycle(cycleId: string): Promise<WorkflowCycle> {
  const response = await apiClient.get<ApiResponse<WorkflowCycle>>(
    `/workflows/${cycleId}`
  )
  return response.data.data
}

/**
 * Update workflow cycle phase
 */
export async function updateWorkflowPhase(
  cycleId: string,
  phase: Phase,
  phaseData: Partial<PhaseRecord>
): Promise<void> {
  await apiClient.put(`/workflows/${cycleId}/phases/${phase}`, phaseData)
}

/**
 * Complete a workflow phase with approval
 */
export async function completeWorkflowPhase(
  cycleId: string,
  phase: Phase,
  rationale: string,
  signature?: string
): Promise<void> {
  await apiClient.post(`/workflows/${cycleId}/phases/${phase}/complete`, {
    rationale,
    signature,
    completedAt: new Date().toISOString(),
  })
}

// ============================================================================
// Phase 1: Regulatory Intelligence API
// ============================================================================

/**
 * Fetch regulatory changes detected by AI scan
 */
export async function fetchRegulatoryChanges(
  cycleId: string
): Promise<RegulatoryChange[]> {
  const response = await apiClient.get<ApiResponse<RegulatoryChange[]>>(
    `/workflows/${cycleId}/regulatory/changes`
  )
  return response.data.data
}

/**
 * Accept or reject a regulatory change
 */
export async function updateRegulatoryChange(
  cycleId: string,
  changeId: string,
  status: 'accepted' | 'rejected',
  rationale?: string
): Promise<void> {
  await apiClient.put(`/workflows/${cycleId}/regulatory/changes/${changeId}`, {
    status,
    rationale,
  })
}

// ============================================================================
// Phase 2: Data Requirements API
// ============================================================================

/**
 * Fetch data elements tree
 */
export async function fetchDataElements(
  cycleId: string
): Promise<DataElement[]> {
  const response = await apiClient.get<ApiResponse<DataElement[]>>(
    `/workflows/${cycleId}/data-requirements/elements`
  )
  return response.data.data
}

/**
 * Map a data element to a source
 */
export async function mapDataElement(
  cycleId: string,
  elementId: string,
  sourceSystem: string,
  sourceField: string
): Promise<void> {
  await apiClient.put(`/workflows/${cycleId}/data-requirements/elements/${elementId}/map`, {
    sourceSystem,
    sourceField,
  })
}

/**
 * Flag a data element gap for later resolution
 */
export async function flagDataGap(
  cycleId: string,
  elementId: string,
  reason: string
): Promise<void> {
  await apiClient.post(`/workflows/${cycleId}/data-requirements/elements/${elementId}/flag`, {
    reason,
  })
}

// ============================================================================
// Phase 3: CDE Identification API
// ============================================================================

/**
 * Fetch CDE scores with AI rationale
 */
export async function fetchCDEScores(cycleId: string): Promise<CDEScore[]> {
  const response = await apiClient.get<ApiResponse<CDEScore[]>>(
    `/workflows/${cycleId}/cdes/scores`
  )
  return response.data.data
}

/**
 * Approve or reject a CDE
 */
export async function updateCDEStatus(
  cycleId: string,
  cdeId: string,
  status: 'approved' | 'rejected',
  rationale?: string
): Promise<void> {
  await apiClient.put(`/workflows/${cycleId}/cdes/${cdeId}/status`, {
    status,
    rationale,
  })
}

/**
 * Assign owner to a CDE
 */
export async function assignCDEOwner(
  cycleId: string,
  cdeId: string,
  ownerId: string
): Promise<void> {
  await apiClient.put(`/workflows/${cycleId}/cdes/${cdeId}/owner`, {
    ownerId,
  })
}

/**
 * Fetch users for owner assignment
 */
export async function fetchAvailableOwners(
  search?: string,
  role?: string
): Promise<Array<{ id: string; name: string; email: string; role: string }>> {
  const response = await apiClient.get<ApiResponse<Array<{ id: string; name: string; email: string; role: string }>>>(
    '/users',
    { params: { search, role } }
  )
  return response.data.data
}

// ============================================================================
// Phase 4: Data Quality Rules API
// ============================================================================

/**
 * Fetch DQ rules for the cycle
 */
export async function fetchDQRules(cycleId: string): Promise<DQRule[]> {
  const response = await apiClient.get<ApiResponse<DQRule[]>>(
    `/workflows/${cycleId}/dq-rules`
  )
  return response.data.data
}

/**
 * Update DQ rule threshold
 */
export async function updateDQRuleThreshold(
  cycleId: string,
  ruleId: string,
  threshold: number
): Promise<void> {
  await apiClient.put(`/workflows/${cycleId}/dq-rules/${ruleId}/threshold`, {
    threshold,
  })
}

/**
 * Accept, modify, or reject a DQ rule
 */
export async function updateDQRuleStatus(
  cycleId: string,
  ruleId: string,
  status: 'active' | 'inactive',
  modifications?: Partial<DQRule>
): Promise<void> {
  await apiClient.put(`/workflows/${cycleId}/dq-rules/${ruleId}`, {
    status,
    ...modifications,
  })
}

/**
 * Activate DQ rules for execution
 */
export async function activateDQRules(
  cycleId: string,
  ruleIds: string[],
  schedule: string
): Promise<void> {
  await apiClient.post(`/workflows/${cycleId}/dq-rules/activate`, {
    ruleIds,
    schedule,
  })
}

/**
 * Fetch DQ coverage heatmap data
 */
export async function fetchDQCoverage(
  cycleId: string
): Promise<{ cdes: string[]; dimensions: string[]; coverage: boolean[][] }> {
  const response = await apiClient.get<ApiResponse<{ cdes: string[]; dimensions: string[]; coverage: boolean[][] }>>(
    `/workflows/${cycleId}/dq-rules/coverage`
  )
  return response.data.data
}

// ============================================================================
// Phase 5: Lineage Mapping API
// ============================================================================

/**
 * Fetch lineage graph
 */
export async function fetchLineageGraph(cycleId: string): Promise<LineageGraph> {
  const response = await apiClient.get<ApiResponse<LineageGraph>>(
    `/workflows/${cycleId}/lineage/graph`
  )
  return response.data.data
}

/**
 * Link business term to lineage node
 */
export async function linkBusinessTerm(
  cycleId: string,
  nodeId: string,
  termId: string
): Promise<void> {
  await apiClient.post(`/workflows/${cycleId}/lineage/nodes/${nodeId}/terms`, {
    termId,
  })
}

/**
 * Search business glossary
 */
export async function searchGlossary(
  query: string
): Promise<Array<{ id: string; term: string; definition: string }>> {
  const response = await apiClient.get<ApiResponse<Array<{ id: string; term: string; definition: string }>>>(
    '/glossary/search',
    { params: { q: query } }
  )
  return response.data.data
}

/**
 * Configure impact analysis notifications
 */
export async function configureImpactNotifications(
  cycleId: string,
  nodeId: string,
  notifyOnChange: boolean,
  notifyEmails: string[]
): Promise<void> {
  await apiClient.put(`/workflows/${cycleId}/lineage/nodes/${nodeId}/notifications`, {
    notifyOnChange,
    notifyEmails,
  })
}

/**
 * Export lineage diagram
 */
export async function exportLineageDiagram(
  cycleId: string,
  format: 'png' | 'svg' | 'pdf'
): Promise<Blob> {
  const response = await apiClient.get(
    `/workflows/${cycleId}/lineage/export`,
    { params: { format }, responseType: 'blob' }
  )
  return response.data
}

// ============================================================================
// Phase 6: Issue Management API
// ============================================================================

/**
 * Fetch issues for the cycle
 */
export async function fetchWizardIssues(cycleId: string): Promise<WizardIssue[]> {
  const response = await apiClient.get<ApiResponse<WizardIssue[]>>(
    `/workflows/${cycleId}/issues`
  )
  return response.data.data
}

/**
 * Update issue priority
 */
export async function updateIssuePriority(
  cycleId: string,
  issueId: string,
  priority: number
): Promise<void> {
  await apiClient.put(`/workflows/${cycleId}/issues/${issueId}/priority`, {
    priority,
  })
}

/**
 * Resolve an issue
 */
export async function resolveWizardIssue(
  cycleId: string,
  issueId: string,
  resolution: string,
  evidence: string[]
): Promise<void> {
  await apiClient.post(`/workflows/${cycleId}/issues/${issueId}/resolve`, {
    resolution,
    evidence,
    resolvedAt: new Date().toISOString(),
  })
}

/**
 * Escalate a critical issue
 */
export async function escalateIssue(
  cycleId: string,
  issueId: string,
  escalateTo: string,
  reason: string
): Promise<void> {
  await apiClient.post(`/workflows/${cycleId}/issues/${issueId}/escalate`, {
    escalateTo,
    reason,
  })
}

/**
 * Check for blocking critical issues
 */
export async function checkBlockingIssues(
  cycleId: string
): Promise<{ hasBlockingIssues: boolean; blockingIssues: WizardIssue[] }> {
  const response = await apiClient.get<ApiResponse<{ hasBlockingIssues: boolean; blockingIssues: WizardIssue[] }>>(
    `/workflows/${cycleId}/issues/blocking`
  )
  return response.data.data
}

// ============================================================================
// Phase 7: Controls Management API
// ============================================================================

/**
 * Fetch controls for the cycle
 */
export async function fetchControls(cycleId: string): Promise<Control[]> {
  const response = await apiClient.get<ApiResponse<Control[]>>(
    `/workflows/${cycleId}/controls`
  )
  return response.data.data
}

/**
 * Update control status
 */
export async function updateControlStatus(
  cycleId: string,
  controlId: string,
  status: 'effective' | 'ineffective' | 'not_tested'
): Promise<void> {
  await apiClient.put(`/workflows/${cycleId}/controls/${controlId}/status`, {
    status,
  })
}

/**
 * Upload control evidence
 */
export async function uploadControlEvidence(
  cycleId: string,
  controlId: string,
  file: File,
  metadata: Record<string, string>
): Promise<{ id: string; url: string }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('metadata', JSON.stringify(metadata))
  
  const response = await apiClient.post<ApiResponse<{ id: string; url: string }>>(
    `/workflows/${cycleId}/controls/${controlId}/evidence`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return response.data.data
}

/**
 * Renew compensating control
 */
export async function renewCompensatingControl(
  cycleId: string,
  controlId: string,
  newExpiryDate: string,
  justification: string
): Promise<void> {
  await apiClient.post(`/workflows/${cycleId}/controls/${controlId}/renew`, {
    newExpiryDate,
    justification,
  })
}

// ============================================================================
// Phase 8: Documentation API
// ============================================================================

/**
 * Fetch document artifacts
 */
export async function fetchDocumentArtifacts(
  cycleId: string
): Promise<DocumentArtifact[]> {
  const response = await apiClient.get<ApiResponse<DocumentArtifact[]>>(
    `/workflows/${cycleId}/documentation/artifacts`
  )
  return response.data.data
}

/**
 * Resolve document annotation
 */
export async function resolveAnnotation(
  cycleId: string,
  artifactId: string,
  annotationId: string,
  resolution: string
): Promise<void> {
  await apiClient.put(
    `/workflows/${cycleId}/documentation/artifacts/${artifactId}/annotations/${annotationId}`,
    { resolved: true, resolution }
  )
}

/**
 * Fetch BCBS 239 compliance matrix
 */
export async function fetchBCBS239Matrix(
  cycleId: string
): Promise<Array<{ principle: string; status: 'compliant' | 'partial' | 'non_compliant'; evidence: string[] }>> {
  const response = await apiClient.get<ApiResponse<Array<{ principle: string; status: 'compliant' | 'partial' | 'non_compliant'; evidence: string[] }>>>(
    `/workflows/${cycleId}/documentation/bcbs239`
  )
  return response.data.data
}

/**
 * Compile documentation package
 */
export async function compileDocumentationPackage(
  cycleId: string
): Promise<{ packageId: string; downloadUrl: string }> {
  const response = await apiClient.post<ApiResponse<{ packageId: string; downloadUrl: string }>>(
    `/workflows/${cycleId}/documentation/compile`
  )
  return response.data.data
}

// ============================================================================
// Phase 9: Attestation API
// ============================================================================

/**
 * Fetch attestation summary
 */
export async function fetchAttestationSummary(
  cycleId: string
): Promise<AttestationSummary> {
  const response = await apiClient.get<ApiResponse<AttestationSummary>>(
    `/workflows/${cycleId}/attestation/summary`
  )
  return response.data.data
}

/**
 * Acknowledge checklist item
 */
export async function acknowledgeChecklistItem(
  cycleId: string,
  itemId: string
): Promise<void> {
  await apiClient.put(`/workflows/${cycleId}/attestation/checklist/${itemId}`, {
    acknowledged: true,
  })
}

/**
 * Submit digital attestation
 */
export async function submitAttestation(
  cycleId: string,
  signature: string,
  attestorId: string
): Promise<{ submissionId: string; receiptUrl: string }> {
  const response = await apiClient.post<ApiResponse<{ submissionId: string; receiptUrl: string }>>(
    `/workflows/${cycleId}/attestation/submit`,
    {
      signature,
      attestorId,
      submittedAt: new Date().toISOString(),
    }
  )
  return response.data.data
}

/**
 * Lock all artifacts after submission
 */
export async function lockArtifacts(cycleId: string): Promise<void> {
  await apiClient.post(`/workflows/${cycleId}/attestation/lock`)
}

// ============================================================================
// Agent Integration API
// ============================================================================

export interface AgentStatus {
  agentId: string
  agentName: string
  status: 'idle' | 'running' | 'completed' | 'error'
  currentAction?: string
  progress?: number
  activityLog: Array<{
    timestamp: string
    action: string
    status: 'started' | 'completed' | 'failed'
    details?: string
    confidenceScore?: number
  }>
  error?: string
}

/**
 * Fetch agent status for a phase
 */
export async function fetchAgentStatus(
  cycleId: string,
  phase: Phase
): Promise<AgentStatus> {
  const response = await apiClient.get<ApiResponse<AgentStatus>>(
    `/workflows/${cycleId}/agents/${phase}/status`
  )
  return response.data.data
}

/**
 * Trigger agent action
 */
export async function triggerAgentAction(
  cycleId: string,
  phase: Phase,
  action: string,
  params?: Record<string, unknown>
): Promise<void> {
  await apiClient.post(`/workflows/${cycleId}/agents/${phase}/trigger`, {
    action,
    params,
  })
}

/**
 * Retry failed agent action
 */
export async function retryAgentAction(
  cycleId: string,
  phase: Phase
): Promise<void> {
  await apiClient.post(`/workflows/${cycleId}/agents/${phase}/retry`)
}

/**
 * Manual override for agent action
 */
export async function overrideAgentAction(
  cycleId: string,
  phase: Phase,
  overrideData: Record<string, unknown>
): Promise<void> {
  await apiClient.post(`/workflows/${cycleId}/agents/${phase}/override`, {
    overrideData,
  })
}
