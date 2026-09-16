import { FINALS_BUCKET, GENS_BUCKET, REFS_BUCKET, supabase } from '../../lib/supabase'
import type { DeliveredCard } from './finals'

const LIST_LIMIT = 1000

/** Every object directly under `folder` in `bucket` (sub-folders come back with no id and are skipped). */
async function listFolder(bucket: string, folder: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: LIST_LIMIT })
  if (error) throw new Error(`Could not list the ${bucket} files for this card: ${error.message}`)
  return (data ?? []).filter((o) => Boolean(o.id) && o.name).map((o) => `${folder}/${o.name}`)
}

async function removeObjects(bucket: string, paths: string[]): Promise<number> {
  if (!paths.length) return 0
  const { data, error } = await supabase.storage.from(bucket).remove(paths)
  if (error) throw new Error(`Could not delete the ${bucket} files for this card: ${error.message}`)
  return data?.length ?? 0
}

/** Reference paths that another card still points at (a duplicated card reuses the client's uploads). */
async function sharedReferences(cardId: string, paths: string[]): Promise<Set<string>> {
  const shared = new Set<string>()
  if (!paths.length) return shared
  const { data, error } = await supabase
    .from('cards')
    .select('id, reference_paths')
    .neq('id', cardId)
    .overlaps('reference_paths', paths)
  if (error) throw new Error(`Could not check whether another card uses these references: ${error.message}`)
  for (const row of data ?? []) {
    for (const p of row.reference_paths ?? []) if (paths.includes(p)) shared.add(p)
  }
  return shared
}

export interface DeleteResult {
  filesRemoved: number
  /** Reference uploads left in place because another card still uses them. */
  refsKept: number
}

/**
 * Removes everything a delivered card owns in storage (finals, gens incl. masks, refs),
 * then deletes the card row; generations, fin_jobs and fin_job_events cascade with it.
 * Storage goes first: if any of it fails the row is kept so nothing is orphaned.
 */
export async function deleteDeliveredCard(card: DeliveredCard): Promise<DeleteResult> {
  const finals = new Set(await listFolder(FINALS_BUCKET, card.id))
  for (const job of card.fin_jobs ?? []) if (job.final_path) finals.add(job.final_path)

  const gens = new Set(await listFolder(GENS_BUCKET, card.id))
  if (card.current_generation?.image_path) gens.add(card.current_generation.image_path)

  const refCandidates = new Set(await listFolder(REFS_BUCKET, `${card.client_id}/${card.id}`))
  for (const p of card.reference_paths ?? []) if (p) refCandidates.add(p)
  const shared = await sharedReferences(card.id, [...refCandidates])
  const refs = [...refCandidates].filter((p) => !shared.has(p))

  let filesRemoved = 0
  filesRemoved += await removeObjects(FINALS_BUCKET, [...finals])
  filesRemoved += await removeObjects(GENS_BUCKET, [...gens])
  filesRemoved += await removeObjects(REFS_BUCKET, refs)

  // `.select('id')` reports what was actually deleted: RLS turns a refused delete into 0 rows, not an error.
  const { data, error } = await supabase.from('cards').delete().eq('id', card.id).select('id')
  if (error) throw new Error(`The files are gone but the card could not be deleted: ${error.message}`)
  if (!data?.length) {
    throw new Error(
      'The files are gone but the card row was not deleted: it may have left Delivered, or your account cannot delete cards. Refresh and try again.',
    )
  }
  return { filesRemoved, refsKept: shared.size }
}
