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
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useUIStore } from '@/stores'

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: FileText, label: 'Report Cycles', href: '/cycles' },
  { icon: Database, label: 'CDEs', href: '/cdes' },
  { icon: AlertTriangle, label: 'Issues', href: '/issues' },
  { icon: CheckSquare, label: 'Approvals', href: '/approvals' },
  { icon: GitBranch, label: 'Lineage', href: '/lineage' },
]

const bottomNavItems = [
  { icon: Settings, label: 'Settings', href: '/settings' },
  { icon: HelpCircle, label: 'Help', href: '/help' },
]

export function MobileNav() {
  const location = useLocation()
  const { mobileNavOpen, setMobileNavOpen } = useUIStore()

  if (!mobileNavOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden"
        onClick={() => setMobileNavOpen(false)}
      />

      {/* Drawer */}
      <aside className="fixed inset-y-0 left-0 z-50 w-72 border-r bg-background md:hidden">
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          <span className="text-lg font-semibold">Data Governance</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="h-[calc(100vh-4rem)]">
          <nav className="space-y-1 p-4">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          <Separator className="my-4" />

          <nav className="space-y-1 p-4">
            {bottomNavItems.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setMobileNavOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </ScrollArea>
      </aside>
    </>
  )
}
