import { Link } from 'react-router-dom'
import { Kanban, Loader2, Plus } from 'lucide-react'
import { STAGES, STAGE_BADGE_CLASS, STAGE_HINT, STAGE_LABEL } from '../../lib/stage'
import type { CardStage } from '../../lib/types'
import { btnPrimary, btnSecondary } from '../style/classes'
import { Section } from './Section'

/** Counts of this client's cards per stage, each linking to that board column, plus New card. */
export function CardsSummary({
  clientId,
  clientActive,
  counts,
  total,
  loading,
  error,
  onNewCard,
}: {
  clientId: string
  clientActive: boolean
  counts: Record<CardStage, number>
  total: number
  loading: boolean
  error: string | null
  onNewCard: () => void
}) {
  const boardLink = `/board?client=${encodeURIComponent(clientId)}`
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          Cards
          {!loading && (
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs tabular-nums dark:bg-neutral-800">{total}</span>
          )}
        </span>
      }
      subtitle="Where this client's cards sit right now."
      actions={
        <button
          type="button"
          onClick={onNewCard}
          disabled={!clientActive}
          title={
            clientActive
              ? 'Start a card for this client from your own brief and references'
              : 'Inactive clients cannot take new cards. A lead can reactivate the client with Edit.'
          }
          className={btnPrimary}
        >
          <Plus className="h-4 w-4" />
          New card
        </button>
      }
    >
      {error && (
        <p role="alert" className="mb-2 text-xs text-red-700 dark:text-red-300">
          Could not count the cards: {error}
        </p>
      )}
      {loading ? (
        <div className="flex justify-center py-6 text-neutral-400" role="status" aria-label="Counting cards">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : total === 0 ? (
        <p className="text-sm text-neutral-500">
          No cards yet. They arrive from the brief form link, or start one with New card.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5">
          {STAGES.map((stage) => {
            const n = counts[stage]
            return (
              <li key={stage}>
                <Link
                  to={`${boardLink}&stages=${stage}`}
                  title={STAGE_HINT[stage]}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs outline-none ring-neutral-900/10 focus-visible:ring-4 dark:ring-white/20 ${
                    n > 0
                      ? 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/40'
                      : 'border-neutral-100 text-neutral-400 hover:bg-neutral-50 dark:border-neutral-800/60 dark:text-neutral-600 dark:hover:bg-neutral-800/40'
                  }`}
                >
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-4 ${
                      n > 0 ? STAGE_BADGE_CLASS[stage] : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600'
                    }`}
                  >
                    {STAGE_LABEL[stage]}
                  </span>
                  <span className="font-semibold tabular-nums">{n}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <Link to={boardLink} className={`${btnSecondary} mt-3 w-full`}>
        <Kanban className="h-4 w-4" />
        Open the board for this client
      </Link>
    </Section>
  )
}
