import { useCallback, useEffect, useRef, useState } from 'react'
import { startBrief, type BriefStart } from '../../lib/api'
import { errorMessage } from '../../lib/types'
import { parseTimestamp } from './text'

export type GrantState =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; grant: BriefStart }

export type RestartResult = { ok: true } | { ok: false; message: string }

export interface BriefGrant {
  state: GrantState
  /** `expires_at` as epoch ms, or null when the backend sent nothing usable. */
  expiresAt: number | null
  /** The upload window has closed: the timer ran out or storage refused an upload. */
  expired: boolean
  /** A fresh `start_brief` is in flight. The form stays mounted with its values. */
  restarting: boolean
  /** Opens a new window (new card id). The caller decides what to toast. */
  restart: () => Promise<RestartResult>
  /** Re-run the initial start after a transient failure on the invalid screen. */
  retry: () => void
  /** Storage or `submit_brief` said the window is gone before the local timer did. */
  markExpired: () => void
  /** `submit_brief` said the link itself is dead. */
  markInvalid: (message: string) => void
}

const LINK_DEAD = /invalid or expired form link|not valid|missing its token/i

/**
 * Resolves the form token with `start_brief` once per token (StrictMode-safe), tracks the
 * 15-minute upload window and hands out fresh windows on demand.
 */
export function useBriefGrant(token: string | undefined): BriefGrant {
  const [state, setState] = useState<GrantState>(
    token ? { kind: 'loading' } : { kind: 'invalid', message: 'This link is missing its token.' },
  )
  const [expired, setExpired] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const startedFor = useRef<string | null>(null)

  const initial = useCallback(async (tok: string) => {
    setState({ kind: 'loading' })
    try {
      const grant = await startBrief(tok)
      setExpired(false)
      setState({ kind: 'ready', grant })
    } catch (e) {
      setState({ kind: 'invalid', message: errorMessage(e, 'This link is not valid') })
    }
  }, [])

  useEffect(() => {
    if (!token || startedFor.current === token) return
    startedFor.current = token
    void initial(token)
  }, [token, initial])

  const retry = useCallback(() => {
    if (token) void initial(token)
  }, [token, initial])

  const restart = useCallback(async (): Promise<RestartResult> => {
    if (!token) return { ok: false, message: 'This link is missing its token.' }
    setRestarting(true)
    try {
      const grant = await startBrief(token)
      setExpired(false)
      setState({ kind: 'ready', grant })
      return { ok: true }
    } catch (e) {
      const message = errorMessage(e, 'Could not open a new session')
      if (LINK_DEAD.test(message)) setState({ kind: 'invalid', message })
      return { ok: false, message }
    } finally {
      setRestarting(false)
    }
  }, [token])

  const expiresAt = state.kind === 'ready' ? parseTimestamp(state.grant.expires_at) : null

  useEffect(() => {
    if (expiresAt === null) return
    // A window that is already past fires on the next tick; never set state synchronously here.
    const id = window.setTimeout(() => setExpired(true), Math.max(0, expiresAt - Date.now()))
    return () => window.clearTimeout(id)
  }, [expiresAt])

  const markExpired = useCallback(() => setExpired(true), [])
  const markInvalid = useCallback((message: string) => setState({ kind: 'invalid', message }), [])

  return { state, expiresAt, expired, restarting, restart, retry, markExpired, markInvalid }
}
