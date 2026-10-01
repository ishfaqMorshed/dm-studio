// DM Studio · prompt-engine v8 · pure rendering module (no I/O, no Deno APIs).
// Contract: docs/generation-spec.md §3 "prompt-engine" + the Style Card v2 spec (render.ts section 3.2);
// verbatim edit-mode wording from docs/tshirt-engine/EXTRACT.md. Everything here is deterministic so
// render_test.ts can pin golden output.
//
// v8 (2026-09-30): the Style Card renders as one line per key (never a '..', never a rule word such as 'Locked:' or
// 'as_typed' - every card is linted through the shared checkStyleCard fixes first), the header carries the row status
// (locked|draft), typography is rendered ONCE (the QUOTE header only points at the Typography line), the garment only
// in the BRIEF, a PRECEDENCE line closes the print rules, references render per slot (WHAT TO MAKE / ART STYLE /
// LETTERING) and a SUBJECT block names the one hero. R3: renderPrompt still accepts the pre-v8 magic_prompt_json shape
// (style_card.prose only, no subject) because edit kinds inherit the parent's prompt.
import { checkStyleCard, normaliseCase, type PaletteEntryV2, type StyleCardV2 } from "../_shared/style_card_rules.ts";

export type PaletteEntry = PaletteEntryV2;
/** Style Card JSON, schema 1 or 2 (every key optional; the shared module owns the vocabulary). */
export type StyleCard = StyleCardV2;

export type TextLine = { role?: string; text: string };

/** One attached reference read for its ONE job (analysis_prompt v3 references[] entry), normalised to strings. */
export type SlotReading = {
  slot: number;
  role: string; // subject | art_style | typography (anything else renders as a generic slot)
  hero: { subject: string; pose: string; framing: string; scale: string };
  supporting_elements: string[];
  layout: string;
  text_zones: string;
  medium: string;
  realism: string;
  line_weight: string;
  line_style: string;
  shading: string;
  texture: string;
  edge_finish: string;
  palette: string;
  headline: { family: string; weight: string; effects: string[] };
  secondary: { family: string; weight: string; effects: string[] };
  placement: string;
  case: string;
  text_detected: string[];
};

export type ReferenceAnalysis = {
  art_style?: string;
  palette?: Array<{ name?: string; hex?: string }> | string;
  subject_structure?: string;
  typography_transcription?: string;
  text_detected?: string[];
  composition?: string;
  notes?: string;
  references?: unknown[];
  same_design?: boolean;
  roles?: string[];
  [k: string]: unknown;
};

export type SlotRole = "subject" | "art_style" | "typography";
export type InputRole = "style_reference" | "subject_reference" | "typography_reference" | "client_look" | "previous_version" | "mask";
/** slot_role is set on roled card references (cards.reference_roles); legacy runs leave it undefined. */
export type InputPath = { bucket: "refs" | "gens"; path: string; role: InputRole; slot_role?: SlotRole };

export type EditKind = "edit_text" | "edit_region" | "regenerate";

/** Thrown by applyEdit when the requested edit cannot be applied to the base prompt (index.ts maps it to HTTP 422). */
export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditError";
  }
}

export type SubjectSource = "brief" | "reference" | "style_card" | "description";
export type Subject = { text: string; source: SubjectSource; pool: string[]; slot?: number };

export type StyleCardBlock = {
  version: number | null;
  /** v8: the style_cards row status (locked | draft). Absent on pre-v8 prompts (rendered as locked, as before). */
  status?: string;
  /** v8: one line per key, already prefixed '- '. Absent on pre-v8 prompts (R3). */
  lines?: string[];
  negatives: string[];
  /** v8: lines.join("\n") for compatibility; pre-v8: the one-paragraph prose. */
  prose: string;
  /** v8: the lock rules the renderer needs outside the card block (LETTERING suffix). */
  rules?: { palette_mode?: string; lock_typography?: boolean; lock_composition?: boolean };
};

export type ReferenceReading = {
  art_style: string;
  palette: string;
  subject_structure: string;
  typography_transcription: string;
  text_detected: string[];
  composition: string;
  notes: string;
  image_roles: string[];
  /** v8: per-slot readings when WF-1 stored analysis_prompt v3 references[]. */
  references?: SlotReading[];
  same_design?: boolean;
};

export type MagicPrompt = {
  // keys in generation-spec §3 order
  print_rules: string;
  style_card: StyleCardBlock;
  lessons: string[];
  exemplars: string[];
  reference_reading: ReferenceReading;
  similarity_tier: { tier: number; rule: string };
  /** v8: the one hero of the design (block 6b). Absent on pre-v8 prompts. */
  subject?: Subject;
  brief: { description: string; garment_color: string; placement: string; avoid_notes: string };
  text: { rule: string; typography: string; lines: TextLine[] };
  // present only for edit_text / edit_region / regenerate
  edit?: { kind: EditKind; instruction: string; old_text: string; new_text: string };
};

// ---------------------------------------------------------------------------
// Verbatim strings from EXTRACT.md that the templates table does not carry per se.
// (Tier text and print rules come from prompt_templates; these are the edit-mode variants.)
export const TARGETED_EDIT_RULE =
  'TARGETED EDIT OF AN EXISTING DESIGN: the image the downstream editing model receives IS the finished previous version of this exact design. Apply ONLY the requested changes (provided in the input under REGENERATION). EVERYTHING ELSE must remain exactly identical to that image - composition, layout, hero subject and how it is drawn, every supporting element and its placement, all colors except where the change requires, lettering style and text placement, texture, and the flat grey background. Do NOT redesign, restyle, reinterpret, or "improve" anything that was not explicitly asked to change.';

export const EDIT_TEXT_RULE_LINE =
  "- Keep the lettering style, size and placement exactly as in the previous version unless the requested change is specifically about the text.";

export const EDIT_CLOSING_SENTENCE =
  "Keep everything else exactly the same, including all lettering, layout, colors, textures, and the flat grey background, with no shadows.";

