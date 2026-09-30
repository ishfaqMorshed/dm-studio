import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { AlertTriangle, Type, Undo2 } from 'lucide-react'
import { PRINT_TEXT_ROLE_LABEL, type AiPlatform, type PrintTextLine } from '../../lib/types'
import { PlatformPicker } from '../PlatformPicker'
import { btnGhost, btnPrimary, btnSecondary, inputCls, textareaCls } from './styles'
import { Field, Spinner } from './ui'

export interface TextChange {
  /** Slot index, so the brief line is still found when its text drifted from the prompt's. */
  index: number
  oldText: string
  newText: string
}

/**
 * What the designer asked for, decided by how many lines changed:
 * - `single`: one line differs → a targeted `edit_text` on the current image
 *   (`updateBrief` also rewrites that brief line so a later regenerate prints it;
 *   `lineIndex` is the slot that changed, so the brief line is still found when its
 *   text drifted from the prompt's — undefined for "other text").
 * - `multi`: several lines differ → the prompt's text slot becomes `lines`, the matching
 *   brief lines are patched, and one in-place text edit is queued so every new line lands
 *   in the same generation.
 */
export type EditTextSubmit =
  | {
      mode: 'single'
      oldText: string
      newText: string
      instruction: string
      updateBrief: boolean
      platform: AiPlatform
      lineIndex?: number
    }
  | { mode: 'multi'; lines: PrintTextLine[]; changes: TextChange[]; instruction: string; platform: AiPlatform }

export type EditStatusTone = 'neutral' | 'warn'

const norm = (t: string) => t.trim()
/** For comparing what QC read with what the slots say: whitespace runs and case do not count. */
const normText = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The text slots: every line of the design as a prefilled field (same row UI as the
 * brief editor). The designer changes what needs changing and presses Apply once.
 * Inline, not a dialog — it takes the place of the stage buttons beside the picture.
 * "Other text" (under Options) covers a line the image shows but the slots do not carry.
 */
