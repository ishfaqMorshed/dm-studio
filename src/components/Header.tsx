import { LogOut, Sparkles } from 'lucide-react'

export interface BatchCounts {
  total: number
  processing: number
  done: number
  failed: number
}

interface Props {
  email: string | null
  counts: BatchCounts
  batchName: string | null
  onSignOut: () => void
}

export function Header({ email, counts, batchName, onSignOut }: Props) {
  const pct = counts.total ? Math.round(((counts.done + counts.failed) / counts.total) * 100) : 0
  const donePct = counts.total ? (counts.done / counts.total) * 100 : 0
  const failedPct = counts.total ? (counts.failed / counts.total) * 100 : 0

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-semibold">DM Finisher</span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
            {batchName ? (
              <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">{batchName}</span>
            ) : (
              <span>No batch selected</span>
            )}
            <Stat label="total" value={counts.total} />
            <Stat label="processing" value={counts.processing} tone="text-blue-600 dark:text-blue-400" />
            <Stat label="done" value={counts.done} tone="text-emerald-600 dark:text-emerald-400" />
            <Stat label="failed" value={counts.failed} tone="text-red-600 dark:text-red-400" />
            <span className="ml-auto tabular-nums">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
          >
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${donePct}%` }} />
            <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${failedPct}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {email && <span className="hidden max-w-[180px] truncate text-neutral-500 md:inline">{email}</span>}
          <button
            onClick={onSignOut}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className={`font-semibold tabular-nums ${tone ?? 'text-neutral-900 dark:text-neutral-100'}`}>{value}</span>{' '}
      {label}
    </span>
  )
}
