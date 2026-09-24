import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Archive, CheckSquare, Download, Loader2, RefreshCw, Search, Square } from 'lucide-react'
import { DeleteButton } from '../components/DeleteButton'
import { CompletedTile } from '../components/completed/CompletedTile'
import { deleteDeliveredCard } from '../components/completed/deleteCard'
import { cardTitle, clientName, finalFileName, pickFinal, type DeliveredCard } from '../components/completed/finals'
import { useDeliveredCards } from '../components/completed/useDeliveredCards'
import { downloadAsZip, downloadFile, type DownloadItem, type ZipProgress } from '../lib/download'
import { FINALS_BUCKET } from '../lib/supabase'
import { useClientScope } from '../lib/useClientScope'
import { useToast } from '../lib/useToast'
import { errorMessage } from '../lib/types'

const AGE_TICK_MS = 30_000

const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium outline-none ring-accent-500/25 hover:bg-neutral-100 focus-visible:ring-4 disabled:opacity-40 dark:border-neutral-700 dark:ring-accent-400/30 dark:hover:bg-neutral-800'
const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-card outline-none ring-accent-500/30 hover:bg-accent-700 focus-visible:ring-4 disabled:opacity-40 dark:bg-accent-500 dark:ring-accent-400/40 dark:hover:bg-accent-400'
const field =
  'rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none ring-accent-500/25 focus:border-accent-400 focus:ring-4 dark:border-neutral-700 dark:bg-neutral-950 dark:ring-accent-400/30 dark:focus:border-accent-500'

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function CompletedPage() {
  const toast = useToast()
  const { selectedClientId, selectedClient, inScope } = useClientScope()
  const { rows: allRows, loading, error, refresh, removeLocal } = useDeliveredCards(selectedClientId)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [localClientFilter, setClientFilter] = useState('')
  const [query, setQuery] = useState('')
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), AGE_TICK_MS)
    return () => window.clearInterval(t)
  }, [])

  // The hook already queries by client; this guard hides rows of the previous scope until the refetch lands.
  const rows = useMemo(() => allRows.filter((c) => inScope(c.client_id)), [allRows, inScope])
  // With a client in the header the page-level client select is redundant and hidden.
  const clientFilter = selectedClientId ? '' : localClientFilter

  const finals = useMemo(() => new Map(rows.map((c) => [c.id, pickFinal(c)])), [rows])

  const clients = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of rows) if (!m.has(c.client_id)) m.set(c.client_id, clientName(c))
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((c) => {
      if (clientFilter && c.client_id !== clientFilter) return false
      if (!q) return true
      return (
        cardTitle(c).toLowerCase().includes(q) ||
        clientName(c).toLowerCase().includes(q) ||
        c.id.startsWith(q) ||
        (c.brief_text ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, clientFilter, query])

  // Selection is a set of ids; everything shown is derived from `rows`, so ids of cards that
  // were deleted or left Delivered simply stop matching and need no pruning.
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id))
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) for (const c of visible) next.delete(c.id)
      else for (const c of visible) next.add(c.id)
      return next
    })
  }

  const selectedCards = useMemo(() => rows.filter((c) => selected.has(c.id)), [rows, selected])
  const busy = zipProgress !== null || deleting

  const toItem = useCallback(
    (card: DeliveredCard): DownloadItem | null => {
      const final = finals.get(card.id)
      return final ? { bucket: FINALS_BUCKET, path: final.path, filename: finalFileName(card) } : null
    },
    [finals],
  )

  const downloadOne = useCallback(
    async (card: DeliveredCard) => {
      const item = toItem(card)
      if (!item) {
        toast.error('This card has no finished PNG to download.')
        return
      }
      setDownloadingId(card.id)
      try {
        await downloadFile(item)
      } catch (e) {
        toast.error(`Download failed: ${errorMessage(e)}`)
      } finally {
        setDownloadingId(null)
      }
    },
    [toItem, toast],
  )

  const zip = useCallback(
    async (cards: DeliveredCard[], name: string) => {
      if (zipProgress) return
      const items: DownloadItem[] = []
      let skipped = 0
      for (const c of cards) {
        const item = toItem(c)
        if (item) items.push(item)
        else skipped++
      }
      if (!items.length) {
        toast.error('None of these cards has a finished PNG yet.')
        return
      }
      setZipProgress({ done: 0, total: items.length, phase: 'fetching' })
      try {
        const { failed } = await downloadAsZip(items, name, setZipProgress)
        if (failed.length) {
          toast.error(`${plural(failed.length, 'file')} could not be added to the zip. Open the card and try Download there.`)
        } else {
          toast.success(
            `Zipped ${plural(items.length, 'PNG')}${skipped ? ` (${skipped} without a final skipped)` : ''}`,
          )
        }
      } catch (e) {
        toast.error(`Zip failed: ${errorMessage(e)}`)
      } finally {
        setZipProgress(null)
      }
    },
    [toItem, toast, zipProgress],
  )

  const zipName = (suffix: string) => {
    const who =
      selectedClient?.name ?? (clientFilter ? (clients.find((c) => c.id === clientFilter)?.name ?? 'client') : 'DM Studio')
    return `${who} finals ${suffix} ${todayStamp()}`
  }

  const deleteMany = useCallback(
    async (cards: DeliveredCard[]) => {
      if (!cards.length) return
      setDeleting(true)
      const failed: string[] = []
      let files = 0
      let kept = 0
      let removed = 0
      try {
        for (const card of cards) {
          try {
            const r = await deleteDeliveredCard(card)
            files += r.filesRemoved
            kept += r.refsKept
            removed++
            removeLocal(card.id)
          } catch (e) {
            console.error('delete card failed', card.id, e)
            failed.push(`${cardTitle(card)}: ${errorMessage(e)}`)
          }
        }
        if (removed) {
          toast.success(
            `Deleted ${plural(removed, 'card')} and ${plural(files, 'file')}${
              kept ? `. ${plural(kept, 'reference upload')} kept because another card still uses ${kept === 1 ? 'it' : 'them'}` : ''
            }`,
          )
        }
        if (failed.length) {
          toast.error(
            failed.length === 1
              ? `Could not delete ${failed[0]}`
              : `${failed.length} of ${cards.length} could not be deleted. First error — ${failed[0]}`,
          )
        }
        await refresh()
      } finally {
        setDeleting(false)
      }
    },
    [removeLocal, refresh, toast],
  )

  const deleteOne = useCallback((card: DeliveredCard) => deleteMany([card]), [deleteMany])

  const filtered = clientFilter !== '' || query.trim() !== ''

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            Completed
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-medium tabular-nums dark:bg-neutral-800">
              {rows.length}
            </span>
          </h1>
          <p className="text-sm text-neutral-500">
            {selectedClient
              ? `Print-ready PNGs for ${selectedClient.name}. Choose “All clients” in the header to see every delivery.`
              : 'Print-ready PNGs from the finisher. Download what the client needs, then delete to clear the storage.'}
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} className={secondaryBtn} title="Reload the list now">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">Could not load delivered cards: {error}</span>
          <button type="button" onClick={() => void refresh()} className={secondaryBtn}>
            Try again
          </button>
        </div>
      )}

      <section
        aria-label="Filters and bulk actions"
        className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900 sm:p-4"
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex-1 text-xs">
            <span className="sr-only">Search delivered cards</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by print text, client or card id"
                className={`${field} w-full pl-8`}
              />
            </span>
          </label>
          {!selectedClientId && (
            <label className="text-xs sm:w-64">
              <span className="sr-only">Filter by client</span>
              <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={`${field} w-full`}>
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || visible.length === 0}
            onClick={() => void zip(visible, zipName(filtered ? 'filtered' : 'all'))}
            className={primaryBtn}
            title={filtered ? 'Zip every card matching the current filter' : 'Zip every delivered card'}
          >
            <Archive className="h-3.5 w-3.5" />
            Download all ({visible.length})
          </button>
          <button
            type="button"
            disabled={busy || selectedCards.length === 0}
            onClick={() => void zip(selectedCards, zipName('selected'))}
            className={secondaryBtn}
          >
            <Download className="h-3.5 w-3.5" />
            Download selected ({selectedCards.length})
          </button>
          <DeleteButton
            variant="button"
            onConfirm={() => deleteMany(selectedCards)}
            disabled={busy || selectedCards.length === 0}
            disabledReason={busy ? 'Wait for the current download or delete to finish' : 'Select at least one card first'}
            label={`Delete selected (${selectedCards.length})`}
          />
          {visible.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-neutral-600 outline-none ring-neutral-900/10 hover:text-neutral-900 focus-visible:ring-4 dark:text-neutral-400 dark:ring-white/20 dark:hover:text-neutral-100"
            >
              {allVisibleSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {allVisibleSelected ? 'Clear selection' : filtered ? 'Select all shown' : 'Select all'}
            </button>
          )}
        </div>

        <p className="text-[11px] text-neutral-500">
          Delete removes the final PNG, every generation and the client&apos;s reference uploads for the card, then the
          card itself. It cannot be undone, so download first.
        </p>

        {zipProgress && (
          <div className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400" role="status">
            <div className="flex justify-between gap-2">
              <span className="truncate">
                {zipProgress.phase === 'zipping' ? 'Creating zip…' : `Fetching ${zipProgress.current ?? ''}`}
              </span>
              <span className="tabular-nums">
                {zipProgress.done}/{zipProgress.total}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${(zipProgress.done / Math.max(zipProgress.total, 1)) * 100}%` }}
              />
            </div>
          </div>
        )}
        {deleting && (
          <p className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Deleting files and cards…
          </p>
        )}
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-neutral-400" role="status" aria-label="Loading">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 px-6 py-16 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {rows.length === 0
            ? selectedClient
              ? `Nothing delivered for ${selectedClient.name} yet. Finished PNGs land here once the finisher moves a card to Delivered.`
              : 'Nothing delivered yet. Finished PNGs land here once the finisher moves a card to Delivered.'
            : 'No delivered card matches this filter.'}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((card) => (
            <CompletedTile
              key={card.id}
              card={card}
              final={finals.get(card.id) ?? null}
              checked={selected.has(card.id)}
              downloading={downloadingId === card.id}
              busy={busy}
              now={now}
              onToggle={toggle}
              onDownload={downloadOne}
              onDelete={deleteOne}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
