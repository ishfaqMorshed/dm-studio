import { createContext, useContext } from 'react'

export type ToastKind = 'error' | 'success' | 'info'

export interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void
  error: (message: string) => void
  success: (message: string) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

/** Toast API. Must be used inside `<ToastProvider>` (App does this). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
