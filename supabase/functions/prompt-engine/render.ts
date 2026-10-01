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
//
// v8 art-style override (2026-10-01, user decision "the Art style reference wins for its card"): when a card has an
// ART STYLE slot - the slot cards.reference_roles stamps art_style (with a reference path), else on a role-less card the
// per-slot reading with role art_style - the design is drawn in that image's medium, realism, linework, shading,
// texture, edge finish and palette: an ART STYLE block replaces the Style Card look lines, the Style Card governs only
// the rest (composition, typography, mood, signature moves that do not contradict, background, and the forbid list
// stays a hard negative), no client_look images are attached, and magic_prompt_json.effective_style carries the look QC
// judges against. The values come from the per-slot reading of THAT slot (analysis_prompt v3); with no such reading (a
// flat v2 analysis, or a reading made for another job before staff changed the roles) the override is value-less: the
// ART STYLE block says "exactly as in Image k" and effective_style carries an empty look. Per-slot readings are aligned
// to the stamped roles (alignReadings), so a stale read never lends its values to another image. Style-test cards
// (source style_test) never take the override - they exist to test the Style Card. No art slot = the Style Card governs.
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
  /** the art slot palette as entries (uppercase hex); absent on readings stored before the art-style override */
  palette_entries?: Array<{ name: string; hex: string; role: string }>;
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

/** One colour of the effective look (contract with WF-2/WF-3 Build QC Request). */
export type EffectivePaletteEntry = { name: string; hex: string; role?: string; weight?: string };

/**
 * magic_prompt_json.effective_style - the look this design is drawn in and QC judges against (contract with WF-2/WF-3:
 * Build QC Request uses it as STYLE_CARD_JSON and derives PALETTE_RULE from palette_mode; absent on engines <= v7).
 * source 'art_reference': medium .. palette are the ART STYLE reference values, palette_mode is the client's strictness
 * applied to the reference palette, forbid / composition / typography / rules come from the Style Card.
 * source 'style_card': every value from the (linted) Style Card, the palette resolved for the garment side the way the
 * prompt renders it.
 */
