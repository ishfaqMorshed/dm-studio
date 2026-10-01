import { useId, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Plus, Trash2 } from 'lucide-react'
import { createCardAsDesigner } from '../../lib/api'
import {
  errorMessage,
  PLACEMENTS,
  PLACEMENT_LABEL,
  PRINT_TEXT_ROLES,
  type Placement,
  type PrintTextLine,
  type PrintTextRole,
  type ReferenceRole,
} from '../../lib/types'
import { useClientScope } from '../../lib/useClientScope'
import { useSettings } from '../../lib/useSettings'
import { useToast } from '../../lib/useToast'
import { DESCRIPTION_MAX_CHARS, OTHER_GARMENT } from '../brief/constants'
import { inspectImageFile, type ReferenceImage } from '../brief/imageFile'
import { rolesSentence, slotRole, slotRoles } from '../brief/referenceRoles'
import { capitalise, ISO_DATE, todayIso } from '../brief/text'
import { btnGhost, btnPrimary, btnSecondary, btnSmall, inlineSelectCls, inputCls, selectCls, textareaCls } from '../card/styles'
import { Dialog, Spinner } from '../card/ui'
import {
  garmentOptionsFor,
  NEW_CARD_SLOTS,
  newCardId,
  removeUploadedReferences,
  TIER_OPTIONS,
  uploadDesignerReference,
} from './newCard'
import { ReferenceSlot } from './ReferenceSlots'

const ROLE_LABEL: Record<PrintTextRole, string> = { headline: 'Headline', sub: 'Sub', tagline: 'Tagline' }

interface Props {
  /** The header's scope: preselects the client. Null shows a client dropdown. */
  clientId: string | null
  onClose: () => void
}

type Phase = { kind: 'idle' } | { kind: 'uploading'; n: number; of: number } | { kind: 'creating' }

interface FormErrors {
  client?: string
  /** Per-slot message (a rejected file, or "add an image here"). */
  slots: (string | null)[]
  references?: string
  description?: string
  garment?: string
  garmentOther?: string
  placement?: string
  dueOn?: string
}

const NO_ERRORS: FormErrors = { slots: Array.from({ length: NEW_CARD_SLOTS }, () => null) }

const labelCls = 'mb-1 block text-sm font-medium'
const hintCls = 'mt-1 text-xs text-neutral-500'
const errorCls = 'mt-1 text-xs text-red-600 dark:text-red-400'

function invalid(base: string, isInvalid: boolean): string {
  return isInvalid ? `${base} border-red-400 dark:border-red-500` : base
}

/**
 * Designer-side card creation from the board. Same fields as the client brief form, but
 * 1–3 references (each slot has one job, from settings.reference_roles; an empty slot leaves that
 * job to the Style Card), role-tagged text lines, avoid notes and a similarity tier. The references
 * upload to refs/<client_id>/<card_id>/<n>.<ext> with the staff session, then
 * `create_card_as_designer` inserts the card in Intake with the roles of the filled slots; WF-1's
 * vision step moves it to Review. Mount only while open (state and preview URLs reset on every open).
 */
