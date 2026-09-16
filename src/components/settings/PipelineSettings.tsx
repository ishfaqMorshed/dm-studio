import { useState, type FormEvent } from 'react'
import { AlertCircle, Loader2, PauseCircle, PlayCircle, Save } from 'lucide-react'
import { useSettings } from '../../lib/useSettings'
import { useToast } from '../../lib/useToast'
import { errorMessage, type Settings, type SettingsUpdate } from '../../lib/types'

interface Draft {
  price: string
  maxGenerations: string
  maxFinish: string
}

type DraftErrors = Partial<Record<keyof Draft, string>>

function toDraft(s: Settings): Draft {
  return {
    price: s.per_card_price_usd.toFixed(2),
    maxGenerations: String(s.max_active_generations),
    maxFinish: String(s.max_active_finish),
  }
}

function sameDraft(a: Draft, b: Draft): boolean {
  return a.price === b.price && a.maxGenerations === b.maxGenerations && a.maxFinish === b.maxFinish
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
  return { patch, errors }
}

const inputCls =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm tabular-nums outline-none ring-neutral-900/10 focus:ring-4 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-950 dark:ring-white/10'
const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white outline-none ring-neutral-900/20 hover:bg-neutral-700 focus-visible:ring-4 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:ring-white/30 dark:hover:bg-neutral-200'
const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium outline-none ring-neutral-900/10 hover:bg-neutral-100 focus-visible:ring-4 disabled:opacity-40 dark:border-neutral-700 dark:ring-white/20 dark:hover:bg-neutral-800'

/**
 * The single settings row. The pause switch saves on its own the moment it is flipped
 * (it is the emergency brake); price and worker caps save together with the button.
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
      toast.success('Settings saved. New caps and price apply from the next dispatch.')
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

  return (
    <section
      aria-labelledby="pipeline-settings-heading"
      className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <h2 id="pipeline-settings-heading" className="font-semibold">
          Pipeline
        </h2>
        <p className="text-xs text-neutral-500">Pause switch, per-card price shown on Approve, and how many jobs run at once.</p>
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

          <form onSubmit={(e) => void onSave(e)} className="space-y-4" noValidate>
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
                <span id="price-hint" className="mt-1 block text-xs text-neutral-500">
                  {errors.price ? (
                    <span className="text-red-600 dark:text-red-400">{errors.price}</span>
                  ) : (
                    'Shown in the Approve confirmation. Approving is the only step that spends money.'
                  )}
                </span>
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
                <span id="gens-hint" className="mt-1 block text-xs text-neutral-500">
                  {errors.maxGenerations ? (
                    <span className="text-red-600 dark:text-red-400">{errors.maxGenerations}</span>
                  ) : (
                    'Image jobs the dispatcher may have in flight. Lower it on vendor rate limits; 0 starts nothing.'
                  )}
                </span>
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
                <span id="finish-hint" className="mt-1 block text-xs text-neutral-500">
                  {errors.maxFinish ? (
                    <span className="text-red-600 dark:text-red-400">{errors.maxFinish}</span>
                  ) : (
                    'Upscale + remove-background jobs in flight. The upscaler is the slow step.'
                  )}
                </span>
              </label>
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
