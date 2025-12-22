/**
 * RuleActivationStep Component
 * 
 * Step 4 of Data Quality Rules phase - requires confirmation before
 * activation and displays execution schedule.
 * 
 * Requirements: 6.5
 */

import { useState, useMemo } from 'react'
import { 
  CheckCircle, 
  Calendar,
  Bell,
  AlertTriangle,
  Play,
  Edit,
  Clock,
  Search,
  X,
  UserPlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DQRule,
  ActivationSchedule,
  ActivationConfirmation,
  DIMENSION_CONFIG,
  SEVERITY_CONFIG,
  Weekday,
} from './types'

// ============================================================================
// Weekday Configuration
// ============================================================================

const WEEKDAYS: { value: Weekday; label: string; shortLabel: string }[] = [
  { value: 'mon', label: 'Monday', shortLabel: 'M' },
  { value: 'tue', label: 'Tuesday', shortLabel: 'T' },
  { value: 'wed', label: 'Wednesday', shortLabel: 'W' },
  { value: 'thu', label: 'Thursday', shortLabel: 'T' },
  { value: 'fri', label: 'Friday', shortLabel: 'F' },
  { value: 'sat', label: 'Saturday', shortLabel: 'S' },
  { value: 'sun', label: 'Sunday', shortLabel: 'S' },
]

// Mock available users for search
const AVAILABLE_USERS = [
  { email: 'dq-team@example.com', name: 'DQ Team', role: 'Data Quality Team' },
  { email: 'data-steward@example.com', name: 'Data Steward', role: 'Data Steward' },
  { email: 'john.smith@example.com', name: 'John Smith', role: 'Data Analyst' },
  { email: 'jane.doe@example.com', name: 'Jane Doe', role: 'Data Engineer' },
  { email: 'mike.johnson@example.com', name: 'Mike Johnson', role: 'Business Analyst' },
  { email: 'sarah.wilson@example.com', name: 'Sarah Wilson', role: 'Compliance Officer' },
  { email: 'david.brown@example.com', name: 'David Brown', role: 'Risk Manager' },
  { email: 'emily.davis@example.com', name: 'Emily Davis', role: 'Data Governance Lead' },
  { email: 'chris.taylor@example.com', name: 'Chris Taylor', role: 'IT Manager' },
  { email: 'lisa.anderson@example.com', name: 'Lisa Anderson', role: 'Project Manager' },
]

// ============================================================================
// Component Props
// ============================================================================

interface RuleActivationStepProps {
  rules: DQRule[]
  schedule: ActivationSchedule
  onUpdateSchedule: (updates: Partial<ActivationSchedule>) => void
  onActivate: (ruleIds: string[], notes?: string) => void
  onUpdateRuleStatus: (ruleId: string, status: DQRuleStatus) => void
  activationConfirmation: ActivationConfirmation | null
  onComplete: () => void
}

type DQRuleStatus = 'pending' | 'accepted' | 'modified' | 'rejected'

// ============================================================================
// Rule Selection List Component
// ============================================================================

interface RuleSelectionListProps {
  rules: DQRule[]
  selectedRuleIds: string[]
  onToggleRule: (ruleId: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onUpdateRuleStatus: (ruleId: string, status: DQRuleStatus) => void
}

function RuleSelectionList({ 
  rules, 
  selectedRuleIds, 
  onToggleRule, 
  onSelectAll, 
  onDeselectAll,
  onUpdateRuleStatus,
}: RuleSelectionListProps) {
  const activatableRules = rules.filter(r => r.status === 'accepted' || r.status === 'modified')
  const allSelected = activatableRules.length > 0 && selectedRuleIds.length === activatableRules.length
  const pendingCount = rules.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-3">
      {/* Select All Header */}
      <div className="flex items-center justify-between pb-2 border-b">
        <div className="flex items-center gap-2">
          <Checkbox
            id="select-all"
            checked={allSelected}
            onCheckedChange={() => allSelected ? onDeselectAll() : onSelectAll()}
            disabled={activatableRules.length === 0}
          />
          <Label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
            {allSelected ? 'Deselect All' : 'Select All'}
          </Label>
        </div>
        <Badge variant="outline">
          {selectedRuleIds.length} of {activatableRules.length} selected
        </Badge>
      </div>

      {/* Pending Rules Warning */}
      {pendingCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            <span>{pendingCount} rule{pendingCount !== 1 ? 's' : ''} pending review - accept to enable activation</span>
          </div>
        </div>
      )}

