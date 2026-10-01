import { useId } from 'react'
import {
  REFERENCE_BEST_FOR,
  REFERENCE_KINDS,
  type ClientReferenceMeta,
  type ReferenceBestFor,
  type ReferenceKind,
} from '../../lib/types'

const KIND_LABEL: Record<ReferenceKind, string> = { design: 'Design', mockup: 'Mockup', draft: 'Draft' }
const BEST_FOR_LABEL: Record<ReferenceBestFor, string> = {
  lettering: 'Lettering',
  linework: 'Linework',
  palette: 'Palette',
  layout: 'Layout',
}

/** Garment value stored when the image shows a garment the client record does not list. */
const GARMENT_OTHER = 'other'

const pill =
  'rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-4 outline-none ring-accent-500/30 transition focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60'
const pillOff = 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
const pillOn = 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
const pillAccent = 'bg-accent-600 text-white dark:bg-accent-500'

/**
 * The tags of one library image (`client_references.meta`, spec 4.3): what kind of picture it is,
 * the garment it shows, which parts of the look it is the best example of, and whether it is an
 * outlier. WF-1b writes them into REFERENCE_NOTES; the test card and new cards pick their reference
 * images from the "best example of" tags; an outlier's sheet is left out of the agreement.
 */
export function DesignTags({
  who,
  meta,
  garments,
  disabled,
  onChange,
}: {
  /** "Image 3" — for the aria labels. */
  who: string
  meta: ClientReferenceMeta
  /** The client's garment colours; "other" is always offered. */
  garments: readonly string[]
  disabled: boolean
  onChange: (next: ClientReferenceMeta) => void
}) {
  const garmentId = useId()
  const options = [...new Set(garments.map((g) => g.trim()).filter(Boolean))]
  const current = meta.garment ?? ''
  // A stored garment the client record no longer lists stays selectable so the row shows what it holds.
  if (current && current !== GARMENT_OTHER && !options.includes(current)) options.push(current)

  const toggleBest = (b: ReferenceBestFor) => {
    const has = meta.best_for.includes(b)
    onChange({ ...meta, best_for: has ? meta.best_for.filter((x) => x !== b) : [...meta.best_for, b] })
  }

  return (
    <div className="mt-1 space-y-1">
      <div className="flex flex-wrap gap-1" role="group" aria-label={`${who}: kind`}>
        {REFERENCE_KINDS.map((k) => {
          const on = meta.kind === k
          return (
            <button
              key={k}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onChange({ ...meta, kind: on ? null : k })}
              title={on ? `${KIND_LABEL[k]} (click to clear)` : KIND_LABEL[k]}
              className={`${pill} ${on ? pillOn : pillOff}`}
            >
              {KIND_LABEL[k]}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-1">
        <label htmlFor={garmentId} className="shrink-0 text-[10px] text-neutral-500">
          Garment
        </label>
        <select
          id={garmentId}
          value={current}
          disabled={disabled}
          aria-label={`${who}: garment`}
          onChange={(e) => onChange({ ...meta, garment: e.target.value || null })}
          className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-1 py-0.5 text-[10px] outline-none ring-accent-500/25 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="">—</option>
          {options.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          <option value={GARMENT_OTHER}>Other</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`${who}: best example of`}>
        <span className="text-[10px] text-neutral-500">Best example of</span>
        {REFERENCE_BEST_FOR.map((b) => {
          const on = meta.best_for.includes(b)
          return (
            <button
              key={b}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => toggleBest(b)}
              className={`${pill} ${on ? pillAccent : pillOff}`}
            >
              {BEST_FOR_LABEL[b]}
            </button>
          )
        })}
      </div>

      <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-neutral-600 dark:text-neutral-300">
        <input
          type="checkbox"
          checked={meta.outlier}
          disabled={disabled}
          onChange={(e) => onChange({ ...meta, outlier: e.target.checked })}
          aria-label={`${who}: outlier, not the style`}
          className="h-3.5 w-3.5 accent-amber-600 disabled:cursor-not-allowed"
        />
        <span>Outlier</span>
        <span className="text-neutral-400">· kept, not counted as the style</span>
      </label>
    </div>
  )
}
