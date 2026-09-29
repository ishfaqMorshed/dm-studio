import { useState, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { PLACEMENT_LABEL, parsePrintText, type AiPlatform, type Placement, type StyleCard } from '../../lib/types'
import { PlatformPicker } from '../PlatformPicker'
import { btnPrimary, btnSecondary } from './styles'
import { Dialog, Spinner } from './ui'
import type { CardRow } from './useCardData'

function placementLabel(p: string | null): string {
  if (!p) return 'Not set'
  return (PLACEMENT_LABEL as Record<string, string>)[p as Placement] ?? p
}

const codeCls = 'rounded bg-neutral-100 px-1 text-xs dark:bg-neutral-800'

/** "Will generate with <model> at 2K", for the platform picked in the dialog. */
function engineLine(platform: AiPlatform, kieModel: string | null, openRouterModel: string | null, resolution: string | null): ReactNode {
  const at = resolution ? ` at ${resolution}` : ''
  const code = (m: string) => <code className={codeCls}>{m}</code>
  if (platform === 'openrouter') {
    return openRouterModel ? <>Will generate on OpenRouter with {code(openRouterModel)}{at}</> : <>Will generate on OpenRouter{at}</>
  }
  if (!kieModel) return 'Model not loaded — ask the lead to check Settings'
  if (platform === 'auto') {
    return (
      <>
        Will generate with {code(kieModel)}
        {at} on Kie{openRouterModel ? <>, or {code(openRouterModel)} on OpenRouter if Kie is down</> : ', or on OpenRouter if Kie is down'}
      </>
    )
  }
  return <>Will generate with {code(kieModel)}{at}</>
}

/**
 * Confirms the one designer step that spends money: shows the fixed per-card price and
 * the engine model + resolution from Settings that the queued generation will use, and
 * lets the designer pick the AI platform for this run (preselected to the studio default).
 */
export function ApproveDialog({
  card,
  styleCard,
  price,
  model,
  openRouterModel,
  resolution,
  defaultPlatform,
  busy,
  onClose,
  onConfirm,
}: {
  card: CardRow
  styleCard: StyleCard | null
  price: string | null
  /** settings.generation_model, or null while settings are loading. */
  model: string | null
  /** settings.openrouter_models.image, or null when not set / not loaded. */
  openRouterModel: string | null
  /** settings.generation_resolution, or null while settings are loading. */
  resolution: string | null
  /** settings.ai_platform (Kie while settings are loading). */
  defaultPlatform: AiPlatform
  busy: boolean
  onClose: () => void
  onConfirm: (platform: AiPlatform) => void
}) {
  const lines = parsePrintText(card.print_text)
  // Follows the studio default until the designer picks one.
  const [picked, setPicked] = useState<AiPlatform | null>(null)
  const platform = picked ?? defaultPlatform
  const modelName = model?.trim() || null
  const openRouterName = openRouterModel?.trim() || null
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
          <button type="button" onClick={() => onConfirm(platform)} disabled={busy} className={btnPrimary} data-autofocus>
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
        <dd>{engineLine(platform, modelName, openRouterName, resolutionName)}</dd>
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
      <PlatformPicker
        value={platform}
        onChange={setPicked}
        disabled={busy}
        studioDefault={defaultPlatform}
        size="sm"
        className="mt-4"
      />
      <p className="mt-4 text-xs text-neutral-500">
        Unsaved brief edits are not included — save them first. After approval, edits only reach the next regenerate.
      </p>
    </Dialog>
  )
}
