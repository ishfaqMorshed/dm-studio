import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from './hooks/useAuth'
import { useJobs } from './hooks/useJobs'
import { useUpload } from './hooks/useUpload'
import { ToastProvider, useToast } from './lib/toast'
import { clearSignedUrlCache } from './lib/signedUrls'
import { isProcessing, type Job } from './lib/types'
import { Login } from './components/Login'
import { Header, type BatchCounts } from './components/Header'
import { Dropzone } from './components/Dropzone'
import { JobTile } from './components/JobTile'
import { CompletedPanel } from './components/CompletedPanel'

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  )
}

function Root() {
  const { user, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }
  if (!user) return <Login />
  return (
    <Workspace
      userId={user.id}
      email={user.email ?? null}
      onSignOut={() => {
        clearSignedUrlCache()
        void signOut()
      }}
    />
  )
}

function Workspace({ userId, email, onSignOut }: { userId: string; email: string | null; onSignOut: () => void }) {
  const toast = useToast()
  const { batches, jobs, loading, upsertLocal, addBatchLocal, retryJob, deleteJob, deleteJobs } = useJobs(userId)
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null)

  const { uploadFiles, pending, isUploading, getPreview, dismissPending } = useUpload({
    userId,
    onBatchCreated: (b) => {
      addBatchLocal(b)
      setCurrentBatchId(b.id)
    },
    onJobInserted: upsertLocal,
    onError: toast.error,
  })

  // Default to newest batch once loaded.
  useEffect(() => {
    if (!currentBatchId && batches.length) setCurrentBatchId(batches[0].id)
    if (currentBatchId && batches.length && !batches.some((b) => b.id === currentBatchId)) {
      setCurrentBatchId(batches[0].id)
    }
  }, [batches, currentBatchId])

  const currentBatch = useMemo(() => batches.find((b) => b.id === currentBatchId) ?? null, [batches, currentBatchId])

  const batchJobs = useMemo(
    () => (currentBatchId ? jobs.filter((j) => j.batch_id === currentBatchId) : []),
    [jobs, currentBatchId],
  )
  const batchPending = useMemo(
    () => Object.values(pending).filter((p) => p.batch_id === currentBatchId),
    [pending, currentBatchId],
  )
  const jobIds = useMemo(() => new Set(batchJobs.map((j) => j.id)), [batchJobs])

  const counts = useMemo<BatchCounts>(() => {
    const c: BatchCounts = { total: batchJobs.length, processing: 0, done: 0, failed: 0 }
    for (const j of batchJobs) {
      if (j.status === 'done') c.done++
      else if (j.status === 'failed') c.failed++
      else if (isProcessing(j.status)) c.processing++
    }
    // Files still uploading count toward total so the bar doesn't jump.
    c.total += batchPending.filter((p) => !jobIds.has(p.id)).length
    return c
  }, [batchJobs, batchPending, jobIds])

  const doneJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.status === 'done')
        .sort((a, b) => Date.parse(b.completed_at ?? b.updated_at ?? b.created_at) - Date.parse(a.completed_at ?? a.updated_at ?? a.created_at)),
    [jobs],
  )

  const onFiles = useCallback(
    (files: File[]) => {
      void uploadFiles(files).then((r) => {
        if (r && r.ok) toast.success(`${r.ok} file${r.ok === 1 ? '' : 's'} queued for processing`)
      })
    },
    [uploadFiles, toast],
  )

  const onRetry = useCallback(
    (job: Job) => {
      retryJob(job).catch((e) => toast.error(`Retry failed: ${e instanceof Error ? e.message : String(e)}`))
    },
    [retryJob, toast],
  )

  const onDelete = useCallback(
    async (job: Job) => {
      try {
        await deleteJob(job)
        toast.success(`Deleted ${job.original_name}`)
      } catch (e) {
        toast.error(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [deleteJob, toast],
  )

  return (
    <div className="min-h-screen">
      <Header email={email} counts={counts} batchName={currentBatch?.name ?? null} onSignOut={onSignOut} />

      <main className="mx-auto grid max-w-screen-2xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-4">
          <Dropzone onFiles={onFiles} busy={isUploading} onRejected={toast.error} />

          {loading ? (
            <div className="flex items-center justify-center py-20 text-neutral-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : batchJobs.length === 0 && batchPending.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 px-6 py-16 text-center text-sm text-neutral-500 dark:border-neutral-800">
              {batches.length === 0
                ? 'No batches yet. Drop some images above to get started.'
                : 'This batch is empty.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {batchPending
                .filter((p) => !jobIds.has(p.id))
                .map((p) => (
                  <JobTile
                    key={p.id}
                    id={p.id}
                    name={p.name}
                    status={p.state}
                    error={p.error}
                    previewUrl={getPreview(p.id)}
                    onDismiss={() => dismissPending(p.id)}
                  />
                ))}
              {batchJobs.map((j) => (
                <JobTile
                  key={j.id}
                  id={j.id}
                  name={j.original_name}
                  status={j.status}
                  error={j.error}
                  previewUrl={getPreview(j.id)}
                  originalPath={j.original_path}
                  onRetry={() => onRetry(j)}
                  onDelete={() => onDelete(j)}
                />
              ))}
            </div>
          )}
        </section>

        <CompletedPanel
          doneJobs={doneJobs}
          batches={batches}
          currentBatch={currentBatch}
          onSelectBatch={setCurrentBatchId}
          onDelete={deleteJob}
          onDeleteMany={deleteJobs}
        />
      </main>
    </div>
  )
}
