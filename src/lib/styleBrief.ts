/**
 * `clients.style_brief` (jsonb): the written onboarding brief and the lock parameters the
 * style profiler (WF-1b) reads together with the reference library, and that intake applies
 * to every brief for the client (text case). Pure helpers, no React.
 */
import { isRecord, type Json } from './types'

export type PaletteMode = 'strict' | 'flexible'
export type TextCase = 'as_typed' | 'upper' | 'title'

export interface StyleBrief {
  niche: string
  audience: string
  palette_mode: PaletteMode
  text_case: TextCase
  /** Signature moves the client insists on; folded into `signature_moves`. */
  must_have: string[]
  /** Never-do list; folded into `forbid` and checked by QC. */
  avoid: string[]
  lock_typography: boolean
  lock_composition: boolean
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
  if (isPaletteMode(json.palette_mode)) b.palette_mode = json.palette_mode
  if (isTextCase(json.text_case)) b.text_case = json.text_case
  b.must_have = strList(json.must_have)
  b.avoid = strList(json.avoid)
  b.lock_typography = bool(json.lock_typography, true)
  b.lock_composition = bool(json.lock_composition, true)
  return b
}

const clean = (s: string) => s.trim()
const cleanList = (xs: string[]) => xs.map(clean).filter(Boolean)

/** The exact object written to `clients.style_brief`. */
export function styleBriefToJson(b: StyleBrief): Record<string, Json> {
  return {
    niche: clean(b.niche),
    audience: clean(b.audience),
    palette_mode: b.palette_mode,
    text_case: b.text_case,
    must_have: cleanList(b.must_have),
    avoid: cleanList(b.avoid),
    lock_typography: b.lock_typography,
    lock_composition: b.lock_composition,
  }
}

/** True when the brief was never written (`{}` or not an object). */
export function isBriefEmpty(json: Json | null | undefined): boolean {
  return !isRecord(json) || Object.keys(json).length === 0
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
