import { forwardRef, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import { isPermissionError, saveOnboardingBrief } from '../../lib/api'
import {
  PALETTE_MODES,
  TEXT_CASES,
  briefGaps,
  briefGapsSummary,
  parseStyleBrief,
  readRules,
  rulesEqual,
  rulesFromBrief,
  rulesSummary,
  styleBriefToJson,
  type PaletteMode,
  type StyleBrief,
  type TextCase,
} from '../../lib/styleBrief'
import { errorMessage, type Client, type StyleCard } from '../../lib/types'
import { useToast } from '../../lib/useToast'
import { SIMILARITY_TIERS, SIMILARITY_TIER_HINT } from '../clientPanel/tiers'
import { btnPrimary, hintCls, inputCls, labelCls } from '../style/classes'
import { normalizeStyleCard } from '../style/styleCardSchema'
import { TagInput } from '../style/TagInput'
import { StepFrame } from './StepFrame'
import { STEP_SHORT } from './steps'

interface BriefForm {
  brief: StyleBrief
  tier: number
  garment_colors: string[]
  notes: string
}

function formFromClient(client: Client): BriefForm {
  return {
    brief: parseStyleBrief(client.style_brief),
    tier: client.default_similarity_tier,
    garment_colors: client.garment_colors,
    notes: client.notes ?? '',
  }
}

function serialize(f: BriefForm): string {
  return JSON.stringify({
    brief: styleBriefToJson(f.brief),
    tier: f.tier,
    garment_colors: f.garment_colors.map((c) => c.trim()).filter(Boolean),
    notes: f.notes.trim(),
  })
}

/** Which fields the server row differs from the form in (a save that "succeeded" but kept old values). */
function differingFields(sent: BriefForm, kept: BriefForm): string[] {
  const out: string[] = []
  if (JSON.stringify(styleBriefToJson(sent.brief)) !== JSON.stringify(styleBriefToJson(kept.brief))) out.push('the brief')
  if (sent.tier !== kept.tier) out.push('the similarity tier')
  if (JSON.stringify(sent.garment_colors.map((c) => c.trim()).filter(Boolean)) !== JSON.stringify(kept.garment_colors)) {
    out.push('the garment colours')
  }
  if (sent.notes.trim() !== kept.notes.trim()) out.push('the notes')
  return out
}

interface Props {
  client: Client
  isLead: boolean
  /** The draft the wizard shows, to warn when it was analysed with other rules. */
  selectedDraft: StyleCard | null
  onSaved: (client: Client) => void
  onDirtyChange: (dirty: boolean) => void
  onBack: () => void
  /** Called after a successful save (or when nothing was dirty); the shell skips its dirty guard. */
  onContinue: () => void
}

/**
 * Step 2: the written brief and lock parameters (`clients.style_brief`), plus the client
 * fields the profiler and intake read (default tier, garment colours, notes). Saved through
 * `save_onboarding_brief` (any staff member); where that RPC is not deployed the fallback
 * PATCH is lead-only and the refusal is shown as an error.
 */
export const BriefStep = forwardRef<HTMLHeadingElement, Props>(function BriefStep(
  { client, isLead, selectedDraft, onSaved, onDirtyChange, onBack, onContinue },
  ref,
) {
  const toast = useToast()
  const ids = {
    niche: useId(),
    audience: useId(),
    subjects: useId(),
    brandText: useId(),
    typoNote: useId(),
    palette: useId(),
    textCase: useId(),
    must: useId(),
    avoid: useId(),
    typo: useId(),
    comp: useId(),
    tier: useId(),
    garment: useId(),
    notes: useId(),
    form: useId(),
  }

  const serverForm = useMemo(() => formFromClient(client), [client])
  const baseline = useMemo(() => serialize(serverForm), [serverForm])
  const [form, setForm] = useState<BriefForm>(serverForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = serialize(form)
  const dirty = current !== baseline
  // The gate Analyse is behind (and the server trigger enforces): niche, one subject, one garment colour.
  const gaps = briefGaps(form.brief, { garment_colors: form.garment_colors })

  // The panel polls every 20 s: adopt a server change when there are no local edits.
  const [prevBaseline, setPrevBaseline] = useState(baseline)
  if (baseline !== prevBaseline) {
    const hadLocalEdits = current !== prevBaseline
    setPrevBaseline(baseline)
    if (!hadLocalEdits) setForm(serverForm)
  }

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const disabled = saving
  const setBrief = <K extends keyof StyleBrief>(key: K, value: StyleBrief[K]) =>
    setForm((f) => ({ ...f, brief: { ...f.brief, [key]: value } }))

  // The draft on show was analysed with other rules than the saved brief: say so.
  const savedRules = rulesFromBrief(serverForm.brief)
  const draftRules = selectedDraft ? readRules(normalizeStyleCard(selectedDraft.json).extra) : null
  const staleDraft = selectedDraft && draftRules && !rulesEqual(draftRules, savedRules) ? selectedDraft : null

  /** Writes the client row; resolves true on success. */
  async function save(): Promise<boolean> {
    setSaving(true)
    setError(null)
    try {
      const sent = form
      const saved = await saveOnboardingBrief(client.id, {
        style_brief: styleBriefToJson(sent.brief),
        default_similarity_tier: sent.tier,
        garment_colors: sent.garment_colors.map((c) => c.trim()).filter(Boolean),
        notes: sent.notes.trim() || null,
      })
      onSaved(saved)
      // Success only when the row that came back holds what was sent; otherwise the form stays
      // dirty on purpose and the message says which fields the server kept.
      const kept = differingFields(sent, formFromClient(saved))
      if (kept.length > 0) {
        const msg = `Saved, but the server kept the old value for ${kept.join(', ')}. Check the form and save again.`
        setError(msg)
        toast.error(msg)
        return false
      }
      toast.success(`Brief saved. The next analysis and every new brief for ${client.name} use it.`)
      return true
    } catch (e) {
      const msg = isPermissionError(e) ? "Saving was refused: only a lead can change this client's brief." : errorMessage(e)
      setError(msg)
      toast.error(msg)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!dirty || disabled) return
    await save()
  }

  async function saveAndContinue() {
    if (gaps.length > 0) {
      setError(`${briefGapsSummary(gaps)}. The analysis needs all three; fill them in, then continue.`)
      return
    }
    if (dirty) {
      const ok = await save()
      if (!ok) return
    }
    onContinue()
  }

  return (
    <StepFrame
      ref={ref}
      title="Written brief & lock parameters"
      pill={
        dirty ? (
          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Unsaved changes</span>
        ) : undefined
      }
      subtitle={`What the images cannot say, and how strictly the Style Card is applied to ${client.name}'s briefs.`}
      actions={
        <button
          type="submit"
          form={ids.form}
          disabled={disabled || !dirty}
          title={!dirty ? 'Nothing changed since the last save' : undefined}
          className={btnPrimary}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          Save brief
        </button>
      }
      onBack={onBack}
      onContinue={() => void saveAndContinue()}
      continueLabel={dirty ? 'Save and continue' : `Next: ${STEP_SHORT.analyse}`}
      continueDisabledReason={gaps.length > 0 ? briefGapsSummary(gaps) : null}
      continueBusy={saving}
      footerHint={
        isLead
          ? 'Saving writes the client record; the analysis reads it on its next run.'
          : 'Saving writes the four onboarding fields of the client record; the analysis reads them on its next run.'
      }
    >

      {staleDraft && draftRules && (
        <p
          role="status"
          className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Draft v{staleDraft.version} was analysed with: {rulesSummary(draftRules)}. Save the brief and re-run Analyse
            to apply the current one.
          </span>
        </p>
      )}

      <form id={ids.form} onSubmit={(e) => void onSubmit(e)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.niche} className={labelCls}>
              Niche <Required />
            </label>
            <input
              id={ids.niche}
              type="text"
              value={form.brief.niche}
              disabled={disabled}
              aria-invalid={gaps.includes('niche') ? true : undefined}
              onChange={(e) => setBrief('niche', e.target.value)}
              placeholder="e.g. trucker humour, fishing lodge merch"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor={ids.audience} className={labelCls}>
              Audience
            </label>
            <input
              id={ids.audience}
              type="text"
              value={form.brief.audience}
              disabled={disabled}
              onChange={(e) => setBrief('audience', e.target.value)}
              placeholder="e.g. men 35–60 who buy for themselves"
              className={inputCls}
            />
          </div>
        </div>
        <p className={`${hintCls} -mt-3`}>
          Given to the profiler as ground truth where the images are ambiguous. The audience is recommended, not required.
        </p>

        <div>
          <label htmlFor={ids.subjects} className={labelCls}>
            Subjects the client sells designs about <Required />
          </label>
          <TagInput
            id={ids.subjects}
            value={form.brief.subjects}
            onChange={(v) => setBrief('subjects', v)}
            disabled={disabled}
            placeholder="Highland cows, chickens, goats, farm humour"
            ariaLabel="Subjects the client sells designs about"
          />
          <p className={hintCls}>
            Every theme they print, not only what is in the uploaded designs. Press Enter or comma after each one.
            {gaps.includes('at least one subject') && (
              <span className="ml-1 text-red-700 dark:text-red-300">At least one subject is required.</span>
            )}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.brandText} className={labelCls}>
              Brand text
            </label>
            <TagInput
              id={ids.brandText}
              value={form.brief.brand_text}
              onChange={(v) => setBrief('brand_text', v)}
              disabled={disabled}
              placeholder="@thehappyhourfarm, EST. 2019"
              ariaLabel="Brand text"
            />
            <p className={hintCls}>
              Text that appears on most designs: social handle, EST. line. The profiler treats it as text, never as style;
              add it to a brief's text lines when it must be printed.
            </p>
          </div>
          <div>
            <label htmlFor={ids.typoNote} className={labelCls}>
              Typography note
            </label>
            <input
              id={ids.typoNote}
              type="text"
              value={form.brief.typography_note}
              disabled={disabled}
              onChange={(e) => setBrief('typography_note', e.target.value)}
              placeholder="e.g. headline always a chunky slab serif, arched"
              className={inputCls}
            />
            <p className={hintCls}>Optional. Anything about the lettering the images cannot say.</p>
          </div>
        </div>

        <fieldset>
          <legend className={labelCls}>Palette rule</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PALETTE_MODES.map((m) => (
              <RadioCard
                key={m.value}
                name={ids.palette}
                checked={form.brief.palette_mode === m.value}
                disabled={disabled}
                onChange={() => setBrief('palette_mode', m.value as PaletteMode)}
                label={m.label}
                meaning={m.meaning}
              />
            ))}
          </div>
          <p className={hintCls}>Copied into the Style Card rules and read by QC.</p>
        </fieldset>

        <fieldset>
          <legend className={labelCls}>Text case</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Text case">
            {TEXT_CASES.map((c) => (
              <RadioPill
                key={c.value}
                name={ids.textCase}
                checked={form.brief.text_case === c.value}
                disabled={disabled}
                onChange={() => setBrief('text_case', c.value as TextCase)}
                label={c.label}
                title={c.meaning}
              />
            ))}
          </div>
          <p className={`${hintCls} flex items-start gap-1.5`}>
            <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>
              Applied to every brief for {client.name} the moment it arrives: "Hello World" is printed as{' '}
              {form.brief.text_case === 'title' ? '"Hello World"' : form.brief.text_case === 'upper' ? '"HELLO WORLD"' : 'typed'}.
              The card keeps what the client typed under "What the client sent". Cards already created are not changed.
            </span>
          </p>
        </fieldset>

        <div>
          <label htmlFor={ids.must} className={labelCls}>
            Must-have signature moves
          </label>
          <TagInput
            id={ids.must}
            value={form.brief.must_have}
            onChange={(v) => setBrief('must_have', v)}
            disabled={disabled}
            placeholder="e.g. circular badge frame, distressed ink"
            ariaLabel="Must-have signature moves"
          />
          <p className={hintCls}>Folded into signature_moves in your own words. Press Enter or comma after each one.</p>
        </div>

        <div>
          <label htmlFor={ids.avoid} className={labelCls}>
            Never do
          </label>
          <TagInput
            id={ids.avoid}
            value={form.brief.avoid}
            onChange={(v) => setBrief('avoid', v)}
            disabled={disabled}
            placeholder="e.g. gradients, photo-realism, drop shadows"
            ariaLabel="Never do"
          />
          <p className={hintCls}>Folded into forbid: sent as negatives and checked by QC.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <LockToggle
            legend="Typography lock"
            name={ids.typo}
            locked={form.brief.lock_typography}
            disabled={disabled}
            onChange={(v) => setBrief('lock_typography', v)}
          />
          <LockToggle
            legend="Composition lock"
            name={ids.comp}
            locked={form.brief.lock_composition}
            disabled={disabled}
            onChange={(v) => setBrief('lock_composition', v)}
          />
        </div>
        <p className={`${hintCls} -mt-3`}>Locked = every design must follow it. Guide = adapted to each brief.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.tier} className={labelCls}>
              Default similarity tier
            </label>
            <select
              id={ids.tier}
              value={form.tier}
              disabled={disabled}
              onChange={(e) => setForm((f) => ({ ...f, tier: Number(e.target.value) }))}
              className={inputCls}
            >
              {SIMILARITY_TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className={hintCls}>{SIMILARITY_TIER_HINT}</p>
          </div>
          <div>
            <label htmlFor={ids.garment} className={labelCls}>
              Garment colours <Required />
            </label>
            <TagInput
              id={ids.garment}
              value={form.garment_colors}
              onChange={(v) => setForm((f) => ({ ...f, garment_colors: v }))}
              disabled={disabled}
              placeholder="black, white, heather"
              ariaLabel="Garment colours"
            />
            <p className={hintCls}>
              Offered as choices on the brief form, plus "other". The test render uses the first one.
              {gaps.includes('a garment colour') && (
                <span className="ml-1 text-red-700 dark:text-red-300">At least one garment colour is required.</span>
              )}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor={ids.notes} className={labelCls}>
            Notes
          </label>
          <textarea
            id={ids.notes}
            value={form.notes}
            disabled={disabled}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Anything else the profiler should know about this client"
            className={`${inputCls} resize-y`}
          />
          <p className={hintCls}>Sent to the profiler as the client notes.</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
      </form>
    </StepFrame>
  )
})

