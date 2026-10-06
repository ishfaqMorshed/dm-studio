import type { Database, Json, Tables, TablesInsert, TablesUpdate } from './database.types'

/* ---------- Row aliases ---------- */

export type Card = Tables<'cards'>
export type CardInsert = TablesInsert<'cards'>
export type CardUpdate = TablesUpdate<'cards'>
export type Client = Tables<'clients'>
export type ClientInsert = TablesInsert<'clients'>
export type ClientUpdate = TablesUpdate<'clients'>
/** One image in a client's reference library (refs bucket `<client_id>/library/<uuid>.<ext>`). */
export type ClientReference = Tables<'client_references'>
export type ClientReferenceInsert = TablesInsert<'client_references'>
/** A "Draft Style Card from library" job; insert → pg_net → n8n WF-1b → style_draft_update. */
export type StyleDraftRequest = Tables<'style_draft_requests'>
export type StyleDraftRequestInsert = TablesInsert<'style_draft_requests'>
/** A "Fill from text" job (studio_25); insert → pg_net → n8n WF-8 → brief_parse_update. `status` is plain text. */
export type BriefParseRequest = Tables<'brief_parse_requests'>
export type BriefParseRequestInsert = TablesInsert<'brief_parse_requests'>
export type BriefParseStatus = 'queued' | 'working' | 'done' | 'failed'
export type Generation = Tables<'generations'>
export type FinJob = Tables<'fin_jobs'>
export type FinJobEvent = Tables<'fin_job_events'>
export type StyleCard = Tables<'style_cards'>
export type StyleCardUpdate = TablesUpdate<'style_cards'>
export type Profile = Tables<'profiles'>
export type Settings = Tables<'settings'>
export type SettingsUpdate = TablesUpdate<'settings'>
/**
 * `settings.openrouter_models` (jsonb): the OpenRouter model id per job. `vision` reads
 * references and judges QC, `image` generates, `edit` runs Edit text, `region` runs Fix an area
 * (GPT Image 2.5 Sunburst, locked outside, studio_29), `text` writes lessons. The row may carry
 * more keys; the Settings form keeps them on save.
 */
export interface OpenRouterModels {
  vision: string
  image: string
  edit: string
  region: string
  text: string
}
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

/** `cards.source` is plain text in the DB; these are the values the RPCs write. */
export const CARD_SOURCES = ['form', 'designer', 'duplicate', 'style_test'] as const
export type CardSource = (typeof CARD_SOURCES)[number]

export const CARD_SOURCE_LABEL: Record<CardSource, string> = {
  form: 'Client form',
  designer: 'Created by designer',
  duplicate: 'Duplicated',
  style_test: 'Style Card test render',
}

/**
 * Onboarding test renders (`create_style_test_card`) are real cards that run the real pipeline,
 * but they are hidden from the board, Completed and the client's card counts. Every list that
 * hides them filters on this one value; they stay reachable at /card/:id and in the wizard.
 */
export const VISIBLE_CARD_SOURCE_EXCLUDED: CardSource = 'style_test'

export function isCardSource(v: unknown): v is CardSource {
  return typeof v === 'string' && (CARD_SOURCES as readonly string[]).includes(v)
}

/** `settings.generation_resolution` options offered in Settings (Kie GPT Image 2.5). */
export const GENERATION_RESOLUTIONS = ['1K', '2K', '4K'] as const
export type GenerationResolution = (typeof GENERATION_RESOLUTIONS)[number]

export function isGenerationResolution(v: unknown): v is GenerationResolution {
  return typeof v === 'string' && (GENERATION_RESOLUTIONS as readonly string[]).includes(v)
}

/* ---------- AI platform (settings.ai_platform, generations.platform / vendor) ---------- */

/**
 * Where the AI steps run. `kie` and `openrouter` send every step to that platform (same
 * models); `auto` tries Kie first and repeats on OpenRouter any call Kie reports as down.
 */
export const AI_PLATFORMS = ['kie', 'openrouter', 'auto'] as const
export type AiPlatform = (typeof AI_PLATFORMS)[number]

export const AI_PLATFORM_LABEL: Record<AiPlatform, string> = {
  kie: 'Kie',
  openrouter: 'OpenRouter',
  auto: 'Auto',
}

/** One line under the picker for the selected option. */
export const AI_PLATFORM_HINT: Record<AiPlatform, string> = {
  kie: 'Every AI step runs on Kie',
  openrouter: 'Every AI step runs on OpenRouter, same models',
  auto: 'Kie first; switches to OpenRouter if Kie is down',
}

export function isAiPlatform(v: unknown): v is AiPlatform {
  return typeof v === 'string' && (AI_PLATFORMS as readonly string[]).includes(v)
}

