import { useMemo } from 'react'
import { ImageOff } from 'lucide-react'
import { REFS_BUCKET } from '../../lib/supabase'
import { useSignedUrl } from '../../lib/useSignedUrl'
import { isRecord, type Json } from '../../lib/types'
import { JsonTree } from './JsonTree'
import { parseEmbeddedJson, recordEntries } from './json'
import { checkerboard } from './styles'
import { Panel } from './ui'
import type { CardRow } from './useCardData'

const PER_REF_KEYS = ['references', 'refs', 'images', 'reference_analysis', 'per_reference', 'analyses', 'items']

interface SplitAnalysis {
  /** One entry per reference slot when the read is per image. */
  perRef: Array<Json | undefined>
  /** Everything else (style, palette, subject structure, typography…). */
  global: Array<[string, Json]>
}

/**
 * `reference_analysis` is written by the vision pass; its shape is not fixed yet.
 * Accepts an array (one item per reference), an object with a per-reference list
 * under a known key, numbered keys ("1", "ref_2", "image3"), or a flat object of
 * findings. Nothing is dropped: unmatched keys render as key/value.
 */
function splitAnalysis(input: Json | null | undefined, count: number): SplitAnalysis {
  const json = parseEmbeddedJson(input)
  if (json === null || json === undefined) return { perRef: [], global: [] }
  if (Array.isArray(json)) return { perRef: json, global: [] }
  if (!isRecord(json)) return { perRef: [], global: [['analysis', json]] }

  const global: Array<[string, Json]> = []
  let perRef: Array<Json | undefined> = []
  for (const [k, v] of recordEntries(json)) {
    if (!perRef.length && PER_REF_KEYS.includes(k) && Array.isArray(v)) {
      perRef = v
      continue
    }
    global.push([k, v])
  }
  if (!perRef.length && count > 0) {
    const numbered: Array<[number, Json]> = []
    const rest: Array<[string, Json]> = []
    for (const [k, v] of global) {
      const m = /^(?:ref|reference|image|img|slot)?[_\s-]?(\d+)$/i.exec(k)
      if (m) numbered.push([Number(m[1]), v])
      else rest.push([k, v])
    }
    if (numbered.length) {
      perRef = []
      for (const [n, v] of numbered) perRef[n >= 1 ? n - 1 : 0] = v
      return { perRef, global: rest }
    }
  }
  return { perRef, global }
}

function ReferenceSlot({ path, index, analysis }: { path: string; index: number; analysis: Json | undefined }) {
  const { url, broken } = useSignedUrl(REFS_BUCKET, path)
  const hasAnalysis = analysis !== undefined && analysis !== null
  return (
    <li className="min-w-0 space-y-2">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open reference ${index + 1} full size`}
        title="Open full size"
        className={`block aspect-square overflow-hidden rounded-xl border border-neutral-200 outline-none focus-visible:ring-4 focus-visible:ring-neutral-900/10 dark:border-neutral-800 ${checkerboard}`}
      >
        {broken ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-neutral-400">
            <ImageOff className="h-5 w-5" />
            <span className="text-[10px]">Missing</span>
          </div>
        ) : url ? (
          <img
            src={url}
            alt={`Reference ${index + 1}`}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-neutral-200/60 dark:bg-neutral-800/60" />
        )}
      </a>
      <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Reference {index + 1}</p>
      {hasAnalysis && (
        <div className="text-xs">
          <JsonTree value={analysis} depth={1} />
        </div>
      )}
    </li>
  )
}

export function ReferencesPanel({ card }: { card: CardRow }) {
  const paths = card.reference_paths ?? []
  const analysis = useMemo(() => splitAnalysis(card.reference_analysis, paths.length), [card.reference_analysis, paths.length])
  const hasPerRef = analysis.perRef.some((a) => a !== undefined && a !== null)
  const noAnalysis = card.reference_analysis === null || card.reference_analysis === undefined
  const pending = noAnalysis && card.stage === 'intake'

  return (
    <Panel
      title="References"
      subtitle={
        pending
          ? 'Vision read in progress — findings appear when the card reaches review'
          : noAnalysis
            ? 'No reference read stored for this card'
            : 'What the vision pass read from each image'
      }
    >
      {paths.length === 0 ? (
        <p className="text-sm text-neutral-500">No reference images on this card.</p>
      ) : (
        <ul className={`grid gap-3 ${hasPerRef ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-3'}`}>
          {paths.map((p, i) => (
            <ReferenceSlot key={p} path={p} index={i} analysis={analysis.perRef[i]} />
          ))}
        </ul>
      )}
      {analysis.global.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">Reference read</h3>
          <JsonTree value={Object.fromEntries(analysis.global)} />
        </div>
      )}
    </Panel>
  )
}
