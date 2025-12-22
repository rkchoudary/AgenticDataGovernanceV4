/**
 * Workflow Wizard API Hooks
 * 
 * React Query hooks for integrating the workflow wizard with backend APIs.
 * Provides data fetching and mutations for all 9 phases.
 * 
 * Requirements: All - Connect wizard to backend APIs
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  // Workflow Cycle
  fetchWorkflowCycle,
  completeWorkflowPhase,
  // Phase 1: Regulatory Intelligence
  fetchRegulatoryChanges,
  updateRegulatoryChange,
  // Phase 2: Data Requirements
  fetchDataElements,
  mapDataElement,
  flagDataGap,
  // Phase 3: CDE Identification
  fetchCDEScores,
  updateCDEStatus,
  assignCDEOwner,
  fetchAvailableOwners,
  // Phase 4: Data Quality Rules
  fetchDQRules,
  updateDQRuleThreshold,
  updateDQRuleStatus,
  activateDQRules,
  fetchDQCoverage,
  // Phase 5: Lineage Mapping
  fetchLineageGraph,
  linkBusinessTerm,
  searchGlossary,
  configureImpactNotifications,
  exportLineageDiagram,
  // Phase 6: Issue Management
  fetchWizardIssues,
  updateIssuePriority,
  resolveWizardIssue,
  escalateIssue,
  checkBlockingIssues,
  // Phase 7: Controls Management
  fetchControls,
  updateControlStatus,
  uploadControlEvidence,
  renewCompensatingControl,
  // Phase 8: Documentation
  fetchDocumentArtifacts,
  resolveAnnotation,
  fetchBCBS239Matrix,
  compileDocumentationPackage,
  // Phase 9: Attestation
  fetchAttestationSummary,
  acknowledgeChecklistItem,
  submitAttestation,
  lockArtifacts,
  // Agent Integration
  fetchAgentStatus,
  triggerAgentAction,
  retryAgentAction,
  overrideAgentAction,
  // Types
  type RegulatoryChange,
  type DataElement,
  type CDEScore,
  type DQRule,
  type LineageGraph,
  type WizardIssue,
  type Control,
  type DocumentArtifact,
  type AttestationSummary,
  type AgentStatus,
} from '@/services/workflowWizardApi'
import { Phase } from '@/types/workflow-wizard'

// ============================================================================
// Workflow Cycle Hooks
// ============================================================================

export function useWorkflowCycle(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId],
    queryFn: () => fetchWorkflowCycle(cycleId),
    enabled: !!cycleId,
  })
}

export function useCompletePhase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      phase,
      rationale,
      signature,
    }: {
      cycleId: string
      phase: Phase
      rationale: string
      signature?: string
    }) => completeWorkflowPhase(cycleId, phase, rationale, signature),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId] })
    },
  })
}

// ============================================================================
// Phase 1: Regulatory Intelligence Hooks
// ============================================================================

export function useRegulatoryChanges(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'regulatory', 'changes'],
    queryFn: () => fetchRegulatoryChanges(cycleId),
    enabled: !!cycleId,
  })
}

export function useUpdateRegulatoryChange() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      changeId,
      status,
      rationale,
    }: {
      cycleId: string
      changeId: string
      status: 'accepted' | 'rejected'
      rationale?: string
    }) => updateRegulatoryChange(cycleId, changeId, status, rationale),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'regulatory', 'changes'] })
    },
  })
}

// ============================================================================
// Phase 2: Data Requirements Hooks
// ============================================================================

export function useDataElements(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'data-requirements', 'elements'],
    queryFn: () => fetchDataElements(cycleId),
    enabled: !!cycleId,
  })
}

export function useMapDataElement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      elementId,
      sourceSystem,
      sourceField,
    }: {
      cycleId: string
      elementId: string
      sourceSystem: string
      sourceField: string
    }) => mapDataElement(cycleId, elementId, sourceSystem, sourceField),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'data-requirements', 'elements'] })
    },
  })
}

export function useFlagDataGap() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      elementId,
      reason,
    }: {
      cycleId: string
      elementId: string
      reason: string
    }) => flagDataGap(cycleId, elementId, reason),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'data-requirements', 'elements'] })
    },
  })
}

// ============================================================================
// Phase 3: CDE Identification Hooks
// ============================================================================

export function useCDEScores(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'cdes', 'scores'],
    queryFn: () => fetchCDEScores(cycleId),
    enabled: !!cycleId,
  })
}

export function useUpdateCDEStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      cdeId,
      status,
      rationale,
    }: {
      cycleId: string
      cdeId: string
      status: 'approved' | 'rejected'
      rationale?: string
    }) => updateCDEStatus(cycleId, cdeId, status, rationale),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'cdes', 'scores'] })
    },
  })
}

export function useAssignCDEOwner() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      cdeId,
      ownerId,
    }: {
      cycleId: string
      cdeId: string
      ownerId: string
    }) => assignCDEOwner(cycleId, cdeId, ownerId),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'cdes', 'scores'] })
    },
  })
}

export function useAvailableOwners(search?: string, role?: string) {
  return useQuery({
    queryKey: ['users', 'owners', search, role],
    queryFn: () => fetchAvailableOwners(search, role),
  })
}

// ============================================================================
// Phase 4: Data Quality Rules Hooks
// ============================================================================

export function useDQRules(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'dq-rules'],
    queryFn: () => fetchDQRules(cycleId),
    enabled: !!cycleId,
  })
}

export function useUpdateDQRuleThreshold() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      ruleId,
      threshold,
    }: {
      cycleId: string
      ruleId: string
      threshold: number
    }) => updateDQRuleThreshold(cycleId, ruleId, threshold),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'dq-rules'] })
    },
  })
}

export function useUpdateDQRuleStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      ruleId,
      status,
      modifications,
    }: {
      cycleId: string
      ruleId: string
      status: 'active' | 'inactive'
      modifications?: Partial<DQRule>
    }) => updateDQRuleStatus(cycleId, ruleId, status, modifications),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'dq-rules'] })
    },
  })
}

export function useActivateDQRules() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      ruleIds,
      schedule,
    }: {
      cycleId: string
      ruleIds: string[]
      schedule: string
    }) => activateDQRules(cycleId, ruleIds, schedule),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'dq-rules'] })
    },
  })
}

export function useDQCoverage(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'dq-rules', 'coverage'],
    queryFn: () => fetchDQCoverage(cycleId),
    enabled: !!cycleId,
  })
}

// ============================================================================
// Phase 5: Lineage Mapping Hooks
// ============================================================================

export function useLineageGraph(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'lineage', 'graph'],
    queryFn: () => fetchLineageGraph(cycleId),
    enabled: !!cycleId,
  })
}

export function useLinkBusinessTerm() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      nodeId,
      termId,
    }: {
      cycleId: string
      nodeId: string
      termId: string
    }) => linkBusinessTerm(cycleId, nodeId, termId),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'lineage', 'graph'] })
    },
  })
}

export function useGlossarySearch(query: string) {
  return useQuery({
    queryKey: ['glossary', 'search', query],
    queryFn: () => searchGlossary(query),
    enabled: query.length >= 2,
  })
}

export function useConfigureImpactNotifications() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      nodeId,
      notifyOnChange,
      notifyEmails,
    }: {
      cycleId: string
      nodeId: string
      notifyOnChange: boolean
      notifyEmails: string[]
    }) => configureImpactNotifications(cycleId, nodeId, notifyOnChange, notifyEmails),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'lineage', 'graph'] })
    },
  })
}

export function useExportLineageDiagram() {
  return useMutation({
    mutationFn: ({
      cycleId,
      format,
    }: {
      cycleId: string
      format: 'png' | 'svg' | 'pdf'
    }) => exportLineageDiagram(cycleId, format),
  })
}

// ============================================================================
// Phase 6: Issue Management Hooks
// ============================================================================

export function useWizardIssues(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'issues'],
    queryFn: () => fetchWizardIssues(cycleId),
    enabled: !!cycleId,
  })
}

export function useUpdateIssuePriority() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      issueId,
      priority,
    }: {
      cycleId: string
      issueId: string
      priority: number
    }) => updateIssuePriority(cycleId, issueId, priority),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'issues'] })
    },
  })
}

export function useResolveWizardIssue() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      issueId,
      resolution,
      evidence,
    }: {
      cycleId: string
      issueId: string
      resolution: string
      evidence: string[]
    }) => resolveWizardIssue(cycleId, issueId, resolution, evidence),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'issues'] })
    },
  })
}

export function useEscalateIssue() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      issueId,
      escalateTo,
      reason,
    }: {
      cycleId: string
      issueId: string
      escalateTo: string
      reason: string
    }) => escalateIssue(cycleId, issueId, escalateTo, reason),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'issues'] })
    },
  })
}

export function useBlockingIssues(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'issues', 'blocking'],
    queryFn: () => checkBlockingIssues(cycleId),
    enabled: !!cycleId,
  })
}

// ============================================================================
// Phase 7: Controls Management Hooks
// ============================================================================

export function useControls(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'controls'],
    queryFn: () => fetchControls(cycleId),
    enabled: !!cycleId,
  })
}

export function useUpdateControlStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      controlId,
      status,
    }: {
      cycleId: string
      controlId: string
      status: 'effective' | 'ineffective' | 'not_tested'
    }) => updateControlStatus(cycleId, controlId, status),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'controls'] })
    },
  })
}

export function useUploadControlEvidence() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      controlId,
      file,
      metadata,
    }: {
      cycleId: string
      controlId: string
      file: File
      metadata: Record<string, string>
    }) => uploadControlEvidence(cycleId, controlId, file, metadata),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'controls'] })
    },
  })
}

export function useRenewCompensatingControl() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      controlId,
      newExpiryDate,
      justification,
    }: {
      cycleId: string
      controlId: string
      newExpiryDate: string
      justification: string
    }) => renewCompensatingControl(cycleId, controlId, newExpiryDate, justification),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'controls'] })
    },
  })
}

// ============================================================================
// Phase 8: Documentation Hooks
// ============================================================================

export function useDocumentArtifacts(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'documentation', 'artifacts'],
    queryFn: () => fetchDocumentArtifacts(cycleId),
    enabled: !!cycleId,
  })
}

export function useResolveAnnotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      artifactId,
      annotationId,
      resolution,
    }: {
      cycleId: string
      artifactId: string
      annotationId: string
      resolution: string
    }) => resolveAnnotation(cycleId, artifactId, annotationId, resolution),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'documentation', 'artifacts'] })
    },
  })
}

export function useBCBS239Matrix(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'documentation', 'bcbs239'],
    queryFn: () => fetchBCBS239Matrix(cycleId),
    enabled: !!cycleId,
  })
}

export function useCompileDocumentationPackage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (cycleId: string) => compileDocumentationPackage(cycleId),
    onSuccess: (_, cycleId) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'documentation'] })
    },
  })
}

// ============================================================================
// Phase 9: Attestation Hooks
// ============================================================================

export function useAttestationSummary(cycleId: string) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'attestation', 'summary'],
    queryFn: () => fetchAttestationSummary(cycleId),
    enabled: !!cycleId,
  })
}

export function useAcknowledgeChecklistItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      itemId,
    }: {
      cycleId: string
      itemId: string
    }) => acknowledgeChecklistItem(cycleId, itemId),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'attestation', 'summary'] })
    },
  })
}

export function useSubmitAttestation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      signature,
      attestorId,
    }: {
      cycleId: string
      signature: string
      attestorId: string
    }) => submitAttestation(cycleId, signature, attestorId),
    onSuccess: (_, { cycleId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId] })
    },
  })
}

export function useLockArtifacts() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (cycleId: string) => lockArtifacts(cycleId),
    onSuccess: (_, cycleId) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId] })
    },
  })
}

// ============================================================================
// Agent Integration Hooks
// ============================================================================

export function useAgentStatus(cycleId: string, phase: Phase) {
  return useQuery({
    queryKey: ['workflow', cycleId, 'agents', phase, 'status'],
    queryFn: () => fetchAgentStatus(cycleId, phase),
    enabled: !!cycleId,
    refetchInterval: 5000, // Poll every 5 seconds when agent is running
  })
}

export function useTriggerAgentAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      phase,
      action,
      params,
    }: {
      cycleId: string
      phase: Phase
      action: string
      params?: Record<string, unknown>
    }) => triggerAgentAction(cycleId, phase, action, params),
    onSuccess: (_, { cycleId, phase }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'agents', phase, 'status'] })
    },
  })
}

export function useRetryAgentAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      phase,
    }: {
      cycleId: string
      phase: Phase
    }) => retryAgentAction(cycleId, phase),
    onSuccess: (_, { cycleId, phase }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'agents', phase, 'status'] })
    },
  })
}

export function useOverrideAgentAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      cycleId,
      phase,
      overrideData,
    }: {
      cycleId: string
      phase: Phase
      overrideData: Record<string, unknown>
    }) => overrideAgentAction(cycleId, phase, overrideData),
    onSuccess: (_, { cycleId, phase }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow', cycleId, 'agents', phase, 'status'] })
    },
  })
}

// Re-export types for convenience
export type {
  RegulatoryChange,
  DataElement,
  CDEScore,
  DQRule,
  LineageGraph,
  WizardIssue,
  Control,
  DocumentArtifact,
  AttestationSummary,
  AgentStatus,
}
