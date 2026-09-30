import { forwardRef, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, WandSparkles } from 'lucide-react'
import { requestStyleDraft } from '../../lib/api'
import type { StyleBrief } from '../../lib/styleBrief'
import { errorMessage, type Client, type ClientReference, type StyleCard } from '../../lib/types'
import type { StyleDraftRequestsResult } from '../../lib/useStyleDraftRequests'
import { useToast } from '../../lib/useToast'
import { STALE_MS, draftDisabledReason } from '../clientPanel/drafting'
import { n8nExecutionUrl } from '../clientPanel/links'
import { useNow } from '../card/useNow'
import { btnPrimary, btnSecondary } from '../style/classes'
import { ConfirmDialog } from '../style/ConfirmDialog'
import { formatDateTime } from '../style/format'
import { isEmptyStyleCardJson } from '../style/styleCardSchema'
import { ANALYSE_COST_LABEL, COST_SUFFIX } from './costs'
import { DraftProgress } from './DraftProgress'
import { EvidencePanel } from './EvidencePanel'
import { asOfProfilerOrder, type ProfilerOrder } from './profilerOrder'
import { StepFrame } from './StepFrame'
import { STEP_SHORT } from './steps'
import { StyleCardReadout } from './StyleCardReadout'

const RELOAD_DRAFT_AFTER_MS = 2_000

interface Props {
  client: Client
  versions: StyleCard[]
  currentLocked: StyleCard | null
  drafts: StyleCard[]
  requests: StyleDraftRequestsResult
  refs: ClientReference[]
  libraryLoading: boolean
  ordered: ProfilerOrder
  readCap: number
  brief: StyleBrief
  /** The version on show (?draft=, else the newest analysed draft). */
  selectedVersion: StyleCard | null
  onSelectVersion: (id: string) => void
  /** A request was inserted: the shell drops its ?draft= pin so the new draft shows when it lands. */
  onAnalysisStarted: () => void
  nextVersion: number
  isLead: boolean
  n8nBase: string | null | undefined
  onBack: () => void
  onContinue: () => void
  /** Reload the client's versions (after a draft lands). */
  refreshVersions: () => Promise<void>
}

/**
 * Step 3: run the profiler (one paid click) and read the result visually: swatches, the look,
 * typography, chips cross-checked against the brief, and the evidence lined up with the images.
 */
