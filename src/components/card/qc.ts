/**
 * Normalises `generations.qc_report` into pass/fail lines the designer can scan.
 *
 * The qc-judge Edge Function is not deployed yet, so the exact shape is open. This
 * parser accepts the shapes it is likely to produce and degrades gracefully:
 *  - an array of checks: `[{ name|check|label, pass|ok|verdict|status, note|reason }, …]`
 *    or plain strings ("pass — text present once")
 *  - an object with a `checks|points|results` list plus `overall|pass`, `needs_regen`,
 *    `instruction`, `violations`, `summary`
 *  - an object keyed by check name whose values are booleans, verdict words or
 *    `{ pass, note }` objects
 *  - a bare "pass" / "fail" string or boolean
 * Anything it does not understand is kept in `extras` and rendered as key/value,
 * so nothing the judge wrote is hidden.
 */
import { isRecord, type Json } from '../../lib/types'
import { humanizeKey, jsonToText, parseEmbeddedJson, pickNumber, pickString, recordEntries, stringList, type JsonRecord } from './json'

export type QcVerdict = 'pass' | 'fail' | 'warn' | 'unknown'

export interface QcCheck {
  key: string
  label: string
  verdict: QcVerdict
  note: string | null
  /** Point number when the report carries one (1–12 in the SOP). */
  index: number | null
  score: number | null
}

export interface QcReport {
  checks: QcCheck[]
  overall: QcVerdict
  needsRegen: boolean | null
  /** Corrective instruction the judge proposed for an automatic regenerate. */
  instruction: string | null
  /** Style Card rules the judge says were broken (never blocks, always shown). */
  violations: string[]
  summary: string | null
  /** Keys the parser did not recognise, rendered as key/value. */
  extras: Array<[string, Json]>
  /** True when the column was null or empty. */
  empty: boolean
}

const CHECK_LIST_KEYS = ['checks', 'points', 'items', 'results', 'report', 'criteria', 'tests'] as const
const OVERALL_KEYS = ['overall', 'verdict', 'pass', 'passed', 'ok', 'result', 'status', 'outcome', 'qc_pass'] as const
const REGEN_KEYS = ['needs_regen', 'needsRegen', 'needs_regeneration', 'regen', 'regenerate', 'auto_regen'] as const
const INSTRUCTION_KEYS = [
  'instruction',
  'corrective_instruction',
  'correction',
  'corrective',
  'fix',
  'suggested_fix',
  'next_step',
  'regen_instruction',
] as const
const VIOLATION_KEYS = [
  'violations',
  'style_card_violations',
  'style_violations',
  'rules_violated',
  'violated_rules',
  'style_card_rules_violated',
] as const
const SUMMARY_KEYS = ['summary', 'notes', 'note', 'comment', 'comments', 'explanation', 'overall_note'] as const

const LABEL_KEYS = ['name', 'check', 'label', 'title', 'criterion', 'rule', 'description', 'question'] as const
const VERDICT_KEYS = ['pass', 'passed', 'ok', 'result', 'verdict', 'status', 'outcome', 'passes', 'value'] as const
const NOTE_KEYS = [
  'note',
  'notes',
  'message',
  'reason',
  'detail',
  'details',
  'comment',
  'explanation',
  'why',
  'observation',
  'evidence',
] as const
const INDEX_KEYS = ['id', 'n', 'number', 'index', 'point_number', 'point', '#'] as const
const SCORE_KEYS = ['score', 'confidence'] as const

const PASS_WORDS = new Set(['pass', 'passed', 'ok', 'true', 'yes', 'good', 'success', 'succeeded', 'clean', 'fine', 'accept'])
const FAIL_WORDS = new Set(['fail', 'failed', 'false', 'no', 'bad', 'error', 'failure', 'reject', 'rejected', 'violated'])
const WARN_WORDS = new Set(['warn', 'warning', 'caution', 'flag', 'flagged', 'borderline', 'partial', 'minor', 'review'])

export const VERDICT_LABEL: Record<QcVerdict, string> = {
  pass: 'Pass',
  fail: 'Fail',
  warn: 'Warning',
  unknown: 'No verdict',
}

