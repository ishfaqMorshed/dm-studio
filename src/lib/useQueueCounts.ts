import { useCallback, useMemo } from 'react'
import { supabase } from './supabase'
import { ACTIVE_JOB_STATUSES, type JobStatus } from './types'
import { useAuth } from './useAuth'
import { useRealtimeTable } from './useRealtimeTable'

interface StatusRow {
  id: string
  status: JobStatus
}

export interface QueueCount {
  queued: number
  working: number
}

export interface QueueCounts {
  generations: QueueCount
  finish: QueueCount
  loading: boolean
}

function count(rows: StatusRow[]): QueueCount {
  let queued = 0
  let working = 0
  for (const r of rows) {
    if (r.status === 'queued') queued++
    else if (r.status === 'dispatched' || r.status === 'working') working++
  }
  return { queued, working }
}

/**
 * Live counts of generations and finisher jobs that are queued or running.
 * Backed by realtime on `generations` and `fin_jobs` with the 20 s poll fallback.
 */
export function useQueueCounts(): QueueCounts {
  const { user } = useAuth()
  const enabled = Boolean(user)

  const fetchGenerations = useCallback(async (): Promise<StatusRow[]> => {
    const { data, error } = await supabase
      .from('generations')
      .select('id,status')
      .in('status', [...ACTIVE_JOB_STATUSES])
    if (error) throw error
    return data
  }, [])

  const fetchFinJobs = useCallback(async (): Promise<StatusRow[]> => {
    const { data, error } = await supabase
      .from('fin_jobs')
      .select('id,status')
      .in('status', [...ACTIVE_JOB_STATUSES])
    if (error) throw error
    return data
  }, [])

  const gens = useRealtimeTable<StatusRow>({ table: 'generations', fetch: fetchGenerations, enabled })
  const fins = useRealtimeTable<StatusRow>({ table: 'fin_jobs', fetch: fetchFinJobs, enabled })

  return useMemo(
    () => ({
      generations: count(gens.rows),
      finish: count(fins.rows),
      loading: gens.loading || fins.loading,
    }),
    [gens.rows, fins.rows, gens.loading, fins.loading],
  )
}
