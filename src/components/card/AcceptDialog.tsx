import { Send } from 'lucide-react'
import { GENERATION_KIND_LABEL, type Generation } from '../../lib/types'
import { btnPrimary, btnSecondary } from './styles'
import { Dialog, Spinner } from './ui'

/** Accept = send the current image to the finisher. Cheap, but it ends the review round. */
export function AcceptDialog({
  generation,
  busy,
  onClose,
  onConfirm,
}: {
  generation: Generation
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog
      open
      title="Accept and finish"
      description="The finisher upscales ×4, removes the background and stamps 300 DPI."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={btnPrimary} data-autofocus>
            {busy ? <Spinner /> : <Send className="h-4 w-4" />}
            Accept
          </button>
        </>
      }
    >
      <p className="text-sm">
        The card moves to <strong>Finishing</strong> and the {GENERATION_KIND_LABEL[generation.kind].toLowerCase()} image becomes the
        source. When the finisher is done the final PNG appears in Completed, usually within 2–4 minutes.
      </p>
      <p className="mt-2 text-xs text-neutral-500">
        Not happy with the text or a detail? Cancel and use Edit text, Edit region or Regenerate instead.
      </p>
    </Dialog>
  )
}
