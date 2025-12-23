import * as React from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { ToastContainer, NotificationTriggers } from '@/components/notifications'
import { useNotificationStore, useUIStore } from '@/stores'
import { ChatPanel } from '@/components/chat'
import { 
  MobileBottomNav, 
  useMobileDetect,
  PWAInstallPrompt,
  OfflineIndicator,
  UpdateAvailableBanner,
  NotificationPermissionPrompt,
} from '@/components/mobile'
import { cn } from '@/lib/utils'

export function MainLayout() {
  const { toasts, removeToast } = useNotificationStore()
  const { isMobile } = useMobileDetect()
  const { chatPanelOpen, setChatPanelOpen } = useUIStore()

  // Keyboard shortcut for chat panel (Cmd/Ctrl + K)
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setChatPanelOpen(!chatPanelOpen)
      }
      // Escape to close chat
      if (event.key === 'Escape' && chatPanelOpen) {
        setChatPanelOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [chatPanelOpen, setChatPanelOpen])

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

      {/* AI Chat Panel - Enhanced with more real estate and responsive design */}
      {chatPanelOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setChatPanelOpen(false)}
          />
          
          {/* Chat Panel */}
          <div className={cn(
            "fixed inset-y-0 right-0 z-50 border-l bg-background shadow-2xl",
            "animate-in slide-in-from-right duration-300",
            isMobile 
              ? "w-full" 
              : "w-full max-w-4xl"
          )}>
            <ChatPanel 
              className="h-full"
              onClose={() => setChatPanelOpen(false)}
              showSessionList={!isMobile}
              showReferencePanel={!isMobile}
            />
          </div>
        </>
      )}
    </div>
  )
}
