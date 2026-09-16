import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, Copy, Loader2, Pencil, Plus, RefreshCw, RotateCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { errorMessage, type Client, type ClientInsert, type ClientUpdate } from '../lib/types'
import { useProfile } from '../lib/useProfile'
import { useToast } from '../lib/useToast'
import { btnPrimary, btnSecondary, hintCls, iconBtn, inputCls, labelCls, panelCls } from '../components/style/classes'
import { ConfirmDialog } from '../components/style/ConfirmDialog'
import { Modal } from '../components/style/Modal'
import { TagInput } from '../components/style/TagInput'
import { copyText } from '../components/style/clipboard'

const POLL_MS = 30_000

interface ClientRow {
  client: Client
  /** null while counting or when the count failed. */
  cards: number | null
  /** Highest locked Style Card version, or null when none is locked. */
  lockedVersion: number | null
}

function formLink(token: string): string {
  return `${window.location.origin}/brief/${token}`
}

/** 32 lowercase hex chars, same shape as the database default. */
function freshFormToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Clients (active first, then by name) with card counts and the highest locked version. Throws with the Postgres message. */
async function fetchClientRows(): Promise<ClientRow[]> {
  const [clientsRes, lockedRes] = await Promise.all([
    supabase.from('clients').select('*').order('active', { ascending: false }).order('name'),
    supabase.from('style_cards').select('client_id, version').eq('status', 'locked'),
  ])
  if (clientsRes.error) throw new Error(clientsRes.error.message)
  if (lockedRes.error) throw new Error(lockedRes.error.message)

  const locked = new Map<string, number>()
  for (const sc of lockedRes.data) {
    const prev = locked.get(sc.client_id)
    if (prev === undefined || sc.version > prev) locked.set(sc.client_id, sc.version)
  }

  // One HEAD count per client keeps the number exact regardless of how many cards exist.
  const counts = await Promise.all(
    clientsRes.data.map(async (c) => {
      const { count, error } = await supabase
        .from('cards')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', c.id)
      return error ? null : count
    }),
  )

  return clientsRes.data.map((client, i) => ({
    client,
    cards: counts[i],
    lockedVersion: locked.get(client.id) ?? null,
  }))
}

