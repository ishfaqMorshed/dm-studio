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
  review: 'Edit the brief, then Approve to generate',
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
  intake: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
  review: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300',
  approved: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300',
  generating: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  needs_review: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  editing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  finishing: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  waiting: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
}

/** Accent colour for the column header strip on the board. */
export const STAGE_ACCENT_CLASS: Record<CardStage, string> = {
  intake: 'bg-neutral-400',
  review: 'bg-violet-500',
  approved: 'bg-sky-500',
  generating: 'bg-blue-500',
  needs_review: 'bg-amber-500',
  editing: 'bg-blue-500',
  finishing: 'bg-indigo-500',
  delivered: 'bg-emerald-500',
  waiting: 'bg-orange-500',
  failed: 'bg-red-500',
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