export const REGEN_TWEAK_HEADER =
  "REGENERATION - TARGETED EDIT: the client reviewed the attached previous version of this design and requested ONLY the following changes. Apply them precisely; everything NOT mentioned must stay EXACTLY as it is in the previous version - same composition, elements, colors, lettering and placement:";

export const REGEN_REFERENCE_HEADER =
  "REGENERATION - MATCH THE REFERENCE BETTER: the client compared the previous attempt against the ORIGINAL REFERENCE (described below and attached) and found it missed or misrepresented elements of that reference. Re-create it at the target similarity, and make absolutely sure to capture the following:";

export const NO_TEXT_LINE =
  "TEXT: no text anywhere - the design must contain NO text at all - no words, letters, numbers, watermarks or signatures.";

// Image role labels (one per slot for roled references; legacy style_reference runs keep the merged label).
export const IMAGE_ROLE_STYLE = "style/subject references for this design";
export const IMAGE_ROLE_SUBJECT = "WHAT TO MAKE - take only the subject, its pose and framing, the supporting elements and the layout; ignore its colours, technique and lettering";
export const IMAGE_ROLE_ART = "ART STYLE - take only medium, linework, shading, texture and colours; never its subject or words";
export const IMAGE_ROLE_LETTERING = "LETTERING - take only the lettering style, weight, case, placement and effects; never its words";
export const IMAGE_ROLE_LOOK = "examples of the client's established look - match the look, never copy a subject";
export const IMAGE_ROLE_PREVIOUS = "the finished previous version of this exact design - edit it in place";
export const IMAGE_ROLE_MASK = "a mask marking the ONLY region that may change";

export const PRECEDENCE_LINE =
  "PRECEDENCE when statements conflict: exact text > print rules > SUBJECT > Style Card > similarity policy > reference descriptions > brief prose.";

export const STYLE_CARD_HEADER_TAIL = " - the LOOK of every design for this client. Every line is a hard requirement unless it says GUIDE:";
export const NEGATIVE_TAIL = "never shadows, halos, gradients, a garment, a mockup or a photo";
export const NEGATIVE_PALETTE = "never a colour outside the palette above";

/** Fallback niche wording when clients.style_brief.niche is empty (tier_rules v2 {{niche}} / v1 bare NICHE). */
export const DEFAULT_NICHE = "this client's usual subject matter";
export const DESCRIPTION_SUBJECT = "as described in the BRIEF Description";

// Kie GPT Image 2.5 aspect enum (docs/kie-gpt-image-2-5.md)
export const KIE_ASPECTS = [
  "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16",
  "2:1", "1:2", "3:1", "1:3", "21:9", "9:21", "auto",
];

// Studio default placement → aspect (docs/kie-gpt-image-2-5.md), used only when no placement_aspect template exists.
export const DEFAULT_PLACEMENT_ASPECT: Record<string, string> = {
  front_chest: "1:1", full_front: "4:5", back: "4:5", pocket: "1:1", tote: "4:5", mug: "3:2",
};

// Similarity tier (1–5) → the "~n%" figure the EXTRACT tier strings carry, for templates using {{n}}.
export const TIER_PERCENT: Record<number, number> = { 1: 30, 2: 50, 3: 65, 4: 85, 5: 95 };

/** Human label per slot role (REFERENCES block, 'Not attached' line). */
export const SLOT_LABEL: Record<SlotRole, string> = { subject: "WHAT TO MAKE", art_style: "ART STYLE", typography: "LETTERING" };
export const SLOT_ROLES: SlotRole[] = ["subject", "art_style", "typography"];

// ---------------------------------------------------------------------------
// small helpers

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Strips trailing punctuation and the rule prefixes ("Locked:", "Guide typography -") early drafts carried. */
export function clean(v: unknown): string {
  let t = s(v);
  t = t.replace(/^(locked|guide)\s*(composition|typography)?\s*[:\-–]\s*/i, "");
  t = t.replace(/[\s.;,]+$/g, "");
  return t.trim();
}

export function clampTier(v: unknown, fallback = 3): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export function spellOut(text: string): string {
  // "QA ROUND TWO" -> "Q A   R O U N D   T W O" (words separated by three spaces)
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => Array.from(w).join(" "))
    .join("   ");
}

function tryJson(body: string): unknown {
  const t = body.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
}

/** Dark garment side for palette_variants: black, navy, charcoal, dark heather ...; light otherwise. */
export function garmentSide(garment: unknown): "dark" | "light" {
  return /black|navy|charcoal|dark/i.test(s(garment)) ? "dark" : "light";
}

// ---------------------------------------------------------------------------
// Template resolvers (templates are lead-editable rows; accept JSON or plain text shapes)

/**
 * tier_rules template → text for one tier. JSON {"1":..,"5":..} / array / "N: text" lines / whole body.
 * Fills {{n}}, {{tier}} and {{niche}}; the bare word NICHE that tier_rules v1 carries is filled too, so v8 never
 * renders the literal token whichever template version is active.
 */
export function pickTierRule(body: string, tier: number, opts: { niche?: string } = {}): string {
  const t = clampTier(tier);
  const pct = TIER_PERCENT[t];
  const niche = s(opts.niche) || DEFAULT_NICHE;
  const fill = (x: string) =>
    x.replace(/\{\{\s*n\s*\}\}/gi, String(pct))
      .replace(/\{\{\s*tier\s*\}\}/gi, String(t))
      .replace(/\{\{\s*niche\s*\}\}/gi, niche)
      .replace(/\bNICHE\b/g, niche)
      .trim();
  const j = tryJson(body);
  if (j && typeof j === "object") {
    if (Array.isArray(j)) {
      const v = j[t - 1] ?? j[j.length - 1];
      if (v !== undefined) return fill(s(v));
    } else {
      const o = j as Record<string, unknown>;
      const v = o[String(t)] ?? o["tier_" + t] ?? o["tier" + t];
      if (v !== undefined) return fill(s(v));
    }
  }
  const lines = body.split(/\r?\n/);
  const re = new RegExp("^\\s*(?:tier\\s*)?" + t + "\\s*(?:/5)?\\s*[:.)\\-–]\\s*(.+)$", "i");
  for (const ln of lines) {
    const m = ln.match(re);
    if (m) return fill(m[1]);
  }
  return fill(body);
}

