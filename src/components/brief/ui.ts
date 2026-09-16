/** Tailwind class sets shared by the brief form screens, in the DM Studio (Login) idiom. */

export const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white outline-none ring-neutral-900/20 transition hover:bg-neutral-700 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:ring-white/30 dark:hover:bg-neutral-200'

export const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium outline-none ring-neutral-900/10 transition hover:bg-neutral-100 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:ring-white/10 dark:hover:bg-neutral-800'

export const iconButton =
  'rounded-md p-1.5 text-neutral-500 outline-none ring-neutral-900/10 transition hover:bg-neutral-200 hover:text-neutral-900 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 dark:ring-white/10'

export function fieldClass(invalid: boolean): string {
  return `w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none ring-neutral-900/10 focus:ring-4 disabled:opacity-60 dark:bg-neutral-950 dark:ring-white/10 ${
    invalid ? 'border-red-400 dark:border-red-500' : 'border-neutral-300 dark:border-neutral-700'
  }`
}

export const labelClass = 'mb-1 block text-sm font-medium'
export const hintClass = 'mt-1 text-xs text-neutral-500'
export const errorClass = 'mt-1 text-xs text-red-600 dark:text-red-400'
