import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addClientReferences, deleteClientReference, listClientReferences, updateClientReference } from '../../lib/api'
import { errorMessage, type ClientReference } from '../../lib/types'

/** `client_references` is not in the realtime publication; a poll keeps a teammate's uploads visible. */
const POLL_MS = 30_000

export interface ReferenceLibrary {
  /** Upload order, oldest first. */
  refs: ClientReference[]
  /** True until the first load for this client settles. */
  loading: boolean
  /** Message of the last failed load; null once a load succeeds again. */
  error: string | null
  refresh: () => Promise<void>
  /** True while an upload batch runs. */
  uploading: boolean
  /** Uploads the files and registers them; resolves with the new rows. Throws with a readable message. */
  add: (files: File[]) => Promise<ClientReference[]>
  /** Id of the image being removed, if any. */
  removingId: string | null
  /** Removes the storage object and the row. Throws with a readable message. */
  remove: (row: ClientReference) => Promise<void>
  /** Id of the image whose note / tick is being saved, if any. */
  updatingId: string | null
  /**
   * Saves a note and/or the excluded flag. Optimistic: the row updates at once and is put
   * back if the write fails (the error is rethrown with a readable message).
   */
  update: (row: ClientReference, patch: { note?: string | null; excluded?: boolean }) => Promise<ClientReference>
}

/** The client's reference library (client_references rows), with upload and delete. */
export function useReferenceLibrary(clientId: string): ReferenceLibrary {
  const [refs, setRefs] = useState<ClientReference[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const activeId = useRef(clientId)
  useEffect(() => {
    activeId.current = clientId
  }, [clientId])
  /**
   * Bumped when a local write (add / remove / update) starts and when it settles. A poll that
   * started before or during a write may carry rows from before it, so its result is dropped
   * instead of overwriting the optimistic state; one refresh is re-run once the write settles.
   */
  const writeSeq = useRef(0)
  const latestRefresh = useRef(0)
  const droppedPoll = useRef(false)

  const refresh = useCallback((): Promise<void> => {
    const myId = ++latestRefresh.current
    const writesBefore = writeSeq.current
    return listClientReferences(clientId).then(
      (rows) => {
        if (activeId.current !== clientId) return
        // A newer refresh supersedes this one (it settles `loading` when it lands).
        if (myId !== latestRefresh.current) return
        // A write since this poll started makes its rows stale: keep the optimistic state.
        if (writeSeq.current !== writesBefore) {
          droppedPoll.current = true
          setLoadedFor(clientId)
          return
        }
        setRefs(rows)
        setError(null)
        setLoadedFor(clientId)
      },
      (e: unknown) => {
        if (activeId.current !== clientId) return
        setError(errorMessage(e))
        setLoadedFor(clientId)
      },
    )
  }, [clientId])

  const beginWrite = useCallback(() => {
    writeSeq.current += 1
  }, [])
  const settleWrite = useCallback(() => {
    writeSeq.current += 1
    if (droppedPoll.current) {
      droppedPoll.current = false
      void refresh()
    }
  }, [refresh])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [refresh])

  const add = useCallback(
    async (files: File[]): Promise<ClientReference[]> => {
      if (files.length === 0) return []
      setUploading(true)
      beginWrite()
      try {
        const rows = await addClientReferences(clientId, files)
        setRefs((prev) => {
          const known = new Set(prev.map((r) => r.id))
          return [...prev, ...rows.filter((r) => !known.has(r.id))]
        })
        return rows
      } finally {
        setUploading(false)
        settleWrite()
      }
    },
    [clientId, beginWrite, settleWrite],
  )

  const remove = useCallback(
    async (row: ClientReference): Promise<void> => {
      setRemovingId(row.id)
      beginWrite()
      try {
        await deleteClientReference(row)
        setRefs((prev) => prev.filter((r) => r.id !== row.id))
      } finally {
        setRemovingId(null)
        settleWrite()
      }
    },
    [beginWrite, settleWrite],
  )

  const update = useCallback(
    async (row: ClientReference, patch: { note?: string | null; excluded?: boolean }): Promise<ClientReference> => {
      setUpdatingId(row.id)
      beginWrite()
      setRefs((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...patch } : r)))
      try {
        const saved = await updateClientReference(row.id, patch)
        setRefs((prev) => prev.map((r) => (r.id === row.id ? saved : r)))
        return saved
      } catch (e) {
        setRefs((prev) => prev.map((r) => (r.id === row.id ? row : r)))
        throw e
      } finally {
        setUpdatingId((id) => (id === row.id ? null : id))
        settleWrite()
      }
    },
    [beginWrite, settleWrite],
  )

  const loading = loadedFor !== clientId
  return useMemo(
    () => ({ refs: loading ? [] : refs, loading, error, refresh, uploading, add, removingId, remove, updatingId, update }),
    [refs, loading, error, refresh, uploading, add, removingId, remove, updatingId, update],
  )
}
