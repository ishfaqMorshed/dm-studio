/**
 * Typed wrappers around every DM Studio RPC. Each one resolves with the row the
 * function returns and throws an `Error` carrying the Postgres message when the
 * call fails, so callers can `toast.error(e.message)` directly.
 */
import type { PostgrestError } from '@supabase/supabase-js'
import { REFS_BUCKET, storagePaths, supabase } from './supabase'
import type { Json } from './database.types'
import type {
  AiPlatform,
  Card,
  CardStage,
  ClientReference,
  FinJob,
  Generation,
  GenerationKind,
  PrintTextLine,
  RejectionReason,
  StyleCard,
  StyleDraftRequest,
} from './types'

function rpcError(error: PostgrestError | null, fallback: string): Error {
  if (!error) return new Error(fallback)
  // Postgres RAISE messages arrive in `message`; constraint failures often carry the
  // useful part in `details` or `hint`.
  const parts = [error.message, error.details, error.hint].filter((s): s is string => Boolean(s && s.trim()))
  return new Error(parts.length ? parts.join(' — ') : fallback)
}

function unwrap<T>(res: { data: T | null; error: PostgrestError | null }, what: string): T {
  if (res.error) throw rpcError(res.error, `${what} failed`)
  if (res.data === null || res.data === undefined) throw new Error(`${what} returned nothing`)
  return res.data
}

/* ---------- Staff RPCs ---------- */

/**
 * review → approved. Backend refuses without a locked Style Card or while paused.
 * `platform` is stored on the first generation; omit it to follow settings.ai_platform.
 */
export async function approveCard(cardId: string, platform?: AiPlatform | null): Promise<Card> {
  return unwrap(
    await supabase.rpc('approve_card', { p_card_id: cardId, ...(platform ? { p_platform: platform } : {}) }),
    'Approve',
  )
}

export interface RequestEditPayload {
  instruction?: string | null
  old_text?: string | null
  new_text?: string | null
  /** gens bucket path of the mask: `<card_id>/<generation_id>-mask.png` */
  mask_path?: string | null
  magic_prompt_json?: Json | null
  rejection_reason?: RejectionReason | null
  rejection_note?: string | null
  /** AI platform for the child generation; omit to follow settings.ai_platform. */
  platform?: AiPlatform | null
}

/**
 * Queues a child generation of `generationId` (needs_review → editing).
 * kind edit_text: {old_text, new_text, instruction}
 * kind edit_region: {mask_path, instruction}
 * kind regenerate: {rejection_reason, rejection_note, magic_prompt_json}
 * Every kind also takes `platform` ('kie' | 'openrouter' | 'auto'), stored on the child.
 */
export async function requestEdit(
  generationId: string,
  kind: GenerationKind,
  payload: RequestEditPayload,
): Promise<Generation> {
  const clean: Record<string, Json> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined && v !== null) clean[k] = v as Json
  }
  return unwrap(
    await supabase.rpc('request_edit', { p_generation_id: generationId, p_kind: kind, p_payload: clean }),
    'Request edit',
  )
}

/** needs_review → finishing. Creates the fin_jobs row. Both extras default to null server-side. */
export async function acceptGeneration(
  generationId: string,
  opts: { originalUrl?: string | null; finalUploadToken?: string | null } = {},
): Promise<FinJob> {
  return unwrap(
    await supabase.rpc('accept_generation', {
      p_generation_id: generationId,
      ...(opts.originalUrl ? { p_original_url: opts.originalUrl } : {}),
      ...(opts.finalUploadToken ? { p_final_upload_token: opts.finalUploadToken } : {}),
    }),
    'Accept',
  )
}

/** Makes `generationId` the card's current generation (preview + finishing source). */
export async function setCurrentGeneration(generationId: string): Promise<Card> {
  return unwrap(await supabase.rpc('set_current_generation', { p_generation_id: generationId }), 'Make current')
}

/**
 * Single entry point for stage changes. Prefer `parkCard` / `resumeCard` for the
 * two designer-facing cases; `force` is for leads only.
 */
export async function moveCard(
  cardId: string,
  stage: CardStage,
  note?: string | null,
  force = false,
): Promise<Card> {
  return unwrap(
    await supabase.rpc('move_card', {
      p_card_id: cardId,
      p_stage: stage,
      ...(note ? { p_note: note } : {}),
      ...(force ? { p_force: true } : {}),
    }),
    'Move card',
  )
}

/** Park a card in `waiting` with a note (missing info, client question). */
export async function parkCard(cardId: string, note: string): Promise<Card> {
  return moveCard(cardId, 'waiting', note)
}

/**
 * Resume a parked card. The backend returns it to `previous_stage` when you pass
 * the card's CURRENT stage (`waiting`) as the target.
 */
