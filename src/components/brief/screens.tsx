import { useState, type ReactNode } from 'react'
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react'
import { useToast } from '../../lib/useToast'
import { primaryButton, secondaryButton } from './ui'

/** Page frame shared by every state of the public brief form. No Header, no session. */
export function BriefShell({ clientName, children }: { clientName?: string | null; children: ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Design Musketeer</p>
            <h1 className="truncate text-lg font-semibold leading-tight">
              Design brief{clientName ? ` · ${clientName}` : ''}
            </h1>
          </div>
        </header>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-neutral-500">
          Questions? Reply to the message that sent you this link.
        </p>
      </div>
    </div>
  )
}

export function LoadingScreen() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      Opening your brief…
    </div>
  )
}

interface InvalidProps {
  message: string
  onRetry: () => void
}

/** The token did not resolve: expired link, inactive client or the daily start limit. */
export function InvalidLinkScreen({ message, onRetry }: InvalidProps) {
  const limit = /limit/i.test(message)
  const network = /fetch|network|failed to/i.test(message) && !/link/i.test(message)
  return (
    <div className="py-6 text-center">
      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" aria-hidden />
      <h2 className="text-lg font-semibold">
        {limit ? 'Daily limit reached' : network ? 'Could not open the form' : 'This link has expired'}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-300">
        {limit
          ? 'This form accepts a limited number of briefs per day. Try again tomorrow, or contact Design Musketeer if it cannot wait.'
          : network
            ? 'Your browser could not reach our server. Check your connection and try again.'
            : 'Brief links belong to an active client account and can be replaced at any time. Ask your contact at Design Musketeer for a fresh link.'}
      </p>
      <p className="mt-3 text-xs text-neutral-400">{message}</p>
      <button type="button" onClick={onRetry} className={`${secondaryButton} mt-5`}>
        <RefreshCw className="h-4 w-4" aria-hidden />
        Try again
      </button>
    </div>
  )
}

interface DoneProps {
  cardId: string
  clientName: string
  /** Opens a fresh window and an empty form. */
  onAnother: () => void
  starting: boolean
}

/** Confirmation with the card id the client can quote back to the studio. */
export function DoneScreen({ cardId, clientName, onAnother, starting }: DoneProps) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(cardId)
      setCopied(true)
      toast.success('Reference number copied')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy. Select the number and copy it by hand.')
    }
  }

  return (
    <div className="py-4">
      <div className="text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" aria-hidden />
        <h2 className="text-xl font-semibold">Brief sent</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Thanks{clientName ? `, ${clientName}` : ''}. The Design Musketeer team has your brief and references.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Reference number</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="min-w-0 flex-1 select-all break-all font-mono text-sm">{cardId}</code>
          <button
            type="button"
            onClick={() => void copy()}
            aria-label="Copy reference number"
            className={`${secondaryButton} shrink-0 px-2.5`}
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-500">Quote it in any message about this design.</p>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold">What happens next</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
          <li>A designer reads your brief and references.</li>
          <li>The design is produced and checked against your brand's Style Card.</li>
          <li>Your Design Musketeer contact sends you the print-ready file.</li>
        </ol>
      </div>

      <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <button type="button" onClick={onAnother} disabled={starting} className={`${primaryButton} w-full sm:w-auto`}>
          {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Send another brief
        </button>
        <p className="mt-2 text-xs text-neutral-500">Opens an empty form for the next design.</p>
      </div>
    </div>
  )
}

/** Shown to a signed-in staff member previewing the form: uploads would run with their JWT and be refused. */
export function StaffPreviewNotice() {
  return (
    <div
      role="note"
      className="mb-6 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-neutral-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-neutral-200"
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <span>
        You are signed in to DM Studio in this browser. The client form uploads as an anonymous visitor, so storage
        will refuse uploads from this session. To test the full flow, open this link in a private window.
      </span>
    </div>
  )
}
