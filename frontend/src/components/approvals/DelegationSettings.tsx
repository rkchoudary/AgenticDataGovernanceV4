import { useState, useEffect } from 'react'
import {
  UserPlus,
  Calendar,
  Clock,
  AlertTriangle,
  Loader2,
  Save,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  useDelegationSettings,
  useUpdateDelegationSettings,
  type DelegationSettings as DelegationSettingsType,
} from '@/hooks/useApprovals'
import { cn } from '@/lib/utils'

interface DelegationSettingsProps {
  onClose?: () => void
}

export function DelegationSettings({ onClose }: DelegationSettingsProps) {
  const { data: settings, isLoading } = useDelegationSettings()
  const updateSettings = useUpdateDelegationSettings()

  const [formData, setFormData] = useState<DelegationSettingsType>({
    enabled: false,
    delegateTo: '',
    delegateToEmail: '',
    startDate: '',
    endDate: '',
    reason: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (settings) {
      setFormData(settings)
    }
  }, [settings])

  useEffect(() => {
    if (settings) {
      const changed =
        formData.enabled !== settings.enabled ||
        formData.delegateTo !== settings.delegateTo ||
        formData.startDate !== settings.startDate ||
        formData.endDate !== settings.endDate ||
        formData.reason !== settings.reason
      setHasChanges(changed)
    }
  }, [formData, settings])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (formData.enabled) {
      if (!formData.delegateTo?.trim()) {
        newErrors.delegateTo = 'Delegate name is required'
      }
      if (!formData.startDate) {
        newErrors.startDate = 'Start date is required'
      }
      if (!formData.endDate) {
        newErrors.endDate = 'End date is required'
      }
      if (formData.startDate && formData.endDate) {
        if (new Date(formData.startDate) > new Date(formData.endDate)) {
          newErrors.endDate = 'End date must be after start date'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return

    try {
      await updateSettings.mutateAsync(formData)
      setHasChanges(false)
    } catch (error) {
      setErrors({ submit: 'Failed to save settings. Please try again.' })
    }
  }

  const handleDisable = async () => {
    try {
      await updateSettings.mutateAsync({
        ...formData,
        enabled: false,
      })
      setFormData((prev) => ({ ...prev, enabled: false }))
      setHasChanges(false)
    } catch (error) {
      setErrors({ submit: 'Failed to disable delegation. Please try again.' })
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Out-of-Office Delegation
            </CardTitle>
            <CardDescription>
              Delegate your approval responsibilities while you're away
            </CardDescription>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div>
            <p className="font-medium">Enable Delegation</p>
            <p className="text-sm text-muted-foreground">
              Automatically route approval requests to your delegate
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {/* Delegation Form */}
        <div className={cn('space-y-4', !formData.enabled && 'opacity-50 pointer-events-none')}>
          {/* Delegate To */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Delegate To <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className={cn(
                'w-full px-4 py-2 border rounded-lg bg-background',
                errors.delegateTo && 'border-red-500'
              )}
              placeholder="Enter delegate's name"
              value={formData.delegateTo || ''}
              onChange={(e) => setFormData({ ...formData, delegateTo: e.target.value })}
            />
            {errors.delegateTo && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {errors.delegateTo}
              </p>
            )}
          </div>

          {/* Delegate Email */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Delegate Email</label>
            <input
              type="email"
              className="w-full px-4 py-2 border rounded-lg bg-background"
              placeholder="Enter delegate's email"
              value={formData.delegateToEmail || ''}
              onChange={(e) => setFormData({ ...formData, delegateToEmail: e.target.value })}
            />
          </div>

          {/* Date Range */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Start Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  className={cn(
                    'w-full pl-10 pr-4 py-2 border rounded-lg bg-background',
                    errors.startDate && 'border-red-500'
                  )}
                  value={formData.startDate || ''}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              {errors.startDate && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {errors.startDate}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                End Date <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  className={cn(
                    'w-full pl-10 pr-4 py-2 border rounded-lg bg-background',
                    errors.endDate && 'border-red-500'
                  )}
                  value={formData.endDate || ''}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
              {errors.endDate && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {errors.endDate}
                </p>
              )}
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (Optional)</label>
            <textarea
              className="w-full min-h-[80px] p-3 border rounded-lg bg-background resize-none"
              placeholder="e.g., Vacation, Conference, Medical leave..."
              value={formData.reason || ''}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            />
          </div>
        </div>

        {/* Current Status */}
        {settings?.enabled && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900">Delegation Active</p>
                <p className="text-sm text-blue-700">
                  Approvals are being routed to {settings.delegateTo}
                  {settings.startDate && settings.endDate && (
                    <> from {new Date(settings.startDate).toLocaleDateString()} to{' '}
                    {new Date(settings.endDate).toLocaleDateString()}</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {errors.submit}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t">
          {settings?.enabled && (
            <Button
              variant="outline"
              onClick={handleDisable}
              disabled={updateSettings.isPending}
              className="text-red-600 hover:text-red-700"
            >
              Disable Delegation
            </Button>
          )}
          <div className="flex gap-3 ml-auto">
            {onClose && (
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updateSettings.isPending}
            >
              {updateSettings.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default DelegationSettings
