/** Limits and vocabulary for the public client brief form (SOP 5.1). */

export const REFERENCE_SLOT_COUNT = 3
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const MIN_SHORT_SIDE_PX = 512
export const DESCRIPTION_MAX_CHARS = 400
/** `start_brief` opens a 15-minute upload window; `submit_brief` tolerates one extra hour. */
export const UPLOAD_WINDOW_MINUTES = 15

/** Accepted MIME types → extension used in `refs/<client_id>/<card_id>/<n>.<ext>`. */
export const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** File-name extensions we accept when the browser hands us no MIME type. */
export const IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'png',
  jpg: 'jpg',
  jpeg: 'jpg',
  webp: 'webp',
}

export const ACCEPT_ATTR = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp'

/** Used when the client record has no garment colours of its own yet. */
export const DEFAULT_GARMENT_COLORS: readonly string[] = ['black', 'white', 'heather', 'navy']

/** Sentinel value of the "Other" option in the garment colour select. */
export const OTHER_GARMENT = '__other__'
