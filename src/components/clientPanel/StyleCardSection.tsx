import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, PencilLine, WandSparkles } from 'lucide-react'
import { requestStyleDraft } from '../../lib/api'
import { ACTIVE_JOB_STATUSES, errorMessage, type JobStatus, type StyleCard, type StyleDraftRequest } from '../../lib/types'
import type { StyleDraftRequestsResult } from '../../lib/useStyleDraftRequests'
import { useToast } from '../../lib/useToast'
import { btnPrimary, btnSecondary } from '../style/classes'
import { formatDateTime } from '../style/format'
import { LIBRARY_MIN_RECOMMENDED } from './libraryFiles'
import { n8nExecutionUrl } from './links'
import { Section } from './Section'
import { StatusPill } from './StatusPill'

/** A request still queued/working after this long is treated as stuck and the button comes back. */
const STALE_MS = 10 * 60 * 1000

const ACTIVE_PHRASE: Record<JobStatus, string> = {
  queued: 'queued',
  dispatched: 'starting',
  working: 'being drafted',
  done: 'done',
  failed: 'failed',
}

function ageMinutes(iso: string, now: number): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : Math.max(0, Math.round((now - t) / 60_000))
}

/**
 * Style Card status for the client, the "Draft Style Card from library" action and the live
 * list of draft requests (Realtime + 5 s poll via useStyleDraftRequests).
 */
export function StyleCardSection({
  clientId,
  clientName,
  versions,
  currentLocked,
  drafts,
  libraryCount,
  libraryLoading,
  requests,
  isLead,
  n8nBase,
}: {
  clientId: string
  clientName: string
  /** Every version, newest first (to name the draft a request produced). */
  versions: StyleCard[]
  currentLocked: StyleCard | null
  /** Open draft versions. */
  drafts: StyleCard[]
  libraryCount: number
  libraryLoading: boolean
  requests: StyleDraftRequestsResult
  isLead: boolean
  n8nBase: string | null | undefined
}) {
  const toast = useToast()
  const [requesting, setRequesting] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const editorLink = `/clients/${clientId}/style`

  // The stale check needs a clock; once a minute is plenty.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  const active = requests.drafting ? requests.latest : null
  const stale = active !== null && now - Date.parse(active.created_at) > STALE_MS

  const disabledReason = requesting
    ? 'Queuing the draft…'
    : libraryLoading
      ? 'Loading the library…'
      : libraryCount === 0
        ? 'Add reference images to the library first; the draft is read from them.'
        : active && !stale
          ? `A draft is already ${ACTIVE_PHRASE[active.status]}. Wait for it to finish.`
          : requests.loading
            ? 'Checking for a running draft…'
            : null

  async function draft() {
    setRequesting(true)
    try {
      const row = await requestStyleDraft(clientId)
      requests.upsertLocal(row)
      toast.success(
        `Drafting a Style Card from ${libraryCount} image${libraryCount === 1 ? '' : 's'}. It appears here as a new draft version in about a minute.`,
      )
    } catch (e) {
      toast.error(`Could not queue the draft: ${errorMessage(e)}`)
    } finally {
      setRequesting(false)
    }
  }

  const nextVersion = (versions[0]?.version ?? 0) + 1

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          Style Card
          {currentLocked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />v{currentLocked.version} locked
            </span>
          )}
        </span>
      }
      subtitle="Selecting this client anywhere means: generate with this locked Style Card."
      tone={currentLocked ? 'good' : 'bad'}
      actions={
        <Link to={editorLink} className={btnSecondary}>
          <ExternalLink className="h-4 w-4" />
          Open editor
        </Link>
      }
    >
      {currentLocked ? (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <p className="font-medium">Current: v{currentLocked.version}</p>
          <p className="text-xs">
            Locked {formatDateTime(currentLocked.locked_at)}
            {currentLocked.note ? ` · ${currentLocked.note}` : ''}. New cards for {clientName} snapshot this version.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">No locked Style Card yet</p>
            <p className="text-xs">
              Cards for {clientName} cannot be approved until a version is locked. Draft one from the library below, then
              review and lock it in the editor.
            </p>
          </div>
        </div>
      )}

      {drafts.length > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <PencilLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Draft v{drafts[0].version} is open and waiting for review.{' '}
            <Link to={editorLink} className="font-medium underline underline-offset-2">
              Review and lock it
            </Link>
            {drafts.length > 1 ? ` (${drafts.length - 1} older draft${drafts.length - 1 === 1 ? '' : 's'} too).` : '.'}
          </span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void draft()}
          disabled={disabledReason !== null}
          title={disabledReason ?? `Reads the ${libraryCount} library image${libraryCount === 1 ? '' : 's'} and drafts v${nextVersion}`}
          className={btnPrimary}
        >
          {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
          Draft Style Card from library
        </button>
        <p className="text-[11px] text-neutral-500">
          {disabledReason ??
            (libraryCount < LIBRARY_MIN_RECOMMENDED
              ? `Reads ${libraryCount} image${libraryCount === 1 ? '' : 's'} and writes draft v${nextVersion}. ${LIBRARY_MIN_RECOMMENDED} or more images give a stronger read.`
              : `Reads ${libraryCount} images and writes draft v${nextVersion} for you to review and lock.`)}
        </p>
      </div>

      {active && stale && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          The last request has been {ACTIVE_PHRASE[active.status]} for {ageMinutes(active.created_at, now)} min, longer
          than a draft should take. You can queue another; {isLead ? 'the n8n run link below shows what happened.' : 'tell the lead if it keeps happening.'}
        </p>
      )}

      <h3 className="mb-1.5 mt-5 text-xs font-medium uppercase tracking-wide text-neutral-500">Draft requests</h3>
      {requests.error && (
        <p role="alert" className="mb-2 text-xs text-red-700 dark:text-red-300">
          Could not load the requests: {requests.error}
        </p>
      )}
      {requests.loading && requests.requests.length === 0 ? (
        <p className="flex items-center gap-2 text-xs text-neutral-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : requests.requests.length === 0 ? (
        <p className="text-xs text-neutral-500">No drafts requested yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {requests.requests.map((r) => (
            <RequestRow key={r.id} request={r} versions={versions} editorLink={editorLink} isLead={isLead} n8nBase={n8nBase} />
          ))}
        </ul>
      )}
    </Section>
  )
}

