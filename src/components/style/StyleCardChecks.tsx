import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import { btnSecondary } from './classes'
import type { StyleCardCheck } from './styleCardSchema'

interface Props {
  check: StyleCardCheck
  /** Drafts can be cleaned up; locked versions only show what the rules say. */
  editable: boolean
  busy?: boolean
  onCleanUp: () => void
  /** What the last Clean up changed on this version, shown until the next edit. */
  lastFixes: string[] | null
}

/**
 * The shared rules' verdict on the card as it would be saved: blocking (the errors), warnings (the
 * module's, the agreement and brief-rules lines, and the fixes still pending) and the Clean up
 * button that applies the deterministic fixes and lists them.
 */
export function StyleCardChecks({ check, editable, busy = false, onCleanUp, lastFixes }: Props) {
  const errors = check.blocking.length
  const clean = !check.blocking.length && !check.warnings.length
  const [open, setOpen] = useState(check.blocking.length > 0)

  const summary = clean
    ? 'passes the shared Style Card rules'
    : [
        errors > 0 && `${errors} blocking`,
        check.fixes.length > 0 && `${check.fixes.length} fix${check.fixes.length === 1 ? '' : 'es'} pending`,
        check.warnings.length > 0 && `${check.warnings.length} warning${check.warnings.length === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <section
      aria-label="Style Card checks"
      className={`rounded-xl border ${
        check.blocking.length
          ? 'border-red-200 dark:border-red-900/60'
          : check.warnings.length
            ? 'border-amber-200 dark:border-amber-900/60'
            : 'border-emerald-200 dark:border-emerald-900/60'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left text-sm font-medium outline-none ring-neutral-900/10 focus-visible:ring-4 dark:ring-white/20"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          {clean ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle
              className={`h-4 w-4 shrink-0 ${check.blocking.length ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
            />
          )}
          Checks
          <span className="truncate text-xs font-normal text-neutral-500">{summary}</span>
        </button>
        {editable && check.fixes.length > 0 && (
          <button
            type="button"
            onClick={onCleanUp}
            disabled={busy}
            title="Apply the deterministic fixes the shared rules know (punctuation, case words, enum spelling, dominant colour, text demands)"
            className={`${btnSecondary} px-2.5 py-1.5 text-xs`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Clean up ({check.fixes.length})
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t border-neutral-200 px-3 py-3 text-xs dark:border-neutral-800">
          {check.blocking.length > 0 && (
            <List
              title="Blocks the lock"
              tone="red"
              items={check.blocking}
            />
          )}
          {check.fixes.length > 0 && (
            <List
              title={editable ? 'Clean up would change' : 'Clean up would change (start a draft to apply)'}
              tone="neutral"
              items={check.fixes}
              mono
            />
          )}
          {check.warnings.length > 0 && <List title="Worth a second look" tone="amber" items={check.warnings} />}
          {lastFixes && lastFixes.length > 0 && (
            <List title={`Cleaned up: ${lastFixes.length} fix${lastFixes.length === 1 ? '' : 'es'} applied (save to keep them)`} tone="emerald" items={lastFixes} mono />
          )}
          {clean && !lastFixes?.length && (
            <p className="text-neutral-600 dark:text-neutral-300">Nothing to fix. The card reads the way the prompt engine expects it.</p>
          )}
        </div>
      )}
    </section>
  )
}

const TONE: Record<'red' | 'amber' | 'neutral' | 'emerald', string> = {
  red: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200',
  amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  neutral: 'border-neutral-200 bg-neutral-50 text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
}

function List({ title, tone, items, mono = false }: { title: string; tone: keyof typeof TONE; items: string[]; mono?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${TONE[tone]}`}>
      <p className="mb-1 font-medium">{title}</p>
      <ul className={`list-disc space-y-0.5 pl-5 ${mono ? 'font-mono text-[11px] leading-4' : ''}`}>
        {items.map((m, i) => (
          <li key={`${i}-${m}`} className="break-words">
            {m}
          </li>
        ))}
      </ul>
    </div>
  )
}
