import { memo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Clock, ImageIcon, ImageOff, PauseCircle } from 'lucide-react'
import { GENS_BUCKET, REFS_BUCKET } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { STAGE_BADGE_CLASS, STAGE_HINT, STAGE_LABEL, ageLabel, isOverdue } from '../../lib/stage'
import { firstPrintLine } from '../../lib/types'
import type { BoardCard } from './types'

interface Props {
  card: BoardCard
  /** Ticking timestamp from useNow, so every tile re-renders its age together. */
  now: number
}

/** Focus ring shared by every tile; matches the Header nav links. */
const RING = 'outline-none ring-neutral-900/10 focus-visible:ring-4 dark:ring-white/20'

/** One card on the board. The whole tile is the link to /card/:id. */
export const CardTile = memo(function CardTile({ card, now }: Props) {
  const overdue = isOverdue(card.stage, card.stage_entered_at, now)
  const printLine = firstPrintLine(card.print_text)
  const clientName = card.client?.name ?? 'Loading client…'
  const age = ageLabel(card.stage_entered_at, now)
  const ageText = `in ${STAGE_LABEL[card.stage].toLowerCase()} for ${age}`
  const due = dueInfo(card.due_on, card.stage === 'delivered', now)

  const border = overdue
    ? 'border-amber-400 hover:border-amber-500 dark:border-amber-600 dark:hover:border-amber-500'
    : card.stage === 'failed'
      ? 'border-red-300 hover:border-red-400 dark:border-red-800 dark:hover:border-red-700'
      : 'border-neutral-200 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600'

  return (
    <Link
      to={`/card/${card.id}`}
      aria-label={`${clientName}: ${printLine ?? 'no print text'}, ${ageText}${overdue ? ', overdue' : ''}`}
      className={`block rounded-xl border bg-white p-2.5 shadow-sm transition-colors dark:bg-neutral-900 ${border} ${RING}`}
    >
      <div className="flex gap-2.5">
        <Thumb card={card} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={clientName}>
            {clientName}
          </p>
          <p
            className={`truncate text-xs ${printLine ? 'text-neutral-600 dark:text-neutral-300' : 'italic text-neutral-400'}`}
            title={printLine ?? undefined}
          >
            {printLine ?? 'No print text'}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span
              title={STAGE_HINT[card.stage]}
              className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide ${STAGE_BADGE_CLASS[card.stage]}`}
            >
              {STAGE_LABEL[card.stage]}
            </span>
            {due && (
              <span
                title={due.title}
                className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums ${
                  due.late ? 'font-medium text-red-600 dark:text-red-400' : 'text-neutral-500'
                }`}
              >
                <CalendarClock className="h-3 w-3" />
                {due.label}
              </span>
            )}
          </div>
        </div>
      </div>

      <p
        title={
          overdue
            ? 'Longer than 4 min in an automated stage. Check the n8n execution, or Retry from the card.'
            : `Entered ${new Date(card.stage_entered_at).toLocaleString()}`
        }
        className={`mt-2 flex items-center gap-1 text-[11px] ${
          overdue ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-neutral-500'
        }`}
      >
        {overdue ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <Clock className="h-3 w-3 shrink-0" />}
        <span className="truncate">{ageText}</span>
      </p>

      {card.stage === 'failed' && (
        <p className="mt-1.5 line-clamp-2 break-words text-xs text-red-700 dark:text-red-300" title={card.last_error ?? undefined}>
          {card.last_error?.trim() || 'Failed without an error message. Open the card and Retry.'}
        </p>
      )}
      {card.stage === 'waiting' && card.stage_note && (
        <p className="mt-1.5 flex items-start gap-1 text-xs text-orange-800 dark:text-orange-300" title={card.stage_note}>
          <PauseCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2 break-words">{card.stage_note}</span>
        </p>
      )}
    </Link>
  )
})

/**
 * Current generation image, else the first client reference (marked "ref" so a designer
 * never mistakes a reference for output). Checkerboard shows through transparent PNGs.
 */
function Thumb({ card }: { card: BoardCard }) {
  const genPath = card.current_generation?.image_path ?? null
  const refPath = card.reference_paths?.[0] ?? null
  const showingRef = !genPath && Boolean(refPath)
  const { url, broken } = useSignedUrl(genPath ? GENS_BUCKET : REFS_BUCKET, genPath ?? refPath)

  return (
    <div
      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[conic-gradient(#e5e5e5_25%,transparent_0_50%,#e5e5e5_0_75%,transparent_0)] bg-[length:12px_12px] dark:bg-[conic-gradient(#404040_25%,transparent_0_50%,#404040_0_75%,transparent_0)]"
      aria-hidden="true"
    >
      {!genPath && !refPath ? (
        <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
          <ImageIcon className="h-5 w-5" />
        </div>
      ) : broken ? (
        <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-neutral-400 dark:bg-neutral-800" title="Image could not be loaded">
          <ImageOff className="h-5 w-5" />
        </div>
      ) : url ? (
        <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-neutral-200/70 dark:bg-neutral-800/70" />
      )}
      {showingRef && url && !broken && (
        <span className="absolute bottom-0 left-0 rounded-tr bg-neutral-800/85 px-1 text-[9px] font-semibold uppercase leading-3 tracking-wide text-white">
          ref
        </span>
      )}
    </div>
  )
}

interface DueInfo {
  label: string
  title: string
  late: boolean
}

/** `due_on` is a plain date; compare by calendar day in the browser's zone. */
function dueInfo(dueOn: string | null, delivered: boolean, now: number): DueInfo | null {
  if (!dueOn) return null
  const d = new Date(`${dueOn}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const late = !delivered && d.getTime() < today.getTime()
  const label = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return {
    label,
    late,
    title: late ? `Due ${label} — past the client's deadline` : `Client deadline ${label}`,
  }
}
