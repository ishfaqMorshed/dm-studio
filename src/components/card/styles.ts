/**
 * Shared Tailwind class strings for the card page so every button, input and
 * badge reads the same. Neutral palette, dark mode via media query, visible focus
 * rings — the DM Finisher look.
 */
import type { JobStatus } from '../../lib/types'

export const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium outline-none ring-neutral-900/10 transition focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-40 dark:ring-white/20'

export const btnPrimary = `${btnBase} bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200`

export const btnSecondary = `${btnBase} border border-neutral-300 bg-white px-3 py-1.5 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800`

export const btnDanger = `${btnBase} border border-red-300 bg-red-50 px-3 py-1.5 text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-900/50`

export const btnGhost = `${btnBase} px-2 py-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100`

/** Append to any button class for the compact variant used inside panels. */
export const btnSmall = '!px-2 !py-1 !text-xs'

export const inputCls =
  'w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none ring-neutral-900/10 focus:ring-4 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:ring-white/10 dark:disabled:bg-neutral-900'

export const textareaCls = `${inputCls} min-h-[80px] resize-y leading-relaxed`

export const selectCls = inputCls

export const panelCls = 'rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'

/** Transparent-PNG checkerboard behind previews and thumbnails. */
export const checkerboard =
  'bg-[conic-gradient(#e5e5e5_25%,transparent_0_50%,#e5e5e5_0_75%,transparent_0)] bg-[length:16px_16px] dark:bg-[conic-gradient(#404040_25%,transparent_0_50%,#404040_0_75%,transparent_0)]'

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  dispatched: 'Dispatched',
  working: 'Working',
  done: 'Done',
  failed: 'Failed',
}

export const STATUS_CLASS: Record<JobStatus, string> = {
  queued: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
  dispatched: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300',
  working: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
}

export const VERDICT_CLASS = {
  pass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  fail: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  unknown: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
} as const