export async function resumeCard(cardId: string): Promise<Card> {
  return moveCard(cardId, 'waiting', null)
}

/** draft → locked. Locked versions cannot be edited again. */
export async function lockStyleCard(styleCardId: string, note?: string | null): Promise<StyleCard> {
  return unwrap(
    await supabase.rpc('lock_style_card', { p_style_card_id: styleCardId, ...(note ? { p_note: note } : {}) }),
    'Lock Style Card',
  )
}

/** Appends a new draft version for the client. Omit `json` to copy the current one. */
export async function newStyleCardVersion(clientId: string, json?: Json): Promise<StyleCard> {
  return unwrap(
    await supabase.rpc('new_style_card_version', {
      p_client_id: clientId,
      ...(json !== undefined ? { p_json: json } : {}),
    }),
    'New Style Card version',
  )
}

/** Copies the brief into a fresh `intake` card; resolves with the new card. */
export async function duplicateCard(cardId: string): Promise<Card> {
  return unwrap(await supabase.rpc('duplicate_card', { p_card_id: cardId }), 'Duplicate')
}

/** failed → previous stage, re-signing URLs and re-queueing the failed step. */
export async function retryCard(cardId: string): Promise<Card> {
  return unwrap(await supabase.rpc('retry_card', { p_card_id: cardId }), 'Retry')
}

/** The client's locked Style Card, or null when none is locked. */
export async function currentStyleCard(clientId: string): Promise<StyleCard | null> {
  const res = await supabase.rpc('current_style_card', { p_client_id: clientId })
  if (res.error) throw rpcError(res.error, 'Load Style Card failed')
  return res.data ?? null
}

export async function isLead(): Promise<boolean> {
  const res = await supabase.rpc('is_lead')
  if (res.error) throw rpcError(res.error, 'Role check failed')
  return res.data === true
}

/** The signed-in user's id, or throws when there is no session (staff-only calls). */
async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('You are signed out. Sign in again to continue.')
  return data.user.id
}

export interface CreateCardAsDesignerArgs {
  /**
   * Pre-generated card id (crypto.randomUUID()). The dialog uploads the references to
   * refs `<client_id>/<card_id>/<n>.<ext>` FIRST, then calls this, so the path is known.
   */
  cardId: string
  clientId: string
  brief: string
  /** `[{role, text}]`; empty array when the design has no text. */
  printText: PrintTextLine[]
  /** 1–3 refs bucket paths (bucket-relative) in slot order. */
  referencePaths: string[]
  garmentColor: string
  placement: string
  /** `YYYY-MM-DD` or null. */
  dueOn?: string | null
  avoidNotes?: string | null
  /** 1–5; omit to use the client's default_similarity_tier. */
  similarityTier?: number | null
}

/**
 * Board "New card": inserts a card with source = designer in stage intake.
 * WF-1 reads the references and moves it to review.
 */
export async function createCardAsDesigner(args: CreateCardAsDesignerArgs): Promise<Card> {
  return unwrap(
    await supabase.rpc('create_card_as_designer', {
      p_card_id: args.cardId,
      p_client_id: args.clientId,
      p_brief: args.brief,
      p_print_text: args.printText.map((l) => ({ role: l.role, text: l.text })),
      p_reference_paths: args.referencePaths,
      p_garment_color: args.garmentColor,
      p_placement: args.placement,
      ...(args.dueOn ? { p_due_on: args.dueOn } : {}),
      ...(args.avoidNotes && args.avoidNotes.trim() ? { p_avoid_notes: args.avoidNotes.trim() } : {}),
      ...(typeof args.similarityTier === 'number' ? { p_similarity_tier: args.similarityTier } : {}),
    }),
    'Create card',
  )
}

/* ---------- Client reference library (client_references + refs bucket) ---------- */

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

/** Lower-case extension for a storage key: from the MIME type when known, else the file name, else `bin`. */
export function fileExtension(file: File): string {
  const byMime = IMAGE_EXT_BY_MIME[file.type]
  if (byMime) return byMime
  const m = /\.([a-z0-9]{1,5})$/i.exec(file.name)
  return m ? m[1].toLowerCase() : 'bin'
}

/** Library images for a client, oldest first (upload order). */
export async function listClientReferences(clientId: string): Promise<ClientReference[]> {
  const res = await supabase
    .from('client_references')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
  if (res.error) throw rpcError(res.error, 'Load reference library failed')
  return res.data ?? []
}

/**
 * Uploads each file to refs `<client_id>/library/<uuid>.<ext>` then inserts the
 * `client_references` rows in one statement. Resolves with the new rows.
 * If any upload fails, the objects already uploaded are removed and the error is rethrown,
 * so the library never shows a row without an image or an image without a row.
 */
