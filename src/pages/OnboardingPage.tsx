import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { briefSummary, isBriefEmpty, parseStyleBrief } from '../lib/styleBrief'
import { useProfile } from '../lib/useProfile'
import { useSettings } from '../lib/useSettings'
import { useStyleDraftRequests } from '../lib/useStyleDraftRequests'
import { useToast } from '../lib/useToast'
import { ClientLoadState } from '../components/clientPanel/ClientLoadState'
import { LIBRARY_FALLBACK_MAX } from '../components/clientPanel/libraryFiles'
import { useClientPanel } from '../components/clientPanel/useClientPanel'
import { useReferenceLibrary } from '../components/clientPanel/useReferenceLibrary'
import { useRefreshOnDraftDone } from '../components/clientPanel/useRefreshOnDraftDone'
import { qcVerdict, VERDICT_LABEL } from '../components/card/qc'
import { AnalyseStep } from '../components/onboarding/AnalyseStep'
import { BriefStep } from '../components/onboarding/BriefStep'
import { DesignsStep } from '../components/onboarding/DesignsStep'
import { profilerOrder } from '../components/onboarding/profilerOrder'
import { firstIncompleteStep, isStepId, nextStep, prevStep, stepSummaries, type StepId, type StepSummaryData } from '../components/onboarding/steps'
import { TestLockStep } from '../components/onboarding/TestLockStep'
import { useStyleTestCards } from '../components/onboarding/useStyleTestCards'
import { useTestRender } from '../components/onboarding/useTestRender'
import { WizardProgress } from '../components/onboarding/WizardProgress'
import { ConfirmDialog } from '../components/style/ConfirmDialog'
import { formatDateTime } from '../components/style/format'

/**
 * /clients/:id/onboard — the guided onboarding: drop the designs → written brief → analyse →
 * test & lock. Each step also works on its own later (re-analyse after adding images, test
 * another draft). URL state: ?step= and ?draft=<style_card_id>. Keyed on the client id.
 */
export default function OnboardingPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return <Onboarding key={id} clientId={id} />
}

