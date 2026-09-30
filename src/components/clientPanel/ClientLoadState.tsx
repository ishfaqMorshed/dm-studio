import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import type { Client } from '../../lib/types'
import { btnPrimary, btnSecondary, panelCls } from '../style/classes'

/**
 * The three "no client yet" panels shared by the client panel and the onboarding wizard:
 * loading, could-not-load (with Try again) and not-found. Returns null once the client is
 * here, so the caller can `return <ClientLoadState … /> ?? <the page>`.
 */
export function ClientLoadState({
  loading,
  error,
  client,
  onRetry,
  ariaLabel = 'Loading client',
}: {
  loading: boolean
  error: string | null
  client: Client | null
  onRetry: () => void
  ariaLabel?: string
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-24 text-neutral-400" role="status" aria-label={ariaLabel}>
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (error && !client) {
    return (
      <div className={`${panelCls} mx-auto mt-8 max-w-md p-6 text-center`}>
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-red-500" />
        <p className="text-sm font-medium">Could not load this client</p>
        <p className="mt-1 text-xs text-neutral-500">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/clients" className={btnSecondary}>
            <ArrowLeft className="h-4 w-4" />
            Clients
          </Link>
          <button type="button" onClick={onRetry} className={btnPrimary}>
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

  return null
}