export const AnalyseStep = forwardRef<HTMLHeadingElement, Props>(function AnalyseStep(
  {
    client,
    versions,
    currentLocked,
    drafts,
    requests,
    refs,
    libraryLoading,
    ordered,
    readCap,
    brief,
    selectedVersion,
    onSelectVersion,
    onAnalysisStarted,
    nextVersion,
    isLead,
    n8nBase,
    onBack,
    onContinue,
    refreshVersions,
  },
  ref,
) {
  const toast = useToast()
  const now = useNow(60_000)
  const [requesting, setRequesting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const readCount = ordered.read.length
  const active = requests.drafting ? requests.latest : null
  const stale = active !== null && now - Date.parse(active.created_at) > STALE_MS
  const disabledReason = draftDisabledReason({
    requesting,
    libraryLoading,
    tickedCount: readCount,
    active,
    stale,
    requestsLoading: requests.loading,
  })

  const latest = requests.latest
  const failed = latest && latest.status === 'failed' ? latest : null
  const doneRequests = requests.requests.filter((r) => r.status === 'done' && r.style_card_id)
  const fromAnalysis = new Set(doneRequests.map((r) => r.style_card_id as string))

  // The request is done but its style_cards row has not reached the versions list yet.
  const latestDone = doneRequests[0] ?? null
  const missingDraft = latestDone !== null && !versions.some((v) => v.id === latestDone.style_card_id)
  const reloadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!missingDraft || !latestDone || reloadedFor.current === latestDone.id) return
    reloadedFor.current = latestDone.id
    const t = window.setTimeout(() => void refreshVersions(), RELOAD_DRAFT_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [missingDraft, latestDone, refreshVersions])

  async function analyse() {
    setConfirmOpen(false)
    setRequesting(true)
    try {
      const row = await requestStyleDraft(client.id)
      requests.upsertLocal(row)
      onAnalysisStarted()
      toast.success(`Analysing ${readCount} image${readCount === 1 ? '' : 's'}. Draft v${nextVersion} appears here by itself in about a minute.`)
    } catch (e) {
      toast.error(`Could not start the analysis: ${errorMessage(e)}`)
    } finally {
      setRequesting(false)
    }
  }

  const analyseButton = (label: string, primary = true) => (
    <button
      type="button"
      onClick={() => setConfirmOpen(true)}
      disabled={disabledReason !== null}
      title={disabledReason ?? `${ANALYSE_COST_LABEL} ${COST_SUFFIX}; writes draft v${nextVersion}`}
      className={primary ? btnPrimary : btnSecondary}
    >
      {requesting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <WandSparkles className="h-4 w-4" aria-hidden="true" />}
      {label}
    </button>
  )

  const shown = selectedVersion
  const shownEmpty = shown ? isEmptyStyleCardJson(shown.json) : false
  const analysedCount = shown ? asOfProfilerOrder(refs, readCap, shown.created_at).read.length : 0
  const superseded = shown !== null && shown.status === 'locked' && shown.id !== currentLocked?.id
  const continueReason =
    !shown || (shown.status === 'locked' && drafts.length === 0)
      ? 'Pick or create a draft first'
      : superseded
        ? `v${shown.version} was superseded${currentLocked ? ` by v${currentLocked.version}` : ''}: pick a draft or the current version`
        : shownEmpty
          ? 'This draft is empty: an empty card cannot be locked'
          : null

  const versionLabel = (v: StyleCard) =>
    [
      `v${v.version}`,
      v.status === 'locked' ? (v.id === currentLocked?.id ? 'locked · current' : 'locked · superseded') : 'draft',
      formatDateTime(v.created_at),
      fromAnalysis.has(v.id) ? 'from analysis' : null,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <StepFrame
      ref={ref}
      title="Analyse"
      pill={
        shown ? (
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
            {shown.status === 'locked' ? `v${shown.version}` : `Draft v${shown.version}`}
          </span>
        ) : undefined
      }
      subtitle={`Reads the ${readCount} ticked image${readCount === 1 ? '' : 's'} (newest first) plus your brief and writes draft v${nextVersion}. ${ANALYSE_COST_LABEL} ${COST_SUFFIX}. Usually 30–40 s.`}
      actions={
        versions.length > 0 || requests.requests.length > 0 ? (
          <span className="flex flex-wrap items-center gap-2">
            {analyseButton(`Analyse ${readCount} design${readCount === 1 ? '' : 's'}`)}
            {disabledReason && !requests.drafting && <span className="text-[11px] text-neutral-500">{disabledReason}</span>}
          </span>
        ) : undefined
      }
      onBack={onBack}
      onContinue={onContinue}
      continueLabel={shown ? (shown.status === 'locked' ? `Next: test v${shown.version}` : `Next: lock & test v${shown.version}`) : `Next: ${STEP_SHORT.test}`}
      continueDisabledReason={continueReason}
    >
      <div className="space-y-5">
        {requests.error && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-300">
            Could not load the draft requests: {requests.error}
          </p>
        )}

        {active && <DraftProgress latest={active} read={ordered.read} stale={stale} />}

        {!active && failed && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              The analysis failed ({formatDateTime(failed.created_at)})
            </p>
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
              {failed.last_error?.trim() || 'No error message was recorded.'}
            </pre>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {analyseButton('Try again')}
              {isLead && n8nExecutionUrl(n8nBase, failed.n8n_execution_id) && (
                <a
                  href={n8nExecutionUrl(n8nBase, failed.n8n_execution_id) ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs underline underline-offset-2"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  n8n run
                </a>
              )}
            </div>
          </div>
        )}

        {missingDraft && !active && (
          <p role="status" className="flex items-center gap-2 text-xs text-neutral-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Loading draft v{nextVersion}…
          </p>
        )}

        {versions.length === 0 && requests.requests.length === 0 && !active ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-10 text-center dark:border-neutral-700">
            <WandSparkles className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            <p className="text-sm font-medium">No analysis yet</p>
            <p className="max-w-sm text-xs text-neutral-500">
              The profiler reads the {readCount} ticked image{readCount === 1 ? '' : 's'} and your brief and writes the first
              Style Card draft for {client.name}.
            </p>
            {analyseButton(`Analyse ${readCount} design${readCount === 1 ? '' : 's'}`)}
            {disabledReason && <span className="text-[11px] text-neutral-500">{disabledReason}</span>}
          </div>
        ) : (
          versions.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`version-select-${client.id}`} className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Version to show
                </label>
                <select
                  id={`version-select-${client.id}`}
                  aria-label="Version to show"
                  value={shown?.id ?? ''}
                  onChange={(e) => onSelectVersion(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none ring-accent-500/25 focus:ring-4 dark:border-neutral-700 dark:bg-neutral-950 dark:ring-accent-400/30"
                >
                  {!shown && <option value="">Pick a version</option>}
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {versionLabel(v)}
                    </option>
                  ))}
                </select>
              </div>

              {shown &&
                (shownEmpty ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    This draft is empty. Analyse again, or fill it in the editor.
                  </p>
                ) : (
                  <>
                    <StyleCardReadout
                      version={shown}
                      client={client}
                      brief={brief}
                      isCurrent={shown.id === currentLocked?.id}
                      analysedCount={analysedCount}
                      actions={
                        <>
                          <Link to={`/clients/${client.id}/style?version=${encodeURIComponent(shown.id)}`} className={btnSecondary}>
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            Adjust in the editor
                          </Link>
                          <button
                            type="button"
                            onClick={() => setConfirmOpen(true)}
                            disabled={disabledReason !== null}
                            title={disabledReason ?? `Writes v${nextVersion} · ${ANALYSE_COST_LABEL} ${COST_SUFFIX}`}
                            className={btnSecondary}
                          >
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            Analyse again
                          </button>
                        </>
                      }
                    />
                    <EvidencePanel version={shown} refs={refs} readCap={readCap} />
                  </>
                ))}
            </>
          )
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Analyse ${readCount} design${readCount === 1 ? '' : 's'}?`}
        confirmLabel={`Analyse · ${ANALYSE_COST_LABEL}`}
        cancelLabel="Not now"
        busy={requesting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void analyse()}
      >
        <p>
          The profiler reads the {readCount} ticked image{readCount === 1 ? '' : 's'} and the saved brief. {ANALYSE_COST_LABEL}{' '}
          {COST_SUFFIX}.
        </p>
        <p className="mt-2">A new draft v{nextVersion} is written; nothing is locked.</p>
      </ConfirmDialog>
    </StepFrame>
  )
})
