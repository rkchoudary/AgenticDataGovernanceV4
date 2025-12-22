import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NotificationPreferences, type NotificationPreferencesData } from '@/components/notifications'
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/useNotifications'
import { showSuccessToast, showCriticalToast } from '@/stores'

const defaultPreferences: NotificationPreferencesData = {
  channels: {
    in_app: { enabled: true, types: { critical: true, warning: true, info: true } },
    email: { enabled: true, types: { critical: true, warning: true, info: false } },
    webhook: { enabled: false, types: { critical: true, warning: false, info: false } },
  },
  digestFrequency: 'daily',
  quietHours: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    allowCritical: true,
  },
}

export function NotificationSettingsPage() {
  const navigate = useNavigate()
  const { data: preferences, isLoading } = useNotificationPreferences()
  const updatePreferences = useUpdateNotificationPreferences()

  const handleSave = async (newPreferences: NotificationPreferencesData) => {
    try {
      await updatePreferences.mutateAsync(newPreferences)
      showSuccessToast('Settings Saved', 'Your notification preferences have been updated.')
    } catch (error) {
      showCriticalToast('Error', 'Failed to save notification preferences. Please try again.')
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/notifications')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Notification Settings</h1>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Loading preferences...</p>
        </div>
      ) : (
        <NotificationPreferences
          preferences={preferences || defaultPreferences}
          onSave={handleSave}
          isSaving={updatePreferences.isPending}
        />
      )}
    </div>
  )
}
