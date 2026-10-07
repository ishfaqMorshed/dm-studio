import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { Download, Eye, ImageOff, Repeat, Type } from 'lucide-react'
import { GENS_BUCKET } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { useToast } from '../../lib/useToast'
import { downloadFile } from '../../lib/download'
import {
  ACTIVE_JOB_STATUSES,
  COMPOSITE_MODE_LABEL,
  GENERATION_KIND_LABEL,
  REJECTION_REASON_LABEL,
  errorMessage,
  generationPlatformLabel,
  isCompositeMode,
  parseRegionMetrics,
  type Generation,
} from '../../lib/types'
import { formatDateTime, formatPct, shortId } from './format'
import { VERDICT_LABEL, type QcVerdict } from './qc'
import { STATUS_CLASS, STATUS_LABEL, VERDICT_CLASS, btnGhost, btnSmall, checkerboard, imageChip } from './styles'
import { Badge, Spinner } from './ui'
import { PlatformBadge } from './PlatformBadge'

const BLINK_MS = 700
const DRIFT_FLAG_PCT = 3

export type EditPhase = 'off' | 'scanning' | 'on'

/** The larger pill at the bottom of the frame ("Edit text", "Reading the text…"). */
const pillCls = 'rounded-full bg-neutral-900/80 px-3 py-1 text-xs font-medium text-white'
const frameButtonCls = 'group absolute inset-0 block h-full w-full cursor-pointer outline-none ring-inset ring-accent-500/30 focus-visible:ring-4 dark:ring-accent-400/40'

/** Scan-line sweep while the page "reads" the text; the live region announces it, not this. */
function ScanOverlay() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl bg-neutral-950/20">
      <div className="absolute inset-x-0 top-0 h-1/5 bg-gradient-to-b from-transparent via-accent-300/50 to-transparent motion-safe:animate-scan motion-reduce:hidden">
        <div className="absolute inset-x-0 top-1/2 h-px bg-accent-200 shadow-[0_0_12px_2px_theme(colors.accent.400)]" />
      </div>
      <span className={`absolute inset-x-0 bottom-3 mx-auto flex w-max items-center gap-1.5 ${pillCls}`}>
        <Spinner className="h-3.5 w-3.5" />
        Reading the text on the design…
      </span>
    </div>
  )
}

/**
 * The stage canvas: the selected generation large, with a previous/current blink toggle
 * (the parent generation, else the newest older image) and PNG download in a toolbar
 * under it. Both images stay mounted so the blink never flashes a blank frame.
 *
 * When `editable`, the picture itself is the button that opens the text editor: the
 * bottom pill says so at rest (touch has no hover), the frame lights up while editing.
 *
 * `altImage` swaps the main picture for another gens path of the same generation (Fix an
 * area: the untouched full regeneration) with its own chip label; blink and download follow it.
 */
