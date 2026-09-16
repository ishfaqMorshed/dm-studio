import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Database } from './database.types'

export type PublicTable = keyof Database['public']['Tables']

export const POLL_MS = 20_000
/** Realtime payloads lack joined columns; a short debounced refetch fills them in. */
const REFRESH_AFTER_EVENT_MS = 1_200

const NO_ROWS: never[] = []

export interface UseRealtimeTableOptions<T extends { id: string }> {
  /** Table to subscribe to (must be in the realtime publication: cards, generations, fin_jobs). */
  table: PublicTable
  /**
   * Loads the rows you want to show. May select joins (`*, clients(name)`); realtime
   * events merge into existing rows and schedule a refetch so joined fields stay right.
   * Identity does not matter (kept in a ref), so an inline arrow is fine.
   */
  fetch: () => Promise<T[]>
  /** Optional postgres_changes filter, e.g. `card_id=eq.<id>`. */
  filter?: string
  /** Set false to pause both the subscription and polling (e.g. while signed out). */
  enabled?: boolean
  pollMs?: number
  /**
   * Called with every realtime payload before the built-in merge. Return `false` to skip
   * the merge (e.g. the row no longer matches your fetch's WHERE clause).
   */
  onEvent?: (payload: RealtimePostgresChangesPayload<T>) => boolean | void
}

export interface UseRealtimeTableResult<T extends { id: string }> {
  rows: T[]
  /** True until the first fetch settles. */
  loading: boolean
  /** Message of the last failed fetch; cleared on the next success. */
  error: string | null
  refresh: () => Promise<void>
  /** Optimistic merge (e.g. right after an RPC returns the updated row). */
  upsertLocal: (row: Partial<T> & { id: string }) => void
  removeLocal: (id: string) => void
}

/**
 * Generic "keep a table fresh" hook: initial fetch, postgres_changes subscription,
 * and a 20 s poll fallback. Same pattern as DM Finisher's useJobs.
 *
 * ```ts
 * const cards = useRealtimeTable<CardRow>({
 *   table: 'cards',
 *   fetch: async () => {
 *     const { data, error } = await supabase.from('cards').select('*, clients(name)')
 *     if (error) throw error
 *     return data
 *   },
 * })
 * ```
 */
export function useRealtimeTable<T extends { id: string }>(opts: UseRealtimeTableOptions<T>): UseRealtimeTableResult<T> {
  const { table, filter, enabled = true, pollMs = POLL_MS } = opts
  const [rows, setRows] = useState<T[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchRef = useRef(opts.fetch)
  const onEventRef = useRef(opts.onEvent)
  const refreshing = useRef(false)
  const pendingRefresh = useRef<number | null>(null)

  useEffect(() => {
    fetchRef.current = opts.fetch
    onEventRef.current = opts.onEvent
  })

  const refresh = useCallback(async () => {
    if (!enabled || refreshing.current) return
    refreshing.current = true
    try {
      const next = await fetchRef.current()
      setRows(next)
      setError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`refresh ${table} failed`, e)
      setError(msg)
    } finally {
      refreshing.current = false
      setLoaded(true)
    }
  }, [enabled, table])

  const upsertLocal = useCallback((row: Partial<T> & { id: string }) => {
    setRows((prev) => {
      const i = prev.findIndex((x) => x.id === row.id)
      if (i === -1) return [...prev, row as T]
      const next = prev.slice()
      next[i] = { ...prev[i], ...row }
      return next
    })
  }, [])

  const removeLocal = useCallback((id: string) => {
    setRows((prev) => (prev.some((x) => x.id === id) ? prev.filter((x) => x.id !== id) : prev))
  }, [])

  // Initial load + polling fallback
  useEffect(() => {
    if (!enabled) return
    void refresh()
    const t = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(t)
  }, [enabled, pollMs, refresh])

  // Realtime
  useEffect(() => {
    if (!enabled) return
    const scheduleRefresh = () => {
      if (pendingRefresh.current !== null) window.clearTimeout(pendingRefresh.current)
      pendingRefresh.current = window.setTimeout(() => {
        pendingRefresh.current = null
        void refresh()
      }, REFRESH_AFTER_EVENT_MS)
    }
    const channel = supabase
      .channel(`rt:${table}:${filter ?? 'all'}:${Math.random().toString(36).slice(2, 8)}`)
      .on<T>(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload) => {
          const keep = onEventRef.current?.(payload)
          if (keep !== false) {
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as Partial<T>).id
              if (oldId) removeLocal(oldId)
            } else {
              upsertLocal(payload.new)
            }
          }
          scheduleRefresh()
        },
      )
      .subscribe()
    return () => {
      if (pendingRefresh.current !== null) {
        window.clearTimeout(pendingRefresh.current)
        pendingRefresh.current = null
      }
      void supabase.removeChannel(channel)
    }
  }, [enabled, table, filter, refresh, upsertLocal, removeLocal])

  const visibleRows = enabled ? rows : (NO_ROWS as T[])
  const loading = enabled && !loaded

  return useMemo(
    () => ({ rows: visibleRows, loading, error, refresh, upsertLocal, removeLocal }),
    [visibleRows, loading, error, refresh, upsertLocal, removeLocal],
  )
}
