import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

interface Props {
  id?: string
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  disabled?: boolean
  /** Offered as a datalist while typing (e.g. the client's garment colours). */
  suggestions?: readonly string[]
  ariaLabel?: string
}

/**
 * Chips + a text input. Enter or comma adds the typed value, Backspace on an empty
 * input removes the last chip, blur commits whatever is pending, and pasted
 * comma/newline separated text becomes several chips.
 */
export function TagInput({ id, value, onChange, placeholder, disabled = false, suggestions, ariaLabel }: Props) {
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!parts.length) return
    const next = [...value]
    for (const p of parts) {
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p)
    }
    if (next.length !== value.length) onChange(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      if (text.trim()) {
        e.preventDefault()
        commit(text)
        setText('')
      } else if (e.key === 'Enter') {
        e.preventDefault()
      }
    } else if (e.key === 'Backspace' && !text && value.length) {
      e.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')
    if (/[,\n]/.test(pasted)) {
      e.preventDefault()
      commit(text + pasted)
      setText('')
    }
  }

  const remove = (i: number) => onChange(value.filter((_, j) => j !== i))

  return (
    <div
      onClick={() => input.current?.focus()}
      className={`flex min-h-[38px] w-full flex-wrap items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm ring-neutral-900/10 focus-within:ring-4 dark:border-neutral-700 dark:bg-neutral-950 dark:ring-white/10 ${
        disabled ? 'cursor-not-allowed bg-neutral-50 dark:bg-neutral-900' : 'cursor-text'
      }`}
    >
      {value.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex max-w-full items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
        >
          <span className="truncate">{v}</span>
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                remove(i)
              }}
              aria-label={`Remove ${v}`}
              className="rounded p-0.5 text-neutral-500 outline-none ring-neutral-900/10 hover:text-neutral-900 focus-visible:ring-2 dark:ring-white/20 dark:hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <input
        ref={input}
        id={id}
        type="text"
        value={text}
        disabled={disabled}
        list={suggestions?.length ? listId : undefined}
        aria-label={ariaLabel}
        placeholder={value.length ? undefined : placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => {
          if (text.trim()) {
            commit(text)
            setText('')
          }
        }}
        className="min-w-[8ch] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed"
      />
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </div>
  )
}
