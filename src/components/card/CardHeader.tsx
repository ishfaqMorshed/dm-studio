import { Link } from 'react-router-dom'
import { ArrowLeft, Clock, CopyPlus, ExternalLink } from 'lucide-react'
import { STAGE_BADGE_CLASS, STAGE_HINT, STAGE_LABEL, ageLabel, isOverdue } from '../../lib/stage'
import { Badge, CopyButton, Spinner } from './ui'
import { btnSecondary, btnSmall } from './styles'
import { formatDate, isPastDate, shortId } from './format'
import type { CardRow } from './useCardData'

export interface ExecutionLink {
  label: string
  url: string
}

export function CardHeader({
  card,
  now,
  executionLinks,
  onDuplicate,
  busy,
}: {
  card: CardRow
  now: number
  /** Lead-only n8n execution links (empty for designers). */
  executionLinks: ExecutionLink[]
  onDuplicate: () => void
  busy: string | null
}) {
  const clientName = card.clients?.name ?? 'Unknown client'
  const formLink = card.clients?.form_token ? `${window.location.origin}/brief/${card.clients.form_token}` : null
  const overdue = isOverdue(card.stage, card.stage_entered_at, now)
  const dueLate = card.stage !== 'delivered' && isPastDate(card.due_on, now)

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <Link
          to="/board"
          className="inline-flex items-center gap-1 rounded text-xs text-neutral-500 outline-none hover:text-neutral-900 focus-visible:ring-4 focus-visible:ring-neutral-900/10 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Board
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold leading-tight">{clientName}</h1>
          <Badge className={STAGE_BADGE_CLASS[card.stage]} title={STAGE_HINT[card.stage]}>
            {STAGE_LABEL[card.stage]}
          </Badge>
          <span
            className={`inline-flex items-center gap-1 text-xs ${overdue ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-neutral-500'}`}
            title={overdue ? 'Longer than expected for an automated stage — check the queue and the Paused banner' : undefined}
          >
            <Clock className="h-3.5 w-3.5" />
            in {STAGE_LABEL[card.stage].toLowerCase()} for {ageLabel(card.stage_entered_at, now)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-0.5">
            Card <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{shortId(card.id)}</code>
            <CopyButton text={card.id} label="Copy card id" className="!p-0.5" />
          </span>
          {formLink && (
            <span className="inline-flex items-center gap-0.5">
              Form link
              <a
                href={formLink}
                target="_blank"
                rel="noreferrer"
                className="max-w-[12rem] truncate rounded underline decoration-neutral-300 underline-offset-2 outline-none hover:text-neutral-900 focus-visible:ring-4 focus-visible:ring-neutral-900/10 dark:hover:text-neutral-100"
              >
                /brief/{card.clients?.form_token}
              </a>
              <CopyButton text={formLink} label="Copy form link" className="!p-0.5" />
            </span>
          )}
          {card.due_on && (
            <span className={dueLate ? 'font-medium text-red-600 dark:text-red-400' : undefined}>
              Due {formatDate(card.due_on)}
              {dueLate ? ' — overdue' : ''}
            </span>
          )}
          <span>Received {formatDate(card.created_at)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {executionLinks.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            title="Open the n8n execution (lead only)"
            className={`${btnSecondary} ${btnSmall}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            n8n · {l.label}
          </a>
        ))}
        <button
          type="button"
          onClick={onDuplicate}
          disabled={busy !== null}
          title="Copy the brief and references into a fresh intake card"
          className={`${btnSecondary} ${btnSmall}`}
        >
          {busy === 'duplicate' ? <Spinner className="h-3.5 w-3.5" /> : <CopyPlus className="h-3.5 w-3.5" />}
          Duplicate
        </button>
      </div>
    </div>
  )
}
