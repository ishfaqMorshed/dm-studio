import { AlertTriangle } from 'lucide-react'
import type { ClientReference, StyleDraftRequest } from '../../lib/types'
import { StatusPill } from '../clientPanel/StatusPill'
import { useNow } from '../card/useNow'
import { EvidenceStrip } from './EvidencePanel'
import { formatElapsed } from './steps'

const SLOW_MS = 3 * 60 * 1000

/** The running analysis: status, phase text, elapsed time, what is being read. Mounted only while drafting. */
export function DraftProgress({ latest, read, stale }: { latest: StyleDraftRequest; read: ClientReference[]; stale: boolean }) {
  const now = useNow(1000)
  const started = Date.parse(latest.created_at)
  const elapsed = Number.isNaN(started) ? 0 : now - started
  const phase =
    latest.status === 'queued'
      ? 'Waiting for the profiler to pick it up'
      : `Reading ${read.length} image${read.length === 1 ? '' : 's'} and the brief…`

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={latest.status} />
        <p role="status" className="text-sm">
          {phase}
        </p>
        <span className="ml-auto font-mono text-xs tabular-nums text-neutral-500" aria-hidden="true">
          {formatElapsed(elapsed)}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" aria-hidden="true">
        <div className="h-full w-1/3 rounded-full bg-accent-500 motion-safe:animate-pulse" />
      </div>
      <p className="text-[11px] text-neutral-500">Usually 30–40 s; the result appears here by itself.</p>
      {read.length > 0 && <EvidenceStrip read={read} />}
      {(elapsed > SLOW_MS || stale) && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Taking longer than usual. You can wait or start another{stale ? ': the button is back' : ' once the button comes back'}.
          </span>
        </p>
      )}
    </div>
  )
}
