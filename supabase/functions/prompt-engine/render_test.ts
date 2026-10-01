// Golden tests for the deterministic renderer (prompt-engine v8).
// Run: npm run test:functions (Node shim, spec 3.4)   or   deno test --allow-read supabase/functions/prompt-engine/
// No jsr imports on purpose so the same file runs under `node --experimental-strip-types` with globalThis.Deno = {test}.
// Fixtures: fixtures/chicken_v2.json (live style_card_snapshot of generation 006b5ba1 + its card/client rows),
// fixtures/e2e_v4.json (live E2E v4 locked card + its studio_20 test card), fixtures/templates_v1.json (live active v1
// template rows); the v2 template bodies are read from the studio_21 migration text so the assertions pin the real SQL.
import { readFile } from "node:fs/promises";
import {
  applyEdit,
  buildMagicPrompt,
  type BuildInput,
  DEFAULT_NICHE,
  EditError,
  findUnresolvedToken,
  imageRoleLabels,
  type InputPath,
  type MagicPrompt,
  pickAspect,
  pickTierRule,
  PRECEDENCE_LINE,
  type ReferenceAnalysis,
  renderPrompt,
  renderStyleCard,
  resolveSubject,
  spellOut,
  styleCardTypography,
  summarizeExemplars,
  TARGETED_EDIT_RULE,
  UNRESOLVED_TOKEN_RE,
} from "./render.ts";
import chickenV2 from "./fixtures/chicken_v2.json" with { type: "json" };
import e2eV4 from "./fixtures/e2e_v4.json" with { type: "json" };
import templatesV1 from "./fixtures/templates_v1.json" with { type: "json" };

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error("Assertion failed: " + msg);
}
function assertEquals<T>(a: T, b: T, msg?: string): void {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((msg ? msg + ": " : "") + "expected " + jb + " got " + ja);
}
function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}
function linesWith(out: string, re: RegExp): string[] {
  return out.split("\n").filter((l) => re.test(l));
}

// ---------------------------------------------------------------------------
// Template bodies: live v1 rows (fixture) and the studio_21 v2 rows (from the migration text)

const MIGRATION_URL = new URL("../../migrations/20260930_studio_21_style_card_v2.sql", import.meta.url);
const migration = await readFile(MIGRATION_URL, "utf8");
function dollarQuoted(tag: string): string {
  const re = new RegExp("\\$" + tag + "\\$([\\s\\S]*?)\\$" + tag + "\\$");
  const m = migration.match(re);
  if (!m) throw new Error("migration lacks $" + tag + "$ body");
  return m[1];
}
const V2 = {
  tier_rules: dollarQuoted("tiers"),
  text_rules: dollarQuoted("textrules"),
  background_rule: dollarQuoted("bg"),
  defects: dollarQuoted("defects"),
};
const V1 = {
  tier_rules: templatesV1.tier_rules.body,
  text_rules: templatesV1.text_rules.body,
  background_rule: templatesV1.background_rule.body,
  defects: templatesV1.defects.body,
};
type TemplateSet = typeof V1;

// ---------------------------------------------------------------------------
// Fixture -> BuildInput, mirroring what index.ts loads (no I/O here)

type LiveFixture = typeof chickenV2 | typeof e2eV4;
type SlotRoleName = "subject" | "art_style" | "typography";

function planFor(paths: string[], roles: (SlotRoleName | null)[] | null, look: string[] = []): InputPath[] {
  const plan: InputPath[] = paths.map((p, i) => {
    const r = roles ? roles[i] : null;
    if (r === "subject") return { bucket: "refs", path: p, role: "subject_reference", slot_role: "subject" };
    if (r === "typography") return { bucket: "refs", path: p, role: "typography_reference", slot_role: "typography" };
    if (r === "art_style") return { bucket: "refs", path: p, role: "style_reference", slot_role: "art_style" };
    return { bucket: "refs", path: p, role: "style_reference" };
  });
  for (const p of look) plan.push({ bucket: "refs", path: p, role: "client_look" });
  return plan;
}

function inputFrom(fx: LiveFixture, tpl: TemplateSet, over: Partial<BuildInput> & { roles?: (SlotRoleName | null)[] | null; look?: string[] } = {}): BuildInput {
  const card = fx.card;
  const tier = over.tier ?? card.similarity_tier;
  const { roles, look, ...rest } = over;
  return {
    print_rules: tpl.background_rule.trim() + "\n\n" + tpl.defects.trim(),
    tier_rules_body: tpl.tier_rules,
    text_rules_body: tpl.text_rules.trim(),
    style_card: fx.style_card_snapshot as unknown as BuildInput["style_card"],
    style_card_version: fx.style_card_version,
    style_card_status: fx.style_card_status,
    tier,
    plan: planFor(card.reference_paths, roles ?? null, look ?? (tier >= 3 ? ["lib/a.png", "lib/b.png", "lib/c.png"] : [])),
    reference_analysis: card.reference_analysis as ReferenceAnalysis,
    print_text: card.print_text,
    explicit_subject: (card.client_submission as { subject?: string }).subject ?? "",
    niche: String((fx.client.style_brief as { niche?: string }).niche ?? ""),
    description: card.brief_text,
    garment_color: card.garment_color,
    placement: card.placement,
    avoid_notes: card.avoid_notes ?? "",
    lessons: [],
    exemplars: [],
    ...rest,
  };
}

const chickenGolden = renderPrompt(buildMagicPrompt(inputFrom(chickenV2, V2)));
const e2eGolden = renderPrompt(buildMagicPrompt(inputFrom(e2eV4, V2)));

// ---------------------------------------------------------------------------
// The original fixture (kept from v7 so the pre-v8 behaviours stay pinned)