/** tier_rules template → the TARGETED EDIT rule if the template carries one (JSON key "edit"), else the verbatim constant. */
export function pickEditRule(body: string | undefined): string {
  if (body) {
    const j = tryJson(body);
    if (j && typeof j === "object" && !Array.isArray(j)) {
      const v = (j as Record<string, unknown>)["edit"];
      if (v) return s(v);
    }
  }
  return TARGETED_EDIT_RULE;
}

/** placement_aspect template → Kie aspect. JSON map or "placement ratio" lines; default 1:1. */
export function pickAspect(body: string | undefined, placement: string): string {
  const p = s(placement).toLowerCase().replace(/[\s-]+/g, "_");
  const ok = (r: string) => (KIE_ASPECTS.includes(r) ? r : "");
  if (body) {
    const j = tryJson(body);
    if (j && typeof j === "object" && !Array.isArray(j)) {
      const o = j as Record<string, unknown>;
      const hit = Object.keys(o).find((k) => k.toLowerCase().replace(/[\s-]+/g, "_") === p);
      if (hit) { const r = ok(s(o[hit])); if (r) return r; }
      const def = ok(s(o["default"] ?? o["*"]));
      return def || "1:1";
    }
    for (const ln of body.split(/\r?\n/)) {
      const m = ln.trim().match(/^([A-Za-z_][\w\s-]*?)\s*(?:[:=·→|]|\s)\s*(\d{1,2}:\d{1,2}|auto)\s*$/);
      if (m && m[1].toLowerCase().replace(/[\s-]+/g, "_") === p) { const r = ok(m[2]); if (r) return r; }
    }
    return "1:1";
  }
  return DEFAULT_PLACEMENT_ASPECT[p] ?? "1:1";
}

// ---------------------------------------------------------------------------
// Style Card → lines + negatives

/**
 * Defensive lint at render time: the shared FIXES only (trailing periods, 'Locked:' prefixes, as_typed case, hex case,
 * text demands out of forbid/signature_moves, subject nouns out of composition ...). Errors are ignored here - a v1
 * draft must still render, just clean. Never throws; on any failure the card is used as given.
 */
export function lintStyleCard(card: StyleCard | null | undefined): StyleCard {
  if (!isObj(card)) return {};
  try {
    return checkStyleCard(card).card as StyleCard;
  } catch {
    return card;
  }
}

function caseWords(v: unknown): string {
  const c = normaliseCase(s(v));
  if (c === "UPPER") return "UPPER CASE";
  if (c === "lower") return "lower case";
  if (c === "Title") return "Title Case";
  if (c === "Mixed") return "mixed case";
  return "";
}

const PALETTE_ORDER: Record<string, number> = { dominant: 0, secondary: 1, accent: 2, outline: 3 };

function paletteLabel(p: PaletteEntry | undefined, hexOverride?: string): string {
  const name = clean(p?.name);
  const hex = s(hexOverride ?? p?.hex).toUpperCase();
  const role = clean(p?.role).toLowerCase();
  const weight = clean(p?.weight).toLowerCase();
  const label = [name, hex].filter(Boolean).join(" ");
  if (!label) return "";
  const tag = [role, weight].filter(Boolean).join(", ");
  return tag ? label + " (" + tag + ")" : label;
}

/** Palette entries in dominant, secondary, accent, outline order (stable within a group). */
export function orderedPalette(palette: unknown): PaletteEntry[] {
  const arr = (Array.isArray(palette) ? palette : []).filter(isObj) as PaletteEntry[];
  return arr
    .map((p, i) => ({ p, i, o: PALETTE_ORDER[clean(p.weight).toLowerCase()] ?? 9 }))
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .map((x) => x.p);
}

export type RenderedStyleCard = {
  version: number | null;
  status: string;
  lines: string[];
  negatives: string[];
  prose: string;
  rules: { palette_mode?: string; lock_typography?: boolean; lock_composition?: boolean };
  /** the linted card the lines were rendered from (index.ts reuses it for SUBJECT and typography) */
  card: StyleCard;
};

/**
 * Renders the CLIENT STYLE CARD lines (each prefixed "- ", in spec 3.2 order, skipped when empty). The header is
 * rendered by renderPrompt from version + status. NOT rendered: subjects (SUBJECT block), garment_colors (BRIEF states
 * the garment once), brand_text, evidence, field_evidence, subject_sources, representative_images, validation,
 * reference_ids. Works for schema 1 cards (v2-only lines are simply skipped).
 */
