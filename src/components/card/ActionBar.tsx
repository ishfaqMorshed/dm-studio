import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Crop, PauseCircle, Play, RefreshCw, RotateCcw, Send, Sparkles, Type } from 'lucide-react'
import { STAGE_LABEL, ageLabel, isOverdue } from '../../lib/stage'
import { GENERATION_KIND_LABEL, type FinJob, type Generation } from '../../lib/types'
import { STATUS_LABEL, btnPrimary, btnSecondary } from './styles'
import { Panel, Spinner } from './ui'
import type { CardRow } from './useCardData'

interface ActionDef {
  key: string
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  /** Why the button is disabled, shown under the bar. */
  reason?: string
  primary?: boolean
  title?: string
}

export interface ActionBarProps {
  card: CardRow
  current: Generation | null
  /** Newest generation that is still queued or running (editing stage). */
  runningGeneration: Generation | null
  latestFinJob: FinJob | null
  hasStyleCard: boolean
  styleCardLoading: boolean
  paused: boolean
  price: string | null
  busy: string | null
  now: number
  onApprove: () => void
  onAccept: () => void
  onEditText: () => void
  onEditRegion: () => void
  onRegenerate: () => void
  onPark: () => void
  onResume: () => void
  onRetry: () => void
}

/** The buttons a designer can press in this stage, with the reason when one is off. */
export function ActionBar(p: ActionBarProps) {
  const { card, current, paused, price, busy, now } = p
  const stage = card.stage
  const hasImage = Boolean(current?.image_path)
  const pausedReason = paused ? 'The pipeline is paused by the lead. Nothing new is queued until it resumes.' : undefined
  const noImageReason = hasImage ? undefined : 'The current generation has no image yet.'

  const actions: ActionDef[] = []

  if (stage === 'review') {
    actions.push({
      key: 'approve',
      label: price ? `Approve · ${price}` : 'Approve',
      icon: <Sparkles className="h-4 w-4" />,
      primary: true,
      onClick: p.onApprove,
      disabled: paused || p.styleCardLoading || !p.hasStyleCard,
      reason:
        pausedReason ??
        (p.styleCardLoading
          ? 'Checking the Style Card…'
          : !p.hasStyleCard
            ? 'This client has no locked Style Card. Lock one in the Style Card editor, then approve.'
            : undefined),
      title: 'Snapshot the brief and queue the first generation',
    })
  }

  if (stage === 'needs_review') {
    actions.push(
      {
        key: 'accept',
        label: 'Accept',
        icon: <Send className="h-4 w-4" />,
        primary: true,
        onClick: p.onAccept,
        disabled: !hasImage,
        reason: noImageReason,
        title: 'Send the current image to the finisher',
      },
      {
        key: 'edit_text',
        label: 'Edit text',
        icon: <Type className="h-4 w-4" />,
        onClick: p.onEditText,
        disabled: !hasImage || paused,
        reason: noImageReason ?? pausedReason,
        title: 'Edit the text lines: one line is replaced in place, several are regenerated together',
      },
      {
        key: 'edit_region',
        label: 'Edit region',
        icon: <Crop className="h-4 w-4" />,
        onClick: p.onEditRegion,
        disabled: !hasImage || paused,
        reason: noImageReason ?? pausedReason,
        title: 'Draw a rectangle and describe what changes inside it',
      },
      {
        key: 'regenerate',
        label: 'Regenerate',
        icon: <RefreshCw className="h-4 w-4" />,
        onClick: p.onRegenerate,
        disabled: !hasImage || paused,
        reason: noImageReason ?? pausedReason,
        title: 'Reject with a reason and generate again from the (edited) magic prompt',
      },
    )
  }

  if (stage === 'review' || stage === 'approved' || stage === 'needs_review') {
    actions.push({
      key: 'park',
      label: 'Park',
      icon: <PauseCircle className="h-4 w-4" />,
      onClick: p.onPark,
      title: 'Move to Waiting with a note (missing info, client question)',
    })
  }

  if (stage === 'waiting') {
    actions.push({
      key: 'resume',
      label: `Resume → ${STAGE_LABEL[card.previous_stage ?? 'review']}`,
      icon: <Play className="h-4 w-4" />,
      primary: true,
      onClick: p.onResume,
      title: 'Return the card to the stage it was parked from',
    })
  }

  if (stage === 'failed') {
    actions.push({
      key: 'retry',
      label: `Retry`,
      icon: <RotateCcw className="h-4 w-4" />,
      primary: true,
      onClick: p.onRetry,
      title: 'Re-queue the failed step and return to the previous stage',
    })
  }

  const reasons = Array.from(new Set(actions.filter((a) => a.disabled && a.reason).map((a) => `${a.label.split(' ·')[0]}: ${a.reason}`)))

  return (
    <Panel title="Actions" subtitle={<StatusLine {...p} />} bodyClassName="px-4 pb-3">
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              disabled={busy !== null || a.disabled}
              title={a.disabled && a.reason ? a.reason : a.title}
              className={a.primary ? btnPrimary : btnSecondary}
            >
              {busy === a.key ? <Spinner /> : a.icon}
              {a.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">
          {stage === 'delivered' ? (
            <>
              Nothing left to do here. The final PNG is in{' '}
              <Link to="/completed" className="underline underline-offset-2">
                Completed
              </Link>
              ; duplicate the card to start a new design from the same brief.
            </>
          ) : (
            <>Nothing to do right now — the pipeline owns this card. It moves on by itself{isOverdue(stage, card.stage_entered_at, now) ? ', but it has been a while: check the queue indicator and the Paused banner' : ''}.</>
          )}
        </p>
      )}
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** One line on what is happening in this stage, from the designer's point of view. */
function StatusLine({ card, current, runningGeneration, latestFinJob, paused, now }: ActionBarProps) {
  const overdue = isOverdue(card.stage, card.stage_entered_at, now)
  const age = ageLabel(card.stage_entered_at, now)
  const amber = overdue ? 'font-medium text-amber-700 dark:text-amber-300' : undefined
  switch (card.stage) {
    case 'intake':
      return <span>Reading the references. The card moves to Review by itself.</span>
    case 'review':
      return <span>Check the brief, text lines and Style Card, then Approve. Approval is the step that spends money.</span>
    case 'approved':
      return (
        <span className={amber}>
          Queued for generation for {age}.{paused ? ' The pipeline is paused; it starts when the lead resumes.' : ''}
          {overdue && !paused ? ' Longer than usual — check the queue indicator.' : ''}
        </span>
      )
    case 'generating':
      return (
        <span className={amber}>
          {current ? `${STATUS_LABEL[current.status]}: ` : ''}image being generated and judged, {age} so far.
        </span>
      )
    case 'needs_review':
      return <span>Read the QC report first, then the image. Accept, fix the text or a region, or regenerate with a reason.</span>
    case 'editing':
      return (
        <span className={amber}>
          {runningGeneration ? `${GENERATION_KIND_LABEL[runningGeneration.kind]} ${STATUS_LABEL[runningGeneration.status].toLowerCase()}` : 'An edit is running'}
          , {age} so far. The card returns to Needs review when the child generation lands.
        </span>
      )
    case 'finishing':
      return (
        <span className={amber}>
          Finisher {latestFinJob ? STATUS_LABEL[latestFinJob.status].toLowerCase() : 'queued'}
          {latestFinJob && latestFinJob.attempt > 1 ? ` (attempt ${latestFinJob.attempt})` : ''}: upscale ×4, remove background, 300 DPI. Usually 2–4 minutes; {age} so far.
          {latestFinJob?.last_error ? ` Last error: ${latestFinJob.last_error}` : ''}
        </span>
      )
    case 'delivered':
      return <span>Delivered. Download the print-ready PNG from Completed.</span>
    case 'waiting':
      return <span>Parked for {age}. Resume when the missing piece is in.</span>
    case 'failed':
      return <span>The pipeline stopped. Fix the cause (see the error above), then Retry.</span>
  }
}
