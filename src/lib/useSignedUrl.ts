import { useEffect, useState } from 'react'
import { getSignedUrl, type ObjectVersion } from './signedUrls'

export interface SignedUrlState {
  url: string | null
  /** True when signing failed (object missing, no access). Render a placeholder. */
  broken: boolean
}

interface Resolved extends SignedUrlState {
  key: string
  /** bucket:path without the version - the same object, possibly rewritten. */
  object: string
}

const EMPTY: SignedUrlState = { url: null, broken: false }

/**
 * Signed URL (1 h, memoised per bucket+path+version) for an `<img src>`.
 * Pass a null/empty path to get `{ url: null, broken: false }` without a request.
 * While a new path is resolving the previous URL is not shown (url is null).
 * Pass the row's `updated_at` as `version` for objects the pipeline rewrites in place (generation
 * images): a new version re-signs and the browser fetches the new bytes; until that resolves the
 * previous URL of the same object stays on screen, so a row update never blanks the picture.
 */
export function useSignedUrl(bucket: string, path: string | null | undefined, version?: ObjectVersion): SignedUrlState {
  const object = path ? `${bucket}:${path}` : null
  const key = object ? `${object}#${version ?? ''}` : null
  const [resolved, setResolved] = useState<Resolved | null>(null)

  useEffect(() => {
    if (!key || !object || !path) return
    let cancelled = false
    getSignedUrl(bucket, path, version)
      .then((u) => !cancelled && setResolved({ key, object, url: u, broken: false }))
      .catch(
        () =>
          !cancelled &&
          setResolved((prev) =>
            // Same object, re-sign failed: keep the last good picture (the next row change retries) rather than a placeholder.
            prev && prev.object === object && prev.url ? prev : { key, object, url: null, broken: true },
          ),
      )
    return () => {
      cancelled = true
    }
  }, [bucket, path, version, key, object])

  if (!key || !resolved) return EMPTY
  if (resolved.key === key) return resolved
  // Same object, new version: keep the last good picture while the fresh URL resolves.
  if (resolved.object === object && resolved.url) return resolved
  return EMPTY
}
