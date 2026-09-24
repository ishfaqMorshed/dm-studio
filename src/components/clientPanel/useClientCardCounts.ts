import { useCallback, useMemo } from 'react'
import { STAGES } from '../../lib/stage'
import { supabase } from '../../lib/supabase'
import type { Card, CardStage } from '../../lib/types'
import { useAuth } from '../../lib/useAuth'
import { useRealtimeTable } from '../../lib/useRealtimeTable'

type StageRow = Pick<Card, 'id' | 'client_id' | 'stage'>

export interface ClientCardCounts {
  counts: Record<CardStage, number>
  total: number
  /** True until the first fetch settles. */
  loading: boolean
  error: string | null
}

export function emptyCounts(): Record<CardStage, number> {
  const out = {} as Record<CardStage, number>
  for (const s of STAGES) out[s] = 0
  return out
}

/** Live count of this client's cards per stage: Realtime on `cards` filtered to the client, 20 s poll fallback. */
export function useClientCardCounts(clientId: string): ClientCardCounts {
  const { user } = useAuth()
  const enabled = Boolean(user)

  const fetch = useCallback(async (): Promise<StageRow[]> => {
    const { data, error } = await supabase.from('cards').select('id, client_id, stage').eq('client_id', clientId)
    if (error) throw error
    return data
  }, [clientId])

  const table = useRealtimeTable<StageRow>({
    table: 'cards',
    filter: `client_id=eq.${clientId}`,
    fetch,
    enabled,
  })

  return useMemo(() => {
    const counts = emptyCounts()
    for (const r of table.rows) {
      if (r.stage in counts) counts[r.stage] += 1
    }
    return { counts, total: table.rows.length, loading: table.loading, error: table.error }
  }, [table.rows, table.loading, table.error])
}
