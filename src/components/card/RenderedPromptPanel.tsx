import { useCallback, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useToast } from '../../lib/useToast'
import { ACTIVE_JOB_STATUSES, type Generation } from '../../lib/types'
import { btnSecondary, btnSmall } from './styles'
import { Badge, Panel } from './ui'
import { PlatformBadge } from './PlatformBadge'

const chipCls = 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
const preCls =
  'max-h-96 select-text overflow-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3 font-mono text-xs leading-relaxed text-neutral-800 outline-none ring-neutral-900/10 focus-visible:ring-4 dark:bg-neutral-950 dark:text-neutral-200 dark:ring-white/10'

function clean(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t ? t : null
}

/** Engine parameters the prompt engine stamped on the row: model, aspect ratio, resolution. */
function EngineChips({ generation }: { generation: Generation }) {
  const model = clean(generation.model)
  const ratio = clean(generation.aspect_ratio)
  const resolution = clean(generation.resolution)
  const vendor = clean(generation.vendor)
  return (
    <>
      {model && (
        <Badge className={`${chipCls} max-w-full`} title={vendor ? `Model ${model} via ${vendor}` : `Model ${model}`}>
          <span className="max-w-[14rem] truncate">{model}</span>
        </Badge>
      )}
      {ratio && (
        <Badge className={chipCls} title="Aspect ratio, chosen from the placement">
          {ratio}
        </Badge>
      )}
      {resolution && (
        <Badge className={chipCls} title="Resolution, from Settings when the job was queued">
          {resolution}
        </Badge>
      )}
      <PlatformBadge generation={generation} />
    </>
  )
}

/** Labelled copy button for a block of text; falls back to a toast when the clipboard is blocked. */
function CopyTextButton({ text, label }: { text: string; label: string }) {
  const toast = useToast()
  const [done, setDone] = useState(false)
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      window.setTimeout(() => setDone(false), 1500)
    } catch {
      toast.error('The browser blocked the clipboard. Select the text and copy it by hand.')
    }
  }, [text, toast])
  return (
    <button type="button" onClick={() => void copy()} aria-label={done ? 'Copied' : label} className={`${btnSecondary} ${btnSmall}`}>
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

/**
 * The paragraph the prompt engine rendered from the magic prompt sections, exactly as
 * stored on the current generation. Read-only: change the sections and Regenerate.
 * When a polish step altered the text before it was sent, the final version is shown too.
 */
export function RenderedPromptPanel({
  generation,
  viewingOther,
  collapsible,
  defaultOpen,
}: {
  /** The card's current generation (the one Regenerate builds on), not the viewed one. */
  generation: Generation | null
  /** True when the designer is viewing a different generation in the strip. */
  viewingOther: boolean
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const text = clean(generation?.rendered_prompt)
  const finalText = clean(generation?.final_prompt)
  const polished = text !== null && finalText !== null && finalText !== text

  const subtitle = !generation
    ? 'Appears once the first generation is queued'
    : viewingOther
      ? 'Prompt of the current generation — the one Regenerate builds on, not the one you are viewing'
      : text
        ? `${text.length.toLocaleString()} characters · read-only — edit the magic prompt sections and Regenerate to change it`
        : 'Built by the prompt engine from the magic prompt sections'

  let emptyText: string
  if (!generation) emptyText = 'Approve the card to build the first prompt.'
  else if (ACTIVE_JOB_STATUSES.includes(generation.status)) emptyText = 'The prompt engine writes it the moment the job starts.'
  else if (generation.status === 'failed') emptyText = 'Nothing was rendered — the job failed before the prompt engine ran.'
  else emptyText = 'No rendered prompt was stored for this generation.'

  return (
    <Panel
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          Rendered prompt
          {generation && <EngineChips generation={generation} />}
        </span>
      }
      subtitle={subtitle}
      actions={text ? <CopyTextButton text={text} label="Copy rendered prompt" /> : undefined}
      collapsible={collapsible}
      defaultOpen={defaultOpen}
    >
      {text ? (
        <pre tabIndex={0} aria-label="Rendered prompt" className={preCls}>
          {text}
        </pre>
      ) : (
        <p className="text-sm text-neutral-500">{emptyText}</p>
      )}

      {polished && finalText && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-neutral-500">
            The final prompt sent to the engine differs — a polish step changed it after rendering
          </summary>
          <div className="mt-2 space-y-2">
            <pre tabIndex={0} aria-label="Final prompt" className={preCls}>
              {finalText}
            </pre>
            <CopyTextButton text={finalText} label="Copy final prompt" />
          </div>
        </details>
      )}
    </Panel>
  )
}