      {/* Rule List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {rules.map(rule => {
          const isActivatable = rule.status === 'accepted' || rule.status === 'modified'
          const isSelected = selectedRuleIds.includes(rule.id)
          const dimensionConfig = DIMENSION_CONFIG[rule.dimension]
          const severityConfig = SEVERITY_CONFIG[rule.severity]
          const statusConfig = {
            pending: { label: 'Pending', color: 'text-gray-600', bgColor: 'bg-gray-100' },
            accepted: { label: 'Accepted', color: 'text-green-600', bgColor: 'bg-green-100' },
            modified: { label: 'Modified', color: 'text-blue-600', bgColor: 'bg-blue-100' },
            rejected: { label: 'Rejected', color: 'text-red-600', bgColor: 'bg-red-100' },
          }[rule.status]

          return (
            <div
              key={rule.id}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                isSelected && isActivatable 
                  ? 'border-primary bg-primary/5' 
                  : rule.status === 'pending'
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <Checkbox
                checked={isSelected && isActivatable}
                onCheckedChange={() => isActivatable && onToggleRule(rule.id)}
                disabled={!isActivatable}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge 
                    variant="outline" 
                    className="text-xs"
                    style={{ 
                      borderColor: dimensionConfig.color,
                      color: dimensionConfig.color,
                    }}
                  >
                    {dimensionConfig.label}
                  </Badge>
                  <Badge className={`text-xs ${severityConfig.bgColor} ${severityConfig.color}`}>
                    {severityConfig.label}
                  </Badge>
                  <Badge className={`text-xs ${statusConfig.bgColor} ${statusConfig.color}`}>
                    {statusConfig.label}
                  </Badge>
                </div>
                <div className="font-medium text-sm">{rule.name}</div>
                <div className="text-xs text-muted-foreground">{rule.cdeName}</div>
                
                {/* Quick Actions for Pending Rules */}
                {rule.status === 'pending' && (
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-green-600 border-green-300 hover:bg-green-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        onUpdateRuleStatus(rule.id, 'accepted')
                      }}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-blue-600 border-blue-300 hover:bg-blue-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        onUpdateRuleStatus(rule.id, 'modified')
                      }}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Modify
                    </Button>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm font-medium">{rule.threshold.value}%</div>
                <div className="text-xs text-muted-foreground">threshold</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Recipient Search Component
// ============================================================================

interface RecipientSearchProps {
  recipients: string[]
  onAddRecipient: (email: string) => void
  onRemoveRecipient: (email: string) => void
}

