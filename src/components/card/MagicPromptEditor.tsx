import { Undo2 } from 'lucide-react'
import { SECTION_KIND_HINT, replaceSection, type PromptSection } from './magicPrompt'
import { btnSecondary, btnSmall, textareaCls } from './styles'
import { Field } from './ui'

function rowsFor(s: PromptSection): number {
  const lines = s.value.split('\n').length
  return Math.min(12, Math.max(2, lines, Math.ceil(s.value.length / 90)))
}

/**
 * One textarea per prompt section. Derived sections (the rendered paragraph) are
 * read-only because the engine rebuilds them from the sections above on Regenerate.
 */
export function MagicPromptEditor({
  sections,
  onChange,
  onReset,
  dirty,
  disabled = false,
  emptyText,
}: {
  sections: PromptSection[]
  onChange: (next: PromptSection[]) => void
  onReset: () => void
  dirty: boolean
  disabled?: boolean
  emptyText: string
}) {
  if (!sections.length) return <p className="text-sm text-neutral-500">{emptyText}</p>

  return (
    <div className="space-y-3">
      {dirty && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span>Edited — Regenerate sends this version and stores it on the new generation.</span>
          <button type="button" onClick={onReset} className={`${btnSecondary} ${btnSmall}`}>
            <Undo2 className="h-3.5 w-3.5" />
            Reset to stored prompt
          </button>
        </div>
      )}
      {sections.map((s, i) => {
        const hint = s.derived ? 'Rendered by the engine — rebuilt on Regenerate' : SECTION_KIND_HINT[s.kind]
        return (
          <Field key={s.key} label={s.label} hint={hint}>
            <textarea
              value={s.value}
              readOnly={s.derived}
              disabled={disabled}
              rows={rowsFor(s)}
              onChange={(e) => onChange(replaceSection(sections, i, e.target.value))}
              className={`${textareaCls} font-mono text-xs ${s.derived ? 'bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400' : ''}`}
              spellCheck={s.kind === 'text' || s.kind === 'lines'}
            />
          </Field>
        )
      })}
    </div>
  )
}
