// qc-judge v2.3 — Supabase Edge Function (Deno). Normalises the vision QC verdict for one generation and writes
// generations.qc_report / needs_regen / text_elements. Contract: docs/generation-spec.md §3 "qc-judge".
//
// Auth: rejected unless the caller sends x-studio-secret and rpc studio_secret_ok (called with that header forwarded)
// returns true. verify_jwt is off; the apikey is the project's publishable key (public), never a service-role key.
// POST {generation_id, qc_raw, exact_text_lines?: string[], style_card?: object, expected_subject?: string, attempt?: number,
//       art_reference_attached?: boolean}
//   qc_raw = the Gemini response text, the whole chat-completions response object, or the parsed verdict object.
//   exact_text_lines defaults to the card's print_text lines when omitted; style_card defaults to prompt-engine v8's
//   magic_prompt_json.effective_style (the look the prompt asked for - the Art style reference look on an art-reference
//   card), else the generation's style_card_snapshot; expected_subject defaults to magic_prompt_json.subject.text (prompt-engine v8), else
//   brief_snapshot.subject, else cards.client_submission.subject; attempt defaults to generations.attempt.
//   settings.qc_subject_regen (studio_21, default true) decides whether a wrong hero regenerates once.
//   v2.2 (2026-10-02): art_reference_attached === true (sent by WF-2 when it attached the card's Art style reference as
//   the SECOND image of the vision call) makes qc-judge read style.art_match into the style_match check 'art_style';
//   anything else (absent, false, a string) = not attached. settings.qc_art_regen (studio_28, default true) decides whether
//   overall 'different' regenerates once. Both flags are read with select=* so a missing column (pre-studio_28) = true.
//   v2.3 (2026-10-05, Fix an area = GPT Image 2.5 Sunburst, locked outside): the generation row is loaded with kind,
//   mask_rect, edit_instruction and region_metrics (studio_29); an edit_region with a mask_rect is judged region-aware
//   (qc.ts regionContextOf: 4 region checks from the judge's "region" key, the instruction's colours and objects never a
//   palette or subject failure, never a regen for the region checks). The response adds `region` (qc_report.region, null
//   for every other kind); reports of other kinds are byte-identical to v2.2.

import { normaliseQc, normaliseTextLines, pickStyleJson, regionContextOf } from './qc.ts';
export { normaliseQc } from './qc.ts';

const SB_URL = (Deno.env.get('SUPABASE_URL') ?? 'https://voatrqhfsdfjomyajovi.supabase.co').replace(/\/$/, '');
const PUBLISHABLE_KEY = Deno.env.get('STUDIO_PUBLISHABLE_KEY') ?? 'sb_publishable_shDVoGzgpaS2L9OTmzyRGA_JOx52p0I';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function sbHeaders(secret: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: PUBLISHABLE_KEY, 'x-studio-secret': secret, 'content-type': 'application/json', ...extra };
}

async function secretOk(secret: string): Promise<boolean> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/studio_secret_ok`, { method: 'POST', headers: sbHeaders(secret), body: '{}' });
  if (!r.ok) return false;
  const v = await r.json().catch(() => null);
  return v === true;
}

type GenRow = {
  id: string; attempt: number | null; style_card_snapshot: unknown;
  kind: string | null; mask_rect: unknown; edit_instruction: string | null; region_metrics: unknown;
  magic_prompt_json: { subject?: { text?: unknown }; effective_style?: unknown } | null;
  brief_snapshot: { subject?: unknown } | null;
  cards: { print_text: unknown; client_submission: { subject?: unknown } | null } | null;
};

// The embed names the FK explicitly: generations.card_id -> cards and cards.current_generation_id -> generations are
// both relationships, so a bare cards(...) embed is ambiguous (PostgREST 300 PGRST201).
async function loadGeneration(secret: string, id: string): Promise<GenRow | null> {
  const u = `${SB_URL}/rest/v1/generations?id=eq.${id}&select=id,attempt,kind,mask_rect,edit_instruction,region_metrics,style_card_snapshot,magic_prompt_json,brief_snapshot,cards!generations_card_id_fkey(print_text,client_submission)`;
  const r = await fetch(u, { headers: sbHeaders(secret, { accept: 'application/json' }) });
  if (!r.ok) throw new Error(`load generation failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const rows = (await r.json()) as GenRow[];
  return rows[0] ?? null;
}

