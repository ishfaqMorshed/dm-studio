import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, PauseCircle, Users } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { useAuth } from '../lib/useAuth'
import { useClientScope } from '../lib/useClientScope'
import { useProfile } from '../lib/useProfile'
import { useSettings } from '../lib/useSettings'
import { useQueueCounts, type QueueCount } from '../lib/useQueueCounts'

const NAV = [
  { to: '/board', label: 'Board' },
  { to: '/completed', label: 'Completed' },
  { to: '/clients', label: 'Clients' },
] as const

/**
 * Staff chrome: brand, client scope selector, nav, live queue indicator, paused banner, sign out.
 * Self-contained; reads session, profile, settings, scope and queue counts from lib hooks.
 */
export function Header() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { isLead, displayName } = useProfile()
  const { settings, paused } = useSettings()
  const queue = useQueueCounts()
  const scope = useClientScope()

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-2.5 py-1.5 text-sm font-medium outline-none ring-accent-500/30 focus-visible:ring-4 dark:ring-accent-400/40 ${
      isActive
        ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
    }`

  async function onSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <NavLink to="/board" className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-accent-500/30">
          <BrandMark className="h-8 w-8" />
          <span className="font-display text-[15px] font-semibold tracking-tight">DM Studio</span>
        </NavLink>

        <ClientSelector scope={scope} />

        <nav aria-label="Main" className="flex items-center gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={linkClass}>
              {n.label}
            </NavLink>
          ))}
          {isLead && (
            <NavLink to="/settings" className={linkClass}>
              Settings
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <QueueIndicator
            label="Generate"
            count={queue.generations}
            cap={settings?.max_active_generations ?? null}
            loading={queue.loading}
          />
          <QueueIndicator label="Finish" count={queue.finish} cap={settings?.max_active_finish ?? null} loading={queue.loading} />
          {displayName && <span className="hidden max-w-[180px] truncate text-sm text-neutral-500 lg:inline">{displayName}</span>}
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium outline-none ring-accent-500/25 hover:bg-neutral-100 focus-visible:ring-4 dark:border-neutral-700 dark:ring-accent-400/30 dark:hover:bg-neutral-800"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </div>

      {paused && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <PauseCircle className="h-4 w-4 shrink-0" />
          Pipeline paused by the lead. Approve is disabled and nothing new will be generated until it is resumed
          {isLead ? ' in Settings.' : '.'}
        </div>
      )}
    </header>
  )
}

/**
 * The client scope: "All clients" or one active client. Every page (board, completed, card
 * lists) filters through it; the choice is remembered (localStorage + ?client=).
 */
function ClientSelector({ scope }: { scope: ReturnType<typeof useClientScope> }) {
  const { clients, selectedClientId, selectedClient, loading, setSelectedClientId } = scope
  // A remembered client whose row has not arrived yet: keep it selected instead of snapping to All.
  const pending = Boolean(selectedClientId) && !selectedClient
  const title = selectedClient
    ? `Showing only ${selectedClient.name}. Every page filters by this client.`
    : 'Client scope: pick a client to filter every page to it'
  return (
    <label className="flex min-w-0 items-center gap-1.5" title={title}>
      <Users className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
      <span className="sr-only">Client scope</span>
      <select
        value={selectedClientId ?? ''}
        onChange={(e) => setSelectedClientId(e.target.value || null)}
        aria-label="Client scope"
        className={`max-w-[11rem] truncate rounded-lg border bg-white px-2 py-1.5 text-sm outline-none ring-accent-500/25 focus-visible:ring-4 dark:bg-neutral-950 dark:ring-accent-400/30 sm:max-w-[14rem] ${
          selectedClientId
            ? 'border-accent-500 font-medium text-accent-800 dark:border-accent-400 dark:text-accent-200'
            : 'border-neutral-300 dark:border-neutral-700'
        }`}
      >
        <option value="">All clients</option>
        {pending && selectedClientId && <option value={selectedClientId}>{loading ? 'Loading…' : 'Selected client'}</option>}
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function QueueIndicator({
  label,
  count,
  cap,
  loading,
}: {
  label: string
  count: QueueCount
  cap: number | null
  loading: boolean
}) {
  const atCap = cap !== null && count.working >= cap && cap > 0
  const tone = atCap
    ? 'text-amber-700 dark:text-amber-300'
    : count.working > 0
      ? 'text-stage-generating-ink dark:text-stage-generating-light'
      : 'text-neutral-500'
  const title = `${label}: ${count.queued} waiting, ${count.working} running${cap !== null ? ` of cap ${cap}` : ''}`
  return (
    <span
      title={title}
      aria-label={title}
      className={`hidden items-center gap-1 whitespace-nowrap text-xs tabular-nums sm:flex ${tone}`}
    >
      <span className="font-medium">{label}</span>
      {loading ? (
        <span className="text-neutral-400">…</span>
      ) : (
        <span>
          {count.queued} waiting · {count.working}
          {cap !== null ? `/${cap}` : ''} running
        </span>
      )}
    </span>
  )
}