export function verdictOf(v: Json | undefined): QcVerdict | null {
  if (typeof v === 'boolean') return v ? 'pass' : 'fail'
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (PASS_WORDS.has(s)) return 'pass'
    if (FAIL_WORDS.has(s)) return 'fail'
    if (WARN_WORDS.has(s)) return 'warn'
  }
  return null
}

function booleanOf(v: Json | undefined): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true', 'yes', '1'].includes(s)) return true
    if (['false', 'no', '0'].includes(s)) return false
  }
  return null
}

/** Turns one entry into a check line, or null when it does not look like a check at all. */
function checkFromValue(key: string, v: Json | undefined): QcCheck | null {
  const numericKey = /^\d+$/.test(key)
  const defaultLabel = numericKey ? `Check ${key}` : humanizeKey(key)
  const base = { key, index: numericKey ? Number(key) : null, score: null }

  if (typeof v === 'boolean') return { ...base, label: defaultLabel, verdict: v ? 'pass' : 'fail', note: null }

  if (typeof v === 'string') {
    const direct = verdictOf(v)
    if (direct) return { ...base, label: defaultLabel, verdict: direct, note: null }
    // "pass — text present once" / "FAIL: an extra word"
    const m = /^(pass|passed|ok|fail|failed|warn|warning)\b[\s:—–-]*(.*)$/i.exec(v.trim())
    if (m) return { ...base, label: defaultLabel, verdict: verdictOf(m[1]) ?? 'unknown', note: m[2] || null }
    return null
  }

  if (isRecord(v)) {
    let verdict: QcVerdict | null = null
    for (const k of VERDICT_KEYS) {
      const found = verdictOf(v[k])
      if (found) {
        verdict = found
        break
      }
    }
    const label = pickString(v, LABEL_KEYS)
    const note = pickString(v, NOTE_KEYS)
    const score = pickNumber(v, SCORE_KEYS)
    const index = pickNumber(v, INDEX_KEYS) ?? base.index
    if (verdict === null && note === null && score === null && label === null) return null
    return { key, label: label ?? defaultLabel, verdict: verdict ?? 'unknown', note, index, score }
  }

  return null
}

function checksFromArray(arr: Json[]): QcCheck[] {
  const out: QcCheck[] = []
  arr.forEach((item, i) => {
    const key = String(i + 1)
    if (item === null || item === undefined) return
    const parsed = checkFromValue(key, item)
    if (parsed) {
      out.push(parsed)
    } else if (typeof item === 'string') {
      out.push({ key, label: item, verdict: 'unknown', note: null, index: i + 1, score: null })
    } else {
      out.push({ key, label: `Check ${i + 1}`, verdict: 'unknown', note: jsonToText(item), index: i + 1, score: null })
    }
  })
  return out
}

/** Inside a `checks` object every entry is a check, even when we cannot read a verdict. */
function checksFromObject(rec: JsonRecord): QcCheck[] {
  return recordEntries(rec).map(
    ([k, v]) =>
      checkFromValue(k, v) ?? {
        key: k,
        label: humanizeKey(k),
        verdict: 'unknown' as const,
        note: jsonToText(v) || null,
        index: null,
        score: null,
      },
  )
}

function deriveOverall(checks: QcCheck[], explicit: QcVerdict | null, needsRegen: boolean | null): QcVerdict {
  if (explicit) return explicit
  if (checks.some((c) => c.verdict === 'fail')) return 'fail'
  if (checks.some((c) => c.verdict === 'warn')) return 'warn'
  if (checks.length && checks.every((c) => c.verdict === 'pass')) return 'pass'
  if (needsRegen === true) return 'fail'
  return 'unknown'
}

function sortByIndex(checks: QcCheck[]): QcCheck[] {
  if (!checks.length || !checks.every((c) => c.index !== null)) return checks
  return [...checks].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
}

const EMPTY: QcReport = {
  checks: [],
  overall: 'unknown',
  needsRegen: null,
  instruction: null,
  violations: [],
  summary: null,
  extras: [],
  empty: true,
}

