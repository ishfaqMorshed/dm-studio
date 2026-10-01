// DM Studio · Edge Function `style-card-check`
// POST {card, brief?, image_count?, sheets?, reference_ids?, client_garments?}
//   -> 200 {ok, card, errors, warnings, fixes, agreement} with card.validation = {errors, warnings, fixes, checked_at}
// Runs the shared pure rules (supabase/functions/_shared/style_card_rules.ts, spec 1.5 + 1.6) on a profiler draft
// before WF-1b stores it (Check Style Card -> Card OK?). Deterministic: no model call, no database write.
//
// Auth: like prompt-engine and qc-judge, the caller's x-studio-secret is forwarded to PostgREST and validated by
// rpc studio_secret_ok (verify_jwt is off). The apikey is the project's publishable key; no secret lives in this file.

import { checkStyleCard, type CheckOptions, type Sheet, type StyleBrief } from "../_shared/style_card_rules.ts";

const SB_URL = (Deno.env.get("SUPABASE_URL") ?? "https://voatrqhfsdfjomyajovi.supabase.co").replace(/\/$/, "");
const PUBLISHABLE_KEY = Deno.env.get("STUDIO_PUBLISHABLE_KEY") ?? "sb_publishable_shDVoGzgpaS2L9OTmzyRGA_JOx52p0I";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function secretOk(secret: string): Promise<boolean> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/studio_secret_ok`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "x-studio-secret": secret, "content-type": "application/json" },
      body: "{}",
    });
    if (!r.ok) return false;
    return (await r.json().catch(() => null)) === true;
  } catch (_e) {
    return false;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const secret = (req.headers.get("x-studio-secret") ?? "").trim();
  if (!secret) return json(401, { error: "missing x-studio-secret" });
  if (!(await secretOk(secret))) return json(401, { error: "invalid x-studio-secret" });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return json(400, { error: "body must be JSON {card, brief, image_count, sheets, reference_ids, client_garments}" }); }
  if (!isObj(body)) return json(400, { error: "body must be a JSON object" });
  if (!isObj(body.card)) return json(400, { error: "card must be a JSON object (the Style Card json)" });

  const sheets = Array.isArray(body.sheets) ? (body.sheets.filter(isObj) as Sheet[]) : null;
  const reference_ids = Array.isArray(body.reference_ids) ? body.reference_ids.filter((x) => typeof x === "string" && UUID_RE.test(x)) as string[] : null;
  const client_garments = Array.isArray(body.client_garments) ? body.client_garments.filter((x) => typeof x === "string") as string[] : null;
  const brief = isObj(body.brief) ? (body.brief as StyleBrief) : null;
  let image_count: number | null = null;
  if (typeof body.image_count === "number" && body.image_count > 0) image_count = Math.floor(body.image_count);
  else if (typeof body.image_count === "string" && /^\d+$/.test(body.image_count)) image_count = parseInt(body.image_count, 10);
  else if (reference_ids && reference_ids.length) image_count = reference_ids.length;
  else if (sheets && sheets.length) image_count = sheets.length;

  const card = { ...body.card };
  if (reference_ids && reference_ids.length && !Array.isArray(card.reference_ids)) card.reference_ids = reference_ids;

  try {
    const opts: CheckOptions = { brief, image_count, sheets, client_garments };
    const result = checkStyleCard(card, opts);
    result.card.validation = {
      errors: result.errors,
      warnings: result.warnings,
      fixes: result.fixes,
      checked_at: new Date().toISOString(),
    };
    return json(200, {
      ok: result.errors.length === 0,
      card: result.card,
      errors: result.errors,
      warnings: result.warnings,
      fixes: result.fixes,
      agreement: result.agreement,
      image_count,
    });
  } catch (e) {
    return json(500, { error: (e as Error).message ?? String(e) });
  }
}

Deno.serve(handler);
