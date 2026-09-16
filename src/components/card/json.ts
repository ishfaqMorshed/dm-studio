/**
 * Small helpers for the JSON boundaries on the card page (reference_analysis,
 * qc_report, magic_prompt_json, style card json). Every function tolerates any
 * shape and never throws.
 */
import { isRecord, type Json } from '../../lib/types'

export type JsonRecord = Record<string, Json | undefined>

/** "style_card_version" → "Style card version", "needsRegen" → "Needs regen". */
export function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  if (!spaced) return key
  return spaced[0].toUpperCase() + spaced.slice(1)
}

export function isPrimitive(v: Json | undefined): v is string | number | boolean | null | undefined {
  return v === undefined || v === null || typeof v !== 'object'
}

/** Text form of any JSON value: strings as-is, primitives via String(), everything else pretty JSON. */
export function jsonToText(v: Json | undefined): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

/** First non-empty string found under any of `keys`. */
export function pickString(rec: JsonRecord, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** First finite number found under any of `keys` (numeric strings count). */
export function pickNumber(rec: JsonRecord, keys: readonly string[]): number | null {
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v)
  }
  return null
}

/** Coerces a value that should be a list of short strings (violations, mood, forbid…). */
export function stringList(v: Json | undefined): string[] {
  if (v === undefined || v === null) return []
  if (typeof v === 'string') return v.trim() ? [v.trim()] : []
  if (typeof v === 'number' || typeof v === 'boolean') return [String(v)]
  if (Array.isArray(v)) {
    const out: string[] = []
    for (const item of v) {
      if (typeof item === 'string') {
        if (item.trim()) out.push(item.trim())
      } else if (typeof item === 'number' || typeof item === 'boolean') {
        out.push(String(item))
      } else if (isRecord(item)) {
        out.push(pickString(item, ['text', 'rule', 'message', 'note', 'name', 'label', 'value']) ?? jsonToText(item))
      } else if (item !== null) {
        out.push(jsonToText(item))
      }
    }
    return out
  }
  if (isRecord(v)) {
    return Object.entries(v)
      .filter((entry): entry is [string, Json] => entry[1] !== undefined)
      .map(([k, val]) => `${humanizeKey(k)}: ${jsonToText(val)}`)
  }
  return []
}

/** Workers sometimes double-encode: a jsonb column holding a JSON string. Unwrap one level. */
export function parseEmbeddedJson(v: Json | null | undefined): Json | null | undefined {
  if (typeof v !== 'string') return v
  const s = v.trim()
  if (!(s.startsWith('{') || s.startsWith('['))) return v
  try {
    return JSON.parse(s) as Json
  } catch {
    return v
  }
}

/** Entries of a record without the `undefined` holes the generated Json type allows. */
export function recordEntries(rec: JsonRecord): Array<[string, Json]> {
  return Object.entries(rec).filter((entry): entry is [string, Json] => entry[1] !== undefined)
}
