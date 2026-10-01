import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export interface ActiveTemplates {
  /** slug -> active version number; null until the first read lands. */
  versions: ReadonlyMap<string, number> | null
  error: string | null
}

/**
 * The active version of each listed prompt template (`prompt_templates` where active), read once:
 * the Analyse confirm dialog states which templates the run will use (spec 4.2), truthfully both
 * today (style_profiler v2) and after R1 (style_sheet v1 + style_profiler v3).
 */
export function useActiveTemplates(slugs: readonly string[]): ActiveTemplates {
  const key = slugs.join(',')
  const [state, setState] = useState<ActiveTemplates>({ versions: null, error: null })

  useEffect(() => {
    let live = true
    void supabase
      .from('prompt_templates')
      .select('slug, version')
      .eq('active', true)
      .in('slug', key.split(',').filter(Boolean))
      .then(({ data, error }) => {
        if (!live) return
        if (error) setState({ versions: new Map(), error: error.message })
        else setState({ versions: new Map(data.map((t) => [t.slug, t.version])), error: null })
      })
    return () => {
      live = false
    }
  }, [key])

  return state
}

/** "style_sheet v1 + style_profiler v3" for the slugs that have an active version, in the given order. */
export function templatesLine(slugs: readonly string[], versions: ReadonlyMap<string, number> | null): string | null {
  if (!versions) return null
  const parts = slugs.filter((s) => versions.has(s)).map((s) => `${s} v${versions.get(s)}`)
  return parts.length ? parts.join(' + ') : null
}
