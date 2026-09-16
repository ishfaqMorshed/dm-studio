/**
 * Data hooks for one card: the card row (with its client), every generation, the
 * finisher jobs and the client's locked Style Card. cards / generations / fin_jobs
 * are in the realtime publication, so they ride `useRealtimeTable`; the Style Card
 * comes from the `current_style_card` RPC and is refetched on demand.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { currentStyleCard } from '../../lib/api'
import { useRealtimeTable } from '../../lib/useRealtimeTable'
import { errorMessage, type Card, type FinJob, type Generation, type StyleCard } from '../../lib/types'

export interface CardClient {
  name: string
  garment_colors: string[]
  default_similarity_tier: number
  form_token: string
}

export interface CardRow extends Card {
  clients: CardClient | null
}

export function useCardRow(cardId: string) {
  const fetch = useCallback(async (): Promise<CardRow[]> => {
    const { data, error } = await supabase
      .from('cards')
      .select('*, clients(name, garment_colors, default_similarity_tier, form_token)')
      .eq('id', cardId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? [data] : []
  }, [cardId])

  const table = useRealtimeTable<CardRow>({ table: 'cards', filter: `id=eq.${cardId}`, fetch })

  return useMemo(
    () => ({
      card: table.rows[0] ?? null,
      loading: table.loading,
      error: table.error,
      refresh: table.refresh,
      upsertLocal: table.upsertLocal,
    }),
    [table],
  )
}

function newestFirst<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}

export function useCardGenerations(cardId: string) {
  const fetch = useCallback(async (): Promise<Generation[]> => {
    const { data, error } = await supabase
      .from('generations')
      .select('*')
      .eq('card_id', cardId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data
  }, [cardId])

  const table = useRealtimeTable<Generation>({ table: 'generations', filter: `card_id=eq.${cardId}`, fetch })
  const rows = useMemo(() => newestFirst(table.rows), [table.rows])

  return useMemo(
    () => ({ rows, loading: table.loading, error: table.error, refresh: table.refresh, upsertLocal: table.upsertLocal }),
    [rows, table.loading, table.error, table.refresh, table.upsertLocal],
  )
}

export function useCardFinJobs(cardId: string) {
  const fetch = useCallback(async (): Promise<FinJob[]> => {
    const { data, error } = await supabase
      .from('fin_jobs')
      .select('*')
      .eq('card_id', cardId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data
  }, [cardId])

  const table = useRealtimeTable<FinJob>({ table: 'fin_jobs', filter: `card_id=eq.${cardId}`, fetch })
  const rows = useMemo(() => newestFirst(table.rows), [table.rows])

  return useMemo(
    () => ({ rows, loading: table.loading, error: table.error, refresh: table.refresh, upsertLocal: table.upsertLocal }),
    [rows, table.loading, table.error, table.refresh, table.upsertLocal],
  )
}

interface StyleCardState {
  clientId: string | null
  styleCard: StyleCard | null
  loaded: boolean
  error: string | null
}

/**
 * The client's current locked Style Card, or null. `current_style_card` may return
 * a row of nulls when nothing is locked, so anything without an id or not locked
 * counts as "none".
 */
export function useStyleCard(clientId: string | null) {
  const [state, setState] = useState<StyleCardState>({ clientId: null, styleCard: null, loaded: false, error: null })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    currentStyleCard(clientId)
      .then((sc) => {
        if (cancelled) return
        const locked = sc && sc.id && sc.status === 'locked' ? sc : null
        setState({ clientId, styleCard: locked, loaded: true, error: null })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({ clientId, styleCard: null, loaded: true, error: errorMessage(e, 'Could not load the Style Card') })
      })
    return () => {
      cancelled = true
    }
  }, [clientId, tick])

  const refresh = useCallback(async () => {
    setTick((t) => t + 1)
  }, [])

  const matches = state.clientId === clientId
  return useMemo(
    () => ({
      styleCard: matches ? state.styleCard : null,
      loading: Boolean(clientId) && !(matches && state.loaded),
      error: matches ? state.error : null,
      refresh,
    }),
    [matches, state, clientId, refresh],
  )
}
