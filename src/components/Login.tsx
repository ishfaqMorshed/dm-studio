import { useState, type FormEvent } from 'react'
import { KeyRound, Loader2, Mail } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { supabase } from '../lib/supabase'

/** Password sign-in for staff. Public sign-ups and magic links are disabled on this project. */
export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'Wrong email or password. Check both and try again.'
          : err.message,
      )
    }
    // On success the SessionProvider picks up the session and App redirects.
  }

  const input =
    'w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-accent-500/25 focus:border-accent-400 focus:ring-4 dark:border-neutral-700 dark:bg-neutral-950 dark:ring-accent-400/30 dark:focus:border-accent-500'

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-card dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark className="h-10 w-10 rounded-xl" />
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent-700 dark:text-accent-300">Design Musketeer</p>
            <h1 className="text-xl font-semibold leading-tight">DM Studio</h1>
            <p className="text-xs text-neutral-500">Brief · generate · review · print-ready</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@designmusketeer.com"
                className={input}
              />
            </div>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={input}
              />
            </div>
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !email || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 py-2 text-sm font-medium text-white shadow-card outline-none ring-accent-500/30 transition hover:bg-accent-700 focus-visible:ring-4 disabled:opacity-50 dark:bg-accent-500 dark:ring-accent-400/40 dark:hover:bg-accent-400"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
          <p className="text-center text-xs text-neutral-500">Team accounts only. Ask the lead for access.</p>
        </form>
      </div>
    </div>
  )
}
