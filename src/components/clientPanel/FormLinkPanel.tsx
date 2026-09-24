import { useEffect, useState } from 'react'
import { Check, Copy, Link2, RotateCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { errorMessage, type Client } from '../../lib/types'
import { useToast } from '../../lib/useToast'
import { btnSecondary } from '../style/classes'
import { ConfirmDialog } from '../style/ConfirmDialog'
import { copyText } from '../style/clipboard'
import { Section } from './Section'
import { formLink, freshFormToken } from './links'

/** The client's brief form link with Copy and, for leads, Rotate. */
export function FormLinkPanel({
  client,
  isLead,
  onRotated,
}: {
  client: Client
  isLead: boolean
  /** Receives the updated client row so the page shows the new link at once. */
  onRotated: (client: Client) => void
}) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const link = formLink(client.form_token)

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(t)
  }, [copied])

  async function copy() {
    try {
      await copyText(link)
      setCopied(true)
      toast.success(`Form link for ${client.name} copied`)
    } catch (e) {
      toast.error(errorMessage(e, 'Copy failed'))
    }
  }

  async function rotate() {
    setBusy(true)
    const token = freshFormToken()
    try {
      const res = await supabase.from('clients').update({ form_token: token }).eq('id', client.id).select('*').single()
      if (res.error) throw new Error(res.error.message)
      onRotated(res.data)
      setConfirming(false)
      try {
        await copyText(formLink(token))
        toast.success('New form link copied. The old link no longer works.')
      } catch {
        toast.success('Form link rotated. Copy the new one from this panel.')
      }
    } catch (e) {
      toast.error(`Could not rotate the link: ${errorMessage(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-neutral-500" aria-hidden="true" />
          Brief form link
        </span>
      }
      subtitle="Briefs submitted through this link land on this client's panel only."
    >
      {client.active ? (
        <div className="space-y-3">
          <code
            className="block break-all rounded-lg bg-neutral-100 px-2.5 py-2 font-mono text-[11px] leading-4 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            title={link}
          >
            {link}
          </code>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy()} className={btnSecondary}>
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            {isLead && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                title="Issue a new link; the current one stops working"
                className={btnSecondary}
              >
                <RotateCw className="h-4 w-4" />
                Rotate link
              </button>
            )}
          </div>
          {!isLead && (
            <p className="text-[11px] text-neutral-500">Only a lead can rotate the link if it has leaked.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">
          Link off while inactive. Inactive clients cannot submit briefs; a lead can reactivate the client with Edit.
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Rotate the form link for ${client.name}?`}
        confirmLabel="Rotate link"
        cancelLabel="Keep current link"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void rotate()}
      >
        The current link stops working the moment you confirm; anyone who opens it sees "This link has expired".
        Briefs already submitted are not affected. Send the new link to the client afterwards.
      </ConfirmDialog>
    </Section>
  )
}
