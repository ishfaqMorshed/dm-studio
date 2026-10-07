import { memo } from 'react'
import { ImageOff, Star } from 'lucide-react'
import { GENS_BUCKET } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { ACTIVE_JOB_STATUSES, GENERATION_KIND_LABEL, generationPlatformLabel, type Generation } from '../../lib/types'
import { agoLabel } from './format'
import { VERDICT_LABEL, qcVerdict } from './qc'
import { STATUS_CLASS, STATUS_LABEL, VERDICT_CLASS, btnSecondary, btnSmall, checkerboard } from './styles'
import { Badge, Spinner } from './ui'

interface TileProps {
  generation: Generation
  isCurrent: boolean
  isViewed: boolean
  canMakeCurrent: boolean
  busy: boolean
  now: number
  onView: (id: string) => void
  onMakeCurrent: (id: string) => void
}

const GenerationTile = memo(function GenerationTile({
  generation: g,
  isCurrent,
  isViewed,
  canMakeCurrent,
  busy,
  now,
  onView,
  onMakeCurrent,
}: TileProps) {
  const { url, broken } = useSignedUrl(GENS_BUCKET, g.image_path, g.updated_at)
  const verdict = qcVerdict(g.qc_report)
  const running = ACTIVE_JOB_STATUSES.includes(g.status)
  const platform = generationPlatformLabel(g)
  const label = `${GENERATION_KIND_LABEL[g.kind]} · ${STATUS_LABEL[g.status]}${platform ? ` · ${platform}` : ''} · ${agoLabel(g.created_at, now)}`

  return (
    <li className="w-24 shrink-0 space-y-1">
      <button
        type="button"
        onClick={() => onView(g.id)}
        aria-pressed={isViewed}
        aria-label={`View ${label}`}
        title={label}
        className={`relative block aspect-square w-full overflow-hidden rounded-lg border outline-none focus-visible:ring-4 focus-visible:ring-neutral-900/10 ${checkerboard} ${
          isViewed
            ? 'border-neutral-900 ring-2 ring-neutral-900/20 dark:border-white dark:ring-white/30'
            : 'border-neutral-200 hover:border-neutral-400 dark:border-neutral-800 dark:hover:border-neutral-600'
        }`}
      >
        {url && !broken ? (
          <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
        ) : running ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-neutral-500">
            <Spinner />
            <span className="text-[10px]">{STATUS_LABEL[g.status]}</span>
          </div>
        ) : g.status === 'failed' || broken || !g.image_path ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-neutral-400">
            <ImageOff className="h-5 w-5" />
            <span className="text-[10px]">{g.status === 'failed' ? 'Failed' : 'No image'}</span>
          </div>
        ) : (
          <div className="h-full w-full animate-pulse bg-neutral-200/60 dark:bg-neutral-800/60" />
        )}
        {isCurrent && (
          <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-neutral-900/90 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-white/90 dark:text-neutral-900">
            <Star className="h-2.5 w-2.5" />
            Current
          </span>
        )}
      </button>
      <div className="flex flex-wrap items-center gap-1">
        {verdict && (
          <Badge className={VERDICT_CLASS[verdict]} title={`QC ${VERDICT_LABEL[verdict]}`}>
            QC {VERDICT_LABEL[verdict]}
          </Badge>
        )}
        {g.status !== 'done' && <Badge className={STATUS_CLASS[g.status]}>{STATUS_LABEL[g.status]}</Badge>}
      </div>
      {isViewed && !isCurrent && (
        <button
          type="button"
          onClick={() => onMakeCurrent(g.id)}
          disabled={busy || !canMakeCurrent || !g.image_path}
          title={
            !g.image_path
              ? 'No image to make current'
              : !canMakeCurrent
                ? 'Wait until the pipeline finishes with this card'
                : 'Use this image as the card’s current generation'
          }
          className={`${btnSecondary} ${btnSmall} w-full`}
        >
          Make current
        </button>
      )}
    </li>
  )
})

/** Compact filmstrip of every generation, newest first; the page renders it only from two generations on. */
export function GenerationStrip({
  generations,
  currentId,
  viewedId,
  canMakeCurrent,
  busy,
  now,
  onView,
  onMakeCurrent,
}: {
  generations: Generation[]
  currentId: string | null
  viewedId: string | null
  canMakeCurrent: boolean
  busy: boolean
  now: number
  onView: (id: string) => void
  onMakeCurrent: (id: string) => void
}) {
  return (
    <ul aria-label="Generations, newest first" className="flex gap-2 overflow-x-auto py-1">
      {generations.map((g) => (
        <GenerationTile
          key={g.id}
          generation={g}
          isCurrent={g.id === currentId}
          isViewed={g.id === viewedId}
          canMakeCurrent={canMakeCurrent}
          busy={busy}
          now={now}
          onView={onView}
          onMakeCurrent={onMakeCurrent}
        />
      ))}
    </ul>
  )
}
