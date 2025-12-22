import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { ToastContainer, NotificationTriggers } from '@/components/notifications'
import { useNotificationStore } from '@/stores'
import { 
  MobileBottomNav, 
  useMobileDetect,
  PWAInstallPrompt,
  OfflineIndicator,
  UpdateAvailableBanner,
  NotificationPermissionPrompt,
} from '@/components/mobile'

export function MainLayout() {
  const { toasts, removeToast } = useNotificationStore()
  const { isMobile } = useMobileDetect()

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Offline indicator */}
      <OfflineIndicator />

      {/* Sidebar - hidden on mobile */}
      <Sidebar />

      {/* Mobile navigation drawer */}
      <MobileNav />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className={`flex-1 overflow-auto bg-muted/30 ${isMobile ? 'pb-16' : ''}`}>
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <MobileBottomNav pendingApprovals={0} openIssues={0} />

      {/* PWA prompts */}
      <PWAInstallPrompt />
      <UpdateAvailableBanner />
      <NotificationPermissionPrompt />

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Notification triggers (headless component for real-time updates) */}
      <NotificationTriggers enabled />
    </div>
  )
}
