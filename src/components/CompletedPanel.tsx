import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, CheckSquare, ChevronDown, ChevronUp, Download, ImageOff, Loader2, Square } from 'lucide-react'
import { FINALS_BUCKET, ORIGINALS_BUCKET } from '../lib/supabase'
import { DeleteButton } from './DeleteButton'
import { getSignedUrl } from '../lib/signedUrls'
import { downloadJob, downloadJobsAsZip, type ZipProgress } from '../lib/download'
import type { Batch, Job } from '../lib/types'
import { useToast } from '../lib/toast'

interface Props {
  doneJobs: Job[]
  batches: Batch[]
  currentBatch: Batch | null
  onSelectBatch: (id: string) => void
  onDelete: (job: Job) => Promise<void>
  onDeleteMany: (jobs: Job[]) => Promise<{ failed: number }>
}

export function CompletedPanel({ doneJobs, batches, currentBatch, onSelectBatch, onDelete, onDeleteMany }: Props) {
  const toast = useToast()
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const currentBatchDone = useMemo(
    () => (currentBatch ? doneJobs.filter((j) => j.batch_id === currentBatch.id) : []),
    [doneJobs, currentBatch],
  )
  const batchName = useMemo(() => {
    const m = new Map(batches.map((b) => [b.id, b.name]))
    return (id: string) => m.get(id) ?? 'Unknown batch'
  }, [batches])

  // Prune selections whose jobs disappeared.
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(doneJobs.map((j) => j.id))
      const next = new Set([...prev].filter((id) => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [doneJobs])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const allSelected = doneJobs.length > 0 && selected.size === doneJobs.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(doneJobs.map((j) => j.id)))

  const single = useCallback(
    async (job: Job) => {
      setDownloadingId(job.id)
      try {
        await downloadJob(job)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Download failed')
      } finally {
        setDownloadingId(null)
      }
    },
    [toast],
  )

  const zip = useCallback(
    async (jobs: Job[], name: string) => {
      if (!jobs.length || zipProgress) return
      setZipProgress({ done: 0, total: jobs.length, phase: 'fetching' })
      try {
        const { failed } = await downloadJobsAsZip(jobs, name, setZipProgress)
        if (failed.length) toast.error(`${failed.length} file${failed.length === 1 ? '' : 's'} could not be added to the zip`)
        else toast.success(`Zipped ${jobs.length} file${jobs.length === 1 ? '' : 's'}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Zip failed')
      } finally {
        setZipProgress(null)
      }
    },
    [toast, zipProgress],
  )

  const selectedJobs = doneJobs.filter((j) => selected.has(j.id))
  const [deleting, setDeleting] = useState(false)
  const busy = zipProgress !== null || deleting

  const deleteSelected = useCallback(async () => {
    if (!selectedJobs.length) return
    setDeleting(true)
    try {
      const { failed } = await onDeleteMany(selectedJobs)
      if (failed) toast.error(`${failed} design${failed === 1 ? '' : 's'} could not be deleted`)
      else toast.success(`Deleted ${selectedJobs.length} design${selectedJobs.length === 1 ? '' : 's'}`)
      setSelected(new Set())
    } finally {
      setDeleting(false)
    }
  }, [selectedJobs, onDeleteMany, toast])

  const deleteOne = useCallback(
    async (job: Job) => {
      try {
        await onDelete(job)
        toast.success(`Deleted ${job.original_name}`)
      } catch (e) {
        toast.error(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [onDelete, toast],
  )

  return (
    <aside className="flex flex-col rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-104px)]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between px-4 py-3 text-left lg:cursor-default"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-semibold">
          Completed
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs tabular-nums dark:bg-neutral-800">
            {doneJobs.length}
          </span>
        </span>
        <span className="lg:hidden">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
      </button>

      <div className={`${open ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex`}>
        <div className="space-y-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <label className="block text-xs">
            <span className="mb-1 block text-neutral-500">Batches</span>
            <select
              value={currentBatch?.id ?? ''}
              onChange={(e) => onSelectBatch(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            >
              {batches.length === 0 && <option value="">No batches yet</option>}
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || currentBatchDone.length === 0}
              onClick={() => currentBatch && zip(currentBatchDone, currentBatch.name)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              <Archive className="h-3.5 w-3.5" />
              Download all ({currentBatchDone.length})
            </button>
            <button
              disabled={busy || selectedJobs.length === 0}
              onClick={() => zip(selectedJobs, currentBatch ? `${currentBatch.name} selected` : 'selected')}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <Download className="h-3.5 w-3.5" />
              Download selected ({selectedJobs.length})
            </button>
            <DeleteButton
              variant="button"
              onConfirm={deleteSelected}
              disabled={busy || selectedJobs.length === 0}
              label={`Delete selected (${selectedJobs.length})`}
              className="w-full"
            />
          </div>

          {zipProgress && (
            <div className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              <div className="flex justify-between">
                <span className="truncate">
                  {zipProgress.phase === 'zipping' ? 'Creating zip…' : `Fetching ${zipProgress.current ?? ''}`}
                </span>
                <span className="tabular-nums">
                  {zipProgress.done}/{zipProgress.total}
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(zipProgress.done / Math.max(zipProgress.total, 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {doneJobs.length > 0 && (
            <button
              onClick={toggleAll}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              {allSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {allSelected ? 'Clear selection' : 'Select all'}
            </button>
          )}
        </div>

        <ul className="min-h-0 flex-1 divide-y divide-neutral-200 overflow-y-auto border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {doneJobs.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-neutral-500">
              Nothing finished yet. Completed images will appear here.
            </li>
          )}
          {doneJobs.map((job) => (
            <CompletedRow
              key={job.id}
              job={job}
              batchName={batchName(job.batch_id)}
              checked={selected.has(job.id)}
              onToggle={toggle}
              onDownload={single}
              onDelete={deleteOne}
              downloading={downloadingId === job.id}
            />
          ))}
        </ul>
      </div>
    </aside>
  )
}

interface RowProps {
  job: Job
  batchName: string
  checked: boolean
  downloading: boolean
  onToggle: (id: string) => void
  onDownload: (job: Job) => void
  onDelete: (job: Job) => Promise<void>
}

const CompletedRow = memo(function CompletedRow({ job, batchName, checked, downloading, onToggle, onDownload, onDelete }: RowProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [origSrc, setOrigSrc] = useState<string | null>(null)

  // Original thumbnail is fetched lazily, only once the user hovers/toggles.
  useEffect(() => {
    if (!showOriginal || origSrc || !job.original_path) return
    let cancelled = false
    getSignedUrl(ORIGINALS_BUCKET, job.original_path)
      .then((u) => !cancelled && setOrigSrc(u))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [showOriginal, origSrc, job.original_path])

  useEffect(() => {
    if (!job.final_path) return
    let cancelled = false
    getSignedUrl(FINALS_BUCKET, job.final_path)
      .then((u) => !cancelled && setSrc(u))
      .catch(() => !cancelled && setBroken(true))
    return () => {
      cancelled = true
    }
  }, [job.final_path])

  const dims =
    job.final_w && job.final_h
      ? `${job.final_w}×${job.final_h}${job.dpi ? ` · ${job.dpi} DPI` : ''}`
      : job.dpi
        ? `${job.dpi} DPI`
        : '—'

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(job.id)}
        aria-label={`Select ${job.original_name}`}
        className="h-4 w-4 shrink-0 accent-neutral-900 dark:accent-white"
      />
      <button
        type="button"
        onMouseEnter={() => setShowOriginal(true)}
        onMouseLeave={() => setShowOriginal(false)}
        onClick={() => setShowOriginal((v) => !v)}
        title={showOriginal ? 'Original upload (hover/click to toggle)' : 'Final: background removed, upscaled, 300 DPI. Hover to see the original.'}
        aria-label={showOriginal ? 'Showing original' : 'Showing final'}
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[conic-gradient(#e5e5e5_25%,transparent_0_50%,#e5e5e5_0_75%,transparent_0)] bg-[length:12px_12px] dark:bg-[conic-gradient(#404040_25%,transparent_0_50%,#404040_0_75%,transparent_0)]"
      >
        {showOriginal && origSrc ? (
          <img src={origSrc} alt="" decoding="async" className="h-full w-full object-cover" />
        ) : broken || !job.final_path ? (
          <div className="flex h-full w-full items-center justify-center text-neutral-400">
            <ImageOff className="h-4 w-4" />
          </div>
        ) : src ? (
          <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-contain" />
        ) : (
          <div className="h-full w-full animate-pulse bg-neutral-200/60 dark:bg-neutral-800/60" />
        )}
        <span
          className={`absolute bottom-0 left-0 rounded-tr px-1 text-[9px] font-semibold uppercase leading-3 tracking-wide ${
            showOriginal && origSrc
              ? 'bg-neutral-700/90 text-white'
              : 'bg-emerald-600/90 text-white'
          }`}
        >
          {showOriginal && origSrc ? 'Orig' : 'Final'}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={job.original_name}>
          {job.original_name}
        </p>
        <p className="truncate text-xs text-neutral-500">{dims}</p>
        <p className="truncate text-[11px] text-neutral-400" title={batchName}>
          {batchName}
        </p>
      </div>
      <button
        onClick={() => onDownload(job)}
        disabled={downloading || !job.final_path}
        aria-label={`Download ${job.original_name}`}
        className="shrink-0 rounded-lg border border-neutral-300 p-1.5 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
      <DeleteButton onConfirm={() => onDelete(job)} ariaLabel={`Delete ${job.original_name}`} />
    </li>
  )
})