function RequestRow({
  request: r,
  versions,
  editorLink,
  isLead,
  n8nBase,
}: {
  request: StyleDraftRequest
  versions: StyleCard[]
  editorLink: string
  isLead: boolean
  n8nBase: string | null | undefined
}) {
  const produced = r.style_card_id ? versions.find((v) => v.id === r.style_card_id) ?? null : null
  const running = ACTIVE_JOB_STATUSES.includes(r.status)
  const n8nUrl = isLead ? n8nExecutionUrl(n8nBase, r.n8n_execution_id) : null
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
      <StatusPill status={r.status} />
      <span className="text-neutral-500">Requested {formatDateTime(r.created_at)}</span>
      {running && <span className="text-neutral-500">Reading the library… usually 30–90 s.</span>}
      {r.status === 'done' && (
        <Link to={editorLink} className="font-medium text-neutral-900 underline underline-offset-2 dark:text-neutral-100">
          {produced
            ? produced.status === 'locked'
              ? `Open v${produced.version} (locked since)`
              : `Open draft v${produced.version}`
            : 'Open in editor'}
        </Link>
      )}
      {r.status === 'failed' && (
        <span className="text-red-700 dark:text-red-300" title={r.last_error ?? undefined}>
          {r.last_error?.trim() || 'Failed without a message. Try again; if it fails twice, tell the lead.'}
        </span>
      )}
      {n8nUrl && (
        <a
          href={n8nUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-neutral-500 underline-offset-2 hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          n8n run
        </a>
      )}
    </li>
  )
}
