import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { clearSignedUrlCache } from './signedUrls'
import { SessionContext, type SessionState } from './sessionContext'
import type { Profile } from './types'

interface LoadedProfile {
  uid: string
  profile: Profile | null
}

/**
 * Holds the auth session and the staff profile for the whole app so pages never
 * re-fetch them. Consume through `useAuth()` and `useProfile()`.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [loadedProfile, setLoadedProfile] = useState<LoadedProfile | null>(null)
  // Guards against duplicate fetches (StrictMode double effects, token refresh events).
  const inflightFor = useRef<string | null>(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setSessionLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setSessionLoading(false)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id ?? null

  const loadProfile = useCallback(async (uid: string) => {
    inflightFor.current = uid
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle()
      if (error) throw error
      setLoadedProfile({ uid, profile: data ?? null })
    } catch (e) {
      console.error('profile load failed', e)
      setLoadedProfile({ uid, profile: null })
    } finally {
      if (inflightFor.current === uid) inflightFor.current = null
    }
  }, [])

  const loadedUid = loadedProfile?.uid ?? null

  useEffect(() => {
    if (!userId || loadedUid === userId || inflightFor.current === userId) return
    void loadProfile(userId)
  }, [userId, loadedUid, loadProfile])

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId)
  }, [userId, loadProfile])

  const signOut = useCallback(async () => {
    clearSignedUrlCache()
    await supabase.auth.signOut()
  }, [])

  const profile = userId && loadedUid === userId ? loadedProfile?.profile ?? null : null
  const loading = sessionLoading || (userId !== null && loadedUid !== userId)

  const value = useMemo<SessionState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      profile,
      isLead: profile?.role === 'lead',
      signOut,
      refreshProfile,
    }),
    [session, loading, profile, signOut, refreshProfile],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
