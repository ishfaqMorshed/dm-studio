import { useContext } from 'react'
import { SessionContext } from './sessionContext'

/** Session + user + signOut. Must be used inside `<SessionProvider>` (App does this). */
export function useAuth() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useAuth must be used inside <SessionProvider>')
  const { session, user, loading, signOut } = ctx
  return { session, user, loading, signOut }
}
