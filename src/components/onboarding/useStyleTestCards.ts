import { useCallback, useMemo } from 'react'
import { listStyleTestCards, type TestCard } from '../../lib/api'
import { useAuth } from '../../lib/useAuth'
import { useRealtimeTable } from '../../lib/useRealtimeTable'
import { newestFirst } from './profilerOrder'

export interface StyleTestCards {
  /** Newest first. */
  rows: TestCard[]
  latest: TestCard | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  upsertLocal: (row: Partial<TestCard> & { id: string }) => void
}

/**
 * The client's hidden `style_test` cards: realtime on `cards` (client filter; other sources are
 * dropped) plus the 20 s poll. Stage changes arrive live; the joined generation refreshes with
 * the debounced refetch that follows every event.
 */
export function useStyleTestCards(clientId: string): StyleTestCards {
  const { user } = useAuth()
  const fetch = useCallback(() => listStyleTestCards(clientId), [clientId])
  const table = useRealtimeTable<TestCard>({
    table: 'cards',
    filter: `client_id=eq.${clientId}`,
    fetch,
    enabled: Boolean(user),
    onEvent: (p) => p.eventType === 'DELETE' || (p.new as Partial<TestCard>).source === 'style_test',
  })

  const rows = useMemo(() => [...table.rows].sort(newestFirst), [table.rows])
  return useMemo(
    () => ({
      rows,
      latest: rows[0] ?? null,
      loading: table.loading,
      error: table.error,
      refresh: table.refresh,
      upsertLocal: table.upsertLocal,
    }),
    [rows, table.loading, table.error, table.refresh, table.upsertLocal],
  )
}
