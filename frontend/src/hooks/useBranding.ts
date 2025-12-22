import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiResponse } from '@/api/client'

export interface BrandingConfig {
  id: string
  tenantId: string
  logoUrl?: string
  faviconUrl?: string
  loginBackgroundUrl?: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  chartPalette: string[]
  customDomain?: string
  removePlatformBranding: boolean
  customEmailSender?: string
  updatedAt: string
  publishedAt?: string
}

export interface BrandingUpdateInput {
  logoUrl?: string
  faviconUrl?: string
  loginBackgroundUrl?: string
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  chartPalette?: string[]
  customDomain?: string
  removePlatformBranding?: boolean
  customEmailSender?: string
}

export interface FileUploadResponse {
  url: string
  filename: string
}

const defaultBranding: BrandingConfig = {
  id: 'default',
  tenantId: 'default',
  primaryColor: '#3b82f6',
  secondaryColor: '#64748b',
  accentColor: '#10b981',
  chartPalette: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
  removePlatformBranding: false,
  updatedAt: new Date().toISOString(),
}

export function useBranding() {
  return useQuery({
    queryKey: ['branding'],
    queryFn: async () => {
      try {
        const response = await apiClient.get<ApiResponse<BrandingConfig>>('/tenant/branding')
        return response.data.data
      } catch {
        return defaultBranding
      }
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useUpdateBranding() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (input: BrandingUpdateInput) => {
      const response = await apiClient.patch<ApiResponse<BrandingConfig>>('/tenant/branding', input)
      return response.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['branding'], data)
    },
  })
}

export function usePublishBranding() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<ApiResponse<BrandingConfig>>('/tenant/branding/publish')
      return response.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['branding'], data)
    },
  })
}

export function useUploadBrandingAsset() {
  return useMutation({
    mutationFn: async ({ file, type }: { file: File; type: 'logo' | 'favicon' | 'background' }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)
      
      const response = await apiClient.post<ApiResponse<FileUploadResponse>>(
        '/tenant/branding/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      return response.data.data
    },
  })
}

export function useResetBranding() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<ApiResponse<BrandingConfig>>('/tenant/branding/reset')
      return response.data.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['branding'], data)
    },
  })
}
