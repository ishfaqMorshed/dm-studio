import { forwardRef, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ExternalLink, History, Info, Loader2, Lock, Sparkles } from 'lucide-react'
import { lockStyleCard, type TestCard } from '../../lib/api'
import { GENS_BUCKET } from '../../lib/supabase'
import { errorMessage, type Client, type ClientReference, type Settings, type StyleCard } from '../../lib/types'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { useToast } from '../../lib/useToast'
import { STAGE_LABEL } from '../../lib/stage'
import { VERDICT_LABEL, qcVerdict } from '../card/qc'
import { VERDICT_CLASS, checkerboard } from '../card/styles'
import { btnPrimary, btnSecondary } from '../style/classes'
import { formatDateTime } from '../style/format'
import { LockDialog } from '../style/LockDialog'
import { isValidHex, normalizeStyleCard, styleCardIssues } from '../style/styleCardSchema'
import { TEST_RENDER_COST_LABEL } from './costs'
import { RenderProgress } from './RenderProgress'
import { StepFrame } from './StepFrame'
import { artworkLine } from './styleCardRead'
import { TestRenderDialog } from './TestRenderDialog'
import { TestRenderResult } from './TestRenderResult'
import type { StyleTestCards } from './useStyleTestCards'
import { TEST_ACTIVE_STAGES, type TestRender } from './useTestRender'

interface Props {
  client: Client
  settings: Settings | null
  /** The version on show: a draft to test and lock, or an already-locked one (success state). */
  draft: StyleCard | null
  currentLocked: StyleCard | null
  /** Ticked images in profiler order (the render takes the newest 3). */
  read: ClientReference[]
  tests: StyleTestCards
  /** The render state machine (owned by the wizard shell so it keeps running across steps). */
  render: TestRender
  isLead: boolean
  onBack: () => void
  /** Reload the versions after a lock. */
  refreshVersions: () => Promise<void>
}

/**
 * Step 4: one paid test render with the draft, then Lock. Every paid call sits behind a dialog
 * that names the cost. Lock is always reachable (a running, stuck or review-stage test card never
 * blocks it). Locking creates the next version; older cards keep the version they used.
 */
