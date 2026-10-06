import { AlertTriangle, Expand, Eye, Layers } from 'lucide-react'
import type { RegionRecompositeMode } from '../../lib/api'
import {
  FULL_DRIFT_SAFE_PCT,
  isCompositeMode,
  type Generation,
  type RegionMetrics,
  type RegionRectPx,
} from '../../lib/types'
import { shortId } from './format'
import { btnDanger, btnGhost, btnSecondary, btnSmall } from './styles'
import { Spinner } from './ui'

const NOT_NOW = 'Available while the card is in Needs review and nothing else is running'

/**
 * Under the picture of a finished Fix an area generation (edit_region, done, with its stored full
 * regeneration): the follow-ups that re-use that regeneration at $0, no AI.
 *  - "Extend area" when region-composite measured the new element running past the box;
 *  - "View full regeneration" (the page swaps the picture) and, while it shows, "Use full regeneration".
 * Both actions create a new child generation that becomes current; they work while the pipeline is
 * paused, since nothing is queued.
 */
export function RegionEditPanel({
  generation: g,
  metrics,
  showFull,
  onToggleFull,
  canAct,
  busy,
  onExtend,
  onUseFull,
}: {
  generation: Generation
  /** `parseRegionMetrics(generation.region_metrics)`. */
  metrics: RegionMetrics | null
  /** The page shows the full regeneration instead of the composite. */
  showFull: boolean
  onToggleFull: () => void
  /** Card in needs_review and nothing busy. */
  canAct: boolean
  /** The recombine in flight, for its spinner. */
  busy: RegionRecompositeMode | null
  /** Extend area over this rectangle (image pixels + the image size it was measured on). */
  onExtend: (rect: RegionRectPx) => void
  onUseFull: () => void
}) {
  if (g.kind !== 'edit_region' || g.status !== 'done' || !g.raw_image_path) return null

  const mode = isCompositeMode(g.composite_mode) ? g.composite_mode : (metrics?.mode ?? null)
  const isFull = mode === 'full'
  const recombined = mode === 'extend' || mode === 'full'
  const overflow = metrics?.overflow
  const suggested = overflow?.detected && !isFull ? overflow.suggested_rect : null
  const gt8 = metrics?.drift_outside_pct_gt8 ?? null
  const highDrift = Boolean(metrics?.full_drift_high) || (gt8 !== null && gt8 > FULL_DRIFT_SAFE_PCT)
  // OpenRouter answers 1024 px; a 2048 px design gets the changed area enlarged.
  const upscaled =
    metrics?.resampled === 'up' && metrics.regen_size && metrics.image_size
      ? { regen: metrics.regen_size.w, image: metrics.image_size.w }
      : null
  const disabledTitle = canAct ? undefined : NOT_NOW
  const subtextId = `region-extend-${g.id}`

  function extend() {
    if (!suggested) return
    const size = metrics?.image_size
    onExtend({
      x: Math.round(suggested.x),
      y: Math.round(suggested.y),
      w: Math.round(suggested.w),
      h: Math.round(suggested.h),
      ...(size ? { width: Math.round(size.w), height: Math.round(size.h) } : {}),
    })
  }

  return (
    <div role="group" aria-label="Fix an area" className="mt-3 space-y-2 text-sm">
      {suggested && (
        <div
          role="status"
          className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">The new element runs past your area</p>
            <p id={subtextId} className="mt-0.5 text-xs opacity-90">
              Recombines the same regeneration over a larger area · $0, no AI
            </p>
            {metrics?.rect && (
              <p className="mt-0.5 text-xs tabular-nums opacity-75">
                {metrics.rect.w} × {metrics.rect.h} px → {suggested.w} × {suggested.h} px
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={extend}
            disabled={!canAct}
            title={disabledTitle}
            aria-describedby={subtextId}
            className={`${btnSecondary} ${btnSmall} shrink-0`}
          >
            {busy === 'extend' ? <Spinner className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" aria-hidden="true" />}
            Extend area
          </button>
        </div>
      )}

      {!isFull && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={onToggleFull}
            aria-pressed={showFull}
            className={`${btnGhost} ${btnSmall} aria-pressed:bg-neutral-200 aria-pressed:text-neutral-900 dark:aria-pressed:bg-neutral-800 dark:aria-pressed:text-neutral-100`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            View full regeneration
          </button>
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
            {gt8 !== null
              ? `${gt8.toFixed(1)}% of the design outside your area changed`
              : 'The full regeneration redraws the whole design.'}
          </span>
        </div>
      )}

      {!isFull && showFull && (
        <div className="space-y-1.5 rounded-xl border border-neutral-200 px-3 py-2.5 dark:border-neutral-800">
          {highDrift && (
            <p className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              High drift: lettering, outlines and the grey background outside your area changed too. Check them before you accept.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onUseFull}
              disabled={!canAct}
              title={disabledTitle}
              className={`${highDrift ? btnDanger : btnSecondary} ${btnSmall}`}
            >
              {busy === 'full' ? <Spinner className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" aria-hidden="true" />}
              {highDrift ? 'Use full regeneration anyway' : 'Use full regeneration'}
            </button>
            <span className="text-xs text-neutral-500">Makes the whole redraw the current version · $0, no AI</span>
          </div>
        </div>
      )}

      {upscaled && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          The AI returned {upscaled.regen} px for this {upscaled.image} px design; the changed area was enlarged and may look
          slightly softer.
        </p>
      )}

      {recombined && (
        <p className="text-xs text-neutral-500">
          {metrics?.source_generation_id
            ? `Recombined from the regeneration of ${shortId(metrics.source_generation_id)} · not re-checked by QC.`
            : 'Recombined from an earlier regeneration · not re-checked by QC.'}
        </p>
      )}
    </div>
  )
}
