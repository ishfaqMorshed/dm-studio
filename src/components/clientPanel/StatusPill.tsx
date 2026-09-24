import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import type { JobStatus } from '../../lib/types'

/** Designer-side wording for a "Draft Style Card" request. */
const LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  dispatched: 'Starting',
  working: 'Drafting',
  done: 'Done',
  failed: 'Failed',
}

const CLASS: Record<JobStatus, string> = {
  queued: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
  dispatched: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300',
  working: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
}

export function StatusPill({ status }: { status: JobStatus }) {
  const spinning = status === 'dispatched' || status === 'working'
  const Icon = status === 'done' ? CheckCircle2 : status === 'failed' ? XCircle : status === 'queued' ? Clock : Loader2
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 ${CLASS[status]}`}
    >
      <Icon className={`h-3 w-3 ${spinning ? 'animate-spin' : ''}`} aria-hidden="true" />
      {LABEL[status]}
    </span>
  )
}
