import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, Images, Loader2, Trash2, XCircle } from 'lucide-react'
import { createCardAsDesigner } from '../../lib/api'
import { errorMessage, PLACEMENTS, PLACEMENT_LABEL, type Placement } from '../../lib/types'
import { useClientScope } from '../../lib/useClientScope'
import { useToast } from '../../lib/useToast'
import { ACCEPT_ATTR, DESCRIPTION_MAX_CHARS, OTHER_GARMENT } from '../brief/constants'
import { formatBytes, inspectImageFile, type ReferenceImage } from '../brief/imageFile'
import { capitalise, ISO_DATE, todayIso } from '../brief/text'
import { btnGhost, btnPrimary, btnSecondary, checkerboard, inlineSelectCls, inputCls, selectCls, textareaCls } from '../card/styles'
import { Dialog, Spinner } from '../card/ui'
import { garmentOptionsFor, newCardId, removeUploadedReferences, TIER_OPTIONS, uploadDesignerReference } from './newCard'

/** Files accepted in one batch; the loop is sequential so a bigger drop only gets slower. */
export const MAX_BULK_FILES = 40

type ItemStatus = 'ready' | 'uploading' | 'creating' | 'done' | 'failed'

interface BulkItem {
  key: string
  image: ReferenceImage
  /** Optional headline for this design; the shared description covers the rest. */
  headline: string
  status: ItemStatus
  error: string | null
  cardId: string | null
}

interface FormErrors {
  client?: string
  files?: string
  description?: string
  garment?: string
  garmentOther?: string
  placement?: string
  dueOn?: string
}

const labelCls = 'mb-1 block text-sm font-medium'
const hintCls = 'mt-1 text-xs text-neutral-500'
const errorCls = 'mt-1 text-xs text-red-600 dark:text-red-400'

function invalid(base: string, isInvalid: boolean): string {
  return isInvalid ? `${base} border-red-400 dark:border-red-500` : base
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  ready: 'Ready',
  uploading: 'Uploading…',
  creating: 'Creating card…',
  done: 'Created',
  failed: 'Failed',
}

/**
 * Bulk intake for designers: drop many images, fill the brief fields once, and one
 * intake card is created per image (reference slot 1 = that image). Same RPC and
 * storage path as the single New card dialog, looped with a progress line; a failed
 * card stays in the list with its error so the designer can retry just those.
 * Mount only while open.
 */
