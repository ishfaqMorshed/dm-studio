import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../lib/useToast'
import { errorMessage, type DesignLesson } from '../../lib/types'

type Filter = 'proposed' | 'active' | 'all'

const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium outline-none ring-neutral-900/10 hover:bg-neutral-100 focus-visible:ring-4 disabled:opacity-40 dark:border-neutral-700 dark:ring-white/20 dark:hover:bg-neutral-800'

function when(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? iso : new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Lessons the nightly WF-7 run distils from designer rejections. They arrive inactive;
 * a lead turns a lesson on here, and from then the prompt engine adds it to every prompt
 * for that client (or every client, for global lessons).
 */
export function LessonsPanel() {
  const toast = useToast()
  const [lessons, setLessons] = useState<DesignLesson[]>([])
  const [clientNames, setClientNames] = useState<Map<string, string>>(() => new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('proposed')
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(
    (): Promise<void> =>
      Promise.all([
        supabase.from('design_lessons').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('id, name'),
      ]).then(([l, c]) => {
        if (l.error) setError(l.error.message)
        else {
          setLessons(l.data)
          setError(null)
        }
        if (!c.error) setClientNames(new Map(c.data.map((r) => [r.id, r.name])))
        setLoading(false)
      }),
    [],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  const shown = useMemo(
    () => lessons.filter((l) => (filter === 'all' ? true : filter === 'active' ? l.active : !l.active)),
    [lessons, filter],
  )
  const proposedCount = lessons.filter((l) => !l.active).length

  const setActive = async (lesson: DesignLesson, active: boolean) => {
    setBusyId(lesson.id)
    const { error: err } = await supabase.from('design_lessons').update({ active }).eq('id', lesson.id)
    setBusyId(null)
    if (err) return toast.error(errorMessage(err))
    toast.success(active ? 'Lesson turned on. New prompts for this client include it.' : 'Lesson turned off.')
    void refresh()
  }

  const remove = async (lesson: DesignLesson) => {
    if (!window.confirm('Delete this lesson? This cannot be undone.')) return
    setBusyId(lesson.id)
    const { error: err } = await supabase.from('design_lessons').delete().eq('id', lesson.id)
    setBusyId(null)
    if (err) return toast.error(errorMessage(err))
    toast.success('Lesson deleted.')
    void refresh()
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Lessons</h2>
          <p className="max-w-prose text-sm text-neutral-500">
            Rules the nightly run learns from rejections. They arrive switched off. Turn one on and every new prompt for that
            client includes it.
          </p>
        </div>
        <button type="button" className={secondaryBtn} onClick={() => void refresh()} aria-label="Reload lessons">
          <RefreshCw className="h-3.5 w-3.5" /> Reload
        </button>
      </div>

      <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Filter lessons">
        {(['proposed', 'active', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={
              'rounded-full px-3 py-1 text-xs font-medium outline-none focus-visible:ring-4 ' +
              (filter === f
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800')
            }
          >
            {f === 'proposed' ? `Proposed (${proposedCount})` : f === 'active' ? 'On' : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-neutral-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">Could not load lessons: {error}</p>
      ) : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          {filter === 'proposed'
            ? 'No proposed lessons. The nightly run adds them after designers reject generations with a reason.'
            : 'Nothing here yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {shown.map((l) => (
            <li key={l.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">
                    {l.client_id ? clientNames.get(l.client_id) ?? 'Unknown client' : 'All clients'}
                  </span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">{l.category}</span>
                  <span>{when(l.created_at)}</span>
                  {l.active && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> On
                    </span>
                  )}
                </div>
                <p className="text-sm">{l.rule}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={busyId === l.id}
                  onClick={() => void setActive(l, !l.active)}
                >
                  {busyId === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {l.active ? 'Turn off' : 'Turn on'}
                </button>
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={busyId === l.id}
                  onClick={() => void remove(l)}
                  aria-label="Delete lesson"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
