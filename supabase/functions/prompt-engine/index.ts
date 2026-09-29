// DM Studio · Edge Function `prompt-engine`
// POST {generation_id}  →  builds magic_prompt_json + rendered_prompt for one generation and PATCHes the row.
// Contract: docs/generation-spec.md §3. Auth: the caller's x-studio-secret is forwarded to PostgREST and
// validated by rpc studio_secret_ok (verify_jwt is off). No secret value lives in this file: the apikey is
// the project's publishable key and the studio secret only ever passes through from the request header.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  applyEdit,
  clampTier,
  EditError,
  imageRoleLabels,
  type InputPath,
  type MagicPrompt,
  pickAspect,
  pickEditRule,
  pickTierRule,
  readReference,
  renderPrompt,
  renderStyleCard,
  styleCardTypography,
  type StyleCard,
  type TextLine,
} from "./render.ts";

export { renderPrompt } from "./render.ts";

const SUPABASE_URL = "https://voatrqhfsdfjomyajovi.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_shDVoGzgpaS2L9OTmzyRGA_JOx52p0I";
const REST = SUPABASE_URL + "/rest/v1";

// Template slugs this function consumes. Required ones 422 when missing; optional ones fall back.
const REQUIRED_SLUGS = ["tier_rules", "text_rules", "background_rule", "defects"] as const;
const OPTIONAL_SLUGS = ["print_rules", "placement_aspect", "render_order"] as const;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Ctx = { secret: string };

