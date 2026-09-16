import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/useAuth'
import { useRealtimeTable } from '../../lib/useRealtimeTable'
import { useTableEvents } from './useTableEvents'
import type { BoardCard, ClientOption } from './types'

/**
 * Every card with its client name and the current generation's image path.
 * The FK hint is required because cards and generations are linked both ways.
 */
const BOARD_SELECT =
  '*, client:clients(name), current_generation:generations!cards_current_generation_fk(id, image_path, status)'

async function fetchClients(): Promise<ClientOption[]> {
  const { data, error } = await supabase.from('clients').select('id, name, active').order('name')
  if (error) throw error
  return data
}

async function fetchBoardCards(): Promise<BoardCard[]> {
  const { data, error } = await supabase
    .from('cards')
    .select(BOARD_SELECT)
    .order('stage_entered_at', { ascending: true })
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
  /** Every client, active or not, sorted by name. Empty until loaded. */
  clients: ClientOption[]
}

/**
 * Live board data: cards via Realtime + 20 s poll (useRealtimeTable), a refetch whenever
 * a generation row changes (thumbnails), and the client list for the filter select.
 */
export function useBoardData(): BoardData {
  const { user } = useAuth()
  const enabled = Boolean(user)

  const cards = useRealtimeTable<BoardCard>({ table: 'cards', fetch: fetchBoardCards, enabled })

  // A finished generation sets image_path on generations, not on cards.
  useTableEvents('generations', cards.refresh, enabled)

  // Clients are not in the realtime publication; a slow poll keeps a client added elsewhere visible.
  const [clients, setClients] = useState<ClientOption[]>([])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = () => {
      fetchClients()
        .then((rows) => {
          if (!cancelled) setClients(rows)
        })
        .catch((e: unknown) => console.error('clients load failed', e))
    }
    load()
    const t = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(t)
    }
  }, [enabled])

  return useMemo(
    () => ({
      cards: cards.rows,
      loading: cards.loading,
      error: cards.error,
      refresh: cards.refresh,
      clients,
    }),
    [cards.rows, cards.loading, cards.error, cards.refresh, clients],
  )
}
