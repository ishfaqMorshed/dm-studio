import { Link } from 'react-router-dom'
import { AlertTriangle, Check, Wrench, X } from 'lucide-react'
import { styleFieldLink } from '../card/qc'
import { formatDateTime } from '../style/format'
import { fieldOfIssue, type Validation } from './validation'

const CHIP = 'inline-flex max-w-full items-start gap-1 rounded-md px-2 py-0.5 text-xs'
const TONE = {
  error: 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200',
  warning: 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  fix: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
} as const

type Kind = keyof typeof TONE

/**
 * The validation of one Style Card version as chips (spec 4.4): errors red, warnings amber, fixes grey.
 * Each chip that names a field carries a "Fix in editor" link to `?field=<path>` on that version.
 * `warningsOnly` is for step 4, which already states the blocking list in its own words.
 */
export function ValidationChips({
  validation,
  clientId,
  versionId,
  warningsOnly = false,
  className = '',
}: {
  validation: Validation
  clientId: string
  versionId: string
  warningsOnly?: boolean
  className?: string
}) {
  const errors = warningsOnly ? [] : validation.errors
  const fixes = warningsOnly ? [] : validation.fixes
  const warnings = validation.warnings
  const total = errors.length + warnings.length + fixes.length
  const stored = validation.source === 'stored'

  if (total === 0) {
    return (
      <p className={`flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 ${className}`}>
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        {warningsOnly ? 'No warnings from the Style Card rules.' : 'Passes the Style Card rules'}
        {stored && validation.checkedAt ? ` · checked ${formatDateTime(validation.checkedAt)}` : ''}
        {!stored && !warningsOnly ? ' (checked here, nothing written)' : ''}
      </p>
    )
  }

  const group = (kind: Kind, items: string[], label: string) =>
    items.length > 0 && (
      <li className="min-w-0">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
          {label} ({items.length})
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {items.map((text, i) => {
            const field = fieldOfIssue(text)
            return (
              <li key={`${kind}-${i}`} className={`${CHIP} ${TONE[kind]}`} title={field ? `Style Card field ${field}` : undefined}>
                {kind === 'error' ? (
                  <X className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                ) : kind === 'warning' ? (
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                ) : (
                  <Wrench className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 break-words">
                  <span className="sr-only">{kind === 'error' ? 'Error: ' : kind === 'warning' ? 'Warning: ' : 'Auto-fix: '}</span>
                  {text}
                  {field && (
                    <>
                      {' '}
                      <Link
                        to={styleFieldLink(clientId, versionId, field)}
                        className="whitespace-nowrap font-medium underline underline-offset-2"
                        title={`Open the editor at ${field}`}
                      >
                        Fix in editor
                      </Link>
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </li>
    )

  return (
    <div className={className}>
      <ul className="space-y-2" aria-label="Style Card validation">
        {group('error', errors, 'Errors')}
        {group('warning', warnings, 'Warnings')}
        {group('fix', fixes, stored ? 'Auto-fixed by the run' : 'Clean up would change')}
      </ul>
      <p className="mt-1 text-[11px] text-neutral-500">
        {stored
          ? `Checked by the profiler run${validation.checkedAt ? ` ${formatDateTime(validation.checkedAt)}` : ''}; the fixes were applied before the draft was stored.`
          : 'Checked here with the shared Style Card rules; nothing was written. The fixes listed are what Clean up applies in the editor.'}
      </p>
    </div>
  )
}
