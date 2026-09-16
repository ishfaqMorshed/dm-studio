import { useId, useState, type FormEvent } from 'react'
import { Type } from 'lucide-react'
import type { PrintTextLine } from '../../lib/types'
import { btnPrimary, btnSecondary, inputCls, selectCls, textareaCls } from './styles'
import { Dialog, Field, Spinner } from './ui'

export interface EditTextSubmit {
  oldText: string
  newText: string
  instruction: string
  /** Also rewrite the matching brief line so the next regenerate prints the new text. */
  updateBrief: boolean
}

const OTHER = '__other__'

/** Old text is prefilled from the brief's text lines (not OCR); the worker replaces it on the image. */
export function EditTextDialog({
  lines,
  busy,
  onClose,
  onSubmit,
}: {
  lines: PrintTextLine[]
  busy: boolean
  onClose: () => void
  onSubmit: (args: EditTextSubmit) => void
}) {
  const formId = useId()
  const [choice, setChoice] = useState<string>(lines.length ? '0' : OTHER)
  const [otherText, setOtherText] = useState('')
  const [newText, setNewText] = useState('')
  const [instruction, setInstruction] = useState('')
  const [updateBrief, setUpdateBrief] = useState(true)

  const fromBrief = choice !== OTHER ? lines[Number(choice)] : undefined
  const oldText = (fromBrief ? fromBrief.text : otherText).trim()
  const canSubmit = Boolean(oldText) && Boolean(newText.trim()) && newText.trim() !== oldText && !busy

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({
      oldText,
      newText: newText.trim(),
      instruction: instruction.trim(),
      updateBrief: Boolean(fromBrief) && updateBrief,
    })
  }

  return (
    <Dialog
      open
      title="Edit text"
      description="The worker replaces the old text on the current image and QC checks the result."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={!canSubmit} className={btnPrimary}>
            {busy ? <Spinner /> : <Type className="h-4 w-4" />}
            Queue text edit
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <Field label="Text to replace" hint="From the brief's text lines">
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className={selectCls} data-autofocus>
            {lines.map((l, i) => (
              <option key={i} value={String(i)}>
                {l.role}: {l.text}
              </option>
            ))}
            <option value={OTHER}>Other text on the image…</option>
          </select>
        </Field>
        {choice === OTHER && (
          <Field label="Old text" hint="Exactly as it appears on the image">
            <input value={otherText} onChange={(e) => setOtherText(e.target.value)} className={inputCls} />
          </Field>
        )}
        <Field label="New text" hint="Spelled exactly as it should print">
          <input value={newText} onChange={(e) => setNewText(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="Instruction" hint="Optional">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            className={textareaCls}
            placeholder="e.g. keep the same arch and letter spacing"
          />
        </Field>
        {fromBrief && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={updateBrief}
              onChange={(e) => setUpdateBrief(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-neutral-900 dark:accent-white"
            />
            <span>
              Also update this line in the brief
              <span className="block text-xs text-neutral-500">So a later regenerate prints the new text, not the old one.</span>
            </span>
          </label>
        )}
        {newText.trim() && newText.trim() === oldText && (
          <p className="text-xs text-amber-700 dark:text-amber-300">The new text is the same as the old text.</p>
        )}
      </form>
    </Dialog>
  )
}
