import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Crop, PauseCircle, RefreshCw, Send, Sparkles, Star } from 'lucide-react'
import { ageLabel, isOverdue } from '../../lib/stage'
import { GENERATION_KIND_LABEL, type FinJob, type Generation } from '../../lib/types'
import { STATUS_LABEL, btnLarge, btnPrimary, btnSecondary, btnSmall } from './styles'
import { Spinner } from './ui'
import type { CardRow } from './useCardData'

interface ActionDef {
  key: string
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  /** Why the button is off, listed under the buttons. */
  reason?: ReactNode
  /** Dedupe key for a `reason` that is not a plain string. */
  reasonKey?: string
  title?: string
}

export interface StageActionsProps {
  card: CardRow
  current: Generation | null
  /** The generation on the canvas: current, unless the designer picked another in the strip. */
  viewed: Generation | null
  /** Newest generation that is still queued or running (editing stage). */
  runningGeneration: Generation | null
  /** True until the generations query has settled once (the card row usually lands first). */
  generationsLoading: boolean
  latestFinJob: FinJob | null
  hasStyleCard: boolean
  styleCardLoading: boolean
  paused: boolean
  price: string | null
  busy: string | null
  now: number
  canMakeCurrent: boolean
  onApprove: () => void
  onAccept: () => void
  onEditRegion: () => void
  onRegenerate: () => void
  onPark: () => void
  onMakeCurrent: (id: string) => void
}

function ActionButton({ a, busy, className }: { a: ActionDef; busy: string | null; className: string }) {
  return (
    <button
      type="button"
      onClick={a.onClick}
      disabled={busy !== null || a.disabled}
      title={a.disabled && typeof a.reason === 'string' ? a.reason : a.title}
      className={className}
    >
      {busy === a.key ? <Spinner /> : a.icon}
      {a.label}
    </button>
  )
}

/**
 * The rail beside the picture: ONE big primary for the stage, small secondaries under
 * it, and the reasons when something is off. No status line here — the page renders
 * StatusLine in its live region. Stages the pipeline owns render nothing (the status
 * line explains), and waiting / failed leave Resume / Retry to their banners.
 */
