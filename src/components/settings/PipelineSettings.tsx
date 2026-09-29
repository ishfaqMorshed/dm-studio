import { useState, type FormEvent, type ReactNode } from 'react'
import { AlertCircle, Loader2, PauseCircle, PlayCircle, RotateCcw, Save } from 'lucide-react'
import { useSettings } from '../../lib/useSettings'
import { useToast } from '../../lib/useToast'
import {
  GENERATION_RESOLUTIONS,
  defaultAiPlatform,
  errorMessage,
  isGenerationResolution,
  isRecord,
  type AiPlatform,
  type Json,
  type OpenRouterModels,
  type Settings,
  type SettingsUpdate,
} from '../../lib/types'
import { PlatformPicker } from '../PlatformPicker'
import { GENERATION_DEFAULTS, OPENROUTER_MODEL_DEFAULTS } from './generationDefaults'

interface Draft {
  price: string
  maxGenerations: string
  maxFinish: string
  generationModel: string
  generationResolution: string
  visionModel: string
  maxStyleRefs: string
  aiPlatform: AiPlatform
  orVision: string
  orImage: string
  orEdit: string
  orText: string
}

type DraftErrors = Partial<Record<keyof Draft, string>>

const DRAFT_KEYS: readonly (keyof Draft)[] = [
  'price',
  'maxGenerations',
  'maxFinish',
  'generationModel',
  'generationResolution',
  'visionModel',
  'maxStyleRefs',
  'aiPlatform',
  'orVision',
  'orImage',
  'orEdit',
  'orText',
]

/** Draft field ↔ `settings.openrouter_models` key, in form order. */
const OPENROUTER_FIELDS = [
  ['orVision', 'vision'],
  ['orImage', 'image'],
  ['orEdit', 'edit'],
  ['orText', 'text'],
] as const satisfies ReadonlyArray<readonly [keyof Draft, keyof OpenRouterModels]>

