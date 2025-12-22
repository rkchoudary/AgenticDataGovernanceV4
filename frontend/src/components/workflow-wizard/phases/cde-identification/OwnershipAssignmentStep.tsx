/**
 * OwnershipAssignmentStep Component
 * 
 * Step 3 of CDE Identification phase - assigns owners to each CDE.
 * Blocks progression if any CDE lacks an owner (Property 7).
 * 
 * Requirements: 5.3, 5.4
 */

import { useState, useMemo } from 'react'
import {
  Target,
  User as UserIcon,
  Users,
  Search,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Building2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  CDE,
  CDEIdentificationSummary,
  User,
  allCDEsHaveOwners,
  getCDEsWithoutOwners,
} from './types'

// ============================================================================
// User Search Component
// ============================================================================

interface UserSearchProps {
  users: User[]
  onSelect: (user: User) => void
  selectedUserId?: string
  placeholder?: string
}

function UserSearch({ users, onSelect, selectedUserId, placeholder = 'Search users...' }: UserSearchProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const query = searchQuery.toLowerCase()
    return users.filter(user =>
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.department.toLowerCase().includes(query) ||
      user.role.toLowerCase().includes(query)
    )
  }, [users, searchQuery])

  const handleSelect = (user: User) => {
    onSelect(user)
    setSearchQuery('')
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg bg-background"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
        />
      </div>
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute z-20 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-64 overflow-auto">
            {filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                No users found
              </div>
            ) : (
              filteredUsers.map(user => (
                <button
                  key={user.id}
                  className={cn(
                    'w-full text-left px-4 py-3 hover:bg-muted transition-colors',
                    selectedUserId === user.id && 'bg-primary/5'
                  )}
                  onClick={() => handleSelect(user)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.department} • {user.role}
                      </p>
                    </div>
                    {selectedUserId === user.id && (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// Owner Badge Component
// ============================================================================

interface OwnerBadgeProps {
  owner: CDE['owner']
  onRemove?: () => void
}

function OwnerBadge({ owner, onRemove }: OwnerBadgeProps) {
  if (!owner) return null

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
        <UserIcon className="h-4 w-4 text-green-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-green-700 truncate">{owner.name}</p>
        <p className="text-xs text-green-600 truncate">{owner.department}</p>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-green-100 text-green-600"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// ============================================================================
// CDE Ownership Card Component
// ============================================================================

interface CDEOwnershipCardProps {
  cde: CDE
  users: User[]
  onAssignOwner: (user: User) => void
}

function CDEOwnershipCard({ cde, users, onAssignOwner }: CDEOwnershipCardProps) {
  const hasOwner = !!cde.owner

  return (
    <Card className={cn(
      'transition-all',
      hasOwner ? 'border-green-200' : 'border-amber-200'
    )}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-4">
          {/* CDE Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-primary shrink-0" />
              <span className="font-medium">{cde.name}</span>
              {hasOwner ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              {cde.businessDefinition}
            </p>
            
            {/* Owner Assignment */}
            {hasOwner ? (
              <OwnerBadge
                owner={cde.owner}
                onRemove={() => {
                  // Would need to add a remove handler
                }}
              />
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-amber-700">
                  Assign Owner (Required)
                </label>
                <UserSearch
                  users={users}
                  onSelect={onAssignOwner}
                  placeholder="Search by name, email, or department..."
                />
              </div>
            )}
          </div>

          {/* Score */}
          <div className="text-right shrink-0">
            <span className={cn(
              'inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium',
              cde.overallScore >= 90 ? 'bg-green-100 text-green-700' :
              cde.overallScore >= 75 ? 'bg-blue-100 text-blue-700' :
              'bg-amber-100 text-amber-700'
            )}>
              {cde.overallScore}
            </span>
            <p className="text-xs text-muted-foreground mt-1">Score</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Bulk Assignment Panel Component
// ============================================================================

interface BulkAssignmentPanelProps {
  cdesWithoutOwners: CDE[]
  users: User[]
  onBulkAssign: (cdeIds: string[], user: User) => void
}

function BulkAssignmentPanel({ cdesWithoutOwners, users, onBulkAssign }: BulkAssignmentPanelProps) {
  const [selectedCDEIds, setSelectedCDEIds] = useState<string[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const handleToggleCDE = (cdeId: string) => {
    setSelectedCDEIds(prev =>
      prev.includes(cdeId)
        ? prev.filter(id => id !== cdeId)
        : [...prev, cdeId]
    )
  }

  const handleSelectAll = () => {
    if (selectedCDEIds.length === cdesWithoutOwners.length) {
      setSelectedCDEIds([])
    } else {
      setSelectedCDEIds(cdesWithoutOwners.map(c => c.id))
    }
  }

  const handleBulkAssign = () => {
    if (selectedUser && selectedCDEIds.length > 0) {
      onBulkAssign(selectedCDEIds, selectedUser)
      setSelectedCDEIds([])
      setSelectedUser(null)
    }
  }

  if (cdesWithoutOwners.length === 0) return null

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Bulk Assignment
        </CardTitle>
        <CardDescription>
          Assign the same owner to multiple CDEs at once
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* CDE Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Select CDEs</label>
              <button
                className="text-xs text-primary hover:underline"
                onClick={handleSelectAll}
              >
                {selectedCDEIds.length === cdesWithoutOwners.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {cdesWithoutOwners.map(cde => (
                <button
                  key={cde.id}
                  onClick={() => handleToggleCDE(cde.id)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-lg border transition-colors',
                    selectedCDEIds.includes(cde.id)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:border-primary'
                  )}
                >
                  {cde.name}
                </button>
              ))}
            </div>
          </div>

          {/* User Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Assign To</label>
            {selectedUser ? (
              <div className="flex items-center gap-2">
                <OwnerBadge
                  owner={{
                    userId: selectedUser.id,
                    name: selectedUser.name,
                    email: selectedUser.email,
                    department: selectedUser.department,
                    role: selectedUser.role,
                    assignedAt: '',
                    assignedBy: '',
                  }}
                  onRemove={() => setSelectedUser(null)}
                />
              </div>
            ) : (
              <UserSearch
                users={users}
                onSelect={setSelectedUser}
                placeholder="Search for owner..."
              />
            )}
          </div>

          {/* Apply Button */}
          <Button
            onClick={handleBulkAssign}
            disabled={selectedCDEIds.length === 0 || !selectedUser}
            className="w-full"
          >
            Assign to {selectedCDEIds.length} CDE(s)
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface OwnershipAssignmentStepProps {
  cdes: CDE[]
  users: User[]
  onAssignOwner: (cdeId: string, user: User) => void
  onBulkAssign: (cdeIds: string[], user: User) => void
  summary: CDEIdentificationSummary
  onComplete: () => void
}

export function OwnershipAssignmentStep({
  cdes,
  users,
  onAssignOwner,
  onBulkAssign,
  summary,
  onComplete,
}: OwnershipAssignmentStepProps) {
  // Get CDEs without owners
  const cdesWithoutOwners = useMemo(() => getCDEsWithoutOwners(cdes), [cdes])
  
  // Property 7: Ownership Gate Enforcement - check if all CDEs have owners
  const canProceed = allCDEsHaveOwners(cdes)

  // Group users by department for easier browsing
  const usersByDepartment = useMemo(() => {
    const grouped: Record<string, User[]> = {}
    users.forEach(user => {
      if (!grouped[user.department]) {
        grouped[user.department] = []
      }
      grouped[user.department].push(user)
    })
    return grouped
  }, [users])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-primary" />
          Ownership Assignment
        </h2>
        <p className="text-muted-foreground mt-1">
          Assign a data owner to each CDE. All CDEs must have an owner before
          proceeding to the next phase.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.totalCDEs}</p>
                <p className="text-xs text-muted-foreground">Total CDEs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(
          summary.cdesWithOwners === summary.totalCDEs
            ? 'border-green-200 bg-green-50/50'
            : ''
        )}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-700">{summary.cdesWithOwners}</p>
                <p className="text-xs text-green-600">With Owners</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(
          summary.cdesWithoutOwners > 0
            ? 'border-amber-200 bg-amber-50/50'
            : ''
        )}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">{summary.cdesWithoutOwners}</p>
                <p className="text-xs text-amber-600">Need Owners</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Assignment Panel */}
      <BulkAssignmentPanel
        cdesWithoutOwners={cdesWithoutOwners}
        users={users}
        onBulkAssign={onBulkAssign}
      />

      {/* User Directory Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Available Users by Department
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {Object.entries(usersByDepartment).map(([dept, deptUsers]) => (
              <div key={dept} className="text-sm">
                <span className="font-medium">{dept}:</span>
                <span className="text-muted-foreground ml-1">{deptUsers.length} users</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* CDE List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CDE Ownership</CardTitle>
          <CardDescription>
            Assign an owner to each CDE using the search functionality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {cdes.map(cde => (
              <CDEOwnershipCard
                key={cde.id}
                cde={cde}
                users={users}
                onAssignOwner={(user) => onAssignOwner(cde.id, user)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Blocking Warning - Property 7: Ownership Gate Enforcement */}
      {!canProceed && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Ownership Required</p>
            <p className="text-sm">
              {summary.cdesWithoutOwners} CDE(s) require owner assignment before you can proceed
              to the Data Quality Rules phase.
            </p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {canProceed && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-green-50 border border-green-200 text-green-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">All Owners Assigned</p>
            <p className="text-sm">
              All CDEs have been assigned owners. You can proceed to the next step.
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete} disabled={!canProceed}>
          Continue to Reconciliation
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

export default OwnershipAssignmentStep
