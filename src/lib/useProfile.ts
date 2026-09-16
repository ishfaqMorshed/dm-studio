import { useContext } from 'react'
import { SessionContext } from './sessionContext'

/**
 * The signed-in designer's profile and role.
 * `isLead` gates Settings, force moves and the n8n execution link.
 */
export function useProfile() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useProfile must be used inside <SessionProvider>')
  const { profile, isLead, loading, user, refreshProfile } = ctx
  return {
    userId: user?.id ?? null,
    profile,
    isLead,
    displayName: profile?.display_name ?? user?.email ?? null,
    loading,
    refreshProfile,
  }
}
