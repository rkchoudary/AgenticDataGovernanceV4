import { NotificationToast, ToastNotification } from './NotificationToast'

interface ToastContainerProps {
  toasts: ToastNotification[]
  onDismiss: (id: string) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col gap-2"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <NotificationToast
          key={toast.id}
          notification={toast}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}
