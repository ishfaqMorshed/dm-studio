// DM Studio · prompt-engine · pure rendering module (no I/O, no Deno APIs).
// Contract: docs/generation-spec.md §3 "prompt-engine"; wording from docs/tshirt-engine/EXTRACT.md (verbatim).
// Everything here is deterministic so render_test.ts can pin golden output.

export type PaletteEntry = { name?: string; hex?: string; weight?: string };

export type StyleCard = {
  medium?: string;
  linework?: { weight?: string; style?: string };
  shading?: string;
  texture?: string;
  palette?: PaletteEntry[];
  composition?: string;
  typography?: { vibe?: string; placement?: string; case?: string };
  background?: string;
  mood?: string[];
  subjects?: string[];
  forbid?: string[];
  signature_moves?: string[];
  garment_colors?: string[];
  [k: string]: unknown;
};

export type TextLine = { role?: string; text: string };

export type ReferenceAnalysis = {
  art_style?: string;
  palette?: Array<{ name?: string; hex?: string }> | string;
  subject_structure?: string;
  typography_transcription?: string;
  text_detected?: string[];
  composition?: string;
  notes?: string;
  [k: string]: unknown;
};

export type InputRole = "style_reference" | "client_look" | "previous_version" | "mask";
export type InputPath = { bucket: "refs" | "gens"; path: string; role: InputRole };

export type EditKind = "edit_text" | "edit_region" | "regenerate";

/** Thrown by applyEdit when the requested edit cannot be applied to the base prompt (index.ts maps it to HTTP 422). */
export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditError";
  }
}

export type MagicPrompt = {
  // keys in generation-spec §3 order
  print_rules: string;
  style_card: { version: number | null; prose: string; negatives: string[] };
  lessons: string[];
  exemplars: string[];
  reference_reading: {
    art_style: string;
    palette: string;
    subject_structure: string;
    typography_transcription: string;
    text_detected: string[];
    composition: string;
    notes: string;
    image_roles: string[];
  };
  similarity_tier: { tier: number; rule: string };
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

export const IMAGE_ROLE_STYLE = "style/subject references for this design";
export const IMAGE_ROLE_LOOK = "examples of the client's established look - match the look, never copy a subject";
export const IMAGE_ROLE_PREVIOUS = "the finished previous version of this exact design - edit it in place";
export const IMAGE_ROLE_MASK = "a mask marking the ONLY region that may change";

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

// ---------------------------------------------------------------------------
// small helpers

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v)).trim();
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);

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

// ---------------------------------------------------------------------------
// Template resolvers (templates are lead-editable rows; accept JSON or plain text shapes)

