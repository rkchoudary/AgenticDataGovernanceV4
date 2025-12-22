import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Settings, Check, Trash2, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  useNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useDismissNotification,
  useDismissAllNotifications,
} from '@/hooks/useNotifications'
import { NotificationItem } from '@/components/notifications'
import { cn } from '@/lib/utils'

type FilterType = 'all' | 'unread' | 'critical' | 'warning' | 'info'

export function NotificationsPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<FilterType>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: notificationsData, isLoading } = useNotifications()
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()
  const dismissNotification = useDismissNotification()
  const dismissAll = useDismissAllNotifications()

  const notifications = notificationsData?.items || []

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'all') return true
    if (filter === 'unread') return !n.read
    return n.type === filter
  })

  const unreadCount = notifications.filter((n) => !n.read).length

  const handleMarkAsRead = (id: string) => {
    markAsRead.mutate(id)
  }

  const handleNavigate = (url: string) => {
    navigate(url)
  }

  const handleSelectAll = () => {
    if (selectedIds.size === filteredNotifications.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredNotifications.map((n) => n.id)))
    }
  }

  const handleBulkMarkAsRead = () => {
    selectedIds.forEach((id) => markAsRead.mutate(id))
    setSelectedIds(new Set())
  }

  const handleBulkDismiss = () => {
    selectedIds.forEach((id) => dismissNotification.mutate(id))
    setSelectedIds(new Set())
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Notifications</h1>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-destructive text-destructive-foreground rounded-full">
              {unreadCount} unread
            </span>
          )}
        </div>
        <Button variant="outline" onClick={() => navigate('/notifications/settings')}>
          <Settings className="h-4 w-4 mr-2" />
          Preferences
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-1">
                {(['all', 'unread', 'critical', 'warning', 'info'] as FilterType[]).map((f) => (
                  <Button
                    key={f}
                    variant={filter === f ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setFilter(f)}
                    className="h-7 text-xs"
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBulkMarkAsRead}
                    className="h-7 text-xs"
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Mark as Read ({selectedIds.size})
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBulkDismiss}
                    className="h-7 text-xs text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Dismiss ({selectedIds.size})
                  </Button>
                </>
              ) : (
                <>
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAllAsRead.mutate()}
                      disabled={markAllAsRead.isPending}
                      className="h-7 text-xs"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Mark All Read
                    </Button>
                  )}
                  {notifications.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dismissAll.mutate()}
                      disabled={dismissAll.isPending}
                      className="h-7 text-xs text-destructive"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Clear All
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Loading notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Bell className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {filter === 'all' ? 'No notifications' : `No ${filter} notifications`}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="divide-y">
                {/* Select All Row */}
                <div className="flex items-center gap-3 px-4 py-2 bg-muted/30">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredNotifications.length && filteredNotifications.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size > 0
                      ? `${selectedIds.size} selected`
                      : `${filteredNotifications.length} notifications`}
                  </span>
                </div>
                
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3',
                      selectedIds.has(notification.id) && 'bg-muted/50'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(notification.id)}
                      onChange={() => toggleSelect(notification.id)}
                      className="h-4 w-4 rounded border-gray-300 mt-1"
                    />
                    <div className="flex-1">
                      <NotificationItem
                        notification={notification}
                        onMarkAsRead={handleMarkAsRead}
                        onNavigate={handleNavigate}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
