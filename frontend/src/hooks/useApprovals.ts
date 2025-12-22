import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiResponse, PaginatedResponse } from '@/api/client'

export type ArtifactType = 
  | 'report_catalog' 
  | 'cde_inventory' 
  | 'dq_rules' 
  | 'lineage_graph' 
  | 'control_matrix'
  | 'compliance_package'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested'
export type UrgencyLevel = 'critical' | 'high' | 'normal' | 'low'
export type DecisionType = 'approve' | 'reject' | 'request_changes'

export interface ApprovalRequest {
  id: string
  artifactType: ArtifactType
  artifactId: string
  artifactName: string
  requester: string
  requesterEmail: string
  submittedAt: string
  dueDate?: string
  urgency: UrgencyLevel
  status: ApprovalStatus
  description?: string
  changes?: ApprovalChange[]
  previousVersion?: string
  currentVersion?: string
  assignedTo?: string
  delegatedFrom?: string
  delegatedAt?: string
}

export interface ApprovalChange {
  field: string
  oldValue: string
  newValue: string
  changeType: 'added' | 'modified' | 'removed'
}

export interface ApprovalHistory {
  id: string
  approvalId: string
  action: string
  actor: string
  actorEmail: string
  timestamp: string
  decision?: DecisionType
  rationale?: string
  signature?: string
}

export interface ApprovalDecision {
  decision: DecisionType
  rationale: string
  signature: string
}

export interface DelegationSettings {
  enabled: boolean
  delegateTo?: string
  delegateToEmail?: string
  startDate?: string
  endDate?: string
  reason?: string
}

export interface RoutingRule {
  id: string
  name: string
  artifactType: ArtifactType
  condition: string
  assignTo: string
  priority: number
  enabled: boolean
}

interface ApprovalFilters {
  status?: string
  artifactType?: string
  urgency?: string
  assignedTo?: string
  page?: number
  pageSize?: number
}

// Fetch pending approvals (inbox)
export function useApprovals(filters?: ApprovalFilters) {
  return useQuery({
    queryKey: ['approvals', filters],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PaginatedResponse<ApprovalRequest>>>(
        '/approvals',
        { params: filters }
      )
      return response.data.data
    },
  })
}

// Fetch single approval detail
export function useApproval(id: string) {
  return useQuery({
    queryKey: ['approvals', id],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ApprovalRequest>>(`/approvals/${id}`)
      return response.data.data
    },
    enabled: !!id,
  })
}

// Fetch approval history
export function useApprovalHistory(approvalId: string) {
  return useQuery({
    queryKey: ['approvals', approvalId, 'history'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ApprovalHistory[]>>(
        `/approvals/${approvalId}/history`
      )
      return response.data.data
    },
    enabled: !!approvalId,
  })
}

// Submit approval decision
export function useSubmitDecision() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...decision }: ApprovalDecision & { id: string }) => {
      const response = await apiClient.post<ApiResponse<ApprovalRequest>>(
        `/approvals/${id}/decide`,
        decision
      )
      return response.data.data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['approvals', id] })
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
    },
  })
}

// Delegate approval
export function useDelegateApproval() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, delegateTo }: { id: string; delegateTo: string }) => {
      const response = await apiClient.post<ApiResponse<ApprovalRequest>>(
        `/approvals/${id}/delegate`,
        { delegateTo }
      )
      return response.data.data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['approvals', id] })
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
    },
  })
}

// Get delegation settings
export function useDelegationSettings() {
  return useQuery({
    queryKey: ['delegation-settings'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<DelegationSettings>>(
        '/approvals/delegation-settings'
      )
      return response.data.data
    },
  })
}

// Update delegation settings
export function useUpdateDelegationSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: DelegationSettings) => {
      const response = await apiClient.put<ApiResponse<DelegationSettings>>(
        '/approvals/delegation-settings',
        settings
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delegation-settings'] })
    },
  })
}

// Get routing rules
export function useRoutingRules() {
  return useQuery({
    queryKey: ['routing-rules'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<RoutingRule[]>>(
        '/approvals/routing-rules'
      )
      return response.data.data
    },
  })
}

// Create/update routing rule
export function useSaveRoutingRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rule: Omit<RoutingRule, 'id'> & { id?: string }) => {
      const response = rule.id
        ? await apiClient.put<ApiResponse<RoutingRule>>(
            `/approvals/routing-rules/${rule.id}`,
            rule
          )
        : await apiClient.post<ApiResponse<RoutingRule>>(
            '/approvals/routing-rules',
            rule
          )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-rules'] })
    },
  })
}

// Delete routing rule
export function useDeleteRoutingRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/approvals/routing-rules/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-rules'] })
    },
  })
}

// Escalate approval
export function useEscalateApproval() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await apiClient.post<ApiResponse<ApprovalRequest>>(
        `/approvals/${id}/escalate`,
        { reason }
      )
      return response.data.data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['approvals', id] })
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
    },
  })
}
