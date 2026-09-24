import { useId, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { errorMessage, type Client, type ClientInsert, type ClientUpdate } from '../../lib/types'
import { useToast } from '../../lib/useToast'
import { btnPrimary, btnSecondary, hintCls, inputCls, labelCls } from '../style/classes'
import { Modal } from '../style/Modal'
import { TagInput } from '../style/TagInput'

/* ---------- Add / edit client dialog (lead only; RLS enforces it too) ---------- */

const TIERS = [
  { value: 1, label: '1 · Style only, new subject' },
  { value: 2, label: '2 · Loosely inspired by the references' },
  { value: 3, label: '3 · Balanced (default)' },
  { value: 4, label: '4 · Close to the references' },
  { value: 5, label: '5 · As close as possible' },
] as const

const PX_MIN = 300
const PX_MAX = 20_000

interface ClientForm {
  name: string
  garment_colors: string[]
  target_px_w: string
  target_px_h: string
  default_similarity_tier: number
  active: boolean
}

function formFromClient(client: Client | null): ClientForm {
  return client
    ? {
        name: client.name,
        garment_colors: client.garment_colors,
        target_px_w: String(client.target_px_w),
        target_px_h: String(client.target_px_h),
        default_similarity_tier: client.default_similarity_tier,
        active: client.active,
      }
    : {
        name: '',
        garment_colors: ['black', 'white'],
        target_px_w: '4500',
        target_px_h: '5400',
        default_similarity_tier: 3,
        active: true,
      }
}

function parsePx(s: string): number | null {
  const n = Number(s.trim())
  return Number.isInteger(n) && n >= PX_MIN && n <= PX_MAX ? n : null
}

/** Shared by the Clients table and the client panel. `onSaved` receives the saved row. */
export function ClientDialog({
  mode,
  client,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'edit'
  client: Client | null
  onClose: () => void
  onSaved: (saved: Client, mode: 'add' | 'edit') => Promise<void> | void
}) {
  const [form, setForm] = useState<ClientForm>(() => formFromClient(client))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const ids = { name: useId(), colors: useId(), w: useId(), h: useId(), tier: useId(), active: useId(), form: useId() }

  const name = form.name.trim()
  const w = parsePx(form.target_px_w)
  const h = parsePx(form.target_px_h)
  const problems: string[] = []
  if (!name) problems.push('Name is required.')
  if (w === null || h === null) problems.push(`Target size must be whole pixels between ${PX_MIN} and ${PX_MAX.toLocaleString()}.`)
  const canSubmit = problems.length === 0 && !busy

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit || w === null || h === null) return
    setBusy(true)
    setError(null)
    try {
      const values: ClientUpdate & ClientInsert = {
        name,
        garment_colors: form.garment_colors,
        target_px_w: w,
        target_px_h: h,
        default_similarity_tier: form.default_similarity_tier,
        active: form.active,
      }
      const res =
        mode === 'add'
          ? await supabase.from('clients').insert(values).select('*').single()
          : await supabase.from('clients').update(values).eq('id', client!.id).select('*').single()
      if (res.error) throw new Error(res.error.message)
      await onSaved(res.data, mode)
    } catch (e) {
      const msg = errorMessage(e)
      setError(msg)
      toast.error(`${mode === 'add' ? 'Add client' : 'Save'} failed: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      closeDisabled={busy}
      title={mode === 'add' ? 'Add client' : `Edit ${client?.name ?? 'client'}`}
      description={
        mode === 'add'
          ? 'A private brief form link is created with the client.'
          : 'Changes apply to new briefs. The form link stays the same.'
      }
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" form={ids.form} disabled={!canSubmit} title={problems[0]} className={btnPrimary}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'add' ? 'Add client' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id={ids.form} onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor={ids.name} className={labelCls}>
            Name
          </label>
          <input
            id={ids.name}
            data-autofocus
            type="text"
            required
            value={form.name}
            disabled={busy}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Client or brand name"
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor={ids.colors} className={labelCls}>
            Garment colours
          </label>
          <TagInput
            id={ids.colors}
            value={form.garment_colors}
            onChange={(v) => setForm({ ...form, garment_colors: v })}
            disabled={busy}
            placeholder="black, white, heather"
            ariaLabel="Garment colours"
          />
          <p className={hintCls}>
            Offered as choices on the brief form, plus "other". Press Enter or comma after each colour.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={ids.w} className={labelCls}>
              Target width (px)
            </label>
            <input
              id={ids.w}
              type="number"
              inputMode="numeric"
              min={PX_MIN}
              max={PX_MAX}
              step={1}
              value={form.target_px_w}
              disabled={busy}
              onChange={(e) => setForm({ ...form, target_px_w: e.target.value })}
              aria-invalid={w === null || undefined}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor={ids.h} className={labelCls}>
              Target height (px)
            </label>
            <input
              id={ids.h}
              type="number"
              inputMode="numeric"
              min={PX_MIN}
              max={PX_MAX}
              step={1}
              value={form.target_px_h}
              disabled={busy}
              onChange={(e) => setForm({ ...form, target_px_h: e.target.value })}
              aria-invalid={h === null || undefined}
              className={inputCls}
            />
          </div>
        </div>
        <p className={`${hintCls} -mt-2`}>Finals are upscaled to this size at 300 DPI. 4500×5400 is a 15×18 in front print.</p>

        <div>
          <label htmlFor={ids.tier} className={labelCls}>
            Default similarity tier
          </label>
          <select
            id={ids.tier}
            value={form.default_similarity_tier}
            disabled={busy}
            onChange={(e) => setForm({ ...form, default_similarity_tier: Number(e.target.value) })}
            className={inputCls}
          >
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <p className={hintCls}>How close new designs may sit to the client's references. Designers can change it per card.</p>
        </div>

        <label htmlFor={ids.active} className="flex items-start gap-2 text-sm">
          <input
            id={ids.active}
            type="checkbox"
            checked={form.active}
            disabled={busy}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-neutral-900 dark:accent-white"
          />
          <span>
            <span className="font-medium">Active</span>
            <span className="block text-xs text-neutral-500">
              Inactive clients keep their history but the brief form refuses new submissions.
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