export function parseQcReport(input: Json | null | undefined): QcReport {
  const json = parseEmbeddedJson(input)
  if (json === null || json === undefined || json === '') return EMPTY

  if (typeof json === 'string') {
    const vd = verdictOf(json)
    return { ...EMPTY, empty: false, overall: vd ?? 'unknown', summary: vd ? null : json }
  }
  if (typeof json === 'boolean') return { ...EMPTY, empty: false, overall: json ? 'pass' : 'fail' }
  if (typeof json === 'number') return { ...EMPTY, empty: false, extras: [['report', json]] }

  if (Array.isArray(json)) {
    const checks = sortByIndex(checksFromArray(json))
    return { ...EMPTY, empty: false, checks, overall: deriveOverall(checks, null, null) }
  }

  const rec = json
  const used = new Set<string>()
  const checks: QcCheck[] = []
  let explicit: QcVerdict | null = null
  let needsRegen: boolean | null = null
  let instruction: string | null = null
  let violations: string[] = []
  let summary: string | null = null
  const extras: Array<[string, Json]> = []

  for (const k of CHECK_LIST_KEYS) {
    const v = rec[k]
    if (Array.isArray(v)) {
      checks.push(...checksFromArray(v))
      used.add(k)
    } else if (isRecord(v)) {
      checks.push(...checksFromObject(v))
      used.add(k)
    }
  }
  for (const k of OVERALL_KEYS) {
    if (used.has(k)) continue
    const vd = verdictOf(rec[k])
    if (vd) {
      explicit = vd
      used.add(k)
      break
    }
  }
  for (const k of REGEN_KEYS) {
    const b = booleanOf(rec[k])
    if (b !== null) {
      needsRegen = b
      used.add(k)
      break
    }
  }
  for (const k of INSTRUCTION_KEYS) {
    const v = rec[k]
    if (typeof v === 'string' && v.trim()) {
      instruction = v.trim()
      used.add(k)
      break
    }
    if (isRecord(v)) {
      const s = pickString(v, ['text', 'instruction', 'message'])
      if (s) {
        instruction = s
        used.add(k)
        break
      }
    }
  }
  for (const k of VIOLATION_KEYS) {
    if (rec[k] === undefined) continue
    violations = stringList(rec[k])
    used.add(k)
    break
  }
  for (const k of SUMMARY_KEYS) {
    const v = rec[k]
    if (typeof v === 'string' && v.trim()) {
      summary = v.trim()
      used.add(k)
      break
    }
  }

  for (const [k, v] of recordEntries(rec)) {
    if (used.has(k)) continue
    const check = checkFromValue(k, v)
    if (check) checks.push(check)
    else extras.push([k, v])
  }

  const sorted = sortByIndex(checks)
  return {
    checks: sorted,
    overall: deriveOverall(sorted, explicit, needsRegen),
    needsRegen,
    instruction,
    violations,
    summary,
    extras,
    empty: false,
  }
}

/** Short verdict for strip tiles: null when the generation has no report yet. */
export function qcVerdict(input: Json | null | undefined): QcVerdict | null {
  const r = parseQcReport(input)
  return r.empty ? null : r.overall
}

/** The text the judge read on the image (`text_found`, one string), or null when absent. */
export function qcTextFound(input: Json | null | undefined): string | null {
  const r = parseEmbeddedJson(input)
  if (!isRecord(r) || typeof r.text_found !== 'string') return null
  const t = r.text_found.trim()
  return t || null
}

/** The judge's own text verdict (`text_ok`), or null when the report does not carry one. */
export function qcTextOk(input: Json | null | undefined): boolean | null {
  const r = parseEmbeddedJson(input)
  return isRecord(r) && typeof r.text_ok === 'boolean' ? r.text_ok : null
}

/** The lines the judge was told to expect (`expected_text`, an array). */
export function qcExpectedText(input: Json | null | undefined): string[] {
  const r = parseEmbeddedJson(input)
  return isRecord(r) ? stringList(r.expected_text) : []
}
