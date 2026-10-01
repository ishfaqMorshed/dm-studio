import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AlertTriangle, ImagePlus, Loader2, Lock, RefreshCw, X } from 'lucide-react'
import type { ReferenceRole } from '../../lib/types'
import { ACCEPT_ATTR } from './constants'
import { formatBytes, inspectImageFile, type ReferenceImage } from './imageFile'
import { ROLE_COPY, slotTitle } from './referenceRoles'
import { iconButton } from './ui'

interface Props {
  /** 0-based. */
  index: number
  /** The one job this slot's image is read for (settings.reference_roles order). */
  role: ReferenceRole
  /** Id for the hidden file input, so the form can focus the slot on validation. */
  inputId: string
  value: ReferenceImage | null
  onChange: (image: ReferenceImage | null) => void
  /** Already stored under the current card: storage does not allow overwrites, so no swapping. */
  locked: boolean
  disabled: boolean
  /** Form-level error ("add an image here"). */
  error: string | null
}

/**
 * One of the three reference slots, titled with its job ("1 · What to make") and a one-line hint of
 * what is read from it. Empty: a tap/drop target that opens the native picker (the camera roll on
 * phones). Filled: thumbnail, pixel size, file size and Replace / Remove.
 * Validation happens here on pick; the parent only ever receives a decoded, accepted image.
 */
export function ImageSlot({ index, role, inputId, value, onChange, locked, disabled, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)
  const n = index + 1
  const messageId = `${inputId}-message`
  const title = slotTitle(n, role)
  const { label, hint } = ROLE_COPY[role]

  // Release the object URL when the image changes or the slot unmounts.
  const previewUrl = value?.previewUrl
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function pick(file: File | undefined) {
    if (!file || disabled || locked) return
    setPickError(null)
    setBusy(true)
    const result = await inspectImageFile(file)
    setBusy(false)
    if (result.ok) onChange(result.image)
    else setPickError(result.error)
  }

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so picking the same file again after a Remove still fires onChange.
    e.target.value = ''
    void pick(file)
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault()
    setDragging(false)
    void pick(e.dataTransfer.files?.[0])
  }

  function onDragOver(e: DragEvent<HTMLElement>) {
    if (disabled || locked) return
    e.preventDefault()
    if (!dragging) setDragging(true)
  }

  const message = pickError ?? error
  const border = message ? 'border-red-400 dark:border-red-500' : 'border-neutral-200 dark:border-neutral-800'

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        disabled={disabled || locked}
        onChange={onInput}
        aria-label={value ? `Replace reference ${n} (${label})` : `Choose reference ${n} (${label})`}
        aria-invalid={message ? true : undefined}
        aria-describedby={message ? messageId : `${inputId}-hint`}
      />

      <p className="text-sm font-medium">{title}</p>

      {value ? (
        <div
          className={`relative flex overflow-hidden rounded-xl border bg-neutral-100 dark:bg-neutral-950 sm:block ${border}`}
        >
          <img
            src={value.previewUrl}
            alt={`${title}: ${value.file.name}`}
            className="h-28 w-28 shrink-0 object-cover sm:aspect-square sm:h-auto sm:w-full"
          />
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {n}
          </span>
          {locked && (
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[11px] font-medium text-white">
              <Lock className="h-3 w-3" /> Uploaded
            </span>
          )}
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 bg-white px-2.5 py-2 text-xs dark:bg-neutral-900 sm:border-t sm:border-neutral-200 sm:dark:border-neutral-800">
            <div className="min-w-0">
              <p className="truncate font-medium" title={value.file.name}>
                {value.file.name}
              </p>
              <p className="text-neutral-500">
                {value.width} × {value.height} px · {formatBytes(value.file.size)}
              </p>
            </div>
            {!locked && (
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={disabled}
                  aria-label={`Replace reference ${n} (${label})`}
                  title="Replace"
                  className={iconButton}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPickError(null)
                    onChange(null)
                  }}
                  disabled={disabled}
                  aria-label={`Remove reference ${n} (${label})`}
                  title="Remove"
                  className={iconButton}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          className={`flex min-h-[7rem] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-4 text-center ring-neutral-900/10 transition focus-within:ring-4 dark:ring-white/10 sm:aspect-square sm:min-h-0 ${
            dragging
              ? 'border-neutral-900 bg-neutral-100 dark:border-white dark:bg-neutral-800'
              : message
                ? 'border-red-400 dark:border-red-500'
                : 'border-neutral-300 hover:border-neutral-500 dark:border-neutral-700 dark:hover:border-neutral-500'
          } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin text-neutral-400" aria-hidden />
          ) : (
            <ImagePlus className="h-6 w-6 text-neutral-400" aria-hidden />
          )}
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-neutral-500">
            {busy ? 'Checking the image…' : 'Tap to choose a photo, or drop one here'}
          </span>
        </label>
      )}

      <p id={`${inputId}-hint`} className="text-xs text-neutral-500">
        {hint}
      </p>

      {value?.warning && !message && (
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{value.warning}</span>
        </p>
      )}
      {message && (
        <p id={messageId} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {message}
        </p>
      )}
      {locked && !message && (
        <p className="text-xs text-neutral-500">Stored. Start again below if you need to swap it.</p>
      )}
    </div>
  )
}