/** `settings.ai_platform` as a known value; anything else (or no settings yet) falls back to Kie. */
export function defaultAiPlatform(settings: Pick<Settings, 'ai_platform'> | null | undefined): AiPlatform {
  const v = settings?.ai_platform
  return isAiPlatform(v) ? v : 'kie'
}

/**
 * Chip text for the platform that produced a generation: `vendor` is what actually ran it
 * ('kie' | 'openrouter'), `platform` what the designer picked. "Auto · OpenRouter" when the
 * designer picked Auto. Null while nothing has run yet (vendor is null).
 */
export function generationPlatformLabel(g: Pick<Generation, 'vendor' | 'platform'>): string | null {
  const raw = g.vendor?.trim()
  if (!raw) return null
  const key = raw.toLowerCase()
  const name = key === 'kie' || key === 'openrouter' ? AI_PLATFORM_LABEL[key] : raw
  return g.platform === 'auto' ? `${AI_PLATFORM_LABEL.auto} · ${name}` : name
}

export const GENERATION_KIND_LABEL: Record<GenerationKind, string> = {
  generate: 'Generate',
  edit_text: 'Edit text',
  edit_region: 'Edit region',
  regenerate: 'Regenerate',
}

/* ---------- Fix an area, locked outside (studio_29, Edge Function region-composite) ---------- */

/**
 * `generations.composite_mode` (plain text, edit_region only). `locked`: WF-3 kept the regeneration
 * inside the box, faded it over the blend ring and left the parent byte-identical beyond.
 * `extend`: the same stored regeneration recombined over a larger box ($0, no AI). `full`: the
 * untouched full regeneration itself.
 */
export const COMPOSITE_MODES = ['locked', 'extend', 'full'] as const
export type CompositeMode = (typeof COMPOSITE_MODES)[number]

export const COMPOSITE_MODE_LABEL: Record<CompositeMode, string> = {
  locked: 'Locked outside',
  extend: 'Extended area',
  full: 'Full regeneration',
}

export function isCompositeMode(v: unknown): v is CompositeMode {
  return typeof v === 'string' && (COMPOSITE_MODES as readonly string[]).includes(v)
}

/**
 * Above this share of changed pixels (> 8 levels) outside the box, the full regeneration also moved
 * lettering, outlines or the background: "Use full regeneration" warns (region-composite `full_safe_pct`).
 */
export const FULL_DRIFT_SAFE_PCT = 1

/** A rectangle in image pixels; `width`/`height` = the image it was drawn on (region-composite scales it when they differ). */
export interface RegionRectPx {
  x: number
  y: number
  w: number
  h: number
  width?: number
  height?: number
}

export interface RegionBox {
  x: number
  y: number
  w: number
  h: number
}

export interface RegionSize {
  w: number
  h: number
}

/**
 * `generations.region_metrics` (jsonb, version 1): what region-composite measured. Snake_case keys as
 * stored. A measurement the row does not carry reads null, never 0, so the page never shows a made-up value.
 */
export interface RegionMetrics {
  version: 1
  mode: CompositeMode | null
  /** extend/full children: the edit_region generation whose stored regeneration was recombined. */
  source_generation_id: string | null
  rect: RegionBox | null
  rect_scaled: boolean
  image_size: RegionSize | null
  regen_size: RegionSize | null
  /** 'up' when the AI returned fewer pixels than the design (OpenRouter answers 1024 px for a 2048 px parent). */
  resampled: 'up' | 'down' | null
  resample_factor: number | null
  ring_pct: number | null
  ring_px: number | null
  band_px: number | null
  shift: { dx: number; dy: number; applied: boolean; reliable: boolean; samples: number | null; score0: number | null; score: number | null }
  colour_offset: { r: number; g: number; b: number; reliable: boolean; samples: number | null }
  /** % of pixels beyond the blend ring that the full regeneration changed by more than 8 levels. */
  drift_outside_pct_gt8: number | null
  drift_outside_pct_gt20: number | null
  full_drift_high: boolean
  changed_inside_box_pct: number | null
  ring_changed_pct_gt40: number | null
  ring_blend_changed_pct: number | null
  overflow: {
    detected: boolean
    px: number
    /** The box grown to hold the whole new element (at most 2x the box), or null. */
    suggested_rect: RegionBox | null
    sides: { left: number; right: number; top: number; bottom: number }
  }
  seam_ratio_box: number | null
  seam_ratio_ring: number | null
  /** The lock gate: pixels beyond the ring that differ from the parent. Always 0 on a stored composite. */
  beyond_ring_changed_px: number | null
  tuning: Record<string, number>
  timing_ms: Record<string, number>
  computed_at: string | null
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function regionBoxOf(v: unknown): RegionBox | null {
  if (!isRecord(v)) return null
  const x = finiteOrNull(v.x)
  const y = finiteOrNull(v.y)
  const w = finiteOrNull(v.w)
  const h = finiteOrNull(v.h)
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null
  return { x, y, w, h }
}

function regionSizeOf(v: unknown): RegionSize | null {
  if (!isRecord(v)) return null
  const w = finiteOrNull(v.w)
  const h = finiteOrNull(v.h)
  return w !== null && h !== null && w > 0 && h > 0 ? { w, h } : null
}

function numberMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(v)) return out
  for (const [k, n] of Object.entries(v)) {
    if (typeof n === 'number' && Number.isFinite(n)) out[k] = n
  }
  return out
}

