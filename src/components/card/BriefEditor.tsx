import { useId, useMemo, useState, type FormEvent } from 'react'
import { Lock, Plus, Save, Trash2, Undo2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/useToast'
import { STAGE_LABEL } from '../../lib/stage'
import {
  errorMessage,
  parsePrintText,
  PLACEMENTS,
  PLACEMENT_LABEL,
  PRINT_TEXT_ROLES,
  type Card,
  type CardUpdate,
  type PrintTextLine,
  type PrintTextRole,
} from '../../lib/types'
import { JsonTree } from './JsonTree'
import { formatDateTime } from './format'
import { btnGhost, btnPrimary, btnSecondary, btnSmall, inlineSelectCls, inputCls, selectCls, textareaCls } from './styles'
import { Field, Panel, Spinner } from './ui'
import type { CardRow } from './useCardData'

const ROLE_LABEL: Record<PrintTextRole, string> = { headline: 'Headline', sub: 'Sub', tagline: 'Tagline' }

const TIERS = [
  { value: '1', label: '1 — style only, new subject' },
  { value: '2', label: '2 — loosely inspired' },
  { value: '3', label: '3 — balanced' },
  { value: '4', label: '4 — close to the references' },
  { value: '5', label: '5 — as close as the model allows' },
] as const

const COMMON_COLOURS = ['black', 'white', 'heather', 'navy']

interface BriefForm {
  brief_text: string
  lines: PrintTextLine[]
  garment_color: string
  placement: string
  due_on: string
  avoid_notes: string
  /** '' means "use the client default". */
  similarity_tier: string
}

function formFromCard(card: Card): BriefForm {
  return {
    brief_text: card.brief_text ?? '',
    lines: parsePrintText(card.print_text),
    garment_color: card.garment_color ?? '',
    placement: card.placement ?? '',
    due_on: card.due_on ? card.due_on.slice(0, 10) : '',
    avoid_notes: card.avoid_notes ?? '',
    similarity_tier: card.similarity_tier == null ? '' : String(card.similarity_tier),
  }
}

const signature = (f: BriefForm) => JSON.stringify(f)

function patchFromForm(f: BriefForm): CardUpdate {
  return {
    brief_text: f.brief_text.trim(),
    print_text: f.lines.map((l) => ({ role: l.role, text: l.text.trim() })).filter((l) => l.text),
    garment_color: f.garment_color.trim() || null,
    placement: f.placement || null,
    due_on: f.due_on || null,
    avoid_notes: f.avoid_notes.trim() || null,
    similarity_tier: f.similarity_tier ? Number(f.similarity_tier) : null,
  }
}

interface EditorState {
  baseSig: string
  form: BriefForm
}

/**
 * Every brief field, editable with an explicit Save. Read-only while a worker owns
 * the card (generating / editing / finishing). Server changes are adopted while the
 * form is untouched; unsaved edits are never overwritten.
 */
export function BriefEditor({
  card,
  locked,
  onSaved,
  collapsible,
  defaultOpen,
}: {
  card: CardRow
  locked: boolean
  onSaved: (card: Card) => void
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const toast = useToast()
  const colourListId = useId()
  const base = useMemo(() => formFromCard(card), [card])
  const baseSig = useMemo(() => signature(base), [base])
  const [state, setState] = useState<EditorState>(() => ({ baseSig, form: base }))
  const [saving, setSaving] = useState(false)

  const dirty = signature(state.form) !== state.baseSig
  // Adopt the fresh row when nothing is pending (render-phase reset, per React's "adjusting state on prop change").
  if (state.baseSig !== baseSig && !dirty) setState({ baseSig, form: base })
  const changedElsewhere = state.baseSig !== baseSig && dirty

  const form = state.form
  const set = (patch: Partial<BriefForm>) => setState((s) => ({ ...s, form: { ...s.form, ...patch } }))
  const setLine = (i: number, patch: Partial<PrintTextLine>) =>
    set({ lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  const clientColours = card.clients?.garment_colors ?? []
  const colourOptions = Array.from(new Set([...clientColours, ...COMMON_COLOURS]))
  const placementOptions: Array<{ value: string; label: string }> = PLACEMENTS.map((p) => ({ value: p, label: PLACEMENT_LABEL[p] }))
  if (form.placement && !PLACEMENTS.some((p) => p === form.placement)) {
    placementOptions.push({ value: form.placement, label: `${form.placement} (from the form)` })
  }
  const defaultTier = card.clients?.default_similarity_tier

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (locked || !dirty || saving) return
    setSaving(true)
    try {
      const { data, error } = await supabase.from('cards').update(patchFromForm(form)).eq('id', card.id).select('*').single()
      if (error) {
        throw new Error(
          error.code === 'PGRST116'
            ? 'Nothing was saved. The card cannot be edited in its current stage, or you do not have permission.'
            : error.message,
        )
      }
      onSaved(data)
      const fresh = formFromCard(data)
      setState({ baseSig: signature(fresh), form: fresh })
      toast.success('Brief saved')
    } catch (err) {
      toast.error(`Save failed: ${errorMessage(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const subtitle = locked
    ? `Read-only while ${STAGE_LABEL[card.stage].toLowerCase()} — the pipeline owns this card`
    : card.approved_at
      ? 'Approved — later edits only reach the next regenerate'
      : 'Editable until you approve'

  return (
    <Panel
      title="Brief"
      subtitle={subtitle}
      actions={locked ? <Lock className="h-4 w-4 text-neutral-400" aria-label="Locked" /> : undefined}
      collapsible={collapsible}
      defaultOpen={defaultOpen}
    >
      <form onSubmit={onSubmit} className="space-y-4" aria-busy={saving}>
        <fieldset disabled={locked || saving} className="space-y-4">
          <Field label="Description" hint={`${form.brief_text.length} characters`}>
            <textarea
              value={form.brief_text}
              onChange={(e) => set({ brief_text: e.target.value })}
              rows={4}
              className={textareaCls}
              placeholder="What the design should show"
            />
          </Field>

          <Field as="div" label="Text to print" hint="Each line prints once, spelled exactly as typed">
            <div className="space-y-2">
              {form.lines.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    aria-label={`Line ${i + 1} role`}
                    value={line.role}
                    onChange={(e) => setLine(i, { role: e.target.value as PrintTextRole })}
                    className={`${inlineSelectCls} w-28 shrink-0`}
                  >
                    {PRINT_TEXT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Line ${i + 1} text`}
                    value={line.text}
                    onChange={(e) => setLine(i, { text: e.target.value })}
                    className={`${inputCls} min-w-0 flex-1`}
                    placeholder="Exact text"
                  />
                  <button
                    type="button"
                    onClick={() => set({ lines: form.lines.filter((_, j) => j !== i) })}
                    aria-label={`Remove line ${i + 1}`}
                    title="Remove line"
                    className={`${btnGhost} shrink-0`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {form.lines.length === 0 && <p className="text-xs text-neutral-500">No text on this design.</p>}
              <button
                type="button"
                onClick={() => set({ lines: [...form.lines, { role: form.lines.length ? 'sub' : 'headline', text: '' }] })}
                className={`${btnSecondary} ${btnSmall}`}
              >
                <Plus className="h-3.5 w-3.5" />
                Add line
              </button>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Garment colour">
              <input
                list={colourListId}
                value={form.garment_color}
                onChange={(e) => set({ garment_color: e.target.value })}
                className={inputCls}
                placeholder="black, white, heather…"
              />
              <datalist id={colourListId}>
                {colourOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Placement" hint="Drives the aspect ratio">
              <select value={form.placement} onChange={(e) => set({ placement: e.target.value })} className={selectCls}>
                <option value="">Not set</option>
                {placementOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due on" hint="Optional">
              <input type="date" value={form.due_on} onChange={(e) => set({ due_on: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Similarity to references" hint="1 = style only · 5 = very close">
              <select
                value={form.similarity_tier}
                onChange={(e) => set({ similarity_tier: e.target.value })}
                className={selectCls}
              >
                <option value="">Client default{defaultTier ? ` (${defaultTier})` : ''}</option>
                {TIERS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Avoid" hint="Anything in the references that must not be copied">
            <textarea
              value={form.avoid_notes}
              onChange={(e) => set({ avoid_notes: e.target.value })}
              rows={2}
              className={textareaCls}
              placeholder="e.g. do not reuse the wolf; keep the badge shape only"
            />
          </Field>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={locked || !dirty || saving} className={btnPrimary}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />}
            Save brief
          </button>
          <button
            type="button"
            onClick={() => setState({ baseSig, form: base })}
            disabled={!dirty || saving}
            className={btnSecondary}
          >
            <Undo2 className="h-4 w-4" />
            Discard changes
          </button>
          {changedElsewhere && (
            <span className="text-xs text-amber-700 dark:text-amber-300">
              This card changed elsewhere while you were editing. Saving will overwrite those fields.
            </span>
          )}
          {!dirty && !locked && <span className="text-xs text-neutral-500">Saved {formatDateTime(card.updated_at)}</span>}
        </div>
      </form>

      <details className="mt-4 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
        <summary className="cursor-pointer text-xs font-medium text-neutral-600 dark:text-neutral-400">
          What the client sent (never edited)
        </summary>
        <div className="mt-2">
          <JsonTree value={card.client_submission} />
        </div>
      </details>
    </Panel>
  )
}