export async function addClientReferences(clientId: string, files: File[]): Promise<ClientReference[]> {
  if (files.length === 0) return []
  const userId = await currentUserId()
  const uploaded: string[] = []
  try {
    for (const file of files) {
      const path = storagePaths.libraryReference(clientId, crypto.randomUUID(), fileExtension(file))
      const { error } = await supabase.storage.from(REFS_BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      })
      if (error) throw new Error(`Upload of ${file.name} failed: ${error.message}`)
      uploaded.push(path)
    }
    const res = await supabase
      .from('client_references')
      .insert(uploaded.map((path) => ({ client_id: clientId, path, created_by: userId })))
      .select('*')
    if (res.error) throw rpcError(res.error, 'Save reference library failed')
    return res.data ?? []
  } catch (e) {
    if (uploaded.length) {
      // Best effort; a leftover object is harmless but a dangling one would be confusing.
      await supabase.storage.from(REFS_BUCKET).remove(uploaded).catch(() => undefined)
    }
    throw e
  }
}

/** Removes the storage object first, then the row. A missing object is not an error. */
export async function deleteClientReference(row: Pick<ClientReference, 'id' | 'path'>): Promise<void> {
  const { error: storageError } = await supabase.storage.from(REFS_BUCKET).remove([row.path])
  if (storageError && !/not found/i.test(storageError.message)) {
    throw new Error(`Remove image failed: ${storageError.message}`)
  }
  const res = await supabase.from('client_references').delete().eq('id', row.id)
  if (res.error) throw rpcError(res.error, 'Remove reference failed')
}

/* ---------- Style Card drafting (style_draft_requests) ---------- */

/**
 * "Draft Style Card from library": inserts a queued request for the client. The DB trigger
 * notifies n8n (WF-1b), which drafts a new style_cards version from the reference library and
 * updates the row (working → done with style_card_id, or failed with last_error).
 * Follow it with `useStyleDraftRequests(clientId)`.
 */
export async function requestStyleDraft(clientId: string): Promise<StyleDraftRequest> {
  const userId = await currentUserId()
  const res = await supabase
    .from('style_draft_requests')
    .insert({ client_id: clientId, requested_by: userId })
    .select('*')
    .single()
  if (res.error) throw rpcError(res.error, 'Draft Style Card failed')
  return res.data
}

/** Recent draft requests for a client, newest first. */
export async function listStyleDraftRequests(clientId: string, limit = 10): Promise<StyleDraftRequest[]> {
  const res = await supabase
    .from('style_draft_requests')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (res.error) throw rpcError(res.error, 'Load draft requests failed')
  return res.data ?? []
}

/* ---------- Public form RPCs (anon; no session required) ---------- */

export interface BriefStart {
  card_id: string
  client_id: string
  client_name: string
  garment_colors: string[]
  /** ISO timestamp; the anon upload grant for the three references ends here (15 min). */
  expires_at: string
}

/** Resolves a form token into a fresh card + upload grant. Throws when the link is invalid or expired. */
export async function startBrief(token: string): Promise<BriefStart> {
  const res = await supabase.rpc('start_brief', { p_token: token })
  if (res.error) throw rpcError(res.error, 'This link is not valid')
  const d = res.data
  if (
    typeof d !== 'object' ||
    d === null ||
    Array.isArray(d) ||
    typeof d.card_id !== 'string' ||
    typeof d.client_id !== 'string'
  ) {
    throw new Error('This link is not valid')
  }
  return {
    card_id: d.card_id,
    client_id: d.client_id,
    client_name: typeof d.client_name === 'string' ? d.client_name : '',
    garment_colors: Array.isArray(d.garment_colors)
      ? d.garment_colors.filter((c): c is string => typeof c === 'string')
      : [],
    expires_at: typeof d.expires_at === 'string' ? d.expires_at : '',
  }
}

export interface SubmitBriefArgs {
  token: string
  cardId: string
  brief: string
  /** `[{role, text}]`; empty array when the client left "text to print" blank. */
  printText: Array<{ role: string; text: string }>
  /** Exactly three refs bucket paths in slot order. */
  referencePaths: string[]
  garmentColor: string
  placement: string
  /** `YYYY-MM-DD` or null. */
  dueOn?: string | null
}

/** Finalises the brief; resolves with the card id. */
export async function submitBrief(args: SubmitBriefArgs): Promise<string> {
  const res = await supabase.rpc('submit_brief', {
    p_token: args.token,
    p_card_id: args.cardId,
    p_brief: args.brief,
    p_print_text: args.printText,
    p_reference_paths: args.referencePaths,
    p_garment_color: args.garmentColor,
    p_placement: args.placement,
    ...(args.dueOn ? { p_due_on: args.dueOn } : {}),
  })
  if (res.error) throw rpcError(res.error, 'Submit failed')
  return typeof res.data === 'string' && res.data ? res.data : args.cardId
}
