import { useEffect, useMemo, useRef } from 'react'
import type { StyleDraftRequestsResult } from '../../lib/useStyleDraftRequests'

/**
 * A finished draft request is a new `style_cards` row, which the panel loader does not watch.
 * Whenever the set of done requests changes after the first load, `refresh()` reloads the
 * client's versions so the new draft shows up without waiting for the 20 s poll.
 */
export function useRefreshOnDraftDone(requests: StyleDraftRequestsResult, refresh: () => Promise<void>): void {
  const doneKey = useMemo(
    () =>
      requests.requests
        .filter((r) => r.status === 'done')
        .map((r) => r.id)
        .sort()
        .join(','),
    [requests.requests],
  )
  const seenDone = useRef<string | null>(null)
  useEffect(() => {
    if (requests.loading) return
    if (seenDone.current !== null && doneKey !== seenDone.current) void refresh()
    seenDone.current = doneKey
  }, [doneKey, requests.loading, refresh])
}
