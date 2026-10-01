/**
 * Read-only views over the Style Card v2 keys the readout and step 4 show (spec 4.4 / 7): the
 * validation block the profiler run stored (or the same check run in the browser, nothing written),
 * the agreement per field, the subject sources, brand text, palette variants and the representative
 * images. Pure helpers, no React.
 */
import { AGREEMENT_WARN_BELOW, checkStyleCard } from '@shared/style_card_rules'
import type { StyleBrief } from '../../lib/styleBrief'
import { isRecord, type Json } from '../../lib/types'
import { KNOWN_KEYS, styleCardToJson, type StyleCardDoc } from '../style/styleCardSchema'

export interface Validation {
  errors: string[]
  warnings: string[]
  fixes: string[]
  /** 'stored' = `json.validation` written by the WF-1b run; 'computed' = the shared rules run here, nothing written. */
  source: 'stored' | 'computed'
  checkedAt: string | null
}

function strs(v: Json | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []
}

/** `json.validation` as the profiler run stored it, or null for a draft without one (every draft today). */
export function readStoredValidation(doc: StyleCardDoc): Validation | null {
  const v = doc.extra.validation
  if (!isRecord(v)) return null
  return {
    errors: strs(v.errors),
    warnings: strs(v.warnings),
    fixes: strs(v.fixes),
    source: 'stored',
    checkedAt: typeof v.checked_at === 'string' ? v.checked_at : null,
  }
}

/**
 * The shared rules over the card as saved, with the brief and the client's garments. The fixes are
 * only listed: "Clean up" in the editor applies them. Agreement needs the per-image sheets, which the
 * browser does not have, so `lowAgreementPaths` reads it from `field_evidence` instead.
 */
export function computeValidation(doc: StyleCardDoc, brief: StyleBrief | null, clientGarments: readonly string[] | null): Validation {
  const result = checkStyleCard(styleCardToJson(doc), {
    brief: brief ? { ...brief } : null,
    client_garments: clientGarments ? [...clientGarments] : null,
  })
  return { errors: result.errors, warnings: result.warnings, fixes: result.fixes, source: 'computed', checkedAt: null }
}

/** The stored validation when the run left one, else the browser check. */
export function readValidation(doc: StyleCardDoc, brief: StyleBrief | null, clientGarments: readonly string[] | null): Validation {
  return readStoredValidation(doc) ?? computeValidation(doc, brief, clientGarments)
}

const LEADING_PATH_RE = /^([a-z_]+(?:\[\d+\]|\.[a-z_]+)*)/
const SPECIAL: Array<[RegExp, string]> = [
  [/^brief subject missing/i, 'subjects'],
  [/^low agreement for ([a-z_.[\]0-9]+)/i, '$1'],
  [/^palette has /i, 'palette'],
  [/^palette: /i, 'palette'],
  [/^forbid has /i, 'forbid'],
  [/^evidence has /i, 'evidence'],
  [/^background must /i, 'background'],
  [/^medium is empty/i, 'medium'],
  [/^typography\.vibe is empty/i, 'typography.vibe'],
  [/^rules differ/i, 'rules'],
  [/^garment_colors /i, 'garment_colors'],
  [/^representative_images /i, 'representative_images'],
  [/^brand_text\.items/i, 'brand_text'],
  [/^composition names the subject/i, 'composition'],
]

/**
 * The Style Card path a validation line talks about ("palette[2].hex ... is not #RRGGBB" → palette[2].hex,
 * "brief subject missing: goats" → subjects), or null when the line names no field (the pending-fixes
 * summary, "card must be a JSON object"). Drives the "Fix in editor" deep link of each chip.
 */
export function fieldOfIssue(message: string): string | null {
  const m = message.trim()
  for (const [re, path] of SPECIAL) {
    const hit = re.exec(m)
    if (hit) return path.startsWith('$') ? hit[1] : path
  }
  const lead = LEADING_PATH_RE.exec(m)
  if (!lead) return null
  const root = lead[1].split(/[.[]/)[0]
  return KNOWN_KEYS.has(root) ? lead[1] : null
}

export interface FieldAgreement {
  agreement: number
  images: number[]
  contradicts: number[]
}

function nums(v: Json | undefined): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : []
}

/** `field_evidence[path]` with a numeric agreement, or null. */
export function fieldAgreement(doc: StyleCardDoc, path: string): FieldAgreement | null {
  const fe = doc.extra.field_evidence
  if (!isRecord(fe)) return null
  const e = fe[path]
  if (!isRecord(e) || typeof e.agreement !== 'number') return null
  return { agreement: e.agreement, images: nums(e.images), contradicts: nums(e.contradicts) }
}

