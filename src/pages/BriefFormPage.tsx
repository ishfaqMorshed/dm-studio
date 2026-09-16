import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'
import { useToast } from '../lib/useToast'
import { BriefForm } from '../components/brief/BriefForm'
import { BriefShell, DoneScreen, InvalidLinkScreen, LoadingScreen, StaffPreviewNotice } from '../components/brief/screens'
import { useBriefGrant } from '../components/brief/useBriefGrant'

/**
 * Public client brief at /brief/:token. No session, no Header. `start_brief` opens a 15-minute
 * upload window on load; the form uploads three references and calls `submit_brief`; a fresh
 * window can be opened at any time without losing what the client typed.
 */
export default function BriefFormPage() {
  const { token } = useParams<{ token: string }>()
  const toast = useToast()
  const { user } = useAuth()
  const grant = useBriefGrant(token)
  const [doneCardId, setDoneCardId] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    const previous = document.title
    document.title = 'Design brief · Design Musketeer'
    return () => {
      document.title = previous
    }
  }, [])

  const { restart } = grant

  /** From the expired banner: same values, new card id. */
  const restartKeepingValues = useCallback(async () => {
    const result = await restart()
    if (result.ok) toast.success('Fresh upload window opened. Send when ready.')
    else toast.error(result.message)
    return result.ok
  }, [restart, toast])

  /** From the confirmation screen: new card id and an empty form. */
  const startAnother = useCallback(async () => {
    const result = await restart()
    if (!result.ok) {
      toast.error(result.message)
      return
    }
    setDoneCardId(null)
    setFormKey((k) => k + 1)
  }, [restart, toast])

  const { state } = grant
  const clientName = state.kind === 'ready' ? state.grant.client_name : null

  return (
    <BriefShell clientName={clientName}>
      {state.kind === 'loading' && <LoadingScreen />}
      {state.kind === 'invalid' && <InvalidLinkScreen message={state.message} onRetry={grant.retry} />}
      {state.kind === 'ready' && doneCardId && (
        <DoneScreen
          cardId={doneCardId}
          clientName={state.grant.client_name}
          onAnother={() => void startAnother()}
          starting={grant.restarting}
        />
      )}
      {state.kind === 'ready' && !doneCardId && (
        <>
          {user && <StaffPreviewNotice />}
          <BriefForm
            key={formKey}
            token={token ?? ''}
            grant={state.grant}
            expiresAt={grant.expiresAt}
            expired={grant.expired}
            restarting={grant.restarting}
            onRestart={restartKeepingValues}
            onMarkExpired={grant.markExpired}
            onMarkInvalid={grant.markInvalid}
            onSubmitted={setDoneCardId}
          />
        </>
      )}
    </BriefShell>
  )
}
