import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from './types'

export interface SessionState {
  session: Session | null
  user: User | null
  /** True until the first getSession() resolves (and, when signed in, the profile has loaded). */
  loading: boolean
  /** `profiles` row for the signed-in user; null for anon or when the row is missing. */
  profile: Profile | null
  isLead: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const SessionContext = createContext<SessionState | null>(null)
