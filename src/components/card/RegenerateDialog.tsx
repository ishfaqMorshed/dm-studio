import { useId, useState, type FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { REJECTION_REASONS, REJECTION_REASON_LABEL, type AiPlatform, type RejectionReason } from '../../lib/types'
import { PlatformPicker } from '../PlatformPicker'
import { MagicPromptEditor } from './MagicPromptEditor'
import type { PromptSection } from './magicPrompt'
import { btnPrimary, btnSecondary, selectCls, textareaCls } from './styles'
import { Dialog, Field, Spinner } from './ui'

export interface RegenerateSubmit {
  reason: RejectionReason
  note: string
  platform: AiPlatform
}

/**
 * Reject the current image with a reason (feeds the lessons loop) and queue a new
 * generation from the magic prompt — edited here or in the panel, same draft.
 */
export function RegenerateDialog({
  sections,
  onSectionsChange,
  onResetSections,
  promptDirty,
  defaultPlatform,
  busy,
  onClose,
  onSubmit,
}: {
  sections: PromptSection[]
  onSectionsChange: (next: PromptSection[]) => void
  onResetSections: () => void
  promptDirty: boolean
  /** settings.ai_platform; the picker follows it until the designer chooses. */
  defaultPlatform: AiPlatform
  busy: boolean
  onClose: () => void
  onSubmit: (args: RegenerateSubmit) => void
}) {
  const formId = useId()
  const [reason, setReason] = useState<RejectionReason | ''>('')
  const [note, setNote] = useState('')
  const [pickedPlatform, setPickedPlatform] = useState<AiPlatform | null>(null)
  const platform = pickedPlatform ?? defaultPlatform
  const canSubmit = reason !== '' && !busy

  function submit(e: FormEvent) {
    e.preventDefault()
    if (reason === '' || !canSubmit) return
    onSubmit({ reason, note: note.trim(), platform })
  }

  return (
    <Dialog
      open
      size="xl"
      title="Regenerate"
      description="Say why this image is rejected, adjust the prompt if needed, and queue a fresh generation."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={!canSubmit} className={btnPrimary}>
            {busy ? <Spinner /> : <RefreshCw className="h-4 w-4" />}
            Regenerate
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Why is it rejected?" hint="Required — feeds the nightly lessons">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as RejectionReason | '')}
              className={selectCls}
              required
              data-autofocus
            >
              <option value="">Pick a reason</option>
              {REJECTION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REJECTION_REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Note" hint="Optional, one line is enough">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={textareaCls}
              placeholder="e.g. the bear looks like the reference too closely"
            />
          </Field>
          <PlatformPicker
            value={platform}
            onChange={setPickedPlatform}
            disabled={busy}
            studioDefault={defaultPlatform}
            size="sm"
          />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Magic prompt</h3>
          <MagicPromptEditor
            sections={sections}
            onChange={onSectionsChange}
            onReset={onResetSections}
            dirty={promptDirty}
            disabled={busy}
            emptyText="This generation has no stored prompt. The engine rebuilds it from the brief, the Style Card and the lessons."
          />
        </div>
      </form>
    </Dialog>
  )
}
