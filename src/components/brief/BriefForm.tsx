import { useId, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Loader2, RefreshCw, Send } from 'lucide-react'
import { submitBrief, type BriefStart } from '../../lib/api'
import { PLACEMENTS, PLACEMENT_LABEL, errorMessage, type Placement } from '../../lib/types'
import { useToast } from '../../lib/useToast'
import {
  DEFAULT_GARMENT_COLORS,
  DESCRIPTION_MAX_CHARS,
  OTHER_GARMENT,
  REFERENCE_SLOT_COUNT,
  UPLOAD_WINDOW_MINUTES,
} from './constants'
import type { ReferenceImage } from './imageFile'
import { ImageSlot } from './ImageSlot'
import { GrantTimer } from './GrantTimer'
import { capitalise, ISO_DATE, splitPrintLines, todayIso } from './text'
import { ReferenceUploadError, uploadReference } from './uploadReference'
import { errorClass, fieldClass, hintClass, labelClass, primaryButton } from './ui'

interface Props {
  token: string
  grant: BriefStart
  expiresAt: number | null
  expired: boolean
  restarting: boolean
  /** Opens a fresh upload window (new card id). Values stay on screen. */
  onRestart: () => Promise<boolean>
  onMarkExpired: () => void
  onMarkInvalid: (message: string) => void
  onSubmitted: (cardId: string) => void
}

type Phase = { kind: 'idle' } | { kind: 'uploading'; slot: number } | { kind: 'submitting' }

interface FormErrors {
  slots: (string | null)[]
  description?: string
  garment?: string
  garmentOther?: string
  placement?: string
  dueOn?: string
}

interface UploadedRef {
  path: string
  file: File
}

const NO_ERRORS: FormErrors = { slots: Array.from({ length: REFERENCE_SLOT_COUNT }, () => null) }

function uploadKey(cardId: string, index: number) {
  return `${cardId}:${index}`
}

/** Turns the backend's raised messages into something a client can act on. */
function friendlySubmitError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('daily submission limit')) {
    return "This client has reached today's brief limit. Try again tomorrow, or contact Design Musketeer if it can't wait."
  }
  if (m.includes('must be uploaded before submitting') || m.includes('exactly 3 reference')) {
    return 'Not all three images reached our storage. Press Send brief again; if it keeps failing, start again with a fresh page.'
  }
  if (m.includes('description must be')) {
    return `The description must be between 1 and ${DESCRIPTION_MAX_CHARS} characters.`
  }
  if (m.includes('reference paths must belong') || m.includes('row-level security') || m.includes('unauthorized')) {
    return 'Storage refused the upload. Start again to open a fresh upload window.'
  }
  return msg
}

