import { useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { PublicTable } from '../../lib/useRealtimeTable'

const DEBOUNCE_MS = 1_200

/**
 * Fire `onChange` (debounced) whenever any row of `table` changes.
 * Used to refetch cards when a generation lands, because a new image_path
 * on the current generation does not touch the cards row.
 */
export function useTableEvents(table: PublicTable, onChange: () => void, enabled = true): void {
  const cbRef = useRef(onChange)
  useEffect(() => {
    cbRef.current = onChange
  })

  useEffect(() => {
    if (!enabled) return
    let pending: number | null = null
    const channel = supabase
      .channel(`board:${table}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        if (pending !== null) window.clearTimeout(pending)
        pending = window.setTimeout(() => {
          pending = null
          cbRef.current()
        }, DEBOUNCE_MS)
      })
      .subscribe()
    return () => {
      if (pending !== null) window.clearTimeout(pending)
      void supabase.removeChannel(channel)
    }
  }, [table, enabled])
}
