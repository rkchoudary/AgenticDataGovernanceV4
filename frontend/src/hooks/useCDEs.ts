import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiResponse, PaginatedResponse } from '@/api/client'

export interface CDE {
  id: string
  name: string
  description: string
  dataType: string
  criticalityScore: number
  owner?: string
  ownerEmail?: string
  qualityScore: number
  status: 'active' | 'pending_review' | 'deprecated'
  reportIds: string[]
  createdAt: string
  updatedAt: string
}

interface CDEFilters {
  search?: string
  status?: string
  minScore?: number
  page?: number
  pageSize?: number
}

export function useCDEs(filters?: CDEFilters) {
  return useQuery({
    queryKey: ['cdes', filters],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PaginatedResponse<CDE>>>(
        '/cdes',
        { params: filters }
      )
      return response.data.data
    },
  })
}

export function useCDE(id: string) {
  return useQuery({
    queryKey: ['cdes', id],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<CDE>>(`/cdes/${id}`)
      return response.data.data
    },
    enabled: !!id,
  })
}

interface UpdateCDEInput {
  id: string
  owner?: string
  ownerEmail?: string
  status?: string
}

export function useUpdateCDE() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...data }: UpdateCDEInput) => {
      const response = await apiClient.patch<ApiResponse<CDE>>(`/cdes/${id}`, data)
      return response.data.data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['cdes', id] })
      queryClient.invalidateQueries({ queryKey: ['cdes'] })
    },
  })
}
