/**
 * The order the style profiler (WF-1b) receives the library: ticked (not excluded) images,
 * newest first, cut to `readCap` = min(16, settings.max_style_refs). Its evidence notes cite
 * "IMAGE n" by that position, so every thumbnail in the wizard carries the same number.
 *
 * WF-1b orders by `created_at desc` only; a batch upload gives identical timestamps, so the
 * UI adds `id desc` for stable positions and flags the tie (`tiedCreatedAt`) as a caveat.
 */
import type { ClientReference } from '../../lib/types'

export type TileState = 'read' | 'over_cap' | 'skipped'

export interface OrderedTile {
  ref: ClientReference
  /** 1..N for the images the profiler reads, null otherwise. */
  number: number | null
  state: TileState
}

export interface ProfilerOrder {
  /** Every library image, newest first, with its number and state. */
  tiles: OrderedTile[]
  /** The numbered images, in profiler order (what WF-1b reads; the test render takes the newest 3). */
  read: ClientReference[]
  /** Two or more numbered images share a created_at, so the profiler may have swapped them. */
  tiedCreatedAt: boolean
}

export function newestFirst(a: Pick<ClientReference, 'created_at' | 'id'>, b: Pick<ClientReference, 'created_at' | 'id'>): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export function profilerOrder(refs: readonly ClientReference[], readCap: number): ProfilerOrder {
  const sorted = [...refs].sort(newestFirst)
  const cap = Math.max(0, readCap)
  const tiles: OrderedTile[] = []
  const read: ClientReference[] = []
  let n = 0
  for (const ref of sorted) {
    if (ref.excluded) {
      tiles.push({ ref, number: null, state: 'skipped' })
    } else if (n < cap) {
      n += 1
      read.push(ref)
      tiles.push({ ref, number: n, state: 'read' })
    } else {
      tiles.push({ ref, number: null, state: 'over_cap' })
    }
  }
  const stamps = new Set<string>()
  let tiedCreatedAt = false
  for (const r of read) {
    if (stamps.has(r.created_at)) tiedCreatedAt = true
    stamps.add(r.created_at)
  }
  return { tiles, read, tiedCreatedAt }
}

/**
 * The same order restricted to images that existed when a draft was analysed
 * (`created_at <= asOfIso`), to reconstruct what the profiler saw for that version.
 * Images unticked or removed since cannot be recovered; the caller says so.
 */
export function asOfProfilerOrder(refs: readonly ClientReference[], readCap: number, asOfIso: string): ProfilerOrder {
  const asOf = Date.parse(asOfIso)
  const before = Number.isNaN(asOf) ? refs : refs.filter((r) => Date.parse(r.created_at) <= asOf)
  return profilerOrder(before, readCap)
}
