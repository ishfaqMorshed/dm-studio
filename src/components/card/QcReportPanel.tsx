import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ExternalLink, HelpCircle, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ACTIVE_JOB_STATUSES, type Generation } from '../../lib/types'
import { JsonTree } from './JsonTree'
import { jsonToText } from './json'
import {
  VERDICT_LABEL,
  expectedSubjectOf,
  parseQcReport,
  parseStyleMatch,
  styleCheckLabel,
  styleFieldLink,
  type QcVerdict,
} from './qc'
import { VERDICT_CLASS } from './styles'
import { Badge, Panel } from './ui'

const ICON: Record<QcVerdict, React.ReactNode> = {
  pass: <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />,
  fail: <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />,
  unknown: <HelpCircle className="h-4 w-4 text-neutral-400" aria-hidden="true" />,
}

/**
 * The client id behind a generation, for the Style Card editor deep links. The caller may pass it
 * (`clientId`); otherwise it is read once from the card row (one tiny select per card).
 */
function useCardClientId(cardId: string | null, given: string | null | undefined): string | null {
  const [found, setFound] = useState<{ cardId: string; clientId: string | null } | null>(null)
  useEffect(() => {
    if (given || !cardId) return
    let live = true
    void supabase
      .from('cards')
      .select('client_id')
      .eq('id', cardId)
      .maybeSingle()
      .then(({ data }) => {
        if (live) setFound({ cardId, clientId: data?.client_id ?? null })
      })
    return () => {
      live = false
    }
  }, [cardId, given])
  if (given) return given
  return found && found.cardId === cardId ? found.clientId : null
}

/**
 * Pass/fail lines from `qc_report`, tolerant of whatever shape the judge wrote, plus the Style
 * Card verdict (`style_match`, qc-judge v2) under the violations box with a "Fix in editor" link per
 * failed check (`/clients/:id/style?version=<style_card_id>&field=<field>`). Reports written before
 * v2 show the Style Card verdict as "not reported".
 */
export function QcReportPanel({
  generation,
  clientId: givenClientId,
  collapsible,
  defaultOpen,
}: {
  generation: Generation | null
  /** The card's client; read from the card row when omitted. */
  clientId?: string | null
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const report = useMemo(() => parseQcReport(generation?.qc_report), [generation?.qc_report])
  const styleMatch = useMemo(() => parseStyleMatch(generation?.qc_report), [generation?.qc_report])
  const expectedSubject = useMemo(() => expectedSubjectOf(generation?.magic_prompt_json), [generation?.magic_prompt_json])
  const clientId = useCardClientId(generation?.card_id ?? null, givenClientId)
  const fold = { collapsible, defaultOpen }

  if (!generation) {
    return (
      <Panel title="QC report" {...fold}>
        <p className="text-sm text-neutral-500">The report appears here once an image has been judged.</p>
      </Panel>
    )
  }

  if (report.empty) {
    const running = ACTIVE_JOB_STATUSES.includes(generation.status)
    return (
      <Panel title="QC report" {...fold}>
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
  const styleFails = styleMatch?.checks.filter((c) => c.pass === false).length ?? 0
  const subjectCheck = styleMatch?.checks.find((c) => c.id === 'subject')

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
          ? `${passCount} passed · ${failCount} failed${report.checks.length - passCount - failCount ? ` · ${report.checks.length - passCount - failCount} other` : ''}`
          : undefined
      }
      tone={tone}
      {...fold}
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

      <div
        className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
          styleFails > 0 ? 'border-red-200 dark:border-red-900/60' : 'border-neutral-200 dark:border-neutral-800'
        }`}
      >
        <p className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
          <span>Style Card match</span>
          <span className="normal-case tracking-normal">
            {!styleMatch
              ? 'not reported'
              : styleMatch.score === null
                ? 'nothing reported'
                : `${styleMatch.score}% · ${styleFails ? `${styleFails} off` : 'all checks pass'}`}
          </span>
        </p>
        {!styleMatch ? (
          <p className="mt-1 text-xs text-neutral-500">
            This report was judged before the Style Card checks existed (qc-judge v2); palette, medium, typography,
            composition, subject and forbid list were not scored one by one.
          </p>
        ) : (
          <>
            <ul className="mt-1 divide-y divide-neutral-100 dark:divide-neutral-800">
              {styleMatch.checks.map((c) => {
                const verdict: QcVerdict = c.pass === true ? 'pass' : c.pass === false ? 'fail' : 'unknown'
                return (
                  <li key={c.id} className="flex items-start gap-2 py-1.5">
                    <span className="mt-0.5 shrink-0" title={c.pass === null ? 'Not reported' : VERDICT_LABEL[verdict]}>
                      {ICON[verdict]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={c.pass === false ? 'font-medium' : undefined}>
                        {styleCheckLabel(c.id)}
                        {c.field && <span className="ml-1 font-mono text-[11px] text-neutral-400">{c.field}</span>}
                      </p>
                      <p className="whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">
                        {c.note ?? (c.pass === null ? 'not reported' : '')}
                      </p>
                    </div>
                    {c.pass === false && c.field && clientId && (
                      <Link
                        to={styleFieldLink(clientId, generation.style_card_id, c.field)}
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium underline underline-offset-2 outline-none focus-visible:ring-4 focus-visible:ring-accent-500/30"
                        title={`Open the Style Card editor at ${c.field}`}
                      >
                        Fix in editor
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
            <p
              className={`mt-1.5 text-xs ${
                subjectCheck?.pass === false
                  ? 'text-red-700 dark:text-red-300'
                  : subjectCheck?.pass === true
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Subject drawn: <span className="font-medium">{styleMatch.subjectSeen ?? 'not reported'}</span>
              {expectedSubject && (
                <>
                  {' '}
                  · expected <span className="font-medium">{expectedSubject}</span>
                </>
              )}
              {styleMatch.caseSeen && <span className="text-neutral-500"> · case seen {styleMatch.caseSeen}</span>}
            </p>
          </>
        )}
      </div>

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