export function renderStyleCard(
  cardIn: StyleCard | null | undefined,
  opts: { garment_color?: string; status?: string; version?: number | null } = {},
): RenderedStyleCard {
  const card = lintStyleCard(cardIn);
  const rules = isObj(card.rules) ? card.rules : {};
  const strict = rules.palette_mode !== "flexible";
  const lines: string[] = [];
  const push = (label: string, value: string) => { if (value) lines.push("- " + label + ": " + value); };

  push("Medium", clean(card.medium));
  {
    const realism = clean(card.realism).toLowerCase();
    const edges = clean(card.edge_finish).toLowerCase();
    push("Rendering", [realism ? realism + " realism" : "", edges ? edges + " edges" : ""].filter(Boolean).join("; "));
  }
  {
    const lw = isObj(card.linework) ? card.linework : {};
    const weight = clean(lw.weight).toLowerCase();
    const style = clean(lw.style);
    const outline = clean(lw.outline).toLowerCase();
    const head = [weight ? weight + " weight" : "", style].filter(Boolean).join(", ");
    push("Linework", [head, outline && outline !== "none" ? outline + " outline" : ""].filter(Boolean).join("; "));
  }
  {
    const method = clean(card.shading_method).toLowerCase();
    const shading = clean(card.shading);
    push("Shading", method && shading ? method + " - " + shading : (method || shading));
  }
  push("Texture", clean(card.texture));

  // Palette: the palette_variants entry for the garment side when one exists, else palette; dominant first.
  let paletteRendered = false;
  {
    const palette = orderedPalette(card.palette);
    const byHex = new Map<string, PaletteEntry>();
    for (const p of palette) { const h = s(p.hex).toUpperCase(); if (h) byHex.set(h, p); }
    let entries: string[] = [];
    const garment = s(opts.garment_color);
    const variants = (Array.isArray(card.palette_variants) ? card.palette_variants : []).filter(isObj);
    const variant = garment
      ? (variants.find((v) => s(v.garment) === garmentSide(garment)) ?? variants.find((v) => s(v.garment) === "any"))
      : undefined;
    if (variant && list(variant.hexes).length) {
      entries = list(variant.hexes).map((h) => {
        const hex = h.toUpperCase();
        return byHex.has(hex) ? paletteLabel(byHex.get(hex), hex) : hex;
      }).filter(Boolean);
    } else {
      entries = palette.map((p) => paletteLabel(p)).filter(Boolean);
    }
    if (entries.length) {
      paletteRendered = true;
      lines.push("- " + (strict
        ? "Palette (STRICT - use ONLY these colours plus the flat grey background, no other hue): "
        : "Palette (FLEXIBLE - lead with these colours; small natural accents in other hues are allowed): ") + entries.join("; "));
    }
  }

  {
    const comp = clean(card.composition);
    if (comp) lines.push("- " + (rules.lock_composition === false ? "Composition (GUIDE - adapt it to the brief): " : "Composition (LOCKED - follow it): ") + comp);
  }
  {
    const hero = isObj(card.hero) ? card.hero : {};
    const framing = clean(hero.framing).toLowerCase();
    const scale = clean(hero.scale).toLowerCase();
    push("Hero framing", [framing && framing !== "none" ? framing : "", scale].filter(Boolean).join(", "));
  }
  {
    const ty = isObj(card.typography) ? card.typography : {};
    const face = (f: unknown, label: string): string => {
      if (!isObj(f)) return "";
      const fam = clean(f.family).toLowerCase(), w = clean(f.weight).toLowerCase(), fx = list(f.effects).map((e) => e.toLowerCase());
      const core = [fam, w].filter(Boolean).join(" ");
      if (!core) return "";
      return label + " " + core + (fx.length ? " (" + fx.join(", ") + ")" : "");
    };
    const parts: string[] = [];
    const headline = face(ty.headline, "headline");
    if (headline) parts.push(headline);
    else if (clean(ty.vibe)) parts.push(clean(ty.vibe));
    const secondary = face(ty.secondary, "secondary");
    if (secondary) parts.push(secondary);
    const placement = clean(ty.placement);
    if (placement) parts.push("placed " + placement);
    const cw = caseWords(ty.case);
    if (cw) parts.push("letter case " + cw);
    if (parts.length) {
      lines.push("- Typography (" + (rules.lock_typography === false ? "GUIDE" : "LOCKED") + "): " + parts.join("; ") + " - every on-design text line is set in this lettering");
    }
  }
  push("Background", clean(card.background));
  push("Mood", list(card.mood).map(clean).filter(Boolean).join(", "));
  {
    const moves = list(card.signature_moves).map(clean).filter(Boolean);
    if (moves.length) lines.push("- Signature moves: " + moves.join("; ") + " - at least one must be visibly present");
  }
  const negatives = list(card.forbid).map(clean).filter(Boolean);
  lines.push("- NEGATIVE - never: " + negatives.concat(strict && paletteRendered ? [NEGATIVE_PALETTE] : [], [NEGATIVE_TAIL]).join("; "));

  return {
    version: opts.version ?? null,
    status: s(opts.status) || "locked",
    lines,
    negatives,
    prose: lines.join("\n"),
    rules: { palette_mode: s(rules.palette_mode) || undefined, lock_typography: rules.lock_typography, lock_composition: rules.lock_composition },
    card,
  };
}

/**
 * What the QUOTE header says the text is set in. Typography is rendered once (the Style Card line); the LETTERING
 * reference is the authority only when the card typography is a GUIDE and such a slot is attached.
 */
export function styleCardTypography(card: StyleCard | null | undefined, plan: InputPath[] = []): string {
  const rules = isObj(card) && isObj(card.rules) ? card.rules : {};
  if (rules.lock_typography !== false) return "the Style Card Typography line above";
  const k = plan.findIndex((p) => p.role === "typography_reference" || p.slot_role === "typography");
  if (k >= 0) return "the lettering of the LETTERING reference (Image " + (k + 1) + "), within the Style Card typography";
  return "guided by the Style Card Typography line above";
}

// ---------------------------------------------------------------------------
// Reference analysis → reading

