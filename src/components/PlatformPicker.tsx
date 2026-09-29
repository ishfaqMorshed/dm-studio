import { useId, useRef, type KeyboardEvent } from 'react'
import { AI_PLATFORMS, AI_PLATFORM_HINT, AI_PLATFORM_LABEL, type AiPlatform } from '../lib/types'

interface Props {
  value: AiPlatform
  onChange: (next: AiPlatform) => void
  disabled?: boolean
  /** Visible label above the control. */
  label?: string
  /**
   * The studio default (settings.ai_platform). When given and the pick differs, the hint
   * says so, so a one-off choice on the card page is never mistaken for the default.
   */
  studioDefault?: AiPlatform
  /** `sm` for dialogs and tight rows (phone width); `md` for forms. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Segmented control for the AI platform: Kie / OpenRouter / Auto, with a one-line hint
 * for the selected option. Arrow keys move the selection (radio group semantics).
 */
export function PlatformPicker({
  value,
  onChange,
  disabled = false,
  label = 'AI platform',
  studioDefault,
  size = 'md',
  className = '',
}: Props) {
  const labelId = useId()
  const hintId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    const jump = e.key === 'Home' ? 0 : e.key === 'End' ? AI_PLATFORMS.length - 1 : null
    if (!step && jump === null) return
    e.preventDefault()
    const next = jump ?? (index + step + AI_PLATFORMS.length) % AI_PLATFORMS.length
    onChange(AI_PLATFORMS[next])
    refs.current[next]?.focus()
  }

  const segment = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  const differs = studioDefault !== undefined && studioDefault !== value

  return (
    <div className={`text-sm ${className}`}>
      <span id={labelId} className="mb-1 block font-medium">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className="flex w-full rounded-lg border border-neutral-300 bg-neutral-100 p-0.5 dark:border-neutral-700 dark:bg-neutral-800"
      >
        {AI_PLATFORMS.map((p, i) => {
          const on = p === value
          return (
            <button
              key={p}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(p)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`min-w-0 flex-1 truncate rounded-md font-medium outline-none ring-accent-500/30 transition focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 dark:ring-accent-400/40 ${segment} ${
                on
                  ? 'bg-white text-accent-700 shadow-card dark:bg-neutral-950 dark:text-accent-300'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
              }`}
            >
              {AI_PLATFORM_LABEL[p]}
            </button>
          )
        })}
      </div>
      <p id={hintId} className="mt-1 text-xs text-neutral-500">
        {AI_PLATFORM_HINT[value]}
        {differs ? ` · studio default is ${AI_PLATFORM_LABEL[studioDefault]}` : ''}
      </p>
    </div>
  )
}
