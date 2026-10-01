/**
 * `clients.style_brief` (jsonb): the written onboarding brief and the lock parameters the
 * style profiler (WF-1b) reads together with the reference library, and that intake applies
 * to every brief for the client (text case). Pure helpers, no React.
 */
import { isRecord, type Client, type Json } from './types'

export type PaletteMode = 'strict' | 'flexible'
export type TextCase = 'as_typed' | 'upper' | 'title'

export interface StyleBrief {
  niche: string
  audience: string
  /** Every theme the client prints (v2): seeds `subjects` and is a hard gate for Analyse. */
  subjects: string[]
  /** Text on most designs (handle, EST. line); the profiler files it under `brand_text`, never as style. */
  brand_text: string[]
  /** Free note on the lettering (v2, optional). */
  typography_note: string
  palette_mode: PaletteMode
  text_case: TextCase
  /** Signature moves the client insists on; folded into `signature_moves`. */
  must_have: string[]
  /** Never-do list; folded into `forbid` and checked by QC. */
  avoid: string[]
  lock_typography: boolean
  lock_composition: boolean
  /**
   * The client's own words the fields were filled from ("Fill from text", studio_25): the pasted
   * email, chat or notes. Optional; written only when non-empty, never shown as a field.
   */
  source_text?: string
}

/** The four rules the profiler copies into `style_cards.json.rules`. */
export interface StyleRules {
  palette_mode: PaletteMode
  text_case: TextCase
  lock_typography: boolean
  lock_composition: boolean
}

export const PALETTE_MODES: ReadonlyArray<{ value: PaletteMode; label: string; meaning: string }> = [
  { value: 'strict', label: 'Strict', meaning: 'Designs use only the palette colours' },
  { value: 'flexible', label: 'Flexible', meaning: 'The palette leads; small natural accents are allowed' },
]

export const TEXT_CASES: ReadonlyArray<{ value: TextCase; label: string; meaning: string }> = [
  { value: 'as_typed', label: 'As typed', meaning: 'Briefs are printed as the client wrote them' },
  { value: 'upper', label: 'UPPER', meaning: 'Applied at intake to every brief for this client' },
  { value: 'title', label: 'Title', meaning: 'Applied at intake to every brief for this client' },
]

export const TEXT_CASE_LABEL: Record<TextCase, string> = { as_typed: 'as typed', upper: 'UPPER', title: 'Title' }

function isPaletteMode(v: unknown): v is PaletteMode {
  return v === 'strict' || v === 'flexible'
}

function isTextCase(v: unknown): v is TextCase {
  return v === 'as_typed' || v === 'upper' || v === 'title'
}

function str(v: Json | undefined): string {
  return typeof v === 'string' ? v : ''
}

