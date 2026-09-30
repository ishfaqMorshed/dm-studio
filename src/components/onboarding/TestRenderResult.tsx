import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, ImageOff } from 'lucide-react'
import type { TestCard } from '../../lib/api'
import { GENS_BUCKET } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { PlatformBadge } from '../card/PlatformBadge'
import { VERDICT_LABEL, qcTextFound, qcVerdict } from '../card/qc'
import { VERDICT_CLASS, checkerboard, imageChip } from '../card/styles'
import { Badge } from '../card/ui'
import { useCardGenerations } from '../card/useCardData'
import { formatDateTime } from '../style/format'
import { readTestSubmission } from './testRenderInput'

/**
 * The finished test render, large, with its QC verdict, the subject and text lines it was made
 * with, and the caller's action row. Mount with `key={card.id}`; generations arrive live
 * (realtime on `generations`).
 */
export function TestRenderResult({ card, actions }: { card: TestCard; actions: ReactNode }) {
  const generations = useCardGenerations(card.id)
  const gen = useMemo(
    () => generations.rows.find((g) => g.id === card.current_generation_id) ?? generations.rows[0] ?? null,
    [generations.rows, card.current_generation_id],
  )
  const image = useSignedUrl(GENS_BUCKET, gen?.image_path)
  const verdict = qcVerdict(gen?.qc_report)
  const textFound = qcTextFound(gen?.qc_report)
  const submission = useMemo(() => readTestSubmission(card), [card])

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

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-neutral-500">Subject</dt>
        <dd className="font-medium">{submission.subject ?? 'Not recorded (rendered before subjects were asked for)'}</dd>
        <dt className="text-neutral-500">Text</dt>
        <dd>
          {submission.lines.length ? (
            <ul className="flex flex-wrap gap-x-2 gap-y-0.5" aria-label="Text lines">
              {submission.lines.map((l, i) => (
                <li key={`${l.role}-${i}`} className={i === 0 ? 'font-medium' : ''}>
                  {l.text}
                  {i < submission.lines.length - 1 && <span className="ml-2 text-neutral-400">/</span>}
                </li>
              ))}
            </ul>
          ) : (
            '—'
          )}
        </dd>
      </dl>

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

      <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
    </div>
  )
}
