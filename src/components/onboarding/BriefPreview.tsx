import type { ReactNode } from 'react'
import type { StyleBrief } from '../../lib/styleBrief'
import { parseReferenceMeta, type Client, type ClientReference } from '../../lib/types'
import { ANALYSE_COST_LABEL, COST_SUFFIX } from './costs'

/**
 * What the profiler is about to receive, line by line, inside the Analyse confirm dialog (spec 4.2):
 * the brief as saved (not the form), the client's garments, the counts, the active templates and the
 * cost. A line that reads "not given" is red: the brief gate stops the paid call, so this is the last
 * place to notice. Labels end in a colon ("Subjects:") so the dialog text reads as the spec states it.
 */
export function BriefPreview({
  brief,
  client,
  read,
  templates,
}: {
  brief: StyleBrief
  client: Client
  read: readonly ClientReference[]
  /** "style_sheet v1 + style_profiler v3" from the active prompt_templates; null while loading, '' when none is readable. */
  templates: string | null
}) {
  const n = read.length
  const tagged = read.filter((r) => {
    const m = parseReferenceMeta(r.meta)
    return m.kind !== null || m.garment !== null || m.best_for.length > 0 || m.outlier
  }).length
  const noted = read.filter((r) => Boolean(r.note?.trim())).length
  const list = (xs: readonly string[]) => (xs.length ? xs.join(', ') : null)

  const rows: Array<[string, string | null]> = [
    ['Niche / audience', [brief.niche.trim(), brief.audience.trim()].filter(Boolean).join(' / ') || null],
    ['Subjects', list(brief.subjects)],
    ['Brand text', list(brief.brand_text)],
    ['Garments', list(client.garment_colors)],
  ]

  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs" aria-label="What the profiler receives">
      {rows.map(([k, v]) => (
        <Row key={k} label={k}>
          {v ?? <span className="font-medium text-red-700 dark:text-red-300">not given</span>}
        </Row>
      ))}
      <Row label="Must-have">
        {brief.must_have.length} · <span className="text-neutral-500">Never</span> {brief.avoid.length}
      </Row>
      <Row label="Images">
        {n} image{n === 1 ? '' : 's'} ({tagged} tagged, {noted} with notes)
      </Row>
      <Row label="Templates">
        {templates === null ? (
          <span className="text-neutral-400">reading…</span>
        ) : templates === '' ? (
          <span className="font-medium text-red-700 dark:text-red-300">no active template readable</span>
        ) : (
          templates
        )}
      </Row>
      <Row label="Cost">
        {ANALYSE_COST_LABEL} {COST_SUFFIX}
      </Row>
    </dl>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-neutral-500">{label}:</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}
