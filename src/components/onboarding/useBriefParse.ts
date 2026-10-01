import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getBriefParseRequest, requestBriefParse } from '../../lib/api'
import { readParsedBrief, type ParsedBrief } from '../../lib/styleBrief'
import { errorMessage, type BriefParseRequest } from '../../lib/types'
import { useRealtimeTable } from '../../lib/useRealtimeTable'

/** Realtime usually answers first; the poll covers a missed event. */
const PARSE_POLL_MS = 3_000
/**
 * No answer after this long: the panel says the reply is slow and offers "Stop waiting", but the row is
 * still watched and a late "done" still fills the form (a typical parse takes under 10 s).
 */
export const PARSE_SLOW_MS = 90_000
/** While slow, the poll fallback backs off (Realtime stays on). */
const PARSE_SLOW_POLL_MS = 10_000
/**
 * Only after this long does the request count as failed (latched: an answer after it is not used).
 * WF-8's worst case that still ends in "done": each model call 120 s x 2 tries + 5 s (245 s), Kie then
 * OpenRouter in Auto (490 s), plus the Supabase calls with their retries (about 145 s) = about 635 s.
 */
export const PARSE_GIVE_UP_MS = 660_000
export const PARSE_STALE_MESSAGE = `The assistant did not answer within ${Math.round(PARSE_GIVE_UP_MS / 60_000)} minutes; try again`
const NO_RESULT_MESSAGE = 'The assistant returned nothing usable; try again'
const FAILED_FALLBACK = 'Reading the brief failed; try again'

export type BriefParsePhase = 'idle' | 'starting' | 'working' | 'done' | 'failed'

export interface BriefParse {
  phase: BriefParsePhase
  /** In flight for longer than PARSE_SLOW_MS (still watched; `reset` stops waiting). */
  slow: boolean
  /** The request being watched, or the finished one; null when idle. Its `text` is what was parsed. */
  request: BriefParseRequest | null
  /** Milliseconds since Fill was pressed; 0 when idle. Ticks once a second while in flight. */
  elapsedMs: number
  /** Why the phase is failed: the insert error, the worker's last_error or the stale timeout. */
  error: string | null
  /** The validated result once done (null in every other phase). */
  result: ParsedBrief | null
  /** Paid (about $0.01): insert the request and watch it. Resolves when the insert settled, not when the parse did. */
  start: (text: string) => Promise<void>
  /** Back to idle (after Undo fill, or to clear an error). A pending insert is ignored when it lands. */
  reset: () => void
}

function isTerminal(row: BriefParseRequest | null | undefined): boolean {
  return !!row && (row.status === 'done' || row.status === 'failed')
}

/**
 * One "Fill from text" request at a time: insert, then follow the row through Realtime on
 * `brief_parse_requests` (filtered to its id) with a 3 s poll fallback until it is done or failed;
 * both stop on done / failed / give-up / reset / unmount. After 90 s without an answer `slow` turns on
 * (the poll backs off to 10 s and a late answer is still used); only after PARSE_GIVE_UP_MS (11 min,
 * above WF-8's worst case) does it read as failed, once per request, and a later answer is ignored.
 * Only rows whose id is the current request's id are ever read, so an earlier request's result is
 * never returned. Nothing here writes the client.
 */
export function useBriefParse(clientId: string): BriefParse {
  const [requestId, setRequestId] = useState<string | null>(null)
  const [row, setRow] = useState<BriefParseRequest | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [staleFor, setStaleFor] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  /** Bumped by every start and reset: an insert that lands after a newer start (or a reset) is dropped. */
  const seq = useRef(0)

  // Only the current request's row counts (the realtime table keeps its last rows across requests).
  const current = row && requestId && row.id === requestId ? row : null
  const terminal = isTerminal(current)
  // Latched: once the give-up timer fired for this request, an answer that still arrives is not used.
  const stale = requestId !== null && staleFor === requestId
  const watching = requestId !== null && !terminal && !stale
  const elapsedMs = startedAt === null ? 0 : Math.max(0, now - startedAt)
  const slow = watching && elapsedMs >= PARSE_SLOW_MS

  const fetch = useCallback(async (): Promise<BriefParseRequest[]> => {
    if (!requestId) return []
    const r = await getBriefParseRequest(requestId)
    return r ? [r] : []
  }, [requestId])

  const table = useRealtimeTable<BriefParseRequest>({
    table: 'brief_parse_requests',
    filter: requestId ? `id=eq.${requestId}` : undefined,
    fetch,
    enabled: watching,
    pollMs: slow ? PARSE_SLOW_POLL_MS : PARSE_POLL_MS,
  })

  // Our own copy: the table's rows empty once watching stops, and the final row must stay on show.
  // A row of another request is never taken, and a finished row never goes back to queued/working
  // (a slow poll answering after the realtime event).
  // Adopted during render (the pattern React recommends over an effect); converges in one pass.
  const live = requestId ? table.rows.find((r) => r.id === requestId) : undefined
  if (live && live !== row && !(row && row.id === live.id && isTerminal(row) && !isTerminal(live))) {
    setRow(live)
  }

  // The give-up timeout: once per request, measured from the moment Fill was pressed.
  useEffect(() => {
    if (!watching || !requestId || startedAt === null) return
    const id = requestId
    const t = window.setTimeout(() => setStaleFor(id), Math.max(0, startedAt + PARSE_GIVE_UP_MS - Date.now()))
    return () => window.clearTimeout(t)
  }, [watching, requestId, startedAt])

  // Tick once a second while something is in flight (the elapsed label).
  const ticking = starting || watching
  useEffect(() => {
    if (!ticking) return
    const tick = () => setNow(Date.now())
    const first = window.setTimeout(tick, 0)
    const t = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(t)
    }
  }, [ticking])

  const start = useCallback(
    async (text: string) => {
      const mine = ++seq.current
      const at = Date.now()
      setStarting(true)
      setStartError(null)
      setRequestId(null)
      setRow(null)
      setStaleFor(null)
      setStartedAt(at)
      setNow(at)
      try {
        const inserted = await requestBriefParse(clientId, text)
        if (mine !== seq.current) return
        setRow(inserted)
        setRequestId(inserted.id)
      } catch (e) {
        if (mine !== seq.current) return
        setStartError(errorMessage(e))
      } finally {
        if (mine === seq.current) setStarting(false)
      }
    },
    [clientId],
  )

  const reset = useCallback(() => {
    seq.current += 1
    setStarting(false)
    setRequestId(null)
    setRow(null)
    setStartError(null)
    setStaleFor(null)
    setStartedAt(null)
  }, [])

  const result = useMemo(() => (current && current.status === 'done' ? readParsedBrief(current.result) : null), [current])

  let phase: BriefParsePhase = 'idle'
  let error: string | null = null
  if (starting) {
    phase = 'starting'
  } else if (startError) {
    phase = 'failed'
    error = startError
  } else if (stale) {
    phase = 'failed'
    error = PARSE_STALE_MESSAGE
  } else if (current && current.status === 'failed') {
    phase = 'failed'
    error = current.last_error?.trim() || FAILED_FALLBACK
  } else if (current && current.status === 'done') {
    if (result) phase = 'done'
    else {
      phase = 'failed'
      error = NO_RESULT_MESSAGE
    }
  } else if (requestId) {
    phase = 'working'
  }

  return {
    phase,
    slow: phase === 'working' && slow,
    request: current,
    elapsedMs,
    error,
    result: phase === 'done' ? result : null,
    start,
    reset,
  }
}
