import { memo, useEffect, useState } from 'react'
import { AlertTriangle, ImageOff, Loader2, RotateCcw } from 'lucide-react'
import { ORIGINALS_BUCKET } from '../lib/supabase'
import { getSignedUrl } from '../lib/signedUrls'
import { STATUS_LABEL, isProcessing, type Job, type JobStatus, type UploadState } from '../lib/types'
import { DeleteButton } from './DeleteButton'

export type TileStatus = JobStatus | UploadState

interface Props {
  id: string
  name: string
  status: TileStatus
  error?: string | null
  /** Object URL of the dropped file, if still in memory. */
  previewUrl?: string
  originalPath?: string
  onRetry?: () => void
  onDismiss?: () => void
  onDelete?: () => void | Promise<void>
  job?: Job
}

const CHIP: Record<TileStatus, string> = {
  uploading: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
  queued: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
  dispatched: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  upscaling: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  removing_bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  finishing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
}

function label(s: TileStatus): string {
  if (s === 'uploading') return 'Uploading'
  if (s === 'error') return 'Upload failed'
  return STATUS_LABEL[s]
}

function Thumb({ previewUrl, originalPath }: { previewUrl?: string; originalPath?: string }) {
  const [src, setSrc] = useState<string | undefined>(previewUrl)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    if (previewUrl) {
      setSrc(previewUrl)
      return
    }
    if (!originalPath) return
    let cancelled = false
    getSignedUrl(ORIGINALS_BUCKET, originalPath)
      .then((u) => !cancelled && setSrc(u))
      .catch(() => !cancelled && setBroken(true))
    return () => {
      cancelled = true
    }
  }, [previewUrl, originalPath])

  if (broken || (!src && !originalPath)) {
    return (
      <div className="flex h-full w-full items-center justify-center text-neutral-300 dark:text-neutral-700">
        <ImageOff className="h-6 w-6" />
      </div>
    )
  }
  if (!src) return <div className="h-full w-full animate-pulse bg-neutral-200 dark:bg-neutral-800" />
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  )
}

export const JobTile = memo(function JobTile({
  name,
  status,
  error,
  previewUrl,
  originalPath,
  onRetry,
  onDismiss,
  onDelete,
}: Props) {
  const busy = status === 'uploading' || (status !== 'error' && isProcessing(status))
  const failed = status === 'failed' || status === 'error'
  const active = status !== 'uploading' && status !== 'error' && isProcessing(status)

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      title={failed && error ? error : undefined}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
        <Thumb previewUrl={previewUrl} originalPath={originalPath} />
        {onDelete && (
          <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <DeleteButton
              onConfirm={onDelete}
              disabled={active}
              disabledReason="Wait until it finishes"
              ariaLabel={`Delete ${name}`}
              className="bg-white/90 shadow-sm backdrop-blur dark:bg-neutral-900/90"
            />
          </div>
        )}
        {status === 'uploading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/40">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-700 dark:text-neutral-200" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 p-2.5">
        <p className="truncate text-xs font-medium" title={name}>
          {name}
        </p>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${CHIP[status]}`}
          >
            {busy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
            {failed && <AlertTriangle className="h-3 w-3" />}
            {label(status)}
          </span>
          {status === 'failed' && onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-1.5 py-0.5 text-[11px] font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          )}
          {status === 'error' && onDismiss && (
            <button
              onClick={onDismiss}
              className="rounded-md border border-neutral-300 px-1.5 py-0.5 text-[11px] font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Dismiss
            </button>
          )}
        </div>
        {failed && error && (
          <p className="line-clamp-2 text-[11px] text-red-600 dark:text-red-400" title={error}>
            {error}
          </p>
        )}
      </div>
    </div>
  )
})
