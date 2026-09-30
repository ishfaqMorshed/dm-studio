import { useCallback, useEffect, useRef, useState } from 'react'
import { approveCard, createStyleTestCard, retryCard, type TestCard } from '../../lib/api'
import { isOverdue } from '../../lib/stage'
import { errorMessage, type CardStage, type StyleCard } from '../../lib/types'
import { useNow } from '../card/useNow'
import { readTestSubmission, type TestRenderInput } from './testRenderInput'
import type { StyleTestCards } from './useStyleTestCards'

/** Stages a test card passes through before the image is ready. */
export const TEST_ACTIVE_STAGES: readonly CardStage[] = ['intake', 'review', 'approved', 'generating']

/** No stage change for this long counts as stuck. */
export const TEST_STALE_MS = 6 * 60 * 1000

/**
 * True when an active-stage card has sat in its stage too long: WF-1 / WF-2 never moved it, or a
 * review-stage card nobody approved. The step offers Skip / a new render for such a card.
 */
export function isTestStuck(card: TestCard, now: number): boolean {
  if (!TEST_ACTIVE_STAGES.includes(card.stage)) return false
  const entered = Date.parse(card.stage_entered_at)
  if (Number.isNaN(entered)) return false
  return now - entered > TEST_STALE_MS || isOverdue(card.stage, card.stage_entered_at, now)
}

export type RenderPhase =
  | 'idle'
  /** create_style_test_card in flight. */
  | 'creating'
  /** WF-1 is reading the 3 references (~10 s). */
  | 'intake'
  /** approve_card in flight (auto, right after intake). */
  | 'approving'
  /** At review with nobody about to approve it: offer "Generate with v{n}" or Skip. */
  | 'needs_generate'
  /** approved / generating (~40 s). */
  | 'generating'
  | 'ready'
  | 'failed'

/** Phases in which the pipeline is working on the card (a second render would collide). */
const BUSY_PHASES: readonly RenderPhase[] = ['creating', 'intake', 'approving', 'generating']

export interface TestRender {
  phase: RenderPhase
  /** The card the phase describes (the running one), or null when idle. */
  card: TestCard | null
  /** True while the pipeline is on `card` and it is not stuck: no second render, no Skip. */
  busy: boolean
  /** `card` has not moved for TEST_STALE_MS (or is overdue): Skip and a new render are allowed. */
  stuck: boolean
  starting: boolean
  /** create_style_test_card failed (no card exists); cleared by the next start or dismiss. */
  startError: string | null
  approving: boolean
  approveError: string | null
  retrying: boolean
  /**
   * Paid: create the card with the subject, lines and version; intake starts by itself and the
   * approve with `input.styleCardId` follows automatically. Resolves false when the create failed.
   */
  start: (input: TestRenderInput) => Promise<boolean>
  /** Paid: approve a review-stage card with the version it was created for (used when the auto approve did not happen). */
  generateNow: (card: TestCard) => Promise<void>
  /** Re-queue a failed card's step (retry_card). */
  retry: (card: TestCard) => Promise<void>
  /** Leave the shown card behind (a failed, stuck or review-stage one); it stays reachable at /card/:id. */
  dismiss: () => void
}

/**
 * The test-render state machine over the client's style_test cards: create → (WF-1 intake) →
 * approve with the chosen version, exactly once per card → (generation + QC) → ready. Errors are
 * shown, never retried in a loop; every paid call happens because the designer pressed something.
 * Lives in the wizard shell so an approve still fires while another step is on screen and a
 * dismissed card stays dismissed across steps.
 */
