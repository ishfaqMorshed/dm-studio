import { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ImageOff, ImagePlus, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react'
import { REFS_BUCKET } from '../../lib/supabase'
import { errorMessage, type ClientReference } from '../../lib/types'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { useToast } from '../../lib/useToast'
import { btnPrimary, btnSecondary, iconBtn } from '../style/classes'
import { ConfirmDialog } from '../style/ConfirmDialog'
import { formatDateTime } from '../style/format'
import { Section } from './Section'
import { LIBRARY_ACCEPT, LIBRARY_FALLBACK_MAX, LIBRARY_MIN_RECOMMENDED } from './libraryFiles'
import { useLibraryDrop } from './useLibraryDrop'
import type { ReferenceLibrary as Library } from './useReferenceLibrary'

/** Transparent-PNG checkerboard behind thumbnails (same as the card page). */
const checkerboard =
  'bg-[conic-gradient(#e5e5e5_25%,transparent_0_50%,#e5e5e5_0_75%,transparent_0)] bg-[length:16px_16px] dark:bg-[conic-gradient(#404040_25%,transparent_0_50%,#404040_0_75%,transparent_0)]'

/**
 * The client's reference library: past designs the vision pass reads when it drafts the
 * Style Card. Multi-file upload (PNG/JPG/WebP, 15 MB each), per-image delete, count against
 * `settings.max_style_refs`. Ticking, unticking and notes live in the onboarding wizard.
 */
export function ReferenceLibrary({
  clientId,
  clientName,
  library,
  maxRefs,
  isLead,
}: {
  clientId: string
  clientName: string
  library: Library
  /** `settings.max_style_refs`, or null while settings load. */
  maxRefs: number | null
  isLead: boolean
}) {
  const toast = useToast()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [removing, setRemoving] = useState<ClientReference | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)

  const cap = maxRefs ?? LIBRARY_FALLBACK_MAX
  const count = library.refs.length
  const ticked = library.refs.filter((r) => !r.excluded).length
  const overCap = count > cap
  const drop = useLibraryDrop({ library, cap, clientName, isLead })

  async function confirmRemove() {
    if (!removing) return
    setRemoveBusy(true)
    try {
      await library.remove(removing)
      setRemoving(null)
      toast.success('Image removed from the library')
    } catch (e) {
      toast.error(`Could not remove the image: ${errorMessage(e)}`)
    } finally {
      setRemoveBusy(false)
    }
  }

  const countLabel = library.loading
    ? 'Loading…'
    : ticked !== count
      ? `${ticked} ticked of ${count}`
      : maxRefs === null
        ? `${count}`
        : `${count} of ${maxRefs}`
  const belowRecommended = !library.loading && count > 0 && count < LIBRARY_MIN_RECOMMENDED

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          Reference library
          <span
            className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
              overCap
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                : 'bg-neutral-200 dark:bg-neutral-800'
            }`}
            title={maxRefs === null ? 'Images in the library' : `Images in the library, of the ${maxRefs} the vision pass reads (Settings › max style refs)`}
          >
            {countLabel}
          </span>
        </span>
      }
      subtitle={
        <>
          Upload {LIBRARY_MIN_RECOMMENDED}–{cap} past designs that show {clientName}'s look. These are read when drafting
          the Style Card; they are not attached to individual cards.{' '}
          <Link
            to={`/clients/${clientId}/onboard?step=designs`}
            className="inline-flex items-center gap-0.5 font-medium text-neutral-700 underline underline-offset-2 dark:text-neutral-300"
          >
            Tick, untick and annotate in the onboarding wizard
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </>
      }
      actions={
        <>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept={LIBRARY_ACCEPT}
            className="sr-only"
            disabled={library.uploading || drop.full}
            onChange={drop.onPick}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={library.uploading || drop.full || library.loading}
            title={
              drop.full
                ? `Library full (${count} of ${cap}). Remove an image to add another.`
                : 'PNG, JPG or WebP, up to 15 MB each'
            }
            className={btnPrimary}
          >
            {library.uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {library.uploading ? 'Uploading…' : 'Add images'}
          </button>
        </>
      }
    >
      {library.error && (
        <p
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <span>
            {count ? 'Refresh failed' : 'Could not load the library'}: {library.error}
          </span>
          <button type="button" onClick={() => void library.refresh()} className={`${btnSecondary} px-2 py-1 text-xs`}>
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </p>
      )}

      {overCap && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          The library has {count} images but the vision pass reads at most {cap}. Remove the weakest ones so the ones
          that matter are read{isLead ? ', or raise the limit in Settings' : ''}.
        </p>
      )}

      <div
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
        className={`rounded-xl border-2 border-dashed p-2 transition ${
          drop.dragging
            ? 'border-neutral-900 bg-neutral-100 dark:border-white dark:bg-neutral-800/60'
            : 'border-transparent'
        }`}
      >
        {library.loading ? (
          <div className="flex justify-center py-10 text-neutral-400" role="status" aria-label="Loading library">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : count === 0 ? (
          <label
            htmlFor={inputId}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-10 text-center hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/40"
          >
            <Upload className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            <span className="text-sm font-medium">No reference images yet</span>
            <span className="max-w-sm text-xs text-neutral-500">
              Drop {LIBRARY_MIN_RECOMMENDED}–{cap} of {clientName}'s past designs here, or click to pick them. Without a
              library there is nothing to draft the Style Card from.
            </span>
          </label>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6" aria-label="Reference library">
            {library.refs.map((ref, i) => (
              <LibraryTile
                key={ref.id}
                ref_={ref}
                index={i}
                removing={library.removingId === ref.id}
                onRemove={() => setRemoving(ref)}
              />
            ))}
          </ul>
        )}
      </div>

      {belowRecommended && (
        <p className="mt-2 text-[11px] text-neutral-500">
          {count} image{count === 1 ? '' : 's'} so far. Drafts read best from {LIBRARY_MIN_RECOMMENDED} or more.
        </p>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this image from the library?"
        confirmLabel="Remove image"
        cancelLabel="Keep it"
        tone="danger"
        busy={removeBusy}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
      >
        The file is deleted from storage and will not be read by future Style Card drafts. Versions already drafted
        or locked are not affected.
      </ConfirmDialog>
    </Section>
  )
}

function LibraryTile({
  ref_,
  index,
  removing,
  onRemove,
}: {
  ref_: ClientReference
  index: number
  removing: boolean
  onRemove: () => void
}) {
  const { url, broken } = useSignedUrl(REFS_BUCKET, ref_.path)
  const label = ref_.note?.trim() || `Reference ${index + 1}`
  return (
    <li className="group relative min-w-0">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${label} full size${ref_.excluded ? ' (skipped by the analysis)' : ''}`}
        title={`${label} · added ${formatDateTime(ref_.created_at)}${ref_.excluded ? ' · unticked for the analysis' : ''}`}
        className={`block aspect-square overflow-hidden rounded-xl border border-neutral-200 outline-none focus-visible:ring-4 focus-visible:ring-neutral-900/10 dark:border-neutral-800 ${checkerboard}`}
      >
        {broken ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-neutral-400">
            <ImageOff className="h-5 w-5" />
            <span className="text-[10px]">Missing</span>
          </div>
        ) : url ? (
          <img
            src={url}
            alt={label}
            loading="lazy"
            decoding="async"
            className={`h-full w-full object-cover ${ref_.excluded ? 'opacity-50 grayscale' : ''}`}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-neutral-200/60 dark:bg-neutral-800/60" />
        )}
      </a>
      {ref_.excluded && (
        <span
          className="absolute left-1.5 top-1.5 rounded-full bg-neutral-200/95 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-700/95 dark:text-neutral-200"
          title="Unticked for the analysis"
        >
          Skipped
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label={`Remove ${label} from the library`}
        title="Remove from library"
        className={`${iconBtn} absolute right-1.5 top-1.5 h-7 w-7 bg-white/90 opacity-80 shadow-sm hover:opacity-100 focus-visible:opacity-100 dark:bg-neutral-900/90`}
      >
        {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </li>
  )
}
