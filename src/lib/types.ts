import type { Database, Json, Tables, TablesInsert, TablesUpdate } from './database.types'

/* ---------- Row aliases ---------- */

export type Card = Tables<'cards'>
export type CardInsert = TablesInsert<'cards'>
export type CardUpdate = TablesUpdate<'cards'>
export type Client = Tables<'clients'>
export type ClientInsert = TablesInsert<'clients'>
export type ClientUpdate = TablesUpdate<'clients'>
export type Generation = Tables<'generations'>
export type FinJob = Tables<'fin_jobs'>
export type FinJobEvent = Tables<'fin_job_events'>
export type StyleCard = Tables<'style_cards'>
export type StyleCardUpdate = TablesUpdate<'style_cards'>
export type Profile = Tables<'profiles'>
export type Settings = Tables<'settings'>
export type SettingsUpdate = TablesUpdate<'settings'>
export type PromptTemplate = Tables<'prompt_templates'>
export type PromptTemplateInsert = TablesInsert<'prompt_templates'>
export type DesignLesson = Tables<'design_lessons'>

/* ---------- Enums ---------- */

export type CardStage = Database['public']['Enums']['card_stage']
export type GenerationKind = Database['public']['Enums']['generation_kind']
export type JobStatus = Database['public']['Enums']['job_status']
export type RejectionReason = Database['public']['Enums']['rejection_reason']
export type StaffRole = Database['public']['Enums']['staff_role']
export type StyleCardStatus = Database['public']['Enums']['style_card_status']

export type { Json }

/** A job/generation that still occupies a worker slot. */
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ['queued', 'dispatched', 'working']

export const GENERATION_KIND_LABEL: Record<GenerationKind, string> = {
  generate: 'Generate',
  edit_text: 'Edit text',
  edit_region: 'Edit region',
  regenerate: 'Regenerate',
}

export const REJECTION_REASONS: readonly RejectionReason[] = [
  'text_wrong',
  'spelling',
  'colour',
  'style_drift',
  'subject',
  'background_artifact',
  'placement',
  'other',
]

export const REJECTION_REASON_LABEL: Record<RejectionReason, string> = {
  text_wrong: 'Wrong text',
  spelling: 'Spelling',
  colour: 'Colour',
  style_drift: 'Style drift',
  subject: 'Subject',
  background_artifact: 'Background artifact',
  placement: 'Placement',
  other: 'Other',
}

/* ---------- Brief vocabulary (client form + card editor) ---------- */

export const PLACEMENTS = ['front_chest', 'full_front', 'back', 'pocket', 'tote', 'mug'] as const
export type Placement = (typeof PLACEMENTS)[number]

export const PLACEMENT_LABEL: Record<Placement, string> = {
  front_chest: 'Front chest',
  full_front: 'Full front',
  back: 'Back',
  pocket: 'Pocket',
  tote: 'Tote bag',
  mug: 'Mug',
}

export const PRINT_TEXT_ROLES = ['headline', 'sub', 'tagline'] as const
export type PrintTextRole = (typeof PRINT_TEXT_ROLES)[number]

export interface PrintTextLine {
  role: PrintTextRole
  text: string
}

/* ---------- JSON boundary helpers ---------- */

export function isRecord(v: unknown): v is Record<string, Json | undefined> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isPrintTextRole(v: unknown): v is PrintTextRole {
  return typeof v === 'string' && (PRINT_TEXT_ROLES as readonly string[]).includes(v)
}

/**
 * `cards.print_text` is jsonb `[{role, text}]` but older or hand-edited rows may hold
 * strings, nulls or partial objects. Always returns a clean list.
 */
export function parsePrintText(json: Json | null | undefined): PrintTextLine[] {
  if (!Array.isArray(json)) return []
  const out: PrintTextLine[] = []
  for (const item of json) {
    if (typeof item === 'string') {
      if (item.trim()) out.push({ role: 'sub', text: item })
    } else if (isRecord(item) && typeof item.text === 'string') {
      out.push({ role: isPrintTextRole(item.role) ? item.role : 'sub', text: item.text })
    }
  }
  return out
}

/** First line of print text, for tiles and lists. */
export function firstPrintLine(json: Json | null | undefined): string | null {
  const lines = parsePrintText(json)
  return lines.length ? lines[0].text : null
}

/** `fin_jobs.metrics` is written by the finisher; shape is `{w, h, dpi, alpha}` but tolerate anything. */
export interface FinalMetrics {
  w: number | null
  h: number | null
  dpi: number | null
  alpha: boolean | null
}

export function parseFinalMetrics(json: Json | null | undefined): FinalMetrics {
  const m: FinalMetrics = { w: null, h: null, dpi: null, alpha: null }
  if (!isRecord(json)) return m
  const num = (k: string) => {
    const v = json[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  m.w = num('w') ?? num('width') ?? num('px_w')
  m.h = num('h') ?? num('height') ?? num('px_h')
  m.dpi = num('dpi')
  m.alpha = typeof json.alpha === 'boolean' ? json.alpha : null
  return m
}

/** Extracts a human message from anything a Supabase call can throw or return. */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof Error && e.message) return e.message
  if (isRecord(e) && typeof e.message === 'string' && e.message) return e.message
  if (typeof e === 'string' && e) return e
  return fallback
}
