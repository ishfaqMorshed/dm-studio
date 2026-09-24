import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { errorMessage, type Client, type StyleCard } from '../../lib/types'

const POLL_MS = 20_000

export interface ClientPanelData {
  client: Client | null
  /** Every Style Card version, newest first. */
  versions: StyleCard[]
  /** Highest locked version: the one new cards snapshot. */
  currentLocked: StyleCard | null
  /** Open drafts (usually one), newest first. */
  drafts: StyleCard[]
  /** True until the first load for this client id settles. */
  loading: boolean
  /** Message of the last failed load; null once a load succeeds again. */
  error: string | null
  refresh: () => Promise<void>
  /** Replace the client row after an edit or a link rotation without waiting for the poll. */
  setClient: (client: Client) => void
}

async function fetchPanel(clientId: string): Promise<{ client: Client | null; versions: StyleCard[] }> {
  const [clientRes, versionsRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
    supabase.from('style_cards').select('*').eq('client_id', clientId).order('version', { ascending: false }),
  ])
  if (clientRes.error) throw new Error(clientRes.error.message)
  if (versionsRes.error) throw new Error(versionsRes.error.message)
  return { client: clientRes.data, versions: versionsRes.data }
}

/**
 * The client row and its Style Card versions, polled every 20 s while the tab is visible
 * (neither table is in the realtime publication). Same loader shape as the Style Card page,
 * so both screens agree on what "current" and "draft" mean.
 */
export function useClientPanel(clientId: string): ClientPanelData {
  const [client, setClientState] = useState<Client | null>(null)
  const [versions, setVersions] = useState<StyleCard[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A response for a client the page has already left must not overwrite the new one.
  const activeId = useRef(clientId)
  useEffect(() => {
    activeId.current = clientId
  }, [clientId])

  const refresh = useCallback((): Promise<void> => {
    return fetchPanel(clientId)
      .then(
        (data) => {
          if (activeId.current !== clientId) return
          setClientState(data.client)
          setVersions(data.versions)
          setError(null)
        },
        (e: unknown) => {
          if (activeId.current === clientId) setError(errorMessage(e))
        },
      )
      .finally(() => {
        if (activeId.current === clientId) setLoadedFor(clientId)
      })
  }, [clientId])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [refresh])

  const setClient = useCallback((c: Client) => setClientState(c), [])

  return useMemo(() => {
    const loading = loadedFor !== clientId
    const shown = loading ? [] : versions
    return {
      client: loading ? null : client,
      versions: shown,
      currentLocked: shown.find((v) => v.status === 'locked') ?? null,
      drafts: shown.filter((v) => v.status === 'draft'),
      loading,
      error,
      refresh,
      setClient,
    }
  }, [client, versions, loadedFor, clientId, error, refresh, setClient])
}
