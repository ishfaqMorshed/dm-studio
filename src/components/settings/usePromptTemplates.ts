import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useProfile } from '../../lib/useProfile'
import type { PromptTemplate } from '../../lib/types'

export interface TemplateGroup {
  slug: string
  active: PromptTemplate | null
  /** Newest version first. */
  versions: PromptTemplate[]
  nextVersion: number
}

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

const NOT_ALLOWED = 'Nothing changed: only a lead can change prompt templates.'

/**
 * Every prompt template grouped by slug, plus the two lead mutations.
 * `prompt_templates` is not in the realtime publication, so call `refresh()` after writes.
 */
export function usePromptTemplates() {
  const { userId } = useProfile()
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [names, setNames] = useState<Map<string, string>>(() => new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    (): Promise<void> =>
      Promise.all([
        supabase.from('prompt_templates').select('*').order('slug').order('version', { ascending: false }),
        supabase.from('profiles').select('user_id, display_name'),
      ]).then(([t, p]) => {
        if (t.error) {
          setError(t.error.message)
        } else {
          setTemplates(t.data)
          setError(null)
        }
        // Names are decoration for "activated by"; a failure here just falls back to the id.
        if (!p.error) setNames(new Map(p.data.map((r) => [r.user_id, r.display_name])))
        setLoading(false)
      }),
    [],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  const groups = useMemo<TemplateGroup[]>(() => {
    const bySlug = new Map<string, PromptTemplate[]>()
    for (const t of templates) {
      const list = bySlug.get(t.slug)
      if (list) list.push(t)
      else bySlug.set(t.slug, [t])
    }
    return [...bySlug.entries()]
      .map(([slug, list]) => {
        const versions = [...list].sort((a, b) => b.version - a.version)
        return {
          slug,
          versions,
          active: versions.find((v) => v.active) ?? null,
          nextVersion: versions.length ? versions[0].version + 1 : 1,
        }
      })
      .sort((a, b) => a.slug.localeCompare(b.slug))
  }, [templates])

  const nameOf = useCallback(
    (uid: string | null): string | null => (uid ? (names.get(uid) ?? `${uid.slice(0, 8)}…`) : null),
    [names],
  )

  /**
   * Makes `target` the active version of its slug. The partial unique index allows one
   * active row per slug, so the current one is switched off first; if switching the new
   * one on then fails, the previous one is restored so workers never find no template.
   */
  const activate = useCallback(
    async (target: PromptTemplate) => {
      const current = templates.find((t) => t.slug === target.slug && t.active && t.id !== target.id) ?? null
      if (current) {
        const off = await supabase.from('prompt_templates').update({ active: false }).eq('id', current.id).select('id')
        if (off.error) throw new Error(off.error.message)
        if (!off.data.length) throw new Error(NOT_ALLOWED)
      }
      const on = await supabase
        .from('prompt_templates')
        .update({ active: true, activated_by: userId, activated_at: new Date().toISOString() })
        .eq('id', target.id)
        .select('id')
      if (on.error || !on.data.length) {
        if (current) await supabase.from('prompt_templates').update({ active: true }).eq('id', current.id)
        throw new Error(on.error ? on.error.message : NOT_ALLOWED)
      }
      await refresh()
    },
    [templates, userId, refresh],
  )

  /** Inserts `body` as the next version of `slug` (or v1 of a new slug), inactive. */
  const createVersion = useCallback(
    async (slug: string, body: string): Promise<PromptTemplate> => {
      const clean = slug.trim()
      const existing = templates.filter((t) => t.slug === clean).map((t) => t.version)
      const version = (existing.length ? Math.max(...existing) : 0) + 1
      const res = await supabase
        .from('prompt_templates')
        .insert({ slug: clean, version, body, active: false })
        .select('*')
        .single()
      if (res.error) {
        throw new Error(
          res.error.code === '23505'
            ? `${clean} v${version} already exists — someone added a version at the same time. Refresh and try again.`
            : res.error.message,
        )
      }
      await refresh()
      return res.data
    },
    [templates, refresh],
  )

  return { groups, loading, error, refresh, activate, createVersion, nameOf }
}
