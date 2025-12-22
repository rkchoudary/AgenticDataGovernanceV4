import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiResponse, PaginatedResponse } from '@/api/client'

export interface Cycle {
  id: string
  reportId: string
  reportName: string
  periodEnd: string
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  currentPhase: 'data_gathering' | 'validation' | 'review' | 'approval' | 'submission'
  progress: number
  dueDate: string
  createdAt: string
  updatedAt: string
}

interface CycleFilters {
  status?: string
  reportId?: string
  page?: number
  pageSize?: number
}

export function useCycles(filters?: CycleFilters) {
  return useQuery({
    queryKey: ['cycles', filters],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PaginatedResponse<Cycle>>>(
        '/cycles',
        { params: filters }
      )
      return response.data.data
    },
  })
}

export function useCycle(id: string) {
  return useQuery({
    queryKey: ['cycles', id],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Cycle>>(`/cycles/${id}`)
      return response.data.data
    },
    enabled: !!id,
  })
}

interface StartCycleInput {
  reportId: string
  periodEnd: string
}

export function useStartCycle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: StartCycleInput) => {
      const response = await apiClient.post<ApiResponse<Cycle>>('/cycles', input)
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cycles'] })
    },
  })
}

export function usePauseCycle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<ApiResponse<Cycle>>(`/cycles/${id}/pause`)
      return response.data.data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['cycles', id] })
      queryClient.invalidateQueries({ queryKey: ['cycles'] })
    },
  })
}

export function useResumeCycle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.post<ApiResponse<Cycle>>(`/cycles/${id}/resume`)
      return response.data.data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['cycles', id] })
      queryClient.invalidateQueries({ queryKey: ['cycles'] })
    },
  })
}
