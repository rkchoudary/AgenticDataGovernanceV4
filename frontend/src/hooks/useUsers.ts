import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export type UserRole = 'admin' | 'compliance_officer' | 'data_steward' | 'data_owner' | 'viewer'
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'
export type UserStatus = 'active' | 'inactive' | 'suspended'

export interface TenantUser {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  invitationStatus: InvitationStatus
  lastActiveAt?: string
  createdAt: string
  avatarUrl?: string
  department?: string
  ssoProvider?: string
}

export interface Role {
  id: string
  name: string
  displayName: string
  description: string
  permissions: Permission[]
  isCustom: boolean
  parentRoleId?: string
  createdAt: string
  updatedAt: string
}

export interface Permission {
  id: string
  resource: string
  action: 'create' | 'read' | 'update' | 'delete' | 'approve' | 'manage'
  description: string
}

export interface UserInvitation {
  email: string
  role: UserRole
  department?: string
  message?: string
}

export interface BulkImportResult {
  total: number
  successful: number
  failed: number
  errors: Array<{ email: string; error: string }>
}

interface UseUsersParams {
  search?: string
  role?: string
  status?: string
  invitationStatus?: string
}


// Mock data for development
const mockUsers: TenantUser[] = [
  {
    id: '1',
    email: 'admin@company.com',
    name: 'John Admin',
    role: 'admin',
    status: 'active',
    invitationStatus: 'accepted',
    lastActiveAt: new Date().toISOString(),
    createdAt: '2024-01-15T10:00:00Z',
    department: 'IT',
  },
  {
    id: '2',
    email: 'compliance@company.com',
    name: 'Sarah Compliance',
    role: 'compliance_officer',
    status: 'active',
    invitationStatus: 'accepted',
    lastActiveAt: new Date(Date.now() - 3600000).toISOString(),
    createdAt: '2024-02-01T10:00:00Z',
    department: 'Compliance',
  },
  {
    id: '3',
    email: 'steward@company.com',
    name: 'Mike Steward',
    role: 'data_steward',
    status: 'active',
    invitationStatus: 'accepted',
    lastActiveAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: '2024-03-10T10:00:00Z',
    department: 'Data Management',
  },
  {
    id: '4',
    email: 'owner@company.com',
    name: 'Lisa Owner',
    role: 'data_owner',
    status: 'inactive',
    invitationStatus: 'accepted',
    lastActiveAt: new Date(Date.now() - 604800000).toISOString(),
    createdAt: '2024-04-05T10:00:00Z',
    department: 'Finance',
  },
  {
    id: '5',
    email: 'viewer@company.com',
    name: 'Tom Viewer',
    role: 'viewer',
    status: 'active',
    invitationStatus: 'pending',
    createdAt: '2024-11-01T10:00:00Z',
    department: 'Operations',
  },
]

const mockRoles: Role[] = [
  {
    id: 'admin',
    name: 'admin',
    displayName: 'Admin',
    description: 'Full system access with user management capabilities',
    permissions: [
      { id: 'p1', resource: '*', action: 'manage', description: 'Full system management' },
    ],
    isCustom: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'compliance_officer',
    name: 'compliance_officer',
    displayName: 'Compliance Officer',
    description: 'Approve governance artifacts and manage compliance workflows',
    permissions: [
      { id: 'p2', resource: 'approvals', action: 'approve', description: 'Approve artifacts' },
      { id: 'p3', resource: 'reports', action: 'read', description: 'View reports' },
      { id: 'p4', resource: 'cycles', action: 'manage', description: 'Manage cycles' },
    ],
    isCustom: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'data_steward',
    name: 'data_steward',
    displayName: 'Data Steward',
    description: 'Manage CDEs, data quality rules, and lineage',
    permissions: [
      { id: 'p5', resource: 'cdes', action: 'manage', description: 'Manage CDEs' },
      { id: 'p6', resource: 'dq_rules', action: 'manage', description: 'Manage DQ rules' },
      { id: 'p7', resource: 'lineage', action: 'manage', description: 'Manage lineage' },
    ],
    isCustom: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'data_owner',
    name: 'data_owner',
    displayName: 'Data Owner',
    description: 'Own and approve changes to assigned data elements',
    permissions: [
      { id: 'p8', resource: 'cdes', action: 'approve', description: 'Approve CDE changes' },
      { id: 'p9', resource: 'issues', action: 'manage', description: 'Manage issues' },
    ],
    isCustom: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'viewer',
    name: 'viewer',
    displayName: 'Viewer',
    description: 'Read-only access to governance data',
    permissions: [
      { id: 'p10', resource: '*', action: 'read', description: 'View all data' },
    ],
    isCustom: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

export function useUsers(params: UseUsersParams = {}) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: async () => {
      // In production, this would call the API
      // const response = await apiClient.get<ApiResponse<PaginatedResponse<TenantUser>>>('/users', { params })
      // return response.data.data
      
      // Mock implementation
      let filtered = [...mockUsers]
      
      if (params.search) {
        const search = params.search.toLowerCase()
        filtered = filtered.filter(
          u => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
        )
      }
      if (params.role && params.role !== 'all') {
        filtered = filtered.filter(u => u.role === params.role)
      }
      if (params.status && params.status !== 'all') {
        filtered = filtered.filter(u => u.status === params.status)
      }
      if (params.invitationStatus && params.invitationStatus !== 'all') {
        filtered = filtered.filter(u => u.invitationStatus === params.invitationStatus)
      }
      
      return { items: filtered, total: filtered.length, page: 1, pageSize: 20 }
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      // In production: const response = await apiClient.get<ApiResponse<Role[]>>('/roles')
      return mockRoles
    },
    staleTime: 1000 * 60 * 30,
  })
}


