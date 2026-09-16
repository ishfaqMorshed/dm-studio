import { REFS_BUCKET, storagePaths, supabase } from '../../lib/supabase'
import { mimeForExt } from './imageFile'

/**
 * refused — storage's RLS said no. For an anonymous visitor that means the 15-minute window
 *           closed (or a staff session is signed in on this browser); a fresh window fixes it.
 * other   — network or an unexpected storage error; retrying the same window is fine.
 */
export type UploadFailure = 'refused' | 'other'

export class ReferenceUploadError extends Error {
  readonly reason: UploadFailure
  /** 1-based slot number. */
  readonly slot: number

  constructor(message: string, reason: UploadFailure, slot: number) {
    super(message)
    this.name = 'ReferenceUploadError'
    this.reason = reason
    this.slot = slot
  }
}

interface StorageFailure {
  message: string
  status?: number
  statusCode?: string
}

/** storage-js throws `StorageApiError { status, statusCode }`; narrow without importing the class. */
function describe(error: unknown): StorageFailure {
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: unknown; status?: unknown; statusCode?: unknown }
    return {
      message: typeof e.message === 'string' && e.message ? e.message : 'Unknown storage error',
      status: typeof e.status === 'number' ? e.status : undefined,
      statusCode: typeof e.statusCode === 'string' ? e.statusCode : undefined,
    }
  }
  return { message: String(error) }
}

function alreadyExists(f: StorageFailure): boolean {
  return (
    f.status === 409 ||
    f.statusCode === 'Duplicate' ||
    f.statusCode === 'ResourceAlreadyExists' ||
    /already exists/i.test(f.message)
  )
}

function refused(f: StorageFailure): boolean {
  return (
    f.status === 403 ||
    f.statusCode === 'AccessDenied' ||
    /row-level security|unauthorized|not authorized|not allowed|policy/i.test(f.message)
  )
}

export interface UploadReferenceArgs {
  clientId: string
  cardId: string
  /** 1-based slot number → object name `<n>.<ext>`. */
  slot: number
  file: File
  ext: string
}

/**
 * Uploads one reference to `refs/<client_id>/<card_id>/<n>.<ext>` as the anonymous role and
 * resolves with the bucket path. The bucket policy allows INSERT only (no overwrite) and at most
 * three objects per card, so a "Duplicate" answer means our own earlier attempt landed even though
 * its response was lost — that counts as success.
 */
export async function uploadReference(args: UploadReferenceArgs): Promise<string> {
  const path = storagePaths.reference(args.clientId, args.cardId, args.slot, args.ext)
  const { error } = await supabase.storage.from(REFS_BUCKET).upload(path, args.file, {
    contentType: args.file.type || mimeForExt(args.ext),
    cacheControl: '3600',
    upsert: false,
  })
  if (!error) return path

  const f = describe(error)
  if (alreadyExists(f)) return path
  if (refused(f)) {
    throw new ReferenceUploadError(
      `Storage refused reference ${args.slot}. The upload window has closed — start again to open a fresh one.`,
      'refused',
      args.slot,
    )
  }
  throw new ReferenceUploadError(
    `Reference ${args.slot} could not be uploaded: ${f.message}. Check your connection and press Send brief again.`,
    'other',
    args.slot,
  )
}