export function NewCardDialog({ clientId: scopedClientId, onClose }: Props) {
  const toast = useToast()
  const navigate = useNavigate()
  const ids = useId()
  const formId = `${ids}-form`
  const { clients, loading: clientsLoading } = useClientScope()
  const { settings } = useSettings()
  const roles = useMemo(() => slotRoles(settings), [settings])

  const [clientId, setClientId] = useState(scopedClientId ?? '')
  const [slots, setSlots] = useState<(ReferenceImage | null)[]>(() => Array.from({ length: NEW_CARD_SLOTS }, () => null))
  const [checkingSlot, setCheckingSlot] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<PrintTextLine[]>([{ role: 'headline', text: '' }])
  const [garment, setGarment] = useState('')
  const [garmentOther, setGarmentOther] = useState('')
  const [placement, setPlacement] = useState<'' | Placement>('')
  const [dueOn, setDueOn] = useState('')
  const [avoidNotes, setAvoidNotes] = useState('')
  /** '' = the client's default tier; the RPC applies it. */
  const [tier, setTier] = useState('')
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [submitError, setSubmitError] = useState<string | null>(null)

  const client = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId])
  const garmentOptions = useMemo(() => garmentOptionsFor(client), [client])
  const today = useMemo(() => todayIso(), [])
  const busy = phase.kind !== 'idle'
  const filled = slots.filter((s): s is ReferenceImage => s !== null)

  const clearErrors = (patch: Partial<FormErrors>) => setErrors((p) => ({ ...p, ...patch }))

  function selectClient(id: string) {
    setClientId(id)
    // A colour from the previous client's list may not exist for this one.
    const options = garmentOptionsFor(clients.find((c) => c.id === id) ?? null)
    if (garment && garment !== OTHER_GARMENT && !options.includes(garment)) setGarment('')
    clearErrors({ client: undefined })
  }

  /** Files picked or dropped on slot `start`; extra files spill into the other empty slots. */
  async function pickFiles(start: number, files: File[]) {
    if (busy || checkingSlot !== null) return
    const targets = [start, ...slots.map((s, i) => (i !== start && s === null ? i : -1)).filter((i) => i >= 0)]
    const accepted: Array<{ index: number; image: ReferenceImage }> = []
    const rejected: string[] = []
    let skipped = 0

    setCheckingSlot(start)
    try {
      for (const file of files) {
        const index = targets[accepted.length]
        if (index === undefined) {
          skipped++
          continue
        }
        const result = await inspectImageFile(file)
        if (result.ok) accepted.push({ index, image: result.image })
        else rejected.push(result.error)
      }
    } finally {
      setCheckingSlot(null)
    }

    if (accepted.length) {
      setSlots((prev) => {
        const next = prev.slice()
        for (const a of accepted) next[a.index] = a.image
        return next
      })
    }
    const startFilled = accepted.some((a) => a.index === start)
    setErrors((p) => ({
      ...p,
      references: accepted.length ? undefined : p.references,
      slots: p.slots.map((e, i) => {
        if (accepted.some((a) => a.index === i)) return null
        if (i === start && rejected.length && !startFilled) return rejected[0]
        return e
      }),
    }))
    if (rejected.length && startFilled) toast.error(rejected[0])
    if (skipped) {
      toast.error(`A card takes at most ${NEW_CARD_SLOTS} references — ${skipped} file${skipped === 1 ? ' was' : 's were'} skipped.`)
    }
  }

  function removeSlot(index: number) {
    setSlots((prev) => prev.map((s, i) => (i === index ? null : s)))
    setErrors((p) => ({ ...p, slots: p.slots.map((e, i) => (i === index ? null : e)) }))
  }

  const setLine = (i: number, patch: Partial<PrintTextLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  function validate(): { next: FormErrors; firstId: string | null } {
    const next: FormErrors = { slots: slots.map(() => null) }
    let first: string | null = null

    if (!clientId) {
      next.client = 'Pick the client this card belongs to.'
      first ??= `${ids}-client`
    }
    if (filled.length === 0) {
      next.references = 'Add at least one reference — the vision step reads it into the brief.'
      next.slots[0] = 'Add an image here.'
      first ??= `${ids}-slot-0`
    }
    if (!description.trim()) {
      next.description = 'Describe the design — the prompt is built from this.'
      first ??= `${ids}-description`
    } else if (description.length > DESCRIPTION_MAX_CHARS) {
      next.description = `Shorten the description to ${DESCRIPTION_MAX_CHARS} characters.`
      first ??= `${ids}-description`
    }
    if (!garment) {
      next.garment = 'Choose the garment colour the design sits on.'
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
    if (busy || checkingSlot !== null) return

    const { next, firstId } = validate()
    setErrors(next)
    if (firstId) {
      document.getElementById(firstId)?.focus()
      toast.error('Check the highlighted fields and try again.')
      return
    }

    setSubmitError(null)
    // A fresh id per attempt: storage forbids overwrites, so a retry never collides with itself.
    const cardId = newCardId()
    const paths: string[] = []
    try {
      for (let i = 0; i < filled.length; i++) {
        setPhase({ kind: 'uploading', n: i + 1, of: filled.length })
        paths.push(
          await uploadDesignerReference({ clientId, cardId, slot: i + 1, file: filled[i].file, ext: filled[i].ext }),
        )
      }
      setPhase({ kind: 'creating' })
      // The uploads are compacted to slots 1..k; the roles follow the slots that were actually filled.
      const referenceRoles = slots
        .map((s, i) => (s ? slotRole(roles, i) : null))
        .filter((r): r is ReferenceRole => r !== null)
      const card = await createCardAsDesigner({
        cardId,
        clientId,
        brief: description.trim(),
        printText: lines.map((l) => ({ role: l.role, text: l.text.trim() })).filter((l) => l.text),
        referencePaths: paths,
        referenceRoles,
        garmentColor: garment === OTHER_GARMENT ? garmentOther.trim() : garment,
        placement,
        dueOn: dueOn || null,
        avoidNotes: avoidNotes.trim() || null,
        similarityTier: tier ? Number(tier) : null,
      })
      toast.success(
        `Card created${client ? ` for ${client.name}` : ''}. The vision step is reading the references — it lands in Review shortly.`,
      )
      onClose()
      navigate(`/card/${card.id}`)
    } catch (err) {
      // The card row never landed: do not leave its references behind.
      if (paths.length) void removeUploadedReferences(paths)
      const msg = errorMessage(err, 'The card could not be created')
      setSubmitError(msg)
      toast.error(msg)
      setPhase({ kind: 'idle' })
    }
  }

  const close = () => {
    if (!busy) onClose()
  }

  const submitLabel =
    phase.kind === 'uploading'
      ? `Uploading reference ${phase.n} of ${phase.of}…`
      : phase.kind === 'creating'
        ? 'Creating card…'
        : 'Create card'

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
      size="lg"
      title="New card"
      description="Creates a card the way the client form does, so it runs through the same pipeline."
      onClose={close}
      footer={
        <>
          <button type="button" onClick={close} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={busy || checkingSlot !== null} className={btnPrimary}>
            {busy ? <Spinner /> : <Plus className="h-4 w-4" />}
            {submitLabel}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-5" aria-busy={busy}>
        <fieldset disabled={busy} className="space-y-5">
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
              aria-describedby={errors.client ? `${ids}-client-error` : `${ids}-client-hint`}
              className={invalid(selectCls, Boolean(errors.client))}
            >
              <option value="">{clientsLoading && !clients.length ? 'Loading clients…' : 'Choose a client'}</option>
              {clientUnknown && (
                <option value={clientId}>{clientsLoading ? 'Loading…' : 'Selected client (inactive)'}</option>
              )}
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.client ? (
              <p id={`${ids}-client-error`} role="alert" className={errorCls}>
                {errors.client}
              </p>
            ) : (
              <p id={`${ids}-client-hint`} className={hintCls}>
                {clientPreselected
                  ? 'Taken from the header. Change it here for a one-off.'
                  : !clientsLoading && clients.length === 0
                    ? 'No active clients yet — add one under Clients first.'
                    : 'The card uses this client’s locked Style Card when it generates.'}
              </p>
            )}
          </div>

          <div>
            <p className={labelCls} id={`${ids}-refs-label`}>
              Reference images
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="group" aria-labelledby={`${ids}-refs-label`}>
              {slots.map((slot, i) => (
                <ReferenceSlot
                  key={i}
                  index={i}
                  role={slotRole(roles, i)}
                  inputId={`${ids}-slot-${i}`}
                  value={slot}
                  checking={checkingSlot === i}
                  disabled={busy}
                  error={errors.slots[i]}
                  onPick={(index, files) => void pickFiles(index, files)}
                  onRemove={removeSlot}
                  autoFocus={clientPreselected && i === 0}
                />
              ))}
            </div>
            {errors.references ? (
              <p role="alert" className={errorCls}>
                {errors.references}
              </p>
            ) : (
              <p className={hintCls}>
                One to three, one job each: {rolesSentence(roles)}. An empty slot leaves that job to the client’s
                Style Card. PNG, JPG or WebP, up to 15 MB each.
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${ids}-description`} className={labelCls}>
              Description
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
              placeholder="Subject, mood, colours, anything to avoid. Example: a vintage mountain badge in cream and rust, hand-drawn look, no gradients."
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
                <p className={`${hintCls} mt-0`}>What it shows, the feel, colours to use or avoid.</p>
              )}
              <span className={`shrink-0 text-xs tabular-nums ${counterTone}`} aria-live="polite">
                {description.length} / {DESCRIPTION_MAX_CHARS}
              </span>
            </div>
          </div>

          <div>
            <p className={labelCls} id={`${ids}-text-label`}>
              Text to print <span className="font-normal text-neutral-500">· optional</span>
            </p>
            <div className="space-y-2" role="group" aria-labelledby={`${ids}-text-label`}>
              {lines.map((line, i) => (
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
                    spellCheck
                  />
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove line ${i + 1}`}
                    title="Remove line"
                    className={`${btnGhost} shrink-0`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, { role: prev.length ? 'sub' : 'headline', text: '' }])}
                className={`${btnSecondary} ${btnSmall}`}
              >
                <Plus className="h-3.5 w-3.5" />
                Add line
              </button>
            </div>
            <p className={hintCls}>Each line prints once, spelled exactly as typed. Empty lines are dropped.</p>
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
                    aria-describedby={errors.garmentOther ? `${ids}-garment-other-error` : undefined}
                    className={invalid(inputCls, Boolean(errors.garmentOther))}
                  />
                  {errors.garmentOther && (
                    <p id={`${ids}-garment-other-error`} role="alert" className={errorCls}>
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
                aria-describedby={errors.placement ? `${ids}-placement-error` : `${ids}-placement-hint`}
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
                <p id={`${ids}-placement-hint`} className={hintCls}>
                  Drives the aspect ratio.
                </p>
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
                aria-describedby={errors.dueOn ? `${ids}-due-error` : undefined}
                className={invalid(inputCls, Boolean(errors.dueOn))}
              />
              {errors.dueOn && (
                <p id={`${ids}-due-error`} role="alert" className={errorCls}>
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
              <p className={hintCls}>1 = style only · 5 = very close. Labels the references for the model.</p>
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
              placeholder="e.g. do not reuse the wolf; keep the badge shape only"
              className={textareaCls}
            />
            <p className={hintCls}>Anything in the references that must not be copied.</p>
          </div>
        </fieldset>

        {submitError && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          >
            {submitError}
          </div>
        )}

        <p className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            The card starts in Intake. The vision step reads the references into the brief, then it lands in Review for
            you to check and approve.
          </span>
        </p>
      </form>
    </Dialog>
  )
}