export const TestLockStep = forwardRef<HTMLHeadingElement, Props>(function TestLockStep(
  { client, settings, draft, currentLocked, read, tests, render, isLead, onBack, refreshVersions },
  ref,
) {
  const toast = useToast()
  const [dialog, setDialog] = useState<'render' | 'generate' | 'lock' | 'lock_untested' | null>(null)
  const [locking, setLocking] = useState(false)
  const [lockedNow, setLockedNow] = useState<StyleCard | null>(null)

  const doc = useMemo(() => (draft ? normalizeStyleCard(draft.json) : null), [draft])
  const issues = useMemo(() => (doc ? styleCardIssues(doc) : { blocking: [], warnings: [] }), [doc])

  if (!draft) {
    return (
      <StepFrame ref={ref} title="Test & lock" onBack={onBack}>
        <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800/60">Pick a draft in step 3 first.</p>
      </StepFrame>
    )
  }

  // Narrowed copy for the closures below (a destructured parameter does not stay narrowed inside them).
  const shown: StyleCard = draft
  const isLocked = draft.status === 'locked'
  const ready = tests.rows.find((r) => r.stage === 'needs_review' && r.style_card_version === draft.version) ?? null
  const active = render.card && (TEST_ACTIVE_STAGES.includes(render.card.stage) || render.card.stage === 'failed') ? render.card : null
  const paused = settings?.pipeline_paused ?? false

  const renderDisabledReason = paused
    ? 'Pipeline paused by the lead'
    : !client.active
      ? 'Inactive client: test renders are refused. A lead can reactivate the client with Edit.'
      : read.length === 0
        ? 'Tick at least one image first (the render uses the newest 3)'
        : render.busy
          ? 'A test render is already running'
          : isLocked
            ? 'This version is locked; test renders are for drafts'
            : null

  const lockDisabledReason = isLocked ? 'Already locked' : locking ? 'Locking…' : issues.blocking.length ? issues.blocking[0] : null

  async function lock(note: string) {
    setLocking(true)
    try {
      const locked = await lockStyleCard(shown.id, note.trim() || null)
      setDialog(null)
      if (locked.locked_at && shown.locked_at && locked.locked_at === shown.locked_at) {
        toast.success(`v${locked.version} was already locked`)
      } else {
        toast.success(`v${locked.version} locked. Every new brief for ${client.name} uses it.`)
      }
      setLockedNow(locked)
      await refreshVersions()
    } catch (e) {
      toast.error(`Lock failed: ${errorMessage(e)}`)
    } finally {
      setLocking(false)
    }
  }

  // Without a finished render for this draft the dialog carries the "analysis alone" warning.
  const lockButton = (
    <button
      type="button"
      onClick={() => setDialog(ready ? 'lock' : 'lock_untested')}
      disabled={lockDisabledReason !== null}
      title={lockDisabledReason ?? `Make v${draft.version} the contract for every new brief`}
      className={btnPrimary}
    >
      {locking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
      Lock this Style Card
    </button>
  )

  // Success state: the version on show is locked (just now, or ?draft= points at a locked one).
  if (isLocked || lockedNow) {
    const v = lockedNow ?? draft
    // A locked version that is no longer the current one (an old ?draft= link, or v1 picked in step 3).
    const superseded = !lockedNow && currentLocked !== null && v.id !== currentLocked.id
    if (superseded) {
      return (
        <StepFrame ref={ref} title="Test & lock" onBack={onBack}>
          <div className="rounded-xl bg-neutral-100 px-4 py-5 text-center dark:bg-neutral-800/60">
            <History className="mx-auto mb-2 h-8 w-8 text-neutral-500" aria-hidden="true" />
            <p className="text-base font-semibold">
              v{v.version} was locked {formatDateTime(v.locked_at)} and has been superseded by v{currentLocked.version}.
            </p>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
              Every new brief for {client.name} uses v{currentLocked.version}
              {v.note ? ` · v${v.version} note: ${v.note}` : ''}. Cards already generated keep the version they were made with.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link to={`/clients/${client.id}/onboard?step=test&draft=${encodeURIComponent(currentLocked.id)}`} className={btnPrimary}>
                Show v{currentLocked.version}
              </Link>
              <Link to={`/clients/${client.id}/style?version=${encodeURIComponent(v.id)}`} className={btnSecondary}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open v{v.version} in the editor
              </Link>
            </div>
          </div>
        </StepFrame>
      )
    }
    return (
      <StepFrame ref={ref} title="Test & lock" tone="good" onBack={onBack}>
        <div className="rounded-xl bg-emerald-50 px-4 py-5 text-center dark:bg-emerald-950/40">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <p className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
            v{v.version} locked. Every new brief for {client.name} uses it.
          </p>
          <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/80">
            Locked {formatDateTime(v.locked_at)}
            {v.note ? ` · ${v.note}` : ''}. Cards already generated keep the version they were made with.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to={`/clients/${client.id}`} className={btnPrimary}>
              Back to client panel
            </Link>
            <Link to={`/clients/${client.id}/style?version=${encodeURIComponent(v.id)}`} className={btnSecondary}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open Style Card editor
            </Link>
          </div>
        </div>
      </StepFrame>
    )
  }

  return (
    <StepFrame
      ref={ref}
      title="Test & lock"
      pill={
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
          Draft v{draft.version}
        </span>
      }
      subtitle={`See one new design in this look before making v${draft.version} the contract for every new brief.`}
      onBack={onBack}
    >
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
            <p className="min-w-0 flex-1 truncate text-xs text-neutral-600 dark:text-neutral-300" title={artworkLine(doc)}>
              {artworkLine(doc) || 'No medium, linework, shading or texture recorded.'}
            </p>
          </div>
        )}

        {currentLocked && (
          <p className="flex items-start gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-200">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              v{currentLocked.version} is locked today. Locking v{draft.version} supersedes it for every new brief; cards
              already generated keep v{currentLocked.version}.
            </span>
          </p>
        )}

        {issues.blocking.length > 0 && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {issues.blocking.join(' ')}{' '}
              <Link to={`/clients/${client.id}/style?version=${encodeURIComponent(draft.id)}`} className="font-medium underline underline-offset-2">
                Fix it in the editor
              </Link>
              .
            </span>
          </p>
        )}

        {/* The render: running / failed / ready / none. Lock stays reachable in every state. */}
        {active ? (
          <>
            <RenderProgress
              card={active}
              phase={render.phase}
              draftVersion={draft.version}
              approveError={render.approveError}
              approving={render.approving}
              retrying={render.retrying}
              isLead={isLead}
              n8nBase={settings?.n8n_base_url}
              onGenerateNow={() => setDialog('generate')}
              onRetry={() => void render.retry(active)}
              onNewRender={() => setDialog('render')}
              onSkip={render.dismiss}
            />
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
              <p className="text-[11px] text-neutral-500">
                {render.phase === 'failed'
                  ? ready
                    ? `A finished render of v${draft.version} exists in the strip below. You can lock now, retry, or start a new render.`
                    : 'You can lock now, on the analysis alone, or retry the render.'
                  : ready
                    ? `A finished render of v${draft.version} exists in the strip below. You can lock now or wait for this one.`
                    : 'You can lock now, on the analysis alone, or wait for this render.'}
              </p>
              {lockButton}
            </div>
          </>
        ) : ready ? (
          <TestRenderResult
            key={ready.id}
            card={ready}
            onRenderAgain={() => setDialog('render')}
            renderAgainDisabledReason={renderDisabledReason}
            lockButton={lockButton}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-8 text-center dark:border-neutral-700">
            <Sparkles className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            <p className="text-sm font-medium">No test render for v{draft.version} yet</p>
            <p className="max-w-sm text-xs text-neutral-500">
              One new design in this look, with {client.name}'s name on it, generated with draft v{draft.version}. Hidden
              from the board; nothing reaches the client.
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
            <button
              type="button"
              onClick={() => setDialog('lock_untested')}
              disabled={lockDisabledReason !== null}
              title={lockDisabledReason ?? 'Lock on the analysis alone'}
              className="text-xs text-neutral-600 underline underline-offset-2 outline-none focus-visible:ring-4 focus-visible:ring-accent-500/30 disabled:opacity-50 dark:text-neutral-400"
            >
              Lock without a test render
            </button>
          </div>
        )}

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

      {(dialog === 'render' || dialog === 'generate') && (
        <TestRenderDialog
          open
          client={client}
          draft={draft}
          read={read}
          mode={dialog}
          busy={render.starting || render.approving}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            const target = render.card
            if (dialog === 'generate' && target) {
              void render.generateNow(target).then(() => setDialog(null))
            } else {
              void render.start().then(() => setDialog(null))
            }
          }}
        />
      )}

      {(dialog === 'lock' || dialog === 'lock_untested') && (
        <LockDialog
          open
          version={draft.version}
          clientName={client.name}
          issues={issues}
          willSaveFirst={false}
          busy={locking}
          onCancel={() => setDialog(null)}
          onConfirm={(note) => void lock(note)}
          extra={
            <div className="space-y-2">
              {dialog === 'lock_untested' && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>No test render for v{draft.version}: you are locking on the analysis alone.</span>
                </p>
              )}
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                v{draft.version} becomes the contract for every new brief for {client.name}
                {currentLocked ? `; v${currentLocked.version} stays on the cards already generated` : ''}.
              </p>
            </div>
          }
        />
      )}
    </StepFrame>
  )
})

/** 64 px tile of one earlier test render, linking to its card. */
function TestRenderThumb({ card }: { card: TestCard }) {
  const gen = card.current_generation ?? null
  const image = useSignedUrl(GENS_BUCKET, gen?.image_path)
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
            <span className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">{STAGE_LABEL[card.stage]}</span>
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