/** `settings.openrouter_models` with the column default for any key that is missing or blank. */
function parseOpenRouterModels(json: Json | null | undefined): OpenRouterModels {
  const out: OpenRouterModels = { ...OPENROUTER_MODEL_DEFAULTS }
  if (!isRecord(json)) return out
  for (const [, key] of OPENROUTER_FIELDS) {
    const v = json[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim()
  }
  return out
}

/** OpenRouter ids are `<org>/<model>`, no spaces. */
const OPENROUTER_ID = /^[^\s/]+\/\S+$/

function toDraft(s: Settings): Draft {
  const models = parseOpenRouterModels(s.openrouter_models)
  return {
    price: s.per_card_price_usd.toFixed(2),
    maxGenerations: String(s.max_active_generations),
    maxFinish: String(s.max_active_finish),
    generationModel: s.generation_model,
    generationResolution: s.generation_resolution,
    visionModel: s.vision_model,
    maxStyleRefs: String(s.max_style_refs),
    aiPlatform: defaultAiPlatform(s),
    orVision: models.vision,
    orImage: models.image,
    orEdit: models.edit,
    orText: models.text,
  }
}

function sameDraft(a: Draft, b: Draft): boolean {
  return DRAFT_KEYS.every((k) => a[k] === b[k])
}

function parseMoney(v: string): number | null {
  const n = Number(v.trim().replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

function parseCap(v: string): number | null {
  const t = v.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= 0 && n <= 1000 ? n : null
}

/** Library images the Style Card drafter reads per request: at least one, at most 100. */
function parseRefCount(v: string): number | null {
  const t = v.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= 100 ? n : null
}

function validate(d: Draft, current: Settings): { patch: SettingsUpdate; errors: DraftErrors } {
  const errors: DraftErrors = {}
  const patch: SettingsUpdate = {}
  const price = parseMoney(d.price)
  if (price === null) errors.price = 'Enter a price of 0 or more, e.g. 0.60'
  else if (price !== current.per_card_price_usd) patch.per_card_price_usd = price
  const gens = parseCap(d.maxGenerations)
  if (gens === null) errors.maxGenerations = 'Enter a whole number from 0 to 1000'
  else if (gens !== current.max_active_generations) patch.max_active_generations = gens
  const fin = parseCap(d.maxFinish)
  if (fin === null) errors.maxFinish = 'Enter a whole number from 0 to 1000'
  else if (fin !== current.max_active_finish) patch.max_active_finish = fin
  const model = d.generationModel.trim()
  if (!model) errors.generationModel = `Enter the Kie model id, e.g. ${GENERATION_DEFAULTS.generation_model}`
  else if (model !== current.generation_model) patch.generation_model = model
  if (!isGenerationResolution(d.generationResolution)) errors.generationResolution = 'Pick 1K, 2K or 4K'
  else if (d.generationResolution !== current.generation_resolution) patch.generation_resolution = d.generationResolution
  const vision = d.visionModel.trim()
  if (!vision) errors.visionModel = `Enter the vision model id, e.g. ${GENERATION_DEFAULTS.vision_model}`
  else if (vision !== current.vision_model) patch.vision_model = vision
  const refs = parseRefCount(d.maxStyleRefs)
  if (refs === null) errors.maxStyleRefs = 'Enter a whole number from 1 to 100'
  else if (refs !== current.max_style_refs) patch.max_style_refs = refs
  if (d.aiPlatform !== current.ai_platform) patch.ai_platform = d.aiPlatform
  const savedModels = parseOpenRouterModels(current.openrouter_models)
  const nextModels: OpenRouterModels = { ...savedModels }
  let modelsValid = true
  for (const [field, key] of OPENROUTER_FIELDS) {
    const id = d[field].trim()
    if (!OPENROUTER_ID.test(id)) {
      errors[field] = `Enter an OpenRouter model id like ${OPENROUTER_MODEL_DEFAULTS[key]}`
      modelsValid = false
    } else nextModels[key] = id
  }
  const stored = isRecord(current.openrouter_models) ? current.openrouter_models : {}
  // Compare with the stored JSON, not the parsed view, so a key the row is missing gets written.
  if (modelsValid && OPENROUTER_FIELDS.some(([, key]) => stored[key] !== nextModels[key])) {
    // Keep keys this form does not know about (a later job type, a flag the workers read).
    patch.openrouter_models = { ...stored, ...nextModels }
  }
  return { patch, errors }
}

const inputCls =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm tabular-nums outline-none ring-neutral-900/10 focus:ring-4 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:ring-white/10'
const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white outline-none ring-neutral-900/20 hover:bg-neutral-700 focus-visible:ring-4 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:ring-white/30 dark:hover:bg-neutral-200'
const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium outline-none ring-neutral-900/10 hover:bg-neutral-100 focus-visible:ring-4 disabled:opacity-40 dark:border-neutral-700 dark:ring-white/20 dark:hover:bg-neutral-800'
const linkBtn =
  'inline-flex items-center gap-0.5 rounded text-xs font-medium text-neutral-700 underline decoration-neutral-300 underline-offset-2 outline-none hover:text-neutral-900 focus-visible:ring-4 focus-visible:ring-neutral-900/10 disabled:opacity-40 dark:text-neutral-300 dark:hover:text-neutral-100'
const codeCls = 'rounded bg-neutral-100 px-1 font-mono dark:bg-neutral-800'

/** Hint line under a field: the validation error when there is one, else the description. */
function Hint({ id, error, children }: { id: string; error?: string; children: ReactNode }) {
  return (
    <span id={id} className="mt-1 block text-xs text-neutral-500">
      {error ? <span className="text-red-600 dark:text-red-400">{error}</span> : children}
    </span>
  )
}

/** "Use default" link shown only while the field differs from the database default. */
function UseDefault({ show, disabled, onClick }: { show: boolean; disabled: boolean; onClick: () => void }) {
  if (!show) return null
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={linkBtn}>
      <RotateCcw className="h-3 w-3" aria-hidden="true" />
      Use default
    </button>
  )
}

/** One OpenRouter model id input with its "Use default" link and hint. */
function ModelField({
  id,
  label,
  value,
  defaultValue,
  error,
  disabled,
  onChange,
  children,
}: {
  id: string
  label: string
  value: string
  defaultValue: string
  error?: string
  disabled: boolean
  onChange: (next: string) => void
  children: ReactNode
}) {
  return (
    <div className="text-sm">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <UseDefault show={value !== defaultValue} disabled={disabled} onClick={() => onChange(defaultValue)} />
      </div>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={defaultValue}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint`}
        disabled={disabled}
        className={`${inputCls} font-mono`}
      />
      <Hint id={`${id}-hint`} error={error}>
        {children} Default <code className={codeCls}>{defaultValue}</code>.
      </Hint>
    </div>
  )
}

/**
 * The single settings row. The pause switch saves on its own the moment it is flipped
 * (it is the emergency brake); price, worker caps and the engine fields save together
 * with the button.
 */
export function PipelineSettings() {
  const toast = useToast()
  const { settings, loading, error, refresh, update } = useSettings()
  // null = mirror the saved row; a value = the lead is editing (polls do not clobber it).
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [saving, setSaving] = useState(false)
  const [pausing, setPausing] = useState(false)

  const saved = settings ? toDraft(settings) : null
  const view = draft ?? saved
  const dirty = Boolean(draft && saved && !sameDraft(draft, saved))

  const edit = (patch: Partial<Draft>) => {
    if (!view) return
    setDraft({ ...view, ...patch })
    setErrors({})
  }

  const reset = () => {
    setDraft(null)
    setErrors({})
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!settings || !draft) return
    const { patch, errors: errs } = validate(draft, settings)
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (!Object.keys(patch).length) {
      setDraft(null)
      toast.toast('Nothing changed.')
      return
    }
    setSaving(true)
    try {
      await update(patch)
      setDraft(null)
      toast.success('Settings saved. Caps, price and engine settings apply from the next job.')
    } catch (err) {
      toast.error(`Could not save settings: ${errorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function togglePause() {
    if (!settings || pausing) return
    const next = !settings.pipeline_paused
    setPausing(true)
    try {
      await update({ pipeline_paused: next })
      toast.success(
        next
          ? 'Pipeline paused. Approve is refused and nothing new starts; running jobs finish.'
          : 'Pipeline resumed. Approve works again and the sweep picks up queued cards.',
      )
    } catch (err) {
      toast.error(`Could not ${next ? 'pause' : 'resume'} the pipeline: ${errorMessage(err)}`)
    } finally {
      setPausing(false)
    }
  }

  const paused = settings?.pipeline_paused ?? false
  const resolutionKnown = view ? isGenerationResolution(view.generationResolution) : true

  return (
    <section
      aria-labelledby="pipeline-settings-heading"
      className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <h2 id="pipeline-settings-heading" className="font-semibold">
          Pipeline
        </h2>
        <p className="text-xs text-neutral-500">
          Pause switch, per-card price shown on Approve, how many jobs run at once, the models the engine calls and the AI platform they run on.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="m-5 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Could not load settings: {error}</span>
          <button type="button" onClick={() => void refresh()} className={secondaryBtn}>
            Try again
          </button>
        </div>
      )}

      {loading && !settings ? (
        <div className="flex items-center justify-center py-12 text-neutral-400" role="status" aria-label="Loading">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : settings && view ? (
        <div className="space-y-6 px-5 py-4">
          <div
            className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
              paused
                ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
                : 'border-neutral-200 dark:border-neutral-800'
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {paused ? (
                  <PauseCircle className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                ) : (
                  <PlayCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                )}
                {paused ? 'Pipeline is paused' : 'Pipeline is running'}
              </p>
              <p className="text-xs text-neutral-500">
                {paused
                  ? 'Approve is refused on every card and queued jobs wait. Resume once the vendor is back.'
                  : 'Pause during a vendor outage: approvals stop, running jobs finish, queued ones wait.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={paused}
              aria-label={paused ? 'Resume the pipeline' : 'Pause the pipeline'}
              disabled={pausing}
              onClick={() => void togglePause()}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full outline-none ring-neutral-900/20 transition focus-visible:ring-4 disabled:opacity-50 dark:ring-white/30 ${
                paused ? 'bg-amber-500' : 'bg-neutral-300 dark:bg-neutral-700'
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition ${
                  paused ? 'translate-x-6' : 'translate-x-1'
                }`}
              >
                {pausing && <Loader2 className="h-3 w-3 animate-spin text-neutral-500" />}
              </span>
            </button>
            <span className="w-16 text-right text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {paused ? 'Paused' : 'Running'}
            </span>
          </div>

          <form onSubmit={(e) => void onSave(e)} className="space-y-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Price per card (USD)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={view.price}
                  onChange={(e) => edit({ price: e.target.value })}
                  aria-invalid={Boolean(errors.price)}
                  aria-describedby="price-hint"
                  disabled={saving}
                  className={inputCls}
                />
                <Hint id="price-hint" error={errors.price}>
                  Shown in the Approve confirmation. Approving is the only step that spends money.
                </Hint>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Max generations running</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={view.maxGenerations}
                  onChange={(e) => edit({ maxGenerations: e.target.value })}
                  aria-invalid={Boolean(errors.maxGenerations)}
                  aria-describedby="gens-hint"
                  disabled={saving}
                  className={inputCls}
                />
                <Hint id="gens-hint" error={errors.maxGenerations}>
                  Image jobs the dispatcher may have in flight. Lower it on vendor rate limits; 0 starts nothing.
                </Hint>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Max finisher jobs running</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={view.maxFinish}
                  onChange={(e) => edit({ maxFinish: e.target.value })}
                  aria-invalid={Boolean(errors.maxFinish)}
                  aria-describedby="finish-hint"
                  disabled={saving}
                  className={inputCls}
                />
                <Hint id="finish-hint" error={errors.maxFinish}>
                  Upscale + remove-background jobs in flight. The upscaler is the slow step.
                </Hint>
              </label>
            </div>

            <div className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <div>
                <h3 className="text-sm font-semibold">Generation engine</h3>
                <p className="text-xs text-neutral-500">
                  What the worker sends to Kie on Approve and which model reads the reference images. A change applies to
                  the next job, never to one already running; the Approve dialog shows the current pair.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="text-sm">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <label htmlFor="generation-model" className="font-medium">
                      Image model
                    </label>
                    <UseDefault
                      show={view.generationModel !== GENERATION_DEFAULTS.generation_model}
                      disabled={saving}
                      onClick={() => edit({ generationModel: GENERATION_DEFAULTS.generation_model })}
                    />
                  </div>
                  <input
                    id="generation-model"
                    type="text"
                    value={view.generationModel}
                    onChange={(e) => edit({ generationModel: e.target.value })}
                    placeholder={GENERATION_DEFAULTS.generation_model}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={Boolean(errors.generationModel)}
                    aria-describedby="generation-model-hint"
                    disabled={saving}
                    className={`${inputCls} font-mono`}
                  />
                  <Hint id="generation-model-hint" error={errors.generationModel}>
                    Kie model id used by Studio Generate (image-to-image with the references attached). Default{' '}
                    <code className={codeCls}>{GENERATION_DEFAULTS.generation_model}</code>.
                  </Hint>
                </div>
                <div className="text-sm">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <label htmlFor="generation-resolution" className="font-medium">
                      Resolution
                    </label>
                    <UseDefault
                      show={view.generationResolution !== GENERATION_DEFAULTS.generation_resolution}
                      disabled={saving}
                      onClick={() => edit({ generationResolution: GENERATION_DEFAULTS.generation_resolution })}
                    />
                  </div>
                  <select
                    id="generation-resolution"
                    value={view.generationResolution}
                    onChange={(e) => edit({ generationResolution: e.target.value })}
                    aria-invalid={Boolean(errors.generationResolution)}
                    aria-describedby="generation-resolution-hint"
                    disabled={saving}
                    className={inputCls}
                  >
                    {!resolutionKnown && (
                      <option value={view.generationResolution}>
                        {view.generationResolution || '(empty)'} — not a valid option
                      </option>
                    )}
                    {GENERATION_RESOLUTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <Hint id="generation-resolution-hint" error={errors.generationResolution}>
                    Size Kie renders at. 1K is quick for drafts, 4K takes longer per job; the finisher upscales to print
                    size either way. Default {GENERATION_DEFAULTS.generation_resolution}.
                  </Hint>
                </div>
                <div className="text-sm">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <label htmlFor="vision-model" className="font-medium">
                      Vision model
                    </label>
                    <UseDefault
                      show={view.visionModel !== GENERATION_DEFAULTS.vision_model}
                      disabled={saving}
                      onClick={() => edit({ visionModel: GENERATION_DEFAULTS.vision_model })}
                    />
                  </div>
                  <input
                    id="vision-model"
                    type="text"
                    value={view.visionModel}
                    onChange={(e) => edit({ visionModel: e.target.value })}
                    placeholder={GENERATION_DEFAULTS.vision_model}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={Boolean(errors.visionModel)}
                    aria-describedby="vision-model-hint"
                    disabled={saving}
                    className={`${inputCls} font-mono`}
                  />
                  <Hint id="vision-model-hint" error={errors.visionModel}>
                    Model behind the vision calls: reading a card&apos;s references, drafting Style Cards from the library
                    and judging QC. Default <code className={codeCls}>{GENERATION_DEFAULTS.vision_model}</code>.
                  </Hint>
                </div>
                <div className="text-sm">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <label htmlFor="max-style-refs" className="font-medium">
                      Library images per Style Card draft
                    </label>
                    <UseDefault
                      show={view.maxStyleRefs !== String(GENERATION_DEFAULTS.max_style_refs)}
                      disabled={saving}
                      onClick={() => edit({ maxStyleRefs: String(GENERATION_DEFAULTS.max_style_refs) })}
                    />
                  </div>
                  <input
                    id="max-style-refs"
                    type="text"
                    inputMode="numeric"
                    value={view.maxStyleRefs}
                    onChange={(e) => edit({ maxStyleRefs: e.target.value })}
                    aria-invalid={Boolean(errors.maxStyleRefs)}
                    aria-describedby="max-style-refs-hint"
                    disabled={saving}
                    className={inputCls}
                  />
                  <Hint id="max-style-refs-hint" error={errors.maxStyleRefs}>
                    How many of a client&apos;s library images the drafter reads when you press &ldquo;Draft Style Card
                    from library&rdquo;; the rest are ignored. Default {GENERATION_DEFAULTS.max_style_refs}.
                  </Hint>
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <div>
                <h3 className="text-sm font-semibold">AI platform</h3>
                <p className="text-xs text-neutral-500">
                  Where the AI steps run. Intake, Style Card drafts and the nightly lessons always use this default; the card
                  page preselects it on Approve, Edit text, Edit region and Regenerate, where a designer can pick another
                  platform for that one run.
                </p>
              </div>
              <PlatformPicker
                label="Studio default"
                value={view.aiPlatform}
                onChange={(aiPlatform) => edit({ aiPlatform })}
                disabled={saving}
                className="sm:max-w-sm"
              />
              <div>
                <h4 className="text-sm font-medium">OpenRouter models</h4>
                <p className="text-xs text-neutral-500">
                  Model ids used when a step runs on OpenRouter: always with OpenRouter, and with Auto for any call Kie
                  reports as down. They should be the same models the Kie ids above point to.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ModelField
                  id="openrouter-vision"
                  label="Vision & QC"
                  value={view.orVision}
                  defaultValue={OPENROUTER_MODEL_DEFAULTS.vision}
                  error={errors.orVision}
                  disabled={saving}
                  onChange={(orVision) => edit({ orVision })}
                >
                  Reads a card&apos;s references, drafts Style Cards and judges QC.
                </ModelField>
                <ModelField
                  id="openrouter-image"
                  label="Image generation"
                  value={view.orImage}
                  defaultValue={OPENROUTER_MODEL_DEFAULTS.image}
                  error={errors.orImage}
                  disabled={saving}
                  onChange={(orImage) => edit({ orImage })}
                >
                  Approve and Regenerate, with the references attached.
                </ModelField>
                <ModelField
                  id="openrouter-edit"
                  label="Image edits"
                  value={view.orEdit}
                  defaultValue={OPENROUTER_MODEL_DEFAULTS.edit}
                  error={errors.orEdit}
                  disabled={saving}
                  onChange={(orEdit) => edit({ orEdit })}
                >
                  Edit text and Edit region (Kie runs them on <code className={codeCls}>google/nano-banana-edit</code>).
                </ModelField>
                <ModelField
                  id="openrouter-text"
                  label="Lessons"
                  value={view.orText}
                  defaultValue={OPENROUTER_MODEL_DEFAULTS.text}
                  error={errors.orText}
                  disabled={saving}
                  onChange={(orText) => edit({ orText })}
                >
                  Writes the nightly lessons from designer rejections.
                </ModelField>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={!dirty || saving} className={primaryBtn}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save settings
              </button>
              <button type="button" onClick={reset} disabled={!dirty || saving} className={secondaryBtn}>
                Discard changes
              </button>
              <span className="ml-auto text-xs text-neutral-400">
                Last changed {new Date(settings.updated_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </div>
          </form>

          <dl className="grid gap-1 text-xs text-neutral-500 sm:grid-cols-[auto_1fr] sm:gap-x-4">
            <dt className="font-medium text-neutral-600 dark:text-neutral-400">n8n base URL</dt>
            <dd className="break-all font-mono">{settings.n8n_base_url}</dd>
          </dl>
        </div>
      ) : (
        !error && (
          <p className="px-5 py-8 text-center text-sm text-neutral-500">
            The settings row is missing. Insert `settings` id 1 in Supabase before using the studio.
          </p>
        )
      )}
    </section>
  )
}
