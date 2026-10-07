import { supabase } from './supabase'

const TTL_SECONDS = 60 * 60
// Refresh a little before expiry so an in-flight <img> never hits a dead URL.
const SAFETY_MS = 5 * 60 * 1000

interface Entry {
  url: string
  expiresAt: number
}

const cache = new Map<string, Entry>()
const inflight = new Map<string, Promise<string>>()

/** A value that changes whenever the object behind a path may have been rewritten (e.g. a row's updated_at). */
export type ObjectVersion = string | number | null | undefined

function key(bucket: string, path: string, version: ObjectVersion) {
  return `${bucket}:${path}#${version ?? ''}`
}

/**
 * Returns a signed URL (1h) for a private object, memoised per bucket+path+version.
 *
 * The pipeline rewrites some objects in place (a corrective attempt uploads over the same
 * gens/<card>/<generation>.png), so a URL memoised by path alone keeps showing the first bytes
 * the browser fetched. Pass the row's `updated_at` as `version`: a new version signs again and
 * carries `v=` in the query, so the browser fetches the new object instead of reusing its cache.
 */
export async function getSignedUrl(bucket: string, path: string, version?: ObjectVersion): Promise<string> {
  const k = key(bucket, path, version)
  const hit = cache.get(k)
  if (hit && hit.expiresAt - SAFETY_MS > Date.now()) return hit.url

  const pending = inflight.get(k)
  if (pending) return pending

  const p = (async () => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_SECONDS)
    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? 'Could not create signed URL')
    }
    const url =
      version === null || version === undefined || version === ''
        ? data.signedUrl
        : `${data.signedUrl}${data.signedUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(version))}`
    cache.set(k, { url, expiresAt: Date.now() + TTL_SECONDS * 1000 })
    return url
  })()

  inflight.set(k, p)
  try {
    return await p
  } finally {
    inflight.delete(k)
  }
}

export function clearSignedUrlCache() {
  cache.clear()
}
