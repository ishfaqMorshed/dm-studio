/** Tailwind class tokens shared by the Clients and Style Card screens (same look as Login/Header). */

export const inputCls =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-accent-500/25 focus:border-accent-400 focus:ring-4 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:ring-accent-400/30 dark:focus:border-accent-500 dark:disabled:bg-neutral-900 dark:disabled:text-neutral-400'

export const labelCls = 'mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400'

export const hintCls = 'mt-1 text-[11px] leading-4 text-neutral-500'

const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium outline-none transition focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50'

export const btnPrimary = `${btnBase} bg-accent-600 px-3 py-2 text-white shadow-card ring-accent-500/30 hover:bg-accent-700 dark:bg-accent-500 dark:ring-accent-400/40 dark:hover:bg-accent-400`

export const btnSecondary = `${btnBase} border border-neutral-300 px-3 py-2 ring-accent-500/25 hover:bg-neutral-100 dark:border-neutral-700 dark:ring-accent-400/30 dark:hover:bg-neutral-800`

export const btnDanger = `${btnBase} border border-red-300 px-3 py-2 text-red-700 ring-red-500/20 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40`

/** Small icon-only button (row actions). */
export const iconBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 outline-none ring-accent-500/25 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-400 dark:ring-accent-400/30 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'

export const panelCls = 'rounded-2xl border border-neutral-200 bg-white shadow-card dark:border-neutral-800 dark:bg-neutral-900'
