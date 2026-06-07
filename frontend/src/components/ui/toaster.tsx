import { useEffect, useState, useCallback } from 'react'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'
import { generateId } from '@/lib/utils'

interface ToastItem {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
}

let toastListeners: Array<(toasts: ToastItem[]) => void> = []
let toastQueue: ToastItem[] = []

export function toast(item: Omit<ToastItem, 'id'>) {
  const newToast = { ...item, id: generateId() }
  toastQueue = [...toastQueue, newToast]
  toastListeners.forEach((l) => l([...toastQueue]))
  setTimeout(() => {
    toastQueue = toastQueue.filter((t) => t.id !== newToast.id)
    toastListeners.forEach((l) => l([...toastQueue]))
  }, 4000)
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const listener = useCallback((next: ToastItem[]) => setToasts(next), [])

  useEffect(() => {
    toastListeners.push(listener)
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener)
    }
  }, [listener])

  return (
    <ToastProvider>
      {toasts.map((t) => (
        <Toast key={t.id} variant={t.variant}>
          <div className="grid gap-1">
            {t.title && <ToastTitle>{t.title}</ToastTitle>}
            {t.description && <ToastDescription>{t.description}</ToastDescription>}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
