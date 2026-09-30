import { Link } from 'react-router-dom'
import { AlertTriangle, Check, Circle, ExternalLink, Loader2, RotateCcw, SkipForward, Sparkles } from 'lucide-react'
import type { TestCard } from '../../lib/api'
import { n8nExecutionUrl } from '../clientPanel/links'
import { useNow } from '../card/useNow'
import { btnPrimary, btnSecondary } from '../style/classes'
import { formatDateTime } from '../style/format'
import { TEST_RENDER_COST_LABEL } from './costs'
import { formatElapsed } from './steps'
import { isTestStuck, type RenderPhase } from './useTestRender'

const PHASES: Array<{ key: string; label: string; hint: string }> = [
  { key: 'create', label: 'Create card', hint: '' },
  { key: 'intake', label: 'Read references', hint: '~10 s' },
  { key: 'generate', label: 'Generate + QC', hint: '~40 s' },
  { key: 'done', label: 'Done', hint: '' },
]

/** Which of the four phases the card is in; a failed card is marked where it failed (`previous_stage`). */
function phaseIndex(phase: RenderPhase, card: TestCard): number {
  switch (phase) {
    case 'creating':
      return 0
    case 'intake':
    case 'approving':
    case 'needs_generate':
      return 1
    case 'generating':
      return 2
    case 'ready':
      return 3
    case 'failed':
      return card.previous_stage === 'approved' || card.previous_stage === 'generating' || card.current_generation_id ? 2 : 1
    default:
      return 1
  }
}

/** The running test render: four phases, elapsed time, one status line, and the failure / stuck panels. */
export function RenderProgress({
  card,
  phase,
  version,
  approveError,
  approving,
  retrying,
  isLead,
  n8nBase,
  onGenerateNow,
  onRetry,
  onNewRender,
  newRenderDisabledReason = null,
  onSkip,
}: {
  card: TestCard
  phase: RenderPhase
  /** The Style Card version the card renders with (named in the status lines). */
  version: number
  approveError: string | null
  approving: boolean
  retrying: boolean
  isLead: boolean
  n8nBase: string | null | undefined
  onGenerateNow: () => void
  onRetry: () => void
  onNewRender: () => void
  /** Why a new render (and, for a draft, the lock before it) cannot start now; disables that button. */
  newRenderDisabledReason?: string | null
  /** Leave this card behind (it stays reachable at /card/:id) so the step is free again. */
  onSkip: () => void
}) {
  const now = useNow(1000)
  const elapsed = now - Date.parse(card.created_at)
  const idx = phaseIndex(phase, card)
  const overdue = isTestStuck(card, now)
  const n8nUrl = isLead ? n8nExecutionUrl(n8nBase, card.n8n_execution_id) : null

  const statusText =
    phase === 'failed'
      ? 'The test render failed.'
      : phase === 'creating'
        ? 'Creating the test card…'
        : phase === 'intake'
          ? 'Reading the 3 reference images…'
          : phase === 'approving'
            ? `Starting the generation with v${version}…`
            : phase === 'needs_generate'
              ? approveError
                ? 'The generation could not be started.'
                : 'References read. Ready to generate.'
              : phase === 'generating'
                ? `Generating the design with v${version} and running QC…`
                : 'Done.'

  const skipButton = (
    <button type="button" onClick={onSkip} className={btnSecondary} title="Leave this card behind; it stays on its card page">
      <SkipForward className="h-4 w-4" aria-hidden="true" />
      Skip this render
    </button>
  )

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Test render phases">
        {PHASES.map((p, i) => {
          const done = i < idx || phase === 'ready'
          const current = i === idx && phase !== 'ready' && phase !== 'failed'
          const failedHere = phase === 'failed' && i === idx
          return (
            <li key={p.key} className="flex items-start gap-2 text-xs">
              <span
                className={`mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                  done
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : failedHere
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                      : current
                        ? 'text-accent-600 dark:text-accent-400'
                        : 'text-neutral-400'
                }`}
                aria-hidden="true"
              >
                {done ? (
                  <Check className="h-3 w-3" />
                ) : failedHere ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : current ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Circle className="h-2.5 w-2.5" />
                )}
              </span>
              <span className={done || current ? 'font-medium' : 'text-neutral-500'}>
                {p.label}
                {p.hint && <span className="ml-1 text-neutral-400">{p.hint}</span>}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="text-sm">
          {statusText}
        </p>
        <span className="ml-auto font-mono text-xs tabular-nums text-neutral-500" aria-hidden="true">
          {formatElapsed(elapsed)}
        </span>
      </div>

      {phase === 'needs_generate' && (
        <div className="space-y-2">
          {approveError && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
              {approveError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={onGenerateNow} disabled={approving} className={btnPrimary}>
              {approving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              {approveError ? 'Generate again' : `Generate with v${version}`} · {TEST_RENDER_COST_LABEL}
            </button>
            {skipButton}
          </div>
          <p className="text-[11px] text-neutral-500">
            The references were already read for this card (paid). Generate uses them; Skip leaves the card at review and
            frees this step.
          </p>
        </div>
      )}

      {phase === 'failed' && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <p className="font-semibold">Pipeline error</p>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
            {card.last_error?.trim() || 'No error message was recorded.'}
          </pre>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onRetry} disabled={retrying} className={btnPrimary}>
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
              Retry
            </button>
            <button
              type="button"
              onClick={onNewRender}
              disabled={newRenderDisabledReason !== null}
              title={newRenderDisabledReason ?? undefined}
              className={btnSecondary}
            >
              Start a new test render
            </button>
            {n8nUrl && (
              <a href={n8nUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline underline-offset-2">
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                n8n run
              </a>
            )}
          </div>
        </div>
      )}

      {overdue && phase !== 'failed' && (
        <div className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {phase === 'needs_generate'
                ? `Waiting at review since ${formatDateTime(card.stage_entered_at)}. Generate with v${version}, or skip it and start a new test render.`
                : 'Taking longer than usual: the pipeline has not moved this card. The card page shows the queue and any error; you can also skip it and start a new test render.'}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {phase !== 'needs_generate' && skipButton}
            <Link to={`/card/${card.id}`} className="ml-auto inline-flex items-center gap-1 font-medium underline underline-offset-2">
              Open card
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
