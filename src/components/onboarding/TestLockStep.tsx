import { forwardRef, useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ExternalLink, History, Info, Loader2, Lock, RefreshCw, Sparkles } from 'lucide-react'
import { lockStyleCard, type TestCard } from '../../lib/api'
import { parseStyleBrief } from '../../lib/styleBrief'
import { GENS_BUCKET } from '../../lib/supabase'
import { errorMessage, type Client, type ClientReference, type Settings, type StyleCard } from '../../lib/types'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { useToast } from '../../lib/useToast'
import { STAGE_LABEL } from '../../lib/stage'
import { VERDICT_LABEL, qcVerdict } from '../card/qc'
import { VERDICT_CLASS, checkerboard } from '../card/styles'
import { btnPrimary, btnSecondary } from '../style/classes'
import { formatDateTime } from '../style/format'
import { isValidHex, normalizeStyleCard, styleCardIssues } from '../style/styleCardSchema'
import { ANALYSE_COST_LABEL, TEST_RENDER_COST_LABEL } from './costs'
import { asOfProfilerOrder } from './profilerOrder'
import { RenderProgress } from './RenderProgress'
import { StepFrame } from './StepFrame'
import { STEP_LABEL } from './steps'
import { artworkLine, readReferenceIds } from './styleCardRead'
import { AMBER_RING } from './StyleCardReadout'
import { testCardVersion } from './testRenderInput'
import { TestRenderDialog, type TestRenderDialogMode, type TestRenderDraft } from './TestRenderDialog'
import { TestRenderResult } from './TestRenderResult'
import type { StyleTestCards } from './useStyleTestCards'
import { TEST_ACTIVE_STAGES, type TestRender } from './useTestRender'
import { lowAgreementCount, lowAgreementNote, readValidation } from './validation'
import { ValidationChips } from './ValidationChips'

interface Props {
  client: Client
  settings: Settings | null
  /** The version on show: a draft to lock and test, or an already-locked one. */
  draft: StyleCard | null
  currentLocked: StyleCard | null
  /** Every version of the client, to name the one a running card renders with. */
  versions: StyleCard[]
  /** Ticked images in profiler order (the as-of count and the reference preview fall back to it without `refs`). */
  read: ClientReference[]
  /** The whole library: the images a version was analysed from are reconstructed as of its timestamp, and the test render's references are previewed from it. */
  refs?: readonly ClientReference[]
  /** min(16, settings.max_style_refs): how many images the profiler reads. */
  readCap?: number
  tests: StyleTestCards
  /** The render state machine (owned by the wizard shell so it keeps running across steps). */
  render: TestRender
  isLead: boolean
  onBack: () => void
  /** Reload the versions after a lock. */
  refreshVersions: () => Promise<void>
  /** A lock happened here: the shell pins the URL to that version so the reload does not move to another draft. */
  onLocked: (version: StyleCard) => void
}

const emptyBox = 'flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-8 text-center dark:border-neutral-700'

/**
 * Step 4, Lock & test: a draft is locked first, then one paid test render with the locked version,
 * so what the designer judges is exactly what every new brief gets. A locked version renders again
 * as often as needed; a superseded one only points at the current version. Every paid call sits
 * behind a dialog that names the cost, and the lock never happens twice from here.
 */
