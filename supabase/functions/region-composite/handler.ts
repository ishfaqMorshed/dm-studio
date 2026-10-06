// DM Studio · region-composite · HTTP, auth and storage logic (CONTRACTS B of the architect plan, 2026-10-05).
// No jsr import here on purpose: the Node shim (npm run test:functions) imports this module and drives it with a mocked
// fetch. index.ts is the thin Deno.serve wrapper.
//
// POST {generation_id, mode: 'locked'|'extend'|'full', rect_override?: {x,y,w,h,width?,height?}}
//   locked - the WF-3 worker (x-studio-secret only): downloads the parent image and the stored raw regeneration
//            (gens/<card>/<gen>.raw.png), runs the locked composite (composite.ts), uploads gens/<card>/<gen>.png
//            (upsert) and PATCHes image_path / composite_mode / region_metrics / drift_pct 0. Idempotent.
//   extend - the app (staff JWT) or the worker: the same regeneration recombined over a larger rect (rect_override, else
//            the measured overflow.suggested_rect), uploaded as a NEW child gens/<card>/<uuid>.png (no upsert) and
//            inserted through rpc region_child (status done: generations_notify_edit fires only for status queued, a gate
//            owned by migration studio_29b). $0, no AI.
//   full   - the raw regeneration taken whole: bytes re-uploaded unchanged as a new child, no parent download, no decode.
// Auth: x-studio-secret -> rpc studio_secret_ok must be true (preferred when both are sent); else authorization Bearer
// -> rpc is_staff must be true (the JWT is forwarded to PostgREST, so no secret lives here); else 401. locked with a JWT
// is 403 forbidden_mode. Every later REST / Storage call carries the same auth headers. verify_jwt is off.
// Errors: {ok:false, code, message: 'Region composite: ...'} without double quotes or backslashes (WF-3 Fail Message
// extracts the message with a regex). CORS headers on every response; OPTIONS 204; non-POST 405.
// A network-level fetch failure never echoes the URL (the runtime's TypeError quotes it, and a signed storage URL carries
// its token): storage calls give 502 storage naming only the path, REST calls 500 / 422 naming the step, and every message
// is scrubbed of token= values and JWT-like strings before it leaves (it lands in generations.last_error and the n8n log).

import { decodePng, encodePng, PngError, sniffImageType, type DecodedPng } from "./png.ts";
import { type Box, type RegionMetrics, RegionError, runComposite } from "./composite.ts";

type EnvReader = { env?: { get?: (key: string) => string | undefined } };
function denoEnv(key: string): string | undefined {
  try {
    return (globalThis as { Deno?: EnvReader }).Deno?.env?.get?.(key);
  } catch {
    return undefined;
  }
}

export const SB_URL = (denoEnv("SUPABASE_URL") ?? "https://voatrqhfsdfjomyajovi.supabase.co").replace(/\/$/, "");
export const PUBLISHABLE_KEY = denoEnv("STUDIO_PUBLISHABLE_KEY") ?? "sb_publishable_shDVoGzgpaS2L9OTmzyRGA_JOx52p0I";

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-studio-secret",
  "access-control-allow-methods": "POST, OPTIONS",
};

export const GEN_SELECT = "id,card_id,kind,status,parent_generation_id,mask_rect,mask_path,raw_image_path,image_path,composite_mode,region_metrics";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGN_EXPIRES_SECONDS = 600;

export type Mode = "locked" | "extend" | "full";
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
export type HandlerDeps = { fetch: Fetch; now: () => Date; uuid: () => string };

