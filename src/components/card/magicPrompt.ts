/**
 * The magic prompt is stored as structured JSON: one key per layer (print rules,
 * Style Card, lessons, exemplars, reference read, similarity tier, brief, text
 * slot) plus a rendered paragraph. Designers edit sections as text; Regenerate
 * sends the rebuilt JSON and the engine re-renders the paragraph.
 *
 * The prompt-engine is not deployed yet, so section keys are not assumed: whatever
 * keys the JSON has become sections, in the engine's order.
 */
import { isRecord, type Json } from '../../lib/types'
import { humanizeKey, jsonToText, parseEmbeddedJson, recordEntries } from './json'

export type SectionKind = 'text' | 'lines' | 'json' | 'number' | 'boolean' | 'null'

export interface PromptSection {
  key: string
  label: string
  kind: SectionKind
  value: string
  /** Rendered paragraph produced from the other sections; edits here would be overwritten. */
  derived: boolean
}

const DERIVED_KEYS = new Set(['rendered', 'rendered_prompt', 'rendered_paragraph', 'final_prompt', 'paragraph', 'full_prompt'])

export const SECTION_KIND_HINT: Record<SectionKind, string | null> = {
  text: null,
  lines: 'One item per line',
  json: 'JSON',
  number: 'Number',
  boolean: 'true or false',
  null: 'Empty in the stored prompt',
}

/** Sections in stored order. A bare string prompt becomes one editable section. */
export function sectionsFromJson(input: Json | null | undefined): PromptSection[] {
  const json = parseEmbeddedJson(input)
  if (json === null || json === undefined) return []
  if (typeof json === 'string') return [{ key: 'prompt', label: 'Prompt', kind: 'text', value: json, derived: false }]
  if (!isRecord(json)) return [{ key: 'prompt', label: 'Prompt', kind: 'json', value: jsonToText(json), derived: false }]

  const out: PromptSection[] = []
  for (const [key, v] of recordEntries(json)) {
    const derived = DERIVED_KEYS.has(key)
    const label = humanizeKey(key)
    if (v === null) out.push({ key, label, kind: 'null', value: '', derived })
    else if (typeof v === 'string') out.push({ key, label, kind: 'text', value: v, derived })
    else if (typeof v === 'number') out.push({ key, label, kind: 'number', value: String(v), derived })
    else if (typeof v === 'boolean') out.push({ key, label, kind: 'boolean', value: String(v), derived })
    else if (Array.isArray(v) && v.every((x): x is string => typeof x === 'string'))
      out.push({ key, label, kind: 'lines', value: v.join('\n'), derived })
    else out.push({ key, label, kind: 'json', value: jsonToText(v), derived })
  }
  return out
}

function parseJsonSection(s: PromptSection): Json {
  try {
    return JSON.parse(s.value) as Json
  } catch {
    throw new Error(`The "${s.label}" section is not valid JSON. Fix it or reset the prompt.`)
  }
}

/**
 * Rebuilds the JSON from edited sections, keeping the original's shape (object
 * stays an object, string stays a string). Throws a readable error when a JSON or
 * numeric section cannot be parsed.
 */
export function jsonFromSections(sections: PromptSection[], original: Json | null | undefined): Json {
  const orig = parseEmbeddedJson(original)
  if (typeof orig === 'string' || !isRecord(orig)) {
    const s = sections[0]
    if (!s) return orig ?? null
    return s.kind === 'json' ? parseJsonSection(s) : s.value
  }
  const out: Record<string, Json> = {}
  for (const s of sections) {
    switch (s.kind) {
      case 'text':
        out[s.key] = s.value
        break
      case 'lines':
        out[s.key] = s.value
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
        break
      case 'number': {
        const n = Number(s.value)
        if (!Number.isFinite(n) || !s.value.trim()) throw new Error(`The "${s.label}" section must be a number.`)
        out[s.key] = n
        break
      }
      case 'boolean': {
        const t = s.value.trim().toLowerCase()
        if (t !== 'true' && t !== 'false') throw new Error(`The "${s.label}" section must be true or false.`)
        out[s.key] = t === 'true'
        break
      }
      case 'null':
        out[s.key] = s.value.trim() ? s.value : null
        break
      case 'json':
        out[s.key] = parseJsonSection(s)
        break
    }
  }
  return out
}

/** Cheap identity for dirty checks. */
export function sectionSignature(sections: PromptSection[]): string {
  return JSON.stringify(sections.map((s) => [s.key, s.value]))
}

export function replaceSection(sections: PromptSection[], index: number, value: string): PromptSection[] {
  return sections.map((s, i) => (i === index ? { ...s, value } : s))
}