export const TestLockStep = forwardRef<HTMLHeadingElement, Props>(function TestLockStep(
  { client, settings, draft, currentLocked, versions, read, refs, readCap, tests, render, isLead, onBack, refreshVersions, onLocked },
  ref,
) {
  const toast = useToast()
  const [dialog, setDialog] = useState<TestRenderDialogMode | null>(null)
  const [locking, setLocking] = useState(false)
  /** The row lock_style_card returned, until refreshVersions() brings the locked version back as `draft`. */
  const [lockedNow, setLockedNow] = useState<StyleCard | null>(null)

  // The step heading, kept locally as well as forwarded: after a paid action the dialog's opener is
  // gone (the step re-rendered into another state), so focus moves here instead of falling to <body>.
  const heading = useRef<HTMLHeadingElement | null>(null)
  const setHeading = useCallback(
    (el: HTMLHeadingElement | null) => {
      heading.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )

  const doc = useMemo(() => (draft ? normalizeStyleCard(draft.json) : null), [draft])
  // The shared rules with the saved brief and the client's garments: the blocking list gates the lock (spec 7).
  const brief = useMemo(() => parseStyleBrief(client.style_brief), [client.style_brief])
  const issues = useMemo(
    () => (doc ? styleCardIssues(doc, brief, client.garment_colors) : { blocking: [], warnings: [] }),
    [doc, brief, client.garment_colors],
  )
  const validation = useMemo(() => (doc ? readValidation(doc, brief, client.garment_colors) : null), [doc, brief, client.garment_colors])
  // The chips show the module's validation (stored by the run, else computed here) plus the lines only the
  // lock gate knows: pending fixes, fields below 60% agreement, rules that differ from the saved brief (spec 7).
  const chips = useMemo(
    () => (validation ? { ...validation, warnings: [...new Set([...validation.warnings, ...issues.warnings])] } : null),
    [validation, issues.warnings],
  )
  const library = refs ?? read
  // "Add more designs and analyse again": fewer than 5 images analysed, or more than 3 fields the designs disagree about.
  // N = the run's reference_ids, else the library as it stood when the version was created (the readout's rule).
  const analysedN = doc && draft ? readReferenceIds(doc.extra).length || asOfProfilerOrder(library, readCap ?? 16, draft.created_at).read.length : 0
  const lowN = doc ? lowAgreementCount(doc) : 0
  const lookNote = doc ? lowAgreementNote(doc, ['medium', 'realism', 'linework', 'shading', 'shading_method', 'texture', 'edge_finish'], analysedN) : null

  if (!draft) {
    return (
      <StepFrame ref={setHeading} title={STEP_LABEL.test} onBack={onBack}>
        <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800/60">Pick a draft in step 3 first.</p>
      </StepFrame>
    )
  }

  // The version on show (a const, so the closures below keep it narrowed): the locked row once the
  // versions reloaded, else the one the lock returned, else the draft.
  const justLocked = lockedNow && lockedNow.id === draft.id ? lockedNow : null
  const version: StyleCard = draft.status === 'locked' ? draft : justLocked ?? draft
  const isLocked = version.status === 'locked'
  const ready = tests.rows.find((r) => r.stage === 'needs_review' && r.style_card_version === version.version) ?? null
  const active = render.card && (TEST_ACTIVE_STAGES.includes(render.card.stage) || render.card.stage === 'failed') ? render.card : null
  /** The version the shown card renders with (the one approve_card is sent), not necessarily the version on show. */
  const activeVersion = active ? testCardVersion(active, versions, version) : version.version
  const paused = settings?.pipeline_paused ?? false
  const editorHref = `/clients/${client.id}/style?version=${encodeURIComponent(version.id)}`

  // "Blocked" reasons hold whatever the pipeline is doing; they are shown inside the dialog and checked
  // again on confirm. "Disabled" adds the running render, for the buttons that open the dialog.
  const renderBlockedReason = paused
    ? 'Pipeline paused by the lead'
    : !client.active
      ? 'Inactive client: test renders are refused. A lead can reactivate the client with Edit.'
      : read.length === 0
        ? 'Tick at least one image first (the render attaches up to 3 of them as references)'
        : null
  const renderDisabledReason = renderBlockedReason ?? (render.busy ? 'A test render is already running' : null)
  // The draft's single action locks and renders, so it needs both to be possible; a blocking schema
  // issue would make the locked card wrong forever.
  const lockBlockedReason = renderBlockedReason ?? (issues.blocking.length ? issues.blocking[0] : null)
  const lockDisabledReason = lockBlockedReason ?? (render.busy ? 'A test render is already running' : null)

  /** Close the dialog after a paid action; its opener is unmounted by now, so the step heading takes focus. */
  function closeAfterAction() {
    setDialog(null)
    heading.current?.focus()
  }

  /** Lock the draft, then start the render with the locked version. The lock happens at most once. */
  async function lockAndRender(input: TestRenderDraft, note: string) {
    if (locking || isLocked) return
    // Every way into the dialog is gated on this reason; the confirm checks it once more so a
    // draft with a blocking issue is never locked, whichever button opened the dialog.
    if (lockDisabledReason) {
      toast.error(lockDisabledReason)
      return
    }
    setLocking(true)
    let locked: StyleCard
    try {
      locked = await lockStyleCard(version.id, note.trim() || null)
    } catch (e) {
      toast.error(`Lock failed: ${errorMessage(e)}`)
      setLocking(false)
      return
    }
    setLockedNow(locked)
    setLocking(false)
    toast.success(`v${locked.version} locked. Every new brief for ${client.name} uses it.`)
    onLocked(locked)
    void refreshVersions()
    // Whatever happens now, the version is locked: a failed start shows its error and "Test render" in the locked view.
    await render.start({ subject: input.subject, lines: input.lines, styleCardId: locked.id })
    closeAfterAction()
  }

  function startRender(input: TestRenderDraft) {
    if (renderDisabledReason) {
      toast.error(renderDisabledReason)
      return
    }
    void render.start({ subject: input.subject, lines: input.lines, styleCardId: version.id }).then(closeAfterAction)
  }

  // A locked version that is no longer the current one (an old ?draft= link, or v1 picked in step 3).
  if (isLocked && !justLocked && currentLocked && version.id !== currentLocked.id) {
    return (
      <StepFrame ref={setHeading} title={STEP_LABEL.test} onBack={onBack}>
        <div className="rounded-xl bg-neutral-100 px-4 py-5 text-center dark:bg-neutral-800/60">
          <History className="mx-auto mb-2 h-8 w-8 text-neutral-500" aria-hidden="true" />
          <p className="text-base font-semibold">
            v{version.version} was superseded by v{currentLocked.version}; select the current version.
          </p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
            v{version.version} was locked {formatDateTime(version.locked_at)}
            {version.note ? ` (${version.note})` : ''}. Every new brief for {client.name} uses v{currentLocked.version}; cards already
            generated keep the version they were made with.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to={`/clients/${client.id}/onboard?step=test&draft=${encodeURIComponent(currentLocked.id)}`} className={btnPrimary}>
              Show v{currentLocked.version}
            </Link>
            <Link to={editorHref} className={btnSecondary}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open v{version.version} in the editor
            </Link>
          </div>
        </div>
      </StepFrame>
    )
  }

  const editorLink = (
    <Link to={editorHref} className={btnSecondary}>
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
      Adjust in the editor
    </Link>
  )
  const moreDesigns =
    doc && (analysedN < 5 || lowN > 3) ? (
      <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {analysedN < 5
            ? `Only ${analysedN} image${analysedN === 1 ? ' was' : 's were'} analysed for v${version.version}`
            : `${lowN} fields of v${version.version} are below 60% agreement across the analysed designs`}
          .{' '}
          <Link to={`/clients/${client.id}/onboard?step=designs`} className="font-medium underline underline-offset-2">
            Add more designs and analyse again ({ANALYSE_COST_LABEL})
          </Link>{' '}
          for a firmer Style Card.
        </span>
      </p>
    ) : null
  const doneLink = (
    <Link to={`/clients/${client.id}`} className={btnPrimary}>
      Done
    </Link>
  )

  const progress = active && (
    <RenderProgress
      card={active}
      phase={render.phase}
      version={activeVersion}
      approveError={render.approveError}
      approving={render.approving}
      retrying={render.retrying}
      isLead={isLead}
      n8nBase={settings?.n8n_base_url}
      onGenerateNow={() => setDialog('generate')}
      onRetry={() => void render.retry(active)}
      onNewRender={() => setDialog(isLocked ? 'render' : 'lock_render')}
      newRenderDisabledReason={isLocked ? renderDisabledReason : lockDisabledReason}
      onSkip={render.dismiss}
    />
  )

  let body
  if (isLocked) {
    const renderAgain = (
      <button
        type="button"
        onClick={() => setDialog('render')}
        disabled={renderDisabledReason !== null || render.starting}
        title={renderDisabledReason ?? `Another test render with v${version.version} · ${TEST_RENDER_COST_LABEL}`}
        className={btnSecondary}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Render again · {TEST_RENDER_COST_LABEL}
      </button>
    )
    body = (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/40">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              v{version.version} locked {formatDateTime(version.locked_at)} — every new brief for {client.name} uses it.
            </p>
            <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-300/80">
              {version.note ? `${version.note} · ` : ''}Cards already generated keep the version they were made with.
            </p>
          </div>
        </div>

        {moreDesigns}

        {render.startError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Could not start the test render: {render.startError}. v{version.version} stays locked; try again below.
            </span>
          </p>
        )}

        {active ? (
          <>
            {progress}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {editorLink}
              {doneLink}
            </div>
          </>
        ) : ready ? (
          <TestRenderResult
            key={ready.id}
            card={ready}
            versions={versions}
            actions={
              <>
                {renderAgain}
                {editorLink}
                {doneLink}
              </>
            }
          />
        ) : (
          <div className={emptyBox}>
            <Sparkles className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            <p className="text-sm font-medium">No test render for v{version.version} yet</p>
            <p className="max-w-sm text-xs text-neutral-500">
              One new design of a Style Card subject in this look, with your text on it, rendered with locked v{version.version}:
              exactly what every new brief for {client.name} gets. Hidden from the board; nothing reaches the client.
            </p>
            <button
              type="button"
              onClick={() => setDialog('render')}
              disabled={renderDisabledReason !== null || render.starting}
              title={renderDisabledReason ?? undefined}
              className={btnPrimary}
            >
              {render.starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              Test render · {TEST_RENDER_COST_LABEL}
            </button>
            {renderDisabledReason && <p className="text-[11px] text-neutral-500">{renderDisabledReason}</p>}
            <div className="flex flex-wrap justify-center gap-2">
              {editorLink}
              {doneLink}
            </div>
          </div>
        )}
      </div>
    )
  } else {
    const lockButton = (
      <button
        type="button"
        onClick={() => setDialog('lock_render')}
        disabled={lockDisabledReason !== null || locking || render.starting}
        title={lockDisabledReason ?? `Make v${version.version} the contract for every new brief, then render with it`}
        className={btnPrimary}
      >
        {locking || render.starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
        Lock v{version.version} & test render · {TEST_RENDER_COST_LABEL}
      </button>
    )
    body = (
      <div className="space-y-4">
        {/* Draft strip */}
        {doc && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
            <ul className="flex -space-x-1" aria-label="Palette">
              {doc.palette.slice(0, 5).map((p, i) => (
                <li
                  key={`${p.hex}-${i}`}
                  title={`${p.name || 'unnamed'} ${p.hex}`}
                  className="h-6 w-6 rounded-full border-2 border-white dark:border-neutral-900"
                  style={{ backgroundColor: isValidHex(p.hex) ? p.hex.trim() : '#808080' }}
                >
                  <span className="sr-only">
                    {p.name || 'unnamed'}, {p.hex}
                  </span>
                </li>
              ))}
            </ul>
            <p
              className="min-w-0 flex-1 truncate text-xs text-neutral-600 dark:text-neutral-300"
              title={lookNote ? `${artworkLine(doc)} · ${lookNote}` : artworkLine(doc)}
            >
              {lookNote ? (
                <span className={AMBER_RING}>
                  {artworkLine(doc) || 'No medium, linework, shading or texture recorded.'}
                  <span className="sr-only"> ({lookNote})</span>
                </span>
              ) : (
                artworkLine(doc) || 'No medium, linework, shading or texture recorded.'
              )}
            </p>
          </div>
        )}

        {currentLocked && (
          <p className="flex items-start gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              v{currentLocked.version} is locked today. Locking v{version.version} supersedes it for every new brief; cards
              already generated keep v{currentLocked.version}.
            </span>
          </p>
        )}

        {issues.blocking.length > 0 && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {issues.blocking.join(' ')}{' '}
              <Link to={editorHref} className="font-medium underline underline-offset-2">
                Fix it in the editor
              </Link>
              .
            </span>
          </p>
        )}

        {chips && <ValidationChips validation={chips} clientId={client.id} versionId={version.id} warningsOnly />}

        {moreDesigns}

        {active ? (
          <>
            {progress}
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
              <p className="text-[11px] text-neutral-500">
                {render.busy
                  ? activeVersion !== version.version
                    ? `This render uses v${activeVersion}. Wait for it or skip it, then lock v${version.version}.`
                    : `This render was started before v${version.version} was locked. Wait for it or skip it, then lock v${version.version}.`
                  : `Lock v${version.version} and render with it: the design you judge is the design every new brief gets.`}
              </p>
              {lockButton}
            </div>
          </>
        ) : (
          <div className={emptyBox}>
            <Lock className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            <p className="text-sm font-medium">Lock v{version.version}, then see it on one new design</p>
            <p className="max-w-sm text-xs text-neutral-500">
              v{version.version} is locked first, so the render is exactly what every new brief for {client.name} gets. Not right?
              Adjust in the editor and lock the next version.
            </p>
            {lockButton}
            {lockDisabledReason && <p className="text-[11px] text-neutral-500">{lockDisabledReason}</p>}
          </div>
        )}
      </div>
    )
  }

  return (
    <StepFrame
      ref={setHeading}
      title={STEP_LABEL.test}
      tone={isLocked ? 'good' : 'neutral'}
      pill={
        isLocked ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
            v{version.version} locked
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
            Draft v{version.version}
          </span>
        )
      }
      subtitle={
        isLocked
          ? `Judge v${version.version} on one new design: it is exactly what every new brief for ${client.name} gets.`
          : `Lock v${version.version} first, then see one new design in this look. The render is exactly what every new brief for ${client.name} gets.`
      }
      onBack={onBack}
    >
      <div className="space-y-4">
        {body}

        {tests.error && (
          <p role="alert" className="text-xs text-red-700 dark:text-red-300">
            Could not load the test renders: {tests.error}
          </p>
        )}

        {/* Previous renders */}
        {tests.rows.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Previous test renders</p>
            <ul className="flex flex-wrap gap-2" aria-label="Previous test renders">
              {tests.rows.slice(0, 5).map((c) => (
                <TestRenderThumb key={c.id} card={c} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {dialog && (
        <TestRenderDialog
          open
          client={client}
          version={dialog === 'generate' ? activeVersion : version.version}
          subjects={doc?.subjects ?? []}
          read={read}
          library={library}
          settings={settings}
          doc={doc}
          warnings={dialog === 'lock_render' ? issues.warnings : []}
          mode={dialog}
          card={dialog === 'generate' ? render.card : null}
          blockedReason={dialog === 'lock_render' ? lockBlockedReason : dialog === 'render' ? renderBlockedReason : null}
          busy={locking || render.starting || render.approving}
          onCancel={() => setDialog(null)}
          onConfirm={(input, note) => {
            if (dialog === 'generate') {
              const target = render.card
              if (target) void render.generateNow(target).then(closeAfterAction)
            } else if (dialog === 'lock_render') {
              void lockAndRender(input, note)
            } else {
              startRender(input)
            }
          }}
        />
      )}
    </StepFrame>
  )
})

/** 64 px tile of one earlier test render, linking to its card. */
function TestRenderThumb({ card }: { card: TestCard }) {
  const gen = card.current_generation ?? null
  const image = useSignedUrl(GENS_BUCKET, gen?.image_path, gen?.updated_at)
  const verdict = qcVerdict(gen?.qc_report)
  const running = TEST_ACTIVE_STAGES.includes(card.stage)
  const label = `Test render with v${card.style_card_version ?? '?'} · ${verdict ? `QC ${VERDICT_LABEL[verdict]}` : STAGE_LABEL[card.stage]} · ${formatDateTime(card.created_at)}`
  return (
    <li>
      <Link
        to={`/card/${card.id}`}
        title={label}
        aria-label={label}
        className="block w-16 rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-accent-500/30"
      >
        <span className={`relative block h-16 w-16 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800 ${checkerboard}`}>
          {gen?.image_path && image.url ? (
            <img src={image.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : running ? (
            <span className="flex h-full w-full items-center justify-center text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            </span>
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">No image</span>
          )}
          {card.style_card_version !== null && (
            <span className="absolute left-1 top-1 rounded-full bg-neutral-900/80 px-1.5 text-[10px] font-medium text-white">v{card.style_card_version}</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-neutral-500">
          {verdict ? (
            <span className={`rounded px-1 ${VERDICT_CLASS[verdict]}`}>QC {VERDICT_LABEL[verdict]}</span>
          ) : (
            STAGE_LABEL[card.stage]
          )}
        </span>
      </Link>
    </li>
  )
}
