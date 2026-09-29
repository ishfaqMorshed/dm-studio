import { useEffect, useState } from 'react'
import { Download, Eye, ImageOff, Repeat } from 'lucide-react'
import { GENS_BUCKET } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { useToast } from '../../lib/useToast'
import { downloadFile } from '../../lib/download'
import {
  ACTIVE_JOB_STATUSES,
  GENERATION_KIND_LABEL,
  REJECTION_REASON_LABEL,
  errorMessage,
  generationPlatformLabel,
  type Generation,
} from '../../lib/types'
import { agoLabel, formatDateTime, formatPct, shortId } from './format'
import { STATUS_CLASS, STATUS_LABEL, btnSecondary, btnSmall, checkerboard } from './styles'
import { Badge, Panel, Spinner } from './ui'
import { PlatformBadge } from './PlatformBadge'

const BLINK_MS = 700
const DRIFT_FLAG_PCT = 3

/**
 * Large view of the selected generation with a previous/current blink toggle
 * (the parent generation, else the newest older image). Both images stay mounted
 * so the blink never flashes a blank frame.
 */
export function Preview({
  viewed,
  previous,
  isCurrent,
  fileBase,
  now,
}: {
  viewed: Generation | null
  previous: Generation | null
  isCurrent: boolean
  /** Safe file-name prefix for downloads (client name). */
  fileBase: string
  now: number
}) {
  const toast = useToast()
  const [showPrevious, setShowPrevious] = useState(false)
  const [auto, setAuto] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [viewedKey, setViewedKey] = useState(viewed?.id ?? null)

  // New generation selected: fall back to showing it, stop any auto blink.
  if (viewedKey !== (viewed?.id ?? null)) {
    setViewedKey(viewed?.id ?? null)
    setShowPrevious(false)
    setAuto(false)
  }

  const current = useSignedUrl(GENS_BUCKET, viewed?.image_path)
  const prev = useSignedUrl(GENS_BUCKET, previous?.image_path)
  const canBlink = Boolean(viewed?.image_path && previous?.image_path)

  useEffect(() => {
    if (!auto || !canBlink) return
    const t = window.setInterval(() => setShowPrevious((v) => !v), BLINK_MS)
    return () => window.clearInterval(t)
  }, [auto, canBlink])

  const showingPrevious = showPrevious && canBlink
  const running = viewed ? ACTIVE_JOB_STATUSES.includes(viewed.status) : false

  async function download() {
    if (!viewed?.image_path || downloading) return
    setDownloading(true)
    try {
      await downloadFile({ bucket: GENS_BUCKET, path: viewed.image_path, filename: `${fileBase}-${shortId(viewed.id)}.png` })
    } catch (e) {
      toast.error(errorMessage(e, 'Download failed'))
    } finally {
      setDownloading(false)
    }
  }

  const subtitle = viewed
    ? `${GENERATION_KIND_LABEL[viewed.kind]} · ${agoLabel(viewed.created_at, now)}${isCurrent ? ' · current' : ' · not current — make it current to accept or edit it'}`
    : 'No generation to show'

  return (
    <Panel
      title="Preview"
      subtitle={subtitle}
      actions={
        viewed?.image_path ? (
          <>
            {canBlink && (
              <>
                <button
                  type="button"
                  onClick={() => setShowPrevious((v) => !v)}
                  aria-pressed={showingPrevious}
                  title="Blink between the previous image and this one to spot what changed"
                  className={`${btnSecondary} ${btnSmall}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showingPrevious ? 'Showing previous' : 'Show previous'}
                </button>
                <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(e) => setAuto(e.target.checked)}
                    className="h-3.5 w-3.5 accent-neutral-900 dark:accent-white"
                  />
                  <Repeat className="h-3.5 w-3.5" />
                  Auto blink
                </label>
              </>
            )}
            <button type="button" onClick={() => void download()} disabled={downloading} className={`${btnSecondary} ${btnSmall}`}>
              {downloading ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              PNG
            </button>
          </>
        ) : undefined
      }
    >
      <div className={`relative mx-auto aspect-square w-full max-w-[70vh] overflow-hidden rounded-xl ${checkerboard}`}>
        {viewed?.image_path && !current.broken ? (
          <>
            {current.url ? (
              <img
                src={current.url}
                alt={`${GENERATION_KIND_LABEL[viewed.kind]} generation`}
                decoding="async"
                className={`absolute inset-0 h-full w-full object-contain ${showingPrevious ? 'invisible' : ''}`}
              />
            ) : (
              <div className="absolute inset-0 animate-pulse bg-neutral-200/60 dark:bg-neutral-800/60" />
            )}
            {canBlink && prev.url && (
              <img
                src={prev.url}
                alt={previous ? `Previous ${GENERATION_KIND_LABEL[previous.kind]} generation` : 'Previous generation'}
                decoding="async"
                className={`absolute inset-0 h-full w-full object-contain ${showingPrevious ? '' : 'invisible'}`}
              />
            )}
            <span className="absolute left-2 top-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-[11px] font-medium text-white">
              {showingPrevious && previous ? `Previous · ${GENERATION_KIND_LABEL[previous.kind]}` : isCurrent ? 'Current' : GENERATION_KIND_LABEL[viewed.kind]}
            </span>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-neutral-500">
            {running ? (
              <>
                <Spinner className="h-6 w-6" />
                <p>
                  {STATUS_LABEL[viewed?.status ?? 'queued']} — the image appears here when the worker finishes.
                </p>
              </>
            ) : viewed?.status === 'failed' ? (
              <>
                <ImageOff className="h-6 w-6 text-red-400" />
                <p className="text-red-700 dark:text-red-300">This generation failed{viewed.last_error ? `: ${viewed.last_error}` : '.'}</p>
              </>
            ) : (
              <>
                <ImageOff className="h-6 w-6" />
                <p>{viewed ? 'No image stored for this generation.' : 'Approve the card to generate the first image.'}</p>
              </>
            )}
          </div>
        )}
      </div>

      {viewed && <GenerationMeta generation={viewed} />}
    </Panel>
  )
}

function GenerationMeta({ generation: g }: { generation: Generation }) {
  const drift = formatPct(g.drift_pct)
  const driftHigh = typeof g.drift_pct === 'number' && g.drift_pct > DRIFT_FLAG_PCT
  const rows: Array<[string, React.ReactNode]> = []
  rows.push(['Status', <Badge key="s" className={STATUS_CLASS[g.status]}>{STATUS_LABEL[g.status]}</Badge>])
  if (generationPlatformLabel(g)) rows.push(['Platform', <PlatformBadge key="p" generation={g} />])
  if (g.model) rows.push(['Model', g.model])
  if (g.style_card_version !== null) rows.push(['Style Card', `v${g.style_card_version}`])
  if (g.kind === 'edit_text' && (g.old_text || g.new_text)) rows.push(['Text edit', `“${g.old_text ?? ''}” → “${g.new_text ?? ''}”`])
  if (g.edit_instruction) rows.push(['Instruction', g.edit_instruction])
  if (drift) {
    rows.push([
      'Drift outside mask',
      <span key="d" className={driftHigh ? 'font-medium text-amber-700 dark:text-amber-300' : undefined}>
        {drift}
        {driftHigh ? ` — above ${DRIFT_FLAG_PCT} %, check the untouched areas` : ''}
      </span>,
    ])
  }
  if (g.rejection_reason) {
    rows.push(['Rejected as', `${REJECTION_REASON_LABEL[g.rejection_reason]}${g.rejection_note ? ` — ${g.rejection_note}` : ''}`])
  }
  rows.push(['Created', formatDateTime(g.created_at)])
  if (g.finished_at) rows.push(['Finished', formatDateTime(g.finished_at)])
  if (g.attempt > 1) rows.push(['Attempt', String(g.attempt)])
  if (g.last_error && g.status === 'failed') {
    rows.push(['Error', <span key="e" className="text-red-700 dark:text-red-300">{g.last_error}</span>])
  }

  return (
    <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-neutral-500">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
