import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, Loader2, MousePointerClick, Pencil, RefreshCw } from 'lucide-react'
import { useClientScope } from '../lib/useClientScope'
import { useProfile } from '../lib/useProfile'
import { useSettings } from '../lib/useSettings'
import { useStyleDraftRequests } from '../lib/useStyleDraftRequests'
import { useToast } from '../lib/useToast'
import { NewCardDialog } from '../components/board/NewCardDialog'
import { CardsSummary } from '../components/clientPanel/CardsSummary'
import { ClientDialog } from '../components/clientPanel/ClientDialog'
import { FormLinkPanel } from '../components/clientPanel/FormLinkPanel'
import { ReferenceLibrary } from '../components/clientPanel/ReferenceLibrary'
import { StyleCardSection } from '../components/clientPanel/StyleCardSection'
import { useClientCardCounts } from '../components/clientPanel/useClientCardCounts'
import { useClientPanel } from '../components/clientPanel/useClientPanel'
import { useReferenceLibrary } from '../components/clientPanel/useReferenceLibrary'
import { btnPrimary, btnSecondary, iconBtn, panelCls } from '../components/style/classes'

/**
 * /clients/:id — one client's panel: form link, reference library, Style Card status and
 * drafting, cards by stage, New card. The Style Card editor stays at /clients/:id/style.
 * Keyed on the id so every hook restarts when the URL moves to another client.
 */
export default function ClientPanelPage() {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return <ClientPanel key={id} clientId={id} />
}

function ClientPanel({ clientId }: { clientId: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const { isLead } = useProfile()
  const { settings } = useSettings()
  const scope = useClientScope()
  const panel = useClientPanel(clientId)
  const library = useReferenceLibrary(clientId)
  const cards = useClientCardCounts(clientId)
  const requests = useStyleDraftRequests(clientId)
  const [editing, setEditing] = useState(false)
  const [newCardOpen, setNewCardOpen] = useState(false)

  // A finished draft is a new style_cards row: reload the versions so the Style Card section shows it.
  const doneKey = useMemo(
    () =>
      requests.requests
        .filter((r) => r.status === 'done')
        .map((r) => r.id)
        .sort()
        .join(','),
    [requests.requests],
  )
  const seenDone = useRef<string | null>(null)
  const refreshPanel = panel.refresh
  useEffect(() => {
    if (requests.loading) return
    if (seenDone.current !== null && doneKey !== seenDone.current) void refreshPanel()
    seenDone.current = doneKey
  }, [doneKey, requests.loading, refreshPanel])

  const client = panel.client
  const isSelected = scope.selectedClientId === clientId

  function selectClient() {
    if (!client) return
    scope.setSelectedClientId(client.id)
    navigate({ pathname: '/board', search: `?client=${encodeURIComponent(client.id)}` })
  }

  if (panel.loading) {
    return (
      <div className="flex justify-center py-24 text-neutral-400" role="status" aria-label="Loading client">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (panel.error && !client) {
    return (
      <div className={`${panelCls} mx-auto mt-8 max-w-md p-6 text-center`}>
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-red-500" />
        <p className="text-sm font-medium">Could not load this client</p>
        <p className="mt-1 text-xs text-neutral-500">{panel.error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/clients" className={btnSecondary}>
            <ArrowLeft className="h-4 w-4" />
            Clients
          </Link>
          <button type="button" onClick={() => void panel.refresh()} className={btnPrimary}>
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className={`${panelCls} mx-auto mt-8 max-w-md p-6 text-center`}>
        <p className="text-sm font-medium">Client not found</p>
        <p className="mt-1 text-xs text-neutral-500">This link does not point to a client you can see.</p>
        <Link to="/clients" className={`${btnSecondary} mt-4`}>
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/clients"
            className="inline-flex items-center gap-1 rounded text-xs text-neutral-500 outline-none ring-neutral-900/10 hover:text-neutral-900 focus-visible:ring-4 dark:ring-white/20 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Clients
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{client.name}</h1>
            {client.active ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                Active
              </span>
            ) : (
              <span
                className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
                title="Inactive clients keep their history; the form link is off and no new cards can be started."
              >
                Inactive
              </span>
            )}
            {isSelected && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-medium text-white dark:bg-white dark:text-neutral-900"
                title="The board and Completed are showing this client only"
              >
                <Check className="h-3 w-3" />
                Selected
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {client.target_px_w}×{client.target_px_h} px · tier {client.default_similarity_tier} ·{' '}
            {client.garment_colors.length ? client.garment_colors.join(', ') : 'no garment colours'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void panel.refresh()}
            aria-label="Refresh"
            title="Refresh"
            className={iconBtn}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {isLead && (
            <button type="button" onClick={() => setEditing(true)} className={btnSecondary}>
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={selectClient}
            disabled={!client.active}
            title={
              client.active
                ? isSelected
                  ? 'Already selected. Go to the board.'
                  : 'Scope the board, Completed and new cards to this client, then open the board'
                : 'Inactive clients are not offered in the client selector. Edit the client to reactivate it.'
            }
            className={btnPrimary}
          >
            <MousePointerClick className="h-4 w-4" />
            {isSelected ? 'Open board' : 'Select this client'}
          </button>
        </div>
      </div>

      {panel.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          Refresh failed: {panel.error}. Showing the last loaded data.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <ReferenceLibrary
            clientName={client.name}
            library={library}
            maxRefs={settings?.max_style_refs ?? null}
            isLead={isLead}
          />
          <StyleCardSection
            clientId={client.id}
            clientName={client.name}
            versions={panel.versions}
            currentLocked={panel.currentLocked}
            drafts={panel.drafts}
            libraryCount={library.refs.length}
            libraryLoading={library.loading}
            requests={requests}
            isLead={isLead}
            n8nBase={settings?.n8n_base_url}
          />
        </div>
        <div className="space-y-4">
          <FormLinkPanel client={client} isLead={isLead} onRotated={panel.setClient} />
          <CardsSummary
            clientId={client.id}
            clientActive={client.active}
            counts={cards.counts}
            total={cards.total}
            loading={cards.loading}
            error={cards.error}
            onNewCard={() => setNewCardOpen(true)}
          />
        </div>
      </div>

      {editing && (
        <ClientDialog
          mode="edit"
          client={client}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false)
            panel.setClient(saved)
            toast.success(`${saved.name} updated`)
          }}
        />
      )}

      {newCardOpen && <NewCardDialog clientId={client.id} onClose={() => setNewCardOpen(false)} />}
    </div>
  )
}
