import { useId, useMemo, useState, type FormEvent } from 'react'
import { RefreshCw, Type, Undo2 } from 'lucide-react'
import type { PrintTextLine, PrintTextRole } from '../../lib/types'
import { btnGhost, btnPrimary, btnSecondary, inputCls, textareaCls } from './styles'
import { Dialog, Field, Spinner } from './ui'

const ROLE_LABEL: Record<PrintTextRole, string> = { headline: 'Headline', sub: 'Sub', tagline: 'Tagline' }

export interface TextChange {
  oldText: string
  newText: string
}

/**
 * What the designer asked for, decided by how many lines changed:
 * - `single`: one line differs → a targeted `edit_text` on the current image
 *   (`updateBrief` also rewrites that brief line so a later regenerate prints it).
 * - `multi`: several lines differ → the brief's print text becomes `lines` and one
 *   `regenerate` is queued so every new line lands in the same generation.
 */
export type EditTextSubmit =
  | { mode: 'single'; oldText: string; newText: string; instruction: string; updateBrief: boolean }
  | { mode: 'multi'; lines: PrintTextLine[]; changes: TextChange[]; instruction: string }

const norm = (t: string) => t.trim()

/**
 * Every text element of the design listed as a prefilled, editable field (same row
 * UI as the brief editor). The designer changes what needs changing and submits once.
 * "Other text" covers a line the image shows but the brief does not carry.
 */
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
  const [drafts, setDrafts] = useState<string[]>(() => lines.map((l) => l.text))
  const [showOther, setShowOther] = useState(lines.length === 0)
  const [otherOld, setOtherOld] = useState('')
  const [otherNew, setOtherNew] = useState('')
  const [instruction, setInstruction] = useState('')
  const [updateBrief, setUpdateBrief] = useState(true)

  const changes = useMemo(
    () =>
      lines
        .map((l, i) => ({ index: i, oldText: norm(l.text), newText: norm(drafts[i] ?? '') }))
        .filter((c) => c.newText !== c.oldText),
    [lines, drafts],
  )
  const emptied = changes.filter((c) => !c.newText)
  const otherActive = showOther && (otherOld.trim() || otherNew.trim())
  const otherComplete = Boolean(otherOld.trim()) && Boolean(otherNew.trim()) && otherOld.trim() !== otherNew.trim()

  const briefChanges = changes.length
  const mixed = briefChanges > 0 && Boolean(otherActive)

  let problem: string | null = null
  if (mixed) problem = 'Change the brief lines or the other text, not both in one round.'
  else if (emptied.length) problem = 'A line cannot be emptied here. Remove it in the brief editor, then regenerate.'
  else if (otherActive && !otherComplete) problem = 'Fill in both the old and the new text for the other line.'

  const mode: 'none' | 'single' | 'multi' = mixed || emptied.length
    ? 'none'
    : briefChanges === 1
      ? 'single'
      : briefChanges > 1
        ? 'multi'
        : otherComplete
          ? 'single'
          : 'none'
  const canSubmit = mode !== 'none' && !busy

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const note = instruction.trim()
    if (mode === 'multi') {
      onSubmit({
        mode: 'multi',
        lines: lines.map((l, i) => ({ role: l.role, text: norm(drafts[i] ?? l.text) })),
        changes: changes.map(({ oldText, newText }) => ({ oldText, newText })),
        instruction: note,
      })
      return
    }
    if (briefChanges === 1) {
      const c = changes[0]
      onSubmit({ mode: 'single', oldText: c.oldText, newText: c.newText, instruction: note, updateBrief })
    } else {
      onSubmit({ mode: 'single', oldText: otherOld.trim(), newText: otherNew.trim(), instruction: note, updateBrief: false })
    }
  }

  const submitLabel =
    mode === 'multi' ? `Regenerate with ${briefChanges} new lines` : mode === 'single' ? 'Queue text edit' : 'Nothing changed yet'

  return (
    <Dialog
      open
      title="Edit text"
      description="Every text line of this design, as the brief has it. Change one line and the worker replaces it on the current image; change several and one regeneration prints them all."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={!canSubmit} className={btnPrimary}>
            {busy ? <Spinner /> : mode === 'multi' ? <RefreshCw className="h-4 w-4" /> : <Type className="h-4 w-4" />}
            {submitLabel}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <Field as="div" label="Text on the design" hint="Spelled exactly as it should print">
          {lines.length === 0 ? (
            <p className="text-xs text-neutral-500">The brief has no text lines. Use “Other text” below for text the image shows.</p>
          ) : (
            <div className="space-y-2">
              {lines.map((line, i) => {
                const changed = norm(drafts[i] ?? '') !== norm(line.text)
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className={`w-20 shrink-0 truncate rounded-md px-2 py-1 text-center text-[11px] font-medium ${
                        changed
                          ? 'bg-accent-100 text-accent-800 dark:bg-accent-900/50 dark:text-accent-200'
                          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                      }`}
                      title={changed ? `Was: ${line.text}` : undefined}
                    >
                      {ROLE_LABEL[line.role]}
                    </span>
                    <input
                      aria-label={`${ROLE_LABEL[line.role]} line ${i + 1}`}
                      value={drafts[i] ?? ''}
                      onChange={(e) => setDrafts((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
                      className={`${inputCls} min-w-0 flex-1 ${changed ? 'border-accent-400 dark:border-accent-500' : ''}`}
                      data-autofocus={i === 0 ? '' : undefined}
                      spellCheck
                    />
                    <button
                      type="button"
                      onClick={() => setDrafts((d) => d.map((v, j) => (j === i ? line.text : v)))}
                      disabled={!changed}
                      aria-label={`Undo line ${i + 1}`}
                      title="Back to the brief's text"
                      className={`${btnGhost} shrink-0`}
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </Field>

        {showOther ? (
          <Field as="div" label="Other text on the image" hint="Not in the brief">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                aria-label="Other old text"
                value={otherOld}
                onChange={(e) => setOtherOld(e.target.value)}
                className={inputCls}
                placeholder="Old text, exactly as shown"
              />
              <input
                aria-label="Other new text"
                value={otherNew}
                onChange={(e) => setOtherNew(e.target.value)}
                className={inputCls}
                placeholder="New text"
              />
            </div>
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => setShowOther(true)}
            className="text-xs font-medium text-accent-700 underline-offset-2 hover:underline dark:text-accent-300"
          >
            The image shows text that is not in the brief…
          </button>
        )}

        <Field label="Instruction" hint="Optional">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            className={textareaCls}
            placeholder="e.g. keep the same arch and letter spacing"
          />
        </Field>

        {mode === 'single' && briefChanges === 1 && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={updateBrief}
              onChange={(e) => setUpdateBrief(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-accent-600"
            />
            <span>
              Also update this line in the brief
              <span className="block text-xs text-neutral-500">So a later regenerate prints the new text, not the old one.</span>
            </span>
          </label>
        )}

        {mode === 'multi' && (
          <p className="rounded-xl border border-accent-200 bg-accent-50 px-3 py-2 text-xs text-accent-900 dark:border-accent-800 dark:bg-accent-950/40 dark:text-accent-100">
            {briefChanges} lines changed. The brief is updated and one regeneration is queued with all the new text, so the
            card goes through Editing once instead of once per line. The current image is rejected as “Wrong text”.
          </p>
        )}

        {problem && <p className="text-xs text-amber-700 dark:text-amber-300">{problem}</p>}
      </form>
    </Dialog>
  )
}
