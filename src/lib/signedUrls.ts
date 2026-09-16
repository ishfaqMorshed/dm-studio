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

function key(bucket: string, path: string) {
  return `${bucket}:${path}`
}

/** Returns a signed URL (1h) for a private object, memoised per bucket+path. */
export async function getSignedUrl(bucket: string, path: string): Promise<string> {
  const k = key(bucket, path)
  const hit = cache.get(k)
  if (hit && hit.expiresAt - SAFETY_MS > Date.now()) return hit.url

  const pending = inflight.get(k)
  if (pending) return pending

  const p = (async () => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_SECONDS)
    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? 'Could not create signed URL')
    }
    cache.set(k, { url: data.signedUrl, expiresAt: Date.now() + TTL_SECONDS * 1000 })
    return data.signedUrl
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