/**
 * The weakest field_evidence entry under any of `paths` (the path itself or a child like
 * `typography.headline.family` under `typography`) whose agreement is below the warning threshold,
 * as a tooltip "seen in k of N designs (typography › headline › family)". Null when every entry agrees.
 */
export function lowAgreementNote(doc: StyleCardDoc, paths: readonly string[], analysedCount: number): string | null {
  const fe = doc.extra.field_evidence
  if (!isRecord(fe)) return null
  let worst: { path: string; a: FieldAgreement } | null = null
  for (const key of Object.keys(fe)) {
    if (!paths.some((p) => key === p || key.startsWith(`${p}.`) || key.startsWith(`${p}[`))) continue
    const a = fieldAgreement(doc, key)
    if (!a || a.agreement >= AGREEMENT_WARN_BELOW) continue
    if (!worst || a.agreement < worst.a.agreement) worst = { path: key, a }
  }
  if (!worst) return null
  const k = worst.a.images.length
  const n = worst.a.images.length + worst.a.contradicts.length || analysedCount
  const where = n > 0 ? `seen in ${k} of ${n} designs` : `${Math.round(worst.a.agreement * 100)}% agreement`
  return `${where} (${worst.path.replace(/\[(\d+)\]/g, '.$1').split('.').join(' › ')})`
}

/** 'brief' | 'images' | 'both' for a subject (case-insensitive key match), or null when the card has no subject_sources. */
export function subjectSource(doc: StyleCardDoc, subject: string): string | null {
  const ss = doc.extra.subject_sources
  if (!isRecord(ss)) return null
  const want = subject.trim().toLowerCase()
  for (const [k, v] of Object.entries(ss)) {
    if (k.trim().toLowerCase() === want && typeof v === 'string') return v
  }
  return null
}

export interface BrandTextItem {
  text: string
  role: string
  placement: string
}

/** `brand_text.items` (text, role, placement) and `always_present`; empty for a v1 card. */
export function readBrandText(doc: StyleCardDoc): { present: boolean; items: BrandTextItem[]; alwaysPresent: boolean } {
  const bt = doc.extra.brand_text
  if (!isRecord(bt)) return { present: false, items: [], alwaysPresent: false }
  const items: BrandTextItem[] = []
  if (Array.isArray(bt.items)) {
    for (const it of bt.items) {
      if (!isRecord(it) || typeof it.text !== 'string' || !it.text.trim()) continue
      items.push({
        text: it.text.trim(),
        role: typeof it.role === 'string' ? it.role : '',
        placement: typeof it.placement === 'string' ? it.placement : '',
      })
    }
  }
  return { present: true, items, alwaysPresent: bt.always_present === true }
}

export interface PaletteVariant {
  /** Normalised: anything the profiler wrote that is not dark or light (including '') reads as 'any'. */
  garment: 'dark' | 'light' | 'any'
  hexes: string[]
  images: number[]
}

/** `palette_variants` entries with at least one hex. */
export function readPaletteVariants(doc: StyleCardDoc): PaletteVariant[] {
  const pv = doc.extra.palette_variants
  if (!Array.isArray(pv)) return []
  const out: PaletteVariant[] = []
  for (const v of pv) {
    if (!isRecord(v)) continue
    const hexes = strs(v.hexes).map((h) => h.trim())
    if (!hexes.length) continue
    const g = typeof v.garment === 'string' ? v.garment.trim().toLowerCase() : ''
    out.push({ garment: g === 'dark' || g === 'light' ? g : 'any', hexes, images: nums(v.images) })
  }
  return out
}

/** `representative_images` (1-based IMAGE numbers), de-duplicated, in the profiler's order. */
export function readRepresentativeImages(doc: StyleCardDoc): number[] {
  return [...new Set(nums(doc.extra.representative_images).filter((n) => n >= 1 && Number.isInteger(n)))]
}

/** How many fields the card itself records below the agreement threshold (the step-4 "analyse again" hint). */
export function lowAgreementCount(doc: StyleCardDoc): number {
  const fe = doc.extra.field_evidence
  if (!isRecord(fe)) return 0
  let n = 0
  for (const key of Object.keys(fe)) {
    const a = fieldAgreement(doc, key)
    if (a && a.agreement < AGREEMENT_WARN_BELOW) n += 1
  }
  return n
}
