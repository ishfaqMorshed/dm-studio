import { useEffect, useState } from 'react'

/** A ticking timestamp so "in review for 4 min" labels stay fresh without re-parsing dates. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}
