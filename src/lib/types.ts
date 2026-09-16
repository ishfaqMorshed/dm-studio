export type JobStatus =
  | 'queued'
  | 'dispatched'
  | 'upscaling'
  | 'removing_bg'
  | 'finishing'
  | 'done'
  | 'failed'

export const PROCESSING_STATUSES: JobStatus[] = ['dispatched', 'upscaling', 'removing_bg', 'finishing']

export interface Batch {
  id: string
  user_id: string
  name: string
  created_at: string
}

export interface Job {
  id: string
  batch_id: string
  user_id: string
  original_path: string
  original_name: string
  status: JobStatus
  attempt: number | null
  error: string | null
  final_path: string | null
  final_w: number | null
  final_h: number | null
  dpi: number | null
  created_at: string
  updated_at: string | null
  completed_at: string | null
}

/** Client-side upload state, before a fin_jobs row exists (or while it's being created). */
export type UploadState = 'uploading' | 'queued' | 'error'

export interface PendingUpload {
  id: string
  batch_id: string
  name: string
  state: UploadState
  error?: string
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  dispatched: 'Dispatched',
  upscaling: 'Upscaling',
  removing_bg: 'Removing background',
  finishing: 'Finishing',
  done: 'Done',
  failed: 'Failed',
}

export function isProcessing(s: JobStatus): boolean {
  return PROCESSING_STATUSES.includes(s)
}

export function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  const ext = i >= 0 ? name.slice(i + 1).toLowerCase() : ''
  return ext || 'bin'
}