/** The red asterisk of a required field, read as "required" by screen readers. */
function Required() {
  return (
    <span className="text-red-600 dark:text-red-400" title="Required">
      <span aria-hidden="true">*</span>
      <span className="sr-only"> (required)</span>
    </span>
  )
}

function RadioCard({
  name,
  checked,
  disabled,
  onChange,
  label,
  meaning,
}: {
  name: string
  checked: boolean
  disabled: boolean
  onChange: () => void
  label: string
  meaning: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ring-accent-500/25 focus-within:ring-4 dark:ring-accent-400/30 ${
        checked
          ? 'border-accent-500 bg-accent-50 dark:border-accent-400 dark:bg-accent-950/40'
          : 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/40'
      } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 accent-accent-600 dark:accent-accent-400"
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-neutral-500">{meaning}</span>
      </span>
    </label>
  )
}

function RadioPill({
  name,
  checked,
  disabled,
  onChange,
  label,
  title,
}: {
  name: string
  checked: boolean
  disabled: boolean
  onChange: () => void
  label: string
  title: string
}) {
  return (
    <label
      title={title}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ring-accent-500/25 focus-within:ring-4 dark:ring-accent-400/30 ${
        checked
          ? 'border-accent-500 bg-accent-50 text-accent-900 dark:border-accent-400 dark:bg-accent-950/40 dark:text-accent-100'
          : 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/40'
      } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
    >
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      {label}
    </label>
  )
}

function LockToggle({
  legend,
  name,
  locked,
  disabled,
  onChange,
}: {
  legend: string
  name: string
  locked: boolean
  disabled: boolean
  onChange: (locked: boolean) => void
}) {
  return (
    <fieldset>
      <legend className={labelCls}>{legend}</legend>
      <div className="inline-flex overflow-hidden rounded-lg border border-neutral-300 text-sm dark:border-neutral-700" role="radiogroup" aria-label={legend}>
        {[
          { value: true, label: 'Locked' },
          { value: false, label: 'Guide' },
        ].map((o) => (
          <label
            key={o.label}
            className={`cursor-pointer px-3 py-1.5 font-medium ring-inset ring-accent-500/25 focus-within:ring-4 dark:ring-accent-400/30 ${
              locked === o.value
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
          >
            <input
              type="radio"
              name={name}
              checked={locked === o.value}
              disabled={disabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
