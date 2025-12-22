import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useNotifications, useUnreadCount, useMarkAsRead, useMarkAllAsRead } from '@/hooks/useNotifications'
import { NotificationItem } from './NotificationItem'
import { cn } from '@/lib/utils'

interface NotificationCenterProps {
  onOpenPreferences?: () => void
}

export function NotificationCenter({ onOpenPreferences }: NotificationCenterProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  
  const { data: notificationsData, isLoading } = useNotifications()
  const { data: unreadCount = 0 } = useUnreadCount()
  const markAsRead = useMarkAsRead()
  const markAllAsRead = useMarkAllAsRead()

  const notifications = notificationsData?.items || []

  const handleMarkAsRead = (id: string) => {
    markAsRead.mutate(id)
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate()
  }

  const handleNavigate = (url: string) => {
    setOpen(false)
    navigate(url)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className={cn(
              'absolute -top-0.5 -right-0.5 flex items-center justify-center',
              'min-w-[18px] h-[18px] px-1 rounded-full',
              'bg-destructive text-destructive-foreground text-xs font-medium'
            )}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          <span className="sr-only">
            Notifications {unreadCount > 0 && `(${unreadCount} unread)`}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleMarkAllAsRead}
                disabled={markAllAsRead.isPending}
              >
                <Check className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
            {onOpenPreferences && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setOpen(false)
                  onOpenPreferences()
                }}
              >
                <Settings className="h-3.5 w-3.5" />
                <span className="sr-only">Notification settings</span>
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8">
              <Bell className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          )}
        </ScrollArea>
        
        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => {
                  setOpen(false)
                  navigate('/notifications')
                }}
              >
                View all notifications
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
