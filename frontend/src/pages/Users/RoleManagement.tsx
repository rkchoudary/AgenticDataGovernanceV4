import { useState, useMemo } from 'react'
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  Lock,
  Users,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  type Role,
  type Permission,
} from '@/hooks/useUsers'
import { cn } from '@/lib/utils'

// Available permissions grouped by resource
const availablePermissions: Array<{ resource: string; actions: Permission['action'][] }> = [
  { resource: 'users', actions: ['create', 'read', 'update', 'delete', 'manage'] },
  { resource: 'roles', actions: ['create', 'read', 'update', 'delete', 'manage'] },
  { resource: 'cdes', actions: ['create', 'read', 'update', 'delete', 'approve', 'manage'] },
  { resource: 'dq_rules', actions: ['create', 'read', 'update', 'delete', 'manage'] },
  { resource: 'issues', actions: ['create', 'read', 'update', 'delete', 'manage'] },
  { resource: 'approvals', actions: ['read', 'approve', 'manage'] },
  { resource: 'reports', actions: ['read', 'create', 'manage'] },
  { resource: 'cycles', actions: ['read', 'create', 'update', 'manage'] },
  { resource: 'lineage', actions: ['read', 'update', 'manage'] },
  { resource: 'controls', actions: ['read', 'update', 'manage'] },
]

const resourceLabels: Record<string, string> = {
  users: 'User Management',
  roles: 'Role Management',
  cdes: 'Critical Data Elements',
  dq_rules: 'Data Quality Rules',
  issues: 'Issue Management',
  approvals: 'Approvals',
  reports: 'Reports',
  cycles: 'Report Cycles',
  lineage: 'Data Lineage',
  controls: 'Controls',
}

const actionLabels: Record<string, string> = {
  create: 'Create',
  read: 'View',
  update: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
  manage: 'Full Access',
}


interface RoleFormData {
  name: string
  displayName: string
  description: string
  permissions: Permission[]
  parentRoleId?: string
}

