/**
 * DM Studio visual system — proposed single class system (designer A).
 * Intended home: src/styles/ui.ts, re-exported from card/styles.ts, style/classes.ts,
 * brief/ui.ts and the settings/completed locals so every screen shares one definition.
 * Every string is Tailwind-only; nothing here touches hooks, RPCs or stage logic.
 */

// ---- Buttons ---------------------------------------------------------------------------
// One base, three sizes, five variants. Heights are fixed (28 / 32 / 40) so rows align.
export const btn =
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium ' +
  'outline-none transition-colors duration-150 ease-standard focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'motion-safe:active:scale-[0.98] motion-safe:active:duration-100 disabled:pointer-events-none disabled:opacity-50'

export const btnSm = 'h-control-sm px-2.5 text-xs [&>.lucide]:h-3.5 [&>.lucide]:w-3.5'
export const btnMd = 'h-control px-3 text-sm [&>.lucide]:h-4 [&>.lucide]:w-4'
/** Only for the one stage CTA (Generate / Accept · finish / Lock & test). */
export const btnLg = 'h-control-lg px-4 text-base font-semibold [&>.lucide]:h-4 [&>.lucide]:w-4'

export const btnPrimary = `${btn} bg-brand text-white shadow-key hover:bg-brand-hover`
export const btnSecondary = `${btn} border border-line/[.16] bg-surface-1 text-fg-1 hover:bg-surface-2 dark:border-line/[.10] dark:bg-surface-2 dark:hover:bg-surface-3`
export const btnGhost = `${btn} text-fg-2 hover:bg-surface-2 hover:text-fg-1`
export const btnDanger = `${btn} border border-bad/40 bg-transparent text-bad-text hover:bg-bad-soft dark:hover:bg-bad-dim`
export const btnLink = `${btn} h-auto px-0 text-fg-2 underline decoration-line/30 underline-offset-4 hover:text-fg-1 hover:decoration-line/60`

/** Square icon-only button (title must equal aria-label). */
export const iconBtn = `${btnGhost} h-control w-8 px-0`
export const iconBtnSm = `${btnGhost} h-control-sm w-7 px-0`

/** Price tag inside a primary: <span className={price}>$0.60</span> */
export const price = 'ml-1 rounded-full bg-white/20 px-1.5 text-2xs font-medium tabular-nums'

// ---- Badges, tags, chips ---------------------------------------------------------------
/** Status / verdict / stage badge: pair colours from STAGE_BADGE_CLASS or ok/warn/bad/info. */
export const badge = 'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-2xs font-medium'
/** Rectangular tag for kinds, roles, engine names, "ref". Neutral only. */
export const tag = 'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md bg-surface-2 px-1.5 text-2xs font-medium text-fg-2'
/** Toggle chip (board filters, tabs-as-chips). Selected = ink, never a black inversion. */
export const chip =
  'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-line/10 bg-surface-1 px-2.5 text-xs font-medium text-fg-2 ' +
  'transition-colors duration-150 hover:bg-surface-2 hover:text-fg-1 focus-ring aria-pressed:border-line/[.16] aria-pressed:bg-surface-3 aria-pressed:text-fg-1 ' +
  'dark:bg-surface-2 dark:hover:bg-surface-3 dark:aria-pressed:bg-surface-3'
/** Overlay chip on artwork ("Current", "Edit text", counters). */
export const imageChip = 'inline-flex h-6 items-center gap-1 rounded-full bg-neutral-950/70 px-2 text-2xs font-medium text-white backdrop-blur-sm'

// ---- Badge colour pairs (semantic; no stock palette names) -----------------------------
export const BADGE = {
  ok: 'bg-ok-soft text-ok-ink dark:bg-ok-dim dark:text-ok-light',
  warn: 'bg-warn-soft text-warn-ink dark:bg-warn-dim dark:text-warn-light',
  bad: 'bg-bad-soft text-bad-ink dark:bg-bad-dim dark:text-bad-light',
  info: 'bg-info-soft text-info-ink dark:bg-info-dim dark:text-info-light',
  neutral: 'bg-surface-2 text-fg-2 dark:bg-surface-3',
} as const

/** Job status → badge pair. queued/dispatched neutral, working info, done ok, failed bad. */
export const STATUS_BADGE = {
  queued: BADGE.neutral,
  dispatched: BADGE.neutral,
  working: BADGE.info,
  done: BADGE.ok,
  failed: BADGE.bad,
} as const

