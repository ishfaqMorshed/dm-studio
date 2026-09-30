import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { newStyleCardVersion } from '../lib/api'
import { errorMessage, type Client, type StyleCard } from '../lib/types'
import { useToast } from '../lib/useToast'
import { btnPrimary, btnSecondary, panelCls } from '../components/style/classes'
import { ConfirmDialog } from '../components/style/ConfirmDialog'
import { formatDateTime } from '../components/style/format'
import { StyleCardEditor } from '../components/style/StyleCardEditor'
import { VersionList } from '../components/style/VersionList'
import { emptyStyleCard, styleCardToJson } from '../components/style/styleCardSchema'

const POLL_MS = 20_000

/** The client row plus every version, newest first. Throws with the Postgres message. */
async function fetchStyleCardPage(clientId: string): Promise<{ client: Client | null; versions: StyleCard[] }> {
  const [clientRes, versionsRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
    supabase.from('style_cards').select('*').eq('client_id', clientId).order('version', { ascending: false }),
  ])
  if (clientRes.error) throw new Error(clientRes.error.message)
  if (versionsRes.error) throw new Error(versionsRes.error.message)
  return { client: clientRes.data, versions: versionsRes.data }
}

/** /clients/:id/style — every Style Card version for one client, with the draft editor. */
export default function StyleCardPage() {
  const { id: clientId } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const toast = useToast()

  const [client, setClient] = useState<Client | null>(null)
  const [versions, setVersions] = useState<StyleCard[]>([])
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map())
  /** Which client the current `client`/`versions` belong to; loading until it matches the URL. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Selection is remembered per client so a URL change never shows a stale version. */
  const [selection, setSelection] = useState<{ clientId: string; id: string | null } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pendingSelect, setPendingSelect] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const loading = loadedFor !== clientId
  const selectedId = selection !== null && selection.clientId === clientId ? selection.id : null
  const setSelectedId = useCallback(
    (id: string | null) => {
      if (clientId) setSelection({ clientId, id })
    },
    [clientId],
  )

  const load = useCallback((): Promise<void> => {
    if (!clientId) return Promise.resolve()
    return fetchStyleCardPage(clientId)
      .then(
        (data) => {
          setClient(data.client)
          setVersions(data.versions)
          setError(null)
        },
        (e: unknown) => setError(errorMessage(e)),
      )
      .finally(() => setLoadedFor(clientId))
  }, [clientId])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  // Display names for locked_by / created_by. Fetched once; profiles rarely change.
  useEffect(() => {
    let cancelled = false
    void supabase
      .from('profiles')
      .select('user_id, display_name')
      .then(({ data }) => {
        if (cancelled || !data) return
        setNames(new Map(data.map((p) => [p.user_id, p.display_name])))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Leaving the tab with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // `?version=<style_card_id>` (from the client panel / onboarding wizard) picks that version once
  // the list is here. One shot per URL value (the designer may switch afterwards), applied during
  // render the React-documented way rather than in an effect.
  const requestedVersion = searchParams.get('version')
  const [appliedVersion, setAppliedVersion] = useState<string | null>(null)
  if (!loading && requestedVersion && appliedVersion !== requestedVersion && versions.some((v) => v.id === requestedVersion)) {
    setAppliedVersion(requestedVersion)
    setSelectedId(requestedVersion)
  }

  const currentLocked = useMemo(() => versions.find((v) => v.status === 'locked') ?? null, [versions])
  const openDraft = useMemo(() => versions.find((v) => v.status === 'draft') ?? null, [versions])
  // Default to the highest version, which is the open draft when there is one.
  const selected = useMemo(
    () => versions.find((v) => v.id === selectedId) ?? versions[0] ?? null,
    [versions, selectedId],
  )

  const requestSelect = (id: string) => {
    if (selected?.id === id) return
    if (dirty) setPendingSelect(id)
    else setSelectedId(id)
  }

  const createVersion = async () => {
    if (!client) return
    setCreating(true)
    try {
      // The RPC copies the current locked JSON; with no versions at all it would store {},
      // so seed the schema skeleton instead and the raw panel shows the shape.
      const created = await newStyleCardVersion(
        client.id,
        versions.length ? undefined : styleCardToJson(emptyStyleCard()),
      )
      toast.success(
        currentLocked
          ? `Draft v${created.version} started from v${currentLocked.version}`
          : `Draft v${created.version} started`,
      )
      await load()
      setSelectedId(created.id)
    } catch (e) {
      toast.error(`Could not start a new version: ${errorMessage(e)}`)
    } finally {
      setCreating(false)
    }
  }

  const onDirtyChange = useCallback((d: boolean) => setDirty(d), [])
  const onSelectVersion = useCallback((id: string | null) => setSelectedId(id), [setSelectedId])

  if (!clientId) return null

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-neutral-400" role="status" aria-label="Loading Style Card">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (error && !client) {
    return (
      <div className={`${panelCls} mx-auto mt-8 max-w-md p-6 text-center`}>
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-red-500" />
        <p className="text-sm font-medium">Could not load this client's Style Card</p>
        <p className="mt-1 text-xs text-neutral-500">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/clients" className={btnSecondary}>
            <ArrowLeft className="h-4 w-4" />
            Clients
          </Link>
          <button type="button" onClick={() => void load()} className={btnPrimary}>
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
          <h1 className="mt-1 truncate text-xl font-semibold">
            {client.name} <span className="font-normal text-neutral-500">· Style Card</span>
          </h1>
        </div>
        {currentLocked ? (
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Current: v{currentLocked.version}, locked {formatDateTime(currentLocked.locked_at)}
          </p>
        ) : (
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" />
            No locked Style Card. Cards for {client.name} cannot be approved until one is locked.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          Refresh failed: {error}. Showing the last loaded versions.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className={`${panelCls} self-start lg:sticky lg:top-[72px]`}>
          <VersionList
            versions={versions}
            selectedId={selected?.id ?? null}
            currentId={currentLocked?.id ?? null}
            names={names}
            onSelect={requestSelect}
            onNewVersion={() => void createVersion()}
            creating={creating}
            openDraft={openDraft?.version ?? null}
          />
        </aside>

        <section className={`${panelCls} min-w-0`}>
          {selected ? (
            <StyleCardEditor
              key={selected.id}
              version={selected}
              client={client}
              isCurrent={selected.id === currentLocked?.id}
              draftExists={openDraft !== null}
              names={names}
              onChanged={load}
              onDirtyChange={onDirtyChange}
              onSelectVersion={onSelectVersion}
            />
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-medium">No Style Card yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-neutral-500">
                Draft one from the reference library on the client panel ("Draft Style Card from library"). Without a
                library, the client's first card drafts one automatically. To write one by hand now, start the first
                version, fill in the form, then Lock it.
              </p>
              <button
                type="button"
                onClick={() => void createVersion()}
                disabled={creating}
                className={`${btnPrimary} mt-4`}
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Start first version
              </button>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={pendingSelect !== null}
        title="Discard unsaved changes?"
        confirmLabel="Discard and switch"
        cancelLabel="Keep editing"
        tone="danger"
        onCancel={() => setPendingSelect(null)}
        onConfirm={() => {
          if (pendingSelect) setSelectedId(pendingSelect)
          setDirty(false)
          setPendingSelect(null)
        }}
      >
        Draft v{selected?.version} has edits that are not saved. Switching versions throws them away.
      </ConfirmDialog>
    </div>
  )
}