function readSlot(raw: unknown, index: number): SlotReading | null {
  if (!isObj(raw)) return null;
  const hero = isObj(raw.hero) ? raw.hero : {};
  const face = (f: unknown) => {
    const o = isObj(f) ? f : {};
    return { family: s(o.family), weight: s(o.weight), effects: list(o.effects) };
  };
  let palette = "";
  if (Array.isArray(raw.palette)) {
    palette = raw.palette.map((p) => isObj(p) ? [s(p.name), s(p.hex).toUpperCase()].filter(Boolean).join(" ") : s(p)).filter(Boolean).join(", ");
  } else palette = s(raw.palette);
  const slotN = Number(raw.slot);
  return {
    slot: Number.isFinite(slotN) && slotN >= 1 ? Math.round(slotN) : index + 1,
    role: s(raw.role).toLowerCase(),
    hero: { subject: s(hero.subject), pose: s(hero.pose), framing: s(hero.framing), scale: s(hero.scale) },
    supporting_elements: list(raw.supporting_elements),
    layout: s(raw.layout),
    text_zones: s(raw.text_zones),
    medium: s(raw.medium),
    realism: s(raw.realism),
    line_weight: s(raw.line_weight),
    line_style: s(raw.line_style),
    shading: s(raw.shading),
    texture: s(raw.texture),
    edge_finish: s(raw.edge_finish),
    palette,
    headline: face(raw.headline),
    secondary: face(raw.secondary),
    placement: s(raw.placement),
    case: s(raw.case),
    text_detected: list(raw.text_detected),
  };
}

/**
 * cards.reference_analysis → reading. Flat compat keys as before; when WF-1 stored analysis_prompt v3 references[],
 * they are normalised per slot too (and text_detected is the union of every slot when the flat key is absent).
 */
export function readReference(a: ReferenceAnalysis | null | undefined): Omit<ReferenceReading, "image_roles"> {
  const r = a ?? {};
  let palette = "";
  if (Array.isArray(r.palette)) {
    palette = r.palette.map((p) => [s(p?.name), s(p?.hex)].filter(Boolean).join(" ")).filter(Boolean).join(", ");
  } else palette = s(r.palette);
  const out: Omit<ReferenceReading, "image_roles"> = {
    art_style: s(r.art_style),
    palette,
    subject_structure: s(r.subject_structure),
    typography_transcription: s(r.typography_transcription),
    text_detected: list(r.text_detected),
    composition: s(r.composition),
    notes: s(r.notes),
  };
  if (Array.isArray(r.references) && r.references.length) {
    const refs = r.references.map((x, i) => readSlot(x, i)).filter((x): x is SlotReading => !!x);
    if (refs.length) {
      out.references = refs;
      if (typeof r.same_design === "boolean") out.same_design = r.same_design;
      if (!out.text_detected.length) {
        const seen = new Set<string>();
        for (const ref of refs) for (const t of ref.text_detected) if (!seen.has(t)) { seen.add(t); out.text_detected.push(t); }
      }
    }
  }
  return out;
}

