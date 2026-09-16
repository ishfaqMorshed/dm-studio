import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** Centered dialog: Escape and the backdrop close it, focus lands on the first field. */
export function Modal({ title, description, onClose, children, footer }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    const first = panel.current?.querySelector<HTMLElement>(
      'input:not([readonly]), textarea, select, button:not([data-modal-close])',
    )
    first?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-neutral-900/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="flex max-h-full w-full max-w-2xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="flex items-start gap-3 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-xs text-neutral-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            data-modal-close
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-neutral-400 outline-none ring-neutral-900/10 hover:text-neutral-700 focus-visible:ring-4 dark:ring-white/20 dark:hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
