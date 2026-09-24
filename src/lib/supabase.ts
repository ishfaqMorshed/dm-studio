import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.',
  )
}

/** Typed Supabase client. Publishable (anon) key only; RLS does the rest. */
export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 10 } },
})

/**
 * Client references: card refs `<client_id>/<card_id>/<n>.<ext>` (anon upload after start_brief,
 * staff insert, staff read) and the reference library `<client_id>/library/<uuid>.<ext>` (staff).
 */
export const REFS_BUCKET = 'refs'
/** Generated images: `<card_id>/<generation_id>.png`; masks `<card_id>/<generation_id>-mask.png`. */
export const GENS_BUCKET = 'gens'
/** Print-ready finals: `<card_id>/<generation_id>-final.png`. */
export const FINALS_BUCKET = 'finals'

/** Path helpers so every page spells storage keys the same way. */
export const storagePaths = {
  reference: (clientId: string, cardId: string, n: number, ext: string) => `${clientId}/${cardId}/${n}.${ext}`,
  /** Reference-library image; `client_references.path` stores exactly this (no bucket prefix). */
  libraryReference: (clientId: string, uuid: string, ext: string) => `${clientId}/library/${uuid}.${ext}`,
  generation: (cardId: string, generationId: string) => `${cardId}/${generationId}.png`,
  mask: (cardId: string, generationId: string) => `${cardId}/${generationId}-mask.png`,
  final: (cardId: string, generationId: string) => `${cardId}/${generationId}-final.png`,
}
