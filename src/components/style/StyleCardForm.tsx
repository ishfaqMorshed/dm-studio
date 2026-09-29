import { useId, type ReactNode } from 'react'
import { hintCls, inputCls, labelCls } from './classes'
import { PaletteEditor } from './PaletteEditor'
import { TagInput } from './TagInput'
import type { StyleCardDoc } from './styleCardSchema'

interface Props {
  doc: StyleCardDoc
  onChange: (next: StyleCardDoc) => void
  /** Locked versions render the same form, read-only. */
  disabled?: boolean
  /** Offered while typing garment colours (from the client record). */
  garmentColorSuggestions?: readonly string[]
}

/** Form over the Style Card schema (SOP §7.1). Every change goes through `onChange` with a new doc. */
export function StyleCardForm({ doc, onChange, disabled = false, garmentColorSuggestions }: Props) {
  const ids = {
    medium: useId(),
    lineWeight: useId(),
    lineStyle: useId(),
    shading: useId(),
    texture: useId(),
    composition: useId(),
    typoVibe: useId(),
    typoPlacement: useId(),
    typoCase: useId(),
    background: useId(),
    mood: useId(),
    subjects: useId(),
    forbid: useId(),
    signatureMoves: useId(),
    garment: useId(),
  }
  const set = <K extends keyof StyleCardDoc>(key: K, value: StyleCardDoc[K]) => onChange({ ...doc, [key]: value })

  const textarea = `${inputCls} min-h-[64px] resize-y`

  return (
    <div className="space-y-6">
      <Section title="Artwork" hint="What kind of picture this client's designs are.">
        <Field id={ids.medium} label="Medium" hint="Technique and finish, e.g. hand-inked linework with flat screen-print fills.">
          <textarea
            id={ids.medium}
            value={doc.medium}
            disabled={disabled}
            onChange={(e) => set('medium', e.target.value)}
            placeholder="hand-inked linework with flat screen-print fills"
            className={textarea}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={ids.lineWeight} label="Linework weight" hint="thin · medium · medium-bold · heavy">
            <input
              id={ids.lineWeight}
              type="text"
              value={doc.linework.weight}
              disabled={disabled}
              onChange={(e) => set('linework', { ...doc.linework, weight: e.target.value })}
              placeholder="medium-bold"
              className={inputCls}
            />
          </Field>
          <Field id={ids.lineStyle} label="Linework style" hint="How the lines behave.">
            <input
              id={ids.lineStyle}
              type="text"
              value={doc.linework.style}
              disabled={disabled}
              onChange={(e) => set('linework', { ...doc.linework, style: e.target.value })}
              placeholder="clean, closed shapes, no sketchy strokes"
              className={inputCls}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={ids.shading} label="Shading">
            <input
              id={ids.shading}
              type="text"
              value={doc.shading}
              disabled={disabled}
              onChange={(e) => set('shading', e.target.value)}
              placeholder="flat fills, two-tone at most, no gradients"
              className={inputCls}
            />
          </Field>
          <Field id={ids.texture} label="Texture">
            <input
              id={ids.texture}
              type="text"
              value={doc.texture}
              disabled={disabled}
              onChange={(e) => set('texture', e.target.value)}
              placeholder="subtle grain on fills only"
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      <Section title="Palette" hint="Colours the model must stay inside. Role says how each one is used.">
        <PaletteEditor value={doc.palette} onChange={(p) => set('palette', p)} disabled={disabled} />
      </Section>

      <Section title="Layout and type">
        <Field id={ids.composition} label="Composition" hint="Subject placement, symmetry, silhouette, borders.">
          <textarea
            id={ids.composition}
            value={doc.composition}
            disabled={disabled}
            onChange={(e) => set('composition', e.target.value)}
            placeholder="centred single subject, symmetrical, badge silhouette, no borders"
            className={textarea}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id={ids.typoVibe} label="Typography vibe" hint="Print text is set in this style.">
            <input
              id={ids.typoVibe}
              type="text"
              value={doc.typography.vibe}
              disabled={disabled}
              onChange={(e) => set('typography', { ...doc.typography, vibe: e.target.value })}
              placeholder="condensed grotesque, all caps"
              className={inputCls}
            />
          </Field>
          <Field id={ids.typoPlacement} label="Typography placement">
            <input
              id={ids.typoPlacement}
              type="text"
              value={doc.typography.placement}
              disabled={disabled}
              onChange={(e) => set('typography', { ...doc.typography, placement: e.target.value })}
              placeholder="arched above subject"
              className={inputCls}
            />
          </Field>
          <Field id={ids.typoCase} label="Typography case" hint="UPPER · lower · Title · Mixed">
            <input
              id={ids.typoCase}
              type="text"
              value={doc.typography.case}
              disabled={disabled}
              onChange={(e) => set('typography', { ...doc.typography, case: e.target.value })}
              placeholder="UPPER"
              className={inputCls}
            />
          </Field>
        </div>
        <Field id={ids.background} label="Background" hint="Generations are always isolated on flat grey; say so here so the prompt and the Style Card agree.">
          <input
            id={ids.background}
            type="text"
            value={doc.background}
            disabled={disabled}
            onChange={(e) => set('background', e.target.value)}
            placeholder="flat mid-grey #808080, no scene"
            className={inputCls}
          />
        </Field>
      </Section>

      <Section title="Mood, subjects, limits and garments" hint="Type a word and press Enter or comma to add it.">
        <Field id={ids.mood} label="Mood" hint="Adjectives the artwork should feel like.">
          <TagInput
            id={ids.mood}
            value={doc.mood}
            onChange={(v) => set('mood', v)}
            disabled={disabled}
            placeholder="vintage, bold, outdoorsy"
            ariaLabel="Mood words"
          />
        </Field>
        <Field id={ids.subjects} label="Subjects" hint="Typical subject matter across the client's designs.">
          <TagInput
            id={ids.subjects}
            value={doc.subjects}
            onChange={(v) => set('subjects', v)}
            disabled={disabled}
            placeholder="bears, mountains, pine forests"
            ariaLabel="Subjects"
          />
        </Field>
        <Field id={ids.signatureMoves} label="Signature moves" hint="What makes this client's designs recognisable.">
          <TagInput
            id={ids.signatureMoves}
            value={doc.signature_moves}
            onChange={(v) => set('signature_moves', v)}
            disabled={disabled}
            placeholder="circular badge frame, banner across the bottom"
            ariaLabel="Signature moves"
          />
        </Field>
        <Field id={ids.forbid} label="Forbid" hint="Sent to the model as negatives and checked by QC.">
          <TagInput
            id={ids.forbid}
            value={doc.forbid}
            onChange={(v) => set('forbid', v)}
            disabled={disabled}
            placeholder="gradients, photoreal, drop shadows"
            ariaLabel="Forbidden elements"
          />
        </Field>
        <Field id={ids.garment} label="Garment colours" hint="Colours this style is designed to print on. The client form offers the colours from the client record.">
          <TagInput
            id={ids.garment}
            value={doc.garment_colors}
            onChange={(v) => set('garment_colors', v)}
            disabled={disabled}
            suggestions={garmentColorSuggestions}
            placeholder="black, heather"
            ariaLabel="Garment colours"
          />
        </Field>
      </Section>

      {Object.keys(doc.extra).length > 0 && (
        <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          This card also carries {Object.keys(doc.extra).length} key
          {Object.keys(doc.extra).length === 1 ? '' : 's'} outside the schema ({Object.keys(doc.extra).join(', ')}).
          They are kept as-is; edit them in the raw JSON.
        </p>
      )}
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

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      {children}
      {hint && <p className={hintCls}>{hint}</p>}
    </div>
  )
}
