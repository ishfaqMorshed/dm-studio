/**
 * `?field=<path>` deep links (readout chips, QC style_match, the step-4 StyleMatchStrip) name a Style
 * Card value by its JSON path: `typography.headline.family`, `palette[0].hex`, `linework.weight`.
 * This maps a path to the form control that edits it, or to null when only the raw JSON holds it
 * (hero.framing, evidence, rules, ...). Pure, so the editor can decide before the form renders.
 */

/** Controls the form renders, keyed by the normalised path they edit. */
const FORM_CONTROLS: ReadonlySet<string> = new Set([
  'medium',
  'realism',
  'linework.weight',
  'linework.style',
  'linework.outline',
  'shading',
  'shading_method',
  'texture',
  'edge_finish',
  'palette',
  'composition',
  'typography.vibe',
  'typography.placement',
  'typography.case',
  'typography.headline.family',
  'typography.headline.weight',
  'typography.headline.effects',
  'typography.secondary.family',
  'typography.secondary.weight',
  'typography.secondary.effects',
  'background',
  'mood',
  'subjects',
  'signature_moves',
  'forbid',
  'garment_colors',
])

/** A parent path opens on its first control. */
const PARENT_DEFAULT: Readonly<Record<string, string>> = {
  linework: 'linework.weight',
  typography: 'typography.vibe',
  'typography.headline': 'typography.headline.family',
  'typography.secondary': 'typography.secondary.family',
}

/** `palette[2].hex` and `palette.2.hex` both read as the hex of the third entry. */
const PALETTE_ENTRY_RE = /^palette[.[](\d+)\]?(?:\.(name|hex|weight|role))?$/

/** `forbid[4]`, `mood.2`: the shared rules name list items; the form edits the whole list in one tag control. */
const LIST_ITEM_RE = /^(mood|subjects|forbid|signature_moves|garment_colors)[.[]\d+\]?$/

/**
 * The form control key for a path, or null when the form has none. Palette entries resolve to
 * `palette.<i>.<name|hex|weight|role>` (hex when the path stops at the entry); an item of one of the
 * string lists (`forbid[4]`) resolves to that list's tag control.
 */
export function formControlFor(path: string): string | null {
  const p = path.trim().replace(/^json\./, '')
  if (!p) return null
  if (FORM_CONTROLS.has(p)) return p
  if (p in PARENT_DEFAULT) return PARENT_DEFAULT[p]
  const m = PALETTE_ENTRY_RE.exec(p)
  if (m) return `palette.${m[1]}.${m[2] ?? 'hex'}`
  const l = LIST_ITEM_RE.exec(p)
  if (l) return l[1]
  return null
}

/** Short label for messages: "typography › headline › family". */
export function fieldLabel(path: string): string {
  return path
    .trim()
    .replace(/^json\./, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .join(' › ')
}
