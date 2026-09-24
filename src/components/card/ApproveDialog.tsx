import { Sparkles } from 'lucide-react'
import { PLACEMENT_LABEL, parsePrintText, type Placement, type StyleCard } from '../../lib/types'
import { btnPrimary, btnSecondary } from './styles'
import { Dialog, Spinner } from './ui'
import type { CardRow } from './useCardData'

function placementLabel(p: string | null): string {
  if (!p) return 'Not set'
  return (PLACEMENT_LABEL as Record<string, string>)[p as Placement] ?? p
}

/**
 * Confirms the one designer step that spends money: shows the fixed per-card price and
 * the engine model + resolution from Settings that the queued generation will use.
 */
export function ApproveDialog({
  card,
  styleCard,
  price,
  model,
  resolution,
  busy,
  onClose,
  onConfirm,
}: {
  card: CardRow
  styleCard: StyleCard | null
  price: string | null
  /** settings.generation_model, or null while settings are loading. */
  model: string | null
  /** settings.generation_resolution, or null while settings are loading. */
  resolution: string | null
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const lines = parsePrintText(card.print_text)
  const modelName = model?.trim() || null
  const resolutionName = resolution?.trim() || null
  return (
    <Dialog
      open
      title="Approve and generate"
      description="The brief is snapshotted and one generation is queued. This is the step that spends money."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={btnPrimary} data-autofocus>
            {busy ? <Spinner /> : <Sparkles className="h-4 w-4" />}
            Approve for {price ?? '—'}
          </button>
        </>
      }
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-500">Client</dt>
        <dd>{card.clients?.name ?? '—'}</dd>
        <dt className="text-neutral-500">Cost</dt>
        <dd>{price ? `${price} per card` : 'Price not loaded — ask the lead to check Settings'}</dd>
        <dt className="text-neutral-500">Engine</dt>
        <dd>
          {modelName ? (
            <>
              Will generate with <code className="rounded bg-neutral-100 px-1 text-xs dark:bg-neutral-800">{modelName}</code>
              {resolutionName ? ` at ${resolutionName}` : ''}
            </>
          ) : (
            'Model not loaded — ask the lead to check Settings'
          )}
        </dd>
        <dt className="text-neutral-500">Style Card</dt>
        <dd>{styleCard ? `v${styleCard.version} (locked)` : 'None locked'}</dd>
        <dt className="text-neutral-500">Text to print</dt>
        <dd>
          {lines.length ? (
            <ul className="space-y-0.5">
              {lines.map((l, i) => (
                <li key={i}>
                  <span className="text-xs uppercase tracking-wide text-neutral-500">{l.role}</span> “{l.text}”
                </li>
              ))}
            </ul>
          ) : (
            'No text'
          )}
        </dd>
        <dt className="text-neutral-500">Placement</dt>
        <dd>
          {placementLabel(card.placement)}
          {card.garment_color ? ` on ${card.garment_color}` : ''}
        </dd>
      </dl>
      <p className="mt-4 text-xs text-neutral-500">
        Unsaved brief edits are not included — save them first. After approval, edits only reach the next regenerate.
      </p>
    </Dialog>
  )
}