async function pg<T>(ctx: Ctx, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(REST + path, {
    ...init,
    headers: {
      apikey: PUBLISHABLE_KEY,
      "x-studio-secret": ctx.secret,
      "content-type": "application/json",
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status === 401 || res.status === 403 ? 401 : 502, "postgrest " + path.split("?")[0] + " → " + res.status + " " + text.slice(0, 300));
  return (text ? JSON.parse(text) : null) as T;
}

const rpc = <T>(ctx: Ctx, fn: string, args: Record<string, unknown> = {}) =>
  pg<T>(ctx, "/rpc/" + fn, { method: "POST", body: JSON.stringify(args) });

const one = <T>(rows: T[] | null | undefined): T | null => (Array.isArray(rows) && rows.length ? rows[0] : null);

// ---------------------------------------------------------------------------

type Generation = {
  id: string; card_id: string; parent_generation_id: string | null; kind: "generate" | "edit_text" | "edit_region" | "regenerate";
  attempt: number; magic_prompt_json: MagicPrompt | null; style_card_id: string | null; style_card_version: number | null;
  style_card_snapshot: StyleCard | null; brief_snapshot: Record<string, unknown> | null; edit_instruction: string | null;
  old_text: string | null; new_text: string | null; mask_path: string | null; image_path: string | null; aspect_ratio: string | null;
  platform: Platform | null;
};
type Card = {
  id: string; client_id: string; brief_text: string | null; print_text: TextLine[] | null; reference_paths: string[] | null;
  reference_analysis: Record<string, unknown> | null; garment_color: string | null; placement: string | null;
  avoid_notes: string | null; similarity_tier: number | null; brief_snapshot: Record<string, unknown> | null;
};
type Client = { id: string; name: string; default_similarity_tier: number | null; model_override: string | null };
type Platform = "kie" | "openrouter" | "auto";
type OpenRouterModels = { vision?: string; image?: string; edit?: string; text?: string };
type Settings = {
  generation_model: string; generation_resolution: string; vision_model: string | null;
  ai_platform: Platform | null; openrouter_models: OpenRouterModels | null;
};
const OPENROUTER_DEFAULTS: Required<OpenRouterModels> = {
  vision: "google/gemini-3.1-pro-preview", image: "openai/gpt-image-2.5-sunburst", edit: "google/gemini-2.5-flash-image",
  text: "anthropic/claude-sonnet-4.6",
};
type StyleCardRow = { id: string | null; version: number | null; json: StyleCard | null; status?: string };
type Lesson = { client_id: string | null; category: string | null; rule: string };
type Template = { slug: string; version: number; body: string };

function stripBucket(path: string, bucket: "refs" | "gens"): string {
  return path.startsWith(bucket + "/") ? path.slice(bucket.length + 1) : path;
}

function summarizeExemplar(finalPrompt: string): string {
  const t = finalPrompt.trim();
  const i = t.indexOf("\nBRIEF:\n");
  const cut = i >= 0 ? t.slice(i + 1) : t;
  return cut.length > 600 ? cut.slice(0, 597) + "..." : cut;
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  // --- auth: the incoming secret must be present and accepted by the database ---
  const secret = req.headers.get("x-studio-secret")?.trim() ?? "";
  if (!secret) return json(401, { error: "missing x-studio-secret" });
  const ctx: Ctx = { secret };
  let ok = false;
  try {
    ok = (await rpc<boolean>(ctx, "studio_secret_ok")) === true;
  } catch (_e) {
    ok = false;
  }
  if (!ok) return json(401, { error: "invalid x-studio-secret" });

  // --- input ---
  let body: { generation_id?: string } = {};
  try { body = await req.json(); } catch { return json(400, { error: "body must be JSON {generation_id}" }); }
  const generationId = String(body.generation_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(generationId)) return json(400, { error: "generation_id (uuid) required" });

  // --- loads ---
  const gen = one(await pg<Generation[]>(ctx,
    "/generations?id=eq." + generationId +
    "&select=id,card_id,parent_generation_id,kind,attempt,magic_prompt_json,style_card_id,style_card_version,style_card_snapshot,brief_snapshot,edit_instruction,old_text,new_text,mask_path,image_path,aspect_ratio,platform"));
  if (!gen) return json(404, { error: "generation not found: " + generationId });

  const [card, settings, templates] = await Promise.all([
    pg<Card[]>(ctx, "/cards?id=eq." + gen.card_id + "&select=id,client_id,brief_text,print_text,reference_paths,reference_analysis,garment_color,placement,avoid_notes,similarity_tier,brief_snapshot").then(one),
    pg<Settings[]>(ctx, "/settings?id=eq.1&select=generation_model,generation_resolution,vision_model,ai_platform,openrouter_models").then(one),
    pg<Template[]>(ctx, "/prompt_templates?active=eq.true&select=slug,version,body&order=version.desc"),
  ]);
  if (!card) return json(422, { error: "card not found for generation: " + gen.card_id });
  if (!settings) return json(422, { error: "settings row missing" });

  const tpl: Record<string, Template> = {};
  for (const t of templates ?? []) if (!tpl[t.slug]) tpl[t.slug] = t; // highest active version wins
  const missing = REQUIRED_SLUGS.filter((s) => !tpl[s]);
  if (missing.length) return json(422, { error: "missing active prompt_templates: " + missing.join(", "), missing, optional_absent: OPTIONAL_SLUGS.filter((s) => !tpl[s]) });

  const [client, parent, lessonsRaw] = await Promise.all([
    pg<Client[]>(ctx, "/clients?id=eq." + card.client_id + "&select=id,name,default_similarity_tier,model_override").then(one),
    gen.parent_generation_id
      ? pg<Generation[]>(ctx, "/generations?id=eq." + gen.parent_generation_id + "&select=id,card_id,parent_generation_id,kind,attempt,magic_prompt_json,style_card_id,style_card_version,style_card_snapshot,brief_snapshot,edit_instruction,old_text,new_text,mask_path,image_path,aspect_ratio,platform").then(one)
      : Promise.resolve(null),
    pg<Lesson[]>(ctx, "/design_lessons?active=eq.true&or=(client_id.is.null,client_id.eq." + card.client_id + ")&select=client_id,category,rule&order=created_at.asc"),
  ]);
  if (!client) return json(422, { error: "client not found: " + card.client_id });

  // --- style card: the generation's frozen snapshot wins, else the client's current locked card ---
  let styleCard: StyleCardRow;
  if (gen.style_card_snapshot && Object.keys(gen.style_card_snapshot).length) {
    styleCard = { id: gen.style_card_id, version: gen.style_card_version, json: gen.style_card_snapshot };
  } else {
    const row = await rpc<StyleCardRow | StyleCardRow[] | null>(ctx, "current_style_card", { p_client_id: card.client_id });
    const r = Array.isArray(row) ? one(row) : row;
    if (!r || !r.id || !r.json) return json(422, { error: "client " + client.name + " has no locked Style Card - lock one before generating" });
    styleCard = { id: r.id, version: r.version, json: r.json };
  }

  // --- brief: snapshot fields override live card fields ---
  const snap = { ...(card.brief_snapshot ?? {}), ...(gen.brief_snapshot ?? {}) } as Record<string, unknown>;
  const str = (k: string, fallback: unknown) => String((snap[k] ?? fallback ?? "") as string).trim();
  const printText: TextLine[] = (Array.isArray(snap.print_text) ? snap.print_text : (card.print_text ?? [])) as TextLine[];
  const tier = clampTier(snap.similarity_tier ?? card.similarity_tier ?? client.default_similarity_tier ?? 3);
  const placement = str("placement", card.placement);

  // --- input plan ---
  const kind = gen.kind;
  const isEditKind = kind === "edit_text" || kind === "edit_region";
  const plan: InputPath[] = [];
  if (isEditKind) {
    const prev = parent?.image_path ?? null;
    if (!prev) return json(422, { error: kind + " needs a parent generation with an image_path" });
    plan.push({ bucket: "gens", path: stripBucket(prev, "gens"), role: "previous_version" });
    if (gen.mask_path) plan.push({ bucket: "gens", path: stripBucket(gen.mask_path, "gens"), role: "mask" });
  } else {
    for (const p of card.reference_paths ?? []) if (p) plan.push({ bucket: "refs", path: stripBucket(p, "refs"), role: "style_reference" });
    if (tier >= 3) {
      const lib = await pg<{ path: string }[]>(ctx, "/client_references?client_id=eq." + card.client_id + "&select=path&order=created_at.desc&limit=3");
      for (const r of lib ?? []) if (r.path) plan.push({ bucket: "refs", path: stripBucket(r.path, "refs"), role: "client_look" });
    }
  }

  // --- magic prompt ---
  let magic: MagicPrompt;
  const base = kind === "generate" ? null : (gen.magic_prompt_json ?? parent?.magic_prompt_json ?? null);
  const baseSource = kind === "generate" ? "fresh" : gen.magic_prompt_json ? "own" : parent?.magic_prompt_json ? "parent" : "fresh";

  if (base) {
    magic = applyEdit(base, kind as "edit_text" | "edit_region" | "regenerate", {
      instruction: gen.edit_instruction ?? "",
      old_text: gen.old_text ?? "",
      new_text: gen.new_text ?? "",
      edit_rule: pickEditRule(tpl.tier_rules.body),
    });
    // A regenerate works from the references (not the previous image), so it never inherits the TARGETED EDIT rule a
    // parent edit_text / edit_region carried - it gets the card's similarity-tier rule back.
    if (kind === "regenerate") magic.similarity_tier = { tier, rule: pickTierRule(tpl.tier_rules.body, tier) };
    magic.reference_reading.image_roles = imageRoleLabels(plan);
  } else {
    if (!card.reference_analysis || !Object.keys(card.reference_analysis).length) {
      return json(422, { error: "card has no reference_analysis - WF-1 intake has not read the references yet" });
    }
    const exemplars: string[] = [];
    const delivered = await pg<{ id: string }[]>(ctx, "/cards?client_id=eq." + card.client_id + "&stage=eq.delivered&id=neq." + card.id + "&select=id&order=updated_at.desc&limit=25");
    if (delivered?.length) {
      const ids = delivered.map((d) => d.id).join(",");
      const rows = await pg<{ final_prompt: string }[]>(ctx, "/generations?card_id=in.(" + ids + ")&status=eq.done&final_prompt=not.is.null&select=final_prompt,created_at&order=created_at.desc&limit=5");
      for (const r of rows ?? []) if (r.final_prompt) exemplars.push(summarizeExemplar(r.final_prompt));
    }
    const lessons = (lessonsRaw ?? [])
      .sort((a, b) => (a.client_id ? 0 : 1) - (b.client_id ? 0 : 1))
      .map((l) => (l.category ? l.category + ": " : "") + l.rule.trim())
      .filter((l) => l.length > 2);
    const sc = renderStyleCard(styleCard.json ?? {});
    // Reference text that IS the requested print text (clients often send a mockup of the design they want) must not
    // be listed under "do NOT reproduce it" - that contradicts the exact-text block. Match ignoring case, spacing, punctuation.
    const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const wanted = new Set(printText.map((l) => norm(String(l?.text ?? ""))).filter(Boolean));
    const reading = readReference(card.reference_analysis);
    reading.text_detected = reading.text_detected.filter((t) => !wanted.has(norm(t)));
    const printRules = tpl.print_rules?.body?.trim() || [tpl.background_rule.body.trim(), tpl.defects.body.trim()].join("\n\n");

    magic = {
      print_rules: printRules,
      style_card: { version: styleCard.version, prose: sc.prose, negatives: sc.negatives },
      lessons,
      exemplars,
      reference_reading: { ...reading, image_roles: imageRoleLabels(plan) },
      similarity_tier: { tier, rule: pickTierRule(tpl.tier_rules.body, tier) },
      brief: {
        description: str("brief_text", card.brief_text),
        garment_color: str("garment_color", card.garment_color),
        placement,
        avoid_notes: str("avoid_notes", card.avoid_notes),
      },
      text: {
        rule: tpl.text_rules.body.trim(),
        typography: styleCardTypography(styleCard.json ?? {}),
        lines: printText.map((l) => ({ role: String(l?.role ?? "text"), text: String(l?.text ?? "").trim() })).filter((l) => l.text),
      },
    };
    // Edit kinds with no magic_prompt_json on the generation or its parent are built fresh and then edited in place,
    // so the edit instruction, the old->new text swap and the TARGETED EDIT rule are never dropped.
    if (kind !== "generate") {
      magic = applyEdit(magic, kind as "edit_text" | "edit_region" | "regenerate", {
        instruction: gen.edit_instruction ?? "",
        old_text: gen.old_text ?? "",
        new_text: gen.new_text ?? "",
        edit_rule: pickEditRule(tpl.tier_rules.body),
      });
    }
  }

  const rendered = renderPrompt(magic);
  const aspect = (isEditKind && parent?.aspect_ratio) ? parent.aspect_ratio : pickAspect(tpl.placement_aspect?.body, placement);
  const resolution = settings.generation_resolution || "2K";
  const model = client.model_override?.trim() || settings.generation_model;
  // Platform for this run: the designer's choice on the generation, else the studio default. "auto" starts on Kie;
  // WF-2/WF-3 repeat a call on OpenRouter (and set vendor) only when Kie reports it is down.
  const platform: Platform = gen.platform ?? settings.ai_platform ?? "kie";
  const openrouter = { ...OPENROUTER_DEFAULTS, ...(settings.openrouter_models ?? {}) };

  // --- persist onto the generation row ---
  const patch: Record<string, unknown> = {
    magic_prompt_json: magic,
    rendered_prompt: rendered,
    final_prompt: rendered,
    aspect_ratio: aspect,
    resolution,
    model: platform === "openrouter" ? (isEditKind ? openrouter.edit : openrouter.image) : model,
    vendor: platform === "openrouter" ? "openrouter" : "kie",
    platform,
    reference_urls: plan,
  };
  if (!gen.style_card_snapshot || !Object.keys(gen.style_card_snapshot).length) {
    patch.style_card_id = styleCard.id;
    patch.style_card_version = styleCard.version;
    patch.style_card_snapshot = styleCard.json;
  }
  await pg(ctx, "/generations?id=eq." + gen.id, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { prefer: "return=minimal" },
  });

  return json(200, {
    generation_id: gen.id,
    kind,
    base: baseSource,
    magic_prompt_json: magic,
    rendered_prompt: rendered,
    aspect_ratio: aspect,
    resolution,
    model,
    vision_model: settings.vision_model || "gemini-3.1-pro",
    platform,
    openrouter_models: openrouter,
    input_paths: plan,
    style_card_version: styleCard.version,
    templates: Object.fromEntries(Object.values(tpl).map((t) => [t.slug, t.version])),
  });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : e instanceof EditError ? 422 : 500;
    const message = e instanceof Error ? e.message : String(e);
    console.error("prompt-engine", status, message);
    return json(status, { error: message });
  }
});