export function StageActions(p: StageActionsProps) {
  const { card, current, viewed, paused, price, busy } = p
  const stage = card.stage
  const hasImage = Boolean(current?.image_path)
  const pausedReason = paused ? 'The pipeline is paused by the lead. Nothing new is queued until it resumes.' : undefined
  const noImageReason = hasImage
    ? undefined
    : p.generationsLoading && !current
      ? 'Loading the generations…'
      : 'The current generation has no image yet.'
  const viewedIsCurrent = viewed !== null && viewed.id === current?.id

  const park: ActionDef = {
    key: 'park',
    label: 'Park',
    icon: <PauseCircle className="h-4 w-4" />,
    onClick: p.onPark,
    title: 'Move to Waiting with a note (missing info, client question)',
  }

  let primary: ActionDef | null = null
  const secondary: ActionDef[] = []

  switch (stage) {
    case 'review': {
      const noStyleCard = !pausedReason && !p.styleCardLoading && !p.hasStyleCard
      primary = {
        key: 'approve',
        label: price ? `Generate the design · ${price}` : 'Generate the design',
        icon: <Sparkles className="h-4 w-4" />,
        onClick: p.onApprove,
        disabled: paused || p.styleCardLoading || !p.hasStyleCard,
        reason:
          pausedReason ??
          (p.styleCardLoading ? (
            'Checking the Style Card…'
          ) : noStyleCard ? (
            <>
              This client has no locked Style Card.{' '}
              <Link to={`/clients/${card.client_id}/style`} className="underline underline-offset-2">
                Lock one in the Style Card editor
              </Link>
              , then generate.
            </>
          ) : undefined),
        reasonKey: noStyleCard ? 'no_style_card' : undefined,
        title: 'Snapshot the brief and queue the first generation',
      }
      secondary.push(park)
      break
    }
    case 'approved':
      secondary.push(park)
      break
    case 'needs_review':
      if (viewed && !viewedIsCurrent) {
        primary = {
          key: 'make_current',
          label: 'Make this current',
          icon: <Star className="h-4 w-4" />,
          onClick: () => p.onMakeCurrent(viewed.id),
          disabled: !p.canMakeCurrent || !viewed.image_path,
          reason: !viewed.image_path ? 'No image to make current' : !p.canMakeCurrent ? 'Wait until the pipeline finishes with this card' : undefined,
          title: 'Use this image as the card’s current generation',
        }
        secondary.push(park)
      } else {
        primary = {
          key: 'accept',
          label: 'Accept · finish',
          icon: <Send className="h-4 w-4" />,
          onClick: p.onAccept,
          disabled: !hasImage,
          reason: noImageReason,
          title: 'Send the current image to the finisher',
        }
        secondary.push(
          {
            key: 'edit_region',
            label: 'Fix an area',
            icon: <Crop className="h-4 w-4" />,
            onClick: p.onEditRegion,
            disabled: !hasImage || paused,
            reason: noImageReason ?? pausedReason,
            title: 'Draw a rectangle and describe what changes inside it',
          },
          {
            key: 'regenerate',
            label: 'Try again',
            icon: <RefreshCw className="h-4 w-4" />,
            onClick: p.onRegenerate,
            disabled: !hasImage || paused,
            reason: noImageReason ?? pausedReason,
            title: 'Reject with a reason and generate again from the (edited) magic prompt',
          },
          park,
        )
      }
      break
    case 'delivered':
      return (
        <Link to="/completed" className={btnSecondary}>
          Open in Completed
        </Link>
      )
    default:
      return null
  }

  const seen = new Set<string>()
  const reasons: Array<{ key: string; node: ReactNode }> = []
  for (const a of primary ? [primary, ...secondary] : secondary) {
    if (!a.disabled || !a.reason) continue
    const key = `${a.label}: ${a.reasonKey ?? String(a.reason)}`
    if (seen.has(key)) continue
    seen.add(key)
    reasons.push({
      key,
      node: (
        <>
          {a.label.split(' ·')[0]}: {a.reason}
        </>
      ),
    })
  }

  return (
    <div className="space-y-2">
      {primary && <ActionButton a={primary} busy={busy} className={`${btnPrimary} ${btnLarge} w-full`} />}
      {secondary.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {secondary.map((a) => (
            <ActionButton key={a.key} a={a} busy={busy} className={`${btnSecondary} ${btnSmall}`} />
          ))}
        </div>
      )}
      {reasons.length > 0 && (
        <ul className="space-y-0.5 text-xs text-neutral-500">
          {reasons.map((r) => (
            <li key={r.key}>{r.node}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One line on what is happening in this stage, from the designer's point of view. */
export function StatusLine({
  card,
  current,
  viewed,
  runningGeneration,
  latestFinJob,
  paused,
  now,
  viewedIsCurrent,
}: StageActionsProps & { viewedIsCurrent: boolean }) {
  const overdue = isOverdue(card.stage, card.stage_entered_at, now)
  const age = ageLabel(card.stage_entered_at, now)
  const amber = overdue ? 'font-medium text-amber-700 dark:text-amber-300' : undefined
  switch (card.stage) {
    case 'intake':
      return <span>Reading the references. The card moves to Review by itself.</span>
    case 'review':
      return <span>Check the text lines, then generate. This is the step that spends money.</span>
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
      return viewedIsCurrent || !viewed ? (
        paused ? (
          <span>
            Check the picture. Accept still works; the pipeline is paused, so text edits, Fix an area and Try again wait until the lead
            resumes it.
          </span>
        ) : (
          <span>Check the picture. Accept it, or click the picture to change its text.</span>
        )
      ) : (
        <span>You are viewing an older generation. Make it current to accept or edit it.</span>
      )
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
