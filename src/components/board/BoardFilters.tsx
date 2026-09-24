import { Loader2, RotateCcw, User } from 'lucide-react'
import { STAGES, STAGE_ACCENT_CLASS, STAGE_LABEL } from '../../lib/stage'
import type { CardStage } from '../../lib/types'
import { isDefaultFilters, type BoardFilters as Filters } from './filters'

interface Props {
  filters: Filters
  onChange: (next: Filters) => void
  /** Cards per stage after the scope and "mine" filters, so the chips say what a column holds. */
  countsByStage: Record<CardStage, number>
  visibleCount: number
  totalCount: number
  /** True while a fetch is running after the first load. */
  refreshing: boolean
  onRefresh: () => void
}

const RING = 'outline-none ring-neutral-900/10 focus-visible:ring-4 dark:ring-white/20'
const CHIP_OFF =
  'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
const CHIP_ON = 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'

/**
 * Stage chips (each toggles a column), "Mine", reset and a refresh button.
 * The client lives in the header's scope selector, not here.
 */
export function BoardFilters({ filters, onChange, countsByStage, visibleCount, totalCount, refreshing, onRefresh }: Props) {
  const allStages = filters.stages.size === STAGES.length

  function toggleStage(stage: CardStage) {
    const next = new Set(filters.stages)
    if (next.has(stage)) {
      if (next.size === 1) return // never hide every column
      next.delete(stage)
    } else {
      next.add(stage)
    }
    onChange({ ...filters, stages: next })
  }

  /** Alt (Option) + click a chip to show only that stage. */
  function soloStage(stage: CardStage) {
    onChange({ ...filters, stages: new Set([stage]) })
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={filters.mine}
          onClick={() => onChange({ ...filters, mine: !filters.mine })}
          title="Only cards you approved"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${RING} ${
            filters.mine ? CHIP_ON : CHIP_OFF
          }`}
        >
          <User className="h-3.5 w-3.5" />
          Mine
        </button>

        {!isDefaultFilters(filters) && (
          <button
            type="button"
            onClick={() => onChange({ stages: new Set(STAGES), mine: false })}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 ${RING}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Show everything
          </button>
        )}

        <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-neutral-500">
          {visibleCount === totalCount ? `${totalCount} card${totalCount === 1 ? '' : 's'}` : `${visibleCount} of ${totalCount} cards`}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Fetch the latest cards now (the board also updates live and every 20 s)"
            aria-label="Refresh board"
            className={`rounded-lg border border-neutral-300 p-1.5 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800 ${RING}`}
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          </button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Stages shown">
        {STAGES.map((stage) => {
          const on = filters.stages.has(stage)
          const n = countsByStage[stage]
          return (
            <button
              key={stage}
              type="button"
              aria-pressed={on}
              onClick={(e) => (e.altKey ? soloStage(stage) : toggleStage(stage))}
              title={`${on ? 'Hide' : 'Show'} the ${STAGE_LABEL[stage]} column · Alt/Option-click to show only this stage`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${RING} ${on ? CHIP_ON : CHIP_OFF}`}
            >
              <span className={`h-2 w-2 rounded-full ${STAGE_ACCENT_CLASS[stage]}`} aria-hidden="true" />
              {STAGE_LABEL[stage]}
              <span className={`tabular-nums ${on ? 'opacity-70' : 'text-neutral-400'}`}>{n}</span>
            </button>
          )
        })}
        {!allStages && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, stages: new Set(STAGES) })}
            className={`rounded-full px-2 py-1 text-xs text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 ${RING}`}
          >
            All stages
          </button>
        )}
      </div>
    </div>
  )
}