export function Preview({
  viewed,
  previous,
  isCurrent,
  fileBase,
  editable,
  editPhase,
  onEdit,
  pictureRef,
  emptyAction,
  qcVerdict = null,
  runningGeneration = null,
  altImage = null,
}: {
  viewed: Generation | null
  previous: Generation | null
  isCurrent: boolean
  /** Safe file-name prefix for downloads (client name). */
  fileBase: string
  /** Clicking the picture may open the text editor (needs_review, current has an image, nothing busy). */
  editable: boolean
  editPhase: EditPhase
  onEdit: () => void
  /** The picture button, so the page can return focus to it when the editor closes. */
  pictureRef: RefObject<HTMLButtonElement>
  /** Fills the frame when there is no generation to show (stage placeholder). */
  emptyAction?: ReactNode
  /** QC verdict of the viewed generation, as a badge in the corner. */
  qcVerdict?: QcVerdict | null
  /** An edit child that is queued or running: dims the picture and says so in the chip. */
  runningGeneration?: Generation | null
  /** Show this gens path of the viewed generation instead of its image (e.g. the full regeneration), chip = `label`. */
  altImage?: { path: string; label: string } | null
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

  // The displayed picture: the alternative image when one is given, else the generation's own.
  const displayedPath = viewed?.image_path ? (altImage?.path ?? viewed.image_path) : null
  // updated_at as the version: a corrective attempt rewrites the same path, the browser must fetch it again.
  const current = useSignedUrl(GENS_BUCKET, displayedPath, viewed?.updated_at)
  const prev = useSignedUrl(GENS_BUCKET, previous?.image_path, previous?.updated_at)
  const canBlink = Boolean(viewed?.image_path && previous?.image_path)

  useEffect(() => {
    if (!auto || !canBlink) return
    const t = window.setInterval(() => setShowPrevious((v) => !v), BLINK_MS)
    return () => window.clearInterval(t)
  }, [auto, canBlink])

  const showingPrevious = showPrevious && canBlink
  const running = viewed ? ACTIVE_JOB_STATUSES.includes(viewed.status) : false
  // Stays a button while the editor is open even once `editable` drops (Apply pressed),
  // so the images never remount mid-edit and focus has somewhere to return to.
  const asButton = editable || editPhase !== 'off'
  const openEditor = () => {
    if (editPhase === 'off' && editable) onEdit()
  }

  async function download() {
    if (!viewed || !displayedPath || downloading) return
    setDownloading(true)
    try {
      const suffix = altImage ? '-full' : ''
      await downloadFile({ bucket: GENS_BUCKET, path: displayedPath, filename: `${fileBase}-${shortId(viewed.id)}${suffix}.png` })
    } catch (e) {
      toast.error(errorMessage(e, 'Download failed'))
    } finally {
      setDownloading(false)
    }
  }

  let content: ReactNode
  if (viewed?.image_path && !current.broken) {
    const picture = (
      <>
        {current.url ? (
          <img
            src={current.url}
            alt={altImage ? `${altImage.label} of this ${GENERATION_KIND_LABEL[viewed.kind]} generation` : `${GENERATION_KIND_LABEL[viewed.kind]} generation`}
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
        {runningGeneration && <span aria-hidden="true" className="absolute inset-0 bg-neutral-950/30" />}
        {runningGeneration ? (
          <span className={`absolute left-2 top-2 inline-flex items-center gap-1 ${imageChip}`}>
            <Spinner className="h-3 w-3" />
            Editing · {GENERATION_KIND_LABEL[runningGeneration.kind]} {STATUS_LABEL[runningGeneration.status].toLowerCase()}
          </span>
        ) : (
          <span className={`absolute left-2 top-2 ${imageChip}`}>
            {showingPrevious && previous
              ? `Previous · ${GENERATION_KIND_LABEL[previous.kind]}`
              : altImage
                ? altImage.label
                : isCurrent
                  ? 'Current'
                  : GENERATION_KIND_LABEL[viewed.kind]}
          </span>
        )}
        {qcVerdict && <Badge className={`absolute right-2 top-2 ${VERDICT_CLASS[qcVerdict]}`}>QC {VERDICT_LABEL[qcVerdict]}</Badge>}
        {asButton && editPhase !== 'scanning' && (
          <span
            className={`pointer-events-none absolute inset-x-0 bottom-3 mx-auto flex w-max items-center gap-1.5 ${pillCls} opacity-80 transition group-hover:opacity-100 group-focus-visible:opacity-100`}
          >
            <Type className="h-3.5 w-3.5" />
            {editPhase === 'on' ? 'Editing text · Esc to cancel' : 'Edit text'}
          </span>
        )}
      </>
    )
    content = asButton ? (
      <button
        type="button"
        ref={pictureRef}
        aria-label="Edit the text on this design"
        aria-expanded={editPhase !== 'off'}
        onClick={openEditor}
        className={frameButtonCls}
      >
        {picture}
      </button>
    ) : (
      <div className="absolute inset-0">{picture}</div>
    )
  } else if (emptyAction) {
    content = emptyAction
  } else if (viewed?.image_path && asButton) {
    // The image failed to load but the text can still be edited: keep the way in.
    content = (
      <button
        type="button"
        ref={pictureRef}
        aria-label="Edit the text on this design"
        aria-expanded={editPhase !== 'off'}
        onClick={openEditor}
        className={`${frameButtonCls} flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-neutral-500`}
      >
        <ImageOff className="h-6 w-6" />
        <span>Image not available · Edit text</span>
      </button>
    )
  } else {
    content = (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-neutral-500">
        {running ? (
          <>
            <Spinner className="h-6 w-6" />
            <p>{STATUS_LABEL[viewed?.status ?? 'queued']} — the image appears here when the worker finishes.</p>
          </>
        ) : viewed?.status === 'failed' ? (
          <>
            <ImageOff className="h-6 w-6 text-red-400" />
            <p className="text-red-700 dark:text-red-300">This generation failed{viewed.last_error ? `: ${viewed.last_error}` : '.'}</p>
          </>
        ) : (
          <>
            <ImageOff className="h-6 w-6" />
            <p>{viewed ? 'No image stored for this generation.' : 'Generate the design to see the first image.'}</p>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <div
        className={`relative mx-auto aspect-square w-full max-w-[min(100%,72vh)] overflow-hidden rounded-2xl ${checkerboard} ${
          editPhase !== 'off' ? 'ring-2 ring-accent-500' : ''
        }`}
      >
        {content}
        {editPhase === 'scanning' && <ScanOverlay />}
      </div>

      {viewed?.image_path && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {canBlink && (
            <>
              <button
                type="button"
                onClick={() => setShowPrevious((v) => !v)}
                aria-pressed={showingPrevious}
                title="Blink between the previous image and this one to spot what changed"
                className={`${btnGhost} ${btnSmall}`}
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
          <button type="button" onClick={() => void download()} disabled={downloading} className={`${btnGhost} ${btnSmall}`}>
            {downloading ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
            PNG
          </button>
        </div>
      )}
    </>
  )
}

/** "Locked outside · shift 0/0 px · colour offset 0.7 · seam 0.85" for a Fix an area generation with region-composite metrics. */
function areaEditSummary(g: Generation): string | null {
  if (g.kind !== 'edit_region') return null
  const m = parseRegionMetrics(g.region_metrics)
  if (!m) return null
  const mode = isCompositeMode(g.composite_mode) ? g.composite_mode : m.mode
  const c = m.colour_offset
  const offset = Math.max(Math.abs(c.r), Math.abs(c.g), Math.abs(c.b))
  const parts = [
    mode ? COMPOSITE_MODE_LABEL[mode] : null,
    `shift ${m.shift.dx}/${m.shift.dy} px`,
    `colour offset ${offset.toFixed(1)}`,
    // The seam is measured on the composite; a full regeneration has none.
    mode !== 'full' && m.seam_ratio_box !== null ? `seam ${m.seam_ratio_box.toFixed(2)}` : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** Key/value facts about one generation (status, platform, model, edit, drift, dates). */
export function GenerationMeta({ generation: g }: { generation: Generation }) {
  const drift = formatPct(g.drift_pct)
  const driftHigh = typeof g.drift_pct === 'number' && g.drift_pct > DRIFT_FLAG_PCT
  const rows: Array<[string, React.ReactNode]> = []
  rows.push(['Status', <Badge key="s" className={STATUS_CLASS[g.status]}>{STATUS_LABEL[g.status]}</Badge>])
  if (generationPlatformLabel(g)) rows.push(['Platform', <PlatformBadge key="p" generation={g} />])
  if (g.model) rows.push(['Model', g.model])
  if (g.style_card_version !== null) rows.push(['Style Card', `v${g.style_card_version}`])
  if (g.kind === 'edit_text' && (g.old_text || g.new_text)) rows.push(['Text edit', `“${g.old_text ?? ''}” → “${g.new_text ?? ''}”`])
  if (g.edit_instruction) rows.push(['Instruction', g.edit_instruction])
  const areaEdit = areaEditSummary(g)
  if (areaEdit) rows.push(['Area edit', areaEdit])
  if (drift) {
    rows.push([
      // Fix an area (locked outside) keeps the original beyond the blend ring, so that is where a change counts.
      // Region edits from before region-composite (no composite_mode) measured drift outside the mask.
      g.kind === 'edit_region' && g.composite_mode ? 'Changed beyond the blend line' : 'Drift outside mask',
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
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-neutral-500">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
