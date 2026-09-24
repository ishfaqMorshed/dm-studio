import { useCallback, useMemo } from 'react'
import { listStyleDraftRequests } from './api'
import { ACTIVE_JOB_STATUSES, type StyleDraftRequest } from './types'
import { useAuth } from './useAuth'
import { useRealtimeTable } from './useRealtimeTable'

/** Faster than the board poll: a draft takes 30–90 s and the panel shows its status live. */
const DRAFT_POLL_MS = 5_000

export interface StyleDraftRequestsResult {
  /** Newest first. */
  requests: StyleDraftRequest[]
  /** The most recent request, if any. */
  latest: StyleDraftRequest | null
  /** True while the latest request is queued/dispatched/working (disable the Draft button). */
  drafting: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** Merge a row you just inserted (`requestStyleDraft`) so the panel updates before the next poll. */
  upsertLocal: (row: StyleDraftRequest) => void
}

/**
 * Live view of a client's "Draft Style Card from library" requests: Realtime on
 * `style_draft_requests` (filtered to the client) plus a 5 s poll fallback.
 * Pass null to disable (e.g. while the client id is still loading).
 */
export function useStyleDraftRequests(clientId: string | null): StyleDraftRequestsResult {
  const { user } = useAuth()
  const enabled = Boolean(user && clientId)

  const fetch = useCallback(async (): Promise<StyleDraftRequest[]> => {
    if (!clientId) return []
    return listStyleDraftRequests(clientId)
  }, [clientId])

  const table = useRealtimeTable<StyleDraftRequest>({
    table: 'style_draft_requests',
    filter: clientId ? `client_id=eq.${clientId}` : undefined,
    fetch,
    enabled,
    pollMs: DRAFT_POLL_MS,
  })

  return useMemo(() => {
    const requests = table.rows.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    const latest = requests[0] ?? null
    return {
      requests,
      latest,
      drafting: latest !== null && ACTIVE_JOB_STATUSES.includes(latest.status),
      loading: table.loading,
      error: table.error,
      refresh: table.refresh,
      upsertLocal: table.upsertLocal,
    }
  }, [table.rows, table.loading, table.error, table.refresh, table.upsertLocal])
}
