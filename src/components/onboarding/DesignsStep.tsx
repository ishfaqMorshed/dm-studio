import { forwardRef, useId, useRef, useState } from 'react'
import { AlertTriangle, ImagePlus, Loader2, RefreshCw, Upload } from 'lucide-react'
import { errorMessage, parseReferenceMeta, type Client, type ClientReference } from '../../lib/types'
import { useToast } from '../../lib/useToast'
import { LIBRARY_ACCEPT, LIBRARY_MIN_RECOMMENDED } from '../clientPanel/libraryFiles'
import { useLibraryDrop } from '../clientPanel/useLibraryDrop'
import type { ReferenceLibrary } from '../clientPanel/useReferenceLibrary'
import { btnPrimary, btnSecondary } from '../style/classes'
import { ConfirmDialog } from '../style/ConfirmDialog'
import { DesignTile } from './DesignTile'
import type { ProfilerOrder } from './profilerOrder'
import { StepFrame } from './StepFrame'
import { STEP_SHORT } from './steps'

interface Props {
  client: Client
  library: ReferenceLibrary
  /** Upload cap: settings.max_style_refs (or the fallback). */
  cap: number
  /** Read cap: min(16, max_style_refs). */
  readCap: number
  ordered: ProfilerOrder
  isLead: boolean
  onContinue: () => void
}

/**
 * Step 1: the client's past designs. Upload (shared validation via useLibraryDrop), tick /
 * untick per image, a one-line note per image, and the profiler's numbering made visible.
 */
export const DesignsStep = forwardRef<HTMLHeadingElement, Props>(function DesignsStep(
  { client, library, cap, readCap, ordered, isLead, onContinue },
  ref,
) {
  const toast = useToast()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const drop = useLibraryDrop({ library, cap, clientName: client.name, isLead })
  const [removing, setRemoving] = useState<ClientReference | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)

  const total = library.refs.length
  const ticked = library.refs.filter((r) => !r.excluded).length
  const overflow = ordered.tiles.filter((t) => t.state === 'over_cap').length
  const warnCount = !library.loading && total > 0 && (ticked < LIBRARY_MIN_RECOMMENDED || ticked > readCap)
  // The test card and new cards pick their reference images from these two tags (spec 7): say so while none is set.
  const anchored = library.refs.some((r) => {
    if (r.excluded) return false
    const best = parseReferenceMeta(r.meta).best_for
    return best.includes('lettering') || best.includes('layout')
  })

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

  return (
    <StepFrame
      ref={ref}
      title="Drop the designs"
      pill={
        !library.loading && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
              warnCount
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
            }`}
          >
            {ticked} of {total} selected
          </span>
        )
      }
      subtitle={`${LIBRARY_MIN_RECOMMENDED}–${readCap} of ${client.name}'s past designs. Tick the ones the analysis should read; tag each with its kind, garment and what it is the best example of; add a one-line note where a picture is misleading.`}
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
            title={drop.full ? `Library full (${total} of ${cap}). Remove an image to add another.` : 'PNG, JPG or WebP, up to 15 MB each'}
            className={btnPrimary}
          >
            {library.uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
            {library.uploading ? 'Uploading…' : 'Add images'}
          </button>
        </>
      }
      onContinue={onContinue}
      continueLabel={`Next: ${STEP_SHORT.brief}`}
      continueDisabledReason={!library.loading && ticked === 0 ? 'Tick at least one design' : null}
      footerHint={`You can analyse with fewer images, but ${LIBRARY_MIN_RECOMMENDED} or more is recommended.`}
    >
      {library.error && (
        <p
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <span>
            {total ? 'Refresh failed' : 'Could not load the library'}: {library.error}
          </span>
          <button type="button" onClick={() => void library.refresh()} className={`${btnSecondary} px-2 py-1 text-xs`}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
        </p>
      )}

      {total > 0 && (
        <p className="mb-2 text-[11px] text-neutral-500">
          Numbered in the order the analysis receives them: ticked, newest first. Unticked images are skipped.
        </p>
      )}

      <div
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
        className={`rounded-xl border-2 border-dashed p-2 transition ${
          drop.dragging ? 'border-neutral-900 bg-neutral-100 dark:border-white dark:bg-neutral-800/60' : 'border-transparent'
        }`}
      >
        {library.loading ? (
          <div className="flex justify-center py-10 text-neutral-400" role="status" aria-label="Loading library">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : total === 0 ? (
          <label
            htmlFor={inputId}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-10 text-center hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/40"
          >
            <Upload className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            <span className="text-sm font-medium">No reference images yet</span>
            <span className="max-w-sm text-xs text-neutral-500">
              Drop {LIBRARY_MIN_RECOMMENDED}–{readCap} of {client.name}'s past designs here, or click to pick them. Without
              a library there is nothing to analyse.
            </span>
          </label>
        ) : (
          <ul aria-label="Reference library" className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {ordered.tiles.map((tile) => (
              <DesignTile
                key={tile.ref.id}
                tile={tile}
                readCap={readCap}
                library={library}
                garments={client.garment_colors}
                onRemove={() => setRemoving(tile.ref)}
              />
            ))}
          </ul>
        )}
      </div>

      {!library.loading && total > 0 && (
        <div className="mt-3 space-y-2">
          {ticked < LIBRARY_MIN_RECOMMENDED && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Only {ticked} selected. The analysis reads best from {LIBRARY_MIN_RECOMMENDED} or more; a small set gives a
                vaguer Style Card.
              </span>
            </p>
          )}
          {ticked > readCap && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Only the newest {readCap} selected images are read (Settings › max style refs). {overflow} older{' '}
                {overflow === 1 ? 'one is' : 'ones are'} marked "Not read": untick the weakest so the ones that matter are
                read.
              </span>
            </p>
          )}
          {ticked > 0 && !anchored && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                No ticked image is tagged as the best example of lettering or layout. New cards and the test render pick
                reference images from these tags; without them they take the newest images.
              </span>
            </p>
          )}
          {ordered.tiedCreatedAt && (
            <p className="text-[11px] text-neutral-500">
              Several images were uploaded together, so their numbers may be swapped by the analysis.
            </p>
          )}
        </div>
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
        The file is deleted from storage and will not be read by future Style Card drafts. Versions already drafted or
        locked are not affected.
      </ConfirmDialog>
    </StepFrame>
  )
})
