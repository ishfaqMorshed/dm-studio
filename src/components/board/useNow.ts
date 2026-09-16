import { useEffect, useState } from 'react'

/** A timestamp that ticks every `intervalMs`, so age labels stay fresh without re-parsing dates. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}
