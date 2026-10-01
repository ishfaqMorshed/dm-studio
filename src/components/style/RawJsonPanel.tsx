import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, Braces, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { copyText } from './clipboard'
import { useToast } from '../../lib/useToast'

interface Props {
  /** Text shown in the editor; the parent keeps it in sync with the form. */
  text: string
  onTextChange: (text: string) => void
  /** Parse error for the current text, or null when it is valid JSON. */
  error: string | null
  /** Re-pretty-prints the text from the parsed document (only when valid). */
  onFormat: () => void
  readOnly?: boolean
  /** Bump to expand the panel and focus the text (a deep link to a key the form does not edit). */
  expandSignal?: number
}

/**
 * Collapsed by default (SOP §5.5). Typing valid JSON updates the form live;
 * invalid JSON keeps the last good document and shows the parser's message.
 */
export function RawJsonPanel({ text, onTextChange, error, onFormat, readOnly = false, expandSignal = 0 }: Props) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const areaId = useId()
  const errId = useId()
  const area = useRef<HTMLTextAreaElement>(null)

  // A new signal opens the panel (derived during render); the DOM focus follows in the effect.
  const [seenSignal, setSeenSignal] = useState(0)
  if (expandSignal !== seenSignal) {
    setSeenSignal(expandSignal)
    setOpen(true)
  }

  useEffect(() => {
    if (!expandSignal) return
    // The textarea is inside a `hidden` wrapper until the open state commits; focus after that paint.
    const frame = window.requestAnimationFrame(() => {
      const el = area.current
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [expandSignal])

  async function copy() {
    try {
      await copyText(text)
      toast.success('JSON copied')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Copy failed')
    }
  }

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={areaId}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left text-sm font-medium outline-none ring-neutral-900/10 focus-visible:ring-4 dark:ring-white/20"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <Braces className="h-4 w-4 shrink-0 text-neutral-400" />
          Raw JSON
          <span className="truncate text-xs font-normal text-neutral-500">
            {readOnly ? 'exactly what the prompt engine reads' : 'what Save writes; edits here update the form'}
          </span>
        </button>
        {error && !open && (
          <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            invalid
          </span>
        )}
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-neutral-600 outline-none ring-neutral-900/10 hover:bg-neutral-100 focus-visible:ring-4 dark:text-neutral-300 dark:ring-white/20 dark:hover:bg-neutral-800"
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={onFormat}
            disabled={error !== null}
            title={error ? 'Fix the JSON first' : 'Re-indent'}
            className="rounded-lg px-2 py-1 text-xs text-neutral-600 outline-none ring-neutral-900/10 hover:bg-neutral-100 focus-visible:ring-4 disabled:opacity-40 dark:text-neutral-300 dark:ring-white/20 dark:hover:bg-neutral-800"
          >
            Format
          </button>
        )}
      </div>
      <div id={areaId} hidden={!open} className="border-t border-neutral-200 p-3 dark:border-neutral-800">
        <textarea
          ref={area}
          value={text}
          readOnly={readOnly}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={() => {
            if (!readOnly && error === null) onFormat()
          }}
          spellCheck={false}
          aria-label="Style Card JSON"
          aria-invalid={error !== null || undefined}
          aria-describedby={error ? errId : undefined}
          rows={Math.min(40, Math.max(12, text.split('\n').length + 1))}
          className={`w-full resize-y rounded-lg border bg-neutral-50 px-3 py-2 font-mono text-xs leading-5 outline-none ring-neutral-900/10 focus:ring-4 dark:bg-neutral-950 dark:ring-white/10 ${
            error
              ? 'border-red-400 dark:border-red-700'
              : 'border-neutral-300 dark:border-neutral-700'
          } ${readOnly ? 'text-neutral-600 dark:text-neutral-300' : ''}`}
        />
        {error && (
          <p id={errId} role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Not valid JSON, so the form still shows the last good version: {error}. Fix it here or keep editing in
              the form (the form will overwrite this text).
            </span>
          </p>
        )}
      </div>
    </section>
  )
}
