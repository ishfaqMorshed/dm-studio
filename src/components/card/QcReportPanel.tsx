import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react'
import { ACTIVE_JOB_STATUSES, type Generation } from '../../lib/types'
import { JsonTree } from './JsonTree'
import { jsonToText } from './json'
import { VERDICT_LABEL, parseQcReport, type QcVerdict } from './qc'
import { VERDICT_CLASS } from './styles'
import { Badge, Panel } from './ui'

const ICON: Record<QcVerdict, React.ReactNode> = {
  pass: <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />,
  fail: <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />,
  unknown: <HelpCircle className="h-4 w-4 text-neutral-400" aria-hidden="true" />,
}

/** Pass/fail lines from `qc_report`, tolerant of whatever shape the judge wrote. */
export function QcReportPanel({ generation }: { generation: Generation | null }) {
  const report = useMemo(() => parseQcReport(generation?.qc_report), [generation?.qc_report])

  if (!generation) {
    return (
      <Panel title="QC report">
        <p className="text-sm text-neutral-500">The report appears here once an image has been judged.</p>
      </Panel>
    )
  }

  if (report.empty) {
    const running = ACTIVE_JOB_STATUSES.includes(generation.status)
    return (
      <Panel title="QC report">
        <p className="text-sm text-neutral-500">
          {running
            ? 'QC runs right after the image is generated.'
            : generation.status === 'failed'
              ? 'QC did not run — the generation failed.'
              : 'No QC report was stored for this generation.'}
        </p>
      </Panel>
    )
  }

  const failCount = report.checks.filter((c) => c.verdict === 'fail').length
  const passCount = report.checks.filter((c) => c.verdict === 'pass').length
  const tone = report.overall === 'fail' ? 'bad' : report.overall === 'warn' ? 'warn' : report.overall === 'pass' ? 'good' : 'neutral'

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          QC report
          <Badge className={VERDICT_CLASS[report.overall]}>{VERDICT_LABEL[report.overall]}</Badge>
          {report.needsRegen === true && (
            <Badge className={VERDICT_CLASS.warn} title="The judge asked for an automatic corrective regeneration">
              auto-regen requested
            </Badge>
          )}
        </span>
      }
      subtitle={
        report.checks.length
          ? `${passCount} passed · ${failCount} failed${report.checks.length - passCount - failCount ? ` · ${report.checks.length - passCount - failCount} other` : ''} — read this before the image`
          : undefined
      }
      tone={tone}
    >
      {report.summary && <p className="mb-3 text-sm">{report.summary}</p>}

      {report.instruction && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="text-xs font-medium uppercase tracking-wide">Corrective instruction</p>
          <p className="mt-0.5 whitespace-pre-wrap">{report.instruction}</p>
        </div>
      )}

      {report.checks.length > 0 && (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {report.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 py-1.5 text-sm">
              <span className="mt-0.5 shrink-0" title={VERDICT_LABEL[c.verdict]}>
                {ICON[c.verdict]}
              </span>
              <div className="min-w-0 flex-1">
                <p className={c.verdict === 'fail' ? 'font-medium' : undefined}>
                  {c.index !== null && <span className="mr-1 tabular-nums text-neutral-400">{c.index}.</span>}
                  {c.label}
                  {c.score !== null && <span className="ml-1 text-xs text-neutral-500">({c.score})</span>}
                </p>
                {c.note && <p className="whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">{c.note}</p>}
              </div>
              <span className="sr-only">{VERDICT_LABEL[c.verdict]}</span>
            </li>
          ))}
        </ul>
      )}

      {report.violations.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="text-xs font-medium uppercase tracking-wide">Style Card rules violated</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {report.violations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </div>
      )}

      {report.extras.length > 0 && (
        <div className="mt-3">
          <JsonTree value={Object.fromEntries(report.extras)} />
        </div>
      )}

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-neutral-500">Raw report</summary>
        <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-neutral-100 p-2 dark:bg-neutral-800">{jsonToText(generation.qc_report)}</pre>
      </details>
    </Panel>
  )
}
