import { safeFileName } from '../../lib/download'
import { firstPrintLine, parseFinalMetrics, type Card, type FinJob, type FinalMetrics } from '../../lib/types'

/**
 * A delivered card as CompletedPage loads it. The joins are optional because a
 * realtime payload carries the bare `cards` row until the debounced refetch lands.
 */
export interface DeliveredCard extends Card {
  clients?: { name: string } | null
  fin_jobs?: FinJob[] | null
  current_generation?: { image_path: string | null } | null
}

type DoneJob = FinJob & { final_path: string }

function isDone(job: FinJob): job is DoneJob {
  return job.status === 'done' && typeof job.final_path === 'string' && job.final_path.length > 0
}

function ts(v: string | null | undefined): number {
  if (!v) return 0
  const t = Date.parse(v)
  return Number.isNaN(t) ? 0 : t
}

export interface FinalInfo {
  job: DoneJob
  /** finals bucket path: `<card_id>/<generation_id>-final.png` */
  path: string
  metrics: FinalMetrics
}

/**
 * The finisher job whose PNG the designer should get: status done with a final_path,
 * preferring the card's current generation, then the most recently finished.
 */
export function pickFinal(card: DeliveredCard): FinalInfo | null {
  const done = (card.fin_jobs ?? []).filter(isDone)
  if (!done.length) return null
  done.sort((a, b) => {
    const aCurrent = a.generation_id === card.current_generation_id ? 1 : 0
    const bCurrent = b.generation_id === card.current_generation_id ? 1 : 0
    if (aCurrent !== bCurrent) return bCurrent - aCurrent
    return ts(b.finished_at ?? b.created_at) - ts(a.finished_at ?? a.created_at)
  })
  const job = done[0]
  return { job, path: job.final_path, metrics: parseFinalMetrics(job.metrics) }
}

export function clientName(card: DeliveredCard): string {
  const name = card.clients?.name?.trim()
  return name || 'Unknown client'
}

/** First print line, else the start of the brief, else a placeholder. */
export function cardTitle(card: DeliveredCard): string {
  const line = firstPrintLine(card.print_text)?.trim()
  if (line) return line
  const brief = (card.brief_text ?? '').replace(/\s+/g, ' ').trim()
  if (!brief) return 'Untitled design'
  return brief.length > 60 ? `${brief.slice(0, 57)}…` : brief
}

export function shortId(id: string): string {
  return id.slice(0, 8)
}

/** `<client> - <title> - <id8>.png`: readable on disk, unique per card. */
export function finalFileName(card: DeliveredCard): string {
  const base = `${clientName(card)} - ${cardTitle(card)} - ${shortId(card.id)}`
  return `${safeFileName(base, card.id)}.png`
}

/** "2400×3000 px · 300 DPI · transparent" */
export function metricsLabel(m: FinalMetrics): string {
  const parts: string[] = []
  if (m.w && m.h) parts.push(`${m.w}×${m.h} px`)
  if (m.dpi) parts.push(`${m.dpi} DPI`)
  if (m.alpha === true) parts.push('transparent')
  else if (m.alpha === false) parts.push('no transparency')
  return parts.length ? parts.join(' · ') : 'Metrics not recorded'
}

/** Print-ready means 300 DPI on a transparent background; anything else deserves a look before it goes out. */
export function metricsWarning(m: FinalMetrics): string | null {
  const issues: string[] = []
  if (m.dpi !== null && m.dpi !== 300) issues.push(`${m.dpi} DPI instead of 300`)
  if (m.alpha === false) issues.push('the background is not transparent')
  return issues.length ? `Check before sending: ${issues.join('; ')}.` : null
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