const styleCardJson = {
  medium: "flat screen-print",
  linework: { weight: "bold", style: "hand-inked" },
  shading: "halftone",
  texture: "subtle grain on fills only",
  palette: [
    { name: "ink", hex: "#1C1B1A", weight: "dominant" },
    { name: "cream", hex: "#F2E8D5", weight: "secondary" },
  ],
  composition: "centered badge",
  typography: { vibe: "condensed vintage sans", placement: "arched over the hero", case: "upper" },
  background: "flat mid-grey #808080, isolated artwork",
  mood: ["rugged", "warm"],
  subjects: ["bears", "mountains"],
  forbid: ["gradients", "drop shadows"],
  signature_moves: ["thick outer keyline"],
  garment_colors: ["black"],
};

function fixture(): MagicPrompt {
  const sc = renderStyleCard(styleCardJson, { version: 2, status: "locked", garment_color: "black" });
  return {
    print_rules: "PRINT RULES (fixture): flat grey background, no shadows.",
    style_card: { version: 2, status: sc.status, lines: sc.lines, negatives: sc.negatives, prose: sc.prose, rules: sc.rules },
    lessons: ["Never let grunge eat into letterforms."],
    exemplars: ["Description: Vintage bear badge for a hiking brand TEXT: \"TAKE THE LONG WAY\""],
    reference_reading: {
      art_style: "vintage badge illustration",
      palette: "black #000000, cream #F2E8D5",
      subject_structure: "bear head inside a circular badge",
      typography_transcription: "arched condensed sans",
      text_detected: ["WILD"],
      composition: "centered",
      notes: "",
      image_roles: imageRoleLabels([
        { bucket: "refs", path: "c/k/1.png", role: "style_reference" },
        { bucket: "refs", path: "c/k/2.png", role: "style_reference" },
        { bucket: "refs", path: "c/library/a.png", role: "client_look" },
      ]),
    },
    similarity_tier: { tier: 4, rule: "FAITHFUL RE-CREATION (~85%): reproduce the reference closely." },
    subject: { text: "a bear", source: "brief", pool: ["bears", "mountains"] },
    brief: { description: "Vintage bear badge for a hiking brand", garment_color: "black", placement: "front_chest", avoid_notes: "no skulls" },
    text: {
      rule: "TEXT - EXACT, NOTHING ELSE:\n- Render EXACTLY the QUOTE / ON-DESIGN TEXT provided, character for character, spelled exactly.",
      typography: "the Style Card Typography line above",
      lines: [{ role: "headline", text: "QA ROUND TWO" }],
    },
  };
}

Deno.test("exact text appears exactly once (quoted) and is spelled out", () => {
  const out = renderPrompt(fixture());
  assertEquals(count(out, '"QA ROUND TWO"'), 1, "quoted exact text once");
  assertEquals(count(out, "QA ROUND TWO"), 1, "raw exact text once");
  assert(out.includes(spellOut("QA ROUND TWO")), "letter-by-letter spelling present");
  assertEquals(spellOut("QA ROUND TWO"), "Q A   R O U N D   T W O");
});

Deno.test("style card hex and medium are present", () => {
  const out = renderPrompt(fixture());
  assert(out.includes("#1C1B1A"), "dominant hex present");
  assert(out.includes("#F2E8D5"), "secondary hex present");
  assert(out.includes("flat screen-print"), "medium present");
  assert(out.includes("CLIENT STYLE CARD v2 (locked) - the LOOK of every design for this client"), "style card version + status shown in the v8 header");
});

Deno.test("forbid tokens land in the NEGATIVE line", () => {
  const out = renderPrompt(fixture());
  const neg = out.split("\n").find((l) => l.startsWith("- NEGATIVE - never:"));
  assert(neg, "NEGATIVE line exists");
  assert(neg!.includes("gradients") && neg!.includes("drop shadows"), "both forbid tokens in the negative line");
  assert(neg!.endsWith("never shadows, halos, gradients, a garment, a mockup or a photo"), "fixed tail last");
  assertEquals(count(out, "NEGATIVE - never:"), 1, "negative line once");
});

Deno.test("no text lines -> 'no text anywhere' line, no QUOTE block", () => {
  const m = fixture();
  m.text.lines = [];
  const out = renderPrompt(m);
  assert(out.includes("no text anywhere"), "no text anywhere line present");
  assert(!out.includes("QUOTE / ON-DESIGN TEXT"), "no quote block");
});

Deno.test("section order follows the spec (print rules -> style card -> lessons -> exemplars -> reference -> tier -> SUBJECT -> brief -> text)", () => {
  const out = renderPrompt(fixture());
  const idx = [
    "PRINT RULES (fixture)",
    "CLIENT STYLE CARD",
    "LEARNED CLIENT PREFERENCES",
    "APPROVED EXEMPLARS",
    "REFERENCE DESIGN DESCRIPTION",
    "PRIMARY RULE - SIMILARITY POLICY (tier 4/5)",
    "\nSUBJECT (",
    "\nBRIEF:\n",
    "QUOTE / ON-DESIGN TEXT",
  ].map((k) => out.indexOf(k));
  assert(idx.every((i) => i >= 0), "all sections present: " + JSON.stringify(idx));
  for (let i = 1; i < idx.length; i++) assert(idx[i] > idx[i - 1], "order at " + i);
  assert(out.includes("Image 1-2: style/subject references for this design; Image 3: examples of the client's established look"), "legacy image role labels kept for role-less runs");
});

Deno.test("renderer is deterministic", () => {
  assertEquals(renderPrompt(fixture()), renderPrompt(fixture()));
  assertEquals(chickenGolden, renderPrompt(buildMagicPrompt(inputFrom(chickenV2, V2))));
});