export const VERDICT_BADGE = { pass: BADGE.ok, fail: BADGE.bad, warn: BADGE.warn, unknown: BADGE.neutral } as const

// ---- Inputs ----------------------------------------------------------------------------
export const input =
  'h-control w-full rounded-lg border border-line/[.16] bg-surface-1 px-2.5 text-sm text-fg-1 placeholder:text-fg-placeholder ' +
  'outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:shadow-focus ' +
  'aria-[invalid=true]:border-bad aria-[invalid=true]:focus:shadow-focus-bad ' +
  'disabled:bg-surface-2 disabled:text-fg-3 dark:border-line/[.12] dark:bg-canvas'
export const inputLg = input.replace('h-control ', 'h-control-lg ').replace('text-sm', 'text-base')
export const textarea = `${input.replace('h-control ', '')} min-h-[80px] resize-y py-2 leading-relaxed`
export const select = `${input} select-native`
export const label = 'mb-1 block text-xs font-medium text-fg-2'
export const hint = 'mt-1 text-xs text-fg-3'
export const errorText = 'mt-1 text-xs text-bad-text'
export const codeInline = 'rounded bg-surface-2 px-1 py-0.5 font-mono text-2xs text-fg-2'
export const mono = 'font-mono text-2xs tabular-nums text-fg-3'

// ---- Surfaces --------------------------------------------------------------------------
export const panel = 'panel' // see index.css .panel
export const panelHeader = 'flex flex-wrap items-start justify-between gap-3 px-5 pb-2 pt-4'
export const panelTitle = 'text-sm font-semibold text-fg-1'
export const panelSubtitle = 'mt-0.5 text-xs text-fg-3'
export const panelBody = 'px-5 pb-5'
export const well = 'well p-3'
export const divider = 'border-t border-line/10 dark:border-line/[.08]'

/** Segmented control (PlatformPicker, view modes, System/Light/Dark). */
export const segment = 'flex h-control w-full rounded-lg bg-surface-2 p-0.5 dark:bg-surface-2'
export const segmentItem =
  'min-w-0 flex-1 truncate rounded-md px-3 text-xs font-medium text-fg-2 transition-colors duration-150 focus-ring ' +
  'aria-checked:bg-surface-1 aria-checked:text-fg-1 aria-checked:shadow-card dark:aria-checked:bg-surface-3 dark:aria-checked:shadow-none hover:text-fg-1'

/** Dialog shell (card/ui Dialog becomes the single implementation). */
export const dialogBackdrop = 'fixed inset-0 z-40 flex items-end justify-center bg-scrim/40 backdrop-blur-[4px] dark:bg-scrim/60 sm:items-center sm:p-4'
export const dialogPanel =
  'flex max-h-[95vh] w-full flex-col rounded-t-2xl bg-surface-1 shadow-modal outline-none dark:shadow-modal-dark sm:rounded-2xl ' +
  'motion-safe:animate-sheet-up sm:motion-safe:animate-scale-in'
export const dialogHeader = 'flex items-start justify-between gap-3 px-6 pt-5'
export const dialogTitle = 'font-sans text-lg font-semibold text-fg-1'
export const dialogBody = 'min-h-0 flex-1 overflow-y-auto px-6 py-4 text-base text-fg-2'
export const dialogFooter = 'flex flex-wrap items-center justify-end gap-2 border-t border-line/10 px-6 py-4 dark:border-line/[.08]'

/** Toast */
export const toast =
  'flex max-w-sm items-start gap-3 rounded-xl bg-surface-1 px-4 py-3 text-sm text-fg-1 shadow-modal dark:shadow-modal-dark motion-safe:animate-fade-up'

/** Tooltip (when a custom one replaces title) */
export const tooltip = 'rounded-md bg-surface-inverse px-2 py-1 text-xs font-medium text-fg-inverse shadow-pop'

// ---- Empty state -----------------------------------------------------------------------
export const emptyWrap = 'mx-auto flex max-w-sm flex-col items-center gap-2 py-16 text-center'
export const emptyIcon = 'mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-fg-3 [&>.lucide]:h-5 [&>.lucide]:w-5'
export const emptyTitle = 'text-sm font-semibold text-fg-1'
export const emptyText = 'text-sm text-fg-3'
/** Real drop targets only (references, onboarding designs, fix-an-area). */
export const dropZone =
  'rounded-2xl border-2 border-dashed border-line/[.16] bg-surface-2/60 transition-colors duration-150 ' +
  'data-[dragging=true]:border-ring data-[dragging=true]:bg-brand-soft'
