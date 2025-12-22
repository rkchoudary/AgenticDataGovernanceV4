import { useState, useMemo } from 'react'
import {
  Search,
  ArrowUpDown,
  Users,
  UserPlus,
  Mail,
  MoreHorizontal,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  UserCog,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useUsers,
  useUpdateUserRole,
  useUpdateUserStatus,
  useResendInvitation,
  useRevokeInvitation,
  useDeleteUser,
  type TenantUser,
  type UserRole,
  type UserStatus,
  type InvitationStatus,
} from '@/hooks/useUsers'
import { InviteUserDialog } from '@/components/users/InviteUserDialog'
import { cn } from '@/lib/utils'

type SortField = 'name' | 'role' | 'status' | 'lastActiveAt' | 'createdAt'
type SortOrder = 'asc' | 'desc'

interface UserFilters {
  search: string
  role: string
  status: string
  invitationStatus: string
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  compliance_officer: 'Compliance Officer',
  data_steward: 'Data Steward',
  data_owner: 'Data Owner',
  viewer: 'Viewer',
}

const roleOrder: Record<UserRole, number> = {
  admin: 5,
  compliance_officer: 4,
  data_steward: 3,
  data_owner: 2,
  viewer: 1,
}


export function UserList() {
  const [filters, setFilters] = useState<UserFilters>({
    search: '',
    role: 'all',
    status: 'all',
    invitationStatus: 'all',
  })
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null)

  const { data: usersData, isLoading } = useUsers({
    search: filters.search || undefined,
    role: filters.role !== 'all' ? filters.role : undefined,
    status: filters.status !== 'all' ? filters.status : undefined,
    invitationStatus: filters.invitationStatus !== 'all' ? filters.invitationStatus : undefined,
  })

  const updateRole = useUpdateUserRole()
  const updateStatus = useUpdateUserStatus()
  const resendInvitation = useResendInvitation()
  const revokeInvitation = useRevokeInvitation()
  const deleteUser = useDeleteUser()

  const sortedUsers = useMemo(() => {
    if (!usersData?.items) return []
    return [...usersData.items].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'role':
          comparison = roleOrder[a.role] - roleOrder[b.role]
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
        case 'lastActiveAt': {
          const aTime = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0
          const bTime = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0
          comparison = aTime - bTime
          break
        }
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [usersData?.items, sortField, sortOrder])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const getRoleBadge = (role: UserRole) => {
    const colors: Record<UserRole, string> = {
      admin: 'bg-purple-100 text-purple-700 border-purple-200',
      compliance_officer: 'bg-blue-100 text-blue-700 border-blue-200',
      data_steward: 'bg-green-100 text-green-700 border-green-200',
      data_owner: 'bg-orange-100 text-orange-700 border-orange-200',
      viewer: 'bg-gray-100 text-gray-700 border-gray-200',
    }
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium border', colors[role])}>
        {roleLabels[role]}
      </span>
    )
  }

  const getStatusBadge = (status: UserStatus) => {
    const config: Record<UserStatus, { color: string; icon: React.ReactNode }> = {
      active: { color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 className="h-3 w-3" /> },
      inactive: { color: 'bg-gray-100 text-gray-700 border-gray-200', icon: <Clock className="h-3 w-3" /> },
      suspended: { color: 'bg-red-100 text-red-700 border-red-200', icon: <XCircle className="h-3 w-3" /> },
    }
    const { color, icon } = config[status]
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium border flex items-center gap-1 capitalize', color)}>
        {icon}
        {status}
      </span>
    )
  }

  const getInvitationBadge = (invStatus: InvitationStatus) => {
    const config: Record<InvitationStatus, { color: string; label: string }> = {
      pending: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Pending' },
      accepted: { color: 'bg-green-100 text-green-700 border-green-200', label: 'Accepted' },
      expired: { color: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Expired' },
      revoked: { color: 'bg-red-100 text-red-700 border-red-200', label: 'Revoked' },
    }
    const { color, label } = config[invStatus]
    return (
      <span className={cn('px-2 py-1 rounded-full text-xs font-medium border', color)}>
        {label}
      </span>
    )
  }

  const getLastActiveDisplay = (lastActiveAt?: string) => {
    if (!lastActiveAt) return 'Never'
    const date = new Date(lastActiveAt)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 5) return 'Online'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const handleRoleChange = (userId: string, role: UserRole) => {
    updateRole.mutate({ userId, role })
  }

  const handleStatusChange = (userId: string, status: UserStatus) => {
    updateStatus.mutate({ userId, status })
  }

  const handleResendInvitation = (userId: string) => {
    resendInvitation.mutate(userId)
  }

  const handleRevokeInvitation = (userId: string) => {
    revokeInvitation.mutate(userId)
  }

  const handleDeleteUser = () => {
    if (selectedUser) {
      deleteUser.mutate(selectedUser.id)
      setDeleteDialogOpen(false)
      setSelectedUser(null)
    }
  }

  // Summary stats
  const stats = useMemo(() => {
    if (!usersData?.items) return { total: 0, active: 0, pending: 0, admins: 0 }
    const items = usersData.items
    return {
      total: items.length,
      active: items.filter(u => u.status === 'active').length,
      pending: items.filter(u => u.invitationStatus === 'pending').length,
      admins: items.filter(u => u.role === 'admin').length,
    }
  }, [usersData?.items])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground">
            Manage users, roles, and access permissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.href = '/users/roles'}>
            <Shield className="h-4 w-4 mr-2" />
            Manage Roles
          </Button>
          <Button onClick={() => setInviteDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invite User
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Invites</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Mail className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Admins</p>
                <p className="text-2xl font-bold text-purple-600">{stats.admins}</p>
              </div>
              <Shield className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-4 py-2 border rounded-md bg-background"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
            <Select
              value={filters.role}
              onValueChange={(value) => setFilters({ ...filters, role: value })}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="compliance_officer">Compliance Officer</SelectItem>
                <SelectItem value="data_steward">Data Steward</SelectItem>
                <SelectItem value="data_owner">Data Owner</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value })}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.invitationStatus}
              onValueChange={(value) => setFilters({ ...filters, invitationStatus: value })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Invitation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Invitations</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {usersData?.total ?? 0} Users
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading users...</p>
            </div>
          ) : sortedUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('name')}
                      >
                        User
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('role')}
                      >
                        Role
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('status')}
                      >
                        Status
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">Invitation</th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('lastActiveAt')}
                      >
                        Last Active
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            {user.avatarUrl ? (
                              <img src={user.avatarUrl} alt={user.name} className="h-10 w-10 rounded-full" />
                            ) : (
                              <span className="text-sm font-medium text-primary">
                                {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-sm text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2">{getRoleBadge(user.role)}</td>
                      <td className="py-3 px-2">{getStatusBadge(user.status)}</td>
                      <td className="py-3 px-2">{getInvitationBadge(user.invitationStatus)}</td>
                      <td className="py-3 px-2">
                        <span className={cn(
                          'text-sm',
                          getLastActiveDisplay(user.lastActiveAt) === 'Online' 
                            ? 'text-green-600 font-medium' 
                            : 'text-muted-foreground'
                        )}>
                          {getLastActiveDisplay(user.lastActiveAt)}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => window.location.href = `/users/${user.id}`}>
                              <UserCog className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleRoleChange(user.id, 'admin')}>
                              Change Role
                            </DropdownMenuItem>
                            {user.status === 'active' ? (
                              <DropdownMenuItem onClick={() => handleStatusChange(user.id, 'suspended')}>
                                Suspend User
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleStatusChange(user.id, 'active')}>
                                Activate User
                              </DropdownMenuItem>
                            )}
                            {user.invitationStatus === 'pending' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleResendInvitation(user.id)}>
                                  <Mail className="h-4 w-4 mr-2" />
                                  Resend Invitation
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleRevokeInvitation(user.id)}>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Revoke Invitation
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                setSelectedUser(user)
                                setDeleteDialogOpen(true)
                              }}
                            >
                              Delete User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite User Dialog */}
      <InviteUserDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedUser?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default UserList
