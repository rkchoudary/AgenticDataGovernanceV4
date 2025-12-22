import { Link } from 'react-router-dom'
import {
  Database,
  GitBranch,
  Settings,
  HelpCircle,
  Users,
  Bell,
  Palette,
  Download,
  Smartphone,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TouchCard, useMobileDetect } from '@/components/mobile'
import { usePWA } from '@/hooks/usePWA'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuthStore } from '@/stores'

interface MenuItem {
  icon: React.ElementType
  label: string
  description?: string
  href?: string
  onClick?: () => void
  badge?: string
  color?: string
}

const mainMenuItems: MenuItem[] = [
  {
    icon: Database,
    label: 'CDEs',
    description: 'Critical Data Elements',
    href: '/cdes',
  },
  {
    icon: GitBranch,
    label: 'Lineage',
    description: 'Data lineage explorer',
    href: '/lineage',
  },
]

const settingsMenuItems: MenuItem[] = [
  {
    icon: Users,
    label: 'Users',
    description: 'Manage team members',
    href: '/users',
  },
  {
    icon: Bell,
    label: 'Notifications',
    description: 'Notification preferences',
    href: '/notifications/settings',
  },
  {
    icon: Palette,
    label: 'Branding',
    description: 'Customize appearance',
    href: '/settings/branding',
  },
  {
    icon: Settings,
    label: 'Settings',
    description: 'App settings',
    href: '/settings',
  },
]

const supportMenuItems: MenuItem[] = [
  {
    icon: HelpCircle,
    label: 'Help & Support',
    description: 'Get help and documentation',
    href: '/help',
  },
]

/**
 * MorePage - Mobile-only page showing additional navigation options
 */
export function MorePage() {
  const { isMobile } = useMobileDetect()
  const { user, logout } = useAuthStore()
  const { isInstallable, isInstalled, install, notificationPermission, requestNotificationPermission } = usePWA()

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U'

  const handleInstall = async () => {
    await install()
  }

  const handleEnableNotifications = async () => {
    await requestNotificationPermission()
  }

  // Redirect to dashboard on desktop
  if (!isMobile) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          This page is only available on mobile devices.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 pb-20 space-y-6">
      {/* User Profile Card */}
      <TouchCard variant="elevated" className="p-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarImage src={user?.avatarUrl} alt={user?.name || 'User'} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-lg truncate">{user?.name || 'User'}</h2>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{user?.role || 'Member'}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </TouchCard>

      {/* App Actions */}
      {(isInstallable || notificationPermission === 'default') && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground px-1">Quick Actions</h3>
          <div className="space-y-2">
            {isInstallable && !isInstalled && (
              <TouchCard onTap={handleInstall} variant="outlined">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Download className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Install App</p>
                    <p className="text-sm text-muted-foreground">Add to home screen</p>
                  </div>
                  <span className="px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                    New
                  </span>
                </div>
              </TouchCard>
            )}
            
            {notificationPermission === 'default' && (
              <TouchCard onTap={handleEnableNotifications} variant="outlined">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Enable Notifications</p>
                    <p className="text-sm text-muted-foreground">Stay updated on approvals</p>
                  </div>
                </div>
              </TouchCard>
            )}
          </div>
        </div>
      )}

      {/* Main Navigation */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground px-1">Navigation</h3>
        <div className="space-y-2">
          {mainMenuItems.map((item) => (
            <MenuItemCard key={item.label} item={item} />
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground px-1">Settings</h3>
        <div className="space-y-2">
          {settingsMenuItems.map((item) => (
            <MenuItemCard key={item.label} item={item} />
          ))}
        </div>
      </div>

      {/* Support */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground px-1">Support</h3>
        <div className="space-y-2">
          {supportMenuItems.map((item) => (
            <MenuItemCard key={item.label} item={item} />
          ))}
        </div>
      </div>

      {/* Logout */}
      <TouchCard
        onTap={logout}
        variant="outlined"
        className="border-red-200 dark:border-red-900/50"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <LogOut className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-red-600 dark:text-red-400">Sign Out</p>
          </div>
        </div>
      </TouchCard>

      {/* App Info */}
      <div className="text-center text-xs text-muted-foreground pt-4">
        <p>Data Governance Platform v1.0.0</p>
        {isInstalled && (
          <p className="flex items-center justify-center gap-1 mt-1">
            <Smartphone className="h-3 w-3" />
            Installed as app
          </p>
        )}
      </div>
    </div>
  )
}

function MenuItemCard({ item }: { item: MenuItem }) {
  const content = (
    <div className="flex items-center gap-3">
      <div className={cn(
        'w-10 h-10 rounded-lg flex items-center justify-center',
        item.color || 'bg-muted'
      )}>
        <item.icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{item.label}</p>
        {item.description && (
          <p className="text-sm text-muted-foreground truncate">{item.description}</p>
        )}
      </div>
      {item.badge && (
        <span className="px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
          {item.badge}
        </span>
      )}
      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    </div>
  )

  if (item.href) {
    return (
      <Link to={item.href}>
        <TouchCard variant="outlined">{content}</TouchCard>
      </Link>
    )
  }

  return (
    <TouchCard variant="outlined" onTap={item.onClick}>
      {content}
    </TouchCard>
  )
}

export default MorePage
