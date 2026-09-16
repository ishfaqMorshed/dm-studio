import { Fragment } from 'react'
import { isRecord, type Json } from '../../lib/types'
import { humanizeKey, isPrimitive, jsonToText } from './json'

const MAX_DEPTH = 4

/**
 * Key/value rendering for JSON of unknown shape (reference reads, Style Card
 * details, QC extras). Objects become definition lists, arrays of primitives
 * become chips, nested arrays become numbered blocks; past MAX_DEPTH it prints JSON.
 */
export function JsonTree({ value, depth = 0 }: { value: Json | undefined; depth?: number }) {
  if (value === undefined || value === null) return <span className="text-neutral-400">—</span>
  if (isPrimitive(value)) return <span className="whitespace-pre-wrap break-words">{jsonToText(value)}</span>
  if (depth >= MAX_DEPTH) {
    return (
      <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-2 text-xs dark:bg-neutral-800">{jsonToText(value)}</pre>
    )
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-neutral-400">none</span>
    if (value.every((v) => isPrimitive(v))) {
      return (
        <ul className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <li key={i} className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
              {jsonToText(v) || '—'}
            </li>
          ))}
        </ul>
      )
    }
    return (
      <ol className="space-y-1.5">
        {value.map((v, i) => (
          <li key={i} className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
            <JsonTree value={v} depth={depth + 1} />
          </li>
        ))}
      </ol>
    )
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).filter((e): e is [string, Json] => e[1] !== undefined)
    if (!entries.length) return <span className="text-neutral-400">empty</span>
    return (
      <dl className="grid grid-cols-[minmax(5rem,10rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        {entries.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="pt-0.5 text-xs font-medium uppercase tracking-wide text-neutral-500">{humanizeKey(k)}</dt>
            <dd className="min-w-0">
              <JsonTree value={v} depth={depth + 1} />
            </dd>
          </Fragment>
        ))}
      </dl>
    )
  }
  return <span>{jsonToText(value)}</span>
}
