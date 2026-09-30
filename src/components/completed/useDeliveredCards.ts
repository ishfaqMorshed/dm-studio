import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { VISIBLE_CARD_SOURCE_EXCLUDED } from '../../lib/types'
import { useRealtimeTable, type UseRealtimeTableResult } from '../../lib/useRealtimeTable'
import type { DeliveredCard } from './finals'

/**
 * Client name for the tile, every finisher job for the metrics badge and download path,
 * and the current generation's image for the hover comparison. The FK hint is needed
 * because cards and generations reference each other.
 */
const SELECT =
  '*, clients(name), fin_jobs(*), current_generation:generations!cards_current_generation_fk(image_path)'

/**
 * Delivered cards, newest first, kept live by realtime on `cards` plus the 20 s poll.
 * `clientId` (the header's scope) narrows the query; null means every client.
 */
export function useDeliveredCards(clientId: string | null = null): UseRealtimeTableResult<DeliveredCard> {
  const fetch = useCallback(async (): Promise<DeliveredCard[]> => {
    let query = supabase.from('cards').select(SELECT).eq('stage', 'delivered').neq('source', VISIBLE_CARD_SOURCE_EXCLUDED)
    if (clientId) query = query.eq('client_id', clientId)
    const { data, error } = await query.order('stage_entered_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data
  }, [clientId])

  const table = useRealtimeTable<DeliveredCard>({
    table: 'cards',
    filter: 'stage=eq.delivered',
    fetch,
    // Realtime rows carry no joins (no client name, no finals). Skip the raw merge so a
    // half-empty tile never flashes; the hook's debounced refetch brings the full row.
    onEvent: () => false,
  })

  // The scope changed: fetch the new client's cards now instead of waiting for the poll.
  const { refresh } = table
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    void refresh()
  }, [clientId, refresh])

  return table
}