export type EffectiveStyle = {
  source: "art_reference" | "style_card";
  /** 'art_reference': the image number of the art-style reference in the input plan (else its card slot); null otherwise */
  reference_slot: number | null;
  medium: string;
  realism: string;
  linework: { weight: string; style: string; outline: string };
  shading: string;
  shading_method: string;
  texture: string;
  edge_finish: string;
  palette: EffectivePaletteEntry[];
  palette_mode: "strict" | "flexible";
  forbid: string[];
  composition: string;
  typography: Record<string, unknown>;
  rules: Record<string, unknown>;
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
  /** v8 (art-style override): the look of this design; absent on prompts built before it (rendered as before). */
  effective_style?: EffectiveStyle;
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
/** The art-style slot label when that reference governs the look (art-style override). */
export const IMAGE_ROLE_ART_WINS = "ART STYLE - draw this design in this image's medium, linework, shading, texture and colours; never its subject or words";
export const IMAGE_ROLE_LETTERING = "LETTERING - take only the lettering style, weight, case, placement and effects; never its words";
export const IMAGE_ROLE_LOOK = "examples of the client's established look - match the look, never copy a subject";
export const IMAGE_ROLE_PREVIOUS = "the finished previous version of this exact design - edit it in place";
export const IMAGE_ROLE_MASK = "a mask marking the ONLY region that may change";

export const PRECEDENCE_LINE =
  "PRECEDENCE when statements conflict: exact text > print rules > SUBJECT > Style Card > similarity policy > reference descriptions > brief prose.";
/** The PRECEDENCE line when an Art style reference governs the look. */
export const PRECEDENCE_LINE_ART =
  "PRECEDENCE when statements conflict: exact text > print rules > SUBJECT > ART STYLE reference (medium, linework, shading, texture, colours) > Style Card > similarity policy > reference descriptions > brief prose.";

export const STYLE_CARD_HEADER_TAIL = " - the LOOK of every design for this client. Every line is a hard requirement unless it says GUIDE:";
export const NEGATIVE_TAIL = "never shadows, halos, gradients, a garment, a mockup or a photo";
export const NEGATIVE_PALETTE = "never a colour outside the palette above";
/** Art-style override: the Style Card header (after "CLIENT STYLE CARD vN (status)"), the NEGATIVE palette clause, the SUBJECT look line. */
export const STYLE_CARD_HEADER_TAIL_ART =
  " - governs only the lines below; the ART STYLE block above sets the medium, linework, shading, texture and colours, and the NEGATIVE line stays a hard rule. Every line is a hard requirement unless it says GUIDE:";
export const NEGATIVE_PALETTE_ART = "never a colour outside the ART STYLE palette above";
export const SIGNATURE_MOVES_ART_TAIL = " - use at least one, only where it does not contradict the ART STYLE reference";

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

/**
 * The Style Card palette for this garment: the palette_variants entry for the garment side (else the 'any' variant)
 * when one exists, each hex labelled from the palette by hex; otherwise the palette, dominant first. Shared by the
 * Palette line and effective_style so the prompt and QC judge the same colours.
 */
export function cardPalette(card: StyleCard, garment_color?: string): PaletteEntry[] {
  const palette = orderedPalette(card.palette);
  const byHex = new Map<string, PaletteEntry>();
  for (const p of palette) { const h = s(p.hex).toUpperCase(); if (h) byHex.set(h, p); }
  const garment = s(garment_color);
  const variants = (Array.isArray(card.palette_variants) ? card.palette_variants : []).filter(isObj);
  const variant = garment
    ? (variants.find((v) => s(v.garment) === garmentSide(garment)) ?? variants.find((v) => s(v.garment) === "any"))
    : undefined;
  if (variant && list(variant.hexes).length) {
    return list(variant.hexes).map((h) => {
      const hex = h.toUpperCase();
      return byHex.has(hex) ? { ...byHex.get(hex)!, hex } : { hex };
    });
  }
  return palette;
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
 * The Style Card look lines (Medium .. Palette) - left out when an Art style reference governs the look. Returns true
 * when a Palette line was rendered (the strict NEGATIVE clause refers to it).
 */
function renderLookLines(
  card: StyleCard,
  garment_color: string | undefined,
  strict: boolean,
  push: (label: string, value: string) => void,
  lines: string[],
): boolean {
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
  {
    const entries = cardPalette(card, garment_color).map((p) => paletteLabel(p)).filter(Boolean);
    if (!entries.length) return false;
    lines.push("- " + (strict
      ? "Palette (STRICT - use ONLY these colours plus the flat grey background, no other hue): "
      : "Palette (FLEXIBLE - lead with these colours; small natural accents in other hues are allowed): ") + entries.join("; "));
    return true;
  }
}

/**
 * Renders the CLIENT STYLE CARD lines (each prefixed "- ", in spec 3.2 order, skipped when empty). The header is
 * rendered by renderPrompt from version + status. NOT rendered: subjects (SUBJECT block), garment_colors (BRIEF states
 * the garment once), brand_text, evidence, field_evidence, subject_sources, representative_images, validation,
 * reference_ids. Works for schema 1 cards (v2-only lines are simply skipped).
 * art_reference (the art-style override): the look lines - Medium, Rendering, Linework, Shading, Texture, Palette - are
 * left out (the ART STYLE block replaces them), signature moves are qualified by the ART STYLE reference, and the
 * strict NEGATIVE clause points at the ART STYLE palette. The forbid list stays.
 */
export function renderStyleCard(
  cardIn: StyleCard | null | undefined,
  opts: { garment_color?: string; status?: string; version?: number | null; art_reference?: boolean } = {},
): RenderedStyleCard {
  const card = lintStyleCard(cardIn);
  const rules = isObj(card.rules) ? card.rules : {};
  const strict = rules.palette_mode !== "flexible";
  const art = opts.art_reference === true;
  const lines: string[] = [];
  const push = (label: string, value: string) => { if (value) lines.push("- " + label + ": " + value); };

  const paletteRendered = art ? false : renderLookLines(card, opts.garment_color, strict, push, lines);

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
    if (moves.length) lines.push("- Signature moves: " + moves.join("; ") + (art ? SIGNATURE_MOVES_ART_TAIL : " - at least one must be visibly present"));
  }
  const negatives = list(card.forbid).map(clean).filter(Boolean);
  const paletteClause = art ? (strict ? [NEGATIVE_PALETTE_ART] : []) : (strict && paletteRendered ? [NEGATIVE_PALETTE] : []);
  lines.push("- NEGATIVE - never: " + negatives.concat(paletteClause, [NEGATIVE_TAIL]).join("; "));

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
  // palette: entries {name, hex, role} with the hex normalised ('F2E8D5', '#f2e8d5', '#FED' -> '#F2E8D5' / '#FFEEDD');
  // an entry with a name but no usable hex is kept by name (a STRICT palette must never silently lose a colour); a
  // string palette ("cream #F2E8D5, rust #B5482A") or string items are parsed. palette_entries stays undefined when
  // nothing parses, so effectiveStyle falls back to the palette text.
  const texts: string[] = [];
  const entries: Array<{ name: string; hex: string; role: string }> = [];
  if (Array.isArray(raw.palette)) {
    for (const p of raw.palette) {
      if (isObj(p)) {
        const name = s(p.name), hex = normHex(p.hex);
        const label = [name, hex].filter(Boolean).join(" ");
        if (!label) continue;
        texts.push(label);
        entries.push({ name, hex, role: s(p.role).toLowerCase() });
      } else if (s(p)) {
        texts.push(s(p));
        for (const e of paletteFromText(p)) entries.push({ name: s(e.name), hex: s(e.hex), role: "" });
      }
    }
  } else if (s(raw.palette)) {
    texts.push(s(raw.palette));
    for (const e of paletteFromText(raw.palette)) entries.push({ name: s(e.name), hex: s(e.hex), role: "" });
  }
  const palette = texts.join(", ");
  const palette_entries = entries.length ? entries : undefined;
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
    palette_entries,
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

/**
 * Per-image role labels for the prompt, from the ordered input plan (one label per roled slot; spans otherwise).
 * opts.art_image (1-based plan position, art-style override): that image is labelled IMAGE_ROLE_ART_WINS - also on a
 * role-less plan whose per-slot reading names an art_style slot.
 */
export function imageRoleLabels(plan: InputPath[], opts: { art_image?: number | null } = {}): string[] {
  const out: string[] = [];
  const span = (from: number, to: number) => (from === to ? "Image " + from : "Image " + from + "-" + to);
  const artAt = Number(opts.art_image) >= 1 ? Math.round(Number(opts.art_image)) - 1 : -1;
  const slotLabel = (p: InputPath, k: number): string | null => {
    if (k === artAt) return IMAGE_ROLE_ART_WINS;
    if (p.role === "subject_reference" || p.slot_role === "subject") return IMAGE_ROLE_SUBJECT;
    if (p.role === "typography_reference" || p.slot_role === "typography") return IMAGE_ROLE_LETTERING;
    if (p.slot_role === "art_style") return IMAGE_ROLE_ART;
    return null;
  };
  let i = 0;
  while (i < plan.length) {
    const own = slotLabel(plan[i], i);
    if (own) { out.push("Image " + (i + 1) + ": " + own); i++; continue; }
    const role = plan[i].role;
    let j = i;
    while (j + 1 < plan.length && plan[j + 1].role === role && !slotLabel(plan[j + 1], j + 1)) j++;
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
// Art-style override (user decision 2026-10-01: the Art style reference wins for its card)

/** A style-test card (create_style_test_card: cards.source / client_submission.source 'style_test') never takes the override. */
export function isStyleTestCard(source: unknown, client_submission?: unknown): boolean {
  if (s(source).toLowerCase() === "style_test") return true;
  return isObj(client_submission) && s(client_submission.source).toLowerCase() === "style_test";
}

/** True when the reading carries at least one look value (false = a value-less art override: "match Image k itself"). */
export function hasLook(r: SlotReading | null | undefined): boolean {
  if (!r) return false;
  return [r.medium, r.realism, r.line_weight, r.line_style, r.shading, r.texture, r.edge_finish, r.palette].some((v) => s(v) !== "") ||
    (Array.isArray(r.palette_entries) && r.palette_entries.length > 0);
}

/** cards.reference_roles normalised (lower case), or null when the card carries no known role (legacy, role-less card). */
export function stampedRoles(reference_roles: unknown): string[] | null {
  if (!Array.isArray(reference_roles)) return null;
  const roles = reference_roles.map((r) => s(r).toLowerCase());
  return roles.some((r) => (SLOT_ROLES as string[]).includes(r)) ? roles : null;
}

/** An empty reading of one slot (a stamped slot whose reading was made for another job, or that has none). */
export function emptyReading(slot: number, role: string): SlotReading {
  return readSlot({ slot, role }, slot - 1) as SlotReading;
}

/**
 * Per-slot readings aligned to the stamped roles. Staff may change a slot's role after the vision read and saving roles
 * does not re-run WF-1, so the stamped role (cards.reference_roles, what the input plan labels) decides each slot's job:
 * a reading keeps its values only when it was read for that job, or carries no known role (legacy safety - it then
 * takes the stamped role); a reading made for another job is replaced by an empty reading of the stamped role, so a
 * stale read never lends its values to another image. No stamped roles -> the readings as read.
 */
export function alignReadings(refs: SlotReading[] | null | undefined, reference_roles: unknown): SlotReading[] | undefined {
  if (!Array.isArray(refs)) return undefined;
  const roles = stampedRoles(reference_roles);
  if (!roles) return refs;
  const known = (role: string) => (SLOT_ROLES as string[]).includes(role);
  return refs.map((r) => {
    const stamped = roles[r.slot - 1] ?? "";
    if (!known(stamped) || r.role === stamped) return r;
    if (!known(r.role)) return { ...r, role: stamped };
    return emptyReading(r.slot, stamped);
  });
}

/**
 * The ART STYLE reference of a card, or null when the Style Card governs the look (user decision 2026-10-01):
 * - stamped roles (cards.reference_roles): the slot stamped 'art_style' - it must hold a reference path when
 *   reference_paths is given. Its values come from the per-slot reading of THAT slot when it was read as art_style (or
 *   without a known role); otherwise - a flat analysis_prompt v2 analysis (it describes IMAGE 1 only, live card
 *   72354a02), no reading of that slot, or a reading made for another job before staff changed the roles - the override
 *   still applies, value-less: an empty art_style reading, rendered as "match Image k itself" (hasLook false), with an
 *   empty look in effective_style.
 * - no stamped roles: the per-slot reading with role 'art_style' (values when it has them, else value-less).
 * Style-test cards are filtered by the caller (resolveArtReference).
 */
export function findArtReference(references: SlotReading[] | null | undefined, reference_roles?: unknown, reference_paths?: unknown): SlotReading | null {
  const hasPath = (slot: number) => !Array.isArray(reference_paths) || s(reference_paths[slot - 1]) !== "";
  const roles = stampedRoles(reference_roles);
  if (roles) {
    const k = roles.indexOf("art_style");
    if (k < 0 || !hasPath(k + 1)) return null;
    const at = (alignReadings(references, roles) ?? []).find((r) => r.slot === k + 1);
    return at && at.role === "art_style" ? at : emptyReading(k + 1, "art_style");
  }
  const hit = (Array.isArray(references) ? references : []).find((r) => r.role === "art_style");
  return hit && hasPath(hit.slot) ? hit : null;
}

/** The card-level decision index.ts and buildMagicPrompt share: style-test cards never, else findArtReference. */
export function resolveArtReference(opts: {
  source?: unknown;
  client_submission?: unknown;
  reference_analysis?: ReferenceAnalysis | null;
  reference_roles?: unknown;
  reference_paths?: unknown;
}): SlotReading | null {
  if (isStyleTestCard(opts.source, opts.client_submission)) return null;
  return findArtReference(readReference(opts.reference_analysis).references, opts.reference_roles, opts.reference_paths);
}

/** client_look library images are attached at tier >= 3 unless an Art style reference governs the look (nothing competes). */
export function attachesClientLook(tier: number, art: SlotReading | null): boolean {
  return clampTier(tier) >= 3 && !art;
}

/**
 * 1-based plan position of the art-style image: the plan entry roled art_style, else (role-less plan, legacy cards read
 * with v3) the card reference at the reading's slot. null when it is not attached (edit kinds attach the previous version).
 */
export function artImageNumber(plan: InputPath[], art: SlotReading | null): number | null {
  if (!art) return null;
  const k = plan.findIndex((p) => p.slot_role === "art_style");
  if (k >= 0) return k + 1;
  const i = art.slot - 1;
  const p = plan[i];
  if (p && p.bucket === "refs" && p.role === "style_reference" && !p.slot_role) return i + 1;
  return null;
}

/**
 * magic_prompt_json.effective_style (see the EffectiveStyle contract). art null -> the Style Card look, pruned the way
 * WF-2 prunes STYLE_CARD_JSON (palette resolved for the garment side as the Palette line renders it).
 */
export function effectiveStyle(opts: {
  card: StyleCard | null | undefined;
  garment_color?: string;
  art: SlotReading | null;
  reference_slot?: number | null;
}): EffectiveStyle {
  const card = lintStyleCard(opts.card);
  const rules = isObj(card.rules) ? { ...card.rules } : {};
  const palette_mode: "strict" | "flexible" = rules.palette_mode === "flexible" ? "flexible" : "strict";
  const forbid = list(card.forbid).map(clean).filter(Boolean);
  const composition = s(card.composition);
  const typography = isObj(card.typography) ? JSON.parse(JSON.stringify(card.typography)) as Record<string, unknown> : {};
  const entry = (p: PaletteEntry): EffectivePaletteEntry => {
    const e: EffectivePaletteEntry = { name: clean(p.name), hex: s(p.hex).toUpperCase() };
    if (clean(p.role)) e.role = clean(p.role).toLowerCase();
    if (clean(p.weight)) e.weight = clean(p.weight).toLowerCase();
    return e;
  };
  const art = opts.art;
  if (art) {
    return {
      source: "art_reference",
      reference_slot: opts.reference_slot ?? art.slot,
      medium: s(art.medium),
      realism: s(art.realism),
      linework: { weight: s(art.line_weight), style: s(art.line_style), outline: "" },
      shading: s(art.shading),
      shading_method: s(art.shading),
      texture: s(art.texture),
      edge_finish: s(art.edge_finish),
      palette: (art.palette_entries ?? paletteFromText(art.palette)).map((p) => entry(p)).filter((p) => p.hex || p.name),
      palette_mode,
      forbid,
      composition,
      typography,
      rules,
    };
  }
  const lw = isObj(card.linework) ? card.linework : {};
  return {
    source: "style_card",
    reference_slot: null,
    medium: s(card.medium),
    realism: s(card.realism),
    linework: { weight: s(lw.weight), style: s(lw.style), outline: s(lw.outline) },
    shading: s(card.shading),
    shading_method: s(card.shading_method),
    texture: s(card.texture),
    edge_finish: s(card.edge_finish),
    palette: cardPalette(card, opts.garment_color).map((p) => entry(p)).filter((p) => p.hex),
    palette_mode,
    forbid,
    composition,
    typography,
    rules,
  };
}

/**
 * "#F2E8D5", "f2e8d5", "#fed" -> "#F2E8D5" / "#FFEEDD"; anything else -> "". A bare 6-character token needs a digit
 * ("F2E8D5" yes, the word "facade" no).
 */
export function normHex(v: unknown): string {
  const t = s(v);
  let m = t.match(/^#?([0-9a-f]{6})$/i);
  if (m && (t.startsWith("#") || /\d/.test(m[1]))) return "#" + m[1].toUpperCase();
  m = t.match(/^#([0-9a-f]{3})$/i);
  if (m) return "#" + Array.from(m[1]).map((c) => c + c).join("").toUpperCase();
  return "";
}

/**
 * "cream #F2E8D5, rust b5482a; #FED" (a string palette, or a reading stored before palette_entries existed) -> entries,
 * hex normalised (normHex). Parts without a hex are skipped.
 */
function paletteFromText(text: unknown): PaletteEntry[] {
  const out: PaletteEntry[] = [];
  for (const part of s(text).split(/,|;/)) {
    const m = part.match(/^(.*?)\s*(#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|\b(?=[0-9a-f]*\d)[0-9a-f]{6}\b)/i);
    const hex = m ? normHex(m[2]) : "";
    if (m && hex) out.push({ name: m[1].replace(/[\s:(\-–]+$/g, "").trim(), hex });
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
  /** ordered attachment plan (card references with their slot roles, then client_look images - none when an Art
   *  style reference governs; index.ts decides that with attachesClientLook) */
  plan: InputPath[];
  reference_analysis: ReferenceAnalysis | null | undefined;
  /** cards.reference_roles: the stamped job of each slot (decides the art slot and aligns the per-slot readings);
   *  null/absent on role-less cards */
  reference_roles?: unknown;
  /** cards.reference_paths: a stamped art_style slot needs a reference path (absent = not checked) */
  reference_paths?: unknown;
  /** cards.source and cards.client_submission: a style-test card never takes the art-style override */
  card_source?: unknown;
  client_submission?: unknown;
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

/**
 * The reference reading a fresh build (and a regenerate, from the card's current analysis) renders: readReference, the
 * per-slot readings aligned to the stamped roles (alignReadings), the art slot's reading added when that slot has none
 * (so the REFERENCES block never says "Not attached: ART STYLE" next to an attached art image), reference text that IS
 * the requested print text dropped, and the per-image labels.
 */
export function cardReading(opts: {
  reference_analysis: ReferenceAnalysis | null | undefined;
  reference_roles?: unknown;
  print_text: TextLine[];
  plan: InputPath[];
  art: SlotReading | null;
  art_image: number | null;
}): ReferenceReading {
  // Reference text that IS the requested print text (clients often send a mockup of the design they want) must not be
  // listed under "never reproduce it" - that contradicts the exact-text block. Match ignoring case, spacing, punctuation.
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const wanted = new Set((opts.print_text ?? []).map((l) => norm(s(l?.text))).filter(Boolean));
  const reading = readReference(opts.reference_analysis);
  reading.text_detected = reading.text_detected.filter((t) => !wanted.has(norm(t)));
  if (reading.references) {
    const refs = alignReadings(reading.references, opts.reference_roles) ?? [];
    const art = opts.art;
    if (art && !refs.some((r) => r.slot === art.slot)) refs.push(art);
    refs.sort((a, b) => a.slot - b.slot);
    reading.references = refs.map((ref) => ({ ...ref, text_detected: ref.text_detected.filter((t) => !wanted.has(norm(t))) }));
  }
  return { ...reading, image_roles: imageRoleLabels(opts.plan, { art_image: opts.art_image }) };
}

export function buildMagicPrompt(input: BuildInput): MagicPrompt {
  const tier = clampTier(input.tier);
  const fixed = lintStyleCard(input.style_card);
  const art = resolveArtReference({
    source: input.card_source, client_submission: input.client_submission,
    reference_analysis: input.reference_analysis, reference_roles: input.reference_roles, reference_paths: input.reference_paths,
  });
  const artImage = artImageNumber(input.plan, art);
  const sc = renderStyleCard(fixed, { garment_color: input.garment_color, status: input.style_card_status, version: input.style_card_version, art_reference: !!art });
  const printText = (Array.isArray(input.print_text) ? input.print_text : [])
    .map((l) => ({ role: s(l?.role) || "text", text: s(l?.text) }))
    .filter((l) => l.text);
  const reading = cardReading({ reference_analysis: input.reference_analysis, reference_roles: input.reference_roles, print_text: printText, plan: input.plan, art, art_image: artImage });
  return {
    print_rules: s(input.print_rules),
    style_card: { version: input.style_card_version, status: sc.status, lines: sc.lines, negatives: sc.negatives, prose: sc.prose, rules: sc.rules },
    lessons: list(input.lessons),
    exemplars: list(input.exemplars),
    reference_reading: reading,
    similarity_tier: { tier, rule: pickTierRule(input.tier_rules_body, tier, { niche: input.niche }) },
    subject: resolveSubject({ explicit: input.explicit_subject, tier, references: reading.references, card_subjects: fixed.subjects }),
    brief: { description: s(input.description), garment_color: s(input.garment_color), placement: s(input.placement), avoid_notes: s(input.avoid_notes) },
    text: { rule: s(input.text_rules_body), typography: styleCardTypography(fixed, input.plan), lines: printText },
    effective_style: effectiveStyle({ card: fixed, garment_color: input.garment_color, art, reference_slot: artImage }),
  };
}

// ---------------------------------------------------------------------------
// Reference blocks

function slotFace(f: { family: string; weight: string; effects: string[] }): string {
  const core = [s(f.family), s(f.weight)].filter(Boolean).join(" ");
  if (!core) return "";
  return core + (f.effects.length ? " (" + f.effects.join(", ") + ")" : "");
}

function renderSlotReferences(r: ReferenceReading, tier: number, typographyLocked: boolean, artGoverns: boolean): string {
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
    } else if (ref.role === "art_style" && artGoverns) {
      present.add("art_style");
      lines.push("- Image " + n + ", ART STYLE - the look of this design: drawn as the ART STYLE block above describes (medium, linework, shading, texture and colours of this image); never its subject, layout or words.");
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

/**
 * The legacy flat block (a flat analysis_prompt v2 reading, or edit mode). artGoverns (art-style override): the flat
 * 'Art style' and 'Reference palette' lines are left out - the ART STYLE block carries the look, and the flat keys
 * describe IMAGE 1, not the art image. artImage 1 (not in edit mode): IMAGE 1 IS the art image, so the flat subject /
 * composition / typography lines describe the art image's subject too and are left out ("never its subject").
 */
function renderFlatReference(r: ReferenceReading, tier: number, isEdit: boolean, artGoverns = false, artImage: number | null = null): string {
  const lines = [isEdit
    ? "PREVIOUS VERSION DESCRIPTION (this is the image being edited - use it to name elements precisely; keep everything not mentioned in the edit request identical):"
    : "REFERENCE DESIGN DESCRIPTION (apply the similarity policy to decide how closely to copy it):"];
  const full = isEdit || tier >= 4;
  const describesArtImage = artGoverns && !isEdit && artImage === 1;
  if (r.art_style && !artGoverns) lines.push("Art style: " + r.art_style);
  if (r.palette && !artGoverns) {
    lines.push((full ? "Reference palette (governs this re-creation, inside the Style Card family): " : "Reference palette (mood only - the Style Card palette governs): ") + r.palette);
  }
  if (describesArtImage) {
    // nothing from the flat description: it reads the ART STYLE image, whose subject, layout and words are never taken
  } else if (full) {
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

/**
 * ART STYLE block (art-style override): the reference look, one line per key in Style Card order, then the palette rule -
 * the client's strictness (rules.palette_mode) applied to the reference colours. image = the plan position of the
 * art-style image (null in edit mode, where only the previous version is attached).
 */
export function renderArtStyleBlock(es: EffectiveStyle, image: number | null, flexible: boolean, edit = false): string {
  const where = image ? "Image " + image : "";
  const lines = ["ART STYLE (from the Art style reference" + (where ? ", " + where : "") + ") - this design is drawn in this look:"];
  const push = (label: string, value: string) => { if (value) lines.push("- " + label + ": " + value); };
  const lw0 = isObj(es.linework) ? es.linework : { weight: "", style: "", outline: "" };
  const valued = [es.medium, es.realism, es.edge_finish, lw0.weight, lw0.style, lw0.outline, es.shading, es.shading_method, es.texture].some((v) => clean(v) !== "");
  const source = where || (edit ? "the previous version (drawn in the Art style reference look)" : "the Art style reference");
  if (!valued) {
    // value-less override (no per-slot reading of the art image): the image itself is the look
    lines.push("- Medium, rendering, linework, shading, texture and edges: exactly as in " + source + (where ? " - never its subject, layout or words." : ""));
  }
  push("Medium", clean(es.medium));
  {
    const realism = clean(es.realism).toLowerCase();
    const edges = clean(es.edge_finish).toLowerCase();
    push("Rendering", [realism ? realism + " realism" : "", edges ? edges + " edges" : ""].filter(Boolean).join("; "));
  }
  {
    const lw = isObj(es.linework) ? es.linework : { weight: "", style: "", outline: "" };
    const weight = clean(lw.weight).toLowerCase();
    const style = clean(lw.style);
    const outline = clean(lw.outline).toLowerCase();
    const head = [weight ? weight + " weight" : "", style].filter(Boolean).join(", ");
    push("Linework", [head, outline && outline !== "none" ? outline + " outline" : ""].filter(Boolean).join("; "));
  }
  {
    const method = clean(es.shading_method).toLowerCase();
    const shading = clean(es.shading);
    push("Shading", method && shading && method !== shading.toLowerCase() ? method + " - " + shading : (shading || method));
  }
  push("Texture", clean(es.texture));
  {
    const entries = (Array.isArray(es.palette) ? es.palette : []).map((p) => paletteLabel(p as PaletteEntry)).filter(Boolean);
    const whose = where ? "the colours of " + where : edit ? "the colours of the previous version" : "the colours of the Art style reference";
    if (entries.length) {
      lines.push("- " + (flexible
        ? "Palette (FLEXIBLE - lead with these colours of the Art style reference; small natural accents in other hues are allowed): "
        : "Palette (STRICT - use ONLY these colours of the Art style reference plus the flat grey background, no other hue): ") + entries.join("; "));
    } else {
      lines.push("- Palette (" + (flexible ? "FLEXIBLE - lead with " + whose : "STRICT - use ONLY " + whose + " plus the flat grey background, no other hue") + ")");
    }
  }
  if (where && valued) lines.push("- Anything these lines do not cover: match the look of " + where + " itself - never its subject, layout or words.");
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
  // art-style override: only a v8 prompt that carries effective_style 'art_reference' (and Style Card lines) takes it
  const es = magic.effective_style;
  const artGoverns = es?.source === "art_reference" && Array.isArray(magic.style_card.lines) && magic.style_card.lines.length > 0;

  // 1 print rules + PRECEDENCE (exactly once, rendered here so pre-v8 prompts get it too)
  blocks.push([s(magic.print_rules), artGoverns ? PRECEDENCE_LINE_ART : PRECEDENCE_LINE].filter(Boolean).join("\n"));

  // 2a ART STYLE (art-style override): the reference look replaces the Style Card look lines
  if (artGoverns && es) blocks.push(renderArtStyleBlock(es, isEdit ? null : es.reference_slot, es.palette_mode === "flexible", isEdit));

  // 2 style card: header with version + row status, then one line per key (or the pre-v8 prose, R3)
  {
    const v = magic.style_card.version;
    const status = s(magic.style_card.status) || "locked";
    const head = "CLIENT STYLE CARD" + (v ? " v" + v : "") + " (" + status + ")" + (artGoverns ? STYLE_CARD_HEADER_TAIL_ART : STYLE_CARD_HEADER_TAIL);
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
    blocks.push(perSlot ? renderSlotReferences(r, tier, typographyLocked, artGoverns) : renderFlatReference(r, tier, isEdit, artGoverns, es?.reference_slot ?? null));
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
      "- Draw this subject in the " + (artGoverns ? "ART STYLE look above" : "Style Card look") + ". The on-design text below is LETTERING ONLY: it never chooses, adds or changes the subject, even when the words name an animal, an object or a place.",
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
