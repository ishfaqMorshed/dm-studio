import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, type Location } from 'react-router-dom'
import { Loader2, ShieldAlert } from 'lucide-react'
import { ToastProvider } from './lib/toast'
import { SessionProvider } from './lib/session'
import { useAuth } from './lib/useAuth'
import { useProfile } from './lib/useProfile'
import { Header } from './components/Header'
import { Login } from './components/Login'
import BriefFormPage from './pages/BriefFormPage'
import BoardPage from './pages/BoardPage'
import CardPage from './pages/CardPage'
import CompletedPage from './pages/CompletedPage'
import ClientsPage from './pages/ClientsPage'
import StyleCardPage from './pages/StyleCardPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/brief/:token" element={<BriefFormPage />} />

            {/* Staff (auth gate + Header) */}
            <Route element={<StaffLayout />}>
              <Route path="/" element={<BoardPage />} />
              <Route path="/board" element={<BoardPage />} />
              <Route path="/card/:id" element={<CardPage />} />
              <Route path="/completed" element={<CompletedPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/clients/:id/style" element={<StyleCardPage />} />
              <Route
                path="/settings"
                element={
                  <LeadOnly>
                    <SettingsPage />
                  </LeadOnly>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center text-neutral-400" role="status" aria-label="Loading">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  )
}

interface LocationState {
  from?: Location
}

/** Signed-in users never see the login form; they go back to where they came from. */
function LoginRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenSpinner />
  if (user) {
    const from = (location.state as LocationState | null)?.from
    return <Navigate to={from ? `${from.pathname}${from.search}` : '/board'} replace />
  }
  return <Login />
}

/** Auth gate for every staff route: no session → /login (remembering the target). */
function StaffLayout() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location } satisfies LocationState} />
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-screen-2xl px-4 py-4 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}

function LeadOnly({ children }: { children: React.ReactNode }) {
  const { isLead, loading } = useProfile()
  if (loading) return <FullScreenSpinner />
  if (!isLead) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-amber-500" />
        <h1 className="text-lg font-semibold">Lead only</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pipeline settings and prompt templates can only be changed by a lead. Ask your lead if something here needs
          to change.
        </p>
      </div>
    )
  }
  return <>{children}</>
}

function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="mt-1 text-sm text-neutral-500">That link does not point to anything in DM Studio.</p>
      <Navigate to="/board" replace />
    </div>
  )
}
