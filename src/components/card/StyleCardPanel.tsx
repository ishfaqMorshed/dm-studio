import { Link } from 'react-router-dom'
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react'
import { isRecord, type Json, type StyleCard } from '../../lib/types'
import { JsonTree } from './JsonTree'
import { formatDateTime } from './format'
import { pickString, stringList } from './json'
import { btnSecondary, btnSmall } from './styles'
import { Badge, Panel, Spinner } from './ui'
import type { CardRow } from './useCardData'

interface Swatch {
  name: string | null
  hex: string | null
  weight: string | null
}

function swatchesOf(palette: Json | undefined): Swatch[] {
  if (!Array.isArray(palette)) return []
  const out: Swatch[] = []
  for (const p of palette) {
    if (isRecord(p)) {
      out.push({
        name: pickString(p, ['name', 'label']),
        hex: pickString(p, ['hex', 'color', 'colour', 'value']),
        weight: pickString(p, ['weight', 'role', 'usage']),
      })
    } else if (typeof p === 'string') {
      const isHex = /^#?[0-9a-f]{3,8}$/i.test(p.trim())
      out.push({ name: isHex ? null : p, hex: isHex ? p : null, weight: null })
    }
  }
  return out
}

function cssColour(hex: string | null): string | undefined {
  if (!hex) return undefined
  const h = hex.trim()
  return /^[0-9a-f]{3,8}$/i.test(h) ? `#${h}` : h
}

/** Compact reading of the Style Card schema (section 07); falls back to key/value for anything else. */
function StyleSummary({ json }: { json: Json }) {
  if (!isRecord(json)) return <JsonTree value={json} />
  const medium = typeof json.medium === 'string' ? json.medium : null
  const swatches = swatchesOf(json.palette)
  const mood = stringList(json.mood)
  const forbid = stringList(json.forbid)
  const typography = isRecord(json.typography)
    ? [pickString(json.typography, ['vibe', 'style', 'font']), pickString(json.typography, ['placement'])]
        .filter(Boolean)
        .join(' · ')
    : typeof json.typography === 'string'
      ? json.typography
      : null
  const composition = typeof json.composition === 'string' ? json.composition : null

  return (
    <div className="space-y-2 text-sm">
      {medium && <p>{medium}</p>}
      {swatches.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Palette">
          {swatches.map((s, i) => (
            <li
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 py-0.5 pl-1 pr-2 text-xs dark:border-neutral-700"
              title={[s.name, s.hex, s.weight].filter(Boolean).join(' · ')}
            >
              <span
                className="h-4 w-4 rounded-full border border-black/10"
                style={{ backgroundColor: cssColour(s.hex) ?? 'transparent' }}
                aria-hidden="true"
              />
              <span>{s.name ?? s.hex ?? '—'}</span>
              {s.weight && <span className="text-neutral-500">{s.weight}</span>}
            </li>
          ))}
        </ul>
      )}
      {typography && (
        <p>
          <span className="text-neutral-500">Type:</span> {typography}
        </p>
      )}
      {composition && (
        <p>
          <span className="text-neutral-500">Composition:</span> {composition}
        </p>
      )}
      {mood.length > 0 && (
        <p>
          <span className="text-neutral-500">Mood:</span> {mood.join(', ')}
        </p>
      )}
      {forbid.length > 0 && (
        <p className="text-red-700 dark:text-red-300">
          <span className="text-neutral-500">Never:</span> {forbid.join(', ')}
        </p>
      )}
      <details className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <summary className="cursor-pointer text-xs font-medium text-neutral-600 dark:text-neutral-400">Full Style Card</summary>
        <div className="mt-2">
          <JsonTree value={json} />
        </div>
      </details>
    </div>
  )
}

export function StyleCardPanel({
  card,
  styleCard,
  loading,
  error,
  collapsible,
  defaultOpen,
}: {
  card: CardRow
  styleCard: StyleCard | null
  loading: boolean
  error: string | null
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const editorLink = `/clients/${card.client_id}/style`
  // Stays in `actions`: a collapsible Panel renders those in the body, never in the summary.
  const openEditor = (
    <Link to={editorLink} className={`${btnSecondary} ${btnSmall}`}>
      <ExternalLink className="h-3.5 w-3.5" />
      Style Card editor
    </Link>
  )
  const fold = { collapsible, defaultOpen }

  if (loading) {
    return (
      <Panel title="Style Card" actions={openEditor} {...fold}>
        <p className="flex items-center gap-2 text-sm text-neutral-500">
          <Spinner /> Checking for a locked version…
        </p>
      </Panel>
    )
  }

  if (error) {
    return (
      <Panel title="Style Card" tone="bad" actions={openEditor} {...fold}>
        <p className="text-sm text-red-700 dark:text-red-300">Could not load the Style Card: {error}</p>
      </Panel>
    )
  }

  if (!styleCard) {
    return (
      <Panel title="Style Card" tone="bad" actions={openEditor} {...fold}>
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">No locked Style Card</p>
            <p className="text-xs">
              Generate stays disabled until a version is locked for {card.clients?.name ?? 'this client'}. Open the editor, review
              the draft, then Lock.
            </p>
          </div>
        </div>
      </Panel>
    )
  }

  const approvedWith = card.style_card_version
  const mismatch = approvedWith !== null && approvedWith !== styleCard.version

  return (
    <Panel
      title={
        <span className="inline-flex items-center gap-2">
          Style Card
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />v{styleCard.version} locked
          </Badge>
        </span>
      }
      subtitle={`Locked ${formatDateTime(styleCard.locked_at)}${styleCard.note ? ` · ${styleCard.note}` : ''}`}
      tone="good"
      actions={openEditor}
      {...fold}
    >
      {mismatch && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          This card was approved with v{approvedWith}. Edits and regenerations keep using that snapshot; v{styleCard.version}{' '}
          applies to new cards.
        </p>
      )}
      <StyleSummary json={styleCard.json} />
    </Panel>
  )
}
