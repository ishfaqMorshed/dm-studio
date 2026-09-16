import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, Inbox, Loader2 } from 'lucide-react'
import { STAGES } from '../lib/stage'
import type { CardStage } from '../lib/types'
import { useProfile } from '../lib/useProfile'
import { BoardColumn } from '../components/board/BoardColumn'
import { BoardFilters } from '../components/board/BoardFilters'
import { matchesCard, readFilters, writeFilters, type BoardFilters as Filters } from '../components/board/filters'
import { useBoardData } from '../components/board/useBoardData'
import { useNow } from '../components/board/useNow'
import type { BoardCard } from '../components/board/types'

function emptyCounts(): Record<CardStage, number> {
  const out = {} as Record<CardStage, number>
  for (const s of STAGES) out[s] = 0
  return out
}

/**
 * /board — one column per stage in SOP order, waiting and failed at the far right.
 * Cards arrive live (Realtime on cards + generations, 20 s poll fallback); filters live in the URL.
 */
export default function BoardPage() {
  const { cards, loading, error, refresh, clients } = useBoardData()
  const { userId } = useProfile()
  const now = useNow()
  const [searchParams, setSearchParams] = useSearchParams()
  const [refreshing, setRefreshing] = useState(false)

  const filters = useMemo(() => readFilters(searchParams), [searchParams])
  const setFilters = useCallback(
    (next: Filters) => setSearchParams(writeFilters(next), { replace: true }),
    [setSearchParams],
  )

  // Client and "mine" narrow the cards; the stage chips only hide columns.
  const matching = useMemo(() => cards.filter((c) => matchesCard(c, filters, userId)), [cards, filters, userId])

  const { byStage, counts } = useMemo(() => {
    const byStage = new Map<CardStage, BoardCard[]>()
    const counts = emptyCounts()
    for (const s of STAGES) byStage.set(s, [])
    for (const c of matching) {
      byStage.get(c.stage)?.push(c)
      counts[c.stage] += 1
    }
    return { byStage, counts }
  }, [matching])

  const visibleStages = STAGES.filter((s) => filters.stages.has(s))
  const visibleCount = visibleStages.reduce((n, s) => n + counts[s], 0)

  const manualRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }, [refresh])

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h1 className="text-lg font-semibold">Board</h1>
        <p className="hidden text-xs text-neutral-500 sm:block">Updates live. Open a card to edit the brief, review output or move it on.</p>
      </div>

      <BoardFilters
        filters={filters}
        onChange={setFilters}
        clients={clients}
        countsByStage={counts}
        visibleCount={visibleCount}
        totalCount={cards.length}
        refreshing={refreshing}
        onRefresh={() => void manualRefresh()}
      />

      {error && (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Could not load cards: {error}. {cards.length ? 'Showing the last good copy.' : 'Check your connection and try again.'}
          </span>
          <button
            type="button"
            onClick={() => void manualRefresh()}
            disabled={refreshing}
            className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium outline-none ring-red-500/20 hover:bg-red-100 focus-visible:ring-4 disabled:opacity-50 dark:border-red-800 dark:hover:bg-red-900/40"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-neutral-400" role="status" aria-label="Loading cards">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : cards.length === 0 ? (
        // With nothing loaded the error banner above says it all; only a clean empty board gets the hint.
        !error && <EmptyBoard />
      ) : (
        <>
          {matching.length === 0 && (
            <p className="mb-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              No cards match these filters.{' '}
              {filters.mine && 'Only cards you approved count as yours. '}
              {filters.clientId && 'This client has no cards on the board. '}
              Use “Show everything” to clear the filters.
            </p>
          )}
          <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6" aria-label="Stage columns">
            <div className="flex items-start gap-3">
              {visibleStages.map((stage) => (
                <BoardColumn key={stage} stage={stage} cards={byStage.get(stage) ?? []} now={now} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function EmptyBoard() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
      <Inbox className="mx-auto mb-3 h-8 w-8 text-neutral-400" />
      <h2 className="text-base font-semibold">No cards yet</h2>
      <p className="mt-1 text-sm text-neutral-500">
        A card appears here the moment a client submits their brief form. Send a client their form link from{' '}
        <Link
          to="/clients"
          className="font-medium text-neutral-900 underline underline-offset-2 outline-none focus-visible:ring-4 focus-visible:ring-neutral-900/10 dark:text-white"
        >
          Clients
        </Link>
        .
      </p>
    </div>
  )
}
