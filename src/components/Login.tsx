import { useState, type FormEvent } from 'react'
import { KeyRound, Loader2, Mail, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'

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
    if (err) setError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : err.message)
  }

  const input =
    'w-full rounded-lg border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-neutral-900/10 focus:ring-4 dark:border-neutral-700 dark:bg-neutral-950 dark:ring-white/10'

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">DM Finisher</h1>
            <p className="text-xs text-neutral-500">Upscale · remove background · finish</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@designmusketeer.com" className={input} />
            </div>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Password</span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={input} />
            </div>
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={busy || !email || !password} className="flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
          <p className="text-center text-xs text-neutral-500">Team accounts only. Ask an admin for access.</p>
        </form>
      </div>
    </div>
  )
}