export function BulkCardsDialog({ clientId: scopedClientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const toast = useToast()
  const ids = useId()
  const formId = `${ids}-form`
  const inputRef = useRef<HTMLInputElement>(null)
  const { clients, loading: clientsLoading } = useClientScope()

  const [clientId, setClientId] = useState(scopedClientId ?? '')
  const [items, setItems] = useState<BulkItem[]>([])
  const [checking, setChecking] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [description, setDescription] = useState('')
  const [garment, setGarment] = useState('')
  const [garmentOther, setGarmentOther] = useState('')
  const [placement, setPlacement] = useState<'' | Placement>('')
  const [dueOn, setDueOn] = useState('')
  const [avoidNotes, setAvoidNotes] = useState('')
  const [tier, setTier] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [running, setRunning] = useState<{ n: number; of: number } | null>(null)

  const client = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId])
  const garmentOptions = useMemo(() => garmentOptionsFor(client), [client])
  const today = useMemo(() => todayIso(), [])
  const busy = running !== null
  const pending = items.filter((i) => i.status === 'ready' || i.status === 'failed')
  const doneCount = items.filter((i) => i.status === 'done').length
  const failedCount = items.filter((i) => i.status === 'failed').length

  // Release every preview URL when the dialog unmounts.
  const itemsRef = useRef<BulkItem[]>([])
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.image.previewUrl)), [])

  const clearErrors = (patch: Partial<FormErrors>) => setErrors((p) => ({ ...p, ...patch }))

  function selectClient(id: string) {
    setClientId(id)
    const options = garmentOptionsFor(clients.find((c) => c.id === id) ?? null)
    if (garment && garment !== OTHER_GARMENT && !options.includes(garment)) setGarment('')
    clearErrors({ client: undefined })
  }

  async function addFiles(files: File[]) {
    if (busy || checking) return
    const room = MAX_BULK_FILES - items.length
    const take = files.slice(0, Math.max(0, room))
    const rejected: string[] = []
    const accepted: BulkItem[] = []
    setChecking(true)
    try {
      for (const file of take) {
        const result = await inspectImageFile(file)
        if (result.ok) {
          accepted.push({ key: newCardId(), image: result.image, headline: '', status: 'ready', error: null, cardId: null })
        } else rejected.push(`${file.name}: ${result.error}`)
      }
    } finally {
      setChecking(false)
    }
    if (accepted.length) {
      setItems((prev) => [...prev, ...accepted])
      clearErrors({ files: undefined })
    }
    if (rejected.length) toast.error(rejected.length === 1 ? rejected[0] : `${rejected.length} files were skipped. First: ${rejected[0]}`)
    if (files.length > take.length) toast.error(`A batch takes at most ${MAX_BULK_FILES} images — ${files.length - take.length} were left out.`)
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) void addFiles(files)
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length) void addFiles(files)
  }

  function removeItem(key: string) {
    setItems((prev) => {
      const hit = prev.find((i) => i.key === key)
      if (hit) URL.revokeObjectURL(hit.image.previewUrl)
      return prev.filter((i) => i.key !== key)
    })
  }

  const patchItem = (key: string, patch: Partial<BulkItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)))

  function validate(): { next: FormErrors; firstId: string | null } {
    const next: FormErrors = {}
    let first: string | null = null
    if (!clientId) {
      next.client = 'Pick the client these cards belong to.'
      first ??= `${ids}-client`
    }
    if (pending.length === 0) {
      next.files = items.length ? 'Every image already has a card.' : 'Drop at least one image — each one becomes a card.'
      first ??= `${ids}-files`
    }
    if (!description.trim()) {
      next.description = 'Describe the designs — the prompt is built from this plus what the vision step reads in each image.'
      first ??= `${ids}-description`
    } else if (description.length > DESCRIPTION_MAX_CHARS) {
      next.description = `Shorten the description to ${DESCRIPTION_MAX_CHARS} characters.`
      first ??= `${ids}-description`
    }
    if (!garment) {
      next.garment = 'Choose the garment colour the designs sit on.'
      first ??= `${ids}-garment`
    } else if (garment === OTHER_GARMENT && !garmentOther.trim()) {
      next.garmentOther = 'Type the garment colour.'
      first ??= `${ids}-garment-other`
    }
    if (!placement) {
      next.placement = 'Choose the product and placement.'
      first ??= `${ids}-placement`
    }
    if (dueOn) {
      if (!ISO_DATE.test(dueOn)) {
        next.dueOn = 'Enter the deadline as a date.'
        first ??= `${ids}-due`
      } else if (dueOn < today) {
        next.dueOn = 'The deadline is in the past. Pick today or later.'
        first ??= `${ids}-due`
      }
    }
    return { next, firstId: first }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || checking) return
    const { next, firstId } = validate()
    setErrors(next)
    if (firstId) {
      document.getElementById(firstId)?.focus()
      toast.error('Check the highlighted fields and try again.')
      return
    }

    const queue = pending
    const garmentColor = garment === OTHER_GARMENT ? garmentOther.trim() : garment
    let created = 0
    let failed = 0
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]
      setRunning({ n: i + 1, of: queue.length })
      // A fresh id per attempt: storage forbids overwrites, so a retry never collides with itself.
      const cardId = newCardId()
      let path: string | null = null
      try {
        patchItem(item.key, { status: 'uploading', error: null })
        path = await uploadDesignerReference({ clientId, cardId, slot: 1, file: item.image.file, ext: item.image.ext })
        patchItem(item.key, { status: 'creating' })
        const headline = item.headline.trim()
        const card = await createCardAsDesigner({
          cardId,
          clientId,
          brief: description.trim(),
          printText: headline ? [{ role: 'headline', text: headline }] : [],
          referencePaths: [path],
          garmentColor,
          placement,
          dueOn: dueOn || null,
          avoidNotes: avoidNotes.trim() || null,
          similarityTier: tier ? Number(tier) : null,
        })
        patchItem(item.key, { status: 'done', cardId: card.id })
        created++
      } catch (err) {
        if (path) void removeUploadedReferences([path])
        patchItem(item.key, { status: 'failed', error: errorMessage(err, 'The card could not be created') })
        failed++
      }
    }
    setRunning(null)

    if (failed === 0) {
      toast.success(
        `${created} card${created === 1 ? '' : 's'} created${client ? ` for ${client.name}` : ''}. The vision step is reading each reference — they land in Review shortly.`,
      )
      onClose()
    } else {
      toast.error(`${created} created, ${failed} failed. The failed rows show why — fix and press Retry.`)
    }
  }

  const close = () => {
    if (!busy) onClose()
  }

  const submitLabel = running
    ? `Creating card ${running.n} of ${running.of}…`
    : failedCount > 0 && doneCount > 0
      ? `Retry ${failedCount} failed`
      : `Create ${pending.length || ''} card${pending.length === 1 ? '' : 's'}`.replace('  ', ' ')

  const counterTone =
    description.length >= DESCRIPTION_MAX_CHARS
      ? 'text-red-600 dark:text-red-400'
      : description.length >= DESCRIPTION_MAX_CHARS - 40
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-neutral-500'

  const clientPreselected = Boolean(scopedClientId)
  const clientUnknown = Boolean(clientId) && !client

  return (
    <Dialog
      open
      size="xl"
      title="New cards from images"
      description="Drop a batch of reference images. Each one becomes its own card with these shared brief fields; edit the details per card in Review."
      onClose={close}
      footer={
        <>
          {items.length > 0 && (
            <span className="mr-auto text-xs text-neutral-500" aria-live="polite">
              {items.length} image{items.length === 1 ? '' : 's'}
              {doneCount ? ` · ${doneCount} created` : ''}
              {failedCount ? ` · ${failedCount} failed` : ''}
            </span>
          )}
          <button type="button" onClick={close} disabled={busy} className={btnSecondary}>
            {doneCount > 0 && pending.length === 0 ? 'Close' : 'Cancel'}
          </button>
          <button type="submit" form={formId} disabled={busy || checking || pending.length === 0} className={btnPrimary}>
            {busy ? <Spinner /> : <Images className="h-4 w-4" />}
            {submitLabel}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-5" aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0 space-y-5">
          <div>
            <label htmlFor={`${ids}-client`} className={labelCls}>
              Client
            </label>
            <select
              id={`${ids}-client`}
              value={clientId}
              onChange={(e) => selectClient(e.target.value)}
              data-autofocus={clientPreselected ? undefined : true}
              aria-invalid={errors.client ? true : undefined}
              aria-describedby={errors.client ? `${ids}-client-error` : undefined}
              className={invalid(selectCls, Boolean(errors.client))}
            >
              <option value="">{clientsLoading && !clients.length ? 'Loading clients…' : 'Choose a client'}</option>
              {clientUnknown && <option value={clientId}>{clientsLoading ? 'Loading…' : 'Selected client (inactive)'}</option>}
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.client && (
              <p id={`${ids}-client-error`} role="alert" className={errorCls}>
                {errors.client}
              </p>
            )}
          </div>

          <div>
            <p className={labelCls} id={`${ids}-files-label`}>
              Images <span className="font-normal text-neutral-500">· one card each</span>
            </p>
            <input
              ref={inputRef}
              id={`${ids}-files`}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              className="sr-only"
              onChange={onInput}
              data-autofocus={clientPreselected ? '' : undefined}
              aria-labelledby={`${ids}-files-label`}
              aria-invalid={errors.files ? true : undefined}
            />
            <label
              htmlFor={`${ids}-files`}
              onDrop={onDrop}
              onDragOver={(e) => {
                if (busy) return
                e.preventDefault()
                if (!dragging) setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              className={`flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center ring-accent-500/25 transition focus-within:ring-4 ${
                dragging
                  ? 'border-accent-500 bg-accent-50 dark:bg-accent-950/40'
                  : errors.files
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-neutral-300 hover:border-accent-400 dark:border-neutral-700 dark:hover:border-accent-500'
              } ${busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              {checking ? (
                <Loader2 className="h-5 w-5 animate-spin text-neutral-400" aria-hidden />
              ) : (
                <Images className="h-5 w-5 text-accent-600 dark:text-accent-300" aria-hidden />
              )}
              <span className="text-sm font-medium">{checking ? 'Checking the images…' : 'Drop images here or click to choose'}</span>
              <span className="text-xs text-neutral-500">
                PNG, JPG or WebP, up to 15 MB each, at most {MAX_BULK_FILES} per batch.
              </span>
            </label>
            {errors.files && (
              <p role="alert" className={errorCls}>
                {errors.files}
              </p>
            )}

            {items.length > 0 && (
              <ul className="mt-3 divide-y divide-neutral-200 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {items.map((item, i) => (
                  <li key={item.key} className="flex items-center gap-3 px-3 py-2">
                    <img
                      src={item.image.previewUrl}
                      alt=""
                      className={`h-12 w-12 shrink-0 rounded-lg object-cover ${checkerboard}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={item.image.file.name}>
                        {i + 1}. {item.image.file.name}
                      </p>
                      <p className="truncate text-xs text-neutral-500">
                        {item.image.width} × {item.image.height} px · {formatBytes(item.image.file.size)}
                        {item.image.warning ? ` · ${item.image.warning}` : ''}
                      </p>
                      {item.error && (
                        <p className="mt-0.5 flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          {item.error}
                        </p>
                      )}
                    </div>
                    <input
                      aria-label={`Headline for image ${i + 1}`}
                      value={item.headline}
                      onChange={(e) => patchItem(item.key, { headline: e.target.value })}
                      disabled={item.status === 'done' || busy}
                      placeholder="Headline (optional)"
                      className={`${inlineSelectCls} hidden w-44 shrink-0 sm:block`}
                    />
                    <StatusPill status={item.status} />
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      disabled={busy || item.status === 'done'}
                      aria-label={`Remove image ${i + 1}`}
                      title="Remove"
                      className={`${btnGhost} shrink-0`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label htmlFor={`${ids}-description`} className={labelCls}>
              Description <span className="font-normal text-neutral-500">· shared by every card</span>
            </label>
            <textarea
              id={`${ids}-description`}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value.slice(0, DESCRIPTION_MAX_CHARS))
                if (errors.description) clearErrors({ description: undefined })
              }}
              rows={3}
              maxLength={DESCRIPTION_MAX_CHARS}
              placeholder="What this batch is. Example: reinterpret each reference as a vintage badge in the client's palette, keep the subject, no gradients."
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={errors.description ? `${ids}-description-error` : undefined}
              className={invalid(textareaCls, Boolean(errors.description))}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              {errors.description ? (
                <p id={`${ids}-description-error`} role="alert" className={`${errorCls} mt-0`}>
                  {errors.description}
                </p>
              ) : (
                <p className={`${hintCls} mt-0`}>The vision step reads each image into its own brief on top of this.</p>
              )}
              <span className={`shrink-0 text-xs tabular-nums ${counterTone}`} aria-live="polite">
                {description.length} / {DESCRIPTION_MAX_CHARS}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${ids}-garment`} className={labelCls}>
                Garment colour
              </label>
              <select
                id={`${ids}-garment`}
                value={garment}
                onChange={(e) => {
                  setGarment(e.target.value)
                  if (errors.garment || errors.garmentOther) clearErrors({ garment: undefined, garmentOther: undefined })
                }}
                aria-invalid={errors.garment ? true : undefined}
                aria-describedby={errors.garment ? `${ids}-garment-error` : undefined}
                className={invalid(selectCls, Boolean(errors.garment))}
              >
                <option value="">Choose a colour</option>
                {garmentOptions.map((c) => (
                  <option key={c} value={c}>
                    {capitalise(c)}
                  </option>
                ))}
                <option value={OTHER_GARMENT}>Other…</option>
              </select>
              {errors.garment && (
                <p id={`${ids}-garment-error`} role="alert" className={errorCls}>
                  {errors.garment}
                </p>
              )}
              {garment === OTHER_GARMENT && (
                <div className="mt-2">
                  <label htmlFor={`${ids}-garment-other`} className="sr-only">
                    Other garment colour
                  </label>
                  <input
                    id={`${ids}-garment-other`}
                    type="text"
                    value={garmentOther}
                    onChange={(e) => {
                      setGarmentOther(e.target.value)
                      if (errors.garmentOther) clearErrors({ garmentOther: undefined })
                    }}
                    maxLength={40}
                    autoFocus
                    placeholder="Which colour? e.g. forest green"
                    aria-invalid={errors.garmentOther ? true : undefined}
                    className={invalid(inputCls, Boolean(errors.garmentOther))}
                  />
                  {errors.garmentOther && (
                    <p role="alert" className={errorCls}>
                      {errors.garmentOther}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label htmlFor={`${ids}-placement`} className={labelCls}>
                Product and placement
              </label>
              <select
                id={`${ids}-placement`}
                value={placement}
                onChange={(e) => {
                  setPlacement(e.target.value as '' | Placement)
                  if (errors.placement) clearErrors({ placement: undefined })
                }}
                aria-invalid={errors.placement ? true : undefined}
                aria-describedby={errors.placement ? `${ids}-placement-error` : undefined}
                className={invalid(selectCls, Boolean(errors.placement))}
              >
                <option value="">Choose a product</option>
                {PLACEMENTS.map((p) => (
                  <option key={p} value={p}>
                    {PLACEMENT_LABEL[p]}
                  </option>
                ))}
              </select>
              {errors.placement ? (
                <p id={`${ids}-placement-error`} role="alert" className={errorCls}>
                  {errors.placement}
                </p>
              ) : (
                <p className={hintCls}>Drives the aspect ratio.</p>
              )}
            </div>

            <div>
              <label htmlFor={`${ids}-due`} className={labelCls}>
                Deadline <span className="font-normal text-neutral-500">· optional</span>
              </label>
              <input
                id={`${ids}-due`}
                type="date"
                value={dueOn}
                min={today}
                onChange={(e) => {
                  setDueOn(e.target.value)
                  if (errors.dueOn) clearErrors({ dueOn: undefined })
                }}
                aria-invalid={errors.dueOn ? true : undefined}
                className={invalid(inputCls, Boolean(errors.dueOn))}
              />
              {errors.dueOn && (
                <p role="alert" className={errorCls}>
                  {errors.dueOn}
                </p>
              )}
            </div>

            <div>
              <label htmlFor={`${ids}-tier`} className={labelCls}>
                Similarity to references
              </label>
              <select id={`${ids}-tier`} value={tier} onChange={(e) => setTier(e.target.value)} className={selectCls}>
                <option value="">Client default{client ? ` (${client.default_similarity_tier})` : ''}</option>
                {TIER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className={hintCls}>1 = style only · 5 = very close.</p>
            </div>
          </div>

          <div>
            <label htmlFor={`${ids}-avoid`} className={labelCls}>
              Avoid <span className="font-normal text-neutral-500">· optional</span>
            </label>
            <textarea
              id={`${ids}-avoid`}
              value={avoidNotes}
              onChange={(e) => setAvoidNotes(e.target.value)}
              rows={2}
              placeholder="e.g. do not copy the mascot; keep the badge shape only"
              className={textareaCls}
            />
          </div>
        </fieldset>
      </form>
    </Dialog>
  )
}

function StatusPill({ status }: { status: ItemStatus }) {
  const cls =
    status === 'done'
      ? 'bg-stage-delivered-soft text-stage-delivered-ink dark:bg-stage-delivered/25 dark:text-stage-delivered-light'
      : status === 'failed'
        ? 'bg-stage-failed-soft text-stage-failed-ink dark:bg-stage-failed/25 dark:text-stage-failed-light'
        : status === 'ready'
          ? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
          : 'bg-stage-generating-soft text-stage-generating-ink dark:bg-stage-generating/25 dark:text-stage-generating-light'
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {status === 'done' ? (
        <CheckCircle2 className="h-3 w-3" aria-hidden />
      ) : status === 'failed' ? (
        <XCircle className="h-3 w-3" aria-hidden />
      ) : status === 'ready' ? null : (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      )}
      {STATUS_LABEL[status]}
    </span>
  )
}
