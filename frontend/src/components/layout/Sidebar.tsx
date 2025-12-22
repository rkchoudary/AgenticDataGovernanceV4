import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Database,
  AlertTriangle,
  CheckSquare,
  GitBranch,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Palette,
  Users,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUIStore } from '@/stores'
import { TenantLogo, PlatformBranding } from '@/components/branding'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/', tourId: 'nav-dashboard' },
  { icon: FileText, label: 'Report Cycles', href: '/cycles', tourId: 'nav-cycles' },
  { icon: Database, label: 'CDEs', href: '/cdes', tourId: 'nav-cdes' },
  { icon: AlertTriangle, label: 'Issues', href: '/issues', tourId: 'nav-issues' },
  { icon: CheckSquare, label: 'Approvals', href: '/approvals', tourId: 'nav-approvals' },
  { icon: GitBranch, label: 'Lineage', href: '/lineage', tourId: 'nav-lineage' },
]

const settingsItems = [
  { icon: Users, label: 'Users', href: '/users' },
  { icon: Bell, label: 'Notifications', href: '/notifications/settings' },
  { icon: Palette, label: 'Branding', href: '/settings/branding' },
]

const bottomNavItems = [
  { icon: Settings, label: 'Settings', href: '/settings', tourId: 'nav-settings' },
  { icon: HelpCircle, label: 'Help', href: '/help', tourId: 'help-button' },
]

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore()

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col border-r bg-card transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-4">
          {sidebarCollapsed ? (
            <TenantLogo className="h-8 w-8 mx-auto" fallbackText="DG" />
          ) : (
            <div className="flex items-center gap-2">
              <TenantLogo className="h-8 w-8" fallbackText="DG" />
              <span className="text-lg font-semibold">Data Governance</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn('ml-auto', sidebarCollapsed && 'hidden')}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-1 px-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href
              const NavLink = (
                <Link
                  key={item.href}
                  to={item.href}
                  data-tour={item.tourId}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    sidebarCollapsed && 'justify-center px-2'
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              )

              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                )
              }

              return NavLink
            })}
          </nav>
        </ScrollArea>

        {/* Settings Navigation */}
        <div className="border-t py-4">
          {!sidebarCollapsed && (
            <p className="px-4 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Settings
            </p>
          )}
          <nav className="space-y-1 px-2">
            {settingsItems.map((item) => {
              const isActive = location.pathname === item.href
              const NavLink = (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    sidebarCollapsed && 'justify-center px-2'
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              )

              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                )
              }

              return NavLink
            })}
          </nav>
        </div>

        {/* Bottom Navigation */}
        <div className="border-t py-4">
          <nav className="space-y-1 px-2">
            {bottomNavItems.map((item) => {
              const isActive = location.pathname === item.href
              const NavLink = (
                <Link
                  key={item.href}
                  to={item.href}
                  data-tour={item.tourId}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    sidebarCollapsed && 'justify-center px-2'
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              )

              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                )
              }

              return NavLink
            })}
          </nav>
        </div>

        {/* Platform Branding */}
        {!sidebarCollapsed && (
          <PlatformBranding className="px-4 py-3 border-t text-center" />
        )}
      </aside>
  )
}
