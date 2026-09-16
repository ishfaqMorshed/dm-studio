import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  /** One line under the title explaining what the dialog does. */
  description?: ReactNode
  children: ReactNode
  /** Action row; put the primary action last. */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** While a mutation runs: Escape, backdrop and the X do nothing. */
  closeDisabled?: boolean
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

/**
 * Accessible modal: role=dialog, labelled by its title, Escape/backdrop close,
 * Tab cycles inside the panel, focus returns to the opener on close.
 * Mark the element that should receive focus on open with `data-autofocus`.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', closeDisabled = false }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  // Refs so the focus effect only runs when the dialog opens, not on every render.
  const onCloseRef = useRef(onClose)
  const closeDisabledRef = useRef(closeDisabled)
  useEffect(() => {
    onCloseRef.current = onClose
    closeDisabledRef.current = closeDisabled
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusables = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
    const initial = focusables().find((el) => el.dataset.autofocus !== undefined) ?? focusables()[0]
    ;(initial ?? panel.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!closeDisabledRef.current) {
          e.preventDefault()
          onCloseRef.current()
        }
        return
      }
      if (e.key !== 'Tab') return
      const els = focusables()
      if (!els.length) {
        e.preventDefault()
        return
      }
      const i = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) {
        e.preventDefault()
        els[els.length - 1].focus()
      } else if (!e.shiftKey && i === els.length - 1) {
        e.preventDefault()
        els[0].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      opener?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px] sm:items-center dark:bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !closeDisabled) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-2xl border border-neutral-200 bg-white shadow-xl outline-none dark:border-neutral-800 dark:bg-neutral-900 ${SIZE[size]}`}
      >
        <div className="flex items-start gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold leading-tight">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-neutral-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-neutral-400 outline-none ring-neutral-900/10 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-4 disabled:opacity-40 dark:ring-white/20 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3 dark:border-neutral-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
