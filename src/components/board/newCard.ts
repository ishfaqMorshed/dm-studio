import { REFS_BUCKET, storagePaths, supabase } from '../../lib/supabase'
import type { Client } from '../../lib/types'
import { DEFAULT_GARMENT_COLORS } from '../brief/constants'
import { mimeForExt } from '../brief/imageFile'

/** Reference slots in the designer's New card dialog: at least one, at most three. */
export const NEW_CARD_SLOTS = 3

/** Similarity tier labels, same wording as the card page's brief editor. */
export const TIER_OPTIONS = [
  { value: '1', label: '1 — style only, new subject' },
  { value: '2', label: '2 — loosely inspired' },
  { value: '3', label: '3 — balanced' },
  { value: '4', label: '4 — close to the references' },
  { value: '5', label: '5 — as close as the model allows' },
] as const

/** A fresh card id for `create_card_as_designer`; the references upload under it first. */
export function newCardId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Older WebViews: RFC 4122 v4 from getRandomValues.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** The client's own garment colours, else the studio defaults; trimmed and de-duplicated. */
export function garmentOptionsFor(client: Pick<Client, 'garment_colors'> | null | undefined): string[] {
  const own = (client?.garment_colors ?? []).map((c) => c.trim()).filter(Boolean)
  return Array.from(new Set(own.length ? own : [...DEFAULT_GARMENT_COLORS]))
}

export interface UploadDesignerReferenceArgs {
  clientId: string
  cardId: string
  /** 1-based slot number → object name `<n>.<ext>`. */
  slot: number
  file: File
  ext: string
}

/**
 * Uploads one reference with the signed-in staff session to `refs/<client_id>/<card_id>/<n>.<ext>`
 * (the staff insert policy) and resolves with the bucket-relative path the RPC expects.
 */
export async function uploadDesignerReference(args: UploadDesignerReferenceArgs): Promise<string> {
  const path = storagePaths.reference(args.clientId, args.cardId, args.slot, args.ext)
  const { error } = await supabase.storage.from(REFS_BUCKET).upload(path, args.file, {
    contentType: args.file.type || mimeForExt(args.ext),
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw new Error(`Reference ${args.slot} could not be uploaded: ${error.message}`)
  return path
}

/** Best-effort cleanup when card creation fails after the uploads landed; never throws. */
export async function removeUploadedReferences(paths: string[]): Promise<void> {
  if (!paths.length) return
  try {
    const { error } = await supabase.storage.from(REFS_BUCKET).remove(paths)
    if (error) console.warn('reference cleanup failed', error)
  } catch (e) {
    console.warn('reference cleanup failed', e)
  }
}
