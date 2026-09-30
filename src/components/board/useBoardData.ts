import { useCallback, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { VISIBLE_CARD_SOURCE_EXCLUDED } from '../../lib/types'
import { useRealtimeTable } from '../../lib/useRealtimeTable'
import { useTableEvents } from './useTableEvents'
import type { BoardCard } from './types'

/**
 * Every card with its client name and the current generation's image path.
 * The FK hint is required because cards and generations are linked both ways.
 */
const BOARD_SELECT =
  '*, client:clients(name), current_generation:generations!cards_current_generation_fk(id, image_path, status)'

async function fetchBoardCards(clientId: string | null): Promise<BoardCard[]> {
  // Onboarding test renders run the real pipeline but never sit on the board.
  let query = supabase.from('cards').select(BOARD_SELECT).neq('source', VISIBLE_CARD_SOURCE_EXCLUDED)
  if (clientId) query = query.eq('client_id', clientId)
  const { data, error } = await query.order('stage_entered_at', { ascending: true })
  if (error) throw error
  return data
}

export interface BoardData {
  cards: BoardCard[]
  /** True until the first cards fetch settles. */
  loading: boolean
  /** Message of the last failed cards fetch; null once a fetch succeeds again. */
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Live board data: cards via Realtime + 20 s poll (useRealtimeTable) and a refetch whenever
 * a generation row changes (thumbnails). `clientId` (the header's scope) narrows the query
 * and the subscription; null means every client.
 */
export function useBoardData(clientId: string | null): BoardData {
  const { user } = useAuth()
  const enabled = Boolean(user)

  const fetch = useCallback(() => fetchBoardCards(clientId), [clientId])

  const cards = useRealtimeTable<BoardCard>({
    table: 'cards',
    fetch,
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    enabled,
    // A hidden test card's realtime row must not be merged into the board.
    onEvent: (p) => p.eventType === 'DELETE' || (p.new as Partial<BoardCard>).source !== VISIBLE_CARD_SOURCE_EXCLUDED,
  })

  // A finished generation sets image_path on generations, not on cards.
  useTableEvents('generations', cards.refresh, enabled)

  // The scope changed: fetch the new client's cards now instead of waiting for the poll.
  const { refresh } = cards
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    void refresh()
  }, [clientId, refresh])

  return useMemo(
    () => ({
      cards: cards.rows,
      loading: cards.loading,
      error: cards.error,
      refresh: cards.refresh,
    }),
    [cards.rows, cards.loading, cards.error, cards.refresh],
  )
}
