import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { FINALS_BUCKET, ORIGINALS_BUCKET, PREP_BUCKET, supabase } from '../lib/supabase'
import type { Batch, Job } from '../lib/types'

const POLL_MS = 20_000

interface UseJobsResult {
  batches: Batch[]
  jobs: Job[]
  loading: boolean
  refresh: () => Promise<void>
  /** Optimistically merge a job into local state (e.g. right after insert). */
  upsertLocal: (job: Job) => void
  addBatchLocal: (batch: Batch) => void
  retryJob: (job: Job) => Promise<void>
  /** Deletes storage objects + row. Optimistic; throws on row-delete failure. */
  deleteJob: (job: Job) => Promise<void>
  /** Deletes many jobs; resolves with the number that failed. */
  deleteJobs: (jobs: Job[]) => Promise<{ failed: number }>
}

/**
 * Loads all batches + jobs for the signed-in user, keeps them fresh via
 * Realtime (postgres_changes on fin_jobs) and a 20s polling fallback.
 */
export function useJobs(userId: string | null): UseJobsResult {
  const [batches, setBatches] = useState<Batch[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const refreshing = useRef(false)

  const refresh = useCallback(async () => {
    if (!userId || refreshing.current) return
    refreshing.current = true
    try {
      const [b, j] = await Promise.all([
        supabase.from('fin_batches').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('fin_jobs').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      ])
      if (b.error) throw b.error
      if (j.error) throw j.error
      setBatches((b.data ?? []) as Batch[])
      // Merge: server is source of truth, but keep any local rows the server doesn't know yet
      // (an insert that raced with this refresh).
      setJobs((prev) => {
        const server = (j.data ?? []) as Job[]
        const ids = new Set(server.map((x) => x.id))
        const localOnly = prev.filter((x) => !ids.has(x.id) && Date.now() - Date.parse(x.created_at) < 60_000)
        return localOnly.length ? [...server, ...localOnly] : server
      })
    } catch (e) {
      console.error('refresh failed', e)
    } finally {
      refreshing.current = false
      setLoading(false)
    }
  }, [userId])

  const upsertLocal = useCallback((job: Job) => {
    setJobs((prev) => {
      const i = prev.findIndex((x) => x.id === job.id)
      if (i === -1) return [...prev, job]
      const next = prev.slice()
      next[i] = { ...prev[i], ...job }
      return next
    })
  }, [])

  const addBatchLocal = useCallback((batch: Batch) => {
    setBatches((prev) => (prev.some((b) => b.id === batch.id) ? prev : [batch, ...prev]))
  }, [])

  // Initial load + polling fallback
  useEffect(() => {
    if (!userId) {
      setBatches([])
      setJobs([])
      setLoading(false)
      return
    }
    setLoading(true)
    void refresh()
    const t = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(t)
  }, [userId, refresh])

  // Realtime
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`fin_jobs:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fin_jobs', filter: `user_id=eq.${userId}` },
        (payload: RealtimePostgresChangesPayload<Job>) => {
          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as Partial<Job>).id
            if (oldId) setJobs((prev) => prev.filter((x) => x.id !== oldId))
            return
          }
          upsertLocal(payload.new as Job)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, upsertLocal])

  const retryJob = useCallback(
    async (job: Job) => {
      const attempt = (job.attempt ?? 0) + 1
      // optimistic
      upsertLocal({ ...job, status: 'queued', attempt, error: null })
      // Re-sign on every retry: the 24h original link and the one-shot final upload slot
      // may be expired, consumed, or (for rows created before signing existed) missing.
      const { data: signed, error: signErr } = await supabase.storage
        .from(ORIGINALS_BUCKET)
        .createSignedUrl(job.original_path, 60 * 60 * 24)
      if (signErr || !signed?.signedUrl) {
        upsertLocal(job)
        throw signErr ?? new Error('Could not sign original for retry')
      }
      if (job.final_path) {
        // clear any half-written final so the new upload slot can be created
        await supabase.storage.from(FINALS_BUCKET).remove([job.final_path])
      }
      const finalPath = `${job.user_id}/${job.id}.png`
      const { data: slot, error: slotErr } = await supabase.storage
        .from(FINALS_BUCKET)
        .createSignedUploadUrl(finalPath, { upsert: true })
      if (slotErr || !slot?.token) {
        upsertLocal(job)
        throw slotErr ?? new Error('Could not create upload slot for retry')
      }
      const { data, error } = await supabase
        .from('fin_jobs')
        .update({
          status: 'queued',
          attempt,
          error: null,
          original_url: signed.signedUrl,
          final_upload_token: slot.token,
          final_path: null,
        })
        .eq('id', job.id)
        .select()
        .single()
      if (error) {
        upsertLocal(job) // roll back
        throw error
      }
      if (data) upsertLocal(data as Job)
    },
    [upsertLocal],
  )

  const deleteJob = useCallback(async (job: Job) => {
    // optimistic
    setJobs((prev) => prev.filter((x) => x.id !== job.id))
    try {
      // Storage first; not-found errors are fine (object may never have been written).
      const removals: Array<[string, string]> = [
        [ORIGINALS_BUCKET, job.original_path],
        [PREP_BUCKET, `${job.user_id}/${job.id}.png`],
      ]
      if (job.final_path) removals.push([FINALS_BUCKET, job.final_path])
      await Promise.all(
        removals.map(async ([bucket, path]) => {
          if (!path) return
          const { error } = await supabase.storage.from(bucket).remove([path])
          if (error && !/not.?found/i.test(error.message)) {
            console.warn(`storage remove failed (${bucket}/${path})`, error.message)
          }
        }),
      )
      const { error } = await supabase.from('fin_jobs').delete().eq('id', job.id)
      if (error) throw error
    } catch (e) {
      setJobs((prev) => (prev.some((x) => x.id === job.id) ? prev : [...prev, job])) // roll back
      throw e
    }
  }, [])

  const deleteJobs = useCallback(
    async (list: Job[]) => {
      const results = await Promise.allSettled(list.map((j) => deleteJob(j)))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed) void refresh()
      return { failed }
    },
    [deleteJob, refresh],
  )

  const sortedJobs = useMemo(
    () => jobs.slice().sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
    [jobs],
  )

  return { batches, jobs: sortedJobs, loading, refresh, upsertLocal, addBatchLocal, retryJob, deleteJob, deleteJobs }
}
