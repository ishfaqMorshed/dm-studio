/**
 * The Style Card JSON schema (SOP §7.1, v2 additions in docs/stylecard-v2-spec.md §1.3) as a typed
 * document, plus the two boundary functions every editor surface goes through:
 *
 *   normalizeStyleCard(json)  — anything stored in style_cards.json → StyleCardDoc
 *   styleCardToJson(doc)      — StyleCardDoc → the JSON that gets saved
 *
 * The form edits the typed fields. Every other key is kept verbatim in `extra`: the v2 keys the
 * profiler writes and the form does not edit (schema, hero, rules, evidence, field_evidence, ...)
 * as well as anything unknown, so a round trip through the editor never loses data. Nested objects
 * (linework, typography and its headline/secondary, each palette entry) keep their unknown keys too.
 *
 * Checks delegate to the shared pure rule module (supabase/functions/_shared/style_card_rules.ts,
 * aliased as @shared/style_card_rules) so the editor, the lock gate and the profiler agree.
 */
import {
  AGREEMENT_WARN_BELOW,
  CASE_ENUM,
  LINE_WEIGHTS,
  checkStyleCard,
  type StyleBrief as RuleBrief,
} from '@shared/style_card_rules'
import { hasRules, readRules, rulesEqual, rulesFromBrief, rulesSummary, type StyleBrief } from '../../lib/styleBrief'
import type { Json } from '../../lib/types'
import { isRecord } from '../../lib/types'

export const SCHEMA_VERSION = 1

/** A JSON object whose named keys the form edits; any other key rides along verbatim. */
type Carrier = { [k: string]: Json | undefined }

export interface PaletteEntry extends Carrier {
  name: string
  hex: string
  weight: string
  /** v2: how the colour is used (line, fill, text, disc, accent, highlight). Free text allowed. */
  role?: string
}

export interface Lettering extends Carrier {
  family: string
  weight: string
  effects: string[]
}

export interface Linework extends Carrier {
  weight: string
  style: string
  /** v2 */
  outline: string
}

export interface Typography extends Carrier {
  vibe: string
  placement: string
  case: string
  /** v2 */
  headline: Lettering
  /** v2 */
  secondary: Lettering
}

export interface StyleCardDoc {
  version: number
  medium: string
  /** v2 */
  realism: string
  linework: Linework
  shading: string
  /** v2 */
  shading_method: string
  texture: string
  /** v2 */
  edge_finish: string
  palette: PaletteEntry[]
  composition: string
  typography: Typography
  background: string
  mood: string[]
  subjects: string[]
  forbid: string[]
  signature_moves: string[]
  garment_colors: string[]
  /**
   * Every key the form does not edit, preserved verbatim: the v2 keys (schema, palette_variants, hero,
   * subject_sources, brand_text, representative_images, field_evidence, brief_check, evidence, rules,
   * reference_ids, source, validation) and anything outside the schema (see `unknownKeys`).
   */
  extra: Record<string, Json>
}

/* ---------- Vocabulary (spec §1.3). Selects offer these; a value outside them is kept and shown as such. ---------- */

export { CASE_ENUM, LINE_WEIGHTS }
/** Palette weights (spec: exactly one dominant, listed first). Free text is still accepted. */
export const PALETTE_WEIGHTS = ['dominant', 'secondary', 'accent', 'outline'] as const
export const PALETTE_ROLES = ['line', 'fill', 'text', 'disc', 'accent', 'highlight'] as const
export const REALISM = ['iconic', 'stylised', 'detailed', 'realistic'] as const
export const OUTLINES = ['none', 'thin', 'thick', 'keyline'] as const
export const SHADING_METHODS = ['none', 'flat', 'hatching', 'stipple', 'halftone', 'cel', 'painterly'] as const
export const EDGE_FINISHES = ['clean', 'rough', 'distressed', 'stamped'] as const
export const FAMILIES = [
  'slab_serif',
  'display_serif',
  'condensed_sans',
  'grotesk_sans',
  'script',
  'brush',
  'blackletter',
  'woodtype',
  'stencil',
  'hand_lettered',
  'other',
] as const
export const FONT_WEIGHTS = ['light', 'regular', 'bold', 'black'] as const
export const EFFECTS = ['arched', 'inline_hatching', 'outline', 'banner', 'drop_line', 'distressed'] as const

