import { useEffect, useId, useState, type ReactNode } from 'react'
import { hintCls, inputCls, labelCls } from './classes'
import { EnumSelect } from './EnumSelect'
import { formControlFor } from './fieldPaths'
import { PaletteEditor } from './PaletteEditor'
import { TagInput } from './TagInput'
import {
  CASE_ENUM,
  EDGE_FINISHES,
  EFFECTS,
  FAMILIES,
  FONT_WEIGHTS,
  LINE_WEIGHTS,
  OUTLINES,
  REALISM,
  SHADING_METHODS,
  unknownKeys,
  type Lettering,
  type StyleCardDoc,
} from './styleCardSchema'

interface Props {
  doc: StyleCardDoc
  onChange: (next: StyleCardDoc) => void
  /** Locked versions render the same form, read-only. */
  disabled?: boolean
  /** Offered while typing garment colours (from the client record). */
  garmentColorSuggestions?: readonly string[]
  /**
   * A `?field=<path>` deep link: the control is scrolled into view, outlined and (when editable) focused.
   * Resolved with formControlFor; the parent handles paths the form does not edit.
   */
  focusField?: string | null
  /** Changes with every navigation that carries a deep link (the same field can be linked twice). */
  focusKey?: string | null
  /** Called once the deep link has been handled (whether or not a control was found). */
  onFocusHandled?: () => void
}

const FLASH_MS = 4000