/** Per-image role labels for the prompt, from the ordered input plan (one label per roled slot; spans otherwise). */
export function imageRoleLabels(plan: InputPath[]): string[] {
  const out: string[] = [];
  const span = (from: number, to: number) => (from === to ? "Image " + from : "Image " + from + "-" + to);
  const slotLabel = (p: InputPath): string | null => {
    if (p.role === "subject_reference" || p.slot_role === "subject") return IMAGE_ROLE_SUBJECT;
    if (p.role === "typography_reference" || p.slot_role === "typography") return IMAGE_ROLE_LETTERING;
    if (p.slot_role === "art_style") return IMAGE_ROLE_ART;
    return null;
  };
  let i = 0;
  while (i < plan.length) {
    const own = slotLabel(plan[i]);
    if (own) { out.push("Image " + (i + 1) + ": " + own); i++; continue; }
    const role = plan[i].role;
    let j = i;
    while (j + 1 < plan.length && plan[j + 1].role === role && !slotLabel(plan[j + 1])) j++;
    const label = role === "style_reference" ? IMAGE_ROLE_STYLE
      : role === "client_look" ? IMAGE_ROLE_LOOK
      : role === "previous_version" ? IMAGE_ROLE_PREVIOUS
      : IMAGE_ROLE_MASK;
    out.push(span(i + 1, j + 1) + ": " + label);
    i = j + 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// SUBJECT resolution (spec 3.1): explicit brief subject > WHAT TO MAKE slot (tier >= 3) > Style Card subjects[0] > description

export function resolveSubject(opts: {
  explicit?: unknown;
  tier: number;
  references?: SlotReading[] | null;
  card_subjects?: unknown;
}): Subject {
  const pool = list(opts.card_subjects).map(clean).filter(Boolean);
  const explicit = clean(opts.explicit);
  if (explicit) return { text: explicit, source: "brief", pool };
  if (clampTier(opts.tier) >= 3 && Array.isArray(opts.references)) {
    const slot = opts.references.find((r) => r.role === "subject" && clean(r.hero.subject));
    if (slot) return { text: clean(slot.hero.subject), source: "reference", pool, slot: slot.slot };
  }
  if (pool.length) return { text: pool[0], source: "style_card", pool };
  return { text: DESCRIPTION_SUBJECT, source: "description", pool };
}

// ---------------------------------------------------------------------------
// Exemplars (spec 3.1): Description line + quoted text lines, <= 160 chars, unique by description, max 3

export function summarizeExemplar(finalPrompt: string): string {
  const t = s(finalPrompt);
  const desc = t.match(/^Description:\s*(.+)$/m);
  const quotes: string[] = [];
  const re = /^- [\w-]+: "(.+?)" \(spelled letter by letter:/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) quotes.push(m[1]);
  let out = "";
  if (desc) {
    out = "Description: " + desc[1].trim() + (quotes.length ? " TEXT: " + quotes.map((q) => JSON.stringify(q)).join(" / ") : "");
  } else {
    const i = t.indexOf("\nBRIEF:\n");
    out = (i >= 0 ? t.slice(i + 1) : t).replace(/\s*\n\s*/g, " ");
  }
  if (out.length > 160) {
    let cut = out.slice(0, 160);
    const sp = cut.lastIndexOf(" ");
    if (sp > 100) cut = cut.slice(0, sp);
    out = cut.replace(/[\s,;:-]+$/g, "");
  }
  return out;
}

export function summarizeExemplars(finalPrompts: string[], max = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of finalPrompts) {
    const e = summarizeExemplar(p);
    if (!e) continue;
    const key = (e.match(/^Description:\s*(.*?)(?:\s+TEXT:|$)/)?.[1] ?? e).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Edit application (edit_text / edit_region / regenerate) on a base magic prompt

export function applyEdit(
  base: MagicPrompt,
  kind: EditKind,
  opts: { instruction?: string; old_text?: string; new_text?: string; edit_rule?: string },
): MagicPrompt {
  const m: MagicPrompt = JSON.parse(JSON.stringify(base));
  const instruction = s(opts.instruction);
  const oldText = s(opts.old_text);
  const newText = s(opts.new_text);

  if (kind === "edit_text" && oldText === "" && newText === "") {
    // Multi-line text edit: the caller already rewrote text.lines on the base prompt and lists every change in the
    // instruction. Nothing to swap here; the exact-text block below carries the new lines.
  } else if (kind === "edit_text") {
    // The old line is matched after whitespace/case normalisation. An unmatched old_text is refused rather than
    // appended: appending would leave both the old and the new text in the exact-text block (violates text-once).
    const norm = (t: unknown) => s(t).toLowerCase().replace(/\s+/g, " ");
    const lines = m.text.lines.slice();
    const idx = oldText ? lines.findIndex((l) => norm(l.text) === norm(oldText)) : -1;
    if (idx >= 0) lines[idx] = { ...lines[idx], text: newText };
    else if (oldText === "" && lines.length === 1) lines[0] = { ...lines[0], text: newText };
    else if (oldText === "" && lines.length === 0 && newText) lines.push({ role: "text", text: newText });
    else throw new EditError('old_text not found in print_text: "' + oldText + '"');
    m.text.lines = lines.filter((l) => s(l.text));
  }
  if (kind === "edit_text" || kind === "edit_region") {
    m.similarity_tier = { tier: m.similarity_tier.tier, rule: opts.edit_rule || TARGETED_EDIT_RULE };
  }
  m.edit = { kind, instruction, old_text: oldText, new_text: newText };
  return m;
}

// ---------------------------------------------------------------------------
// Fresh assembly (index.ts loads the rows, this builds the magic prompt; the golden tests call it on fixtures)

export type BuildInput = {
  print_rules: string;
  tier_rules_body: string;
  text_rules_body: string;
  /** the Style Card json as stored (linted here); version + row status label the header */
  style_card: StyleCard | null | undefined;
  style_card_version: number | null;
  style_card_status: string;
  tier: number;
  /** ordered attachment plan (card references with their slot roles, then client_look images) */
  plan: InputPath[];
  reference_analysis: ReferenceAnalysis | null | undefined;
  print_text: TextLine[];
  /** brief_snapshot.subject / client_submission.subject when given */
  explicit_subject?: unknown;
  /** clients.style_brief.niche; empty -> DEFAULT_NICHE */
  niche?: string;
  description: string;
  garment_color: string;
  placement: string;
  avoid_notes: string;
  lessons: string[];
  exemplars: string[];
};

export function buildMagicPrompt(input: BuildInput): MagicPrompt {
  const tier = clampTier(input.tier);
  const fixed = lintStyleCard(input.style_card);
  const sc = renderStyleCard(fixed, { garment_color: input.garment_color, status: input.style_card_status, version: input.style_card_version });
  const printText = (Array.isArray(input.print_text) ? input.print_text : [])
    .map((l) => ({ role: s(l?.role) || "text", text: s(l?.text) }))
    .filter((l) => l.text);
  // Reference text that IS the requested print text (clients often send a mockup of the design they want) must not be
  // listed under "never reproduce it" - that contradicts the exact-text block. Match ignoring case, spacing, punctuation.
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const wanted = new Set(printText.map((l) => norm(l.text)).filter(Boolean));
  const reading = readReference(input.reference_analysis);
  reading.text_detected = reading.text_detected.filter((t) => !wanted.has(norm(t)));
  for (const ref of reading.references ?? []) ref.text_detected = ref.text_detected.filter((t) => !wanted.has(norm(t)));
  return {
    print_rules: s(input.print_rules),
    style_card: { version: input.style_card_version, status: sc.status, lines: sc.lines, negatives: sc.negatives, prose: sc.prose, rules: sc.rules },
    lessons: list(input.lessons),
    exemplars: list(input.exemplars),
    reference_reading: { ...reading, image_roles: imageRoleLabels(input.plan) },
    similarity_tier: { tier, rule: pickTierRule(input.tier_rules_body, tier, { niche: input.niche }) },
    subject: resolveSubject({ explicit: input.explicit_subject, tier, references: reading.references, card_subjects: fixed.subjects }),
    brief: { description: s(input.description), garment_color: s(input.garment_color), placement: s(input.placement), avoid_notes: s(input.avoid_notes) },
    text: { rule: s(input.text_rules_body), typography: styleCardTypography(fixed, input.plan), lines: printText },
  };
}

// ---------------------------------------------------------------------------
// Reference blocks

function slotFace(f: { family: string; weight: string; effects: string[] }): string {
  const core = [s(f.family), s(f.weight)].filter(Boolean).join(" ");
  if (!core) return "";
  return core + (f.effects.length ? " (" + f.effects.join(", ") + ")" : "");
}

function renderSlotReferences(r: ReferenceReading, tier: number, typographyLocked: boolean): string {
  const refs = r.references ?? [];
  const lines = ["REFERENCES - each attached image has ONE job; take nothing else from it:"];
  const kv = (pairs: Array<[string, string]>) => pairs.filter(([, v]) => v).map(([k, v]) => k + ": " + v).join("; ");
  const present = new Set<string>();
  for (const ref of refs) {
    const n = ref.slot;
    if (ref.role === "subject") {
      present.add("subject");
      const body = kv([
        ["Hero", ref.hero.subject],
        ["Pose", ref.hero.pose],
        ["Framing", [ref.hero.framing, ref.hero.scale].filter(Boolean).join(", ")],
        ["Supporting", ref.supporting_elements.join(", ")],
        ["Layout", ref.layout],
        ["Text zones", ref.text_zones],
      ]);
      lines.push("- Image " + n + ", WHAT TO MAKE " + (tier <= 2
        ? "(concept only - a NEW composition is required): "
        : "(the similarity policy applies to THIS image only): ") + (body || "no reading"));
    } else if (ref.role === "art_style") {
      present.add("art_style");
      const body = kv([
        ["Medium", [ref.medium, ref.realism ? ref.realism + " realism" : ""].filter(Boolean).join(", ")],
        ["Linework", [ref.line_weight, ref.line_style].filter(Boolean).join(", ")],
        ["Shading", ref.shading],
        ["Texture", ref.texture],
        ["Edges", ref.edge_finish],
        [tier >= 4 ? "Reference palette (governs this re-creation, inside the Style Card family)" : "Reference palette (mood only - the Style Card palette governs)", ref.palette],
      ]);
      lines.push("- Image " + n + ", ART STYLE - applied WITHIN the Client Style Card (the card's medium, linework, shading, texture and palette govern; this image shows how they are executed): " + (body || "no reading"));
    } else if (ref.role === "typography") {
      present.add("typography");
      const fx = [...ref.headline.effects, ...ref.secondary.effects].filter((e, i, a) => a.indexOf(e) === i);
      const body = kv([
        ["headline", slotFace(ref.headline)],
        ["secondary", slotFace(ref.secondary)],
        ["placed", ref.placement],
        ["case", ref.case],
        ["effects", fx.join(", ")],
      ]);
      lines.push("- Image " + n + ", LETTERING - letterforms only, never its words: " + (body || "no reading") +
        (typographyLocked ? " (the Style Card typography is LOCKED - take only placement and effects that do not contradict it)" : ""));
    } else {
      lines.push("- Image " + n + ": supporting reference - the Style Card governs");
    }
  }
  const missing = SLOT_ROLES.filter((role) => !present.has(role)).map((role) => SLOT_LABEL[role]);
  if (missing.length) lines.push("- Not attached: " + missing.join(", ") + " - the Style Card governs.");
  if (r.text_detected.length) lines.push("- Text seen in the references (never reproduce it): " + r.text_detected.map((t) => JSON.stringify(t)).join(", "));
  if (r.notes) lines.push("- Notes: " + r.notes);
  if (r.image_roles.length) lines.push(r.image_roles.join("; ") + ".");
  return lines.join("\n");
}

function renderFlatReference(r: ReferenceReading, tier: number, isEdit: boolean): string {
  const lines = [isEdit
    ? "PREVIOUS VERSION DESCRIPTION (this is the image being edited - use it to name elements precisely; keep everything not mentioned in the edit request identical):"
    : "REFERENCE DESIGN DESCRIPTION (apply the similarity policy to decide how closely to copy it):"];
  const full = isEdit || tier >= 4;
  if (r.art_style) lines.push("Art style: " + r.art_style);
  if (r.palette) {
    lines.push((full ? "Reference palette (governs this re-creation, inside the Style Card family): " : "Reference palette (mood only - the Style Card palette governs): ") + r.palette);
  }
  if (full) {
    if (r.subject_structure) lines.push("Subject structure: " + r.subject_structure);
    if (r.composition) lines.push("Composition: " + r.composition);
    if (r.typography_transcription) lines.push("Typography in the reference (style only - the on-design text is defined below): " + r.typography_transcription);
  } else if (tier === 3 && r.subject_structure) {
    lines.push("Hero concept to remix: " + r.subject_structure);
  }
  if (r.text_detected.length) lines.push("Text seen in the reference (do NOT reproduce it): " + r.text_detected.map((t) => JSON.stringify(t)).join(", "));
  if (r.notes) lines.push("Notes: " + r.notes);
  if (r.image_roles.length) lines.push(r.image_roles.join("; ") + ".");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The deterministic renderer

export function renderPrompt(magic: MagicPrompt): string {
  const blocks: string[] = [];
  const isEdit = magic.edit?.kind === "edit_text" || magic.edit?.kind === "edit_region";
  const tier = clampTier(magic.similarity_tier?.tier);
  const scRules = magic.style_card.rules ?? {};
  const typographyLocked = scRules.lock_typography !== false;

  // 1 print rules + PRECEDENCE (exactly once, rendered here so pre-v8 prompts get it too)
  blocks.push([s(magic.print_rules), PRECEDENCE_LINE].filter(Boolean).join("\n"));

  // 2 style card: header with version + row status, then one line per key (or the pre-v8 prose, R3)
  {
    const v = magic.style_card.version;
    const status = s(magic.style_card.status) || "locked";
    const head = "CLIENT STYLE CARD" + (v ? " v" + v : "") + " (" + status + ")" + STYLE_CARD_HEADER_TAIL;
    const lines = [head];
    if (Array.isArray(magic.style_card.lines) && magic.style_card.lines.length) {
      for (const l of magic.style_card.lines) if (s(l)) lines.push(s(l));
    } else {
      if (s(magic.style_card.prose)) lines.push(s(magic.style_card.prose));
      const neg = list(magic.style_card.negatives);
      if (neg.length) lines.push("- NEGATIVE - never: " + neg.concat([NEGATIVE_TAIL]).join("; "));
    }
    blocks.push(lines.join("\n"));
  }

  // 3 lessons
  if (magic.lessons.length) {
    blocks.push(
      "LEARNED CLIENT PREFERENCES (distilled from this client's past rejections - treat every one as a hard requirement):\n" +
        magic.lessons.map((l) => "- " + s(l)).join("\n"),
    );
  }

  // 4 exemplars
  if (magic.exemplars.length) {
    blocks.push(
      "APPROVED EXEMPLARS - in the manner of these approved prompts (match their voice and level of finish; never copy a subject):\n" +
        magic.exemplars.map((e) => "- " + s(e).replace(/\s*\n\s*/g, " ")).join("\n"),
    );
  }

  // 5 reference reading: per slot when WF-1 stored references[] (never in edit mode - the attached image is the previous
  // version there), else the legacy flat block made tier-aware
  {
    const r = magic.reference_reading;
    const perSlot = !isEdit && Array.isArray(r.references) && r.references.length > 0;
    blocks.push(perSlot ? renderSlotReferences(r, tier, typographyLocked) : renderFlatReference(r, tier, isEdit));
  }

  // 6 similarity tier
  blocks.push(
    (isEdit ? "PRIMARY RULE - TARGETED EDIT:" : "PRIMARY RULE - SIMILARITY POLICY (tier " + magic.similarity_tier.tier + "/5):") +
      "\n- " + s(magic.similarity_tier.rule) +
      (isEdit ? "" : "\n- The reference may be a rough draft, a shirt mockup, angled, folded, or a screenshot - work from the flat design artwork only, straightened and cleaned up."),
  );

  // 6b SUBJECT (v8) - the one hero; the text below is lettering only
  const subject = magic.subject;
  if (subject && s(subject.text)) {
    const source = subject.source === "brief" ? "the brief"
      : subject.source === "reference" ? "the WHAT TO MAKE reference" + (subject.slot ? " (Image " + subject.slot + ")" : "")
      : subject.source === "style_card" ? "the Style Card"
      : "the BRIEF Description below";
    const pool = list(subject.pool);
    const lines = [
      "SUBJECT (the one hero of this design - it comes from here and nowhere else): " + s(subject.text),
      "- Draw this subject in the Style Card look. The on-design text below is LETTERING ONLY: it never chooses, adds or changes the subject, even when the words name an animal, an object or a place.",
      "- Source: " + source + (pool.length ? ". Usual subject pool (supporting elements only): " + pool.join(", ") : ""),
    ];
    blocks.push(lines.join("\n"));
  }

  // 7 brief (the only place the garment is stated)
  {
    const b = magic.brief;
    const lines = ["BRIEF:"];
    lines.push("Description: " + (s(b.description) || "(none)"));
    if (s(b.garment_color)) lines.push("Garment colour: " + s(b.garment_color) + " - the artwork must hold up printed on this colour.");
    if (s(b.placement)) lines.push("Placement: " + s(b.placement));
    if (s(b.avoid_notes)) lines.push("DESIGN INSTRUCTION (apply on top; never overrides the exact-text, background or no-shadow rules): avoid " + s(b.avoid_notes));
    blocks.push(lines.join("\n"));
  }

  // 8 text (exact-text block) — last so it carries the most weight
  {
    const lines = magic.text.lines.filter((l) => s(l.text));
    if (!lines.length) {
      blocks.push(NO_TEXT_LINE);
    } else {
      const out: string[] = [];
      if (s(magic.text.rule)) out.push(s(magic.text.rule));
      if (isEdit) out.push(EDIT_TEXT_RULE_LINE);
      const typo = s(magic.text.typography);
      const subjectClause = subject && s(subject.text) ? "the words never change the SUBJECT above" : "the words never choose the subject";
      out.push(
        "QUOTE / ON-DESIGN TEXT (render EXACTLY " + (lines.length === 1 ? "this 1 line" : "these " + lines.length + " lines") +
          ", each exactly once, NO other text; lettering only - " + subjectClause + (typo ? "; set in " + typo : "") + "):",
      );
      for (const l of lines) {
        const t = s(l.text);
        out.push("- " + (s(l.role) || "text") + ': "' + t + '" (spelled letter by letter: ' + spellOut(t) + ")");
      }
      blocks.push(out.join("\n"));
    }
  }

  // 9 edit / regeneration block
  if (magic.edit) {
    const e = magic.edit;
    if (e.kind === "regenerate") {
      if (s(e.instruction)) blocks.push(REGEN_REFERENCE_HEADER + '\n"' + s(e.instruction) + '"');
      else blocks.push("REGENERATION: a fresh attempt was requested; keep the brief, the Style Card and the exact text identical.");
    } else {
      const parts: string[] = [];
      if (e.kind === "edit_text" && (s(e.old_text) || s(e.new_text))) {
        parts.push(
          'Change the text "' + s(e.old_text) + '" to exactly "' + s(e.new_text) + '" (spelled letter by letter: ' + spellOut(s(e.new_text)) + "), keeping the same lettering style, size and placement.",
        );
      }
      if (s(e.instruction)) parts.push(s(e.instruction));
      parts.push(EDIT_CLOSING_SENTENCE);
      blocks.push(REGEN_TWEAK_HEADER + '\n"' + parts.join(" ") + '"');
    }
  }

  return blocks.join("\n\n").trim();
}

/** Unresolved template tokens that must never reach the image model (findUnresolvedToken; index.ts returns 422 on a hit). */
export const UNRESOLVED_TOKEN_RE = /\{\{|\}\}|\bNICHE\b/;

/**
 * The first unresolved token in the TEMPLATE-derived text of a magic prompt, or null. Only the print rules, the tier
 * rule (or the edit rule that replaced it), the text rule and the Style Card lines are scanned: those are the only
 * places an unknown {{TOKEN}} or the bare NICHE of tier_rules v1 can come from. Client and designer text - the BRIEF
 * Description, the QUOTE lines ('FIND YOUR NICHE' is a legitimate slogan), avoid notes, edit instructions, lessons and
 * exemplars - is never scanned, so it can never 422 a render.
 */
export function findUnresolvedToken(magic: MagicPrompt): string | null {
  const parts = [
    s(magic.print_rules),
    s(magic.similarity_tier?.rule),
    s(magic.text?.rule),
    ...list(magic.style_card?.lines),
    s(magic.style_card?.prose),
  ];
  for (const p of parts) {
    const m = p.match(UNRESOLVED_TOKEN_RE);
    if (m) return m[0];
  }
  return null;
}
