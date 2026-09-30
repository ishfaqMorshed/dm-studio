import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, ImageOff, RefreshCw } from 'lucide-react'
import type { TestCard } from '../../lib/api'
import { GENS_BUCKET } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { PlatformBadge } from '../card/PlatformBadge'
import { VERDICT_LABEL, qcTextFound, qcVerdict } from '../card/qc'
import { VERDICT_CLASS, checkerboard, imageChip } from '../card/styles'
import { Badge } from '../card/ui'
import { useCardGenerations } from '../card/useCardData'
import { btnSecondary } from '../style/classes'
import { formatDateTime } from '../style/format'
import { TEST_RENDER_COST_LABEL } from './costs'

/**
 * The finished test render, large, with its QC verdict and the lock button. Mount with
 * `key={card.id}`; generations arrive live (realtime on `generations`).
 */
export function TestRenderResult({
  card,
  onRenderAgain,
  renderAgainDisabledReason,
  lockButton,
}: {
  card: TestCard
  onRenderAgain: () => void
  renderAgainDisabledReason: string | null
  lockButton: ReactNode
}) {
  const generations = useCardGenerations(card.id)
  const gen = useMemo(
    () => generations.rows.find((g) => g.id === card.current_generation_id) ?? generations.rows[0] ?? null,
    [generations.rows, card.current_generation_id],
  )
  const image = useSignedUrl(GENS_BUCKET, gen?.image_path)
  const verdict = qcVerdict(gen?.qc_report)
  const textFound = qcTextFound(gen?.qc_report)

  return (
    <div className="space-y-3">
      <div className={`relative mx-auto aspect-square w-full max-w-[min(100%,60vh)] overflow-hidden rounded-2xl ${checkerboard}`}>
        {gen?.image_path && !image.broken ? (
          image.url ? (
            <img src={image.url} alt={`Test render with Style Card v${card.style_card_version ?? '?'}`} decoding="async" className="absolute inset-0 h-full w-full object-contain" />
          ) : (
            <div className="absolute inset-0 animate-pulse bg-neutral-200/60 dark:bg-neutral-800/60" />
          )
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-neutral-500">
            <ImageOff className="h-6 w-6" aria-hidden="true" />
            <p>{generations.loading ? 'Loading the image…' : 'No image stored for this render.'}</p>
          </div>
        )}
        {card.style_card_version !== null && (
          <span className={`absolute left-2 top-2 ${imageChip}`}>Rendered with v{card.style_card_version}</span>
        )}
        {verdict && <Badge className={`absolute right-2 top-2 ${VERDICT_CLASS[verdict]}`}>QC {VERDICT_LABEL[verdict]}</Badge>}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        {gen && <PlatformBadge generation={gen} />}
        {textFound && (
          <span>
            Text found: <span className="font-medium text-neutral-800 dark:text-neutral-200">{textFound}</span>
          </span>
        )}
        <span>Rendered {formatDateTime(gen?.finished_at ?? card.stage_entered_at)}</span>
        <Link to={`/card/${card.id}`} className="inline-flex items-center gap-1 underline underline-offset-2">
          Open the full card
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onRenderAgain}
          disabled={renderAgainDisabledReason !== null}
          title={renderAgainDisabledReason ?? `Another test render · ${TEST_RENDER_COST_LABEL}`}
          className={btnSecondary}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Render again · {TEST_RENDER_COST_LABEL}
        </button>
        {lockButton}
      </div>
    </div>
  )
}