export function RoleManagement() {
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [formData, setFormData] = useState<RoleFormData>({
    name: '',
    displayName: '',
    description: '',
    permissions: [],
    parentRoleId: undefined,
  })

  const { data: roles, isLoading } = useRoles()
  const createRole = useCreateRole()
  const updateRole = useUpdateRole()
  const deleteRole = useDeleteRole()

  const predefinedRoles = useMemo(() => roles?.filter(r => !r.isCustom) || [], [roles])
  const customRoles = useMemo(() => roles?.filter(r => r.isCustom) || [], [roles])

  const toggleRoleExpanded = (roleId: string) => {
    const newExpanded = new Set(expandedRoles)
    if (newExpanded.has(roleId)) {
      newExpanded.delete(roleId)
    } else {
      newExpanded.add(roleId)
    }
    setExpandedRoles(newExpanded)
  }

  const handleCreateRole = async () => {
    await createRole.mutateAsync({
      name: formData.name.toLowerCase().replace(/\s+/g, '_'),
      displayName: formData.displayName,
      description: formData.description,
      permissions: formData.permissions,
      isCustom: true,
      parentRoleId: formData.parentRoleId,
    })
    setCreateDialogOpen(false)
    resetForm()
  }

  const handleUpdateRole = async () => {
    if (!editingRole) return
    await updateRole.mutateAsync({
      roleId: editingRole.id,
      updates: {
        displayName: formData.displayName,
        description: formData.description,
        permissions: formData.permissions,
        parentRoleId: formData.parentRoleId,
      },
    })
    setEditingRole(null)
    resetForm()
  }

  const handleDeleteRole = async () => {
    if (!selectedRole) return
    await deleteRole.mutateAsync(selectedRole.id)
    setDeleteDialogOpen(false)
    setSelectedRole(null)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      displayName: '',
      description: '',
      permissions: [],
      parentRoleId: undefined,
    })
  }

  const openEditDialog = (role: Role) => {
    setEditingRole(role)
    setFormData({
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      permissions: [...role.permissions],
      parentRoleId: role.parentRoleId,
    })
  }

  const togglePermission = (resource: string, action: Permission['action']) => {
    const existingIndex = formData.permissions.findIndex(
      p => p.resource === resource && p.action === action
    )
    
    if (existingIndex >= 0) {
      setFormData({
        ...formData,
        permissions: formData.permissions.filter((_, i) => i !== existingIndex),
      })
    } else {
      setFormData({
        ...formData,
        permissions: [
          ...formData.permissions,
          {
            id: `${resource}-${action}`,
            resource,
            action,
            description: `${actionLabels[action]} ${resourceLabels[resource]}`,
          },
        ],
      })
    }
  }

  const hasPermission = (resource: string, action: Permission['action']) => {
    return formData.permissions.some(p => p.resource === resource && p.action === action)
  }

  const RoleCard = ({ role, isCustom }: { role: Role; isCustom: boolean }) => {
    const isExpanded = expandedRoles.has(role.id)
    
    return (
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleRoleExpanded(role.id)}
                className="p-1 hover:bg-muted rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              <div className="flex items-center gap-2">
                <Shield className={cn(
                  'h-5 w-5',
                  isCustom ? 'text-blue-500' : 'text-purple-500'
                )} />
                <div>
                  <CardTitle className="text-base">{role.displayName}</CardTitle>
                  <CardDescription className="text-sm">{role.description}</CardDescription>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isCustom && (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                  System Role
                </span>
              )}
              {isCustom && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(role)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedRole(role)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Permissions</p>
                <div className="grid gap-2">
                  {role.permissions.map((perm) => (
                    <div
                      key={perm.id}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>
                        {actionLabels[perm.action]} - {resourceLabels[perm.resource] || perm.resource}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {role.parentRoleId && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">Inherits from:</span>{' '}
                  {roles?.find(r => r.id === role.parentRoleId)?.displayName}
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    )
  }


  const PermissionEditor = () => (
    <div className="space-y-4 max-h-[300px] overflow-y-auto">
      {availablePermissions.map(({ resource, actions }) => (
        <div key={resource} className="border rounded-lg p-3">
          <p className="font-medium text-sm mb-2">{resourceLabels[resource]}</p>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={`${resource}-${action}`}
                onClick={() => togglePermission(resource, action)}
                className={cn(
                  'px-3 py-1 text-xs rounded-full border transition-colors',
                  hasPermission(resource, action)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted'
                )}
              >
                {actionLabels[action]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Role Management</h1>
          <p className="text-muted-foreground">
            Configure roles and permissions for your organization
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.href = '/users'}>
            <Users className="h-4 w-4 mr-2" />
            Back to Users
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Custom Role
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">Loading roles...</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Predefined Roles */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-5 w-5 text-purple-500" />
              <h2 className="text-lg font-semibold">Predefined Roles</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              System roles with standard permissions. These cannot be modified.
            </p>
            {predefinedRoles.map((role) => (
              <RoleCard key={role.id} role={role} isCustom={false} />
            ))}
          </div>

          {/* Custom Roles */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-semibold">Custom Roles</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Create custom roles with specific permissions for your organization.
            </p>
            {customRoles.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No custom roles created yet</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Custom Role
                  </Button>
                </CardContent>
              </Card>
            ) : (
              customRoles.map((role) => (
                <RoleCard key={role.id} role={role} isCustom={true} />
              ))
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Role Dialog */}
      <Dialog
        open={createDialogOpen || !!editingRole}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setCreateDialogOpen(false)
            setEditingRole(null)
            resetForm()
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? 'Edit Role' : 'Create Custom Role'}
            </DialogTitle>
            <DialogDescription>
              {editingRole
                ? 'Modify the role settings and permissions'
                : 'Define a new role with specific permissions'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!editingRole && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role Name</label>
                  <input
                    type="text"
                    placeholder="e.g., senior_analyst"
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Senior Analyst"
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  />
                </div>
              </div>
            )}

            {editingRole && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Display Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <textarea
                placeholder="Describe what this role is for..."
                className="w-full px-3 py-2 border rounded-md bg-background min-h-[60px]"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Inherit From (Optional)</label>
              <Select
                value={formData.parentRoleId || 'none'}
                onValueChange={(v) => setFormData({ ...formData, parentRoleId: v === 'none' ? undefined : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a parent role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No inheritance</SelectItem>
                  {predefinedRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Inheriting from a role includes all its permissions
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Permissions</label>
              <PermissionEditor />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false)
                setEditingRole(null)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingRole ? handleUpdateRole : handleCreateRole}
              disabled={
                (!editingRole && (!formData.name || !formData.displayName)) ||
                createRole.isPending ||
                updateRole.isPending
              }
            >
              {editingRole ? 'Save Changes' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the role "{selectedRole?.displayName}"?
              Users with this role will need to be reassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteRole}>
              Delete Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RoleManagement
