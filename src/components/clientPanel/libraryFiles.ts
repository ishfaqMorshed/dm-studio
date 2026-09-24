/**
 * Limits for the client reference library: 5–15 past designs the vision pass reads when it
 * drafts the Style Card. The cap comes from `settings.max_style_refs`; the DB does not enforce
 * it, so the panel does, and it tells the designer why.
 */

export const LIBRARY_MAX_BYTES = 15 * 1024 * 1024
/** Below this many images the draft is noticeably weaker; a hint, not a block. */
export const LIBRARY_MIN_RECOMMENDED = 5
/** Used until `settings.max_style_refs` has loaded. */
export const LIBRARY_FALLBACK_MAX = 12

export const LIBRARY_ACCEPT = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'

const MIME_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp'])
const NAME_EXTENSIONS: ReadonlySet<string> = new Set(['png', 'jpg', 'jpeg', 'webp'])

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function nameExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

/** Null when the file can go in the library, else the reason it cannot. */
export function checkLibraryFile(file: File): string | null {
  const type = file.type.toLowerCase()
  // Drag-and-drop and some pickers hand over an empty MIME type; trust the name then.
  const accepted = type ? MIME_TYPES.has(type) : NAME_EXTENSIONS.has(nameExtension(file.name))
  if (!accepted) {
    const ext = nameExtension(file.name)
    return ext ? `${file.name} is a .${ext}; use PNG, JPG or WebP.` : `${file.name} is not a PNG, JPG or WebP image.`
  }
  if (file.size > LIBRARY_MAX_BYTES) {
    return `${file.name} is ${formatBytes(file.size)}; the limit is 15 MB.`
  }
  return null
}

export interface LibraryPick {
  /** Files that pass the type/size check, in pick order, cut to what fits under the cap. */
  accepted: File[]
  /** One line per rejected file. */
  rejected: string[]
  /** Accepted files that did not fit under the cap. */
  overflow: number
}

/** Splits a picker/drop selection into what can be uploaded now and why the rest cannot. */
export function pickLibraryFiles(files: readonly File[], room: number): LibraryPick {
  const accepted: File[] = []
  const rejected: string[] = []
  for (const f of files) {
    const problem = checkLibraryFile(f)
    if (problem) rejected.push(problem)
    else accepted.push(f)
  }
  const fit = Math.max(0, room)
  return { accepted: accepted.slice(0, fit), rejected, overflow: Math.max(0, accepted.length - fit) }
}
