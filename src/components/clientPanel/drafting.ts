/**
 * Shared rules for the "Draft Style Card from library" / "Analyse" action: when a running
 * request counts as stuck, how its status reads, and why the button is disabled.
 */
import { isBriefGateError } from '../../lib/styleBrief'
import type { JobStatus, StyleDraftRequest } from '../../lib/types'

/** A request still queued/working after this long is treated as stuck and the button comes back. */
export const STALE_MS = 10 * 60 * 1000

export const ACTIVE_PHRASE: Record<JobStatus, string> = {
  queued: 'queued',
  dispatched: 'starting',
  working: 'being drafted',
  done: 'done',
  failed: 'failed',
}

export function ageMinutes(iso: string, now: number): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : Math.max(0, Math.round((now - t) / 60_000))
}

/** "Finish the written brief first (missing: niche, at least one subject). The profiler seeds …" */
export function briefGateReason(gaps: readonly string[]): string {
  return `Finish the written brief first (missing: ${gaps.join(', ')}). The profiler seeds subjects, brand text and garments from it.`
}

/** Null when the draft button may be pressed, else the one-line reason it cannot. */
export function draftDisabledReason({
  requesting,
  libraryLoading,
  tickedCount,
  briefGaps = [],
  active,
  stale,
  requestsLoading,
}: {
  requesting: boolean
  libraryLoading: boolean
  /** Library images the profiler will read (not excluded). */
  tickedCount: number
  /** `briefGaps()` of the saved brief: the niche, one subject and one garment colour are required (studio_21 trigger). */
  briefGaps?: readonly string[]
  /** The running request, if any. */
  active: StyleDraftRequest | null
  stale: boolean
  requestsLoading: boolean
}): string | null {
  if (requesting) return 'Queuing the draft…'
  if (libraryLoading) return 'Loading the library…'
  if (tickedCount === 0) return 'Tick at least one image in the library; the analysis reads the ticked ones.'
  if (briefGaps.length > 0) return briefGateReason(briefGaps)
  if (active && !stale) return `A draft is already ${ACTIVE_PHRASE[active.status]}. Wait for it to finish.`
  if (requestsLoading) return 'Checking for a running draft…'
  return null
}

/**
 * The message to show when `requestStyleDraft` fails. The server trigger says 'write the onboarding
 * brief first - niche, at least one subject and one garment colour are required'; that is reworded to
 * the same sentence the disabled button shows (with the gaps the client record has today), so the
 * designer reads one explanation, not two. Anything else is passed through.
 */
export function draftErrorMessage(message: string, briefGaps: readonly string[]): string {
  if (!isBriefGateError(message)) return message
  return briefGateReason(briefGaps.length ? briefGaps : ['niche', 'at least one subject', 'a garment colour'])
}
