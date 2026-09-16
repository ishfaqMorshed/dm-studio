import { useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, FilePlus2, Loader2, Plus, Zap } from 'lucide-react'
import { Modal } from './Modal'
import { SLUG_PATTERN, usePromptTemplates, type TemplateGroup } from './usePromptTemplates'
import { useToast } from '../../lib/useToast'
import { errorMessage, type PromptTemplate } from '../../lib/types'

const CONFIRM_MS = 4000

const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white outline-none ring-neutral-900/20 hover:bg-neutral-700 focus-visible:ring-4 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:ring-white/30 dark:hover:bg-neutral-200'
const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium outline-none ring-neutral-900/10 hover:bg-neutral-100 focus-visible:ring-4 disabled:opacity-40 dark:border-neutral-700 dark:ring-white/20 dark:hover:bg-neutral-800'
const inputCls =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none ring-neutral-900/10 focus:ring-4 read-only:bg-neutral-100 read-only:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:ring-white/10 dark:read-only:bg-neutral-900'

function when(iso: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isNaN(t) ? iso : new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

interface DialogState {
  slug: string
  slugEditable: boolean
  body: string
}

/** Prompt templates grouped by slug: activate a version, or add the next one as a draft. */
export function PromptTemplates() {
  const toast = useToast()
  const { groups, loading, error, refresh, activate, createVersion, nameOf } = usePromptTemplates()
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [saving, setSaving] = useState(false)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [armedId, setArmedId] = useState<string | null>(null)
  const [openBodies, setOpenBodies] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!armedId) return
    const t = window.setTimeout(() => setArmedId(null), CONFIRM_MS)
    return () => window.clearTimeout(t)
  }, [armedId])

  const openNewVersion = (group: TemplateGroup) => {
    const source = group.active ?? group.versions[0] ?? null
    setSlugError(null)
    setDialog({ slug: group.slug, slugEditable: false, body: source?.body ?? '' })
  }

  const openNewSlug = () => {
    setSlugError(null)
    setDialog({ slug: '', slugEditable: true, body: '' })
  }

  const nextVersionFor = (slug: string): number => groups.find((g) => g.slug === slug)?.nextVersion ?? 1

  async function onActivate(t: PromptTemplate) {
    if (t.active || activatingId) return
    if (armedId !== t.id) {
      setArmedId(t.id)
      return
    }
    setArmedId(null)
    setActivatingId(t.id)
    try {
      await activate(t)
      toast.success(`${t.slug} v${t.version} is now active. Workers use it from the next job.`)
    } catch (e) {
      toast.error(`Could not activate ${t.slug} v${t.version}: ${errorMessage(e)}`)
    } finally {
      setActivatingId(null)
    }
  }

  async function onSaveVersion(e: FormEvent) {
    e.preventDefault()
    if (!dialog || saving) return
    const slug = dialog.slug.trim()
    if (!SLUG_PATTERN.test(slug)) {
      setSlugError('Use lowercase letters, digits, - or _, starting with a letter or digit (e.g. generate_prompt).')
      return
    }
    if (!dialog.body.trim()) {
      toast.error('The template body is empty. Paste the prompt before saving.')
      return
    }
    setSaving(true)
    try {
      const row = await createVersion(slug, dialog.body)
      setDialog(null)
      toast.success(`Saved ${row.slug} v${row.version}. It stays inactive until you activate it.`)
    } catch (err) {
      toast.error(`Could not save the version: ${errorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const toggleBody = (id: string) =>
    setOpenBodies((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <section
      aria-labelledby="prompt-templates-heading"
      className="rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <h2 id="prompt-templates-heading" className="font-semibold">
            Prompt templates
          </h2>
          <p className="text-xs text-neutral-500">
            One active version per slug. New versions start inactive; activate one once it passes the evaluation set.
          </p>
        </div>
        <button type="button" onClick={openNewSlug} className={secondaryBtn}>
          <Plus className="h-3.5 w-3.5" />
          New template
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="m-5 flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Could not load prompt templates: {error}</span>
          <button type="button" onClick={() => void refresh()} className={secondaryBtn}>
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-neutral-400" role="status" aria-label="Loading">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        !error && (
          <p className="px-5 py-10 text-center text-sm text-neutral-500">
            No prompt templates yet. Add one with &quot;New template&quot;; the workers read the active version of each slug.
          </p>
        )
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {groups.map((group) => (
            <li key={group.slug} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-mono text-sm font-semibold">{group.slug}</h3>
                {group.active ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                    v{group.active.version} active
                  </span>
                ) : (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/50 dark:text-red-300">
                    No active version — workers cannot use this slug
                  </span>
                )}
                <button type="button" onClick={() => openNewVersion(group)} className={`${secondaryBtn} ml-auto`}>
                  <FilePlus2 className="h-3.5 w-3.5" />
                  New version (v{group.nextVersion})
                </button>
              </div>

              <ul className="mt-3 space-y-2">
                {group.versions.map((t) => {
                  const open = openBodies.has(t.id)
                  const armed = armedId === t.id
                  const activating = activatingId === t.id
                  const by = nameOf(t.activated_by)
                  return (
                    <li
                      key={t.id}
                      className={`rounded-xl border px-3 py-2 ${
                        t.active
                          ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
                          : 'border-neutral-200 dark:border-neutral-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-sm font-medium tabular-nums">v{t.version}</span>
                        {t.active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Active
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void onActivate(t)}
                            disabled={Boolean(activatingId)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium outline-none ring-neutral-900/10 focus-visible:ring-4 disabled:opacity-40 dark:ring-white/20 ${
                              armed
                                ? 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200'
                                : 'border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800'
                            }`}
                            title={armed ? 'Click again to switch workers to this version' : `Make v${t.version} the version workers use`}
                          >
                            {activating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                            {armed ? `Switch to v${t.version}?` : 'Activate'}
                          </button>
                        )}
                        <span className="text-xs text-neutral-500">
                          {t.activated_at
                            ? `Activated ${when(t.activated_at)}${by ? ` by ${by}` : ''}`
                            : `Added ${when(t.created_at)} · never activated`}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleBody(t.id)}
                          aria-expanded={open}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-neutral-600 outline-none ring-neutral-900/10 hover:text-neutral-900 focus-visible:ring-4 dark:text-neutral-400 dark:ring-white/20 dark:hover:text-neutral-100"
                        >
                          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {open ? 'Hide body' : 'Show body'}
                        </button>
                      </div>
                      {open && (
                        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-100 p-3 font-mono text-xs leading-relaxed dark:bg-neutral-950">
                          {t.body}
                        </pre>
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <Modal
          title={dialog.slugEditable ? 'New prompt template' : `New version of ${dialog.slug}`}
          description={
            dialog.slugEditable
              ? 'Starts at v1, inactive. Activate it from the list once it has been checked.'
              : `Saved as v${nextVersionFor(dialog.slug)}, inactive. The current active version keeps running until you activate this one.`
          }
          onClose={() => !saving && setDialog(null)}
          footer={
            <>
              <button type="button" onClick={() => setDialog(null)} disabled={saving} className={secondaryBtn}>
                Cancel
              </button>
              <button type="submit" form="template-version-form" disabled={saving} className={primaryBtn}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save as v{nextVersionFor(dialog.slug.trim())} (inactive)
              </button>
            </>
          }
        >
          <form id="template-version-form" onSubmit={(e) => void onSaveVersion(e)} className="space-y-4" noValidate>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Slug</span>
              <input
                type="text"
                value={dialog.slug}
                readOnly={!dialog.slugEditable}
                onChange={(e) => {
                  setSlugError(null)
                  setDialog({ ...dialog, slug: e.target.value })
                }}
                placeholder="generate_prompt"
                spellCheck={false}
                autoCapitalize="none"
                aria-invalid={Boolean(slugError)}
                className={`${inputCls} font-mono`}
              />
              {slugError && (
                <span className="mt-1 block text-xs text-red-600 dark:text-red-400" role="alert">
                  {slugError}
                </span>
              )}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Body</span>
              <textarea
                value={dialog.body}
                onChange={(e) => setDialog({ ...dialog, body: e.target.value })}
                rows={16}
                spellCheck={false}
                placeholder="Paste the full prompt template here."
                className={`${inputCls} min-h-[12rem] resize-y font-mono text-xs leading-relaxed`}
              />
              <span className="mt-1 block text-xs text-neutral-500">
                {dialog.body.length.toLocaleString()} characters. Placeholders and formatting are saved exactly as typed.
              </span>
            </label>
          </form>
        </Modal>
      )}
    </section>
  )
}
