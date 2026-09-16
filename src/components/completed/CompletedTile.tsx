import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Download, ExternalLink, ImageOff, Loader2 } from 'lucide-react'
import { DeleteButton } from '../DeleteButton'
import { FINALS_BUCKET, GENS_BUCKET } from '../../lib/supabase'
import { ageLabel } from '../../lib/stage'
import { useSignedUrl } from '../../lib/useSignedUrl'
import {
  cardTitle,
  clientName,
  formatDate,
  metricsLabel,
  metricsWarning,
  shortId,
  type DeliveredCard,
  type FinalInfo,
} from './finals'

interface Props {
  card: DeliveredCard
  final: FinalInfo | null
  checked: boolean
  downloading: boolean
  /** A zip or a bulk delete is running: per-tile actions wait. */
  busy: boolean
  now: number
  onToggle: (id: string) => void
  onDownload: (card: DeliveredCard) => void
  onDelete: (card: DeliveredCard) => Promise<void>
}

const CHECKER =
  'bg-[conic-gradient(#e5e5e5_25%,transparent_0_50%,#e5e5e5_0_75%,transparent_0)] bg-[length:16px_16px] dark:bg-[conic-gradient(#404040_25%,transparent_0_50%,#404040_0_75%,transparent_0)]'

export const CompletedTile = memo(function CompletedTile({
  card,
  final,
  checked,
  downloading,
  busy,
  now,
  onToggle,
  onDownload,
  onDelete,
}: Props) {
  const [hovering, setHovering] = useState(false)
  const [pinned, setPinned] = useState(false)
  // The generation image is only signed once the designer first asks to compare.
  const [genWanted, setGenWanted] = useState(false)
  const [finalBroken, setFinalBroken] = useState(false)

  const genPath = card.current_generation?.image_path ?? null
  const finalUrl = useSignedUrl(FINALS_BUCKET, final?.path ?? null)
  const genUrl = useSignedUrl(GENS_BUCKET, genWanted ? genPath : null)

  const wantGen = hovering || pinned
  const showingGen = wantGen && Boolean(genUrl.url)
  const title = cardTitle(card)
  const client = clientName(card)
  const warning = final ? metricsWarning(final.metrics) : null
  const finalMissing = !final || finalBroken || finalUrl.broken

  const enter = () => {
    if (!genPath) return
    setGenWanted(true)
    setHovering(true)
  }
  const leave = () => setHovering(false)
  const togglePin = () => {
    if (!genPath) return
    setGenWanted(true)
    setPinned((v) => !v)
  }

  const compareTitle = !genPath
    ? 'No generation image to compare with'
    : pinned
      ? 'Showing the generation image. Click to go back to the final.'
      : 'Hover to compare with the generation image; click to keep it on screen.'

  return (
    <li
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white transition-shadow dark:bg-neutral-900 ${
        checked
          ? 'border-neutral-900 ring-2 ring-neutral-900/10 dark:border-white dark:ring-white/20'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}
    >
      <div className="relative">
        <button
          type="button"
          onMouseEnter={enter}
          onMouseLeave={leave}
          onClick={togglePin}
          title={compareTitle}
          aria-pressed={pinned}
          aria-label={showingGen ? `Showing the generation image for ${title}` : `Showing the final PNG for ${title}`}
          className={`block aspect-square w-full outline-none ring-inset ring-neutral-900/20 focus-visible:ring-4 dark:ring-white/30 ${CHECKER}`}
        >
          {showingGen && genUrl.url ? (
            <img src={genUrl.url} alt="" decoding="async" className="h-full w-full object-contain" />
          ) : finalMissing ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-neutral-400">
              <ImageOff className="h-6 w-6" />
              <span className="text-xs">{final ? 'Final could not be loaded' : 'No final file recorded'}</span>
            </div>
          ) : finalUrl.url ? (
            <img
              src={finalUrl.url}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setFinalBroken(true)}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="h-full w-full animate-pulse bg-neutral-200/60 dark:bg-neutral-800/60" />
          )}
        </button>

        <span
          className={`pointer-events-none absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ${
            showingGen ? 'bg-neutral-700/90' : 'bg-emerald-600/90'
          }`}
        >
          {showingGen ? 'Generation' : 'Final'}
        </span>

        <label className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow-sm dark:bg-neutral-900/90">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(card.id)}
            aria-label={`Select ${title}`}
            className="h-4 w-4 accent-neutral-900 dark:accent-white"
          />
        </label>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-3 py-3">
        {final ? (
          <p className="truncate text-xs text-neutral-600 dark:text-neutral-300" title={metricsLabel(final.metrics)}>
            {metricsLabel(final.metrics)}
          </p>
        ) : (
          <p className="text-xs text-neutral-500">No finished job on this card.</p>
        )}
        {warning && (
          <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{warning}</span>
          </p>
        )}

        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={title}>
            {title}
          </p>
          <p className="truncate text-xs text-neutral-500" title={client}>
            {client}
          </p>
          <p className="text-[11px] text-neutral-400" title={formatDate(card.stage_entered_at)}>
            Delivered {ageLabel(card.stage_entered_at, now)} ago · {shortId(card.id)}
          </p>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onDownload(card)}
            disabled={downloading || busy || finalMissing}
            title={finalMissing ? 'There is no final PNG to download' : 'Download the print-ready PNG'}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white outline-none ring-neutral-900/20 hover:bg-neutral-700 focus-visible:ring-4 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:ring-white/30 dark:hover:bg-neutral-200"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download PNG
          </button>
          <Link
            to={`/card/${card.id}`}
            title="Open the card"
            aria-label={`Open card ${title}`}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-neutral-300 p-1.5 outline-none ring-neutral-900/10 hover:bg-neutral-100 focus-visible:ring-4 dark:border-neutral-700 dark:ring-white/20 dark:hover:bg-neutral-800"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <DeleteButton
            onConfirm={() => onDelete(card)}
            disabled={busy}
            disabledReason="Wait for the current download or delete to finish"
            ariaLabel={`Delete ${title}`}
          />
        </div>
      </div>
    </li>
  )
})
