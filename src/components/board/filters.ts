import { STAGES } from '../../lib/stage'
import type { CardStage } from '../../lib/types'
import type { BoardCard } from './types'

/** What the board is currently showing. Lives in the URL so it survives opening a card. */
export interface BoardFilters {
  /** Client id, or null for every client. */
  clientId: string | null
  /** Stages whose columns are visible. */
  stages: ReadonlySet<CardStage>
  /** Only cards approved by the signed-in designer. */
  mine: boolean
}

const ALL_STAGES: ReadonlySet<CardStage> = new Set(STAGES)

export const DEFAULT_FILTERS: BoardFilters = { clientId: null, stages: ALL_STAGES, mine: false }

function isStage(v: string): v is CardStage {
  return (STAGES as readonly string[]).includes(v)
}

/** `?client=<id>&stages=review,needs_review&mine=1` → filters. Unknown values fall back to defaults. */
export function readFilters(sp: URLSearchParams): BoardFilters {
  const client = sp.get('client')
  const stagesParam = sp.get('stages')
  const picked = stagesParam ? stagesParam.split(',').filter(isStage) : []
  return {
    clientId: client && client.trim() ? client : null,
    stages: picked.length ? new Set(picked) : ALL_STAGES,
    mine: sp.get('mine') === '1',
  }
}

/** Filters → search params. Defaults are omitted so the plain /board URL stays clean. */
export function writeFilters(f: BoardFilters): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.clientId) sp.set('client', f.clientId)
  if (f.stages.size !== STAGES.length) sp.set('stages', STAGES.filter((s) => f.stages.has(s)).join(','))
  if (f.mine) sp.set('mine', '1')
  return sp
}

export function isDefaultFilters(f: BoardFilters): boolean {
  return f.clientId === null && !f.mine && f.stages.size === STAGES.length
}

/** Applies the client and "mine" filters. Stage visibility is handled by hiding columns. */
export function matchesCard(card: BoardCard, f: BoardFilters, userId: string | null): boolean {
  if (f.clientId && card.client_id !== f.clientId) return false
  if (f.mine && (!userId || card.approved_by !== userId)) return false
  return true
}
