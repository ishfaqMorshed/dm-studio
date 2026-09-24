import { STAGES } from '../../lib/stage'
import type { CardStage } from '../../lib/types'
import type { BoardCard } from './types'

/**
 * What the board is currently showing. Lives in the URL so it survives opening a card.
 * The client is not here: the header's client scope (`?client=`) narrows every page.
 */
export interface BoardFilters {
  /** Stages whose columns are visible. */
  stages: ReadonlySet<CardStage>
  /** Only cards approved by the signed-in designer. */
  mine: boolean
}

const ALL_STAGES: ReadonlySet<CardStage> = new Set(STAGES)

export const DEFAULT_FILTERS: BoardFilters = { stages: ALL_STAGES, mine: false }

function isStage(v: string): v is CardStage {
  return (STAGES as readonly string[]).includes(v)
}

/** `?stages=review,needs_review&mine=1` → filters. Unknown values fall back to defaults. */
export function readFilters(sp: URLSearchParams): BoardFilters {
  const stagesParam = sp.get('stages')
  const picked = stagesParam ? stagesParam.split(',').filter(isStage) : []
  return {
    stages: picked.length ? new Set(picked) : ALL_STAGES,
    mine: sp.get('mine') === '1',
  }
}

/**
 * Filters → search params. Defaults are omitted so the plain /board URL stays clean.
 * Starts from `base` so unrelated params (the header's `?client=`) survive.
 */
export function writeFilters(f: BoardFilters, base?: URLSearchParams): URLSearchParams {
  const sp = new URLSearchParams(base)
  sp.delete('stages')
  sp.delete('mine')
  if (f.stages.size !== STAGES.length) sp.set('stages', STAGES.filter((s) => f.stages.has(s)).join(','))
  if (f.mine) sp.set('mine', '1')
  return sp
}

export function isDefaultFilters(f: BoardFilters): boolean {
  return !f.mine && f.stages.size === STAGES.length
}

/** Applies the "mine" filter. Stage visibility is handled by hiding columns; the client by the scope. */
export function matchesCard(card: BoardCard, f: BoardFilters, userId: string | null): boolean {
  if (f.mine && (!userId || card.approved_by !== userId)) return false
  return true
}
