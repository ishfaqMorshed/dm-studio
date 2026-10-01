/** The wizard's four steps, their URL ids and the one-line summaries the progress header shows. */
import { briefGapsSummary } from '../../lib/styleBrief'
import { formatDateTime } from '../style/format'

export const STEP_IDS = ['designs', 'brief', 'analyse', 'test'] as const
export type StepId = (typeof STEP_IDS)[number]

export const STEP_LABEL: Record<StepId, string> = {
  designs: 'Drop the designs',
  brief: 'Written brief',
  analyse: 'Analyse',
  test: 'Lock & test',
}

/** Shorter label for the Continue button: "Next: written brief →". */
export const STEP_SHORT: Record<StepId, string> = {
  designs: 'the designs',
  brief: 'written brief',
  analyse: 'analyse',
  test: 'lock & test',
}

export function isStepId(v: unknown): v is StepId {
  return typeof v === 'string' && (STEP_IDS as readonly string[]).includes(v)
}

export function nextStep(id: StepId): StepId | null {
  const i = STEP_IDS.indexOf(id)
  return i >= 0 && i < STEP_IDS.length - 1 ? STEP_IDS[i + 1] : null
}

export function prevStep(id: StepId): StepId | null {
  const i = STEP_IDS.indexOf(id)
  return i > 0 ? STEP_IDS[i - 1] : null
}

/**
 * Where a fresh visit lands: the first step with nothing persisted yet. The brief counts as
 * incomplete while it is empty or while `briefGaps()` lists anything (Analyse is gated on it).
 */
export function firstIncompleteStep({
  tickedCount,
  briefEmpty,
  briefGaps = [],
  hasDraft,
}: {
  tickedCount: number
  briefEmpty: boolean
  briefGaps?: readonly string[]
  hasDraft: boolean
}): StepId {
  if (tickedCount === 0) return 'designs'
  if (briefEmpty || briefGaps.length > 0) return 'brief'
  if (!hasDraft) return 'analyse'
  return 'test'
}

export type StepState = 'done' | 'active' | 'todo' | 'attention' | 'busy'

export interface StepSummary {
  id: StepId
  label: string
  summary: string
  state: StepState
  /** ISO start of a busy job; the header appends a live "m:ss" after the summary. */
  since?: string | null
}

export interface StepSummaryData {
  active: StepId
  libraryLoading: boolean
  tickedCount: number
  totalCount: number
  briefEmpty: boolean
  /** `briefGaps()` of the saved brief and client record; the step reads 'attention · Missing: …' while any remain. */
  briefGaps?: readonly string[]
  /** briefSummary() of the saved brief. */
  briefText: string
  briefDirty: boolean
  /** The draft the wizard shows (newest by default); `superseded` = locked but no longer current. */
  draft: { version: number; created_at: string; locked: boolean; superseded: boolean } | null
  /** ISO created_at of the queued/working draft request, or null when none is running. */
  analysingSince: string | null
  analysisFailed: boolean
  lockedVersion: number | null
  /**
   * Step 4 state for the shown draft: 'waiting' = a test card sits at review with nobody about to
   * approve it, 'stuck' = the pipeline has not moved the card for a while.
   */
  test: 'none' | 'rendering' | 'waiting' | 'stuck' | 'rendered' | 'failed'
  /** ISO created_at of the running test card, or null. */
  renderingSince: string | null
  /** "QC pass" etc. when rendered. */
  testVerdict: string | null
}

/** The render states that append to the step-4 summary while the pipeline is (or should be) on a card. */
const RENDER_LIVE: Partial<Record<StepSummaryData['test'], { text: string; state: StepState }>> = {
  rendering: { text: 'rendering…', state: 'busy' },
  waiting: { text: 'test card at review', state: 'attention' },
  stuck: { text: 'render stuck', state: 'attention' },
  failed: { text: 'render failed', state: 'attention' },
}

/** Summaries come from persisted data only, so they survive a reload. */
export function stepSummaries(d: StepSummaryData): StepSummary[] {
  const designs: StepSummary = {
    id: 'designs',
    label: STEP_LABEL.designs,
    summary: d.libraryLoading
      ? 'Loading…'
      : d.totalCount === 0
        ? 'No images yet'
        : `${d.tickedCount} of ${d.totalCount} ticked`,
    state: d.tickedCount > 0 ? 'done' : 'todo',
  }

  const gaps = d.briefGaps ?? []
  const brief: StepSummary = {
    id: 'brief',
    label: STEP_LABEL.brief,
    summary: d.briefDirty
      ? 'Unsaved changes'
      : d.briefEmpty
        ? 'Not written yet'
        : gaps.length > 0
          ? briefGapsSummary(gaps)
          : `Saved · ${d.briefText}`,
    state: d.briefDirty ? 'attention' : d.briefEmpty ? 'todo' : gaps.length > 0 ? 'attention' : 'done',
  }

  let analyse: StepSummary
  if (d.analysingSince !== null) {
    analyse = { id: 'analyse', label: STEP_LABEL.analyse, summary: 'Analysing…', state: 'busy', since: d.analysingSince }
  } else if (d.draft) {
    analyse = {
      id: 'analyse',
      label: STEP_LABEL.analyse,
      summary: `${d.draft.locked ? 'v' : 'Draft v'}${d.draft.version} · ${formatDateTime(d.draft.created_at)}`,
      state: 'done',
    }
  } else if (d.analysisFailed) {
    analyse = { id: 'analyse', label: STEP_LABEL.analyse, summary: 'Failed', state: 'attention' }
  } else {
    analyse = { id: 'analyse', label: STEP_LABEL.analyse, summary: 'Not run', state: 'todo' }
  }

  // Step 4: the lock first, then the render of the locked version after a separator.
  let test: StepSummary
  const live = RENDER_LIVE[d.test]
  if (d.draft?.locked && d.draft.superseded) {
    test = {
      id: 'test',
      label: STEP_LABEL.test,
      summary: `v${d.draft.version} superseded${d.lockedVersion !== null ? ` · v${d.lockedVersion} is current` : ''}`,
      state: 'done',
    }
  } else if (d.draft?.locked) {
    const base = `v${d.draft.version} locked`
    if (live) {
      test = { id: 'test', label: STEP_LABEL.test, summary: `${base} · ${live.text}`, state: live.state, since: live.state === 'busy' ? d.renderingSince : null }
    } else if (d.test === 'rendered') {
      test = { id: 'test', label: STEP_LABEL.test, summary: `${base} · ${d.testVerdict ?? 'rendered'}`, state: 'done' }
    } else {
      test = { id: 'test', label: STEP_LABEL.test, summary: base, state: 'done' }
    }
  } else if (d.draft) {
    // A draft renders only once locked. A render still in flight was started before that rule, or belongs to
    // another version; a failed one may be older too. Keep them visible so Retry / Skip are found.
    test = live
      ? { id: 'test', label: STEP_LABEL.test, summary: `Not locked yet · ${live.text}`, state: live.state, since: live.state === 'busy' ? d.renderingSince : null }
      : { id: 'test', label: STEP_LABEL.test, summary: 'Not locked yet', state: 'todo' }
  } else {
    test = { id: 'test', label: STEP_LABEL.test, summary: d.lockedVersion !== null ? `v${d.lockedVersion} locked` : 'Not yet', state: 'todo' }
  }

  return [designs, brief, analyse, test].map((s) => (s.id === d.active ? { ...s, state: 'active' } : s))
}

/** "0:24" from milliseconds. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}