Deno.test("edit_text swaps the line, keeps the new text once, drops the old one", () => {
  const m = applyEdit(fixture(), "edit_text", { old_text: "QA ROUND TWO", new_text: "QA ROUND THREE" });
  const out = renderPrompt(m);
  assertEquals(count(out, '"QA ROUND THREE"'), 2, "new text: once in the exact-text block, once in the edit instruction");
  assertEquals(count(out, '"QA ROUND TWO"'), 1, "old text only named once, inside the change instruction");
  assert(out.includes("PRIMARY RULE - TARGETED EDIT:"), "targeted edit header");
  assert(out.includes(TARGETED_EDIT_RULE), "targeted edit rule");
  assert(out.includes("REGENERATION - TARGETED EDIT"), "regeneration block");
  assert(out.includes("PREVIOUS VERSION DESCRIPTION"), "previous version label");
});

Deno.test("regenerate keeps the tier and adds the match-the-reference block", () => {
  const m = applyEdit(fixture(), "regenerate", { instruction: "the bear must face left" });
  const out = renderPrompt(m);
  assert(out.includes("REGENERATION - MATCH THE REFERENCE BETTER"), "reference regen header");
  assert(out.includes('"the bear must face left"'), "instruction quoted");
  assert(out.includes("PRIMARY RULE - SIMILARITY POLICY (tier 4/5)"), "tier kept");
});

Deno.test("pickTierRule handles JSON maps, numbered lines and {{n}}", () => {
  const json = JSON.stringify({ "1": "loose {{n}}%", "3": "remix {{n}}%", "5": "exact {{n}}%" });
  assertEquals(pickTierRule(json, 3), "remix 65%");
  assertEquals(pickTierRule(json, 5), "exact 95%");
  const lines = "1: LOOSE INSPIRATION\n2: LOOSE INSPIRATION\n3: INSPIRED REMIX\n4: FAITHFUL RE-CREATION (~{{n}}%)\n5: NEAR-EXACT";
  assertEquals(pickTierRule(lines, 4), "FAITHFUL RE-CREATION (~85%)");
  assertEquals(pickTierRule(lines, 1), "LOOSE INSPIRATION");
  assertEquals(pickTierRule("single body for all tiers", 2), "single body for all tiers");
});

Deno.test("pickAspect uses the template, validates against Kie, defaults to 1:1", () => {
  assertEquals(pickAspect('{"front_chest":"1:1","mug":"3:2","back":"4:5"}', "mug"), "3:2");
  assertEquals(pickAspect('{"front_chest":"1:1"}', "sleeve"), "1:1");
  assertEquals(pickAspect("front_chest 1:1\nfull_front 4:5\nmug 3:2", "full_front"), "4:5");
  assertEquals(pickAspect('{"mug":"7:7"}', "mug"), "1:1", "invalid ratio falls back");
  assertEquals(pickAspect(undefined, "tote"), "4:5", "doc table when no template");
  assertEquals(pickAspect(undefined, ""), "1:1");
});

Deno.test("edit_text with no parent base: a fresh magic prompt is edited in place (swap + TARGETED EDIT + edit block)", () => {
  // index.ts falls into the fresh-build branch when neither the generation nor its parent carries magic_prompt_json;
  // it must still apply the edit to that fresh prompt instead of silently dropping it.
  const fresh = fixture();
  assert(!fresh.edit, "fixture has no edit block (fresh build)");
  const m = applyEdit(fresh, "edit_text", { old_text: "  qa round two ", new_text: "QA ROUND THREE", instruction: "make the bear face left" });
  const out = renderPrompt(m);
  assertEquals(m.text.lines.map((l) => l.text), ["QA ROUND THREE"], "old line replaced, nothing appended (whitespace/case-insensitive match)");
  assertEquals(count(out, "QA ROUND TWO"), 0, "old line gone from the exact-text block");
  assertEquals(count(out, '"QA ROUND THREE"'), 2, "new text once in the exact-text block, once in the edit instruction");
  assert(out.includes("PRIMARY RULE - TARGETED EDIT:") && out.includes(TARGETED_EDIT_RULE), "targeted edit rule applied");
  assert(out.includes('Change the text "qa round two" to exactly "QA ROUND THREE"'), "text swap instruction present");
  assert(out.includes("make the bear face left"), "edit instruction kept");
});

Deno.test("edit_text refuses an old_text that matches no line instead of appending a third line", () => {
  const m = fixture();
  m.text.lines = [{ role: "headline", text: "TAKE THE LONG WAY" }, { role: "sub", text: "EST 2019" }];
  let err: unknown = null;
  try { applyEdit(m, "edit_text", { old_text: "TAKE THE LONG WAYS", new_text: "TAKE THE SHORT WAY" }); } catch (e) { err = e; }
  assert(err instanceof EditError, "EditError thrown");
  assert(String((err as Error).message).includes("old_text not found in print_text"), "message names the cause");
  // an empty old_text is only accepted as "replace the single line"
  const single = fixture();
  const ok = applyEdit(single, "edit_text", { old_text: "", new_text: "NEW LINE" });
  assertEquals(ok.text.lines.map((l) => l.text), ["NEW LINE"]);
  let err2: unknown = null;
  try { applyEdit(m, "edit_text", { old_text: "", new_text: "NEW LINE" }); } catch (e) { err2 = e; }
  assert(err2 instanceof EditError, "empty old_text on a multi-line card is refused");
});

// ---------------------------------------------------------------------------
// 3.5 golden tests (v8) - live Chicken v2 draft snapshot (006b5ba1) and E2E v4

