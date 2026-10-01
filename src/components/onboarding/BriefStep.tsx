import { forwardRef, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Loader2, Save, Sparkles } from 'lucide-react'
import { isPermissionError, saveOnboardingBrief } from '../../lib/api'
import {
  BRIEF_FILL_LABEL,
  PALETTE_MODES,
  TEXT_CASES,
  applyParsedBrief,
  briefGaps,
  briefGapsSummary,
  parseStyleBrief,
  readRules,
  recordBriefFill,
  rulesEqual,
  rulesFromBrief,
  rulesSummary,
  styleBriefToJson,
  undoBriefFill,
  type BriefFillKey,
  type BriefFillRecord,
  type BriefForm,
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
import { BriefFillPanel } from './BriefFillPanel'
import { StepFrame } from './StepFrame'
import { STEP_SHORT } from './steps'
import { useBriefParse } from './useBriefParse'

/** "Fill from text" since the last save (or Undo): what the panel says and what Undo fill puts back. */
interface FillState {
  /** Every unsaved fill merged (`recordBriefFill`); null when none changed anything (nothing to undo). */
  undo: BriefFillRecord | null
  /** How many controls the latest fill changed (0 = the text matched the form): the panel's message. */
  lastCount: number
}

const NO_MARKS: ReadonlySet<BriefFillKey> = new Set()

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
  let adopting = false
  if (baseline !== prevBaseline) {
    const hadLocalEdits = current !== prevBaseline
    setPrevBaseline(baseline)
    if (!hadLocalEdits) {
      setForm(serverForm)
      adopting = true
    }
  }

  // "Fill from text": a finished parse fills the FORM once (keyed by its request id), never the
  // client. Each changed control keeps its "filled from text" mark until the designer edits it, the
  // brief is saved or the fill is undone. Fills since the last save merge into one Undo record; a fill
  // that changes nothing keeps the earlier one's Undo.
  const parse = useBriefParse(client.id)
  const [appliedId, setAppliedId] = useState<string | null>(null)
  const [fill, setFill] = useState<FillState | null>(null)
  const [marked, setMarked] = useState<ReadonlySet<BriefFillKey>>(NO_MARKS)
  const parsedRequest = parse.phase === 'done' && parse.result ? parse.request : null
  if (!adopting && parsedRequest && parse.result && parsedRequest.id !== appliedId) {
    const { next, changedKeys } = applyParsedBrief(form, parse.result, parsedRequest.text)
    setAppliedId(parsedRequest.id)
    // A fill that changes no field leaves the form alone: storing only the pasted text would make the
    // form dirty with nothing visible to check, and its Undo would remove nothing the designer can see.
    if (changedKeys.length > 0) {
      setForm(next)
      setFill({ undo: recordBriefFill(fill?.undo ?? null, form, next, changedKeys), lastCount: changedKeys.length })
      setMarked(new Set([...marked, ...changedKeys]))
    } else {
      setFill({ undo: fill?.undo ?? null, lastCount: 0 })
    }
  }

  const isMarked = (key: BriefFillKey) => marked.has(key)
  /** The designer changed a control: its "filled from text" mark goes (Undo still compares values). */
  const unmark = (key: BriefFillKey) =>
    setMarked((m) => {
      if (!m.has(key)) return m
      const n = new Set(m)
      n.delete(key)
      return n
    })

  function undoFill() {
    const undo = fill?.undo
    if (!undo) return
    const { next, kept } = undoBriefFill(form, undo)
    setForm(next)
    setFill(null)
    setMarked(NO_MARKS)
    parse.reset()
    if (kept.length > 0) {
      toast.toast(
        `Fill undone. Kept your later edits to ${kept.map((k) => BRIEF_FILL_LABEL[k]).join(', ')}.`,
        'info',
      )
    }
  }

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const disabled = saving
  const setBrief = <K extends keyof StyleBrief & BriefFillKey>(key: K, value: StyleBrief[K]) => {
    unmark(key)
    setForm((f) => ({ ...f, brief: { ...f.brief, [key]: value } }))
  }
  const setField = <K extends 'tier' | 'garment_colors' | 'notes'>(key: K, value: BriefForm[K]) => {
    unmark(key)
    setForm((f) => ({ ...f, [key]: value }))
  }

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
      const fillAtSave = fill
      const marksAtSave = marked
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
      // The fill is part of the saved brief now: nothing left to undo and no marks (unless another
      // fill landed while the save was in flight; that one is not saved yet and keeps both).
      setFill((f) => (f === fillAtSave ? null : f))
      setMarked((m) => (m === marksAtSave ? NO_MARKS : m))
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
      <BriefFillPanel
        parse={parse}
        disabled={saving}
        filledCount={fill ? fill.lastCount : null}
        undoFills={fill?.undo ? fill.undo.fills : 0}
        onUndo={fill?.undo ? undoFill : null}
      />

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
              <FilledMark show={isMarked('niche')} />
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
              <FilledMark show={isMarked('audience')} />
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
            <FilledMark show={isMarked('subjects')} />
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
              <FilledMark show={isMarked('brand_text')} />
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
              <FilledMark show={isMarked('typography_note')} />
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
          <legend className={labelCls}>
            Palette rule
            <FilledMark show={isMarked('palette_mode')} />
          </legend>
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
          <legend className={labelCls}>
            Text case
            <FilledMark show={isMarked('text_case')} />
          </legend>
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
            <FilledMark show={isMarked('must_have')} />
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
            <FilledMark show={isMarked('avoid')} />
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
            marked={isMarked('lock_typography')}
            disabled={disabled}
            onChange={(v) => setBrief('lock_typography', v)}
          />
          <LockToggle
            legend="Composition lock"
            name={ids.comp}
            locked={form.brief.lock_composition}
            marked={isMarked('lock_composition')}
            disabled={disabled}
            onChange={(v) => setBrief('lock_composition', v)}
          />
        </div>
        <p className={`${hintCls} -mt-3`}>Locked = every design must follow it. Guide = adapted to each brief.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.tier} className={labelCls}>
              Default similarity tier
              <FilledMark show={isMarked('tier')} />
            </label>
            <select
              id={ids.tier}
              value={form.tier}
              disabled={disabled}
              onChange={(e) => setField('tier', Number(e.target.value))}
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
              <FilledMark show={isMarked('garment_colors')} />
            </label>
            <TagInput
              id={ids.garment}
              value={form.garment_colors}
              onChange={(v) => setField('garment_colors', v)}
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
            <FilledMark show={isMarked('notes')} />
          </label>
          <textarea
            id={ids.notes}
            value={form.notes}
            disabled={disabled}
            onChange={(e) => setField('notes', e.target.value)}
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

/** The mark on a control a "Fill from text" changed; it stays until the control is edited, saved or undone. */
function FilledMark({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-accent-50 px-1.5 py-px align-middle text-[10px] font-medium text-accent-700 dark:bg-accent-950/50 dark:text-accent-300">
      <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
      filled from text
    </span>
  )
}

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
  marked,
  disabled,
  onChange,
}: {
  legend: string
  name: string
  locked: boolean
  /** A "Fill from text" changed it and it was not edited since (shows the mark). */
  marked: boolean
  disabled: boolean
  onChange: (locked: boolean) => void
}) {
  return (
    <fieldset>
      <legend className={labelCls}>
        {legend}
        <FilledMark show={marked} />
      </legend>
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
