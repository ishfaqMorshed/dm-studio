/**
 * Presentational primitives for the card page: Panel, Badge, Field, Spinner,
 * CopyButton and an accessible modal Dialog (focus trap, Escape, backdrop click).
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Loader2, X } from 'lucide-react'
import { useToast } from '../../lib/useToast'
import { btnGhost, panelCls } from './styles'

type Tone = 'neutral' | 'good' | 'bad' | 'warn'

const TONE_CLASS: Record<Tone, string> = {
  neutral: '',
  good: 'border-emerald-300 dark:border-emerald-800',
  bad: 'border-red-300 dark:border-red-800',
  warn: 'border-amber-300 dark:border-amber-800',
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
  bodyClassName = 'px-4 pb-4',
  tone = 'neutral',
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  tone?: Tone
}) {
  return (
    <section className={`${panelCls} ${TONE_CLASS[tone]} ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

export function Badge({ children, className = '', title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${className}`}
    >
      {children}
    </span>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden="true" />
}

/** Label + control. Use `as="div"` for groups of controls (a label may only wrap one). */
export function Field({
  label,
  hint,
  children,
  as = 'label',
  className = '',
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  as?: 'label' | 'div'
  className?: string
}) {
  const Tag = as
  return (
    <Tag className={`block text-sm ${className}`}>
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-right text-xs text-neutral-500">{hint}</span>}
      </span>
      {children}
    </Tag>
  )
}

export function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const toast = useToast()
  const [done, setDone] = useState(false)
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      window.setTimeout(() => setDone(false), 1500)
    } catch {
      toast.error('The browser blocked the clipboard. Select the text and copy it by hand.')
    }
  }, [text, toast])
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={label}
      aria-label={done ? 'Copied' : label}
      className={`${btnGhost} ${className}`}
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog. Focus moves to the element with `data-autofocus` (else the first
 * control), Tab cycles inside, Escape and a backdrop click call `onClose`, and
 * focus returns to the opener when it closes.
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = panelRef.current
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    const initial = focusables().find((el) => el.hasAttribute('data-autofocus')) ?? focusables()[0] ?? root
    initial?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (!list.length) {
        e.preventDefault()
        return
      }
      const idx = list.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && idx <= 0) {
        e.preventDefault()
        list[list.length - 1].focus()
      } else if (!e.shiftKey && idx === list.length - 1) {
        e.preventDefault()
        list[0].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus()
    }
  }, [open])

  if (!open) return null

  const width = size === 'xl' ? 'sm:max-w-4xl' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-neutral-950/50 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[95vh] w-full flex-col rounded-t-2xl border border-neutral-200 bg-white shadow-xl outline-none sm:rounded-2xl dark:border-neutral-800 dark:bg-neutral-900 ${width}`}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={btnGhost}>
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
    </div>,
    document.body,
  )
}