export function useInviteUser() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (invitation: UserInvitation) => {
      // In production: const response = await apiClient.post<ApiResponse<TenantUser>>('/users/invite', invitation)
      // return response.data.data
      
      // Mock implementation
      const newUser: TenantUser = {
        id: `user-${Date.now()}`,
        email: invitation.email,
        name: invitation.email.split('@')[0],
        role: invitation.role,
        status: 'active',
        invitationStatus: 'pending',
        createdAt: new Date().toISOString(),
        department: invitation.department,
      }
      mockUsers.push(newUser)
      return newUser
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useBulkImportUsers() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (_file: File): Promise<BulkImportResult> => {
      // In production: const formData = new FormData(); formData.append('file', _file)
      // const response = await apiClient.post<ApiResponse<BulkImportResult>>('/users/bulk-import', formData)
      // return response.data.data
      
      // Mock implementation
      return {
        total: 5,
        successful: 4,
        failed: 1,
        errors: [{ email: 'invalid@test', error: 'Invalid email format' }],
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      // In production: await apiClient.patch(`/users/${userId}/role`, { role })
      const user = mockUsers.find(u => u.id === userId)
      if (user) user.role = role
      return user
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: UserStatus }) => {
      // In production: await apiClient.patch(`/users/${userId}/status`, { status })
      const user = mockUsers.find(u => u.id === userId)
      if (user) user.status = status
      return user
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useResendInvitation() {
  return useMutation({
    mutationFn: async (_userId: string) => {
      // In production: await apiClient.post(`/users/${_userId}/resend-invitation`)
      return { success: true }
    },
  })
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (userId: string) => {
      // In production: await apiClient.post(`/users/${userId}/revoke-invitation`)
      const user = mockUsers.find(u => u.id === userId)
      if (user) user.invitationStatus = 'revoked'
      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (userId: string) => {
      // In production: await apiClient.delete(`/users/${userId}`)
      const index = mockUsers.findIndex(u => u.id === userId)
      if (index > -1) mockUsers.splice(index, 1)
      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useCreateRole() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (role: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>) => {
      // In production: const response = await apiClient.post<ApiResponse<Role>>('/roles', role)
      const newRole: Role = {
        ...role,
        id: `role-${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      mockRoles.push(newRole)
      return newRole
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ roleId, updates }: { roleId: string; updates: Partial<Role> }) => {
      // In production: await apiClient.patch(`/roles/${roleId}`, updates)
      const role = mockRoles.find(r => r.id === roleId)
      if (role) Object.assign(role, updates, { updatedAt: new Date().toISOString() })
      return role
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (roleId: string) => {
      // In production: await apiClient.delete(`/roles/${roleId}`)
      const index = mockRoles.findIndex(r => r.id === roleId)
      if (index > -1) mockRoles.splice(index, 1)
      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}
