import { useQuery } from '@tanstack/react-query'
import { apiClient, ApiResponse } from '@/api/client'

export interface Tenant {
  id: string
  name: string
  slug: string
  branding: {
    logoUrl?: string
    primaryColor?: string
    secondaryColor?: string
    faviconUrl?: string
  }
  subscription: {
    plan: 'starter' | 'professional' | 'enterprise'
    status: 'active' | 'trial' | 'suspended' | 'cancelled'
    trialEndsAt?: string
    currentPeriodEnd?: string
  }
  createdAt: string
}

export function useTenant() {
  return useQuery({
    queryKey: ['tenant'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Tenant>>('/tenant')
      return response.data.data
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  })
}