export function EditTextForm({
  lines,
  source,
  briefLines,
  qcFound,
  qcTextOk,
  promptDirty,
  defaultPlatform,
  paused,
  busy,
  onSubmit,
  onCancel,
  onStatus,
}: {
  /** The slots: the current generation's prompt text slot, else the brief's print text. */
  lines: PrintTextLine[]
  source: 'prompt' | 'brief'
  /** card.print_text, to say when the brief disagrees with the prompt. */
  briefLines: PrintTextLine[]
  /** qc_report.text_found / text_ok of the current generation. */
  qcFound: string | null
  qcTextOk: boolean | null
  /** An edited magic prompt draft rides along with a multi-line edit. */
  promptDirty: boolean
  /** settings.ai_platform; the picker follows it until the designer chooses. */
  defaultPlatform: AiPlatform
  /** settings.pipeline_paused: the slots stay readable, Apply is off with the reason (request_edit would refuse). */
  paused: boolean
  busy: boolean
  onSubmit: (args: EditTextSubmit) => void
  onCancel: () => void
  /** One line for the page's live region: what pressing Apply does right now. */
  onStatus: (text: string, tone: EditStatusTone) => void
}) {
  const firstInputRef = useRef<HTMLInputElement>(null)
  const [drafts, setDrafts] = useState<string[]>(() => lines.map((l) => l.text))
  const [showOther, setShowOther] = useState(lines.length === 0)
  const [otherOld, setOtherOld] = useState('')
  const [otherNew, setOtherNew] = useState('')
  const [instruction, setInstruction] = useState('')
  const [updateBrief, setUpdateBrief] = useState(true)
  const [pickedPlatform, setPickedPlatform] = useState<AiPlatform | null>(null)
  const platform = pickedPlatform ?? defaultPlatform

  // No Dialog moves focus here, so the first slot takes it when the editor appears.
  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])

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
  else if (emptied.length) problem = 'A line cannot be emptied here. Remove it in the brief, then Try again.'
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
  const canSubmit = mode !== 'none' && !busy && !paused

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const note = instruction.trim()
    if (mode === 'multi') {
      onSubmit({
        mode: 'multi',
        lines: lines.map((l, i) => ({ role: l.role, text: norm(drafts[i] ?? l.text) })),
        changes: changes.map(({ index, oldText, newText }) => ({ index, oldText, newText })),
        instruction: note,
        platform,
      })
      return
    }
    if (briefChanges === 1) {
      const c = changes[0]
      onSubmit({ mode: 'single', oldText: c.oldText, newText: c.newText, instruction: note, updateBrief, platform, lineIndex: c.index })
    } else {
      onSubmit({ mode: 'single', oldText: otherOld.trim(), newText: otherNew.trim(), instruction: note, updateBrief: false, platform })
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    onCancel()
  }

  const submitLabel = briefChanges >= 2 ? `Apply ${briefChanges} text changes` : mode === 'single' ? 'Apply text change' : 'Apply text changes'

  // What the judge read, shown only when it disagrees with the slots (or the judge said so).
  const showQcHint = qcFound !== null && (normText(qcFound) !== normText(lines.map((l) => l.text).join(' ')) || qcTextOk === false)
  const briefDiffers =
    source === 'prompt' && briefLines.map((l) => l.text.trim()).join('\n') !== lines.map((l) => l.text.trim()).join('\n')

  let statusText: string
  let statusTone: EditStatusTone = 'neutral'
  if (busy) statusText = 'Queuing the text edit…'
  else if (paused) {
    statusText = 'The pipeline is paused by the lead — Accept still works; text edits queue again when it resumes.'
    statusTone = 'warn'
  } else if (problem) {
    statusText = problem
    statusTone = 'warn'
  } else if (briefChanges === 1) {
    statusText = `1 line changed — the worker replaces it on this image${updateBrief ? ' and updates the brief line' : ''}.`
  } else if (briefChanges >= 2) {
    statusText = `${briefChanges} lines changed — the brief is updated and one edit prints them all on this image.${promptDirty ? ' Your edited magic prompt rides along.' : ''}`
  } else if (otherComplete) {
    statusText = 'Other text ready — the worker replaces it on this image.'
  } else {
    statusText = `${lines.length} text line${lines.length === 1 ? '' : 's'} ready. Change any line, then Apply.`
  }
  // The parent passes a fresh callback every render; report only when the text changes.
  const onStatusRef = useRef(onStatus)
  useEffect(() => {
    onStatusRef.current = onStatus
  })
  useEffect(() => {
    onStatusRef.current(statusText, statusTone)
  }, [statusText, statusTone])

  return (
    <form onSubmit={submit} onKeyDown={onKeyDown} aria-busy={busy} className="space-y-3">
      <fieldset disabled={busy} className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <h3 className="text-sm font-semibold">Text on the design</h3>
          <p className="text-xs text-neutral-500">
            {lines.length === 0
              ? 'This design has no text lines. Use “Other text” below.'
              : `${lines.length} line${lines.length === 1 ? '' : 's'} · from the ${source === 'prompt' ? 'magic prompt' : 'brief'}`}
          </p>
        </div>

        {lines.length > 0 && (
          <div className="space-y-2 motion-safe:animate-fade-up">
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
                    {PRINT_TEXT_ROLE_LABEL[line.role]}
                  </span>
                  <input
                    ref={i === 0 ? firstInputRef : undefined}
                    aria-label={`${PRINT_TEXT_ROLE_LABEL[line.role]} line ${i + 1}`}
                    value={drafts[i] ?? ''}
                    onChange={(e) => setDrafts((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
                    className={`${inputCls} min-w-0 flex-1 !py-2 !text-base ${changed ? 'border-accent-400 dark:border-accent-500' : ''}`}
                    spellCheck
                  />
                  <button
                    type="button"
                    onClick={() => setDrafts((d) => d.map((v, j) => (j === i ? line.text : v)))}
                    disabled={!changed}
                    aria-label={`Undo line ${i + 1}`}
                    title="Back to the text on the design"
                    className={`${btnGhost} shrink-0`}
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {showQcHint && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              QC read on the image: “{qcFound}”{qcTextOk === false ? ' — it does not match the lines above.' : ''}
            </span>
          </p>
        )}

        {briefDiffers && (
          <p className="text-xs text-neutral-500">
            The brief currently says: {briefLines.length ? briefLines.map((l) => `“${l.text}”`).join(' · ') : 'no text'}. Applying also
            updates the brief.
          </p>
        )}

        <details className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800" open={lines.length === 0}>
          <summary className="cursor-pointer text-xs font-medium text-neutral-600 dark:text-neutral-400">Options</summary>
          <div className="mt-3 space-y-3">
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

            <PlatformPicker value={platform} onChange={setPickedPlatform} disabled={busy} studioDefault={defaultPlatform} size="sm" />

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
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" disabled={!canSubmit} className={btnPrimary}>
            {busy ? <Spinner /> : <Type className="h-4 w-4" />}
            {submitLabel}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
        </div>
      </fieldset>

      {problem && <p className="text-xs text-amber-700 dark:text-amber-300">{problem}</p>}
      {paused && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          The pipeline is paused by the lead. Nothing new is queued until it resumes.
        </p>
      )}
    </form>
  )
}