/** Form over the Style Card schema (SOP §7.1 + v2). Every change goes through `onChange` with a new doc. */
export function StyleCardForm({
  doc,
  onChange,
  disabled = false,
  garmentColorSuggestions,
  focusField,
  focusKey = null,
  onFocusHandled,
}: Props) {
  // One base id; every control is `${base}${path}` so a deep link resolves without a lookup table.
  const base = useId()
  const id = (path: string) => `${base}${path}`
  // The outlined control follows the deep link (derived during render, the React-documented way);
  // scrolling and focusing the DOM node happens in the effect below.
  const [flash, setFlash] = useState<string | null>(null)
  const focusId = focusField ? `${focusKey ?? ''}|${focusField}` : null
  const [seenField, setSeenField] = useState<string | null>(null)
  if (focusId !== seenField) {
    setSeenField(focusId)
    if (focusField) setFlash(formControlFor(focusField))
  }

  useEffect(() => {
    if (!focusField) return
    const control = formControlFor(focusField)
    const el = control ? document.getElementById(`${base}${control}`) : null
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      if (!(el as HTMLInputElement).disabled) el.focus({ preventScroll: true })
    }
    onFocusHandled?.()
  }, [focusField, focusKey, base, onFocusHandled])

  // The outline fades on its own; kept apart from the deep-link effect, whose prop the parent clears once handled.
  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), FLASH_MS)
    return () => window.clearTimeout(t)
  }, [flash])

  const set = <K extends keyof StyleCardDoc>(key: K, value: StyleCardDoc[K]) => onChange({ ...doc, [key]: value })
  const setLettering = (slot: 'headline' | 'secondary', patch: Partial<Lettering>) =>
    set('typography', { ...doc.typography, [slot]: { ...doc.typography[slot], ...patch } })

  const textarea = `${inputCls} min-h-[64px] resize-y`
  const field = (path: string, label: string, hint?: string, children?: ReactNode) => (
    <Field id={id(path)} label={label} hint={hint} highlight={flash === path}>
      {children}
    </Field>
  )
  const unknown = unknownKeys(doc)

  return (
    <div className="space-y-6">
      <Section title="Artwork" hint="What kind of picture this client's designs are.">
        {field(
          'medium',
          'Medium',
          'Technique and finish, e.g. hand-inked linework with flat screen-print fills.',
          <textarea
            id={id('medium')}
            value={doc.medium}
            disabled={disabled}
            onChange={(e) => set('medium', e.target.value)}
            placeholder="hand-inked linework with flat screen-print fills"
            className={textarea}
          />,
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {field(
            'realism',
            'Realism',
            'How literal the drawing is.',
            <EnumSelect id={id('realism')} value={doc.realism} options={REALISM} disabled={disabled} onChange={(v) => set('realism', v)} />,
          )}
          {field(
            'linework.weight',
            'Linework weight',
            'One word; describe the lines themselves under style.',
            <EnumSelect
              id={id('linework.weight')}
              value={doc.linework.weight}
              options={LINE_WEIGHTS}
              disabled={disabled}
              onChange={(v) => set('linework', { ...doc.linework, weight: v })}
            />,
          )}
          {field(
            'linework.outline',
            'Outline',
            'Keyline around the artwork.',
            <EnumSelect
              id={id('linework.outline')}
              value={doc.linework.outline}
              options={OUTLINES}
              disabled={disabled}
              onChange={(v) => set('linework', { ...doc.linework, outline: v })}
            />,
          )}
        </div>
        {field(
          'linework.style',
          'Linework style',
          'How the lines behave.',
          <input
            id={id('linework.style')}
            type="text"
            value={doc.linework.style}
            disabled={disabled}
            onChange={(e) => set('linework', { ...doc.linework, style: e.target.value })}
            placeholder="clean, closed shapes, no sketchy strokes"
            className={inputCls}
          />,
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            'shading',
            'Shading',
            undefined,
            <input
              id={id('shading')}
              type="text"
              value={doc.shading}
              disabled={disabled}
              onChange={(e) => set('shading', e.target.value)}
              placeholder="flat fills, two-tone at most, no gradients"
              className={inputCls}
            />,
          )}
          {field(
            'shading_method',
            'Shading method',
            undefined,
            <EnumSelect
              id={id('shading_method')}
              value={doc.shading_method}
              options={SHADING_METHODS}
              disabled={disabled}
              onChange={(v) => set('shading_method', v)}
            />,
          )}
          {field(
            'texture',
            'Texture',
            undefined,
            <input
              id={id('texture')}
              type="text"
              value={doc.texture}
              disabled={disabled}
              onChange={(e) => set('texture', e.target.value)}
              placeholder="subtle grain on fills only"
              className={inputCls}
            />,
          )}
          {field(
            'edge_finish',
            'Edge finish',
            undefined,
            <EnumSelect
              id={id('edge_finish')}
              value={doc.edge_finish}
              options={EDGE_FINISHES}
              disabled={disabled}
              onChange={(v) => set('edge_finish', v)}
            />,
          )}
        </div>
      </Section>

      <Section title="Palette" hint="Three to eight colours the model must stay inside, exactly one dominant. Weight says how much, role says where.">
        <div
          id={id('palette')}
          tabIndex={-1}
          className={`rounded-lg outline-none ${flash === 'palette' ? 'ring-4 ring-accent-500/40' : ''}`}
        >
          <PaletteEditor
            value={doc.palette}
            onChange={(p) => set('palette', p)}
            disabled={disabled}
            idBase={id('palette')}
            highlight={flash?.startsWith('palette.') ? flash : null}
          />
        </div>
      </Section>

      <Section title="Layout and type">
        {field(
          'composition',
          'Composition',
          'Placement, symmetry, silhouette, borders. Say "the hero", never the subject itself.',
          <textarea
            id={id('composition')}
            value={doc.composition}
            disabled={disabled}
            onChange={(e) => set('composition', e.target.value)}
            placeholder="centred hero, symmetrical, badge silhouette, no borders"
            className={textarea}
          />,
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {field(
            'typography.vibe',
            'Typography vibe',
            'Print text is set in this style.',
            <input
              id={id('typography.vibe')}
              type="text"
              value={doc.typography.vibe}
              disabled={disabled}
              onChange={(e) => set('typography', { ...doc.typography, vibe: e.target.value })}
              placeholder="condensed grotesque, all caps"
              className={inputCls}
            />,
          )}
          {field(
            'typography.placement',
            'Typography placement',
            undefined,
            <input
              id={id('typography.placement')}
              type="text"
              value={doc.typography.placement}
              disabled={disabled}
              onChange={(e) => set('typography', { ...doc.typography, placement: e.target.value })}
              placeholder="arched above the hero"
              className={inputCls}
            />,
          )}
          {field(
            'typography.case',
            'Typography case',
            'Letter case only; "as typed" is a text rule, not a case - Clean up removes it.',
            <EnumSelect
              id={id('typography.case')}
              value={doc.typography.case}
              options={CASE_ENUM}
              disabled={disabled}
              emptyLabel="not set (the text block decides)"
              onChange={(v) => set('typography', { ...doc.typography, case: v })}
            />,
          )}
        </div>
        <LetteringFields slot="headline" title="Headline lettering" value={doc.typography.headline} id={id} flash={flash} disabled={disabled} onChange={(patch) => setLettering('headline', patch)} />
        <LetteringFields slot="secondary" title="Secondary lettering" value={doc.typography.secondary} id={id} flash={flash} disabled={disabled} onChange={(patch) => setLettering('secondary', patch)} />
        {field(
          'background',
          'Background',
          'Generations are always isolated on flat grey; the lock requires the exact phrase "flat mid-grey #808080, isolated artwork".',
          <input
            id={id('background')}
            type="text"
            value={doc.background}
            disabled={disabled}
            onChange={(e) => set('background', e.target.value)}
            placeholder="flat mid-grey #808080, isolated artwork"
            className={inputCls}
          />,
        )}
      </Section>

      <Section title="Mood, subjects, limits and garments" hint="Type a word and press Enter or comma to add it.">
        {field(
          'mood',
          'Mood',
          'Adjectives the artwork should feel like.',
          <TagInput id={id('mood')} value={doc.mood} onChange={(v) => set('mood', v)} disabled={disabled} placeholder="vintage, bold, outdoorsy" ariaLabel="Mood words" />,
        )}
        {field(
          'subjects',
          'Subjects',
          "Every theme the client prints, not only what the analysed designs show. The brief's subjects must all be here.",
          <TagInput id={id('subjects')} value={doc.subjects} onChange={(v) => set('subjects', v)} disabled={disabled} placeholder="bears, mountains, pine forests" ariaLabel="Subjects" />,
        )}
        {field(
          'signature_moves',
          'Signature moves',
          "What makes this client's designs recognisable. Visual traits only; brand text belongs in brand_text.",
          <TagInput id={id('signature_moves')} value={doc.signature_moves} onChange={(v) => set('signature_moves', v)} disabled={disabled} placeholder="circular badge frame, banner across the bottom" ariaLabel="Signature moves" />,
        )}
        {field(
          'forbid',
          'Forbid',
          'Sent to the model as negatives and checked by QC. Name the thing itself ("gradients", not "no gradients").',
          <TagInput id={id('forbid')} value={doc.forbid} onChange={(v) => set('forbid', v)} disabled={disabled} placeholder="gradients, photoreal, drop shadows" ariaLabel="Forbidden elements" />,
        )}
        {field(
          'garment_colors',
          'Garment colours',
          'Colours this style is designed to print on. The client form offers the colours from the client record.',
          <TagInput
            id={id('garment_colors')}
            value={doc.garment_colors}
            onChange={(v) => set('garment_colors', v)}
            disabled={disabled}
            suggestions={garmentColorSuggestions}
            placeholder="black, heather"
            ariaLabel="Garment colours"
          />,
        )}
      </Section>

      {unknown.length > 0 && (
        <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          This card also carries {unknown.length} key{unknown.length === 1 ? '' : 's'} outside the schema ({unknown.join(', ')}
          ). They are kept as-is; edit them in the raw JSON.
        </p>
      )}
    </div>
  )
}

function LetteringFields({
  slot,
  title,
  value,
  id,
  flash,
  disabled,
  onChange,
}: {
  slot: 'headline' | 'secondary'
  title: string
  value: Lettering
  id: (path: string) => string
  flash: string | null
  disabled: boolean
  onChange: (patch: Partial<Lettering>) => void
}) {
  const path = (k: string) => `typography.${slot}.${k}`
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="mb-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300">{title}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id={id(path('family'))} label="Family" highlight={flash === path('family')}>
          <EnumSelect id={id(path('family'))} value={value.family} options={FAMILIES} disabled={disabled} onChange={(v) => onChange({ family: v })} />
        </Field>
        <Field id={id(path('weight'))} label="Weight" highlight={flash === path('weight')}>
          <EnumSelect id={id(path('weight'))} value={value.weight} options={FONT_WEIGHTS} disabled={disabled} onChange={(v) => onChange({ weight: v })} />
        </Field>
        <Field id={id(path('effects'))} label="Effects" hint={EFFECTS.join(' · ')} highlight={flash === path('effects')}>
          <TagInput
            id={id(path('effects'))}
            value={value.effects}
            onChange={(v) => onChange({ effects: v })}
            disabled={disabled}
            suggestions={EFFECTS}
            placeholder="arched, outline"
            ariaLabel={`${title} effects`}
          />
        </Field>
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2">
        <span className="block text-sm font-semibold">{title}</span>
        {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  )
}

function Field({
  id,
  label,
  hint,
  highlight = false,
  children,
}: {
  id: string
  label: string
  hint?: string
  highlight?: boolean
  children: ReactNode
}) {
  return (
    <div className={highlight ? 'rounded-lg ring-4 ring-accent-500/40 ring-offset-2 dark:ring-offset-neutral-900' : undefined}>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children}
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  )
}
