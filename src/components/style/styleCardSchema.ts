/**
 * The Style Card JSON schema (SOP §7.1) as a typed document, plus the two
 * boundary functions every editor surface goes through:
 *
 *   normalizeStyleCard(json)  — anything stored in style_cards.json → StyleCardDoc
 *   styleCardToJson(doc)      — StyleCardDoc → the JSON that gets saved
 *
 * Unknown keys are kept in `extra` so a hand-edited card never loses data on save.
 */
import type { Json } from '../../lib/types'
import { isRecord } from '../../lib/types'

export const SCHEMA_VERSION = 1

export interface PaletteEntry {
  name: string
  hex: string
  weight: string
}

export interface StyleCardDoc {
  version: number
  medium: string
  linework: { weight: string; style: string }
  shading: string
  texture: string
  palette: PaletteEntry[]
  composition: string
  typography: { vibe: string; placement: string; case: string }
  background: string
  mood: string[]
  subjects: string[]
  forbid: string[]
  signature_moves: string[]
  garment_colors: string[]
  /** Keys outside the schema, preserved verbatim. */
  extra: Record<string, Json>
}

/** Suggested palette roles (free text is allowed). */
export const PALETTE_WEIGHTS = ['dominant', 'secondary', 'accent', 'outline', 'highlight', 'shadow'] as const

const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'version',
  'medium',
  'linework',
  'shading',
  'texture',
  'palette',
  'composition',
  'typography',
  'background',
  'mood',
  'subjects',
  'forbid',
  'signature_moves',
  'garment_colors',
])

const HEX_RE = /^#[0-9a-f]{6}$/i

export function isValidHex(s: string): boolean {
  return HEX_RE.test(s.trim())
}

export function emptyStyleCard(): StyleCardDoc {
  return {
    version: SCHEMA_VERSION,
    medium: '',
    linework: { weight: '', style: '' },
    shading: '',
    texture: '',
    palette: [],
    composition: '',
    typography: { vibe: '', placement: '', case: '' },
    background: '',
    mood: [],
    subjects: [],
    forbid: [],
    signature_moves: [],
    garment_colors: [],
    extra: {},
  }
}

function str(v: Json | undefined): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/** Accepts a JSON array of strings, or a comma/newline separated string. */
function strList(v: Json | undefined): string[] {
  if (Array.isArray(v)) {
    return v.map((s) => str(s).trim()).filter(Boolean)
  }
  if (typeof v === 'string') {
    return v
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

function paletteEntry(v: Json): PaletteEntry | null {
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    return isValidHex(s) ? { name: '', hex: s, weight: '' } : { name: s, hex: '', weight: '' }
  }
  if (!isRecord(v)) return null
  const entry = { name: str(v.name).trim(), hex: str(v.hex).trim(), weight: str(v.weight).trim() }
  return entry.name || entry.hex || entry.weight ? entry : null
}

/** Never throws; every field falls back to empty so the form always renders. */
export function normalizeStyleCard(json: Json | null | undefined): StyleCardDoc {
  const doc = emptyStyleCard()
  if (!isRecord(json)) return doc

  const version = json.version
  doc.version = typeof version === 'number' && Number.isFinite(version) ? version : SCHEMA_VERSION
  doc.medium = str(json.medium)
  doc.shading = str(json.shading)
  doc.texture = str(json.texture)
  doc.composition = str(json.composition)
  doc.background = str(json.background)

  const linework = json.linework
  if (isRecord(linework)) {
    doc.linework = { weight: str(linework.weight), style: str(linework.style) }
  } else if (typeof linework === 'string') {
    doc.linework = { weight: '', style: linework }
  }

  const typography = json.typography
  if (isRecord(typography)) {
    doc.typography = { vibe: str(typography.vibe), placement: str(typography.placement), case: str(typography.case) }
  } else if (typeof typography === 'string') {
    doc.typography = { vibe: typography, placement: '', case: '' }
  }

  const palette = json.palette
  if (Array.isArray(palette)) {
    doc.palette = palette.map(paletteEntry).filter((p): p is PaletteEntry => p !== null)
  }

  doc.mood = strList(json.mood)
  doc.subjects = strList(json.subjects)
  doc.forbid = strList(json.forbid)
  doc.signature_moves = strList(json.signature_moves)
  doc.garment_colors = strList(json.garment_colors)

  for (const [k, v] of Object.entries(json)) {
    if (!KNOWN_KEYS.has(k) && v !== undefined) doc.extra[k] = v
  }
  return doc
}

const clean = (s: string) => s.trim()
const cleanList = (xs: string[]) => xs.map(clean).filter(Boolean)

/** The exact object written to style_cards.json. Schema keys first, in SOP order, then extras. */
export function styleCardToJson(doc: StyleCardDoc): Record<string, Json> {
  const out: Record<string, Json> = {
    version: doc.version,
    medium: clean(doc.medium),
    linework: { weight: clean(doc.linework.weight), style: clean(doc.linework.style) },
    shading: clean(doc.shading),
    texture: clean(doc.texture),
    palette: doc.palette
      .map((p) => ({ name: clean(p.name), hex: clean(p.hex), weight: clean(p.weight) }))
      .filter((p) => p.name || p.hex || p.weight),
    composition: clean(doc.composition),
    typography: {
      vibe: clean(doc.typography.vibe),
      placement: clean(doc.typography.placement),
      case: clean(doc.typography.case),
    },
    background: clean(doc.background),
    mood: cleanList(doc.mood),
    subjects: cleanList(doc.subjects),
    forbid: cleanList(doc.forbid),
    signature_moves: cleanList(doc.signature_moves),
    garment_colors: cleanList(doc.garment_colors),
  }
  for (const [k, v] of Object.entries(doc.extra)) {
    if (!(k in out)) out[k] = v
  }
  return out
}

export function prettyJson(doc: StyleCardDoc): string {
  return JSON.stringify(styleCardToJson(doc), null, 2)
}

/** True for a draft the backend would refuse to lock (`{}`), or nothing at all. */
export function isEmptyStyleCardJson(json: Json | null | undefined): boolean {
  return !isRecord(json) || Object.keys(json).length === 0
}

export interface StyleCardIssues {
  /** Stop the lock; the card would be wrong forever. */
  blocking: string[]
  /** Worth a second look, but a designer may lock anyway. */
  warnings: string[]
}

export function styleCardIssues(doc: StyleCardDoc): StyleCardIssues {
  const blocking: string[] = []
  const warnings: string[] = []

  const badHex = doc.palette.filter((p) => p.hex.trim() && !isValidHex(p.hex))
  if (badHex.length) {
    blocking.push(
      `${badHex.length === 1 ? 'One palette colour has' : `${badHex.length} palette colours have`} a hex that is not #RRGGBB (${badHex
        .map((p) => p.hex.trim())
        .join(', ')}).`,
    )
  }
  if (!doc.medium.trim()) warnings.push('Medium is empty; the prompt will not say what kind of artwork to draw.')
  if (!doc.palette.length) warnings.push('Palette is empty; colours will be left to the model.')
  if (!doc.forbid.length) warnings.push('Forbid list is empty; nothing will be sent as a negative.')
  if (!doc.typography.vibe.trim()) warnings.push('Typography vibe is empty; print text will use a generic typeface.')
  return { blocking, warnings }
}