export function BriefForm({
  token,
  grant,
  expiresAt,
  expired,
  restarting,
  onRestart,
  onMarkExpired,
  onMarkInvalid,
  onSubmitted,
}: Props) {
  const toast = useToast()
  const ids = useId()

  const [slots, setSlots] = useState<(ReferenceImage | null)[]>(() =>
    Array.from({ length: REFERENCE_SLOT_COUNT }, () => null),
  )
  const [description, setDescription] = useState('')
  const [printText, setPrintText] = useState('')
  const [garment, setGarment] = useState('')
  const [garmentOther, setGarmentOther] = useState('')
  const [placement, setPlacement] = useState<'' | Placement>('')
  const [dueOn, setDueOn] = useState('')
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [submitError, setSubmitError] = useState<string | null>(null)
  /** References already stored under a card id; storage forbids overwrites, so these slots lock. */
  const [uploaded, setUploaded] = useState<Map<string, UploadedRef>>(() => new Map())

  const busy = phase.kind !== 'idle'
  const today = useMemo(() => todayIso(), [])

  const garmentOptions = useMemo(() => {
    const own = grant.garment_colors.map((c) => c.trim()).filter(Boolean)
    const list = own.length ? own : [...DEFAULT_GARMENT_COLORS]
    return Array.from(new Set(list))
  }, [grant.garment_colors])

  const printLines = useMemo(() => splitPrintLines(printText), [printText])

  const isUploaded = (index: number) => {
    const hit = uploaded.get(uploadKey(grant.card_id, index))
    return Boolean(hit && slots[index] && hit.file === slots[index]?.file)
  }
  const allUploaded = slots.every((s, i) => s !== null && isUploaded(i))
  // Once everything is stored, submit_brief still accepts the card for an hour: no need to restart.
  const showExpired = expired && !allUploaded

  function setSlot(index: number, image: ReferenceImage | null) {
    setSlots((prev) => prev.map((s, i) => (i === index ? image : s)))
    setErrors((prev) => ({ ...prev, slots: prev.slots.map((e, i) => (i === index ? null : e)) }))
  }

  function validate(): { errors: FormErrors; firstInvalidId: string | null } {
    const next: FormErrors = { slots: slots.map((s) => (s ? null : 'Add an image here.')) }
    let first: string | null = null
    next.slots.forEach((e, i) => {
      if (e && !first) first = `${ids}-slot-${i}`
    })

    if (!description.trim()) {
      next.description = 'Describe the design you want — this is what the designer works from.'
      first ??= `${ids}-description`
    } else if (description.length > DESCRIPTION_MAX_CHARS) {
      next.description = `Shorten the description to ${DESCRIPTION_MAX_CHARS} characters.`
      first ??= `${ids}-description`
    }

    if (!garment) {
      next.garment = 'Choose the garment colour the design will sit on.'
      first ??= `${ids}-garment`
    } else if (garment === OTHER_GARMENT && !garmentOther.trim()) {
      next.garmentOther = 'Type the garment colour.'
      first ??= `${ids}-garment-other`
    }

    if (!placement) {
      next.placement = 'Choose the product and where the design goes.'
      first ??= `${ids}-placement`
    }

    if (dueOn) {
      if (!ISO_DATE.test(dueOn)) {
        next.dueOn = 'Enter the deadline as a date.'
        first ??= `${ids}-due`
      } else if (dueOn < today) {
        next.dueOn = 'The deadline is in the past. Pick today or a later date.'
        first ??= `${ids}-due`
      }
    }

    return { errors: next, firstInvalidId: first }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || restarting) return

    const { errors: next, firstInvalidId } = validate()
    setErrors(next)
    if (firstInvalidId) {
      document.getElementById(firstInvalidId)?.focus()
      toast.error('Check the highlighted fields and try again.')
      return
    }
    if (showExpired) return

    setSubmitError(null)
    try {
      const paths: string[] = []
      for (let i = 0; i < REFERENCE_SLOT_COUNT; i++) {
        const image = slots[i]
        if (!image) throw new Error(`Reference ${i + 1} is missing.`)
        const key = uploadKey(grant.card_id, i)
        const stored = uploaded.get(key)
        if (stored) {
          if (stored.file !== image.file) {
            throw new ReferenceUploadError(
              `Reference ${i + 1} was already stored with a different image. Start again to swap it.`,
              'refused',
              i + 1,
            )
          }
          paths.push(stored.path)
          continue
        }
        setPhase({ kind: 'uploading', slot: i + 1 })
        const path = await uploadReference({
          clientId: grant.client_id,
          cardId: grant.card_id,
          slot: i + 1,
          file: image.file,
          ext: image.ext,
        })
        // Entries from earlier windows (other card ids) are dead once we upload under a new one.
        setUploaded((prev) =>
          new Map([...prev].filter(([k]) => k.startsWith(`${grant.card_id}:`))).set(key, { path, file: image.file }),
        )
        paths.push(path)
      }

      setPhase({ kind: 'submitting' })
      const cardId = await submitBrief({
        token,
        cardId: grant.card_id,
        brief: description.trim(),
        printText: printLines,
        referencePaths: paths,
        garmentColor: garment === OTHER_GARMENT ? garmentOther.trim() : garment,
        placement,
        dueOn: dueOn || null,
      })
      toast.success('Brief sent. Thank you!')
      onSubmitted(cardId)
    } catch (err) {
      const raw = errorMessage(err, 'Sending failed')
      const lower = raw.toLowerCase()
      if (err instanceof ReferenceUploadError && err.reason === 'refused') {
        onMarkExpired()
        toast.error(raw)
      } else if (lower.includes('upload session expired')) {
        onMarkExpired()
        toast.error('This page timed out before the brief was sent. Start again to open a fresh window.')
      } else if (lower.includes('invalid or expired form link')) {
        onMarkInvalid(raw)
      } else {
        const friendly = friendlySubmitError(raw)
        setSubmitError(friendly)
        toast.error(friendly)
      }
    } finally {
      setPhase({ kind: 'idle' })
    }
  }

  const submitLabel =
    phase.kind === 'uploading'
      ? `Uploading image ${phase.slot} of ${REFERENCE_SLOT_COUNT}…`
      : phase.kind === 'submitting'
        ? 'Sending brief…'
        : 'Send brief'

  const counterTone =
    description.length >= DESCRIPTION_MAX_CHARS
      ? 'text-red-600 dark:text-red-400'
      : description.length >= DESCRIPTION_MAX_CHARS - 40
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-neutral-500'

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      {showExpired && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950/40"
        >
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            This page timed out after {UPLOAD_WINDOW_MINUTES} minutes.
          </p>
          <p className="mt-1 text-neutral-600 dark:text-neutral-300">
            Everything you entered is still here. Start again to open a fresh upload window, then send.
          </p>
          <button
            type="button"
            onClick={() => void onRestart()}
            disabled={restarting}
            className={`${primaryButton} mt-3`}
          >
            {restarting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            Start again
          </button>
        </div>
      )}

      <fieldset disabled={busy || restarting} className="space-y-8">
        <section>
          <h2 className="text-base font-semibold">Reference images</h2>
          <p className={hintClass}>
            Three images that show the look you want: a design you like, your logo, a product photo — anything that
            helps. PNG, JPG or WebP, up to 15 MB each.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {slots.map((slot, i) => (
              <ImageSlot
                key={i}
                index={i}
                inputId={`${ids}-slot-${i}`}
                value={slot}
                onChange={(img) => setSlot(i, img)}
                locked={isUploaded(i)}
                disabled={busy || restarting}
                error={errors.slots[i]}
              />
            ))}
          </div>
        </section>

        <section>
          <label htmlFor={`${ids}-description`} className={labelClass}>
            Describe the design
          </label>
          <textarea
            id={`${ids}-description`}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value.slice(0, DESCRIPTION_MAX_CHARS))
              if (errors.description) setErrors((p) => ({ ...p, description: undefined }))
            }}
            rows={4}
            maxLength={DESCRIPTION_MAX_CHARS}
            placeholder="Subject, mood, colours, anything to avoid. Example: a vintage-style mountain badge in cream and rust, hand-drawn look, no gradients."
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? `${ids}-description-error` : `${ids}-description-hint`}
            className={`${fieldClass(Boolean(errors.description))} resize-y`}
          />
          <div className="mt-1 flex items-start justify-between gap-3">
            {errors.description ? (
              <p id={`${ids}-description-error`} role="alert" className={`${errorClass} mt-0`}>
                {errors.description}
              </p>
            ) : (
              <p id={`${ids}-description-hint`} className={`${hintClass} mt-0`}>
                What it shows, the feel, colours to use or avoid.
              </p>
            )}
            <span className={`shrink-0 text-xs tabular-nums ${counterTone}`} aria-live="polite">
              {description.length} / {DESCRIPTION_MAX_CHARS}
            </span>
          </div>
        </section>

        <section>
          <label htmlFor={`${ids}-print`} className={labelClass}>
            Text to print <span className="font-normal text-neutral-500">· optional</span>
          </label>
          <textarea
            id={`${ids}-print`}
            value={printText}
            onChange={(e) => setPrintText(e.target.value)}
            rows={3}
            placeholder={'BEST DAD EVER\nSince 1987'}
            spellCheck
            aria-describedby={`${ids}-print-hint`}
            className={`${fieldClass(false)} resize-y font-mono`}
          />
          <p id={`${ids}-print-hint`} className={hintClass}>
            One line per text element. We print exactly what you type — check spelling and capitals.
            {printLines.length > 0 && (
              <>
                {' '}
                <span className="text-neutral-700 dark:text-neutral-300">
                  {printLines.length} text element{printLines.length === 1 ? '' : 's'}.
                </span>
              </>
            )}
          </p>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-garment`} className={labelClass}>
              Garment colour
            </label>
            <select
              id={`${ids}-garment`}
              value={garment}
              onChange={(e) => {
                setGarment(e.target.value)
                if (errors.garment || errors.garmentOther) {
                  setErrors((p) => ({ ...p, garment: undefined, garmentOther: undefined }))
                }
              }}
              aria-invalid={errors.garment ? true : undefined}
              aria-describedby={errors.garment ? `${ids}-garment-error` : undefined}
              className={fieldClass(Boolean(errors.garment))}
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
              <p id={`${ids}-garment-error`} role="alert" className={errorClass}>
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
                    if (errors.garmentOther) setErrors((p) => ({ ...p, garmentOther: undefined }))
                  }}
                  maxLength={40}
                  autoFocus
                  placeholder="Which colour? e.g. forest green"
                  aria-invalid={errors.garmentOther ? true : undefined}
                  aria-describedby={errors.garmentOther ? `${ids}-garment-other-error` : undefined}
                  className={fieldClass(Boolean(errors.garmentOther))}
                />
                {errors.garmentOther && (
                  <p id={`${ids}-garment-other-error`} role="alert" className={errorClass}>
                    {errors.garmentOther}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label htmlFor={`${ids}-placement`} className={labelClass}>
              Product and placement
            </label>
            <select
              id={`${ids}-placement`}
              value={placement}
              onChange={(e) => {
                setPlacement(e.target.value as '' | Placement)
                if (errors.placement) setErrors((p) => ({ ...p, placement: undefined }))
              }}
              aria-invalid={errors.placement ? true : undefined}
              aria-describedby={errors.placement ? `${ids}-placement-error` : `${ids}-placement-hint`}
              className={fieldClass(Boolean(errors.placement))}
            >
              <option value="">Choose a product</option>
              {PLACEMENTS.map((p) => (
                <option key={p} value={p}>
                  {PLACEMENT_LABEL[p]}
                </option>
              ))}
            </select>
            {errors.placement ? (
              <p id={`${ids}-placement-error`} role="alert" className={errorClass}>
                {errors.placement}
              </p>
            ) : (
              <p id={`${ids}-placement-hint`} className={hintClass}>
                Sets the shape of the design.
              </p>
            )}
          </div>
        </section>

        <section className="sm:max-w-xs">
          <label htmlFor={`${ids}-due`} className={labelClass}>
            Deadline <span className="font-normal text-neutral-500">· optional</span>
          </label>
          <input
            id={`${ids}-due`}
            type="date"
            value={dueOn}
            min={today}
            onChange={(e) => {
              setDueOn(e.target.value)
              if (errors.dueOn) setErrors((p) => ({ ...p, dueOn: undefined }))
            }}
            aria-invalid={errors.dueOn ? true : undefined}
            aria-describedby={errors.dueOn ? `${ids}-due-error` : `${ids}-due-hint`}
            className={fieldClass(Boolean(errors.dueOn))}
          />
          {errors.dueOn ? (
            <p id={`${ids}-due-error`} role="alert" className={errorClass}>
              {errors.dueOn}
            </p>
          ) : (
            <p id={`${ids}-due-hint`} className={hintClass}>
              Leave empty if there is no fixed date.
            </p>
          )}
        </section>
      </fieldset>

      {submitError && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          {submitError}
        </div>
      )}

      <div className="space-y-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <button
          type="submit"
          disabled={busy || restarting || showExpired}
          className={`${primaryButton} w-full sm:w-auto`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          {submitLabel}
        </button>
        {!showExpired && <GrantTimer expiresAt={expiresAt} />}
      </div>
    </form>
  )
}