export function useTestRender({
  clientId,
  draft,
  tests,
  onError,
}: {
  clientId: string
  /** The version on show: the fallback for cards that do not record which version they were created for. */
  draft: StyleCard | null
  tests: StyleTestCards
  onError: (message: string) => void
}): TestRender {
  const now = useNow(30_000)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  /** Card id we created in this session and want to approve with a given version (ref for the effect, state for the phase). */
  const pendingApprove = useRef<{ cardId: string; styleCardId: string } | null>(null)
  const [pendingCardId, setPendingCardId] = useState<string | null>(null)
  /** Cards approve_card was already sent for (never twice). */
  const approvedFor = useRef<Set<string>>(new Set())
  const [trackedId, setTrackedId] = useState<string | null>(null)
  /** Cards the designer left behind with Skip / Start a new test render; they never become `card` again. */
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())

  const active = tests.rows.find((r) => TEST_ACTIVE_STAGES.includes(r.stage) && !dismissed.has(r.id)) ?? null
  const tracked = trackedId && !dismissed.has(trackedId) ? tests.rows.find((r) => r.id === trackedId) ?? null : null
  // The running card wins; otherwise the one we started (it may have just failed or finished); otherwise the
  // newest failed test card, so a failure from another session or before a reload still shows its error and Retry.
  const newestFailed = tests.rows[0]?.stage === 'failed' && !dismissed.has(tests.rows[0].id) ? tests.rows[0] : null
  const card = active ?? tracked ?? newestFailed
  const stuck = card !== null && isTestStuck(card, now)

  // Auto approve: the card we created reached review.
  useEffect(() => {
    const pending = pendingApprove.current
    if (!card || card.stage !== 'review' || !pending || pending.cardId !== card.id) return
    if (approvedFor.current.has(card.id)) return
    approvedFor.current.add(card.id)
    setApproving(true)
    setApproveError(null)
    approveCard(card.id, null, pending.styleCardId)
      .then((c) => tests.upsertLocal(c))
      .catch((e: unknown) => setApproveError(errorMessage(e)))
      .finally(() => setApproving(false))
  }, [card, tests])

  const addDismissed = useCallback((id: string) => {
    setDismissed((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const start = useCallback(
    async (input: TestRenderInput) => {
      if (starting) return false
      setStarting(true)
      setStartError(null)
      setApproveError(null)
      // The card on show (stuck, at review, failed) is left behind before the paid call: whether the
      // new card is created or the create fails, the step shows the new attempt (or its error), not
      // the old card's panel. The old card stays reachable at /card/:id.
      if (card) addDismissed(card.id)
      try {
        const row = await createStyleTestCard(clientId, { subject: input.subject, lines: input.lines, styleCardId: input.styleCardId })
        pendingApprove.current = { cardId: row.id, styleCardId: input.styleCardId }
        setPendingCardId(row.id)
        setTrackedId(row.id)
        tests.upsertLocal(row)
        return true
      } catch (e) {
        const message = errorMessage(e)
        setStartError(message)
        onError(`Could not start the test render: ${message}`)
        return false
      } finally {
        setStarting(false)
      }
    },
    [clientId, starting, card, tests, onError, addDismissed],
  )

  /** The version a card renders with: the one it was created for, else the version on show. */
  const versionFor = useCallback((target: TestCard) => readTestSubmission(target).styleCardId ?? draft?.id ?? null, [draft])

  const generateNow = useCallback(
    async (target: TestCard) => {
      if (approving) return
      const styleCardId = versionFor(target)
      if (!styleCardId) {
        setApproveError('No Style Card version to render with: select one in step 3.')
        return
      }
      setApproving(true)
      setApproveError(null)
      approvedFor.current.add(target.id)
      try {
        const c = await approveCard(target.id, null, styleCardId)
        tests.upsertLocal(c)
        setTrackedId(c.id)
      } catch (e) {
        setApproveError(errorMessage(e))
      } finally {
        setApproving(false)
      }
    },
    [approving, versionFor, tests],
  )

  const retry = useCallback(
    async (target: TestCard) => {
      if (retrying) return
      setRetrying(true)
      try {
        const c = await retryCard(target.id)
        tests.upsertLocal(c)
        setTrackedId(c.id)
        // A retried intake will reach review again: approve it with the same version once more.
        const styleCardId = versionFor(target)
        if (styleCardId && c.stage === 'intake') {
          approvedFor.current.delete(c.id)
          pendingApprove.current = { cardId: c.id, styleCardId }
          setPendingCardId(c.id)
        }
      } catch (e) {
        onError(`Retry failed: ${errorMessage(e)}`)
      } finally {
        setRetrying(false)
      }
    },
    [retrying, tests, versionFor, onError],
  )

  const dismiss = useCallback(() => {
    if (card) addDismissed(card.id)
    setApproveError(null)
    setStartError(null)
  }, [card, addDismissed])

  let phase: RenderPhase = 'idle'
  if (starting) phase = 'creating'
  else if (card) {
    switch (card.stage) {
      case 'intake':
        phase = 'intake'
        break
      case 'review':
        phase = approving || (pendingCardId === card.id && !approveError) ? 'approving' : 'needs_generate'
        break
      case 'approved':
      case 'generating':
        phase = 'generating'
        break
      case 'failed':
        phase = 'failed'
        break
      case 'needs_review':
        phase = 'ready'
        break
      default:
        phase = card.current_generation_id ? 'ready' : 'idle'
    }
  }
  const busy = BUSY_PHASES.includes(phase) && !stuck
  return { phase, card, busy, stuck, starting, startError, approving, approveError, retrying, start, generateNow, retry, dismiss }
}
