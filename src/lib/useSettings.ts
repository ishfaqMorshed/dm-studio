import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { Settings, SettingsUpdate } from './types'
import { useAuth } from './useAuth'

const POLL_MS = 20_000
const CHANGED_EVENT = 'dm-studio:settings-changed'

/**
 * The single `settings` row (id = 1): pipeline pause, per-card price, worker caps.
 * Not in the realtime publication, so it polls every 20 s; call `refresh()` after saving.
 */
export function useSettings() {
  const { user } = useAuth()
  const enabled = Boolean(user)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshing = useRef(false)

  const refresh = useCallback(async () => {
    if (!enabled || refreshing.current) return
    refreshing.current = true
    try {
      const { data, error: err } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle()
      if (err) {
        console.error('settings load failed', err)
        setError(err.message)
      } else {
        setSettings(data ?? null)
        setError(null)
      }
    } finally {
      refreshing.current = false
      setLoaded(true)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    const t = window.setInterval(() => void refresh(), POLL_MS)
    // Another instance (e.g. the Settings page) saved the row: pick it up in the same tick.
    const onChanged = (e: Event) => {
      const row = (e as CustomEvent<Settings>).detail
      if (row) setSettings(row)
      else void refresh()
    }
    window.addEventListener(CHANGED_EVENT, onChanged)
    return () => {
      window.clearInterval(t)
      window.removeEventListener(CHANGED_EVENT, onChanged)
    }
  }, [enabled, refresh])

  /** Lead-only update of the settings row; resolves with the saved row. Throws with the Postgres message. */
  const update = useCallback(async (patch: SettingsUpdate): Promise<Settings> => {
    const { data, error: err } = await supabase.from('settings').update(patch).eq('id', 1).select('*').single()
    if (err) throw new Error(err.message)
    setSettings(data)
    window.dispatchEvent(new CustomEvent<Settings>(CHANGED_EVENT, { detail: data }))
    return data
  }, [])

  const current = enabled ? settings : null

  return useMemo(
    () => ({
      settings: current,
      loading: enabled && !loaded,
      error,
      paused: current?.pipeline_paused ?? false,
      refresh,
      update,
    }),
    [current, enabled, loaded, error, refresh, update],
  )
}
