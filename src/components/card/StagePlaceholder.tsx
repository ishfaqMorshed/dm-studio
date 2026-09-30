import type { ReactNode } from 'react'
import { ImageOff, Sparkles } from 'lucide-react'
import { isAutomated } from '../../lib/stage'
import { PRINT_TEXT_ROLE_LABEL, parsePrintText, type StyleCard } from '../../lib/types'
import { VERDICT_CLASS } from './styles'
import { Badge, Spinner } from './ui'
import type { CardRow } from './useCardData'

const centeredCls = 'absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-neutral-500'
const tileCls =
  'absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-accent-300 bg-accent-50/40 px-6 text-center dark:border-accent-700 dark:bg-accent-950/20'

/**
 * Fills the picture frame while the card has no generation to show.
 * - generations still loading → spinner (never the Review tile for a card that has images)
 * - intake / automated stages → spinner with what the pipeline is doing
 * - review → the "Nothing generated yet" tile. With `onGenerate` the tile itself is a button
 *   that opens the Generate dialog (the paid confirm stays in the dialog); without it
 *   (paused, no locked Style Card) the tile is inert and the rail lists the reason.
 * - anything else → a neutral note
 */
export function StagePlaceholder({
  card,
  price,
  styleCard,
  loading = false,
  onGenerate,
}: {
  card: CardRow
  price: string | null
  styleCard: StyleCard | null
  loading?: boolean
  /** Opens the Generate dialog; pass it only when generating is possible right now. */
  onGenerate?: () => void
}) {
  if (loading) {
    return (
      <div className={centeredCls} role="status">
        <Spinner className="h-6 w-6" />
        <p>Loading generations…</p>
      </div>
    )
  }
  if (card.stage === 'intake' || isAutomated(card.stage)) {
    return (
      <div className={centeredCls} role="status">
        <Spinner className="h-6 w-6" />
        <p>
          {card.stage === 'intake'
            ? 'Reading the references — the card moves to Review by itself.'
            : 'Queued — the image appears here when the worker finishes.'}
        </p>
      </div>
    )
  }
  if (card.stage !== 'review') {
    return (
      <div className={centeredCls}>
        <ImageOff className="h-6 w-6" />
        <p>{card.stage === 'waiting' ? 'No generation yet — resume the card to generate.' : 'No generation to show.'}</p>
      </div>
    )
  }

  const lines = parsePrintText(card.print_text)
  // Phrasing content only: the same body sits inside a <button> when generating is possible.
  const body: ReactNode = (
    <>
      <Sparkles className="h-8 w-8 text-accent-600 dark:text-accent-300" aria-hidden="true" />
      <span className="block font-display text-lg font-semibold">Nothing generated yet</span>
      <span className="block text-sm text-neutral-600 dark:text-neutral-400">
        {price ? `${price} · ` : ''}uses the brief and the locked Style Card.
      </span>
      {lines.length ? (
        <span className="flex flex-wrap justify-center gap-1.5" aria-label="Text to print">
          {lines.map((l, i) => (
            <span key={i} className="rounded-full bg-white/80 px-2.5 py-1 text-xs dark:bg-neutral-900/70">
              <span className="mr-1 text-[10px] uppercase tracking-wide text-neutral-500">{PRINT_TEXT_ROLE_LABEL[l.role]}</span>“{l.text}”
            </span>
          ))}
        </span>
      ) : (
        <span className="block text-xs text-neutral-500">No text on this design</span>
      )}
      {styleCard ? (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">Style Card v{styleCard.version} locked</Badge>
      ) : (
        <Badge className={VERDICT_CLASS.fail}>No locked Style Card</Badge>
      )}
    </>
  )

  if (onGenerate) {
    return (
      <button
        type="button"
        onClick={onGenerate}
        title="Opens the Generate dialog — nothing is spent until you confirm there"
        className={`group ${tileCls} cursor-pointer outline-none ring-inset ring-accent-500/30 transition hover:bg-accent-50/70 focus-visible:ring-4 dark:ring-accent-400/40 dark:hover:bg-accent-950/40`}
      >
        {body}
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent-600 px-3 py-1 text-xs font-medium text-white shadow-card transition group-hover:bg-accent-700 dark:bg-accent-500 dark:group-hover:bg-accent-400">
          Generate the design{price ? ` · ${price}` : ''} →
        </span>
      </button>
    )
  }
  return <div className={tileCls}>{body}</div>
}