/** tier_rules template → text for one tier. JSON {"1":..,"5":..} / array / "N: text" lines / whole body. */
export function pickTierRule(body: string, tier: number): string {
  const t = clampTier(tier);
  const pct = TIER_PERCENT[t];
  const fill = (x: string) => x.replace(/\{\{\s*n\s*\}\}/gi, String(pct)).replace(/\{\{\s*tier\s*\}\}/gi, String(t)).trim();
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
// Style Card → prose + negatives

export function renderStyleCard(card: StyleCard): { prose: string; negatives: string[] } {
  const parts: string[] = [];
  if (s(card.medium)) parts.push("Medium: " + s(card.medium) + ".");
  const lw = [s(card.linework?.weight), s(card.linework?.style)].filter(Boolean).join(", ");
  if (lw) parts.push("Linework: " + lw + ".");
  if (s(card.shading)) parts.push("Shading: " + s(card.shading) + ".");
  if (s(card.texture)) parts.push("Texture: " + s(card.texture) + ".");
  const pal = (Array.isArray(card.palette) ? card.palette : [])
    .map((p) => {
      const name = s(p?.name), hex = s(p?.hex), w = s(p?.weight);
      const label = [name, hex].filter(Boolean).join(" ");
      return label ? (w ? label + " (" + w + ")" : label) : "";
    })
    .filter(Boolean);
  if (pal.length) parts.push("Palette - use ONLY these colours: " + pal.join(", ") + ".");
  if (s(card.composition)) parts.push("Composition: " + s(card.composition) + ".");
  const ty = [
    s(card.typography?.vibe),
    s(card.typography?.placement) ? "placed " + s(card.typography?.placement) : "",
    s(card.typography?.case) ? s(card.typography?.case) + " case" : "",
  ].filter(Boolean).join(", ");
  if (ty) parts.push("Typography: " + ty + ".");
  if (s(card.background)) parts.push("Background: " + s(card.background) + ".");
  const mood = list(card.mood);
  if (mood.length) parts.push("Mood: " + mood.join(", ") + ".");
  const subj = list(card.subjects);
  if (subj.length) parts.push("Typical subject matter: " + subj.join(", ") + ".");
  const moves = list(card.signature_moves);
  if (moves.length) parts.push("Signature moves (what makes this client recognisable): " + moves.join("; ") + ".");
  const gc = list(card.garment_colors);
  if (gc.length) parts.push("Printed on " + gc.join(" / ") + " garments.");
  return { prose: parts.join(" "), negatives: list(card.forbid) };
}

export function styleCardTypography(card: StyleCard): string {
  return [s(card.typography?.vibe), s(card.typography?.placement), s(card.typography?.case)].filter(Boolean).join(", ");
}

// ---------------------------------------------------------------------------
// Reference analysis → reading

export function readReference(a: ReferenceAnalysis | null | undefined): Omit<MagicPrompt["reference_reading"], "image_roles"> {
  const r = a ?? {};
  let palette = "";
  if (Array.isArray(r.palette)) {
    palette = r.palette.map((p) => [s(p?.name), s(p?.hex)].filter(Boolean).join(" ")).filter(Boolean).join(", ");
  } else palette = s(r.palette);
  return {
    art_style: s(r.art_style),
    palette,
    subject_structure: s(r.subject_structure),
    typography_transcription: s(r.typography_transcription),
    text_detected: list(r.text_detected),
    composition: s(r.composition),
    notes: s(r.notes),
  };
}

/** Per-image role labels for the prompt, from the ordered input plan. */
export function imageRoleLabels(plan: InputPath[]): string[] {
  const out: string[] = [];
  const span = (from: number, to: number) => (from === to ? "Image " + from : "Image " + from + "-" + to);
  let i = 0;
  while (i < plan.length) {
    const role = plan[i].role;
    let j = i;
    while (j + 1 < plan.length && plan[j + 1].role === role) j++;
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

  if (kind === "edit_text") {
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
// The deterministic renderer

export function renderPrompt(magic: MagicPrompt): string {
  const blocks: string[] = [];
  const isEdit = magic.edit?.kind === "edit_text" || magic.edit?.kind === "edit_region";

  // 1 print rules
  if (s(magic.print_rules)) blocks.push(s(magic.print_rules));

  // 2 style card
  {
    const v = magic.style_card.version;
    const head = "CLIENT STYLE CARD" + (v ? " (locked v" + v + ")" : "") + " - every design for this client must read as this look:";
    const lines = [head];
    if (s(magic.style_card.prose)) lines.push(s(magic.style_card.prose));
    const neg = list(magic.style_card.negatives);
    if (neg.length) lines.push("NEGATIVE - never include: " + neg.join(", ") + ".");
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

  // 5 reference reading
  {
    const r = magic.reference_reading;
    const lines = [isEdit
      ? "PREVIOUS VERSION DESCRIPTION (this is the image being edited - use it to name elements precisely; keep everything not mentioned in the edit request identical):"
      : "REFERENCE DESIGN DESCRIPTION (apply the similarity policy to decide how closely to copy it):"];
    if (r.art_style) lines.push("Art style: " + r.art_style);
    if (r.palette) lines.push("Palette: " + r.palette);
    if (r.subject_structure) lines.push("Subject structure: " + r.subject_structure);
    if (r.composition) lines.push("Composition: " + r.composition);
    if (r.typography_transcription) lines.push("Typography in the reference (style only - the on-design text is defined below): " + r.typography_transcription);
    if (r.text_detected.length) lines.push("Text seen in the reference (do NOT reproduce it): " + r.text_detected.map((t) => JSON.stringify(t)).join(", "));
    if (r.notes) lines.push("Notes: " + r.notes);
    if (r.image_roles.length) lines.push(r.image_roles.join("; ") + ".");
    blocks.push(lines.join("\n"));
  }

  // 6 similarity tier
  blocks.push(
    (isEdit ? "PRIMARY RULE - TARGETED EDIT:" : "PRIMARY RULE - SIMILARITY POLICY (tier " + magic.similarity_tier.tier + "/5):") +
      "\n- " + s(magic.similarity_tier.rule) +
      (isEdit ? "" : "\n- The reference may be a rough draft, a shirt mockup, angled, folded, or a screenshot - work from the flat design artwork only, straightened and cleaned up."),
  );

  // 7 brief
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
      out.push(
        "QUOTE / ON-DESIGN TEXT (render EXACTLY these " + (lines.length === 1 ? "words" : lines.length + " lines") +
          ", each exactly once, and NO other text" + (typo ? ", in the Style Card typography: " + typo : "") + "):",
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
