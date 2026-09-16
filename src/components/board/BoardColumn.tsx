import { memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { STAGE_ACCENT_CLASS, STAGE_HINT, STAGE_LABEL } from '../../lib/stage'
import type { CardStage } from '../../lib/types'
import { CardTile } from './CardTile'
import type { BoardCard } from './types'

/** Delivered cards pile up forever; the board shows the newest few and points to Completed. */
const DELIVERED_LIMIT = 30

interface Props {
  stage: CardStage
  cards: BoardCard[]
  now: number
}

function enteredAt(c: BoardCard): number {
  const t = Date.parse(c.stage_entered_at)
  return Number.isNaN(t) ? 0 : t
}

/**
 * One stage column. Working stages list the longest-waiting card first so it gets picked
 * up next; Delivered lists newest first because that is what a designer looks for.
 */
export const BoardColumn = memo(function BoardColumn({ stage, cards, now }: Props) {
  const sorted = useMemo(() => {
    const copy = cards.slice()
    copy.sort((a, b) => (stage === 'delivered' ? enteredAt(b) - enteredAt(a) : enteredAt(a) - enteredAt(b)))
    return stage === 'delivered' ? copy.slice(0, DELIVERED_LIMIT) : copy
  }, [cards, stage])
  const hidden = cards.length - sorted.length

  return (
    <section
      aria-label={`${STAGE_LABEL[stage]} (${cards.length})`}
      className="flex w-[17rem] shrink-0 flex-col rounded-2xl border border-neutral-200 bg-neutral-100/70 dark:border-neutral-800 dark:bg-neutral-900/50"
    >
      <header className="flex items-center gap-2 px-3 pb-2 pt-3" title={STAGE_HINT[stage]}>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STAGE_ACCENT_CLASS[stage]}`} aria-hidden="true" />
        <h2 className="truncate text-sm font-semibold">{STAGE_LABEL[stage]}</h2>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {cards.length}
        </span>
      </header>

      <div className="flex max-h-[calc(100vh-15rem)] min-h-[8rem] flex-col gap-2 overflow-y-auto px-2 pb-2">
        {sorted.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-neutral-400">Nothing {stage === 'waiting' ? 'parked' : 'here'}</p>
        )}
        {sorted.map((card) => (
          <CardTile key={card.id} card={card} now={now} />
        ))}
        {hidden > 0 && (
          <Link
            to="/completed"
            className="rounded-lg px-2 py-2 text-center text-xs text-neutral-500 outline-none ring-neutral-900/10 hover:text-neutral-900 focus-visible:ring-4 dark:ring-white/20 dark:hover:text-neutral-100"
          >
            {hidden} older delivered card{hidden === 1 ? '' : 's'} in Completed →
          </Link>
        )}
      </div>
    </section>
  )
})
