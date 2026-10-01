import { inputCls } from './classes'

interface Props {
  id: string
  value: string
  /** The vocabulary (spec §1.3). */
  options: readonly string[]
  onChange: (next: string) => void
  disabled?: boolean
  /** Label of the empty option. */
  emptyLabel?: string
  /** Accessible name when no visible <label> points at the select (palette cells). */
  ariaLabel?: string
}

/**
 * A <select> over a Style Card vocabulary. A value outside the vocabulary (a legacy sentence, a typo
 * from the raw JSON) is kept as its own option so nothing is silently rewritten; Clean up maps the
 * ones the shared rules know how to map.
 */
export function EnumSelect({ id, value, options, onChange, disabled = false, emptyLabel = 'not set', ariaLabel }: Props) {
  const current = value.trim()
  const foreign = current !== '' && !options.includes(current)
  return (
    <select
      id={id}
      value={current}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      aria-invalid={foreign || undefined}
      className={`${inputCls} ${foreign ? 'border-amber-400 text-amber-900 dark:border-amber-600 dark:text-amber-200' : ''}`}
    >
      <option value="">{emptyLabel}</option>
      {foreign && <option value={current}>{current} (not in the vocabulary)</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}
