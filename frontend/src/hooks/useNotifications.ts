import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiResponse, PaginatedResponse } from '@/api/client'
import type { NotificationPreferencesData } from '@/components/notifications/NotificationPreferences'

export interface Notification {
  id: string
  type: 'info' | 'warning' | 'critical'
  title: string
  message: string
  read: boolean
  actionUrl?: string
  createdAt: string
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<PaginatedResponse<Notification>>>(
        '/notifications'
      )
      return response.data.data
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<{ count: number }>>(
        '/notifications/unread-count'
      )
      return response.data.data.count
    },
    refetchInterval: 30000,
  })
}

export function useMarkAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.post(`/notifications/${id}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/notifications/read-all')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useDismissNotification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/notifications/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useDismissAllNotifications() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.delete('/notifications')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

// Notification Preferences
export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<NotificationPreferencesData>>(
        '/notifications/preferences'
      )
      return response.data.data
    },
  })
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (preferences: NotificationPreferencesData) => {
      const response = await apiClient.put<ApiResponse<NotificationPreferencesData>>(
        '/notifications/preferences',
        preferences
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] })
    },
  })
}
