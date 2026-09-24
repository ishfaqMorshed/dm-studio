import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AlertTriangle, ImagePlus, Loader2, RefreshCw, X } from 'lucide-react'
import { ACCEPT_ATTR } from '../brief/constants'
import { formatBytes, type ReferenceImage } from '../brief/imageFile'
import { btnGhost } from '../card/styles'

interface Props {
  /** 0-based. */
  index: number
  /** Id of the hidden file input, so the form can focus the slot on validation. */
  inputId: string
  value: ReferenceImage | null
  /** True while the dialog is decoding files dropped on this slot. */
  checking: boolean
  disabled: boolean
  /** Slot-level message (a rejected file, or "add an image"). */
  error: string | null
  /** Files picked or dropped here. More than one fills the following empty slots. */
  onPick: (index: number, files: File[]) => void
  onRemove: (index: number) => void
  /** The dialog focuses this slot's input when it opens. */
  autoFocus?: boolean
}

/**
 * One reference slot of the New card dialog. Empty: a click/drop target that opens the picker
 * (multiple files allowed, they spill into the next empty slots). Filled: thumbnail, pixel and
 * file size, Replace / Remove. Validation lives in the dialog (`inspectImageFile`), so the
 * dialog only ever hands this a decoded, accepted image.
 */
export function ReferenceSlot({ index, inputId, value, checking, disabled, error, onPick, onRemove, autoFocus }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const n = index + 1
  const messageId = `${inputId}-message`

  // Release the preview URL when the image changes or the dialog closes.
  const previewUrl = value?.previewUrl
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    // Reset so picking the same file again after a Remove still fires onChange.
    e.target.value = ''
    if (files.length) onPick(index, files)
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length) onPick(index, files)
  }

  function onDragOver(e: DragEvent<HTMLElement>) {
    if (disabled) return
    e.preventDefault()
    if (!dragging) setDragging(true)
  }

  const border = error ? 'border-red-400 dark:border-red-500' : 'border-neutral-200 dark:border-neutral-800'

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTR}
        multiple={!value}
        className="sr-only"
        disabled={disabled}
        onChange={onInput}
        data-autofocus={autoFocus ? '' : undefined}
        aria-label={value ? `Replace reference ${n}` : `Choose reference ${n}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? messageId : undefined}
      />

      {value ? (
        <div className={`relative flex overflow-hidden rounded-xl border bg-neutral-100 dark:bg-neutral-950 sm:block ${border}`}>
          <img
            src={value.previewUrl}
            alt={`Reference ${n}: ${value.file.name}`}
            className="h-24 w-24 shrink-0 object-cover sm:aspect-square sm:h-auto sm:w-full"
          />
          <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">{n}</span>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 bg-white px-2.5 py-2 text-xs dark:bg-neutral-900 sm:border-t sm:border-neutral-200 sm:dark:border-neutral-800">
            <div className="min-w-0">
              <p className="truncate font-medium" title={value.file.name}>
                {value.file.name}
              </p>
              <p className="text-neutral-500">
                {value.width} × {value.height} px · {formatBytes(value.file.size)}
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                aria-label={`Replace reference ${n}`}
                title="Replace"
                className={btnGhost}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onRemove(index)}
                disabled={disabled}
                aria-label={`Remove reference ${n}`}
                title="Remove"
                className={btnGhost}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          className={`flex min-h-[6.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center ring-neutral-900/10 transition focus-within:ring-4 dark:ring-white/10 sm:aspect-square sm:min-h-0 ${
            dragging
              ? 'border-neutral-900 bg-neutral-100 dark:border-white dark:bg-neutral-800'
              : error
                ? 'border-red-400 dark:border-red-500'
                : 'border-neutral-300 hover:border-neutral-500 dark:border-neutral-700 dark:hover:border-neutral-500'
          } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          {checking ? (
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" aria-hidden />
          ) : (
            <ImagePlus className="h-5 w-5 text-neutral-400" aria-hidden />
          )}
          <span className="text-sm font-medium">
            Reference {n}
            {n > 1 && <span className="font-normal text-neutral-500"> · optional</span>}
          </span>
          <span className="text-xs text-neutral-500">{checking ? 'Checking the image…' : 'Drop an image or click to choose'}</span>
        </label>
      )}

      {value?.warning && !error && (
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{value.warning}</span>
        </p>
      )}
      {error && (
        <p id={messageId} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
