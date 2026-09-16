import { useEffect, useState } from 'react'
import { getSignedUrl } from './signedUrls'

export interface SignedUrlState {
  url: string | null
  /** True when signing failed (object missing, no access). Render a placeholder. */
  broken: boolean
}

interface Resolved extends SignedUrlState {
  key: string
}

const EMPTY: SignedUrlState = { url: null, broken: false }

/**
 * Signed URL (1 h, memoised per bucket+path) for an `<img src>`.
 * Pass a null/empty path to get `{ url: null, broken: false }` without a request.
 * While a new path is resolving the previous URL is not shown (url is null).
 */
export function useSignedUrl(bucket: string, path: string | null | undefined): SignedUrlState {
  const key = path ? `${bucket}:${path}` : null
  const [resolved, setResolved] = useState<Resolved | null>(null)

  useEffect(() => {
    if (!key || !path) return
    let cancelled = false
    getSignedUrl(bucket, path)
      .then((u) => !cancelled && setResolved({ key, url: u, broken: false }))
      .catch(() => !cancelled && setResolved({ key, url: null, broken: true }))
    return () => {
      cancelled = true
    }
  }, [bucket, path, key])

  return key && resolved?.key === key ? resolved : EMPTY
}