/** /clients — every client, their form link, and (lead only) add / edit / rotate link. */
export default function ClientsPage() {
  const toast = useToast()
  const { isLead } = useProfile()

  const [rows, setRows] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ mode: 'add' } | { mode: 'edit'; client: Client } | null>(null)
  const [rotating, setRotating] = useState<Client | null>(null)
  const [rotateBusy, setRotateBusy] = useState(false)

  const load = useCallback(
    (): Promise<void> =>
      fetchClientRows()
        .then(
          (next) => {
            setRows(next)
            setError(null)
          },
          (e: unknown) => setError(errorMessage(e)),
        )
        .finally(() => setLoading(false)),
    [],
  )

  useEffect(() => {
    void load()
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  const rotate = async () => {
    if (!rotating) return
    setRotateBusy(true)
    const token = freshFormToken()
    try {
      const { error: err } = await supabase.from('clients').update({ form_token: token }).eq('id', rotating.id)
      if (err) throw new Error(err.message)
      setRows((prev) =>
        prev.map((r) => (r.client.id === rotating.id ? { ...r, client: { ...r.client, form_token: token } } : r)),
      )
      setRotating(null)
      try {
        await copyText(formLink(token))
        toast.success(`New form link for ${rotating.name} copied. The old link no longer works.`)
      } catch {
        toast.success(`Form link for ${rotating.name} rotated. Copy the new one from the table.`)
      }
    } catch (e) {
      toast.error(`Could not rotate the link: ${errorMessage(e)}`)
    } finally {
      setRotateBusy(false)
    }
  }

  const activeCount = useMemo(() => rows.filter((r) => r.client.active).length, [rows])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Clients</h1>
          <p className="text-xs text-neutral-500">
            {loading
              ? 'Loading…'
              : `${rows.length} client${rows.length === 1 ? '' : 's'}, ${activeCount} active. Each one has a private brief form link.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              void load()
            }}
            disabled={loading}
            aria-label="Refresh"
            title="Refresh"
            className={iconBtn}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isLead && (
            <button type="button" onClick={() => setDialog({ mode: 'add' })} className={btnPrimary}>
              <Plus className="h-4 w-4" />
              Add client
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {rows.length ? 'Refresh failed' : 'Could not load clients'}: {error}
        </p>
      )}

      <div className={`${panelCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-950/60">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Client
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Style Card
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Cards
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Form link
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-neutral-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-neutral-500">
                    No clients yet.{isLead ? ' Add the first one to get a brief form link.' : ' Ask the lead to add one.'}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <ClientTableRow
                  key={r.client.id}
                  row={r}
                  isLead={isLead}
                  onEdit={() => setDialog({ mode: 'edit', client: r.client })}
                  onRotate={() => setRotating(r.client)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialog && (
        <ClientDialog
          mode={dialog.mode}
          client={dialog.mode === 'edit' ? dialog.client : null}
          onClose={() => setDialog(null)}
          onSaved={async (saved, mode) => {
            setDialog(null)
            toast.success(mode === 'add' ? `${saved.name} added. Copy the form link to send the brief form.` : `${saved.name} updated`)
            await load()
          }}
        />
      )}

      <ConfirmDialog
        open={rotating !== null}
        title={rotating ? `Rotate the form link for ${rotating.name}?` : 'Rotate the form link?'}
        confirmLabel="Rotate link"
        cancelLabel="Keep current link"
        tone="danger"
        busy={rotateBusy}
        onCancel={() => setRotating(null)}
        onConfirm={() => void rotate()}
      >
        The current link stops working the moment you confirm; anyone who opens it sees "This link has expired".
        Briefs already submitted are not affected. Send the new link to the client afterwards.
      </ConfirmDialog>
    </div>
  )
}

/* ---------- Row ---------- */

function ClientTableRow({
  row,
  isLead,
  onEdit,
  onRotate,
}: {
  row: ClientRow
  isLead: boolean
  onEdit: () => void
  onRotate: () => void
}) {
  const { client, cards, lockedVersion } = row
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const link = formLink(client.form_token)

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [copied])

  async function copy() {
    try {
      await copyText(link)
      setCopied(true)
      toast.success(`Form link for ${client.name} copied`)
    } catch (e) {
      toast.error(errorMessage(e, 'Copy failed'))
    }
  }

  return (
    <tr className={client.active ? '' : 'text-neutral-500'}>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-neutral-900 dark:text-neutral-100">{client.name}</span>
          {!client.active && (
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
              Inactive
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          {client.target_px_w}×{client.target_px_h} px · tier {client.default_similarity_tier} ·{' '}
          {client.garment_colors.length ? client.garment_colors.join(', ') : 'no garment colours'}
        </p>
      </td>
      <td className="px-4 py-3 align-top">
        <Link
          to={`/clients/${client.id}/style`}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium outline-none ring-neutral-900/10 focus-visible:ring-4 dark:ring-white/20 ${
            lockedVersion !== null
              ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50'
              : 'bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50'
          }`}
          title={lockedVersion !== null ? 'Open the Style Card editor' : 'No locked Style Card: cards cannot be approved. Open the editor to lock one.'}
        >
          {lockedVersion !== null ? (
            <>
              <Check className="h-3.5 w-3.5" />v{lockedVersion} locked
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5" />
              None locked
            </>
          )}
        </Link>
      </td>
      <td className="px-4 py-3 text-right align-top tabular-nums">{cards === null ? '—' : cards}</td>
      <td className="px-4 py-3 align-top">
        {client.active ? (
          <div className="flex items-center gap-2">
            <code
              className="max-w-[16rem] truncate rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              title={link}
            >
              {link}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              aria-label={`Copy form link for ${client.name}`}
              title="Copy form link"
              className={iconBtn}
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <span className="text-xs text-neutral-500" title="Inactive clients cannot submit briefs. Edit the client to reactivate.">
            Link off while inactive
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right align-top">
        {isLead && (
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRotate}
              aria-label={`Rotate form link for ${client.name}`}
              title="Rotate form link (old link stops working)"
              className={iconBtn}
            >
              <RotateCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${client.name}`}
              title="Edit client"
              className={iconBtn}
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

/* ---------- Add / edit dialog (lead only; RLS enforces it too) ---------- */

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

function ClientDialog({
  mode,
  client,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'edit'
  client: Client | null
  onClose: () => void
  onSaved: (saved: Client, mode: 'add' | 'edit') => Promise<void>
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
          <button
            type="submit"
            form={ids.form}
            disabled={!canSubmit}
            title={problems[0]}
            className={btnPrimary}
          >
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