/** `generations.region_metrics`, or null unless it is an object with `version: 1`. Tolerates missing or odd keys. */
export function parseRegionMetrics(j: Json | null | undefined): RegionMetrics | null {
  if (!isRecord(j) || j.version !== 1) return null
  type Rec = Record<string, Json | undefined>
  const shift: Rec = isRecord(j.shift) ? j.shift : {}
  const colour: Rec = isRecord(j.colour_offset) ? j.colour_offset : {}
  const overflow: Rec = isRecord(j.overflow) ? j.overflow : {}
  const sides: Rec = isRecord(overflow.sides) ? overflow.sides : {}
  const gt8 = finiteOrNull(j.drift_outside_pct_gt8)
  return {
    version: 1,
    mode: isCompositeMode(j.mode) ? j.mode : null,
    source_generation_id: typeof j.source_generation_id === 'string' && j.source_generation_id ? j.source_generation_id : null,
    rect: regionBoxOf(j.rect),
    rect_scaled: j.rect_scaled === true,
    image_size: regionSizeOf(j.image_size),
    regen_size: regionSizeOf(j.regen_size),
    resampled: j.resampled === 'up' || j.resampled === 'down' ? j.resampled : null,
    resample_factor: finiteOrNull(j.resample_factor),
    ring_pct: finiteOrNull(j.ring_pct),
    ring_px: finiteOrNull(j.ring_px),
    band_px: finiteOrNull(j.band_px),
    shift: {
      dx: finiteOrNull(shift.dx) ?? 0,
      dy: finiteOrNull(shift.dy) ?? 0,
      applied: shift.applied === true,
      reliable: shift.reliable === true,
      samples: finiteOrNull(shift.samples),
      score0: finiteOrNull(shift.score0),
      score: finiteOrNull(shift.score),
    },
    colour_offset: {
      r: finiteOrNull(colour.r) ?? 0,
      g: finiteOrNull(colour.g) ?? 0,
      b: finiteOrNull(colour.b) ?? 0,
      reliable: colour.reliable === true,
      samples: finiteOrNull(colour.samples),
    },
    drift_outside_pct_gt8: gt8,
    drift_outside_pct_gt20: finiteOrNull(j.drift_outside_pct_gt20),
    // The stored flag, or the same rule when an older row lacks it.
    full_drift_high: j.full_drift_high === true || (gt8 !== null && gt8 > FULL_DRIFT_SAFE_PCT),
    changed_inside_box_pct: finiteOrNull(j.changed_inside_box_pct),
    ring_changed_pct_gt40: finiteOrNull(j.ring_changed_pct_gt40),
    ring_blend_changed_pct: finiteOrNull(j.ring_blend_changed_pct),
    overflow: {
      detected: overflow.detected === true,
      px: finiteOrNull(overflow.px) ?? 0,
      suggested_rect: regionBoxOf(overflow.suggested_rect),
      sides: {
        left: finiteOrNull(sides.left) ?? 0,
        right: finiteOrNull(sides.right) ?? 0,
        top: finiteOrNull(sides.top) ?? 0,
        bottom: finiteOrNull(sides.bottom) ?? 0,
      },
    },
    seam_ratio_box: finiteOrNull(j.seam_ratio_box),
    seam_ratio_ring: finiteOrNull(j.seam_ratio_ring),
    beyond_ring_changed_px: finiteOrNull(j.beyond_ring_changed_px),
    tuning: numberMap(j.tuning),
    timing_ms: numberMap(j.timing_ms),
    computed_at: typeof j.computed_at === 'string' ? j.computed_at : null,
  }
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

/* ---------- Reference slot roles (settings.reference_roles → cards.reference_roles) ---------- */

/**
 * Each brief reference is read for ONE job: `subject` = What to make (hero, supporting elements,
 * layout), `art_style` = Art style (technique, line, shading, texture, palette), `typography` =
 * Lettering (font feel, placement, case, effects). The slot order lives in `settings.reference_roles`
 * (jsonb, default this list); `submit_brief` / `create_card_as_designer` stamp it onto
 * `cards.reference_roles` (null = legacy card, every reference read as style). Copy per role is in
 * `components/brief/referenceRoles.ts`.
 */
export const REFERENCE_ROLES = ['subject', 'art_style', 'typography'] as const
export type ReferenceRole = (typeof REFERENCE_ROLES)[number]

export function isReferenceRole(v: unknown): v is ReferenceRole {
  return typeof v === 'string' && (REFERENCE_ROLES as readonly string[]).includes(v)
}

/**
 * `settings.reference_roles` (or `cards.reference_roles`) as a clean role list; anything that is not
 * an array of known roles reads as the default order, so every surface relabels from the one value
 * and never crashes on a hand-edited row.
 */
export function parseReferenceRoles(json: Json | null | undefined): ReferenceRole[] {
  if (!Array.isArray(json)) return [...REFERENCE_ROLES]
  const roles = json.filter(isReferenceRole)
  return roles.length ? roles : [...REFERENCE_ROLES]
}

/* ---------- Library image tags (client_references.meta) ---------- */

export const REFERENCE_KINDS = ['design', 'mockup', 'draft'] as const
export type ReferenceKind = (typeof REFERENCE_KINDS)[number]

/** "Best example of" tags; WF-1b renders them into REFERENCE_NOTES and the test card picks a roled trio from them. */
export const REFERENCE_BEST_FOR = ['lettering', 'linework', 'palette', 'layout'] as const
export type ReferenceBestFor = (typeof REFERENCE_BEST_FOR)[number]

/** `client_references.meta` (jsonb `{kind, garment, best_for[], outlier}`), every key optional in the row. */
export interface ClientReferenceMeta {
  kind: ReferenceKind | null
  garment: string | null
  best_for: ReferenceBestFor[]
  /** An off-style image: kept in the library, its sheet is excluded from agreement. */
  outlier: boolean
}

export function parseReferenceMeta(json: Json | null | undefined): ClientReferenceMeta {
  const m: ClientReferenceMeta = { kind: null, garment: null, best_for: [], outlier: false }
  if (!isRecord(json)) return m
  const kind = json.kind
  if (typeof kind === 'string' && (REFERENCE_KINDS as readonly string[]).includes(kind)) m.kind = kind as ReferenceKind
  if (typeof json.garment === 'string' && json.garment.trim()) m.garment = json.garment.trim()
  if (Array.isArray(json.best_for)) {
    m.best_for = json.best_for.filter(
      (b): b is ReferenceBestFor => typeof b === 'string' && (REFERENCE_BEST_FOR as readonly string[]).includes(b),
    )
  }
  m.outlier = json.outlier === true
  return m
}

/** The exact object written back to `client_references.meta`. */
export function referenceMetaToJson(m: ClientReferenceMeta): Record<string, Json> {
  return { kind: m.kind, garment: m.garment, best_for: [...m.best_for], outlier: m.outlier }
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

export const PRINT_TEXT_ROLE_LABEL: Record<PrintTextRole, string> = { headline: 'Headline', sub: 'Sub', tagline: 'Tagline' }

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

/**
 * `generations.reference_urls` is written by the worker: the images attached to the
 * engine call (`input_urls`) with the role label the prompt gives each one
 * (e.g. "Image 1–3: style/subject references", "Image 4–6: client's established look").
 * Shape is `[{url, role, path?, index?}]` but tolerate strings and partial objects.
 */
export interface ReferenceUrl {
  /** Signed URL the worker attached (may be expired by the time a designer looks). */
  url: string
  /** Role label as rendered in the prompt, or null when the worker did not record one. */
  role: string | null
  /** Storage path (bucket-relative) when recorded, so the app can re-sign it. */
  path: string | null
  /** 1-based position in `input_urls` when recorded. */
  index: number | null
}

export function parseReferenceUrls(json: Json | null | undefined): ReferenceUrl[] {
  if (!Array.isArray(json)) return []
  const out: ReferenceUrl[] = []
  json.forEach((item, i) => {
    if (typeof item === 'string') {
      if (item.trim()) out.push({ url: item, role: null, path: null, index: i + 1 })
    } else if (isRecord(item)) {
      const url = typeof item.url === 'string' ? item.url : typeof item.signed_url === 'string' ? item.signed_url : ''
      const path = typeof item.path === 'string' ? item.path : null
      if (!url && !path) return
      out.push({
        url,
        role: typeof item.role === 'string' ? item.role : typeof item.label === 'string' ? item.label : null,
        path,
        index: typeof item.index === 'number' && Number.isFinite(item.index) ? item.index : i + 1,
      })
    }
  })
  return out
}

/** `fin_jobs.metrics` is written by WF-4 Finisher (Status -> done) as `{final_w, final_h, dpi}`; older shapes `{w, h, dpi, alpha}` are tolerated. */
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
  m.w = num('w') ?? num('width') ?? num('px_w') ?? num('final_w')
  m.h = num('h') ?? num('height') ?? num('px_h') ?? num('final_h')
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
