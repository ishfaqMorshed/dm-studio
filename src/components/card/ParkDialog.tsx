import { useId, useState, type FormEvent } from 'react'
import { PauseCircle } from 'lucide-react'
import { STAGE_LABEL } from '../../lib/stage'
import type { CardStage } from '../../lib/types'
import { btnPrimary, btnSecondary, textareaCls } from './styles'
import { Dialog, Field, Spinner } from './ui'

/** Park = move to Waiting with a note the whole team can read on the board. */
export function ParkDialog({
  stage,
  busy,
  onClose,
  onSubmit,
}: {
  stage: CardStage
  busy: boolean
  onClose: () => void
  onSubmit: (note: string) => void
}) {
  const formId = useId()
  const [note, setNote] = useState('')
  const canSubmit = Boolean(note.trim()) && !busy

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit(note.trim())
  }

  return (
    <Dialog
      open
      title="Park this card"
      description={`It moves to Waiting and comes back to ${STAGE_LABEL[stage]} when you resume it.`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={!canSubmit} className={btnPrimary}>
            {busy ? <Spinner /> : <PauseCircle className="h-4 w-4" />}
            Park
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit}>
        <Field label="What are we waiting for?" hint="Shown on the board">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className={textareaCls}
            placeholder="e.g. asked the client for the exact spelling of the second line"
            data-autofocus
            required
          />
        </Field>
      </form>
    </Dialog>
  )
}
