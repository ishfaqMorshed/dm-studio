import { createContext, useContext } from 'react'
import type { Client } from './types'

/** localStorage key that remembers the header's client selection (`null` = All clients). */
export const CLIENT_SCOPE_STORAGE_KEY = 'dm-studio.client'
/** URL search param mirrored with the selection, so a pasted link opens the same view. */
export const CLIENT_SCOPE_PARAM = 'client'

export interface ClientScope {
  /** Selected client id, or null for "All clients". */
  selectedClientId: string | null
  /** The selected client's row once the list has loaded; null for All clients or unknown id. */
  selectedClient: Client | null
  /** Active clients, sorted by name. Loaded once, kept fresh by Realtime + poll. */
  clients: Client[]
  /** True until the client list has loaded the first time. */
  loading: boolean
  /** Sets the header selection (null = All clients); persists it and updates ?client=. */
  setSelectedClientId: (id: string | null) => void
  /** True when `clientId` is in scope (always true for All clients). */
  inScope: (clientId: string) => boolean
}

export const ClientScopeContext = createContext<ClientScope | null>(null)

/**
 * The header's client selector. Every staff page filters through it: board, completed, card lists.
 * Must be used inside `<ClientScopeProvider>` (App mounts it inside the auth gate).
 */
export function useClientScope(): ClientScope {
  const ctx = useContext(ClientScopeContext)
  if (!ctx) throw new Error('useClientScope must be used inside <ClientScopeProvider>')
  return ctx
}