Deno.test("golden: chicken_v2 render equals fixtures/chicken_v2.expected.txt", async () => {
  const expected = await readFile(new URL("./fixtures/chicken_v2.expected.txt", import.meta.url), "utf8");
  if (expected.trim() !== chickenGolden.trim()) {
    const a = expected.trim().split("\n"), b = chickenGolden.trim().split("\n");
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    throw new Error("golden mismatch at line " + (i + 1) + "\n  expected: " + (a[i] ?? "<eof>") + "\n  actual:   " + (b[i] ?? "<eof>") +
      "\n(regenerate with: npm run test:functions -- prompt-engine after reviewing the diff, or update chicken_v2.expected.txt)");
  }
});

Deno.test("no double periods", () => {
  for (const [name, out] of [["chicken", chickenGolden], ["e2e", e2eGolden]]) {
    assert(!out.includes(".."), name + ": '..' found: " + linesWith(out, /\.\./).join(" | "));
  }
});

Deno.test("no rule tokens leak (as_typed, Locked:, brand text demands)", () => {
  assert(!/as[_ ]typed/i.test(chickenGolden), "as_typed leaked");
  assert(!/\bLocked(\s+composition)?:/i.test(chickenGolden), "'Locked:' leaked");
  assert(!/Omitting the bottom center/i.test(chickenGolden), "text-demand forbid leaked into NEGATIVE");
  const styleBlock = chickenGolden.split("\n\n").find((b) => b.startsWith("CLIENT STYLE CARD")) ?? "";
  assert(!/@/.test(styleBlock), "@handle leaked into the Style Card block (signature move should be removed by the lint): " + styleBlock);
  // The sentence 'with a social handle locked to the bottom margin' in typography.placement / composition is a checkStyleCard
  // ERROR (repair-call territory for WF-1b), not a fix: the render-time lint leaves it, so it is not asserted here.
  assert(!/highland cow\)/i.test(styleBlock) && styleBlock.includes("(the hero)"), "subject noun replaced by 'the hero' in composition");
  assert(!styleBlock.includes("Typical subject matter"), "subjects are not rendered in the Style Card block");
});

Deno.test("typography rendered once", () => {
  assertEquals(count(chickenGolden, "Typography ("), 1, "one Typography line");
  assertEquals(count(chickenGolden, "Vintage Western slab serifs"), 1, "the vibe appears once");
  assert(chickenGolden.includes("set in the Style Card Typography line above):"), "QUOTE header points at the Typography line");
  assert(!chickenGolden.includes("in the Style Card typography: "), "old inline typography repeat is gone");
});

Deno.test("SUBJECT block present and precedes the QUOTE block; QUOTE header says lettering only", () => {
  const subj = chickenGolden.indexOf("\nSUBJECT (the one hero of this design - it comes from here and nowhere else): Highland cows");
  const quote = chickenGolden.indexOf("QUOTE / ON-DESIGN TEXT");
  const brief = chickenGolden.indexOf("\nBRIEF:\n");
  assert(subj >= 0, "SUBJECT block present with the Style Card's first subject (no explicit subject on the Chicken test card)");
  assert(subj < brief && brief < quote, "SUBJECT precedes BRIEF precedes QUOTE");
  assert(chickenGolden.includes("- Source: the Style Card. Usual subject pool (supporting elements only): Highland cows, Highland calves"), "source + pool line");
  assert(chickenGolden.includes("QUOTE / ON-DESIGN TEXT (render EXACTLY these 2 lines, each exactly once, NO other text; lettering only - the words never change the SUBJECT above; set in the Style Card Typography line above):"), "QUOTE header wording");
  // E2E: explicit subject from client_submission (studio_20)
  assert(e2eGolden.includes("SUBJECT (the one hero of this design - it comes from here and nowhere else): mountain silhouettes"), "explicit subject wins");
  assert(e2eGolden.includes("- Source: the brief."), "explicit subject source = the brief");
});