function RecipientSearch({ recipients, onAddRecipient, onRemoveRecipient }: RecipientSearchProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase()
    return AVAILABLE_USERS.filter(
      user => 
        !recipients.includes(user.email) &&
        (user.name.toLowerCase().includes(query) ||
         user.email.toLowerCase().includes(query) ||
         user.role.toLowerCase().includes(query))
    ).slice(0, 5)
  }, [searchQuery, recipients])

  const handleAddUser = (email: string) => {
    onAddRecipient(email)
    setSearchQuery('')
    setIsSearchOpen(false)
  }

  return (
    <div className="space-y-3">
      {/* Current Recipients */}
      <div className="flex flex-wrap gap-2">
        {recipients.map((email) => {
          const user = AVAILABLE_USERS.find(u => u.email === email)
          return (
            <div
              key={email}
              className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-sm"
            >
              <span className="truncate max-w-[180px]">
                {user?.name || email}
              </span>
              <button
                type="button"
                onClick={() => onRemoveRecipient(email)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search people to add..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setIsSearchOpen(true)
              }}
              onFocus={() => setIsSearchOpen(true)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Search Results Dropdown */}
        {isSearchOpen && filteredUsers.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
            {filteredUsers.map((user) => (
              <button
                key={user.email}
                type="button"
                onClick={() => handleAddUser(user.email)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                  {user.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{user.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
                <div className="text-xs text-muted-foreground">{user.role}</div>
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {/* No Results */}
        {isSearchOpen && searchQuery.trim() && filteredUsers.length === 0 && (
          <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg p-3 text-sm text-muted-foreground text-center">
            No users found matching "{searchQuery}"
          </div>
        )}
      </div>

      {/* Click outside to close */}
      {isSearchOpen && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setIsSearchOpen(false)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Schedule Configuration Component
// ============================================================================

interface ScheduleConfigProps {
  schedule: ActivationSchedule
  onUpdateSchedule: (updates: Partial<ActivationSchedule>) => void
}

function ScheduleConfig({ schedule, onUpdateSchedule }: ScheduleConfigProps) {
  return (
    <div className="space-y-4">
      {/* Frequency */}
      <div className="space-y-2">
        <Label>Execution Frequency</Label>
        <Select
          value={schedule.frequency}
          onValueChange={(value) => onUpdateSchedule({ 
            frequency: value as ActivationSchedule['frequency'] 
          })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="on_demand">On Demand</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Scheduled Time */}
      {schedule.frequency !== 'on_demand' && (
        <div className="space-y-2">
          <Label>Scheduled Time</Label>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Input
              type="time"
              value={schedule.scheduledTime}
              onChange={(e) => onUpdateSchedule({ scheduledTime: e.target.value })}
              className="w-32"
            />
          </div>
        </div>
      )}

      {/* Scheduled Days */}
      {schedule.frequency !== 'on_demand' && (
        <div className="space-y-2">
          <Label>Run on Days</Label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const isSelected = schedule.scheduledDays.includes(day.value)
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => {
                    const newDays = isSelected
                      ? schedule.scheduledDays.filter(d => d !== day.value)
                      : [...schedule.scheduledDays, day.value]
                    onUpdateSchedule({ scheduledDays: newDays })
                  }}
                  className={`w-10 h-10 rounded-full border-2 text-sm font-medium transition-colors ${
                    isSelected
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                  }`}
                  title={day.label}
                >
                  {day.shortLabel}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {schedule.scheduledDays.length === 0 
              ? 'Select at least one day'
              : schedule.scheduledDays.length === 7 
              ? 'Every day'
              : schedule.scheduledDays.length === 5 && 
                schedule.scheduledDays.includes('mon') && 
                schedule.scheduledDays.includes('tue') && 
                schedule.scheduledDays.includes('wed') && 
                schedule.scheduledDays.includes('thu') && 
                schedule.scheduledDays.includes('fri') &&
                !schedule.scheduledDays.includes('sat') &&
                !schedule.scheduledDays.includes('sun')
              ? 'Weekdays only'
              : `${schedule.scheduledDays.length} day${schedule.scheduledDays.length !== 1 ? 's' : ''} selected`
            }
          </p>
        </div>
      )}

      {/* Timezone */}
      <div className="space-y-2">
        <Label>Timezone</Label>
        <Select
          value={schedule.timezone}
          onValueChange={(value) => onUpdateSchedule({ timezone: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
            <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
            <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
            <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
            <SelectItem value="UTC">UTC</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Next Run */}
      <div className="bg-muted/50 rounded-lg p-3">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Next Run:</span>
          <span className="font-medium">
            {new Date(schedule.nextRunDate).toLocaleDateString()}{schedule.frequency !== 'on_demand' && ` at ${schedule.scheduledTime}`}
          </span>
        </div>
      </div>

      {/* Notifications */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="notify-failure"
            checked={schedule.notifyOnFailure}
            onCheckedChange={(checked) => onUpdateSchedule({ 
              notifyOnFailure: checked as boolean 
            })}
          />
          <Label htmlFor="notify-failure" className="cursor-pointer">
            Notify on rule failures
          </Label>
        </div>
        
        {schedule.notifyOnFailure && (
          <div className="ml-6 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bell className="h-4 w-4" />
              <span>Recipients:</span>
            </div>
            <RecipientSearch
              recipients={schedule.notificationRecipients}
              onAddRecipient={(email) => onUpdateSchedule({
                notificationRecipients: [...schedule.notificationRecipients, email]
              })}
              onRemoveRecipient={(email) => onUpdateSchedule({
                notificationRecipients: schedule.notificationRecipients.filter(e => e !== email)
              })}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Activation Confirmation Component
// ============================================================================

interface ActivationConfirmationDisplayProps {
  confirmation: ActivationConfirmation
  rules: DQRule[]
}

function ActivationConfirmationDisplay({ confirmation, rules }: ActivationConfirmationDisplayProps) {
  const activatedRules = rules.filter(r => confirmation.ruleIds.includes(r.id))

  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
          <CheckCircle className="h-5 w-5" />
          Rules Activated Successfully
        </div>
        <p className="text-sm text-green-600">
          {confirmation.ruleIds.length} rules have been activated and will run according to the configured schedule.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">
              {confirmation.ruleIds.length}
            </div>
            <div className="text-sm text-muted-foreground">Rules Activated</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-lg font-medium">
              {confirmation.schedule.frequency.charAt(0).toUpperCase() + confirmation.schedule.frequency.slice(1)}
            </div>
            <div className="text-sm text-muted-foreground">Execution Frequency</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activated Rules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {activatedRules.map(rule => (
              <div key={rule.id} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>{rule.name}</span>
                <Badge variant="outline" className="text-xs">
                  {DIMENSION_CONFIG[rule.dimension].label}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {confirmation.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Activation Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{confirmation.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function RuleActivationStep({
  rules,
  schedule,
  onUpdateSchedule,
  onActivate,
  onUpdateRuleStatus,
  activationConfirmation,
  onComplete,
}: RuleActivationStepProps) {
  // Only pre-select rules that are already accepted/modified
  const activatableRules = rules.filter(r => r.status === 'accepted' || r.status === 'modified')
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>(activatableRules.map(r => r.id))
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [activationNotes, setActivationNotes] = useState('')

  // Update selection when rules change (e.g., when a pending rule is accepted)
  const handleRuleStatusChange = (ruleId: string, status: DQRuleStatus) => {
    onUpdateRuleStatus(ruleId, status)
    // Auto-select newly accepted/modified rules
    if (status === 'accepted' || status === 'modified') {
      setSelectedRuleIds(prev => prev.includes(ruleId) ? prev : [...prev, ruleId])
    }
  }

  // Toggle rule selection
  const handleToggleRule = (ruleId: string) => {
    setSelectedRuleIds(prev => 
      prev.includes(ruleId) 
        ? prev.filter(id => id !== ruleId)
        : [...prev, ruleId]
    )
  }

  // Select all activatable rules
  const handleSelectAll = () => {
    setSelectedRuleIds(activatableRules.map(r => r.id))
  }

  // Deselect all rules
  const handleDeselectAll = () => {
    setSelectedRuleIds([])
  }

  // Open confirmation dialog
  const handleActivateClick = () => {
    setConfirmDialogOpen(true)
  }

  // Confirm activation
  const handleConfirmActivation = () => {
    onActivate(selectedRuleIds, activationNotes || undefined)
    setConfirmDialogOpen(false)
  }

  // If already activated, show confirmation
  if (activationConfirmation) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold">Rule Activation</h2>
          <p className="text-muted-foreground mt-1">
            Rules have been activated and scheduled for execution.
          </p>
        </div>

        <ActivationConfirmationDisplay 
          confirmation={activationConfirmation} 
          rules={rules}
        />

        {/* Complete Step Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onComplete}>
            Complete Data Quality Rules Phase
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Rule Activation</h2>
        <p className="text-muted-foreground mt-1">
          Select rules to activate and configure the execution schedule.
        </p>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-medium text-amber-800">Activation Confirmation Required</div>
          <p className="text-sm text-amber-700 mt-1">
            Once activated, these rules will run according to the configured schedule and may 
            create data quality issues for records that fail validation.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rule Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select Rules to Activate</CardTitle>
            <CardDescription>
              Choose which rules should be activated for execution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RuleSelectionList
              rules={rules}
              selectedRuleIds={selectedRuleIds}
              onToggleRule={handleToggleRule}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onUpdateRuleStatus={handleRuleStatusChange}
            />
          </CardContent>
        </Card>

        {/* Schedule Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Execution Schedule</CardTitle>
            <CardDescription>
              Configure when and how rules should be executed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduleConfig
              schedule={schedule}
              onUpdateSchedule={onUpdateSchedule}
            />
          </CardContent>
        </Card>
      </div>

      {/* Activation Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={handleActivateClick}
          disabled={selectedRuleIds.length === 0}
          className="bg-green-600 hover:bg-green-700"
        >
          <Play className="h-4 w-4 mr-2" />
          Activate {selectedRuleIds.length} Rule{selectedRuleIds.length !== 1 ? 's' : ''}
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Rule Activation</DialogTitle>
            <DialogDescription>
              You are about to activate {selectedRuleIds.length} data quality rule{selectedRuleIds.length !== 1 ? 's' : ''}.
              These rules will run {schedule.frequency} starting from the next scheduled time.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Rules to Activate</div>
                  <div className="font-medium">{selectedRuleIds.length}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Frequency</div>
                  <div className="font-medium capitalize">{schedule.frequency}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Next Run</div>
                  <div className="font-medium">
                    {new Date(schedule.nextRunDate).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Timezone</div>
                  <div className="font-medium">{schedule.timezone}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Activation Notes (Optional)</Label>
              <Textarea
                placeholder="Add any notes about this activation..."
                value={activationNotes}
                onChange={(e) => setActivationNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmActivation}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm Activation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RuleActivationStep
