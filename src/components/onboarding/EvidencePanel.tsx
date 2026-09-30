import { useMemo, useState } from 'react'
import { AlertTriangle, Eye } from 'lucide-react'
import type { ClientReference, StyleCard } from '../../lib/types'
import { normalizeStyleCard } from '../style/styleCardSchema'
import { citationCounts, citesAll, evidenceCaveats, maxCited, parseEvidence, type EvidenceItem } from './evidence'
import { asOfProfilerOrder } from './profilerOrder'
import { RefThumb } from './RefThumb'
import { readEvidence, readReferenceIds } from './styleCardRead'

/** A missing image (removed from the library since the analysis) keeps its number as a dashed box. */
function MissingThumb({ number, className = 'h-[72px] w-[72px]', rounded = 'rounded-lg' }: { number: number; className?: string; rounded?: string }) {
  return (
    <span
      title={`Image ${number} not in library`}
      className={`flex shrink-0 items-center justify-center border border-dashed border-neutral-400 bg-neutral-100 text-xs text-neutral-500 dark:border-neutral-600 dark:bg-neutral-800 ${rounded} ${className}`}
    >
      {number}?
    </span>
  )
}

/** The numbered thumbnails the profiler reads (or read), in its order. Scrolls sideways at 560 px. */
export function EvidenceStrip({
  read,
  exceptionNumbers,
  counts,
  filter,
  highlight,
  onToggle,
}: {
  /** Null = the profiler saw an image that is no longer in the library. */
  read: Array<ClientReference | null>
  exceptionNumbers?: ReadonlySet<number>
  /** citationCounts(): index = image number. */
  counts?: readonly number[]
  filter?: number | null
  /** Numbers to ring while a note row is hovered / focused. */
  highlight?: ReadonlySet<number>
  onToggle?: (n: number) => void
}) {
  return (
    <ol className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" aria-label="Images the analysis read, in order">
      {read.map((ref, i) => {
        const n = i + 1
        const k = counts?.[n] ?? 0
        const exception = exceptionNumbers?.has(n) ?? false
        const ringed = highlight?.has(n) ?? false
        const pressed = filter === n
        const inner = ref ? (
          <>
            <RefThumb ref_={ref} number={n} />
            {ref.note?.trim() && (
              <span className="mt-0.5 block w-[72px] truncate text-[10px] text-neutral-500" title={ref.note}>
                {ref.note}
              </span>
            )}
          </>
        ) : (
          <MissingThumb number={n} />
        )
        const ring = `${pressed ? 'ring-4 ring-accent-500/40' : ringed ? 'ring-4 ring-accent-400/60' : exception ? 'ring-2 ring-amber-400' : ''}`
        return (
          <li key={ref?.id ?? `missing-${n}`} className="snap-start">
            {onToggle ? (
              <button
                type="button"
                onClick={() => onToggle(n)}
                aria-pressed={pressed}
                title={`Image ${n}: cited in ${k} note${k === 1 ? '' : 's'}${exception ? ' · flagged as an exception' : ''}`}
                className={`block rounded-lg text-left outline-none focus-visible:ring-4 focus-visible:ring-accent-500/30 ${ring}`}
              >
                {inner}
              </button>
            ) : (
              <span className={`block rounded-lg ${ring}`}>{inner}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * "What the profiler saw": the numbered images reconstructed for the draft's timestamp and every
 * evidence note lined up with the images it cites. Exceptions (disagreements) come first.
 */
export function EvidencePanel({
  version,
  refs,
  readCap,
}: {
  version: StyleCard
  refs: ClientReference[]
  readCap: number
}) {
  const [filter, setFilter] = useState<number | null>(null)
  const [hovered, setHovered] = useState<ReadonlySet<number> | null>(null)

  const doc = useMemo(() => normalizeStyleCard(version.json), [version.json])
  const items = useMemo(() => parseEvidence(readEvidence(doc.extra)), [doc])
  // WF-1b (studio_19+) records the ids it sent, in IMAGE 1..N order: exact. Older drafts are
  // reconstructed from the library as it stood at the draft's timestamp.
  const referenceIds = useMemo(() => readReferenceIds(doc.extra), [doc])
  const exact = referenceIds.length > 0
  const order = useMemo(() => asOfProfilerOrder(refs, readCap, version.created_at), [refs, readCap, version.created_at])
  const read = useMemo<Array<ClientReference | null>>(() => {
    if (!exact) return order.read
    const byId = new Map(refs.map((r) => [r.id, r]))
    return referenceIds.map((id) => byId.get(id) ?? null)
  }, [exact, order.read, refs, referenceIds])
  const n = read.length
  const present = read.filter((r): r is ClientReference => r !== null).length
  const highest = maxCited(items)
  const counts = useMemo(() => citationCounts(items, Math.max(n, highest)), [items, n, highest])
  const refsNewerThanDraft = refs.some((r) => r.created_at > version.created_at)
  const caveats = evidenceCaveats({
    items,
    reconstructedCount: exact ? n : present,
    refsNewerThanDraft,
    tiedCreatedAt: !exact && order.tiedCreatedAt,
    missingCount: exact ? n - present : 0,
  })

  const exceptionNumbers = useMemo(() => {
    const set = new Set<number>()
    for (const it of items) if (it.exception) for (const num of it.numbers) set.add(num)
    return set
  }, [items])

  const parsed = items.filter((it) => it.parsed)
  const unparsed = items.filter((it) => !it.parsed)
  const visible = filter === null ? parsed : parsed.filter((it) => it.numbers.includes(filter))
  const exceptions = visible.filter((it) => it.exception)
  const rest = visible.filter((it) => !it.exception)

  const byNumber = (num: number): ClientReference | null => read[num - 1] ?? null
  const strip = read

  return (
    <section aria-labelledby={`evidence-${version.id}`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`evidence-${version.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Eye className="h-4 w-4 text-neutral-500" aria-hidden="true" />
          What the profiler saw
          {n > 0 && (
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
              {n} image{n === 1 ? '' : 's'}
            </span>
          )}
        </h3>
        {filter !== null && (
          <p className="text-xs text-neutral-600 dark:text-neutral-300">
            Showing notes about image {filter} ·{' '}
            <button type="button" onClick={() => setFilter(null)} className="font-medium underline underline-offset-2">
              Show all
            </button>
          </p>
        )}
      </div>

      {n > 0 ? (
        <EvidenceStrip
          read={strip}
          exceptionNumbers={exceptionNumbers}
          counts={counts}
          filter={filter}
          highlight={hovered ?? undefined}
          onToggle={(num) => setFilter((f) => (f === num ? null : num))}
        />
      ) : (
        <p className="text-xs text-neutral-500">No library images from before this analysis are in the library today.</p>
      )}

      {caveats.length > 0 && (
        <ul className="space-y-1">
          {caveats.map((c) => (
            <li
              key={c.text}
              className={`flex items-start gap-1.5 text-[11px] ${
                c.tone === 'warn' ? 'text-amber-800 dark:text-amber-300' : 'text-neutral-500'
              }`}
            >
              {c.tone === 'warn' && <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />}
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      )}

      {exceptions.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-900/60 dark:bg-amber-950/40">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Disagreements ({exceptions.length})
          </p>
          <ul className="divide-y divide-amber-200/70 dark:divide-amber-900/50">
            {exceptions.map((it) => (
              <EvidenceRow key={it.raw} item={it} n={n} byNumber={byNumber} onHover={setHovered} exception />
            ))}
          </ul>
        </div>
      )}

      {rest.length > 0 && (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {rest.map((it) => (
            <EvidenceRow key={it.raw} item={it} n={n} byNumber={byNumber} onHover={setHovered} />
          ))}
        </ul>
      )}

      {filter !== null && visible.length === 0 && (
        <p className="text-xs text-neutral-500">No note cites image {filter}.</p>
      )}

      {unparsed.length > 0 && filter === null && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Other notes</p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-neutral-700 dark:text-neutral-300">
            {unparsed.map((it) => (
              <li key={it.raw}>{it.raw}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

const MINI_MAX = 4
/** The profiler writes "exception - …"; the row already carries the bold label, so the word is not repeated. */
const EXCEPTION_PREFIX_RE = /^exception\s*[-–:]?\s*/i

function EvidenceRow({
  item,
  n,
  byNumber,
  onHover,
  exception = false,
}: {
  item: EvidenceItem
  n: number
  byNumber: (num: number) => ClientReference | null
  onHover: (set: ReadonlySet<number> | null) => void
  exception?: boolean
}) {
  const all = citesAll(item.numbers, n)
  const label = all ? 'All images' : `Image${item.numbers.length === 1 ? '' : 's'} ${item.numbers.join(', ')}`
  const shown = item.numbers.slice(0, MINI_MAX)
  const overflow = item.numbers.length - shown.length
  const set = new Set(item.numbers)
  return (
    <li
      tabIndex={0}
      onMouseEnter={() => onHover(set)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(set)}
      onBlur={() => onHover(null)}
      className="flex items-start gap-2 rounded py-1.5 outline-none focus-visible:ring-4 focus-visible:ring-accent-500/30"
    >
      <span className="flex shrink-0 -space-x-2" aria-hidden="true">
        {shown.map((num) => {
          const ref = byNumber(num)
          return ref ? (
            <RefThumb key={num} ref_={ref} number={null} showNumber={false} className="h-6 w-6" rounded="rounded" />
          ) : (
            <span
              key={num}
              title={`Image ${num} not in library`}
              className="flex h-6 w-6 items-center justify-center rounded border border-dashed border-neutral-400 bg-neutral-100 text-[10px] text-neutral-500 dark:border-neutral-600 dark:bg-neutral-800"
            >
              ?
            </span>
          )
        })}
        {overflow > 0 && (
          <span className="flex h-6 min-w-6 items-center justify-center rounded bg-neutral-200 px-1 text-[10px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
            +{overflow}
          </span>
        )}
      </span>
      <p className="min-w-0 flex-1 text-xs text-neutral-800 dark:text-neutral-200">
        <span className="font-semibold">{label}:</span>{' '}
        {exception && <span className="font-semibold text-amber-800 dark:text-amber-300">Exception. </span>}
        {exception ? item.text.replace(EXCEPTION_PREFIX_RE, '') : item.text}
      </p>
    </li>
  )
}
