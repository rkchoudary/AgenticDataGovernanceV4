import { useState } from 'react'
import { Bell, Mail, Webhook, Clock, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export type NotificationChannel = 'in_app' | 'email' | 'webhook'
export type DigestFrequency = 'realtime' | 'hourly' | 'daily' | 'weekly'

export interface ChannelSettings {
  enabled: boolean
  types: {
    critical: boolean
    warning: boolean
    info: boolean
  }
}

export interface QuietHours {
  enabled: boolean
  startTime: string // HH:mm format
  endTime: string // HH:mm format
  timezone: string
  allowCritical: boolean
}

export interface NotificationPreferencesData {
  channels: {
    in_app: ChannelSettings
    email: ChannelSettings
    webhook: ChannelSettings
  }
  digestFrequency: DigestFrequency
  quietHours: QuietHours
}

interface NotificationPreferencesProps {
  preferences: NotificationPreferencesData
  onSave: (preferences: NotificationPreferencesData) => void
  isSaving?: boolean
}

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

export function NotificationPreferences({
  preferences = defaultPreferences,
  onSave,
  isSaving = false,
}: NotificationPreferencesProps) {
  const [localPrefs, setLocalPrefs] = useState<NotificationPreferencesData>(preferences)

  const updateChannel = (
    channel: NotificationChannel,
    updates: Partial<ChannelSettings>
  ) => {
    setLocalPrefs((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: { ...prev.channels[channel], ...updates },
      },
    }))
  }

  const updateChannelType = (
    channel: NotificationChannel,
    type: 'critical' | 'warning' | 'info',
    enabled: boolean
  ) => {
    setLocalPrefs((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: {
          ...prev.channels[channel],
          types: { ...prev.channels[channel].types, [type]: enabled },
        },
      },
    }))
  }

  const updateQuietHours = (updates: Partial<QuietHours>) => {
    setLocalPrefs((prev) => ({
      ...prev,
      quietHours: { ...prev.quietHours, ...updates },
    }))
  }

  const handleSave = () => {
    onSave(localPrefs)
  }

  return (
    <div className="space-y-6">
      {/* Channel Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Channels
          </CardTitle>
          <CardDescription>
            Choose how you want to receive notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* In-App Notifications */}
          <ChannelRow
            icon={<Bell className="h-4 w-4" />}
            title="In-App Notifications"
            description="Toast messages and notification center"
            settings={localPrefs.channels.in_app}
            onToggle={(enabled) => updateChannel('in_app', { enabled })}
            onTypeToggle={(type, enabled) => updateChannelType('in_app', type, enabled)}
          />
          
          <Separator />
          
          {/* Email Notifications */}
          <ChannelRow
            icon={<Mail className="h-4 w-4" />}
            title="Email Notifications"
            description="Receive notifications via email"
            settings={localPrefs.channels.email}
            onToggle={(enabled) => updateChannel('email', { enabled })}
            onTypeToggle={(type, enabled) => updateChannelType('email', type, enabled)}
          />
          
          <Separator />
          
          {/* Webhook Notifications */}
          <ChannelRow
            icon={<Webhook className="h-4 w-4" />}
            title="Webhook Integrations"
            description="Send notifications to external services"
            settings={localPrefs.channels.webhook}
            onToggle={(enabled) => updateChannel('webhook', { enabled })}
            onTypeToggle={(type, enabled) => updateChannelType('webhook', type, enabled)}
          />
        </CardContent>
      </Card>

      {/* Email Digest Frequency */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Digest
          </CardTitle>
          <CardDescription>
            How often to receive email summaries
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(['realtime', 'hourly', 'daily', 'weekly'] as DigestFrequency[]).map((freq) => (
              <Button
                key={freq}
                variant={localPrefs.digestFrequency === freq ? 'default' : 'outline'}
                size="sm"
                onClick={() => setLocalPrefs((prev) => ({ ...prev, digestFrequency: freq }))}
              >
                {freq.charAt(0).toUpperCase() + freq.slice(1)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Quiet Hours
          </CardTitle>
          <CardDescription>
            Pause non-critical notifications during specific hours
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Enable Quiet Hours</span>
            <ToggleSwitch
              checked={localPrefs.quietHours.enabled}
              onChange={(enabled) => updateQuietHours({ enabled })}
            />
          </div>
          
          {localPrefs.quietHours.enabled && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Start Time</label>
                  <input
                    type="time"
                    value={localPrefs.quietHours.startTime}
                    onChange={(e) => updateQuietHours({ startTime: e.target.value })}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">End Time</label>
                  <input
                    type="time"
                    value={localPrefs.quietHours.endTime}
                    onChange={(e) => updateQuietHours({ endTime: e.target.value })}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">Allow Critical Alerts</span>
                  <p className="text-xs text-muted-foreground">
                    Critical notifications will still be delivered during quiet hours
                  </p>
                </div>
                <ToggleSwitch
                  checked={localPrefs.quietHours.allowCritical}
                  onChange={(allowCritical) => updateQuietHours({ allowCritical })}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  )
}

// Helper Components
interface ChannelRowProps {
  icon: React.ReactNode
  title: string
  description: string
  settings: ChannelSettings
  onToggle: (enabled: boolean) => void
  onTypeToggle: (type: 'critical' | 'warning' | 'info', enabled: boolean) => void
}

function ChannelRow({ icon, title, description, settings, onToggle, onTypeToggle }: ChannelRowProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-muted">{icon}</div>
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <ToggleSwitch checked={settings.enabled} onChange={onToggle} />
      </div>
      
      {settings.enabled && (
        <div className="ml-11 flex flex-wrap gap-2">
          <TypeBadge
            type="critical"
            enabled={settings.types.critical}
            onToggle={(enabled) => onTypeToggle('critical', enabled)}
          />
          <TypeBadge
            type="warning"
            enabled={settings.types.warning}
            onToggle={(enabled) => onTypeToggle('warning', enabled)}
          />
          <TypeBadge
            type="info"
            enabled={settings.types.info}
            onToggle={(enabled) => onTypeToggle('info', enabled)}
          />
        </div>
      )}
    </div>
  )
}

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleSwitch({ checked, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

interface TypeBadgeProps {
  type: 'critical' | 'warning' | 'info'
  enabled: boolean
  onToggle: (enabled: boolean) => void
}

function TypeBadge({ type, enabled, onToggle }: TypeBadgeProps) {
  const colors = {
    critical: enabled ? 'bg-red-100 text-red-700 border-red-200' : 'bg-muted text-muted-foreground',
    warning: enabled ? 'bg-yellow-100 text-yellow-700 border-yellow-200' : 'bg-muted text-muted-foreground',
    info: enabled ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-muted text-muted-foreground',
  }

  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className={cn(
        'px-2 py-1 text-xs rounded-md border transition-colors',
        colors[type]
      )}
    >
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </button>
  )
}