function Onboarding({ clientId }: { clientId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const toast = useToast()
  const { isLead } = useProfile()
  const { settings } = useSettings()
  const panel = useClientPanel(clientId)
  const library = useReferenceLibrary(clientId)
  const requests = useStyleDraftRequests(clientId)
  const tests = useStyleTestCards(clientId)
  useRefreshOnDraftDone(requests, panel.refresh)

  const [briefDirty, setBriefDirty] = useState(false)
  const [pendingStep, setPendingStep] = useState<StepId | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const client = panel.client
  const readCap = Math.min(16, settings?.max_style_refs ?? LIBRARY_FALLBACK_MAX)
  const cap = settings?.max_style_refs ?? LIBRARY_FALLBACK_MAX
  const ordered = useMemo(() => profilerOrder(library.refs, readCap), [library.refs, readCap])
  const tickedCount = ordered.read.length + ordered.tiles.filter((t) => t.state === 'over_cap').length
  const brief = useMemo(() => parseStyleBrief(client?.style_brief), [client?.style_brief])
  const briefEmpty = isBriefEmpty(client?.style_brief)

  // The version on show in steps 3 and 4.
  const draftParam = searchParams.get('draft')
  const selectedVersion = useMemo(() => {
    const byParam = draftParam ? panel.versions.find((v) => v.id === draftParam) : null
    if (byParam) return byParam
    const newestDone = requests.requests.find((r) => r.status === 'done' && r.style_card_id)
    const fromRequest = newestDone ? panel.versions.find((v) => v.id === newestDone.style_card_id) : null
    return fromRequest ?? panel.drafts[0] ?? null
  }, [draftParam, panel.versions, panel.drafts, requests.requests])
  const nextVersion = (panel.versions[0]?.version ?? 0) + 1

  // The test-render state machine lives here so an approve still fires from another step and a
  // skipped card stays skipped while the wizard is open.
  const onRenderError = useCallback((m: string) => toast.error(m), [toast])
  const render = useTestRender({ clientId, draft: selectedVersion, tests, onError: onRenderError })

  // Step from the URL; a fresh visit lands on the first incomplete step once the data is here.
  const stepParam = searchParams.get('step')
  const urlStepValid = isStepId(stepParam)
  const dataReady = !panel.loading && !library.loading && !requests.loading
  const step: StepId = isStepId(stepParam)
    ? stepParam
    : firstIncompleteStep({ tickedCount, briefEmpty, hasDraft: panel.drafts.length > 0 || selectedVersion !== null })
  useEffect(() => {
    if (!dataReady || isStepId(stepParam) || !client) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('step', step)
        return next
      },
      { replace: true },
    )
  }, [dataReady, stepParam, step, client, setSearchParams])

  const writeStep = useCallback(
    (next: StepId) => {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev)
        p.set('step', next)
        return p
      })
    },
    [setSearchParams],
  )

  /** Moves to a step; asks first when the brief has unsaved edits (unless `force`). */
  function goToStep(next: StepId, force = false) {
    if (next === step) return
    if (briefDirty && !force) setPendingStep(next)
    else writeStep(next)
  }

  const selectVersion = useCallback(
    (versionId: string) => {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev)
        p.set('draft', versionId)
        return p
      })
    },
    [setSearchParams],
  )

  /** A new analysis was started: drop the ?draft= pin so the newest analysed draft shows when it lands. */
  const clearDraftPin = useCallback(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.delete('draft')
        return p
      },
      { replace: true },
    )
  }, [setSearchParams])

  // Focus the step heading on a step change (not on first paint, and not while the URL step is
  // still being decided from the loading data).
  const prevStepRef = useRef<StepId | null>(null)
  useEffect(() => {
    if (!urlStepValid) return
    if (prevStepRef.current !== null && prevStepRef.current !== step) headingRef.current?.focus()
    prevStepRef.current = step
  }, [step, urlStepValid])

  // Leaving the tab with unsaved brief edits asks first.
  useEffect(() => {
    if (!briefDirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [briefDirty])

  const onDirtyChange = useCallback((d: boolean) => setBriefDirty(d), [])

  // Progress header summaries (persisted data only; the live "m:ss" ticks inside the header).
  const readyTest = selectedVersion
    ? tests.rows.find((r) => r.stage === 'needs_review' && r.style_card_version === selectedVersion.version) ?? null
    : null
  const failedTest = tests.rows[0]?.stage === 'failed' ? tests.rows[0] : null
  const readyVerdict = readyTest ? qcVerdict(readyTest.current_generation?.qc_report) : null
  let testState: StepSummaryData['test'] = 'none'
  if (render.phase === 'failed') testState = 'failed'
  else if (render.stuck) testState = 'stuck'
  else if (render.phase === 'needs_generate') testState = 'waiting'
  else if (render.busy) testState = 'rendering'
  else if (readyTest) testState = 'rendered'
  else if (failedTest) testState = 'failed'
  const steps = stepSummaries({
    active: step,
    libraryLoading: library.loading,
    tickedCount,
    totalCount: library.refs.length,
    briefEmpty,
    briefText: client ? briefSummary(brief, client.default_similarity_tier) : '',
    briefDirty,
    draft: selectedVersion
      ? {
          version: selectedVersion.version,
          created_at: selectedVersion.created_at,
          locked: selectedVersion.status === 'locked',
          superseded: selectedVersion.status === 'locked' && selectedVersion.id !== panel.currentLocked?.id,
        }
      : null,
    analysingSince: requests.drafting && requests.latest ? requests.latest.created_at : null,
    analysisFailed: requests.latest?.status === 'failed',
    lockedVersion: panel.currentLocked?.version ?? null,
    test: testState,
    renderingSince: render.busy && render.card ? render.card.created_at : null,
    testVerdict: readyVerdict ? `QC ${VERDICT_LABEL[readyVerdict].toLowerCase()}` : null,
  })

  // Without a ?step= the landing step depends on the library and the requests too: wait for
  // them rather than flashing step 1 and moving focus a moment later.
  const showLoading = panel.loading || (!urlStepValid && !dataReady && client !== null)
  const loadState = <ClientLoadState loading={showLoading} error={panel.error} client={client} onRetry={() => void panel.refresh()} />
  if (showLoading || !client) return loadState

  const back = prevStep(step)
  const forward = nextStep(step)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/clients/${client.id}`}
            className="inline-flex items-center gap-1 rounded text-xs text-neutral-500 outline-none ring-neutral-900/10 hover:text-neutral-900 focus-visible:ring-4 dark:ring-white/20 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {client.name}
          </Link>
          <h1 className="mt-1 truncate text-xl font-semibold">Onboard {client.name}</h1>
        </div>
        {panel.currentLocked ? (
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Current: v{panel.currentLocked.version}, locked {formatDateTime(panel.currentLocked.locked_at)}
          </p>
        ) : (
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            No locked Style Card. Cards for {client.name} cannot be approved until one is locked.
          </p>
        )}
      </div>

      {!client.active && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Inactive client: the analysis works, but test renders are refused until a lead reactivates the client.</span>
        </p>
      )}

      {panel.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          Refresh failed: {panel.error}. Showing the last loaded data.
        </p>
      )}

      <WizardProgress steps={steps} onSelect={(id) => goToStep(id)} />

      {step === 'designs' && (
        <DesignsStep
          ref={headingRef}
          client={client}
          library={library}
          cap={cap}
          readCap={readCap}
          ordered={ordered}
          isLead={isLead}
          onContinue={() => forward && goToStep(forward)}
        />
      )}
      {step === 'brief' && (
        <BriefStep
          ref={headingRef}
          client={client}
          isLead={isLead}
          selectedDraft={selectedVersion && selectedVersion.status === 'draft' ? selectedVersion : null}
          onSaved={panel.setClient}
          onDirtyChange={onDirtyChange}
          onBack={() => back && goToStep(back)}
          onContinue={() => forward && goToStep(forward, true)}
        />
      )}
      {step === 'analyse' && (
        <AnalyseStep
          ref={headingRef}
          client={client}
          versions={panel.versions}
          currentLocked={panel.currentLocked}
          drafts={panel.drafts}
          requests={requests}
          refs={library.refs}
          libraryLoading={library.loading}
          ordered={ordered}
          readCap={readCap}
          brief={brief}
          selectedVersion={selectedVersion}
          onSelectVersion={selectVersion}
          onAnalysisStarted={clearDraftPin}
          nextVersion={nextVersion}
          isLead={isLead}
          n8nBase={settings?.n8n_base_url}
          onBack={() => back && goToStep(back)}
          onContinue={() => {
            if (!forward) return
            // Carry the shown version into step 4 explicitly.
            setSearchParams((prev) => {
              const p = new URLSearchParams(prev)
              p.set('step', forward)
              if (selectedVersion) p.set('draft', selectedVersion.id)
              return p
            })
          }}
          refreshVersions={panel.refresh}
        />
      )}
      {step === 'test' && (
        <TestLockStep
          ref={headingRef}
          client={client}
          settings={settings}
          draft={selectedVersion}
          currentLocked={panel.currentLocked}
          read={ordered.read}
          tests={tests}
          render={render}
          isLead={isLead}
          onBack={() => back && goToStep(back)}
          refreshVersions={panel.refresh}
        />
      )}

      <ConfirmDialog
        open={pendingStep !== null}
        title="Discard unsaved brief changes?"
        confirmLabel="Discard and switch"
        cancelLabel="Keep editing"
        tone="danger"
        onCancel={() => setPendingStep(null)}
        onConfirm={() => {
          if (pendingStep) writeStep(pendingStep)
          setBriefDirty(false)
          setPendingStep(null)
        }}
      >
        The brief has edits that are not saved. Switching steps throws them away.
      </ConfirmDialog>
    </div>
  )
}
