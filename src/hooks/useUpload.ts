import { useCallback, useRef, useState } from 'react'
import { FINALS_BUCKET, ORIGINALS_BUCKET, supabase } from '../lib/supabase'
import { extOf, type Batch, type Job, type PendingUpload } from '../lib/types'

const CONCURRENCY = 4

interface UseUploadArgs {
  userId: string | null
  onBatchCreated: (batch: Batch) => void
  onJobInserted: (job: Job) => void
  onError: (message: string) => void
}

export interface UploadSummary {
  batch: Batch
  ok: number
  failed: number
}

/**
 * Handles the drop -> batch -> upload (max 4 concurrent) -> insert pipeline.
 * Keeps object URLs for dropped files so tiles can show instant thumbnails.
 */
export function useUpload({ userId, onBatchCreated, onJobInserted, onError }: UseUploadArgs) {
  const [pending, setPending] = useState<Record<string, PendingUpload>>({})
  const [isUploading, setIsUploading] = useState(false)
  const previews = useRef<Map<string, string>>(new Map())

  const setState = useCallback((id: string, patch: Partial<PendingUpload>) => {
    setPending((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev))
  }, [])

  const getPreview = useCallback((jobId: string) => previews.current.get(jobId), [])

  const uploadFiles = useCallback(
    async (files: File[]): Promise<UploadSummary | null> => {
      if (!userId || files.length === 0) return null
      setIsUploading(true)
      try {
        const name = `Batch ${new Date().toLocaleString()}`
        const { data: batch, error: bErr } = await supabase
          .from('fin_batches')
          .insert({ user_id: userId, name })
          .select()
          .single()
        if (bErr || !batch) {
          onError(`Could not create batch: ${bErr?.message ?? 'unknown error'}`)
          return null
        }
        const b = batch as Batch
        onBatchCreated(b)

        // Assign ids + previews up front so the grid renders immediately.
        const items = files.map((file) => {
          const id = crypto.randomUUID()
          previews.current.set(id, URL.createObjectURL(file))
          return { id, file }
        })
        setPending((prev) => {
          const next = { ...prev }
          for (const { id, file } of items) {
            next[id] = { id, batch_id: b.id, name: file.name, state: 'uploading' }
          }
          return next
        })

        let ok = 0
        let failed = 0
        let cursor = 0

        const worker = async () => {
          while (cursor < items.length) {
            const { id, file } = items[cursor++]
            const ext = extOf(file.name)
            const path = `${userId}/${id}.${ext}`
            try {
              const { error: upErr } = await supabase.storage
                .from(ORIGINALS_BUCKET)
                .upload(path, file, { upsert: false, contentType: file.type || undefined })
              if (upErr) throw upErr

              // The worker has no service key: give it a 24h signed download URL for the
              // original and a signed upload slot for the final, both scoped to this job.
              const { data: signed, error: signErr } = await supabase.storage
                .from(ORIGINALS_BUCKET)
                .createSignedUrl(path, 60 * 60 * 24)
              if (signErr || !signed?.signedUrl) throw signErr ?? new Error('Could not sign original')
              const finalPath = `${userId}/${id}.png`
              const { data: slot, error: slotErr } = await supabase.storage
                .from(FINALS_BUCKET)
                .createSignedUploadUrl(finalPath)
              if (slotErr || !slot?.token) throw slotErr ?? new Error('Could not create upload slot')

              const { data: row, error: insErr } = await supabase
                .from('fin_jobs')
                .insert({
                  id,
                  batch_id: b.id,
                  user_id: userId,
                  original_path: path,
                  original_name: file.name,
                  original_url: signed.signedUrl,
                  final_upload_token: slot.token,
                  status: 'queued',
                })
                .select()
                .single()
              if (insErr) throw insErr

              onJobInserted(row as Job)
              setState(id, { state: 'queued' })
              ok++
            } catch (e) {
              failed++
              const msg = e instanceof Error ? e.message : String(e)
              setState(id, { state: 'error', error: msg })
            }
          }
        }

        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))

        // Drop the "queued" placeholders now that real rows exist; keep errors visible.
        setPending((prev) => {
          const next = { ...prev }
          for (const { id } of items) if (next[id]?.state === 'queued') delete next[id]
          return next
        })

        if (failed) onError(`${failed} of ${files.length} file${files.length === 1 ? '' : 's'} failed to upload`)
        return { batch: b, ok, failed }
      } finally {
        setIsUploading(false)
      }
    },
    [userId, onBatchCreated, onJobInserted, onError, setState],
  )

  const dismissPending = useCallback((id: string) => {
    setPending((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  return { uploadFiles, pending, isUploading, getPreview, dismissPending }
}