Deno.test("no unresolved tokens (NICHE, {{ }}) with tier_rules v1 or v2, niche given or not", () => {
  const v1Chicken = renderPrompt(buildMagicPrompt(inputFrom(chickenV2, V1)));
  assert(!UNRESOLVED_TOKEN_RE.test(v1Chicken), "tier_rules v1 bare NICHE filled: " + linesWith(v1Chicken, /NICHE|\{\{/).join(" | "));
  assert(v1Chicken.includes("leaning more on the " + DEFAULT_NICHE + " for subject matter"), "empty style_brief -> default niche wording");
  assert(!UNRESOLVED_TOKEN_RE.test(chickenGolden) && !UNRESOLVED_TOKEN_RE.test(e2eGolden), "v2 renders clean");
  assert(e2eGolden.includes("for the same audience (vintage outdoor badges for hikers)"), "{{niche}} filled from clients.style_brief.niche");
  assertEquals(pickTierRule(V2.tier_rules, 2, { niche: "farm humour" }).includes("(farm humour)"), true);
  assert(!/\{\{|\bNICHE\b/.test(pickTierRule(V2.tier_rules, 1)), "no niche given -> default, never a literal token");
});

Deno.test("unresolved-token guard scans template text only: 'FIND YOUR NICHE' and '{{brand}}' in client text pass, a template token is caught", () => {
  const magic = buildMagicPrompt(inputFrom(e2eV4, V1, {
    print_text: [{ role: "headline", text: "FIND YOUR NICHE" }],
    description: "Use the {{brand}} mark in the corner",
    avoid_notes: "anything that says NICHE twice",
  }));
  const out = renderPrompt(magic);
  assert(out.includes('"FIND YOUR NICHE"') && out.includes("{{brand}}"), "client text is rendered verbatim");
  assert(UNRESOLVED_TOKEN_RE.test(out), "the whole prompt does match the token regex (that is why the guard must not scan it)");
  assertEquals(findUnresolvedToken(magic), null, "client text never trips the guard");
  assertEquals(findUnresolvedToken({ ...magic, print_rules: magic.print_rules + "\nAlways {{GARMENT}} friendly." }), "{{", "template token in print rules");
  assertEquals(findUnresolvedToken({ ...magic, similarity_tier: { tier: 1, rule: "leaning more on the NICHE for subject matter" } }), "NICHE", "bare NICHE from tier_rules v1");
  assertEquals(findUnresolvedToken({ ...magic, text: { ...magic.text, rule: "TEXT {{TEXT_CASE}}" } }), "{{", "text rule token");
  assertEquals(findUnresolvedToken({ ...magic, style_card: { ...magic.style_card, lines: [...(magic.style_card.lines ?? []), "- Mood: {{MOOD}}"] } }), "{{", "style card line token");
  // an edit of that generation inherits the same client text and still passes
  assertEquals(findUnresolvedToken(applyEdit(magic, "edit_text", { old_text: "FIND YOUR NICHE", new_text: "FIND YOUR NICHE TODAY", instruction: "{{keep}} the badge" })), null, "edit instruction is client text");
});

Deno.test("draft snapshot is labelled (draft); a locked card (locked)", () => {
  assert(chickenGolden.includes("CLIENT STYLE CARD v2 (draft) - the LOOK of every design for this client. Every line is a hard requirement unless it says GUIDE:"), "draft header");
  assert(e2eGolden.includes("CLIENT STYLE CARD v4 (locked) - the LOOK"), "locked header");
  assert(!chickenGolden.includes("(locked v2)"), "old header gone");
});

Deno.test("strict palette lists every hex exactly once, dark variant only on garment black", () => {
  const card = {
    ...styleCardJson,
    rules: { palette_mode: "strict" },
    palette: [
      { name: "ink", hex: "#0c0c0c", weight: "dominant", role: "line" },
      { name: "white", hex: "#F9F9F9", weight: "secondary", role: "fill" },
      { name: "rust", hex: "#8C3B1A", weight: "accent", role: "accent" },
      { name: "orange", hex: "#DC6A15", weight: "accent", role: "accent" },
    ],
    palette_variants: [
      { garment: "dark" as const, hexes: ["#F9F9F9", "#DC6A15"], images: [1, 2] },
      { garment: "light" as const, hexes: ["#0C0C0C", "#8C3B1A"], images: [5, 6] },
    ],
  };
  const black = renderStyleCard(card, { garment_color: "black", status: "locked", version: 3 }).lines.join("\n");
  const pal = black.split("\n").find((l) => l.startsWith("- Palette (STRICT")) ?? "";
  assert(pal.includes("use ONLY these colours plus the flat grey background, no other hue"), "strict wording");
  for (const h of ["#F9F9F9", "#DC6A15"]) assertEquals(count(black, h), 1, h + " once on black");
  for (const h of ["#0C0C0C", "#8C3B1A"]) assertEquals(count(black, h), 0, h + " (light variant) absent on black");
  assert(pal.includes("white #F9F9F9 (fill, secondary)"), "variant hex resolved to its palette entry: " + pal);
  const white = renderStyleCard(card, { garment_color: "white", status: "locked", version: 3 }).lines.join("\n");
  for (const h of ["#0C0C0C", "#8C3B1A"]) assertEquals(count(white, h), 1, h + " once on white");
  assertEquals(count(white, "#F9F9F9"), 0, "dark variant absent on white");
  const none = renderStyleCard(card, { status: "locked", version: 3 }).lines.join("\n");
  for (const h of ["#0C0C0C", "#F9F9F9", "#8C3B1A", "#DC6A15"]) assertEquals(count(none, h), 1, h + " once with no garment (full palette, dominant first)");
  assert(none.indexOf("#0C0C0C") < none.indexOf("#F9F9F9"), "dominant first");
  assert(black.includes("never a colour outside the palette above"), "strict NEGATIVE clause");
  const flex = renderStyleCard({ ...card, rules: { palette_mode: "flexible" } }, { status: "locked", version: 3 }).lines.join("\n");
  assert(flex.includes("Palette (FLEXIBLE - lead with these colours; small natural accents in other hues are allowed)") && !flex.includes("never a colour outside"), "flexible wording, no palette NEGATIVE clause");
  // the live Chicken card (strict, no variants): 5 hexes, each once in the whole prompt
  for (const h of ["#0C0C0C", "#F9F9F9", "#8C3B1A", "#DC6A15", "#F5A623"]) assertEquals(count(chickenGolden, h), 1, h + " once in the chicken prompt");
});

Deno.test("tier 1 legacy reference block has no Subject structure line; tier 3 remixes the hero; tier 5 has the full block", () => {
  assert(chickenGolden.includes("REFERENCE DESIGN DESCRIPTION (apply the similarity policy to decide how closely to copy it):"), "legacy header at tier 1");
  assert(!chickenGolden.includes("Subject structure:"), "tier 1: no Subject structure");
  assert(!chickenGolden.includes("Typography in the reference"), "tier 1: no reference typography");
  assert(chickenGolden.includes("Reference palette (mood only - the Style Card palette governs): White #FFFFFF"), "tier 1: palette is mood only");
  assert(chickenGolden.includes('Text seen in the reference (do NOT reproduce it): "HOME", "is where your herd is", "@TheHappyHourFarm"'), "text seen always listed");
  const t3 = renderPrompt(buildMagicPrompt(inputFrom(chickenV2, V2, { tier: 3 })));
  assert(t3.includes("Hero concept to remix: The central hero subject is a fluffy Highland cow calf"), "tier 3: hero concept line");
  assert(!t3.includes("Subject structure:") && !t3.includes("Composition: Center-aligned"), "tier 3: no full block");
  const t5 = renderPrompt(buildMagicPrompt(inputFrom(chickenV2, V2, { tier: 5 })));
  assert(t5.includes("Subject structure: The central hero subject"), "tier 5: Subject structure present");
  assert(t5.includes("Composition: Center-aligned") && t5.includes("Typography in the reference (style only"), "tier 5: full block");
  assert(t5.includes("Reference palette (governs this re-creation, inside the Style Card family): White #FFFFFF"), "tier 5: palette governs");
  assert(t5.includes("Image 1-3: style/subject references for this design; Image 4-6: examples of the client's established look"), "legacy labels + client_look at tier >= 3");
});

// per-slot reference analysis (analysis_prompt v3 shape): slot 1 = bear, slot 3 = lettering whose words say CHICKEN
const slotAnalysis: ReferenceAnalysis = {
  references: [
    { slot: 1, role: "subject", hero: { subject: "a grizzly bear", pose: "standing on a ridge, head turned left", framing: "full_figure", scale: "large" }, supporting_elements: ["pine trees", "a crescent moon"], layout: "badge", text_zones: "arched above the hero, banner below", text_detected: ["WILD"] },
    { slot: 2, role: "art_style", medium: "screen-print vector", realism: "stylised", line_weight: "bold", line_style: "uniform outlines", shading: "halftone", texture: "paper grain", edge_finish: "clean", palette: [{ name: "cream", hex: "#f2e8d5", role: "fill" }, { name: "rust", hex: "#B5482A", role: "accent" }], text_detected: [] },
    { slot: 3, role: "typography", headline: { family: "slab_serif", weight: "bold", effects: ["arched", "inline_hatching"] }, secondary: { family: "script", weight: "regular", effects: [] }, placement: "arched above, banner below", case: "UPPER", text_detected: ["CHICKEN", "EST. 1999"] },
  ],
  roles: ["subject", "art_style", "typography"],
  same_design: false,
  notes: "slot 3 is a poultry farm shirt",
  // flat compat keys as WF-1 v3 Parse Analysis writes them
  art_style: "screen-print vector, stylised, bold uniform outlines, halftone, paper grain, clean",
  palette: [{ name: "cream", hex: "#F2E8D5" }, { name: "rust", hex: "#B5482A" }],
  subject_structure: "a grizzly bear standing on a ridge; pine trees, a crescent moon",
  composition: "badge, full_figure, arched above the hero, banner below",
  typography_transcription: "slab_serif bold (arched, inline_hatching); script regular; arched above, banner below; UPPER",
  text_detected: ["WILD", "CHICKEN", "EST. 1999"],
};
const ROLED: (SlotRoleName | null)[] = ["subject", "art_style", "typography"];

Deno.test("per-slot references: three distinct Image n labels; SUBJECT source reference uses the subject slot, never the typography slot", () => {
  const input = inputFrom(chickenV2, V2, { tier: 3, roles: ROLED, reference_analysis: slotAnalysis, explicit_subject: "" });
  const magic = buildMagicPrompt(input);
  const out = renderPrompt(magic);
  assertEquals(magic.subject?.text, "a grizzly bear", "subject from slot 1");
  assertEquals(magic.subject?.source, "reference");
  assertEquals(magic.subject?.slot, 1);
  assert(out.includes("SUBJECT (the one hero of this design - it comes from here and nowhere else): a grizzly bear"), "SUBJECT line names the bear");
  assert(out.includes("- Source: the WHAT TO MAKE reference (Image 1). Usual subject pool (supporting elements only): Highland cows"), "source names the slot");
  const chickenLines = linesWith(out, /chicken/i);
  assertEquals(chickenLines.length, 2, "CHICKEN only appears as text seen + in the exact-text block (the print text): " + JSON.stringify(chickenLines));
  assert(chickenLines.every((l) => l.startsWith("- Text seen in the references (never reproduce it):") || l.startsWith('- headline: "CHICKEN HAPPY HOUR"')), "never as the subject: " + JSON.stringify(chickenLines));
  assert(out.includes("REFERENCES - each attached image has ONE job; take nothing else from it:"), "per-slot header");
  assert(!out.includes("REFERENCE DESIGN DESCRIPTION"), "no legacy block");
  assert(out.includes("- Image 1, WHAT TO MAKE (the similarity policy applies to THIS image only): Hero: a grizzly bear; Pose: standing on a ridge, head turned left; Framing: full_figure, large; Supporting: pine trees, a crescent moon; Layout: badge; Text zones: arched above the hero, banner below"), "subject slot line");
  assert(out.includes("- Image 2, ART STYLE - applied WITHIN the Client Style Card (the card's medium, linework, shading, texture and palette govern; this image shows how they are executed): Medium: screen-print vector, stylised realism; Linework: bold, uniform outlines; Shading: halftone; Texture: paper grain; Edges: clean; Reference palette (mood only - the Style Card palette governs): cream #F2E8D5, rust #B5482A"), "art style slot line (tier 3: palette mood only)");
  assert(out.includes("- Image 3, LETTERING - letterforms only, never its words: headline: slab_serif bold (arched, inline_hatching); secondary: script regular; placed: arched above, banner below; case: UPPER; effects: arched, inline_hatching (the Style Card typography is LOCKED - take only placement and effects that do not contradict it)"), "lettering slot line + LOCKED suffix");
  assert(out.includes('- Text seen in the references (never reproduce it): "WILD", "CHICKEN", "EST. 1999"'), "union of slot text");
  assert(out.includes("- Notes: slot 3 is a poultry farm shirt"), "notes");
  const labels = magic.reference_reading.image_roles;
  assertEquals(labels.length, 4, "three slot labels + one client_look span: " + JSON.stringify(labels));
  assert(labels[0].startsWith("Image 1: WHAT TO MAKE - take only the subject, its pose and framing"), labels[0]);
  assert(labels[1].startsWith("Image 2: ART STYLE - take only medium, linework, shading, texture and colours"), labels[1]);
  assert(labels[2].startsWith("Image 3: LETTERING - take only the lettering style, weight, case, placement and effects"), labels[2]);
  assert(labels[3].startsWith("Image 4-6: examples of the client's established look"), labels[3]);
  assert(!out.includes("- Not attached:"), "all three roles attached");
  // tier 1: concept only, and the subject comes from the Style Card, not the reference
  const t1 = buildMagicPrompt(inputFrom(chickenV2, V2, { tier: 1, roles: ROLED, reference_analysis: slotAnalysis, explicit_subject: "" }));
  assertEquals(t1.subject?.source, "style_card", "tier 1 never takes the subject from the reference");
  assert(renderPrompt(t1).includes("- Image 1, WHAT TO MAKE (concept only - a NEW composition is required): Hero: a grizzly bear"), "tier 1 wording");
  // tier 4: the reference palette governs
  const t4 = renderPrompt(buildMagicPrompt(inputFrom(chickenV2, V2, { tier: 4, roles: ROLED, reference_analysis: slotAnalysis, explicit_subject: "" })));
  assert(t4.includes("Reference palette (governs this re-creation, inside the Style Card family): cream #F2E8D5"), "tier 4 palette wording");
  // an explicit brief subject beats the slot
  const ex = buildMagicPrompt(inputFrom(chickenV2, V2, { tier: 3, roles: ROLED, reference_analysis: slotAnalysis, explicit_subject: "a rooster in sunglasses" }));
  assertEquals(ex.subject, { text: "a rooster in sunglasses", source: "brief", pool: ["Highland cows", "Highland calves", "Farm animals with humorous accessories (sunglasses, hats)", "Sunflowers and field wildflowers"] });
});

Deno.test("per-slot: missing slots render 'Not attached'; GUIDE typography + LETTERING slot sets the QUOTE header", () => {
  const oneSlot: ReferenceAnalysis = { ...slotAnalysis, references: [slotAnalysis.references![0]], roles: ["subject"] };
  const one = renderPrompt(buildMagicPrompt(inputFrom(chickenV2, V2, { tier: 3, roles: ["subject"], reference_analysis: oneSlot, explicit_subject: "", plan: planFor([chickenV2.card.reference_paths[0]], ["subject"]) })));
  assert(one.includes("- Not attached: ART STYLE, LETTERING - the Style Card governs."), "missing roles named");
  // GUIDE typography: the LETTERING reference becomes the lettering authority
  const guideCard = { ...chickenV2.style_card_snapshot, rules: { ...chickenV2.style_card_snapshot.rules, lock_typography: false } };
  const plan = planFor(chickenV2.card.reference_paths, ROLED);
  assertEquals(styleCardTypography(guideCard, plan), "the lettering of the LETTERING reference (Image 3), within the Style Card typography");
  assertEquals(styleCardTypography(guideCard, planFor(chickenV2.card.reference_paths, null)), "guided by the Style Card Typography line above");
  assertEquals(styleCardTypography(chickenV2.style_card_snapshot, plan), "the Style Card Typography line above");
  const guided = renderPrompt(buildMagicPrompt(inputFrom(chickenV2, V2, { tier: 3, roles: ROLED, reference_analysis: slotAnalysis, style_card: guideCard })));
  assert(guided.includes("- Typography (GUIDE): "), "GUIDE typography line");
  assert(guided.includes("set in the lettering of the LETTERING reference (Image 3), within the Style Card typography):"), "QUOTE header hands lettering to slot 3");
  assert(!guided.includes("(the Style Card typography is LOCKED"), "no LOCKED suffix on the LETTERING line when it is a guide");
  assertEquals(count(guided, "Typography ("), 1, "still rendered once");
  // the SUBJECT resolver on its own
  assertEquals(resolveSubject({ tier: 5, references: [], card_subjects: [] }).source, "description");
  assertEquals(resolveSubject({ tier: 5, references: [], card_subjects: [] }).text, "as described in the BRIEF Description");
});

Deno.test("PRECEDENCE line exactly once, as the last line of the print-rules block", () => {
  for (const out of [chickenGolden, e2eGolden, renderPrompt(fixture()), renderPrompt(applyEdit(fixture(), "edit_text", { old_text: "QA ROUND TWO", new_text: "X" }))]) {
    assertEquals(count(out, PRECEDENCE_LINE), 1, "precedence once");
    // print_rules = background_rule + blank line + defects, so block 1 is everything before the Style Card header
    const block1 = out.split("\n\nCLIENT STYLE CARD")[0];
    assert(block1.endsWith(PRECEDENCE_LINE), "last line of the print-rules block: " + block1.slice(-120));
  }
});

Deno.test("garment stated once (BRIEF only) and renderer output has no 'Printed on'", () => {
  for (const out of [chickenGolden, e2eGolden]) {
    assertEquals(count(out, "Garment colour: black - the artwork must hold up printed on this colour."), 1, "brief garment line once");
    assert(!out.includes("Printed on"), "no 'Printed on ... garments'");
    assert(!linesWith(out, /^- Garment/).length, "no garment line in the Style Card block");
    assertEquals(count(out, "heather grey"), 0, "the card's garment list is not rendered");
  }
});

Deno.test("exemplars unique and <= 160 chars, Description + quoted text only", () => {
  const other = renderPrompt(buildMagicPrompt(inputFrom(chickenV2, V2, { description: "A sassy hen in aviator sunglasses perched on a fence post, sunflowers behind", print_text: [{ role: "headline", text: "RISE AND SHINE" }] })));
  const ex = summarizeExemplars([chickenGolden, chickenGolden, other, chickenGolden, other]);
  assertEquals(ex.length, 2, "deduplicated by description: " + JSON.stringify(ex));
  for (const e of ex) {
    assert(e.length <= 160, "<= 160 chars: " + e.length);
    assert(e.startsWith("Description: "), "starts with the description");
    assert(!e.includes("\n"), "single line");
  }
  assert(ex[1].includes('TEXT: "RISE AND SHINE"'), "quoted text lines kept: " + ex[1]);
  assertEquals(summarizeExemplars(Array(6).fill(other).map((p, i) => p.replace("A sassy hen", "Hen " + i))).length, 3, "max 3");
  assertEquals(summarizeExemplars([]), []);
});

Deno.test("legacy magic_prompt_json (prose shape) still renders (R3)", () => {
  const legacy = {
    print_rules: V1.background_rule + "\n\n" + V1.defects,
    style_card: { version: 2, prose: "Medium: Vintage etching.. Palette - use ONLY these colours: Line Art Black #0C0C0C (dominant). Typography: slab serifs, as_typed case. Printed on black garments.", negatives: ["Gradients and soft airbrush shading", "Photorealism or 3D rendering"] },
    lessons: [],
    exemplars: [],
    reference_reading: { art_style: "etching", palette: "White #FFFFFF", subject_structure: "a calf", typography_transcription: "slab", text_detected: ["HOME"], composition: "stacked", notes: "", image_roles: ["Image 1-3: style/subject references for this design"] },
    similarity_tier: { tier: 1, rule: "LOOSE INSPIRATION (~30%): use the reference ONLY as a style guide." },
    brief: { description: "Style Card test render", garment_color: "black", placement: "front_chest", avoid_notes: "" },
    text: { rule: V1.text_rules, typography: "slab serifs, stacked, as_typed", lines: [{ role: "headline", text: "CHICKEN HAPPY HOUR" }] },
  } as unknown as MagicPrompt;
  const out = renderPrompt(legacy);
  assert(out.includes("CLIENT STYLE CARD v2 (locked) - the LOOK"), "header defaults to locked");
  assert(out.includes("Medium: Vintage etching.. Palette"), "prose rendered as given");
  assert(out.includes("- NEGATIVE - never: Gradients and soft airbrush shading; Photorealism or 3D rendering; never shadows, halos, gradients, a garment, a mockup or a photo"), "negatives line built from the legacy list");
  assertEquals(count(out, PRECEDENCE_LINE), 1);
  assert(!out.includes("SUBJECT (the one hero"), "no SUBJECT block without magic.subject");
  assert(out.includes("lettering only - the words never choose the subject; set in slab serifs, stacked, as_typed):"), "QUOTE header without a SUBJECT block");
  const edited = renderPrompt(applyEdit(legacy, "edit_text", { old_text: "CHICKEN HAPPY HOUR", new_text: "HEN PARTY" }));
  assert(edited.includes('"HEN PARTY"') && edited.includes("PREVIOUS VERSION DESCRIPTION"), "legacy prompt survives applyEdit + render");
});

Deno.test("template assertions from the migration text: text_rules v2 line 3, tier_rules v2 no NICHE, background_rule v2 #808080, defects v2", () => {
  const line3 = V2.text_rules.split("\n")[3];
  assert(line3.startsWith("- Set every text line in the Style Card Typography line above."), "text_rules v2 line 3: " + line3);
  assert(!/reference's typography/.test(V2.text_rules), "text_rules v2 never hands typography to the reference");
  assert(!/\bNICHE\b/.test(V2.tier_rules), "tier_rules v2 has no bare NICHE");
  assert(/\{\{niche\}\}/.test(V2.tier_rules), "tier_rules v2 carries {{niche}} for prompt-engine v8");
  const tiers = JSON.parse(V2.tier_rules) as Record<string, string>;
  for (const k of ["1", "2", "3", "4", "5"]) assert(tiers[k].includes("the WHAT TO MAKE reference (or the Style Card when none is attached)"), "tier " + k + " names the WHAT TO MAKE reference");
  assert(tiers["1"].includes("the SUBJECT block below names what to draw"), "tier 1 points at the SUBJECT block");
  assert(V2.background_rule.includes("#808080"), "background_rule v2 grey set has #808080");
  assert(!/\bthe reference\b/.test(V2.defects) && V2.defects.includes("the Style Card and the attached references"), "defects v2 wording");
  // and the live v1 rows still have the defects v8 tolerates
  assert(/\bNICHE\b/.test(V1.tier_rules) && /reference's typography/.test(V1.text_rules) && !V1.background_rule.includes("#808080"), "fixture v1 rows are the pre-v2 text");
});

Deno.test("prompt length stays under 12,000 chars on the live fixtures; lint of a garbage card never throws", () => {
  assert(chickenGolden.length <= 12000, "chicken " + chickenGolden.length);
  assert(e2eGolden.length <= 12000, "e2e " + e2eGolden.length);
  const junk = renderStyleCard({ palette: "nope", typography: 7, forbid: null } as unknown as Parameters<typeof renderStyleCard>[0], { status: "draft", version: 1 });
  assertEquals(junk.lines.length, 1, "only the NEGATIVE line survives a garbage card: " + JSON.stringify(junk.lines));
  assert(junk.lines[0].startsWith("- NEGATIVE - never: never shadows"), junk.lines[0]);
});
