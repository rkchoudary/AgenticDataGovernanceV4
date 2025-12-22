import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiResponse, PaginatedResponse } from '@/api/client'

export interface Issue {
  id: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  assignee?: string
  assigneeEmail?: string
  impactedReports: string[]
  impactedCDEs: string[]
  rootCause?: string
  resolution?: string
  createdAt: string
  updatedAt: string
  resolvedAt?: string
}

interface IssueFilters {
  search?: string
  severity?: string
  status?: string
  assignee?: string
  page?: number
  pageSize?: number
}

export function useIssues(filters?: IssueFilters) {
  return useQuery({
    queryKey: ['issues', filters],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PaginatedResponse<Issue>>>(
        '/issues',
        { params: filters }
      )
      return response.data.data
    },
  })
}

export function useIssue(id: string) {
  return useQuery({
    queryKey: ['issues', id],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Issue>>(`/issues/${id}`)
      return response.data.data
    },
    enabled: !!id,
  })
}

interface CreateIssueInput {
  title: string
  description: string
  severity: string
  impactedReports?: string[]
  impactedCDEs?: string[]
}

export function useCreateIssue() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateIssueInput) => {
      const response = await apiClient.post<ApiResponse<Issue>>('/issues', input)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] })
    },
  })
}

interface ResolveIssueInput {
  id: string
  resolution: string
  verifiedBy: string
}

export function useResolveIssue() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...data }: ResolveIssueInput) => {
      const response = await apiClient.post<ApiResponse<Issue>>(
        `/issues/${id}/resolve`,
        data
      )
      return response.data.data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['issues', id] })
      queryClient.invalidateQueries({ queryKey: ['issues'] })
    },
  })
}
