import { ageLabel } from '../../lib/stage'

/** Fallback when settings.n8n_base_url is empty; the SOP's instance. */
export const DEFAULT_N8N_BASE = 'https://n8n.srv1202488.hstgr.cloud'

/** `settings.per_card_price_usd` is numeric in Postgres; it may arrive as a number or a string. */
export function formatUsd(v: unknown): string | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN
  if (!Number.isFinite(n)) return null
  return `$${n.toFixed(2)}`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** `YYYY-MM-DD` (date columns) or a full timestamp. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

export function isPastDate(yyyyMmDd: string | null | undefined, now: number = Date.now()): boolean {
  if (!yyyyMmDd) return false
  const end = new Date(`${yyyyMmDd.slice(0, 10)}T23:59:59`)
  return !Number.isNaN(end.getTime()) && end.getTime() < now
}

/** "4 min ago" for timestamps; uses the shared ageLabel buckets. */
export function agoLabel(ts: string | null | undefined, now: number): string {
  if (!ts) return '—'
  return `${ageLabel(ts, now)} ago`
}

export function n8nExecutionUrl(base: string | null | undefined, executionId: string | null | undefined): string | null {
  if (!executionId) return null
  const root = (base && base.trim() ? base.trim() : DEFAULT_N8N_BASE).replace(/\/+$/, '')
  return `${root}/executions/${encodeURIComponent(executionId)}`
}

export function shortId(id: string): string {
  return id.slice(0, 8)
}

export function formatPct(v: number | null | undefined): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return `${v.toFixed(v < 10 ? 1 : 0)} %`
}
