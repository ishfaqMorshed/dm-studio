import { useState, type ChangeEvent, type DragEvent } from 'react'
import { errorMessage } from '../../lib/types'
import { useToast } from '../../lib/useToast'
import { pickLibraryFiles } from './libraryFiles'
import type { ReferenceLibrary } from './useReferenceLibrary'

export interface LibraryDrop {
  /** True while files are being dragged over the zone. */
  dragging: boolean
  onDragOver: (e: DragEvent<HTMLElement>) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent<HTMLElement>) => void
  /** `onChange` for the hidden `<input type=file multiple>`. */
  onPick: (e: ChangeEvent<HTMLInputElement>) => void
  /** Validates (libraryFiles.ts), toasts what was skipped, uploads what fits. */
  addFiles: (files: File[]) => Promise<void>
  /** No room left under the cap. */
  full: boolean
  /** How many more images fit under the cap. */
  room: number
}

/**
 * The drop-zone / file-picker behaviour of the reference library, shared by the client panel
 * and the onboarding wizard so the validation and the wording live in one place.
 */
export function useLibraryDrop({
  library,
  cap,
  clientName,
  isLead,
}: {
  library: ReferenceLibrary
  /** `settings.max_style_refs` or the fallback. */
  cap: number
  clientName: string
  isLead: boolean
}): LibraryDrop {
  const toast = useToast()
  const [dragging, setDragging] = useState(false)

  const count = library.refs.length
  const room = cap - count
  const full = !library.loading && room <= 0

  async function addFiles(files: File[]) {
    if (library.uploading || files.length === 0) return
    const pick = pickLibraryFiles(files, room)
    if (pick.rejected.length) {
      const shown = pick.rejected.slice(0, 3).join(' ')
      const more = pick.rejected.length - 3
      toast.error(`${shown}${more > 0 ? ` And ${more} more file${more === 1 ? '' : 's'} were skipped.` : ''}`)
    }
    if (pick.overflow > 0) {
      toast.error(
        pick.accepted.length
          ? `The library holds at most ${cap} images. Adding the first ${pick.accepted.length}; ${pick.overflow} did not fit.`
          : `The library is full (${count} of ${cap}). Remove an image before adding another${isLead ? ', or raise the limit in Settings' : ''}.`,
      )
    }
    if (!pick.accepted.length) return
    try {
      const rows = await library.add(pick.accepted)
      toast.success(`${rows.length} image${rows.length === 1 ? '' : 's'} added to ${clientName}'s library`)
    } catch (e) {
      toast.error(`Upload failed: ${errorMessage(e)}`)
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : []
    // Reset so picking the same file again after a failure fires onChange.
    e.target.value = ''
    void addFiles(files)
  }

  function onDragOver(e: DragEvent<HTMLElement>) {
    e.preventDefault()
    if (!library.uploading && !full) setDragging(true)
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault()
    setDragging(false)
    if (library.uploading) return
    void addFiles(Array.from(e.dataTransfer.files))
  }

  return { dragging, onDragOver, onDragLeave: () => setDragging(false), onDrop, onPick, addFiles, full, room }
}
