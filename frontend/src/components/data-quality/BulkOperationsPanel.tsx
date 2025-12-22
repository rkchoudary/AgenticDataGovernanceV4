import { useState } from 'react'
import {
  Users,
  CheckCircle2,
  XCircle,
  Trash2,
  RefreshCw,
  X,
  AlertTriangle,
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
export interface BulkOperation {
  type: 'assign_owner' | 'change_status' | 'enable_rules' | 'disable_rules' | 'delete'
  label: string
  icon: React.ReactNode
  variant?: 'default' | 'destructive'
}

interface BulkOperationsPanelProps {
  selectedCount: number
  selectedIds: string[]
  onClearSelection: () => void
  onAssignOwner: (owner: string, email: string) => void
  onChangeStatus: (status: string) => void
  onEnableRules: () => void
  onDisableRules: () => void
  onDelete?: () => void
  availableOwners?: { id: string; name: string; email: string }[]
  isProcessing?: boolean
}

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'deprecated', label: 'Deprecated' },
]

export function BulkOperationsPanel({
  selectedCount,
  selectedIds: _selectedIds,
  onClearSelection,
  onAssignOwner,
  onChangeStatus,
  onEnableRules,
  onDisableRules,
  onDelete,
  availableOwners = [],
  isProcessing = false,
}: BulkOperationsPanelProps) {
  const [activeOperation, setActiveOperation] = useState<string | null>(null)
  const [selectedOwner, setSelectedOwner] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const handleAssignOwner = () => {
    const owner = availableOwners.find((o) => o.id === selectedOwner)
    if (owner) {
      onAssignOwner(owner.name, owner.email)
      setActiveOperation(null)
      setSelectedOwner('')
    }
  }

  const handleChangeStatus = () => {
    if (selectedStatus) {
      onChangeStatus(selectedStatus)
      setActiveOperation(null)
      setSelectedStatus('')
    }
  }

  const handleDelete = () => {
    onDelete?.()
    setShowConfirmDelete(false)
    setActiveOperation(null)
  }

  if (selectedCount === 0) return null


  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <Card className="shadow-lg border-2">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-4">
            {/* Selection Info */}
            <div className="flex items-center gap-2 pr-4 border-r">
              <span className="bg-primary text-primary-foreground px-2 py-1 rounded-md text-sm font-medium">
                {selectedCount}
              </span>
              <span className="text-sm text-muted-foreground">selected</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClearSelection}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Quick Actions */}
            {activeOperation === null && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveOperation('assign_owner')}
                  disabled={isProcessing}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Assign Owner
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveOperation('change_status')}
                  disabled={isProcessing}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Change Status
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEnableRules}
                  disabled={isProcessing}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Enable Rules
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDisableRules}
                  disabled={isProcessing}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Disable Rules
                </Button>
                {onDelete && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setShowConfirmDelete(true)}
                    disabled={isProcessing}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                )}
              </div>
            )}

            {/* Assign Owner Form */}
            {activeOperation === 'assign_owner' && (
              <div className="flex items-center gap-2">
                <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOwners.map((owner) => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {owner.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={handleAssignOwner}
                  disabled={!selectedOwner || isProcessing}
                >
                  Apply
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveOperation(null)
                    setSelectedOwner('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Change Status Form */}
            {activeOperation === 'change_status' && (
              <div className="flex items-center gap-2">
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={handleChangeStatus}
                  disabled={!selectedStatus || isProcessing}
                >
                  Apply
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveOperation(null)
                    setSelectedStatus('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Processing Indicator */}
            {isProcessing && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Processing...</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Confirm Delete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Are you sure you want to delete {selectedCount} selected item(s)?
                This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmDelete(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isProcessing}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export default BulkOperationsPanel
