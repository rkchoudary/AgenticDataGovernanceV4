import { create } from 'zustand'
import type { ToastNotification, ToastType } from '@/components/notifications/NotificationToast'

interface NotificationState {
  toasts: ToastNotification[]
  addToast: (toast: Omit<ToastNotification, 'id'>) => string
  removeToast: (id: string) => void
  clearAllToasts: () => void
}

let toastId = 0

export const useNotificationStore = create<NotificationState>((set) => ({
  toasts: [],
  
  addToast: (toast) => {
    const id = `toast-${++toastId}`
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }))
    return id
  },
  
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },
  
  clearAllToasts: () => {
    set({ toasts: [] })
  },
}))

// Helper functions for common toast types
export function showToast(
  type: ToastType,
  title: string,
  message: string,
  options?: Partial<Omit<ToastNotification, 'id' | 'type' | 'title' | 'message'>>
) {
  return useNotificationStore.getState().addToast({
    type,
    title,
    message,
    ...options,
  })
}

export function showInfoToast(title: string, message: string, options?: Partial<ToastNotification>) {
  return showToast('info', title, message, options)
}

export function showWarningToast(title: string, message: string, options?: Partial<ToastNotification>) {
  return showToast('warning', title, message, options)
}

export function showCriticalToast(title: string, message: string, options?: Partial<ToastNotification>) {
  return showToast('critical', title, message, { duration: 0, ...options }) // Critical toasts don't auto-dismiss
}

export function showSuccessToast(title: string, message: string, options?: Partial<ToastNotification>) {
  return showToast('success', title, message, options)
}

export function dismissToast(id: string) {
  useNotificationStore.getState().removeToast(id)
}
