import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

export type ChipTone = 'neutral' | 'accent' | 'danger'

const TONE: Record<ChipTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100',
  accent: 'bg-accent-50 text-accent-900 dark:bg-accent-950/50 dark:text-accent-200',
  danger: 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200',
}

export interface Chip {
  text: string
  /** Check icon + this tooltip (e.g. "From your brief"). */
  matchedTitle?: string
  /** Small grey hint after the text (e.g. "not on the client record"). */
  hint?: string
  /** Amber outline + this tooltip (e.g. "from the brief only", "seen in 2 of 9 designs"). */
  warnTitle?: string
}

/** A labelled row of chips; "—" when empty. `missing` renders hollow amber chips after the real ones. */
export function ChipRow({
  label,
  chips,
  tone = 'neutral',
  missing = [],
  hint,
}: {
  label: string
  chips: Chip[]
  tone?: ChipTone
  /** Items expected (from the brief) but absent from the draft. */
  missing?: string[]
  hint?: ReactNode
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      {chips.length === 0 && missing.length === 0 ? (
        <p className="text-sm text-neutral-400">—</p>
      ) : (
        <ul aria-label={label} className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <li
              key={c.text}
              title={[c.matchedTitle, c.warnTitle].filter(Boolean).join(' · ') || undefined}
              className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${TONE[tone]} ${
                c.warnTitle ? 'ring-1 ring-amber-400 dark:ring-amber-600' : ''
              }`}
            >
              {c.matchedTitle && <Check className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label={c.matchedTitle} />}
              <span className="truncate">{c.text}</span>
              {c.hint && <span className="text-[10px] font-normal text-neutral-500">· {c.hint}</span>}
              {c.warnTitle && <span className="sr-only"> ({c.warnTitle})</span>}
            </li>
          ))}
          {missing.map((m) => (
            <li
              key={`missing-${m}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-dashed border-amber-400 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-600 dark:text-amber-300"
              title="In your brief, but the analysis did not write it into the draft. Adjust in the editor or analyse again."
            >
              <span className="truncate">{m}</span>
              <span className="text-[10px]">· not in the draft</span>
            </li>
          ))}
        </ul>
      )}
      {hint && <p className="mt-1 text-[11px] text-neutral-500">{hint}</p>}
    </div>
  )
}
