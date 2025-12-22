import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, ApiResponse } from '@/api/client'
import { useAuthStore, User } from '@/stores'

interface LoginCredentials {
  email: string
  password: string
}

interface LoginResponse {
  user: User
  token: string
}

export function useLogin() {
  const { login } = useAuthStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const response = await apiClient.post<ApiResponse<LoginResponse>>(
        '/auth/login',
        credentials
      )
      return response.data.data
    },
    onSuccess: (data) => {
      login(data.user, data.token)
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })
}

export function useLogout() {
  const { logout } = useAuthStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/auth/logout')
    },
    onSuccess: () => {
      logout()
      queryClient.clear()
    },
  })
}

export function useCurrentUser() {
  const { setUser, setLoading, token } = useAuthStore()

  return useQuery({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<User>>('/auth/me')
      return response.data.data
    },
    enabled: !!token,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: false,
    meta: {
      onSuccess: (data: User) => {
        setUser(data)
        setLoading(false)
      },
      onError: () => {
        setUser(null)
        setLoading(false)
      },
    },
  })
}