export type MaskRect = { x: number; y: number; w: number; h: number; width?: number; height?: number };
type GenRow = {
  id: string;
  card_id: string;
  kind: string | null;
  status: string | null;
  parent_generation_id: string | null;
  mask_rect: unknown;
  mask_path: string | null;
  raw_image_path: string | null;
  image_path: string | null;
  composite_mode: string | null;
  region_metrics: unknown;
};
type AuthHeaders = Record<string, string>;
type Auth = { kind: "secret" | "jwt"; headers: AuthHeaders };
type Loaded = { row: GenRow; maskRect: MaskRect };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nowMs = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Never let a signed-URL token (?token=...) or a JWT-like string reach an error body, generations.last_error or the n8n log. */
export function scrubSecrets(message: string): string {
  return String(message ?? "")
    .replace(/token=[^\s&)"'\\]+/gi, "token=redacted")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+){1,2}/g, "redacted");
}

/** Error text for the wire: scrubbed, always prefixed, never a double quote or a backslash (WF-3 Fail Message regex). */
export function cleanMessage(message: string): string {
  const m = scrubSecrets(message).replace(/["\\]/g, "").replace(/\s+/g, " ").trim();
  return /^Region composite:/.test(m) ? m : "Region composite: " + (m || "unexpected error");
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "content-type": "application/json" } });
}

function fail(status: number, code: string, message: string): Response {
  return json(status, { ok: false, code, message: cleanMessage(message) });
}

const err = (code: string, message: string, status: number): RegionError => new RegionError(code, "Region composite: " + message, status);

/** fetch whose network-level rejection becomes the given RegionError, which names only WHAT was attempted - never the URL:
 *  a signed storage URL carries its token and the runtime's TypeError quotes the whole URL. */
