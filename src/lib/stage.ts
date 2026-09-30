import type { CardStage } from './types'

/** Every stage in SOP order; `waiting` and `failed` sit at the far right of the board. */
export const STAGES: readonly CardStage[] = [
  'intake',
  'review',
  'approved',
  'generating',
  'needs_review',
  'editing',
  'finishing',
  'delivered',
  'waiting',
  'failed',
]

export const STAGE_LABEL: Record<CardStage, string> = {
  intake: 'Intake',
  review: 'Review',
  approved: 'Approved',
  generating: 'Generating',
  needs_review: 'Needs review',
  editing: 'Editing',
  finishing: 'Finishing',
  delivered: 'Delivered',
  waiting: 'Waiting',
  failed: 'Failed',
}

/** One-line meaning shown as tooltip on column headers and badges. */
export const STAGE_HINT: Record<CardStage, string> = {
  intake: 'Form received, references being read',
  review: 'Edit the brief, then Generate the design',
  approved: 'Queued for generation',
  generating: 'Image being generated, QC running',
  needs_review: 'Check the output and the QC report',
  editing: 'An edit or regenerate is running',
  finishing: 'Upscale, remove background, 300 DPI',
  delivered: 'Final PNG ready in Completed',
  waiting: 'Parked by a designer with a note',
  failed: 'Pipeline error; fix the cause and Retry',
}

/** Tailwind classes for the stage badge (light + dark). */
export const STAGE_BADGE_CLASS: Record<CardStage, string> = {
  intake: 'bg-stage-intake-soft text-stage-intake-ink dark:bg-stage-intake/25 dark:text-stage-intake-light',
  review: 'bg-stage-review-soft text-stage-review-ink dark:bg-stage-review/25 dark:text-stage-review-light',
  approved: 'bg-stage-approved-soft text-stage-approved-ink dark:bg-stage-approved/25 dark:text-stage-approved-light',
  generating: 'bg-stage-generating-soft text-stage-generating-ink dark:bg-stage-generating/25 dark:text-stage-generating-light',
  needs_review: 'bg-stage-needs_review-soft text-stage-needs_review-ink dark:bg-stage-needs_review/25 dark:text-stage-needs_review-light',
  editing: 'bg-stage-editing-soft text-stage-editing-ink dark:bg-stage-editing/25 dark:text-stage-editing-light',
  finishing: 'bg-stage-finishing-soft text-stage-finishing-ink dark:bg-stage-finishing/25 dark:text-stage-finishing-light',
  delivered: 'bg-stage-delivered-soft text-stage-delivered-ink dark:bg-stage-delivered/25 dark:text-stage-delivered-light',
  waiting: 'bg-stage-waiting-soft text-stage-waiting-ink dark:bg-stage-waiting/25 dark:text-stage-waiting-light',
  failed: 'bg-stage-failed-soft text-stage-failed-ink dark:bg-stage-failed/25 dark:text-stage-failed-light',
}

/** Accent colour for the column header strip on the board. */
export const STAGE_ACCENT_CLASS: Record<CardStage, string> = {
  intake: 'bg-stage-intake',
  review: 'bg-stage-review',
  approved: 'bg-stage-approved',
  generating: 'bg-stage-generating',
  needs_review: 'bg-stage-needs_review',
  editing: 'bg-stage-editing',
  finishing: 'bg-stage-finishing',
  delivered: 'bg-stage-delivered',
  waiting: 'bg-stage-waiting',
  failed: 'bg-stage-failed',
}

/** Stages where a machine, not a designer, is expected to move the card on. */
export const AUTOMATED_STAGES: readonly CardStage[] = ['approved', 'generating', 'editing', 'finishing']

/** Stages where designers cannot edit card fields (a worker owns the row). */
export const LOCKED_STAGES: readonly CardStage[] = ['generating', 'editing', 'finishing']

/** A card older than this in an automated stage is flagged amber on the board. */
export const OVERDUE_MS = 4 * 60 * 1000

export function isAutomated(stage: CardStage): boolean {
  return AUTOMATED_STAGES.includes(stage)
}

/** True while brief fields must stay read-only. */
export function isStageLocked(stage: CardStage): boolean {
  return LOCKED_STAGES.includes(stage)
}

function toMs(v: string | number | Date): number {
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return v
  const t = Date.parse(v)
  return Number.isNaN(t) ? Date.now() : t
}

/** Milliseconds since the card entered its stage (never negative). */
export function ageMs(stageEnteredAt: string | number | Date, now: number = Date.now()): number {
  return Math.max(0, now - toMs(stageEnteredAt))
}

/**
 * Compact age for tiles: "12 s", "4 min", "3 h", "2 d".
 * Pass `now` from a ticking state to keep labels fresh without re-parsing.
 */
export function ageLabel(stageEnteredAt: string | number | Date, now: number = Date.now()): string {
  const s = Math.floor(ageMs(stageEnteredAt, now) / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h`
  return `${Math.floor(h / 24)} d`
}

/** Amber flag: more than 4 minutes in an automated stage. */
export function isOverdue(stage: CardStage, stageEnteredAt: string | number | Date, now: number = Date.now()): boolean {
  return isAutomated(stage) && ageMs(stageEnteredAt, now) > OVERDUE_MS
}
