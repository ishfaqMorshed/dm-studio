import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

type ToastKind = 'error' | 'success' | 'info'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void
  error: (message: string) => void
  success: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

const ICON: Record<ToastKind, ReactNode> = {
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  info: <Info className="h-4 w-4 text-blue-500" />,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-4), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      error: (m) => toast(m, 'error'),
      success: (m) => toast(m, 'success'),
    }),
    [toast],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          >
            <span className="mt-0.5 shrink-0">{ICON[t.kind]}</span>
            <span className="flex-1 break-words">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
