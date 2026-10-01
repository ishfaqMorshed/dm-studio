import { useId, useState } from 'react'
import { AlertTriangle, Check, Clock, Loader2, Sparkles, Undo2 } from 'lucide-react'
import { BRIEF_PARSE_MAX_CHARS, BRIEF_PARSE_MIN_CHARS } from '../../lib/api'
import { btnSecondary, hintCls, inputCls, labelCls } from '../style/classes'
import { BRIEF_PARSE_COST_LABEL, COST_SUFFIX } from './costs'
import { formatElapsed } from './steps'
import type { BriefParse } from './useBriefParse'

interface Props {
  parse: BriefParse
  /** The step is saving: no new parse meanwhile. */
  disabled: boolean
  /** How many controls the latest fill changed (0 = nothing new); null until a result was applied (and again after Save / Undo). */
  filledCount: number | null
  /** How many unsaved fills one Undo reverts (0 when there is nothing to undo). */
  undoFills: number
  /** Restores the values from before the (first unsaved) fill; null when there is nothing to undo. */
  onUndo: (() => void) | null
}

const PLACEHOLDER =
  'e.g. "Hi! We sell vintage-style badge tees for hikers, mostly Highland cows and chickens. Always UPPERCASE, black or white shirts, no gradients. Handle @ridgeandroost on every design."'

/**
 * "Fill from text": paste the client's own words, pay about $0.01, and the step fills its fields
 * from them. The panel owns the textarea and the request (`useBriefParse`); the step applies the
 * result to its form, marks the filled controls and offers Undo. Nothing is saved until Save brief.
 */
export function BriefFillPanel({ parse, disabled, filledCount, undoFills, onUndo }: Props) {
  const id = useId()
  const [text, setText] = useState('')
  const length = text.trim().length
  const busy = parse.phase === 'starting' || parse.phase === 'working'
  const tooShort = length < BRIEF_PARSE_MIN_CHARS
  const tooLong = length > BRIEF_PARSE_MAX_CHARS
  const canStart = !disabled && !busy && !tooShort && !tooLong
  const notes = parse.phase === 'done' && parse.result ? parse.result.notes_for_designer : []
  const buttonLabel = parse.phase === 'failed' ? 'Try again' : parse.phase === 'done' ? 'Fill again' : 'Fill from text'
  const disabledReason = disabled
    ? 'Wait for the save to finish'
    : tooShort
      ? `Paste at least ${BRIEF_PARSE_MIN_CHARS} characters`
      : tooLong
        ? `At most ${BRIEF_PARSE_MAX_CHARS} characters`
        : null

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="mb-5 space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent-600 dark:text-accent-300" aria-hidden="true" />
        <h3 id={`${id}-title`} className="text-sm font-semibold">
          Fill from text
        </h3>
        <span className="text-[11px] text-neutral-500">
          {BRIEF_PARSE_COST_LABEL} {COST_SUFFIX} per fill
        </span>
      </div>

      <div>
        <label htmlFor={`${id}-text`} className={labelCls}>
          Paste the client's brief (email, chat, notes) - we fill the fields from it
        </label>
        <textarea
          id={`${id}-text`}
          value={text}
          disabled={disabled || busy}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder={PLACEHOLDER}
          aria-describedby={`${id}-hint`}
          className={`${inputCls} resize-y`}
        />
        <p
          id={`${id}-hint`}
          className={`${hintCls} ${length > 0 && (tooShort || tooLong) ? 'text-amber-700 dark:text-amber-300' : ''}`}
        >
          {length.toLocaleString()} / {BRIEF_PARSE_MAX_CHARS.toLocaleString()} characters
          {tooShort ? ` · at least ${BRIEF_PARSE_MIN_CHARS}` : ''}. Every field the text supports is filled in; the
          others stay as they are. Lists and notes only gain entries; nothing already in them is removed. Nothing is
          saved until Save brief, which also keeps the pasted text with the brief.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void parse.start(text)}
          disabled={!canStart}
          aria-busy={busy || undefined}
          title={!busy && disabledReason ? disabledReason : undefined}
          className={btnSecondary}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>
                Reading the brief… <span className="font-mono tabular-nums">{formatElapsed(parse.elapsedMs)}</span>
              </span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {buttonLabel} · {BRIEF_PARSE_COST_LABEL}
            </>
          )}
        </button>

        {/* Shown until Save / Undo, also when a later attempt failed: the earlier fill is still in the form.
            While a later parse runs only the Undo stays, so an earlier fill can still be reverted. */}
        {filledCount !== null && (!busy || onUndo) && (
          <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-800 dark:text-emerald-300">
            {!busy && (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {filledCount === 0
                  ? 'Nothing new in the text: the fields already match.'
                  : `Filled ${filledCount} field${filledCount === 1 ? '' : 's'} from the text (marked "filled from text" until you change them). Check them, then Save brief.`}
              </span>
            )}
            {onUndo && (
              <button
                type="button"
                onClick={onUndo}
                title={
                  undoFills > 1
                    ? `Puts back the values from before the first of the ${undoFills} unsaved fills; fields you changed since are kept`
                    : 'Puts back the values from before the fill; fields you changed since are kept'
                }
                className="inline-flex items-center gap-1 rounded underline underline-offset-2 outline-none ring-accent-500/25 hover:no-underline focus-visible:ring-4"
              >
                <Undo2 className="h-3 w-3" aria-hidden="true" />
                {undoFills > 1 ? `Undo ${undoFills} fills` : 'Undo fill'}
              </button>
            )}
          </p>
        )}
      </div>

      {parse.slow && (
        <p role="status" className="flex flex-wrap items-start gap-x-2 gap-y-1 text-xs text-amber-800 dark:text-amber-300">
          <span className="inline-flex items-start gap-1.5">
            <Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {parse.request?.status === 'queued'
                ? 'The request has not been picked up yet (the worker may be busy or offline). '
                : 'The assistant is slow to answer (a retry can take a few minutes). '}
              The form still fills when the answer arrives.
            </span>
          </span>
          <button
            type="button"
            onClick={parse.reset}
            title="Stops watching this request; an answer that arrives later is not used"
            className="rounded underline underline-offset-2 outline-none ring-accent-500/25 hover:no-underline focus-visible:ring-4"
          >
            Stop waiting
          </button>
        </p>
      )}

      {parse.phase === 'failed' && parse.error && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{parse.error}</span>
        </p>
      )}

      {notes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">Notes for the designer</p>
          <p className="mt-0.5 text-[11px] opacity-80">What the text implied but the assistant was not sure about. Not saved.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {notes.map((n, i) => (
              <li key={`${i}-${n}`}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
