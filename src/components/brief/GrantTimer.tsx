import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface Props {
  /** Epoch ms when the upload window closes; null hides the timer. */
  expiresAt: number | null
}

function remainingLabel(ms: number): string {
  if (ms <= 0) return '0 s'
  if (ms >= 60_000) {
    const m = Math.ceil(ms / 60_000)
    return `${m} min`
  }
  return `${Math.ceil(ms / 1000)} s`
}

/** Countdown to the end of the upload window. Ticks on its own so the form does not re-render. */
export function GrantTimer({ expiresAt }: Props) {
  const [label, setLabel] = useState(() => (expiresAt === null ? '' : remainingLabel(expiresAt - Date.now())))
  const [urgent, setUrgent] = useState(false)

  useEffect(() => {
    if (expiresAt === null) return
    const tick = () => {
      const ms = expiresAt - Date.now()
      setLabel(remainingLabel(ms))
      setUrgent(ms < 2 * 60_000)
      if (ms <= 0) window.clearInterval(id)
    }
    const id = window.setInterval(tick, 1000)
    tick()
    return () => window.clearInterval(id)
  }, [expiresAt])

  if (expiresAt === null) return null
  return (
    <p
      className={`flex items-center gap-1.5 text-xs ${
        urgent ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-neutral-500'
      }`}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Send within {label}. If time runs out you can start again without retyping anything.
      </span>
    </p>
  )
}
