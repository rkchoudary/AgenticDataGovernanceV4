import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  AlertTriangle,
  CheckSquare,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMobileDetect } from './useMobileDetect'

interface NavItem {
  icon: React.ElementType
  label: string
  href: string
  badge?: number
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Home', href: '/' },
  { icon: FileText, label: 'Cycles', href: '/cycles' },
  { icon: AlertTriangle, label: 'Issues', href: '/issues' },
  { icon: CheckSquare, label: 'Approvals', href: '/approvals' },
  { icon: MoreHorizontal, label: 'More', href: '/more' },
]

interface MobileBottomNavProps {
  pendingApprovals?: number
  openIssues?: number
}

/**
 * MobileBottomNav - Fixed bottom navigation bar for mobile devices
 * Provides quick access to main sections with badge support
 */
export function MobileBottomNav({ pendingApprovals = 0, openIssues = 0 }: MobileBottomNavProps) {
  const location = useLocation()
  const { isMobile } = useMobileDetect()

  // Only show on mobile devices
  if (!isMobile) return null

  const getBadge = (href: string): number | undefined => {
    if (href === '/approvals' && pendingApprovals > 0) return pendingApprovals
    if (href === '/issues' && openIssues > 0) return openIssues
    return undefined
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-inset-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href || 
            (item.href !== '/' && location.pathname.startsWith(item.href))
          const badge = getBadge(item.href)

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full',
                'touch-manipulation transition-colors',
                'min-w-[64px] py-2',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="relative">
                <item.icon className={cn('h-6 w-6', isActive && 'stroke-[2.5px]')} />
                {badge !== undefined && badge > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className={cn(
                'text-[10px] mt-1 font-medium',
                isActive && 'font-semibold'
              )}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