/** Every key of the Style Card schema, v1 (14 keys) and v2 (additive). Anything else is "outside the schema". */
export const KNOWN_KEYS: ReadonlySet<string> = new Set([
  // v1
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
  // v2
  'schema',
  'realism',
  'shading_method',
  'edge_finish',
  'palette_variants',
  'hero',
  'subject_sources',
  'brand_text',
  'representative_images',
  'field_evidence',
  'brief_check',
  'evidence',
  'rules',
  'reference_ids',
  'source',
  'validation',
])

/** The keys with a typed field on the document; the rest of a card lives in `extra`. */
const FORM_KEYS: ReadonlySet<string> = new Set([
  'version',
  'medium',
  'realism',
  'linework',
  'shading',
  'shading_method',
  'texture',
  'edge_finish',
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

export function emptyLettering(): Lettering {
  return { family: '', weight: '', effects: [] }
}

export function emptyStyleCard(): StyleCardDoc {
  return {
    version: SCHEMA_VERSION,
    medium: '',
    realism: '',
    linework: { weight: '', style: '', outline: '' },
    shading: '',
    shading_method: '',
    texture: '',
    edge_finish: '',
    palette: [],
    composition: '',
    typography: { vibe: '', placement: '', case: '', headline: emptyLettering(), secondary: emptyLettering() },
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

/** The record without the given keys and without undefined values (what "rides along"). */
function rest(v: Record<string, Json | undefined>, omit: ReadonlySet<string>): Record<string, Json> {
  const out: Record<string, Json> = {}
  for (const [k, val] of Object.entries(v)) {
    if (!omit.has(k) && val !== undefined) out[k] = val
  }
  return out
}

const PALETTE_CORE = new Set(['name', 'hex', 'weight', 'role'])
const LETTERING_CORE = new Set(['family', 'weight', 'effects'])
const LINEWORK_CORE = new Set(['weight', 'style', 'outline'])
const TYPOGRAPHY_CORE = new Set(['vibe', 'placement', 'case', 'headline', 'secondary'])

function paletteEntry(v: Json): PaletteEntry | null {
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    return isValidHex(s) ? { name: '', hex: s, weight: '' } : { name: s, hex: '', weight: '' }
  }
  if (!isRecord(v)) return null
  const entry: PaletteEntry = {
    ...rest(v, PALETTE_CORE),
    name: str(v.name).trim(),
    hex: str(v.hex).trim(),
    weight: str(v.weight).trim(),
  }
  const role = str(v.role).trim()
  if (role) entry.role = role
  return entry.name || entry.hex || entry.weight ? entry : null
}

function lettering(v: Json | undefined): Lettering {
  if (isRecord(v)) {
    return { ...rest(v, LETTERING_CORE), family: str(v.family), weight: str(v.weight), effects: strList(v.effects) }
  }
  if (typeof v === 'string') return { family: v, weight: '', effects: [] }
  return emptyLettering()
}

/** Never throws; every field falls back to empty so the form always renders. */
export function normalizeStyleCard(json: Json | null | undefined): StyleCardDoc {
  const doc = emptyStyleCard()
  if (!isRecord(json)) return doc

  const version = json.version
  doc.version = typeof version === 'number' && Number.isFinite(version) ? version : SCHEMA_VERSION
  doc.medium = str(json.medium)
  doc.realism = str(json.realism)
  doc.shading = str(json.shading)
  doc.shading_method = str(json.shading_method)
  doc.texture = str(json.texture)
  doc.edge_finish = str(json.edge_finish)
  doc.composition = str(json.composition)
  doc.background = str(json.background)

  const linework = json.linework
  if (isRecord(linework)) {
    doc.linework = {
      ...rest(linework, LINEWORK_CORE),
      weight: str(linework.weight),
      style: str(linework.style),
      outline: str(linework.outline),
    }
  } else if (typeof linework === 'string') {
    doc.linework = { weight: '', style: linework, outline: '' }
  }

  const typography = json.typography
  if (isRecord(typography)) {
    doc.typography = {
      ...rest(typography, TYPOGRAPHY_CORE),
      vibe: str(typography.vibe),
      placement: str(typography.placement),
      case: str(typography.case),
      headline: lettering(typography.headline),
      secondary: lettering(typography.secondary),
    }
  } else if (typeof typography === 'string') {
    doc.typography = { ...emptyStyleCard().typography, vibe: typography }
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

  doc.extra = rest(json, FORM_KEYS)
  return doc
}

const clean = (s: string) => s.trim()
const cleanList = (xs: string[]) => xs.map(clean).filter(Boolean)

/** Omitted from the JSON when nothing was set, so a v1 card stays a v1 card after a round trip. */
function letteringJson(l: Lettering): Record<string, Json> | null {
  const others = rest(l, LETTERING_CORE)
  const family = clean(l.family)
  const weight = clean(l.weight)
  const effects = cleanList(l.effects)
  if (!family && !weight && !effects.length && !Object.keys(others).length) return null
  return { family, weight, effects, ...others }
}

/** The exact object written to style_cards.json. Schema keys first, in SOP order, then extras. */
export function styleCardToJson(doc: StyleCardDoc): Record<string, Json> {
  const out: Record<string, Json> = {}
  // v2 cards carry `schema: 2` instead of the v1 `version`; keep whichever the card uses, schema first.
  const schema = doc.extra.schema
  if (typeof schema === 'number') out.schema = schema
  else out.version = doc.version

  out.medium = clean(doc.medium)
  if (clean(doc.realism)) out.realism = clean(doc.realism)

  const linework: Record<string, Json> = { weight: clean(doc.linework.weight), style: clean(doc.linework.style) }
  if (clean(doc.linework.outline)) linework.outline = clean(doc.linework.outline)
  out.linework = { ...linework, ...rest(doc.linework, LINEWORK_CORE) }

  out.shading = clean(doc.shading)
  if (clean(doc.shading_method)) out.shading_method = clean(doc.shading_method)
  out.texture = clean(doc.texture)
  if (clean(doc.edge_finish)) out.edge_finish = clean(doc.edge_finish)

  out.palette = doc.palette
    .map((p): Record<string, Json> => {
      const entry: Record<string, Json> = { name: clean(p.name), hex: clean(p.hex), weight: clean(p.weight) }
      const role = clean(p.role ?? '')
      if (role) entry.role = role
      return { ...entry, ...rest(p, PALETTE_CORE) }
    })
    .filter((p) => p.name || p.hex || p.weight)

  out.composition = clean(doc.composition)

  const typography: Record<string, Json> = {
    vibe: clean(doc.typography.vibe),
    placement: clean(doc.typography.placement),
    case: clean(doc.typography.case),
  }
  const headline = letteringJson(doc.typography.headline)
  const secondary = letteringJson(doc.typography.secondary)
  if (headline) typography.headline = headline
  if (secondary) typography.secondary = secondary
  out.typography = { ...typography, ...rest(doc.typography, TYPOGRAPHY_CORE) }

  out.background = clean(doc.background)
  out.mood = cleanList(doc.mood)
  out.subjects = cleanList(doc.subjects)
  out.forbid = cleanList(doc.forbid)
  out.signature_moves = cleanList(doc.signature_moves)
  out.garment_colors = cleanList(doc.garment_colors)

  for (const [k, v] of Object.entries(doc.extra)) {
    if (!(k in out)) out[k] = v
  }
  return out
}

export function prettyJson(doc: StyleCardDoc): string {
  return JSON.stringify(styleCardToJson(doc), null, 2)
}

/** Keys the card carries that are in no version of the schema (hand edits, older profilers). */
export function unknownKeys(doc: StyleCardDoc): string[] {
  return Object.keys(doc.extra).filter((k) => !KNOWN_KEYS.has(k))
}

/** True for a draft the backend would refuse to lock (`{}`), or nothing at all. */
export function isEmptyStyleCardJson(json: Json | null | undefined): boolean {
  return !isRecord(json) || Object.keys(json).length === 0
}

/* ---------- Checks (shared rules) ---------- */

export interface StyleCardIssues {
  /** Stop the lock; the card would be wrong forever. */
  blocking: string[]
  /** Worth a second look, but a designer may lock anyway. */
  warnings: string[]
}

export interface StyleCardCheck extends StyleCardIssues {
  /** Deterministic fixes the shared rules apply ("Clean up"), in the module's own words. */
  fixes: string[]
  /** The card with those fixes applied; feed it to normalizeStyleCard. */
  fixed: Json
  /** Paths whose field_evidence agreement is below the warning threshold (amber outline in the readout). */
  lowAgreement: string[]
}

/** `field_evidence[path].agreement` below the threshold, from the card itself (the sheets are not in the browser). */
export function lowAgreementPaths(doc: StyleCardDoc): string[] {
  const fe = doc.extra.field_evidence
  if (!isRecord(fe)) return []
  return Object.entries(fe)
    .filter(([, v]) => isRecord(v) && typeof v.agreement === 'number' && v.agreement < AGREEMENT_WARN_BELOW)
    .map(([path]) => path)
}

function pluralise(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** The module's warning for a typography.case that is no letter case at all ('as_typed'); the lock gate promotes it. */
const CASE_NOT_LETTER_CASE_RE = /^typography\.case .* is not a letter case/

/**
 * Runs the shared rules over the card as it would be saved. Blocking = the module's errors (its own
 * isBlocking rule, spec 4.1) plus one promoted warning: a typography.case that is no letter case at
 * all ('as_typed'), which the prompt engine would otherwise copy verbatim. Pending fixes are a
 * warning, not a block: Clean up applies them here and prompt-engine applies the same fixes at
 * render time. Warnings also carry the agreement and brief-rules lines the module cannot know
 * without the sheets or the client record.
 */
export function checkStyleCardDoc(
  doc: StyleCardDoc,
  brief?: StyleBrief | null,
  clientGarments?: readonly string[] | null,
): StyleCardCheck {
  // The frontend brief is an interface; the module's is an open record. Same keys, so a spread converts.
  const ruleBrief: RuleBrief | null = brief ? { ...brief } : null
  const result = checkStyleCard(styleCardToJson(doc), {
    brief: ruleBrief,
    client_garments: clientGarments ? [...clientGarments] : null,
  })

  const blocking: string[] = [...result.errors]
  const warnings: string[] = []
  for (const w of result.warnings) {
    if (CASE_NOT_LETTER_CASE_RE.test(w)) blocking.push(`${w} - Clean up clears it (${CASE_ENUM.join('|')} or empty are the letter cases).`)
    else warnings.push(w)
  }
  if (result.fixes.length) {
    const shown = result.fixes.slice(0, 3).join('; ')
    warnings.push(
      `${pluralise(result.fixes.length, 'automatic fix is', 'automatic fixes are')} pending - Clean up applies them now (${shown}${
        result.fixes.length > 3 ? '; …' : ''
      }); the prompt engine applies the same fixes at render time.`,
    )
  }
  const lowAgreement = lowAgreementPaths(doc)
  if (lowAgreement.length) {
    warnings.push(
      `${pluralise(lowAgreement.length, 'field', 'fields')} below ${Math.round(AGREEMENT_WARN_BELOW * 100)}% agreement across the analysed designs (${lowAgreement.join(', ')}).`,
    )
  }
  if (brief) {
    const cardRules = readRules(doc.extra)
    const briefRules = rulesFromBrief(brief)
    if (!rulesEqual(cardRules, briefRules)) {
      warnings.push(
        hasRules(doc.extra)
          ? `rules differ from the saved brief (card: ${rulesSummary(cardRules)}; brief: ${rulesSummary(briefRules)}).`
          : `rules differ from the saved brief (none recorded on this card, defaults assumed; brief: ${rulesSummary(briefRules)}).`,
      )
    }
  }

  // The module deep-copies through JSON, so its card is plain JSON.
  const fixed = result.card as unknown as Json
  return { blocking, warnings, fixes: result.fixes, fixed, lowAgreement }
}

/** The lock gate's view: blocking and warnings only (see checkStyleCardDoc). */
export function styleCardIssues(
  doc: StyleCardDoc,
  brief?: StyleBrief | null,
  clientGarments?: readonly string[] | null,
): StyleCardIssues {
  const { blocking, warnings } = checkStyleCardDoc(doc, brief, clientGarments)
  return { blocking, warnings }
}
