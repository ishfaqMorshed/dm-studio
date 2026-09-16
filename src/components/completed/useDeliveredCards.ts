import { useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useRealtimeTable, type UseRealtimeTableResult } from '../../lib/useRealtimeTable'
import type { DeliveredCard } from './finals'

/**
 * Client name for the tile, every finisher job for the metrics badge and download path,
 * and the current generation's image for the hover comparison. The FK hint is needed
 * because cards and generations reference each other.
 */
const SELECT =
  '*, clients(name), fin_jobs(*), current_generation:generations!cards_current_generation_fk(image_path)'

/** Delivered cards, newest first, kept live by realtime on `cards` plus the 20 s poll. */
export function useDeliveredCards(): UseRealtimeTableResult<DeliveredCard> {
  const fetch = useCallback(async (): Promise<DeliveredCard[]> => {
    const { data, error } = await supabase
      .from('cards')
      .select(SELECT)
      .eq('stage', 'delivered')
      .order('stage_entered_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data
  }, [])

  return useRealtimeTable<DeliveredCard>({
    table: 'cards',
    filter: 'stage=eq.delivered',
    fetch,
    // Realtime rows carry no joins (no client name, no finals). Skip the raw merge so a
    // half-empty tile never flashes; the hook's debounced refetch brings the full row.
    onEvent: () => false,
  })
}
