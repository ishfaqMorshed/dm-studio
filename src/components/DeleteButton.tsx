import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Loader2, Trash2 } from 'lucide-react'

const CONFIRM_MS = 4000

interface Props {
  onConfirm: () => void | Promise<void>
  disabled?: boolean
  /** Shown as tooltip when disabled. */
  disabledReason?: string
  /** Icon-only (tile) or labelled (panel action). */
  variant?: 'icon' | 'button'
  label?: string
  ariaLabel?: string
  className?: string
}

/**
 * Trash button with a lightweight inline confirm: first click arms it
 * ("Confirm delete?") for 4 s, second click fires onConfirm.
 */
export function DeleteButton({
  onConfirm,
  disabled,
  disabledReason,
  variant = 'icon',
  label = 'Delete',
  ariaLabel,
  className = '',
}: Props) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!armed) return
    timer.current = window.setTimeout(() => setArmed(false), CONFIRM_MS)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [armed])

  const click = async (e: MouseEvent) => {
    e.stopPropagation()
    if (disabled || busy) return
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  const armedCls = armed
    ? 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/50'
    : 'border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800'

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={click}
        disabled={disabled || busy}
        title={disabled ? disabledReason : armed ? 'Click again to delete' : label}
        aria-label={armed ? 'Confirm delete' : (ariaLabel ?? label)}
        className={`inline-flex shrink-0 items-center gap-1 rounded-lg border text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
          armed ? 'px-1.5 py-1' : 'p-1.5'
        } ${armedCls} ${className}`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {armed && <span className="whitespace-nowrap">Confirm?</span>}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={click}
      disabled={disabled || busy}
      title={disabled ? disabledReason : undefined}
      aria-label={armed ? 'Confirm delete' : (ariaLabel ?? label)}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${armedCls} ${className}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      {armed ? 'Confirm delete?' : label}
    </button>
  )
}