async function call(f: Fetch, url: string, init: RequestInit | undefined, failure: () => RegionError): Promise<Response> {
  try {
    return await f(url, init);
  } catch {
    throw failure();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// auth

async function rpcTrue(f: Fetch, name: string, headers: AuthHeaders): Promise<boolean> {
  try {
    const r = await f(`${SB_URL}/rest/v1/rpc/${name}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: "{}" });
    if (!r.ok) return false;
    return (await r.json().catch(() => null)) === true;
  } catch {
    return false;
  }
}

/** The secret wins when both are present; a Bearer token is checked through rpc is_staff. null = not accepted. */
async function authenticate(req: Request, f: Fetch): Promise<Auth | null> {
  const secret = (req.headers.get("x-studio-secret") ?? "").trim();
  if (secret) {
    const headers: AuthHeaders = { apikey: PUBLISHABLE_KEY, "x-studio-secret": secret };
    return (await rpcTrue(f, "studio_secret_ok", headers)) ? { kind: "secret", headers } : null;
  }
  const bearer = (req.headers.get("authorization") ?? "").trim();
  if (/^bearer\s+\S+$/i.test(bearer)) {
    const headers: AuthHeaders = { apikey: PUBLISHABLE_KEY, authorization: bearer };
    return (await rpcTrue(f, "is_staff", headers)) ? { kind: "jwt", headers } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// request body

export function parseMaskRect(v: unknown): MaskRect | null {
  if (!isObj(v)) return null;
  const x = finite(v.x), y = finite(v.y), w = finite(v.w), h = finite(v.h);
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0 || x < 0 || y < 0) return null;
  const width = finite(v.width), height = finite(v.height);
  const out: MaskRect = { x, y, w, h };
  if (width !== null && height !== null && width > 0 && height > 0) {
    out.width = width;
    out.height = height;
  }
  return out;
}

type Body = { generation_id: string; mode: Mode; rect_override: MaskRect | null };

async function readBody(req: Request): Promise<Body> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw err("bad_request", "body must be JSON", 400);
  }
  if (!isObj(raw)) throw err("bad_request", "body must be a JSON object", 400);
  const generation_id = String(raw.generation_id ?? "").trim().toLowerCase();
  if (!UUID_RE.test(generation_id)) throw err("bad_request", "generation_id must be a uuid", 400);
  const mode = raw.mode;
  if (mode !== "locked" && mode !== "extend" && mode !== "full") throw err("bad_request", "mode must be locked, extend or full", 400);
  let rect_override: MaskRect | null = null;
  if (raw.rect_override !== undefined && raw.rect_override !== null) {
    rect_override = parseMaskRect(raw.rect_override);
    if (!rect_override) throw err("bad_request", "rect_override must be {x, y, w, h, width?, height?} with positive w and h", 400);
  }
  return { generation_id, mode, rect_override };
}

// ---------------------------------------------------------------------------------------------------------------
// database + storage

async function restGet<T>(f: Fetch, auth: Auth, path: string): Promise<T> {
  const r = await call(f, `${SB_URL}${path}`, { headers: { ...auth.headers, accept: "application/json" } }, () => err("internal", "database read failed (network)", 500));
  if (!r.ok) throw err("internal", `database read failed (HTTP ${r.status})`, 500);
  return (await r.json()) as T;
}

async function loadSource(f: Fetch, auth: Auth, id: string, needDone: boolean): Promise<Loaded> {
  const rows = await restGet<GenRow[]>(f, auth, `/rest/v1/generations?id=eq.${id}&select=${GEN_SELECT}`);
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row) throw err("not_found", "generation " + id + " not found", 404);
  if (row.kind !== "edit_region") throw err("not_region_edit", "generation " + id + " is not a Fix an area edit (kind " + String(row.kind) + ")", 422);
  const maskRect = parseMaskRect(row.mask_rect);
  if (!maskRect) throw err("no_mask_rect", "generation " + id + " has no valid area (mask_rect) - draw the area again", 422);
  if (!row.raw_image_path) throw err("no_raw", "the full regeneration of " + id + " was not stored - run Fix an area again", 422);
  if (!row.parent_generation_id) throw err("no_parent", "generation " + id + " has no previous version to keep", 422);
  if (needDone && row.status !== "done") throw err("not_done", "generation " + id + " is not finished yet (status " + String(row.status) + ")", 422);
  return { row, maskRect };
}

async function loadParentImagePath(f: Fetch, auth: Auth, parentId: string): Promise<string> {
  const rows = await restGet<{ id: string; image_path: string | null }[]>(f, auth, `/rest/v1/generations?id=eq.${parentId}&select=id,image_path`);
  const path = Array.isArray(rows) ? rows[0]?.image_path : null;
  if (!path) throw err("no_parent", "the previous version " + parentId + " has no image", 422);
  return path;
}

/** settings.region_ring_pct clamped to 1..10; 3 when the row or the column is missing or unreadable. */
async function loadRingPct(f: Fetch, auth: Auth): Promise<number> {
  try {
    const rows = await restGet<Record<string, unknown>[]>(f, auth, `/rest/v1/settings?id=eq.1&select=*`);
    const v = Number((Array.isArray(rows) ? rows[0] : undefined)?.region_ring_pct);
    const pct = Number.isFinite(v) && v > 0 ? v : 3;
    return Math.min(10, Math.max(1, pct));
  } catch {
    return 3;
  }
}

/** Signs gens/<path> (expiresIn 600) and downloads the bytes through the signed URL. */
async function download(f: Fetch, auth: Auth, path: string): Promise<Uint8Array> {
  const s = await call(f, `${SB_URL}/storage/v1/object/sign/gens/${path}`, {
    method: "POST",
    headers: { ...auth.headers, "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: SIGN_EXPIRES_SECONDS }),
  }, () => err("storage", `signing gens/${path} failed (network)`, 502));
  if (!s.ok) throw err("storage", `could not sign gens/${path} (HTTP ${s.status})`, 502);
  const signed = ((await s.json().catch(() => null)) as { signedURL?: unknown } | null)?.signedURL;
  if (typeof signed !== "string" || !signed) throw err("storage", `no signed URL for gens/${path}`, 502);
  const url = /^https?:\/\//i.test(signed) ? signed : `${SB_URL}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
  const r = await call(f, url, { headers: { ...auth.headers } }, () => err("storage", `download of gens/${path} failed (network)`, 502));
  if (!r.ok) throw err("storage", `download of gens/${path} failed (HTTP ${r.status})`, 502);
  return new Uint8Array(await r.arrayBuffer());
}

async function upload(f: Fetch, auth: Auth, path: string, bytes: Uint8Array, upsert: boolean): Promise<void> {
  const r = await call(f, `${SB_URL}/storage/v1/object/gens/${path}`, {
    method: "POST",
    headers: { ...auth.headers, "content-type": "image/png", "x-upsert": upsert ? "true" : "false" },
    body: bytes as unknown as BodyInit,
  }, () => err("storage", `upload of gens/${path} failed (network)`, 502));
  if (!r.ok) throw err("storage", `upload of gens/${path} failed (HTTP ${r.status})`, 502);
}

async function patchGeneration(f: Fetch, auth: Auth, id: string, body: Record<string, unknown>): Promise<void> {
  const r = await call(f, `${SB_URL}/rest/v1/generations?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...auth.headers, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify(body),
  }, () => err("internal", "saving the result failed (network)", 500));
  if (!r.ok) throw err("internal", `saving the result failed (HTTP ${r.status})`, 500);
}

type RegionChildArgs = {
  p_source_generation_id: string;
  p_child_id: string;
  p_mode: "extend" | "full";
  p_mask_rect: unknown;
  p_image_path: string;
  p_region_metrics: unknown;
  p_drift_pct: number | null;
};

/** rpc region_child: the child row, or card_not_in_review (409) / rpc (422) with the Postgres message. */
async function regionChild(f: Fetch, auth: Auth, args: RegionChildArgs): Promise<unknown> {
  const r = await call(f, `${SB_URL}/rest/v1/rpc/region_child`, {
    method: "POST",
    headers: { ...auth.headers, "content-type": "application/json", accept: "application/vnd.pgrst.object+json" },
    body: JSON.stringify(args),
  }, () => err("rpc", "rpc region_child failed (network) - the new version may still exist, reload the card before retrying", 422));
  const text = await r.text();
  if (!r.ok) {
    let message = text;
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      message = String(j.message ?? j.hint ?? j.details ?? text);
    } catch {
      // the body was not JSON; keep the text
    }
    if (/card must be in needs_review/i.test(message)) throw err("card_not_in_review", message, 409);
    throw err("rpc", message + " (HTTP " + r.status + ")", 422);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw err("rpc", "region_child returned no row", 422);
  }
}

async function decodeOrThrow(bytes: Uint8Array, which: string): Promise<DecodedPng> {
  const type = sniffImageType(bytes);
  if (type !== "png") throw err("not_png", which + " is " + type + ", not PNG", 422);
  try {
    return await decodePng(bytes);
  } catch (e) {
    if (e instanceof PngError) throw err("not_png", which + " could not be read (" + e.code + ")", 422);
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// geometry

/** The rect in parent pixels; scaled (and rounded) when it carries a width/height other than the parent's. */
export function rectToParent(r: MaskRect, W: number, H: number): { box: Box; scaled: boolean } {
  if (r.width && r.height && (r.width !== W || r.height !== H)) {
    const sx = W / r.width, sy = H / r.height;
    return { box: { x: Math.round(r.x * sx), y: Math.round(r.y * sy), w: Math.round(r.w * sx), h: Math.round(r.h * sy) }, scaled: true };
  }
  return { box: { x: r.x, y: r.y, w: r.w, h: r.h }, scaled: false };
}

function suggestedRectOf(metrics: unknown): Box | null {
  if (!isObj(metrics) || !isObj(metrics.overflow)) return null;
  const s = metrics.overflow.suggested_rect;
  if (!isObj(s)) return null;
  const x = finite(s.x), y = finite(s.y), w = finite(s.w), h = finite(s.h);
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/** Integers, inside the image, containing the source box; else rect_invalid (422). */
export function validateExtendRect(rect: Box, sourceBox: Box, W: number, H: number): void {
  const ints = [rect.x, rect.y, rect.w, rect.h].every((v) => Number.isInteger(v));
  if (!ints) throw err("rect_invalid", "the extended area must be whole pixels", 422);
  if (rect.w <= 0 || rect.h <= 0 || rect.x < 0 || rect.y < 0 || rect.x + rect.w > W || rect.y + rect.h > H) {
    throw err("rect_invalid", "the extended area must lie inside the image (" + W + "x" + H + ")", 422);
  }
  const contains = rect.x <= sourceBox.x && rect.y <= sourceBox.y &&
    rect.x + rect.w >= sourceBox.x + sourceBox.w && rect.y + rect.h >= sourceBox.y + sourceBox.h;
  if (!contains) throw err("rect_invalid", "the extended area must contain the original area", 422);
}

// ---------------------------------------------------------------------------------------------------------------
// modes

type Images = { parent: DecodedPng; regen: DecodedPng; downloadMs: number; decodeMs: number };

async function loadImages(f: Fetch, auth: Auth, parentPath: string, rawPath: string): Promise<Images> {
  const t0 = nowMs();
  const parentBytes = await download(f, auth, parentPath);
  const rawBytes = await download(f, auth, rawPath);
  const t1 = nowMs();
  const parent = await decodeOrThrow(parentBytes, "the previous version");
  const regen = await decodeOrThrow(rawBytes, "the regenerated image");
  return { parent, regen, downloadMs: Math.round(t1 - t0), decodeMs: Math.round(nowMs() - t1) };
}

function finishMetrics(
  metrics: RegionMetrics, o: { source: string | null; scaled: boolean; now: Date; downloadMs: number; decodeMs: number; encodeMs: number; startedMs: number },
): RegionMetrics {
  metrics.source_generation_id = o.source;
  metrics.rect_scaled = o.scaled;
  metrics.computed_at = o.now.toISOString();
  metrics.timing_ms = {
    download: o.downloadMs,
    decode: o.decodeMs,
    composite: metrics.timing_ms.composite,
    encode: o.encodeMs,
    total: Math.round(nowMs() - o.startedMs),
  };
  return metrics;
}

async function runLocked(f: Fetch, auth: Auth, id: string, deps: HandlerDeps): Promise<Response> {
  const started = nowMs();
  const { row, maskRect } = await loadSource(f, auth, id, false);
  const parentPath = await loadParentImagePath(f, auth, row.parent_generation_id as string);
  const ringPct = await loadRingPct(f, auth);
  const img = await loadImages(f, auth, parentPath, row.raw_image_path as string);
  const { box, scaled } = rectToParent(maskRect, img.parent.width, img.parent.height);
  const { image, metrics } = runComposite(img.parent, img.regen, box, { ring_pct: ringPct, mode: "locked" });
  const tEnc = nowMs();
  const png = await encodePng(image, { ancillary: img.parent.ancillary });
  const encodeMs = Math.round(nowMs() - tEnc);
  const imagePath = `${row.card_id}/${row.id}.png`;
  await upload(f, auth, imagePath, png, true);
  finishMetrics(metrics, { source: null, scaled, now: deps.now(), downloadMs: img.downloadMs, decodeMs: img.decodeMs, encodeMs, startedMs: started });
  await patchGeneration(f, auth, id, { image_path: imagePath, composite_mode: "locked", region_metrics: metrics, drift_pct: 0 });
  return json(200, { ok: true, mode: "locked", generation_id: id, image_path: imagePath, metrics });
}

async function runExtend(f: Fetch, auth: Auth, id: string, override: MaskRect | null, deps: HandlerDeps): Promise<Response> {
  const started = nowMs();
  const { row, maskRect } = await loadSource(f, auth, id, true);
  const parentPath = await loadParentImagePath(f, auth, row.parent_generation_id as string);
  const ringPct = await loadRingPct(f, auth);
  const img = await loadImages(f, auth, parentPath, row.raw_image_path as string);
  const W = img.parent.width, H = img.parent.height;
  const sourceBox = rectToParent(maskRect, W, H).box;
  let rect: Box, scaled = false;
  if (override) {
    const r = rectToParent(override, W, H);
    rect = r.box;
    scaled = r.scaled;
  } else {
    const suggested = suggestedRectOf(row.region_metrics);
    if (!suggested) throw err("no_overflow_rect", "no larger area was measured for " + id + " - draw the area again", 422);
    rect = suggested;
  }
  validateExtendRect(rect, sourceBox, W, H);
  const { image, metrics } = runComposite(img.parent, img.regen, rect, { ring_pct: ringPct, mode: "extend" });
  const tEnc = nowMs();
  const png = await encodePng(image, { ancillary: img.parent.ancillary });
  const encodeMs = Math.round(nowMs() - tEnc);
  const child = deps.uuid();
  const imagePath = `${row.card_id}/${child}.png`;
  await upload(f, auth, imagePath, png, false);
  finishMetrics(metrics, { source: id, scaled, now: deps.now(), downloadMs: img.downloadMs, decodeMs: img.decodeMs, encodeMs, startedMs: started });
  const generation = await regionChild(f, auth, {
    p_source_generation_id: id,
    p_child_id: child,
    p_mode: "extend",
    p_mask_rect: { x: metrics.rect.x, y: metrics.rect.y, w: metrics.rect.w, h: metrics.rect.h, width: W, height: H },
    p_image_path: imagePath,
    p_region_metrics: metrics,
    p_drift_pct: 0,
  });
  return json(200, { ok: true, mode: "extend", generation_id: child, source_generation_id: id, image_path: imagePath, metrics, generation });
}

async function runFull(f: Fetch, auth: Auth, id: string, deps: HandlerDeps): Promise<Response> {
  const { row } = await loadSource(f, auth, id, true);
  const raw = await download(f, auth, row.raw_image_path as string);
  const type = sniffImageType(raw);
  if (type !== "png") throw err("not_png", "the regenerated image is " + type + ", not PNG", 422);
  const child = deps.uuid();
  const imagePath = `${row.card_id}/${child}.png`;
  await upload(f, auth, imagePath, raw, false);
  const previous = isObj(row.region_metrics) ? row.region_metrics : {};
  const metrics = { version: 1, ...previous, mode: "full", source_generation_id: id, computed_at: deps.now().toISOString() };
  const drift = finite(previous.drift_outside_pct_gt8);
  const generation = await regionChild(f, auth, {
    p_source_generation_id: id,
    p_child_id: child,
    p_mode: "full",
    p_mask_rect: row.mask_rect,
    p_image_path: imagePath,
    p_region_metrics: metrics,
    p_drift_pct: drift,
  });
  return json(200, { ok: true, mode: "full", generation_id: child, source_generation_id: id, image_path: imagePath, metrics, generation });
}

// ---------------------------------------------------------------------------------------------------------------

export async function handler(req: Request, deps: Partial<HandlerDeps> = {}): Promise<Response> {
  const d: HandlerDeps = {
    fetch: deps.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init)),
    now: deps.now ?? (() => new Date()),
    uuid: deps.uuid ?? (() => crypto.randomUUID()),
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "POST only");

  const hasSecret = (req.headers.get("x-studio-secret") ?? "").trim() !== "";
  const hasBearer = /^bearer\s+\S+$/i.test((req.headers.get("authorization") ?? "").trim());
  if (!hasSecret && !hasBearer) return fail(401, "unauthorized", "send x-studio-secret (worker) or a staff login (authorization)");
  const auth = await authenticate(req, d.fetch);
  if (!auth) return fail(401, "unauthorized", hasSecret ? "bad x-studio-secret" : "the login is not a staff account");

  let body: Body;
  try {
    body = await readBody(req);
  } catch (e) {
    if (e instanceof RegionError) return fail(e.status, e.code, e.message);
    return fail(400, "bad_request", "body must be JSON");
  }
  if (body.mode === "locked" && auth.kind === "jwt") return fail(403, "forbidden_mode", "locked mode is run by the worker");

  try {
    if (body.mode === "locked") return await runLocked(d.fetch, auth, body.generation_id, d);
    if (body.mode === "extend") return await runExtend(d.fetch, auth, body.generation_id, body.rect_override, d);
    return await runFull(d.fetch, auth, body.generation_id, d);
  } catch (e) {
    if (e instanceof RegionError) return fail(e.status, e.code, e.message);
    if (e instanceof PngError) return fail(422, "not_png", "an image could not be read (" + e.code + ")");
    return fail(500, "internal", String((e as Error)?.message ?? e));
  }
}
