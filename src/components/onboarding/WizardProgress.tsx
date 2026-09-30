import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { useNow } from '../card/useNow'
import { formatElapsed, type StepId, type StepSummary } from './steps'

/**
 * The four step chips with a one-line summary each. Buttons rather than links so the shell
 * can intercept a switch while the brief has unsaved changes. Sticky only from `md`: at
 * 560 px the header already wraps and the chips take two rows.
 */
export function WizardProgress({ steps, onSelect }: { steps: StepSummary[]; onSelect: (id: StepId) => void }) {
  return (
    <nav
      aria-label="Onboarding steps"
      className="z-20 -mx-4 bg-neutral-50/90 px-4 py-2 backdrop-blur md:sticky md:top-[60px] dark:bg-neutral-950/90 sm:-mx-6 sm:px-6"
    >
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((s, i) => {
          const active = s.state === 'active'
          return (
            <li key={s.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={active ? 'step' : undefined}
                className={`flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left outline-none ring-accent-500/30 transition focus-visible:ring-4 dark:ring-accent-400/40 ${
                  active
                    ? 'border-accent-500 bg-white shadow-card dark:border-accent-400 dark:bg-neutral-900'
                    : 'border-neutral-200 bg-white/70 hover:bg-white dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:bg-neutral-900'
                }`}
              >
                <StepMarker index={i + 1} state={s.state} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-xs font-semibold ${active ? '' : 'text-neutral-700 dark:text-neutral-300'}`}>
                    {s.label}
                  </span>
                  <span
                    className={`block truncate text-[11px] ${
                      s.state === 'attention' ? 'text-amber-700 dark:text-amber-300' : 'text-neutral-500'
                    }`}
                    title={s.summary}
                  >
                    {s.summary}
                    {s.since ? (
                      <>
                        {' '}
                        <ElapsedSince iso={s.since} />
                      </>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * Live "m:ss" since `iso`. Its own component so the 1 s ticker mounts only while a job runs and
 * re-renders this span alone, not the whole wizard.
 */
function ElapsedSince({ iso }: { iso: string }) {
  const now = useNow(1000)
  const started = Date.parse(iso)
  if (Number.isNaN(started)) return null
  return <span className="tabular-nums">{formatElapsed(now - started)}</span>
}

function StepMarker({ index, state }: { index: number; state: StepSummary['state'] }) {
  const base = 'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums'
  if (state === 'done') {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300`} aria-hidden="true">
        <Check className="h-3 w-3" />
      </span>
    )
  }
  if (state === 'busy') {
    return (
      <span className={`${base} bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300`} aria-hidden="true">
        <Loader2 className="h-3 w-3 animate-spin" />
      </span>
    )
  }
  if (state === 'attention') {
    return (
      <span className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300`} aria-hidden="true">
        <AlertTriangle className="h-3 w-3" />
      </span>
    )
  }
  return (
    <span
      className={`${base} ${
        state === 'active'
          ? 'bg-accent-600 text-white dark:bg-accent-500'
          : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
      }`}
      aria-hidden="true"
    >
      {index}
    </span>
  )
}
