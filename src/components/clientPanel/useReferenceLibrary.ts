import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addClientReferences, deleteClientReference, listClientReferences } from '../../lib/api'
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
}

/** The client's reference library (client_references rows), with upload and delete. */
export function useReferenceLibrary(clientId: string): ReferenceLibrary {
  const [refs, setRefs] = useState<ClientReference[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const activeId = useRef(clientId)
  useEffect(() => {
    activeId.current = clientId
  }, [clientId])

  const refresh = useCallback((): Promise<void> => {
    return listClientReferences(clientId)
      .then(
        (rows) => {
          if (activeId.current !== clientId) return
          setRefs(rows)
          setError(null)
        },
        (e: unknown) => {
          if (activeId.current === clientId) setError(errorMessage(e))
        },
      )
      .finally(() => {
        if (activeId.current === clientId) setLoadedFor(clientId)
      })
  }, [clientId])

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
      try {
        const rows = await addClientReferences(clientId, files)
        setRefs((prev) => {
          const known = new Set(prev.map((r) => r.id))
          return [...prev, ...rows.filter((r) => !known.has(r.id))]
        })
        return rows
      } finally {
        setUploading(false)
      }
    },
    [clientId],
  )

  const remove = useCallback(async (row: ClientReference): Promise<void> => {
    setRemovingId(row.id)
    try {
      await deleteClientReference(row)
      setRefs((prev) => prev.filter((r) => r.id !== row.id))
    } finally {
      setRemovingId(null)
    }
  }, [])

  const loading = loadedFor !== clientId
  return useMemo(
    () => ({ refs: loading ? [] : refs, loading, error, refresh, uploading, add, removingId, remove }),
    [refs, loading, error, refresh, uploading, add, removingId, remove],
  )
}