type RegenFlags = { qc_subject_regen: boolean; qc_art_regen: boolean };

/**
 * settings.qc_subject_regen (studio_21) and settings.qc_art_regen (studio_28); each true (the column default) when the
 * row or its column is missing. select=* so a database without one of the columns still returns the other.
 */
async function loadRegenFlags(secret: string): Promise<RegenFlags> {
  const on: RegenFlags = { qc_subject_regen: true, qc_art_regen: true };
  try {
    const r = await fetch(`${SB_URL}/rest/v1/settings?id=eq.1&select=*`, { headers: sbHeaders(secret, { accept: 'application/json' }) });
    if (!r.ok) return on;
    const rows = (await r.json()) as { qc_subject_regen?: unknown; qc_art_regen?: unknown }[];
    const row = rows[0] ?? {};
    return {
      qc_subject_regen: typeof row.qc_subject_regen === 'boolean' ? row.qc_subject_regen : true,
      qc_art_regen: typeof row.qc_art_regen === 'boolean' ? row.qc_art_regen : true,
    };
  } catch {
    return on;
  }
}

async function patchGeneration(secret: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${SB_URL}/rest/v1/generations?id=eq.${id}`, {
    method: 'PATCH', headers: sbHeaders(secret, { prefer: 'return=minimal' }), body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`patch generation failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const secret = (req.headers.get('x-studio-secret') ?? '').trim();
  if (!secret) return json(401, { error: 'missing x-studio-secret' });
  if (!(await secretOk(secret))) return json(401, { error: 'bad x-studio-secret' });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json(400, { error: 'body must be JSON' }); }
  if (!body || typeof body !== 'object') return json(400, { error: 'body must be a JSON object' });
  const generation_id = String(body.generation_id ?? '').trim();
  if (!UUID_RE.test(generation_id)) return json(400, { error: 'generation_id must be a uuid' });

  try {
    const [gen, flags] = await Promise.all([loadGeneration(secret, generation_id), loadRegenFlags(secret)]);
    const { qc_subject_regen, qc_art_regen } = flags;
    if (!gen) return json(404, { error: 'generation not found', generation_id });

    const exact_text_lines = body.exact_text_lines !== undefined && body.exact_text_lines !== null
      ? normaliseTextLines(body.exact_text_lines)
      : normaliseTextLines(gen.cards?.print_text);
    const style_card = pickStyleJson(body.style_card, gen.magic_prompt_json, gen.style_card_snapshot);
    const expected_subject = str(body.expected_subject) || str(gen.magic_prompt_json?.subject?.text) || str(gen.brief_snapshot?.subject) || str(gen.cards?.client_submission?.subject);
    const bodyAttempt = Number(body.attempt);
    const attempt = Number.isFinite(bodyAttempt) && bodyAttempt >= 1 ? Math.floor(bodyAttempt) : (gen.attempt ?? 1);

    // strictly the boolean true WF-2 sends when the Art style reference was the second image of the vision call
    const art_reference_attached = body.art_reference_attached === true;
    // v2.3: an area edit (edit_region with a mask_rect) is judged region-aware; null for every other kind
    const region = regionContextOf(gen);

    const { qc_report, needs_regen, text_elements } = normaliseQc(body.qc_raw, { exact_text_lines, style_card, attempt, expected_subject, qc_subject_regen, art_reference_attached, qc_art_regen, region });
    await patchGeneration(secret, generation_id, { qc_report, needs_regen, text_elements });
    return json(200, {
      generation_id, qc_report, needs_regen, text_elements,
      corrective_instruction: qc_report.corrective_instruction,
      verdict: qc_report.verdict, style_match: qc_report.style_match, expected_subject, qc_subject_regen, art_reference_attached, qc_art_regen,
      region: qc_report.region ?? null,
    });
  } catch (e) {
    return json(500, { error: (e as Error).message ?? String(e), generation_id });
  }
}

Deno.serve(handler);
