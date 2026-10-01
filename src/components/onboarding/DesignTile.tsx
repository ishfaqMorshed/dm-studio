import { useEffect, useState, type KeyboardEvent } from 'react'
import { Check, ImageOff, Loader2, Trash2 } from 'lucide-react'
import { REFS_BUCKET } from '../../lib/supabase'
import { errorMessage, parseReferenceMeta, referenceMetaToJson, type ClientReferenceMeta } from '../../lib/types'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { useToast } from '../../lib/useToast'
import type { ReferenceLibrary } from '../clientPanel/useReferenceLibrary'
import { checkerboard, imageChip, inputCls } from '../card/styles'
import { iconBtn } from '../style/classes'
import { formatDateTime } from '../style/format'
import { DesignTags } from './DesignTags'
import type { OrderedTile } from './profilerOrder'

const NOTE_MAX = 140
const CHECK_FLASH_MS = 1500

/**
 * One library image in the wizard: profiler number (or "Not read" / "Skipped"), a visible
 * tick that sets `client_references.excluded`, a one-line note saved on blur or Enter, the
 * tags (`meta`: kind, garment, best example of, outlier) and Remove. Every control is labelled
 * with the image number for screen readers.
 */
export function DesignTile({
  tile,
  readCap,
  library,
  garments,
  onRemove,
}: {
  tile: OrderedTile
  readCap: number
  library: ReferenceLibrary
  /** The client's garment colours, offered in the garment select. */
  garments: readonly string[]
  onRemove: () => void
}) {
  const toast = useToast()
  const { ref, number, state } = tile
  const { url, broken } = useSignedUrl(REFS_BUCKET, ref.path)
  const updating = library.updatingId === ref.id
  const removing = library.removingId === ref.id
  const busy = updating || removing

  const who = number !== null ? `Image ${number}` : state === 'skipped' ? 'Skipped image' : 'Unread image'
  const ticked = !ref.excluded
  const meta = parseReferenceMeta(ref.meta)

  async function toggle(checked: boolean) {
    try {
      await library.update(ref, { excluded: !checked })
    } catch (e) {
      toast.error(`Could not ${checked ? 'tick' : 'untick'} the image: ${errorMessage(e)}`)
    }
  }

  async function saveMeta(next: ClientReferenceMeta) {
    try {
      await library.update(ref, { meta: referenceMetaToJson(next) })
    } catch (e) {
      toast.error(`Could not save the tags of ${who.toLowerCase()}: ${errorMessage(e)}`)
    }
  }

  return (
    <li className="min-w-0">
      <div
        className={`relative aspect-square overflow-hidden rounded-xl border ${checkerboard} ${
          state === 'read'
            ? 'border-neutral-200 dark:border-neutral-800'
            : state === 'over_cap'
              ? 'border-amber-300 dark:border-amber-700'
              : 'border-neutral-200 dark:border-neutral-800'
        }`}
      >
        {broken ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-neutral-400">
            <ImageOff className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10px]">Missing</span>
          </div>
        ) : url ? (
          <img
            src={url}
            alt={`${who}${ref.note?.trim() ? `: ${ref.note.trim()}` : ''}`}
            title={`Added ${formatDateTime(ref.created_at)}`}
            loading="lazy"
            decoding="async"
            className={`h-full w-full object-cover ${state === 'skipped' ? 'opacity-50 grayscale' : ''}`}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-neutral-200/60 dark:bg-neutral-800/60" />
        )}

        {/* Top-left: the number the profiler sees, or why it sees none */}
        {state === 'read' && number !== null && (
          <span className={`absolute left-1.5 top-1.5 ${imageChip} tabular-nums`} title={`The analysis receives this as image ${number}`}>
            {number}
          </span>
        )}
        {state === 'over_cap' && (
          <span
            className="absolute left-1.5 top-1.5 rounded-full bg-amber-100/95 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/90 dark:text-amber-100"
            title={`Only the newest ${readCap} ticked images are analysed`}
          >
            Not read
          </span>
        )}
        {state === 'skipped' && (
          <span
            className="absolute left-1.5 top-1.5 rounded-full bg-neutral-200/95 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-700/95 dark:text-neutral-200"
            title="Unticked: the analysis skips this image"
          >
            Skipped
          </span>
        )}

        {/* Top-right: the tick */}
        <label
          className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-white/90 shadow-sm dark:bg-neutral-900/90"
          title={ticked ? 'Ticked: read by the analysis. Untick to skip it.' : 'Unticked: skipped by the analysis. Tick to read it.'}
        >
          <input
            type="checkbox"
            checked={ticked}
            disabled={busy}
            onChange={(e) => void toggle(e.target.checked)}
            aria-label={`${who}: read by the analysis`}
            className="h-5 w-5 cursor-pointer accent-neutral-900 disabled:cursor-not-allowed dark:accent-white"
          />
        </label>

        {/* Bottom-right: remove */}
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`Remove ${who.toLowerCase()} from the library`}
          title="Remove from library"
          className={`${iconBtn} absolute bottom-1.5 right-1.5 h-7 w-7 bg-white/90 opacity-80 shadow-sm hover:opacity-100 focus-visible:opacity-100 dark:bg-neutral-900/90`}
        >
          {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>

        {updating && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/40 dark:bg-black/30" aria-hidden="true">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-700 dark:text-neutral-200" />
          </span>
        )}
      </div>

      <NoteInput who={who} value={ref.note ?? ''} disabled={busy} onSave={(note) => library.update(ref, { note })} />
      <DesignTags who={who} meta={meta} garments={garments} disabled={busy} onChange={(next) => void saveMeta(next)} />
    </li>
  )
}

/** One-line note, saved on blur or Enter when changed. Escape restores the saved value. */
function NoteInput({
  who,
  value,
  disabled,
  onSave,
}: {
  who: string
  value: string
  disabled: boolean
  onSave: (note: string | null) => Promise<unknown>
}) {
  const [text, setText] = useState(value)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Adopt a server value (poll, teammate) while the field is not being edited.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (text === prevValue) setText(value)
  }

  useEffect(() => {
    if (!saved) return
    const t = window.setTimeout(() => setSaved(false), CHECK_FLASH_MS)
    return () => window.clearTimeout(t)
  }, [saved])

  async function commit() {
    const next = text.trim()
    if (next === value.trim()) {
      if (next !== text) setText(next)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(next || null)
      setText(next)
      setSaved(true)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setText(value)
      setError(null)
    }
  }

  return (
    <div className="relative mt-1">
      <input
        type="text"
        value={text}
        maxLength={NOTE_MAX}
        disabled={disabled || saving}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        onBlur={() => void commit()}
        onKeyDown={onKeyDown}
        placeholder="Note, e.g. mockup, bestseller 2025"
        aria-label={`Note for ${who.toLowerCase()}`}
        aria-invalid={error ? true : undefined}
        className={`${inputCls} !px-2 !py-1 text-xs ${saved ? '!pr-6' : ''}`}
      />
      {saved && (
        <Check
          className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-600 dark:text-emerald-400"
          aria-label="Note saved"
        />
      )}
      {error && (
        <p role="alert" className="mt-0.5 text-[11px] text-red-700 dark:text-red-300">
          Not saved: {error}
        </p>
      )}
    </div>
  )
}