function strList(v: Json | undefined): string[] {
  if (Array.isArray(v)) return v.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
  if (typeof v === 'string') {
    return v
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

function bool(v: Json | undefined, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === 'locked') return true
  if (v === 'false' || v === 'guide') return false
  return fallback
}

/** WF-1b's defaults when a key is missing: strict palette, text as typed, both locks on. */
export function emptyStyleBrief(): StyleBrief {
  return {
    niche: '',
    audience: '',
    subjects: [],
    brand_text: [],
    typography_note: '',
    palette_mode: 'strict',
    text_case: 'as_typed',
    must_have: [],
    avoid: [],
    lock_typography: true,
    lock_composition: true,
  }
}

/** Never throws; unknown or malformed keys fall back to the defaults. */
export function parseStyleBrief(json: Json | null | undefined): StyleBrief {
  const b = emptyStyleBrief()
  if (!isRecord(json)) return b
  b.niche = str(json.niche)
  b.audience = str(json.audience)
  b.subjects = strList(json.subjects)
  b.brand_text = strList(json.brand_text)
  b.typography_note = str(json.typography_note)
  if (isPaletteMode(json.palette_mode)) b.palette_mode = json.palette_mode
  if (isTextCase(json.text_case)) b.text_case = json.text_case
  b.must_have = strList(json.must_have)
  b.avoid = strList(json.avoid)
  b.lock_typography = bool(json.lock_typography, true)
  b.lock_composition = bool(json.lock_composition, true)
  const source = str(json.source_text).trim()
  if (source) b.source_text = source
  return b
}

const clean = (s: string) => s.trim()
const cleanList = (xs: string[]) => xs.map(clean).filter(Boolean)

/** The exact object written to `clients.style_brief`. */
export function styleBriefToJson(b: StyleBrief): Record<string, Json> {
  return {
    niche: clean(b.niche),
    audience: clean(b.audience),
    subjects: cleanList(b.subjects),
    brand_text: cleanList(b.brand_text),
    typography_note: clean(b.typography_note),
    palette_mode: b.palette_mode,
    text_case: b.text_case,
    must_have: cleanList(b.must_have),
    avoid: cleanList(b.avoid),
    lock_typography: b.lock_typography,
    lock_composition: b.lock_composition,
    ...(b.source_text && b.source_text.trim() ? { source_text: b.source_text.trim() } : {}),
  }
}

/** True when the brief was never written (`{}` or not an object). */
export function isBriefEmpty(json: Json | null | undefined): boolean {
  return !isRecord(json) || Object.keys(json).length === 0
}

/** The three things the profiler cannot work without, in the order the step asks for them. */
export const BRIEF_GAP_LABELS = ['niche', 'at least one subject', 'a garment colour'] as const
export type BriefGap = (typeof BRIEF_GAP_LABELS)[number]

/**
 * What is still missing before Analyse may run: the niche, at least one subject and one garment
 * colour (the server trigger `style_draft_requests_require_brief` checks the same three). The
 * audience is recommended, not required. Empty list = complete.
 */
export function briefGaps(b: StyleBrief, client: Pick<Client, 'garment_colors'> | null | undefined): BriefGap[] {
  const gaps: BriefGap[] = []
  if (!b.niche.trim()) gaps.push('niche')
  if (cleanList(b.subjects).length === 0) gaps.push('at least one subject')
  if (cleanList(client?.garment_colors ?? []).length === 0) gaps.push('a garment colour')
  return gaps
}

export function isBriefComplete(b: StyleBrief, client: Pick<Client, 'garment_colors'> | null | undefined): boolean {
  return briefGaps(b, client).length === 0
}

/** "Missing: niche, at least one subject" for the step header and the disabled Analyse button. */
export function briefGapsSummary(gaps: readonly string[]): string {
  return gaps.length ? `Missing: ${gaps.join(', ')}` : ''
}

/** The server trigger's message when a draft is requested without the brief (studio_21). */
const SERVER_BRIEF_GATE_RE = /write the onboarding brief first/i

/** True when an error is the server-side brief gate (so the UI can say the same thing it says before the click). */
export function isBriefGateError(message: string): boolean {
  return SERVER_BRIEF_GATE_RE.test(message)
}

export function rulesFromBrief(b: StyleBrief): StyleRules {
  return {
    palette_mode: b.palette_mode,
    text_case: b.text_case,
    lock_typography: b.lock_typography,
    lock_composition: b.lock_composition,
  }
}

/**
 * The rules a draft was analysed with, from `style_cards.json.rules` (kept under `doc.extra` by
 * normalizeStyleCard). Tolerant: a v1-style card without `rules` reads as the defaults.
 */
export function readRules(extra: Record<string, Json | undefined>): StyleRules {
  const r = extra.rules
  const rec = isRecord(r) ? r : {}
  return {
    palette_mode: isPaletteMode(rec.palette_mode) ? rec.palette_mode : 'strict',
    text_case: isTextCase(rec.text_case) ? rec.text_case : 'as_typed',
    lock_typography: bool(rec.lock_typography, true),
    lock_composition: bool(rec.lock_composition, true),
  }
}

/** True when a card carries an explicit `rules` object (profiler v2 drafts). */
export function hasRules(extra: Record<string, Json | undefined>): boolean {
  return isRecord(extra.rules)
}

export function rulesEqual(a: StyleRules, b: StyleRules): boolean {
  return (
    a.palette_mode === b.palette_mode &&
    a.text_case === b.text_case &&
    a.lock_typography === b.lock_typography &&
    a.lock_composition === b.lock_composition
  )
}

/** "palette strict · text UPPER · typography locked · composition guide" */
export function rulesSummary(r: StyleRules): string {
  return [
    `palette ${r.palette_mode}`,
    `text ${TEXT_CASE_LABEL[r.text_case]}`,
    `typography ${r.lock_typography ? 'locked' : 'guide'}`,
    `composition ${r.lock_composition ? 'locked' : 'guide'}`,
  ].join(' · ')
}

/** The four rule pills, in display order. */
export function rulePills(r: StyleRules): string[] {
  return rulesSummary(r).split(' · ')
}

/** "Strict · UPPER · 2 must · 2 never · tier 3", or "Not written yet" for an empty brief. */
export function briefSummary(b: StyleBrief, tier: number, empty = false): string {
  if (empty) return 'Not written yet'
  const mode = PALETTE_MODES.find((m) => m.value === b.palette_mode)?.label ?? b.palette_mode
  return `${mode} · ${TEXT_CASE_LABEL[b.text_case]} · ${b.must_have.length} must · ${b.avoid.length} never · tier ${tier}`
}

/* ---------- "Fill from text" (brief_parse_requests.result → the form) ---------- */

/** The brief step's form: the brief plus the three client fields saved with it. */
export interface BriefForm {
  brief: StyleBrief
  tier: number
  garment_colors: string[]
  notes: string
}

/**
 * What WF-8 returns for a pasted brief (`brief_parse_requests.result`): every key present; "" / []
 * / null mean "the text did not say". `notes_for_designer` lists what the text implied but the
 * parser was unsure about (shown under the panel, never written anywhere).
 */
export interface ParsedBrief {
  niche: string
  audience: string
  subjects: string[]
  brand_text: string[]
  typography_note: string
  palette_mode: PaletteMode | null
  text_case: TextCase | null
  must_have: string[]
  avoid: string[]
  lock_typography: boolean | null
  lock_composition: boolean | null
  default_similarity_tier: number | null
  garment_colors: string[]
  notes: string
  notes_for_designer: string[]
}

/** The worker caps the same way (WF-8 Parse); applied again here so a hand-edited row cannot flood the form. */
const PARSED_MAX_ITEMS = 20
const PARSED_MAX_CHARS = 400

function parsedStr(v: Json | undefined): string {
  return str(v).trim().slice(0, PARSED_MAX_CHARS)
}

function parsedList(v: Json | undefined): string[] {
  return strList(v)
    .map((s) => s.slice(0, PARSED_MAX_CHARS))
    .slice(0, PARSED_MAX_ITEMS)
}

function boolOrNull(v: Json | undefined): boolean | null {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

function tierOrNull(v: Json | undefined): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}

/**
 * Reads a parse result tolerantly: unknown enum values become null, strings and lists are capped,
 * empty strings are dropped from lists. Null when the result is not an object at all.
 */
export function readParsedBrief(json: Json | null | undefined): ParsedBrief | null {
  if (!isRecord(json)) return null
  return {
    niche: parsedStr(json.niche),
    audience: parsedStr(json.audience),
    subjects: parsedList(json.subjects),
    brand_text: parsedList(json.brand_text),
    typography_note: parsedStr(json.typography_note),
    palette_mode: isPaletteMode(json.palette_mode) ? json.palette_mode : null,
    text_case: isTextCase(json.text_case) ? json.text_case : null,
    must_have: parsedList(json.must_have),
    avoid: parsedList(json.avoid),
    lock_typography: boolOrNull(json.lock_typography),
    lock_composition: boolOrNull(json.lock_composition),
    default_similarity_tier: tierOrNull(json.default_similarity_tier),
    garment_colors: parsedList(json.garment_colors),
    notes: parsedStr(json.notes),
    notes_for_designer: parsedList(json.notes_for_designer),
  }
}

/** The form controls a fill may change, in the order the step shows them. */
export const BRIEF_FILL_KEYS = [
  'niche',
  'audience',
  'subjects',
  'brand_text',
  'typography_note',
  'palette_mode',
  'text_case',
  'must_have',
  'avoid',
  'lock_typography',
  'lock_composition',
  'tier',
  'garment_colors',
  'notes',
] as const
export type BriefFillKey = (typeof BRIEF_FILL_KEYS)[number]

/** How the step names each control in a sentence ("kept your later edits to subjects, never do"). */
export const BRIEF_FILL_LABEL: Record<BriefFillKey, string> = {
  niche: 'niche',
  audience: 'audience',
  subjects: 'subjects',
  brand_text: 'brand text',
  typography_note: 'typography note',
  palette_mode: 'palette rule',
  text_case: 'text case',
  must_have: 'must-haves',
  avoid: 'never do',
  lock_typography: 'typography lock',
  lock_composition: 'composition lock',
  tier: 'similarity tier',
  garment_colors: 'garment colours',
  notes: 'notes',
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  const x = cleanList([...a])
  const y = cleanList([...b])
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/** The key two list entries are compared by: case, outer spaces and repeated spaces do not count (as in TagInput). */
const entryKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * A fill never removes a list entry: the form's entries stay as they are, in their order, and the parsed
 * entries that are not there yet (compared without case) are added after them. Same list back = nothing new.
 */
function mergeList(existing: readonly string[], parsed: readonly string[]): string[] {
  const seen = new Set(cleanList([...existing]).map(entryKey))
  const added: string[] = []
  for (const p of cleanList([...parsed])) {
    const k = entryKey(p)
    if (seen.has(k)) continue
    seen.add(k)
    added.push(p)
  }
  return added.length ? [...existing, ...added] : [...existing]
}

/**
 * Applies a parse result to the form. Niche, audience, typography note, the palette rule, text case, locks
 * and tier: a value the text supported (a non-empty string, a non-null choice) overwrites the form value.
 * Lists (subjects, brand text, must-haves, never do, garment colours): the parsed entries the form does not
 * hold yet are ADDED; nothing already in the form is removed or reworded. Notes: the parsed sentence is
 * appended unless the notes already contain it. (A fill can never silently drop a designer's entry; the
 * designer removes what the client no longer wants.) "" / [] / null mean "the text did not say" and leave
 * the field as the designer has it. `sourceText` (the pasted text) is kept as `brief.source_text`
 * so Save stores it. Nothing is saved here; `changedKeys` names the controls whose value actually changed
 * (the ones to mark and to undo). The input form is not mutated.
 */
export function applyParsedBrief(
  form: BriefForm,
  result: ParsedBrief,
  sourceText?: string,
): { next: BriefForm; changedKeys: BriefFillKey[] } {
  const brief: StyleBrief = { ...form.brief }
  const next: BriefForm = { ...form, brief }
  const changedKeys: BriefFillKey[] = []

  const setText = (key: 'niche' | 'audience' | 'typography_note') => {
    const v = result[key]
    if (v && v !== brief[key].trim()) {
      brief[key] = v
      changedKeys.push(key)
    }
  }
  const setList = (key: 'subjects' | 'brand_text' | 'must_have' | 'avoid') => {
    const merged = mergeList(brief[key], result[key])
    if (merged.length !== brief[key].length) {
      brief[key] = merged
      changedKeys.push(key)
    }
  }
  const setLock = (key: 'lock_typography' | 'lock_composition') => {
    const v = result[key]
    if (v !== null && v !== brief[key]) {
      brief[key] = v
      changedKeys.push(key)
    }
  }

  setText('niche')
  setText('audience')
  setList('subjects')
  setList('brand_text')
  setText('typography_note')
  if (result.palette_mode !== null && result.palette_mode !== brief.palette_mode) {
    brief.palette_mode = result.palette_mode
    changedKeys.push('palette_mode')
  }
  if (result.text_case !== null && result.text_case !== brief.text_case) {
    brief.text_case = result.text_case
    changedKeys.push('text_case')
  }
  setList('must_have')
  setList('avoid')
  setLock('lock_typography')
  setLock('lock_composition')
  if (result.default_similarity_tier !== null && result.default_similarity_tier !== form.tier) {
    next.tier = result.default_similarity_tier
    changedKeys.push('tier')
  }
  const garments = mergeList(form.garment_colors, result.garment_colors)
  if (garments.length !== form.garment_colors.length) {
    next.garment_colors = garments
    changedKeys.push('garment_colors')
  }
  // Notes gain the parsed sentence (on a new line) unless the notes already say it; never replaced.
  const notes = form.notes.trim()
  if (result.notes && !entryKey(notes).includes(entryKey(result.notes))) {
    next.notes = notes ? `${notes}\n${result.notes}` : result.notes
    changedKeys.push('notes')
  }
  const source = sourceText?.trim()
  if (source) brief.source_text = source
  return { next, changedKeys }
}

/** One control's value, for comparing "still what the fill wrote?". */
function fillValue(f: BriefForm, key: BriefFillKey): string | number | boolean | readonly string[] {
  if (key === 'tier') return f.tier
  if (key === 'garment_colors') return f.garment_colors
  if (key === 'notes') return f.notes
  return f.brief[key]
}

function sameFillValue(a: string | number | boolean | readonly string[], b: string | number | boolean | readonly string[]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return sameList(a, b)
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim()
  return a === b
}

/** `target` with the values of `keys` copied from `source` (new objects; `source_text` is not touched). */
export function copyBriefFormKeys(target: BriefForm, source: BriefForm, keys: readonly BriefFillKey[]): BriefForm {
  const brief: StyleBrief = { ...target.brief }
  const next: BriefForm = { ...target, brief }
  const copyBrief = <K extends keyof StyleBrief>(key: K) => {
    brief[key] = source.brief[key]
  }
  for (const key of keys) {
    if (key === 'tier') next.tier = source.tier
    else if (key === 'garment_colors') next.garment_colors = source.garment_colors
    else if (key === 'notes') next.notes = source.notes
    else copyBrief(key)
  }
  return next
}

function withSourceText(f: BriefForm, source: string | undefined): BriefForm {
  const brief: StyleBrief = { ...f.brief }
  if (source) brief.source_text = source
  else delete brief.source_text
  return { ...f, brief }
}

/**
 * What "Undo fill" puts back: every fill since the last save (or undo), merged into one record.
 * `previous` holds, per key, the value from before the FIRST fill that changed it; `filled` holds the
 * value the LAST fill that changed it wrote. Only `keys` and `brief.source_text` of the two forms are read.
 */
export interface BriefFillRecord {
  previous: BriefForm
  filled: BriefForm
  /** Every control any of the merged fills changed, in BRIEF_FILL_KEYS order. */
  keys: BriefFillKey[]
  /** How many fills the record merges (1 for a single fill). */
  fills: number
}

/**
 * Adds one applied fill (`before` → `after`, `changedKeys`) to the open record, or starts one. A key a
 * later fill did not touch keeps the value the earlier fill wrote, so a designer edit made between two
 * fills is still recognised as an edit by `undoBriefFill`.
 */
export function recordBriefFill(
  open: BriefFillRecord | null,
  before: BriefForm,
  after: BriefForm,
  changedKeys: readonly BriefFillKey[],
): BriefFillRecord {
  if (!open) return { previous: before, filled: after, keys: [...changedKeys], fills: 1 }
  const union = new Set<BriefFillKey>([...open.keys, ...changedKeys])
  return {
    previous: withSourceText(copyBriefFormKeys(before, open.previous, open.keys), open.previous.brief.source_text),
    filled: withSourceText(copyBriefFormKeys(open.filled, after, changedKeys), after.brief.source_text),
    keys: BRIEF_FILL_KEYS.filter((k) => union.has(k)),
    fills: open.fills + 1,
  }
}

/**
 * "Undo fill": puts back the value from before the fill for every key whose value is STILL what the fill
 * wrote, and `brief.source_text` likewise. A control the designer changed after the fill keeps the
 * designer's value and is listed in `kept`; every other field stays as it is now.
 */
export function undoBriefFill(form: BriefForm, record: BriefFillRecord): { next: BriefForm; kept: BriefFillKey[] } {
  const restore: BriefFillKey[] = []
  const kept: BriefFillKey[] = []
  for (const key of record.keys) {
    if (sameFillValue(fillValue(form, key), fillValue(record.filled, key))) restore.push(key)
    else kept.push(key)
  }
  let next = copyBriefFormKeys(form, record.previous, restore)
  if ((form.brief.source_text ?? '') === (record.filled.brief.source_text ?? '')) {
    next = withSourceText(next, record.previous.brief.source_text)
  }
  return { next, kept }
}
