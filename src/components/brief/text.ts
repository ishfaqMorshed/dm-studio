import type { PrintTextLine } from '../../lib/types'

/**
 * One text element per non-empty line, verbatim. The first line is tagged headline and the
 * rest sub; the designer re-tags them on the card if the hierarchy is different.
 */
export function splitPrintLines(raw: string): PrintTextLine[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, i) => ({ role: i === 0 ? 'headline' : 'sub', text }))
}

/** Local calendar date as `YYYY-MM-DD` (what `<input type="date">` speaks). */
export function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parses a Postgres timestamptz as it arrives through jsonb (`2026-09-16T10:00:00.123456+00:00`)
 * or as text (`2026-09-16 10:00:00.123456+00`). Returns null when unreadable.
 */
export function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  let s = value.trim().replace(' ', 'T')
  s = s.replace(/(\.\d{3})\d+/, '$1')
  s = s.replace(/([+-]\d{2})$/, '$1:00')
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? ms : null
}

export function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
