import { useId } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { btnSecondary, inputCls } from './classes'
import { isValidHex, PALETTE_WEIGHTS, type PaletteEntry } from './styleCardSchema'

interface Props {
  value: PaletteEntry[]
  onChange: (next: PaletteEntry[]) => void
  disabled?: boolean
}

/** Palette rows: swatch, name, hex, role. Invalid hex is flagged inline; Lock refuses it. */
export function PaletteEditor({ value, onChange, disabled = false }: Props) {
  const weightsId = useId()

  const update = (i: number, patch: Partial<PaletteEntry>) =>
    onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i))
  const add = () => onChange([...value, { name: '', hex: '#', weight: value.length === 0 ? 'dominant' : '' }])

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-3 text-xs text-neutral-500 dark:border-neutral-700">
          No colours yet. Add the two to four colours every design for this client should use.
        </p>
      )}
      {value.map((p, i) => {
        const hexOk = isValidHex(p.hex)
        const showError = p.hex.trim().length > 1 && !hexOk
        return (
          <div key={i} className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
            <label className="relative shrink-0" title={hexOk ? 'Pick a colour' : 'Enter a valid hex to enable the picker'}>
              <span className="sr-only">Colour picker for palette entry {i + 1}</span>
              <input
                type="color"
                value={hexOk ? p.hex.trim().toUpperCase() : '#808080'}
                disabled={disabled || !hexOk}
                onChange={(e) => update(i, { hex: e.target.value.toUpperCase() })}
                className="h-[38px] w-10 cursor-pointer rounded-lg border border-neutral-300 bg-white p-0.5 disabled:cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <div className="min-w-0 flex-1 basis-[10rem]">
              <input
                type="text"
                value={p.name}
                disabled={disabled}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Name (bone, rust, ink)"
                aria-label={`Palette entry ${i + 1} name`}
                className={inputCls}
              />
            </div>
            <div className="w-[8.5rem] shrink-0">
              <input
                type="text"
                value={p.hex}
                disabled={disabled}
                onChange={(e) => update(i, { hex: e.target.value })}
                placeholder="#RRGGBB"
                aria-label={`Palette entry ${i + 1} hex`}
                aria-invalid={showError || undefined}
                spellCheck={false}
                className={`${inputCls} font-mono uppercase ${
                  showError ? 'border-red-400 ring-red-500/20 dark:border-red-700' : ''
                }`}
              />
              {showError && (
                <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">Use #RRGGBB, e.g. #B5472A</p>
              )}
            </div>
            <div className="w-[9rem] shrink-0">
              <input
                type="text"
                value={p.weight}
                disabled={disabled}
                list={weightsId}
                onChange={(e) => update(i, { weight: e.target.value })}
                placeholder="Role (dominant…)"
                aria-label={`Palette entry ${i + 1} role`}
                className={inputCls}
              />
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove palette entry ${i + 1}`}
                className="inline-flex h-[38px] w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 outline-none ring-neutral-900/10 hover:bg-neutral-100 hover:text-red-600 focus-visible:ring-4 dark:border-neutral-700 dark:ring-white/20 dark:hover:bg-neutral-800"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )
      })}
      <datalist id={weightsId}>
        {PALETTE_WEIGHTS.map((w) => (
          <option key={w} value={w} />
        ))}
      </datalist>
      {!disabled && (
        <button type="button" onClick={add} className={`${btnSecondary} px-2.5 py-1.5 text-xs`}>
          <Plus className="h-3.5 w-3.5" />
          Add colour
        </button>
      )}
    </div>
  )
}
