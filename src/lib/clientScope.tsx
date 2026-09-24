import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from './supabase'
import type { Client } from './types'
import { useAuth } from './useAuth'
import { useRealtimeTable } from './useRealtimeTable'
import { CLIENT_SCOPE_PARAM, CLIENT_SCOPE_STORAGE_KEY, ClientScopeContext, type ClientScope } from './useClientScope'

function readStored(): string | null {
  try {
    const v = window.localStorage.getItem(CLIENT_SCOPE_STORAGE_KEY)
    return v && v.trim() ? v : null
  } catch {
    return null
  }
}

function writeStored(id: string | null) {
  try {
    if (id) window.localStorage.setItem(CLIENT_SCOPE_STORAGE_KEY, id)
    else window.localStorage.removeItem(CLIENT_SCOPE_STORAGE_KEY)
  } catch {
    // Private mode or blocked storage: the URL param still carries the selection.
  }
}

/**
 * Holds the header's client selection for the whole staff app.
 * Source of truth order on load: `?client=` in the URL, then localStorage, then All clients.
 * Every change is written to both, and the URL param follows the selection across pages.
 * Selecting a client that is no longer active falls back to All clients once the list loads.
 */
export function ClientScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlClient = searchParams.get(CLIENT_SCOPE_PARAM)

  const [selectedClientId, setSelected] = useState<string | null>(() => urlClient || readStored())
  // The last value we ourselves put in the URL; a different value means someone navigated/pasted a link.
  const writtenToUrl = useRef<string | null>(urlClient || null)

  const fetchClients = useCallback(async (): Promise<Client[]> => {
    const { data, error } = await supabase.from('clients').select('*').eq('active', true).order('name')
    if (error) throw error
    return data
  }, [])

  const table = useRealtimeTable<Client>({
    table: 'clients',
    fetch: fetchClients,
    enabled: Boolean(user),
    // Clients change rarely; the poll only exists because `clients` may sit outside the realtime publication.
    pollMs: 60_000,
    // A client deactivated or renamed still matches the select; the debounced refetch drops inactive ones.
  })

  const clients = useMemo(
    () => table.rows.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name)),
    [table.rows],
  )

  const select = useCallback(
    (id: string | null) => {
      const next = id && id.trim() ? id : null
      setSelected(next)
      writeStored(next)
      writtenToUrl.current = next
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev)
          if (next) sp.set(CLIENT_SCOPE_PARAM, next)
          else sp.delete(CLIENT_SCOPE_PARAM)
          return sp
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // Someone changed ?client= without going through `select` (pasted link, back button): adopt it.
  useEffect(() => {
    if (urlClient && urlClient !== writtenToUrl.current) {
      writtenToUrl.current = urlClient
      setSelected(urlClient)
      writeStored(urlClient)
    }
  }, [urlClient])


  const value = useMemo<ClientScope>(() => {
    const selectedClient = selectedClientId ? clients.find((c) => c.id === selectedClientId) ?? null : null
    // A remembered client that is no longer active (or was deleted) behaves as All clients; the next
    // pick overwrites the stale value in storage. While the list loads, trust the remembered id.
    const effectiveId = selectedClientId && (table.loading || selectedClient) ? selectedClientId : null
    return {
      selectedClientId: effectiveId,
      selectedClient,
      clients,
      loading: table.loading,
      setSelectedClientId: select,
      inScope: (clientId: string) => effectiveId === null || clientId === effectiveId,
    }
  }, [selectedClientId, clients, table.loading, select])

  // Page navigation dropped the param (Links do not carry it): put it back so the URL stays shareable.
  const effectiveId = value.selectedClientId
  useEffect(() => {
    if (effectiveId && !urlClient) {
      writtenToUrl.current = effectiveId
      setSearchParams(
        (prev) => {
          const sp = new URLSearchParams(prev)
          sp.set(CLIENT_SCOPE_PARAM, effectiveId)
          return sp
        },
        { replace: true },
      )
    }
  }, [effectiveId, urlClient, setSearchParams])

  return <ClientScopeContext.Provider value={value}>{children}</ClientScopeContext.Provider>
}
