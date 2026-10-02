// Golden tests for the deterministic renderer (prompt-engine v8).
// Run: npm run test:functions (Node shim, spec 3.4)   or   deno test --allow-read supabase/functions/prompt-engine/
// No jsr imports on purpose so the same file runs under `node --experimental-strip-types` with globalThis.Deno = {test}.
// Fixtures: fixtures/chicken_v2.json (live style_card_snapshot of generation 006b5ba1 + its card/client rows),
// fixtures/e2e_v4.json (live E2E v4 locked card + its studio_20 test card), fixtures/templates_v1.json (live active v1
// template rows); the v2 template bodies are read from the studio_21 migration text so the assertions pin the real SQL;
// tier_rules v2 as rewritten by studio_26 (art-style override) is read from that migration (V2_26).
import { readFile } from "node:fs/promises";
import {
  alignReadings,
  applyEdit,
  artImageNumber,
  artPlanEntry,
  cardReading,
  attachesClientLook,
  buildMagicPrompt,
  type BuildInput,
  DEFAULT_NICHE,
  EditError,
  effectiveStyle,
  findArtReference,
  findUnresolvedToken,
  hasLook,
  normHex,
  renderArtStyleBlock,
  IMAGE_ROLE_ART,
  IMAGE_ROLE_ART_WINS,
  imageRoleLabels,
  inheritLook,
  type InputPath,
  type MagicPrompt,
  pickAspect,
  pickTierRule,
  PRECEDENCE_LINE,
  PRECEDENCE_LINE_ART,
  type ReferenceAnalysis,
  readReference,
  renderPrompt,
  renderStyleCard,
  resolveArtReference,
  resolveSubject,
  spellOut,
  type StyleCard,
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
// studio_26 rewrites the never-activated tier_rules v2 row in place (art technique and colours from the ART STYLE reference)
const MIGRATION_26_URL = new URL("../../migrations/20261001_studio_26_art_style_wins.sql", import.meta.url);
const migration26 = await readFile(MIGRATION_26_URL, "utf8");
const tiers26 = migration26.match(/\$tiers26\$([\s\S]*?)\$tiers26\$/);
if (!tiers26) throw new Error("studio_26 migration lacks the $tiers26$ body");
const V2_26 = { ...V2, tier_rules: tiers26[1] };
// studio_27 rewrites the never-activated defects v2 row with sentence edits (distress, halftone and maturity measured
// against the ART STYLE reference when one is attached, else the Style Card); applied here to the studio_21 body
const MIGRATION_27_URL = new URL("../../migrations/20261001_studio_27_defects_art_style.sql", import.meta.url);
const migration27 = await readFile(MIGRATION_27_URL, "utf8");
const defects27Pairs: Array<[string, string]> = [];
{
  const c = new Map<string, string>();
  for (const m of migration27.matchAll(/(\w+) constant text := \$s\$([\s\S]*?)\$s\$;/g)) c.set(m[1], m[2]);
  for (let n = 1; c.has("d" + n + "_old"); n++) defects27Pairs.push([c.get("d" + n + "_old")!, c.get("d" + n + "_new")!]);
}
const V2_27 = { ...V2_26, defects: defects27Pairs.reduce((b, [from, to]) => b.replace(from, to), V2.defects) };
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
  // as index.ts passes them: cards.reference_roles, cards.source, cards.client_submission (both live fixtures are
  // style-test cards - client_submission.source 'style_test' - so they never take the art-style override)
  return {
    reference_roles: roles ?? card.reference_roles,
    reference_paths: card.reference_paths,
    card_source: (card as { source?: string }).source,
    client_submission: card.client_submission,
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

// ---------------------------------------------------------------------------
// Art-style override (user decision 2026-10-01: the Art style reference wins for its card)

// A designer card (not a style test) with the three roled slots and the per-slot reading above. index.ts attaches no
// client_look when the art reference governs (attachesClientLook), so the plan is the three card references only.
const DESIGNER = { card_source: "designer", client_submission: { source: "designer" } };
function artInput(fx: LiveFixture, over: Partial<BuildInput> & { roles?: (SlotRoleName | null)[] | null; look?: string[] } = {}): BuildInput {
  return inputFrom(fx, V2_27, { tier: 3, roles: ROLED, reference_analysis: slotAnalysis, explicit_subject: "", look: [], ...DESIGNER, ...over });
}
const artMagic = buildMagicPrompt(artInput(chickenV2));
const artGolden = renderPrompt(artMagic);
const blockOf = (out: string, head: string) => out.split("\n\n").find((b) => b.startsWith(head)) ?? "";

Deno.test("golden: art reference render equals fixtures/art_reference.expected.txt", async () => {
  const expected = await readFile(new URL("./fixtures/art_reference.expected.txt", import.meta.url), "utf8");
  if (expected.trim() !== artGolden.trim()) {
    const a = expected.trim().split("\n"), b = artGolden.trim().split("\n");
    const i = a.findIndex((l, k) => l !== b[k]);
    throw new Error("art reference golden differs at line " + (i + 1) + ":\n  expected: " + a[i] + "\n  got:      " + b[i]);
  }
});

Deno.test("art reference: the ART STYLE block replaces the Style Card look lines, palette from the reference, precedence, no client_look, labels", () => {
  const out = artGolden;
  // decision + plan
  const art = resolveArtReference({ ...DESIGNER, reference_analysis: slotAnalysis, reference_roles: ROLED });
  assertEquals(art?.slot, 2, "slot 2 is the analysed art reference");
  assertEquals(attachesClientLook(3, art), false, "no client_look next to an art reference");
  assertEquals(attachesClientLook(3, null), true, "client_look at tier >= 3 otherwise");
  assertEquals(attachesClientLook(2, null), false, "never below tier 3");
  // precedence
  assertEquals(count(out, PRECEDENCE_LINE_ART), 1, "art precedence once");
  assert(!out.includes(PRECEDENCE_LINE), "the Style Card precedence is gone");
  assert(out.split("\n\nART STYLE (from")[0].endsWith(PRECEDENCE_LINE_ART), "precedence closes the print-rules block");
  // ART STYLE block, before the Style Card
  const artBlock = blockOf(out, "ART STYLE (from the Art style reference, Image 2) - this design is drawn in this look:");
  assert(artBlock, "ART STYLE block present");
  assertEquals(artBlock.split("\n"), [
    "ART STYLE (from the Art style reference, Image 2) - this design is drawn in this look:",
    "- Medium: screen-print vector",
    "- Rendering: stylised realism; clean edges",
    "- Linework: bold weight, uniform outlines",
    "- Shading: halftone",
    "- Texture: paper grain",
    "- Palette (STRICT - use ONLY these colours of the Art style reference plus the flat grey background, no other hue): cream #F2E8D5 (fill); rust #B5482A (accent)",
    "- Anything these lines do not cover: match the look of Image 2 itself - never its subject, layout or words.",
  ], "ART STYLE block lines");
  assert(out.indexOf("\nART STYLE (from") < out.indexOf("\nCLIENT STYLE CARD"), "ART STYLE block precedes the Style Card");
  // Style Card: header, no look lines, no Style Card colours anywhere, qualified signature moves, forbid kept
  const scBlock = blockOf(out, "CLIENT STYLE CARD");
  assert(scBlock.startsWith("CLIENT STYLE CARD v2 (draft) - governs only the lines below; the ART STYLE block above sets the medium, linework, shading, texture and colours, and the NEGATIVE line stays a hard rule. Every line is a hard requirement unless it says GUIDE:"), scBlock.split("\n")[0]);
  for (const k of ["- Medium:", "- Rendering:", "- Linework:", "- Shading:", "- Texture:", "- Palette"]) assert(!scBlock.includes("\n" + k), "Style Card look line removed: " + k);
  for (const h of ["#0C0C0C", "#F9F9F9", "#8C3B1A", "#DC6A15", "#F5A623"]) assertEquals(count(out, h), 0, "Style Card colour " + h + " not in the prompt");
  for (const h of ["#F2E8D5", "#B5482A"]) assertEquals(count(out, h), 1, "reference colour " + h + " once (ART STYLE palette)");
  assert(scBlock.includes("\n- Composition (LOCKED - follow it): Centrally aligned"), "composition kept");
  assert(scBlock.includes("\n- Typography (LOCKED): "), "typography kept");
  assert(scBlock.includes("\n- Mood: Rustic, Sassy, Humorous, Endearing"), "mood kept");
  assert(scBlock.includes("(especially on lighter garments) - use at least one, only where it does not contradict the ART STYLE reference"), "signature moves qualified");
  assert(scBlock.includes("\n- NEGATIVE - never: Gradients and soft airbrush shading; Photorealism or 3D rendering; Clean, minimalist flat-vector icons without texture; Asymmetrical or left-aligned layouts; Heavy grunge that severely obscures or eats away at the legibility of the typography; never a colour outside the ART STYLE palette above; never shadows, halos, gradients, a garment, a mockup or a photo"), "forbid stays a hard negative + ART STYLE palette clause");
  // references, labels, subject
  assert(out.includes("- Image 2, ART STYLE - the look of this design: drawn as the ART STYLE block above describes (medium, linework, shading, texture and colours of this image); never its subject, layout or words."), "per-slot art line");
  assert(!out.includes("applied WITHIN the Client Style Card") && !out.includes("Reference palette"), "the Style-Card-governs art line is gone");
  assertEquals(artMagic.reference_reading.image_roles, [
    "Image 1: WHAT TO MAKE - take only the subject, its pose and framing, the supporting elements and the layout; ignore its colours, technique and lettering",
    "Image 2: " + IMAGE_ROLE_ART_WINS,
    "Image 3: LETTERING - take only the lettering style, weight, case, placement and effects; never its words",
  ], "three labels, no client_look span");
  assertEquals(IMAGE_ROLE_ART_WINS, "ART STYLE - draw this design in this image's medium, linework, shading, texture and colours; never its subject or words");
  assert(!out.includes("examples of the client's established look"), "no client_look label");
  assert(out.includes("- Draw this subject in the ART STYLE look above. The on-design text below is LETTERING ONLY"), "SUBJECT drawn in the ART STYLE look");
  assert(out.includes("INSPIRED REMIX (~65%): keep the hero concept and overall vibe of the WHAT TO MAKE reference") && out.includes("The art technique and colours come from the ART STYLE reference when one is attached, else from the Style Card - never from the WHAT TO MAKE reference."), "tier_rules v2 (studio_26) tier 3");
  assert(!UNRESOLVED_TOKEN_RE.test(out) && findUnresolvedToken(artMagic) === null, "no unresolved tokens");
  assert(out.length <= 12000, "length " + out.length);
  // effective_style (the CONTRACT with WF-2/WF-3 Build QC Request)
  assertEquals(artMagic.effective_style, {
    source: "art_reference", reference_slot: 2, reference_path: chickenV2.card.reference_paths[1], reference_image_index: 2,
    medium: "screen-print vector", realism: "stylised", linework: { weight: "bold", style: "uniform outlines", outline: "" },
    shading: "halftone", shading_method: "halftone", texture: "paper grain", edge_finish: "clean",
    palette: [{ name: "cream", hex: "#F2E8D5", role: "fill" }, { name: "rust", hex: "#B5482A", role: "accent" }],
    palette_mode: "strict",
    forbid: ["Gradients and soft airbrush shading", "Photorealism or 3D rendering", "Clean, minimalist flat-vector icons without texture", "Asymmetrical or left-aligned layouts", "Heavy grunge that severely obscures or eats away at the legibility of the typography"],
    composition: artMagic.effective_style!.composition,
    typography: artMagic.effective_style!.typography,
    rules: { text_case: "as_typed", palette_mode: "strict", lock_typography: true, lock_composition: true },
  } as typeof artMagic.effective_style, "effective_style art_reference");
  assert(artMagic.effective_style!.composition.startsWith("Centrally aligned and vertically stacked."), "composition from the Style Card");
  assert(String(artMagic.effective_style!.typography.vibe).startsWith("Vintage Western slab serifs"), "typography from the Style Card");
});

Deno.test("art reference + flexible client palette: the reference colours lead, no NEGATIVE palette clause", () => {
  const m = buildMagicPrompt(artInput(e2eV4, { explicit_subject: "mountain silhouettes" }));
  const out = renderPrompt(m);
  assertEquals(m.effective_style?.source, "art_reference");
  assertEquals(m.effective_style?.palette_mode, "flexible");
  assert(out.includes("- Palette (FLEXIBLE - lead with these colours of the Art style reference; small natural accents in other hues are allowed): cream #F2E8D5 (fill); rust #B5482A (accent)"), "flexible palette line");
  const neg = linesWith(out, /^- NEGATIVE - never:/);
  assertEquals(neg.length, 1);
  assert(!neg[0].includes("palette"), "no palette clause in flexible mode: " + neg[0]);
  for (const h of ["#F0EBE1", "#DAA53F", "#324B3B"]) assertEquals(count(out, h), 0, "Style Card colour " + h + " not in the prompt");
  // a reading with no palette: the rule points at the image itself
  const noPal: ReferenceAnalysis = { ...slotAnalysis, references: slotAnalysis.references!.map((r) => ((r as { role: string }).role === "art_style" ? { ...(r as object), palette: [] } : r)) };
  const strictNoPal = renderPrompt(buildMagicPrompt(artInput(chickenV2, { reference_analysis: noPal })));
  assert(strictNoPal.includes("\n- Palette (STRICT - use ONLY the colours of Image 2 plus the flat grey background, no other hue)\n"), "strict rule on the image colours");
});

Deno.test("style_test card: never overridden - Style Card look lines, client_look as designed, the Style-Card-governs art line", () => {
  // the chicken fixture IS a style-test card (client_submission.source style_test) with an analysed art slot
  const input = inputFrom(chickenV2, V2_26, { tier: 3, roles: ROLED, reference_analysis: slotAnalysis, explicit_subject: "" });
  assertEquals(resolveArtReference({ client_submission: chickenV2.card.client_submission, reference_analysis: slotAnalysis, reference_roles: ROLED }), null, "client_submission.source style_test");
  assertEquals(resolveArtReference({ source: "style_test", reference_analysis: slotAnalysis, reference_roles: ROLED }), null, "cards.source style_test");
  assertEquals(attachesClientLook(3, null), true, "client_look kept for the test render at tier >= 3");
  const m = buildMagicPrompt(input);
  const out = renderPrompt(m);
  assertEquals(m.effective_style?.source, "style_card");
  assertEquals(m.effective_style?.reference_slot, null);
  assertEquals(m.effective_style?.palette.map((p) => p.hex), ["#0C0C0C", "#F9F9F9", "#8C3B1A", "#DC6A15", "#F5A623"], "Style Card palette");
  assertEquals(count(out, PRECEDENCE_LINE), 1);
  assert(!out.includes("ART STYLE (from the Art style reference"), "no ART STYLE block");
  assert(out.includes("CLIENT STYLE CARD v2 (draft) - the LOOK of every design for this client"), "Style Card header");
  assert(out.includes("\n- Medium: Vintage etching") && out.includes("\n- Palette (STRICT - use ONLY these colours plus the flat grey background"), "Style Card look lines");
  assert(out.includes("- Image 2, ART STYLE - applied WITHIN the Client Style Card"), "the art slot shows execution only");
  assertEquals(m.reference_reading.image_roles[1], "Image 2: " + IMAGE_ROLE_ART);
  assert(m.reference_reading.image_roles[3].startsWith("Image 4-6: examples of the client's established look"), "client_look span");
  assert(out.includes("- Draw this subject in the Style Card look."), "SUBJECT in the Style Card look");
});

Deno.test("no art slot: unchanged (the goldens), effective_style = the Style Card; a designer card renders like a style-test card", () => {
  // the live goldens (style-test cards, flat analysis) carry the Style Card look
  assertEquals(buildMagicPrompt(inputFrom(chickenV2, V2)).effective_style?.source, "style_card");
  assert(!chickenGolden.includes("ART STYLE (from") && !e2eGolden.includes("ART STYLE (from"), "no ART STYLE block in the goldens");
  // a designer card whose references have no art_style slot renders byte-identical to the same card as a style test
  const oneSlot: ReferenceAnalysis = { ...slotAnalysis, references: [slotAnalysis.references![0], slotAnalysis.references![2]], roles: ["subject", "typography"] };
  const paths = [chickenV2.card.reference_paths[0], chickenV2.card.reference_paths[2]];
  const base = { tier: 3, roles: ["subject", "typography"] as (SlotRoleName | null)[], reference_analysis: oneSlot, explicit_subject: "", plan: planFor(paths, ["subject", "typography"], ["lib/a.png"]) };
  const asDesigner = buildMagicPrompt(inputFrom(chickenV2, V2_26, { ...base, ...DESIGNER }));
  const asTest = buildMagicPrompt(inputFrom(chickenV2, V2_26, base));
  assertEquals(renderPrompt(asDesigner), renderPrompt(asTest), "same prompt");
  assertEquals(asDesigner.effective_style, asTest.effective_style, "same effective_style");
  assert(renderPrompt(asDesigner).includes("- Not attached: ART STYLE - the Style Card governs."), "missing art slot named");
  // a stamped art slot whose reading carries no look value still takes the override, value-less (the image is attached
  // and labelled ART STYLE; the UI shows the override caption on every stamped art slot)
  const empty: ReferenceAnalysis = { ...slotAnalysis, references: slotAnalysis.references!.map((r) => ((r as { role: string }).role === "art_style" ? { slot: 2, role: "art_style", palette: [], text_detected: [] } : r)) };
  const emptyMagic = buildMagicPrompt(artInput(chickenV2, { reference_analysis: empty }));
  assertEquals([emptyMagic.effective_style?.source, emptyMagic.effective_style?.medium, emptyMagic.effective_style?.palette.length], ["art_reference", "", 0], "empty art reading -> value-less override");
  assert(renderPrompt(emptyMagic).includes("\n- Medium, rendering, linework, shading, texture and edges: exactly as in Image 2 - never its subject, layout or words.\n"), "value-less ART STYLE line");
  // a stamped art_style role with no reference path at that slot (an empty slot) = no art slot
  assertEquals(resolveArtReference({ ...DESIGNER, reference_analysis: slotAnalysis, reference_roles: ROLED, reference_paths: ["c/1.png", "", "c/3.png"] }), null, "empty art slot -> Style Card");
});

Deno.test("legacy roles without per-slot analysis (live card 72354a02): value-less override - the art image itself is the look", () => {
  // cards.reference_roles stamps slot 2 art_style, but WF-1 stored a flat analysis_prompt v2 analysis (IMAGE 1 only). The
  // decision's legacy safety still applies the override: no values to draw from, so the ART STYLE block points at the
  // image itself, the Style Card look lines and client_look go, and QC gets an empty look (nothing to judge against).
  const flat = chickenV2.card.reference_analysis as ReferenceAnalysis;
  assertEquals(readReference(flat).references, undefined, "flat analysis has no per-slot readings");
  const art = resolveArtReference({ ...DESIGNER, reference_analysis: flat, reference_roles: ROLED, reference_paths: chickenV2.card.reference_paths });
  assertEquals([art?.slot, art?.role, hasLook(art)], [2, "art_style", false], "value-less art reference at the stamped slot");
  assertEquals(findArtReference(undefined, ROLED), art, "findArtReference: the stamped slot, no reading");
  assertEquals(attachesClientLook(3, art), false, "no client_look next to it");
  const legacy = buildMagicPrompt(inputFrom(chickenV2, V2_27, { tier: 3, roles: ROLED, reference_analysis: flat, look: [], ...DESIGNER }));
  const out = renderPrompt(legacy);
  assertEquals(blockOf(out, "ART STYLE (from").split("\n"), [
    "ART STYLE (from the Art style reference, Image 2) - this design is drawn in this look:",
    "- Medium, rendering, linework, shading, texture and edges: exactly as in Image 2 - never its subject, layout or words.",
    "- Palette (STRICT - use ONLY the colours of Image 2 plus the flat grey background, no other hue)",
  ], "value-less ART STYLE block");
  assertEquals(count(out, PRECEDENCE_LINE_ART), 1, "art precedence");
  const scBlock = blockOf(out, "CLIENT STYLE CARD");
  for (const k of ["- Medium:", "- Rendering:", "- Linework:", "- Shading:", "- Texture:", "- Palette"]) assert(!scBlock.includes("\n" + k), "Style Card look line removed: " + k);
  for (const h of ["#0C0C0C", "#F9F9F9", "#8C3B1A", "#DC6A15", "#F5A623"]) assertEquals(count(out, h), 0, "Style Card colour " + h + " not in the prompt");
  // the flat block describes IMAGE 1 (the WHAT TO MAKE image here): its look lines go, its subject lines stay
  const flatBlock = blockOf(out, "REFERENCE DESIGN DESCRIPTION");
  assert(flatBlock && !flatBlock.includes("\nArt style:") && !flatBlock.includes("Reference palette"), "no flat Art style / Reference palette line: " + flatBlock);
  assert(flatBlock.includes("\nHero concept to remix: "), "tier 3 hero concept of IMAGE 1 kept");
  for (const p of (flat.palette as Array<{ hex: string }>)) assertEquals(count(out, p.hex.toUpperCase()), 0, "flat palette hex " + p.hex + " (IMAGE 1) not in the prompt");
  assertEquals(legacy.reference_reading.image_roles, [
    "Image 1: WHAT TO MAKE - take only the subject, its pose and framing, the supporting elements and the layout; ignore its colours, technique and lettering",
    "Image 2: " + IMAGE_ROLE_ART_WINS,
    "Image 3: LETTERING - take only the lettering style, weight, case, placement and effects; never its words",
  ], "the art image labelled ART STYLE, no client_look span");
  assertEquals(legacy.effective_style, {
    source: "art_reference", reference_slot: 2, reference_path: chickenV2.card.reference_paths[1], reference_image_index: 2,
    medium: "", realism: "", linework: { weight: "", style: "", outline: "" },
    shading: "", shading_method: "", texture: "", edge_finish: "", palette: [], palette_mode: "strict",
    forbid: legacy.effective_style!.forbid, composition: legacy.effective_style!.composition, typography: legacy.effective_style!.typography, rules: legacy.effective_style!.rules,
  } as typeof legacy.effective_style, "empty look, client strictness");
  assert(legacy.effective_style!.forbid.length === 5 && legacy.effective_style!.composition.startsWith("Centrally aligned"), "forbid / composition from the Style Card");
  // the same card as a style test: the Style Card governs, client_look kept (unchanged behaviour)
  const asTest = buildMagicPrompt(inputFrom(chickenV2, V2_26, { tier: 3, roles: ROLED, reference_analysis: flat }));
  const testOut = renderPrompt(asTest);
  assertEquals(asTest.effective_style?.source, "style_card");
  assert(!testOut.includes("ART STYLE (from") && testOut.includes(PRECEDENCE_LINE) && testOut.includes("\nArt style: "), "style test: Style Card governs, flat block as before");
  assertEquals(asTest.reference_reading.image_roles[1], "Image 2: " + IMAGE_ROLE_ART, "style test: the take-only label");
  assert(asTest.reference_reading.image_roles[3].startsWith("Image 4-6: examples of the client's established look"), "style test: client_look attached as before");
  // the art slot is IMAGE 1 of a flat analysis: the flat description reads the art image, so none of it is used
  const artFirst = buildMagicPrompt(inputFrom(chickenV2, V2_27, { tier: 4, roles: ["art_style", "subject", "typography"], reference_analysis: flat, look: [], ...DESIGNER }));
  const artFirstFlat = blockOf(renderPrompt(artFirst), "REFERENCE DESIGN DESCRIPTION");
  assertEquals(artFirst.effective_style?.reference_slot, 1);
  assert(!/\n(Art style|Reference palette|Subject structure|Composition|Typography in the reference|Hero concept)/.test(artFirstFlat), "flat block of the art image keeps no look / subject line: " + artFirstFlat);
});

Deno.test("roles changed after the vision read: the stamped role decides the art slot; a stale read never lends its values", () => {
  // read: slot 1 subject (grizzly bear), slot 2 art_style (screen-print vector, cream/rust); staff then re-role to
  // [art_style, subject, typography] - saving roles does not re-run WF-1
  const swapped: (SlotRoleName | null)[] = ["art_style", "subject", "typography"];
  const m = buildMagicPrompt(artInput(chickenV2, { roles: swapped }));
  const out = renderPrompt(m);
  assertEquals([m.effective_style?.source, m.effective_style?.reference_slot, m.effective_style?.medium, m.effective_style?.palette.length], ["art_reference", 1, "", 0], "Image 1 is the art image, value-less (its read was a subject read)");
  assert(out.includes("ART STYLE (from the Art style reference, Image 1) - this design is drawn in this look:\n- Medium, rendering, linework, shading, texture and edges: exactly as in Image 1"), "ART STYLE block names Image 1, no values");
  for (const v of ["screen-print vector", "#F2E8D5", "#B5482A", "grizzly"]) assertEquals(count(out, v), 0, "stale value " + v + " not in the prompt");
  assertEquals(m.reference_reading.image_roles.slice(0, 2), ["Image 1: " + IMAGE_ROLE_ART_WINS, "Image 2: WHAT TO MAKE - take only the subject, its pose and framing, the supporting elements and the layout; ignore its colours, technique and lettering"]);
  assert(out.includes("- Image 1, ART STYLE - the look of this design: drawn as the ART STYLE block above describes"), "REFERENCES: Image 1 ART STYLE");
  assert(out.includes("- Image 2, WHAT TO MAKE (the similarity policy applies to THIS image only): no reading"), "REFERENCES: Image 2 WHAT TO MAKE, its art read dropped");
  assertEquals(m.subject?.source, "style_card", "the stale subject read of Image 1 never becomes the SUBJECT");
  // the reverse: the stamped art slot was read for another job -> value-less at the stamped slot (never the Style Card)
  const readAsSubject: ReferenceAnalysis = { ...slotAnalysis, references: slotAnalysis.references!.map((r) => ((r as { slot: number }).slot === 2 ? { ...(r as object), role: "subject" } : r)) };
  const rev = buildMagicPrompt(artInput(chickenV2, { reference_analysis: readAsSubject }));
  assertEquals([rev.effective_style?.source, rev.effective_style?.reference_slot, rev.effective_style?.medium], ["art_reference", 2, ""], "stamped art slot 2 read as subject -> value-less override");
  // alignReadings: matching and role-less reads keep their values, a read for another job is emptied, no roles = as read
  const refs = readReference(slotAnalysis).references!;
  const aligned = alignReadings(refs, swapped)!;
  assertEquals(aligned.map((r) => [r.slot, r.role, r.medium || r.hero.subject]), [[1, "art_style", ""], [2, "subject", ""], [3, "typography", ""]]);
  assertEquals(alignReadings(refs, null), refs, "no stamped roles: as read");
  assertEquals(alignReadings(undefined, swapped), undefined, "flat analysis: nothing to align");
});

Deno.test("art slot palette: hexes normalised, string palettes parsed, name-only colours kept, the text fallback reachable", () => {
  const read = (palette: unknown) => readReference({ references: [{ slot: 1, role: "art_style", medium: "linocut", palette }] }).references![0];
  assertEquals(read([{ name: "cream", hex: "F2E8D5" }, { name: "rust", hex: "#b5482a" }, { name: "ink", hex: "#123" }]).palette_entries,
    [{ name: "cream", hex: "#F2E8D5", role: "" }, { name: "rust", hex: "#B5482A", role: "" }, { name: "ink", hex: "#112233", role: "" }], "hexes normalised");
  assertEquals(read("cream #F2E8D5, rust b5482a").palette_entries, [{ name: "cream", hex: "#F2E8D5", role: "" }, { name: "rust", hex: "#B5482A", role: "" }], "string palette parsed");
  assertEquals(read([{ name: "cream", hex: "not a hex" }, { name: "rust", hex: "#B5482A" }]).palette_entries, [{ name: "cream", hex: "", role: "" }, { name: "rust", hex: "#B5482A", role: "" }], "a colour without a usable hex is kept by name");
  assertEquals(read("warm earthy tones").palette_entries, undefined, "nothing parses -> undefined (not [])");
  assertEquals(read([]).palette_entries, undefined);
  assertEquals(normHex("facade"), "", "a word is not a hex");
  // the prompt and effective_style keep every colour of a STRICT reference palette
  const card: StyleCard = { rules: { palette_mode: "strict" }, forbid: ["neon"] };
  const es = effectiveStyle({ card, art: read([{ name: "cream", hex: "F2E8D5" }, { name: "rust", hex: "#b5482a" }]), reference_slot: 2 });
  assertEquals(es.palette, [{ name: "cream", hex: "#F2E8D5" }, { name: "rust", hex: "#B5482A" }]);
  assert(renderArtStyleBlock(es, 2, false).includes("STRICT - use ONLY these colours of the Art style reference plus the flat grey background, no other hue): cream #F2E8D5; rust #B5482A"), "both colours in the strict line");
  const named = effectiveStyle({ card, art: read([{ name: "cream", hex: "?" }, { name: "rust", hex: "#B5482A" }]) });
  assertEquals(named.palette, [{ name: "cream", hex: "" }, { name: "rust", hex: "#B5482A" }], "name-only colour stays in effective_style");
  // a reading whose palette_entries is undefined falls back to the palette text
  const textOnly = { ...read("warm earthy tones"), palette: "cream #F2E8D5" };
  assertEquals(effectiveStyle({ card, art: textOnly }).palette, [{ name: "cream", hex: "#F2E8D5" }], "text fallback runs");
});

Deno.test("legacy safety: a per-slot entry without a role counts as the art reference when cards.reference_roles says art_style", () => {
  const refs = readReference({ references: [
    { slot: 1, role: "subject", hero: { subject: "a calf" } },
    { slot: 2, medium: "linocut", line_weight: "heavy", palette: [{ name: "ink", hex: "#101010" }] },
  ] }).references;
  assertEquals(findArtReference(refs, ["subject", "art_style"])?.slot, 2, "slot 2 via cards.reference_roles");
  assertEquals(findArtReference(refs, null), null, "no roles -> no art reference");
  assertEquals(findArtReference(refs, ["subject", "typography"]), null, "slot 2 is not an art_style slot");
  // a role-less plan (legacy card read with v3): the art image still gets its own label, the others keep the span label
  const plan = planFor(["c/1.png", "c/2.png", "c/3.png"], null);
  const art = findArtReference(readReference(slotAnalysis).references, null);
  assertEquals(artImageNumber(plan, art), 2);
  assertEquals(imageRoleLabels(plan, { art_image: 2 }), [
    "Image 1: style/subject references for this design",
    "Image 2: " + IMAGE_ROLE_ART_WINS,
    "Image 3: style/subject references for this design",
  ]);
  assertEquals(artImageNumber([{ bucket: "gens", path: "p.png", role: "previous_version" }], art), null, "not attached in edit mode");
});

Deno.test("edit of an art-reference design: ART STYLE block without an image number, effective_style kept, R3 prose shape untouched", () => {
  const edited = applyEdit(artMagic, "edit_text", { old_text: "CHICKEN HAPPY HOUR", new_text: "HEN PARTY" });
  assertEquals(edited.effective_style, artMagic.effective_style, "applyEdit keeps effective_style");
  const out = renderPrompt(edited);
  assert(out.includes("ART STYLE (from the Art style reference) - this design is drawn in this look:"), "no Image number in edit mode");
  assert(!out.includes("Anything these lines do not cover"), "no pointer to an image that is not attached");
  assertEquals(count(out, PRECEDENCE_LINE_ART), 1);
  // a pre-v8 prose-shape style_card never takes the ART STYLE block (no Style Card lines to replace)
  const prose = { ...artMagic, style_card: { version: 2, prose: "Medium: etching.", negatives: ["gradients"] } } as unknown as MagicPrompt;
  const proseOut = renderPrompt(prose);
  assert(!proseOut.includes("ART STYLE (from") && proseOut.includes(PRECEDENCE_LINE) && proseOut.includes("CLIENT STYLE CARD v2 (locked) - the LOOK"), "R3 render unchanged");
});

Deno.test("flat reference block is art-aware: edits never say the Style Card governs the palette; a regenerate re-reads the card", () => {
  // edit_text of an art-reference design: the PREVIOUS VERSION block keeps no flat 'Art style' / 'Reference palette' line
  const edited = renderPrompt(applyEdit(artMagic, "edit_text", { old_text: "CHICKEN HAPPY HOUR", new_text: "HEN PARTY" }));
  const prev = blockOf(edited, "PREVIOUS VERSION DESCRIPTION");
  assert(prev && !prev.includes("Reference palette") && !prev.includes("\nArt style:") && !prev.includes("Style Card family"), "edit block: " + prev);
  assertEquals(count(edited, "#F2E8D5"), 1, "cream once (ART STYLE palette only)");
  // the same edit of a Style Card design is unchanged (the flat lines stay)
  const cardEdit = renderPrompt(applyEdit(buildMagicPrompt(inputFrom(chickenV2, V2)), "edit_region", { instruction: "bigger hat" }));
  assert(cardEdit.includes("\nReference palette (governs this re-creation, inside the Style Card family): White #FFFFFF") && cardEdit.includes("\nArt style: Vintage etching"), "Style Card edit keeps the flat lines");
  // regenerate of a parent built from the flat analysis, after the card was re-read per slot: index.ts replaces the
  // parent's reading with cardReading(card analysis), so the reading and effective_style come from the same analysis
  const flat = chickenV2.card.reference_analysis as ReferenceAnalysis;
  const parent = buildMagicPrompt(artInput(chickenV2, { reference_analysis: flat }));
  const regen = applyEdit(parent, "regenerate", { instruction: "closer to the bear" });
  const art = resolveArtReference({ ...DESIGNER, reference_analysis: slotAnalysis, reference_roles: ROLED });
  const plan = planFor(chickenV2.card.reference_paths, ROLED);
  regen.reference_reading = cardReading({ reference_analysis: slotAnalysis, reference_roles: ROLED, print_text: regen.text.lines, plan, art, art_image: artImageNumber(plan, art) });
  regen.effective_style = effectiveStyle({ card: chickenV2.style_card_snapshot as unknown as StyleCard, art, reference_slot: artImageNumber(plan, art) });
  const out = renderPrompt(regen);
  assert(out.includes("REFERENCES - each attached image has ONE job") && !out.includes("REFERENCE DESIGN DESCRIPTION"), "per-slot block from the card's current analysis");
  assert(!out.includes("Vintage etching") && !out.includes("#FFFFFF") && !out.includes("Reference palette"), "nothing from the flat IMAGE 1 reading");
  assert(out.includes("- Palette (STRICT - use ONLY these colours of the Art style reference plus the flat grey background, no other hue): cream #F2E8D5 (fill); rust #B5482A (accent)"), "ART STYLE values from the per-slot reading");
  assertEquals(regen.reference_reading.image_roles, artMagic.reference_reading.image_roles, "same labels as a fresh build");
  assertEquals(regen.reference_reading.text_detected.includes("CHICKEN HAPPY HOUR"), false, "print text never listed as text seen");
  // without an override the parent's flat reading would stay - renderFlatReference without artGoverns is unchanged
  assert(renderPrompt(parent).includes("ART STYLE (from the Art style reference, Image 2)") && !renderPrompt(parent).includes("Reference palette"), "the flat parent itself already drops the flat look lines");
});

Deno.test("studio_27 migration: guard first, defects v2 sentence edits apply once to the studio_21 body, the art golden measures against the ART STYLE reference", () => {
  const guard = migration27.indexOf("do $guard$");
  assert(guard > 0 && guard < migration27.indexOf("update public.prompt_templates"), "the active / activated guard runs before any update");
  assert(/t\.active or t\.activated_at is not null or t\.activated_by is not null/.test(migration27), "guard refuses an active or once-activated row");
  assert(!/insert\s+into\s+public\.prompt_templates/i.test(migration27), "no insert");
  assertEquals(defects27Pairs.length, 4, "four sentence edits");
  for (const [from, to] of defects27Pairs) {
    assertEquals(count(V2.defects, from), 1, "studio_21 defects v2 has: " + from);
    assertEquals(count(V2_27.defects, to), 1, "applied once: " + to);
  }
  assert(!/\bthe reference\b/.test(V2_27.defects), "the studio_21 invariant (never 'the reference') holds");
  assert(!V2_27.defects.includes("themselves use halftone") && !V2_27.defects.includes("maturity of the Style Card and the attached references") && !V2_27.defects.includes("never heavier than the Style Card"), "no look line measured against the Style Card alone");
  assert(V2_27.defects.includes("(never the ART STYLE reference - its words are ignored)"), "baselines never follow the ART STYLE reference");
  // the self-check LIKE patterns hold on the rewritten body
  for (const m of migration27.matchAll(/body like '%([^%]+)%'/g)) assert(V2_27.defects.includes(m[1].replace(/''/g, "'")), "self-check pattern present: " + m[1]);
  for (const m of migration27.matchAll(/body not like '%([^%]+)%'/g)) assert(!V2_27.defects.includes(m[1].replace(/''/g, "'")), "self-check pattern absent: " + m[1]);
  // the art golden carries the rewritten lines next to the ART STYLE halftone shading
  assert(artGolden.includes("Halftone dot shading ONLY where the look this design is drawn in uses halftone - the ART STYLE reference when one is attached, else the Style Card") && artGolden.includes("\n- Shading: halftone\n"), "halftone rule points at the ART STYLE look");
  assert(!artGolden.includes("the Style Card and the attached references themselves"), "no Style Card halftone rule in the art golden");
  // only the defects lines change for a Style Card render (the chicken golden with studio_27 differs in those lines only)
  const a = chickenGolden.split("\n"), b = renderPrompt(buildMagicPrompt(inputFrom(chickenV2, { ...V2, defects: V2_27.defects }))).split("\n");
  assertEquals(a.length, b.length, "same line count");
  const diff = a.map((l, i) => (l === b[i] ? -1 : i)).filter((i) => i >= 0);
  assertEquals(diff.map((i) => b[i].split(":")[0]), ["- OVERALL DISTRESS", "- STRAIGHT BASELINES", "- NO STRAY DOTS", "- STYLE MATURITY"], "four defects lines");
});

Deno.test("effective_style (Style Card source): the garment-side palette variant as entries, the contract keys", () => {
  const card: StyleCard = {
    medium: "linocut", realism: "stylised", edge_finish: "rough", linework: { weight: "heavy", style: "gouged", outline: "none" },
    shading: "solid blacks", shading_method: "flat", texture: "ink grain",
    palette: [{ name: "ink", hex: "#111111", weight: "dominant" }, { name: "bone", hex: "#eeeeee", weight: "secondary", role: "fill" }, { name: "red", hex: "#C0392B", weight: "accent" }],
    palette_variants: [{ garment: "dark", hexes: ["#EEEEEE", "#c0392b"], images: [1] }, { garment: "light", hexes: ["#111111"], images: [2] }],
    composition: "badge", typography: { vibe: "woodtype" }, forbid: ["No gradients", "neon"], rules: { palette_mode: "strict" },
  };
  const dark = effectiveStyle({ card, garment_color: "black", art: null });
  assertEquals(Object.keys(dark), ["source", "reference_slot", "reference_path", "reference_image_index", "medium", "realism", "linework", "shading", "shading_method", "texture", "edge_finish", "palette", "palette_mode", "forbid", "composition", "typography", "rules"], "contract keys in order");
  assertEquals(dark.palette, [{ name: "bone", hex: "#EEEEEE", role: "fill", weight: "secondary" }, { name: "red", hex: "#C0392B", weight: "accent" }], "dark variant, labelled from the palette");
  assertEquals(effectiveStyle({ card, garment_color: "white", art: null }).palette, [{ name: "ink", hex: "#111111", weight: "dominant" }], "light variant");
  assertEquals(dark.forbid, ["gradients", "neon"], "linted forbid (negator stripped)");
  assertEquals([dark.source, dark.reference_slot, dark.reference_path, dark.reference_image_index, dark.palette_mode, dark.medium, dark.linework.outline], ["style_card", null, null, null, "strict", "linocut", "none"]);
  // the prompt Palette line and effective_style agree on the colours
  const line = renderStyleCard(card, { garment_color: "black" }).lines.find((l) => l.startsWith("- Palette"));
  assertEquals(line, "- Palette (STRICT - use ONLY these colours plus the flat grey background, no other hue): bone #EEEEEE (fill, secondary); red #C0392B (accent)");
  // an art reading stored before palette_entries existed: the palette text is parsed
  const old = { ...readReference(slotAnalysis).references![1] };
  delete (old as { palette_entries?: unknown }).palette_entries;
  assertEquals(effectiveStyle({ card, art: old }).palette, [{ name: "cream", hex: "#F2E8D5" }, { name: "rust", hex: "#B5482A" }]);
});

Deno.test("effective_style reference_path / reference_image_index: where the art image sits in the input plan (WF-2 attaches it to QC)", () => {
  // fresh build: the plan entry roled art_style - its path is the string the input plan signs (no bucket prefix)
  const plan = artInput(chickenV2).plan;
  const es = artMagic.effective_style!;
  assertEquals([es.reference_image_index, es.reference_path], [2, chickenV2.card.reference_paths[1]], "Image 2, its refs path");
  assertEquals(plan[es.reference_image_index! - 1], { bucket: "refs", path: es.reference_path!, role: "style_reference", slot_role: "art_style" }, "the planned input WF-2 signs");
  assert(!/^(refs|gens)\//.test(es.reference_path!), "no bucket prefix (List Input Paths strips it the same way)");
  assertEquals(es.reference_image_index, es.reference_slot, "attached: the plan index is the image number the prompt names");
  // re-roled card: the stamped art slot moves, the path follows it (value-less look, still attached)
  const swapped = buildMagicPrompt(artInput(chickenV2, { roles: ["art_style", "subject", "typography"] })).effective_style!;
  assertEquals([swapped.reference_image_index, swapped.reference_path], [1, chickenV2.card.reference_paths[0]], "re-roled: Image 1");
  // value-less override (live card 72354a02 shape: roles stamped, flat analysis): the art image is still in the plan
  const flat = buildMagicPrompt(artInput(chickenV2, { reference_analysis: chickenV2.card.reference_analysis as ReferenceAnalysis })).effective_style!;
  assertEquals([flat.source, flat.medium, flat.reference_image_index, flat.reference_path], ["art_reference", "", 2, chickenV2.card.reference_paths[1]], "value-less look still points at the attached art image");
  // role-less plan (legacy card read with analysis_prompt v3): the reading's slot in the plan
  const roleless = buildMagicPrompt(artInput(chickenV2, { roles: null, reference_roles: null })).effective_style!;
  assertEquals([roleless.source, roleless.reference_image_index, roleless.reference_path], ["art_reference", 2, chickenV2.card.reference_paths[1]], "role-less plan");
  // Style Card look (style-test card, or no art slot): both null
  const test = buildMagicPrompt(inputFrom(chickenV2, V2_26, { tier: 3, roles: ROLED, reference_analysis: slotAnalysis, explicit_subject: "" })).effective_style!;
  assertEquals([test.source, test.reference_path, test.reference_image_index], ["style_card", null, null], "style_card: null");
  // not attached: no plan, an edit plan (previous version + mask), a gens entry
  const art = resolveArtReference({ ...DESIGNER, reference_analysis: slotAnalysis, reference_roles: ROLED })!;
  assertEquals(artPlanEntry(undefined, art), { index: null, path: null }, "no plan");
  assertEquals(artPlanEntry([{ bucket: "gens", path: "c/prev.png", role: "previous_version" }, { bucket: "gens", path: "c/mask.png", role: "mask" }], art), { index: null, path: null }, "edit plan");
  assertEquals(artPlanEntry([{ bucket: "refs", path: "a.png", role: "subject_reference", slot_role: "subject" }, { bucket: "gens", path: "b.png", role: "style_reference", slot_role: "art_style" }], art), { index: null, path: null }, "never a gens path");
  assertEquals(artPlanEntry(plan, null), { index: null, path: null }, "no art reference");
  const noPlan = effectiveStyle({ card: chickenV2.style_card_snapshot as unknown as StyleCard, art, reference_slot: 2 });
  assertEquals([noPlan.reference_slot, noPlan.reference_path, noPlan.reference_image_index], [2, null, null], "reference_slot keeps its fallback, the plan fields stay null");
  // regenerate (index.ts): re-derived from the regenerate's own plan
  const regen = effectiveStyle({ card: chickenV2.style_card_snapshot as unknown as StyleCard, art, reference_slot: artImageNumber(plan, art), plan });
  assertEquals(regen, es, "regenerate = fresh build");
  // edits inherit the parent's values (index.ts inheritLook); a parent written before the keys existed gets null
  const edited = applyEdit(artMagic, "edit_region", { instruction: "bigger hat" });
  assertEquals(inheritLook(edited.effective_style!), es, "edit keeps the parent's path and index");
  const old = JSON.parse(JSON.stringify(es)) as Record<string, unknown>;
  delete old.reference_path; delete old.reference_image_index;
  const kept = inheritLook(old as unknown as typeof es);
  assertEquals([kept.reference_path, kept.reference_image_index, kept.medium, kept.source], [null, null, es.medium, "art_reference"], "older parent: nulls, look unchanged");
  // R3 / renderer: the new keys never change the prompt (an effective_style without them renders byte-identical)
  assertEquals(renderPrompt({ ...artMagic, effective_style: old as unknown as typeof es }), artGolden, "prompt text unchanged without the keys");
  assertEquals(renderPrompt(edited), renderPrompt({ ...edited, effective_style: kept }), "edit render unchanged");
});

Deno.test("tier_rules v2 as rewritten by studio_26: WHAT TO MAKE for subject/composition only, look from the ART STYLE reference else the Style Card", () => {
  const tiers = JSON.parse(V2_26.tier_rules) as Record<string, string>;
  const old = JSON.parse(V2.tier_rules) as Record<string, string>;
  assertEquals(Object.keys(tiers), ["1", "2", "3", "4", "5", "edit"]);
  for (const k of ["1", "2", "3", "4", "5"]) {
    assert(tiers[k].includes("the WHAT TO MAKE reference (or the Style Card when none is attached)"), "tier " + k + " names the WHAT TO MAKE reference");
    assert(tiers[k].includes("The art technique and colours come from the ART STYLE reference when one is attached, else from the Style Card - never from the WHAT TO MAKE reference."), "tier " + k + " look sentence");
    assert(!/art technique, colou?r palette|colou?r palette, art technique|how it is drawn|as a style, technique, palette/i.test(tiers[k]), "tier " + k + " no longer takes the look from the WHAT TO MAKE reference: " + tiers[k]);
    assert(tiers[k].includes("{{n}}"), "tier " + k + " {{n}}");
  }
  assert(tiers["1"].includes("the SUBJECT block below names what to draw") && tiers["1"].includes("({{niche}})"), "tier 1 pointers");
  assert(!/\bNICHE\b/.test(V2_26.tier_rules), "no bare NICHE");
  assertEquals(tiers.edit, old.edit, "edit rule unchanged");
  // the rewrite changes only the tier line of a render: the chicken golden with studio_26 differs in that one line
  const a = chickenGolden.split("\n"), b = renderPrompt(buildMagicPrompt(inputFrom(chickenV2, V2_26))).split("\n");
  assertEquals(a.length, b.length, "same line count");
  const diff = a.map((l, i) => (l === b[i] ? -1 : i)).filter((i) => i >= 0);
  assertEquals(diff.length, 1, "one changed line: " + JSON.stringify(diff.map((i) => b[i])));
  assert(b[diff[0]].startsWith("- LOOSE INSPIRATION (~30%): use the WHAT TO MAKE reference (or the Style Card when none is attached) ONLY as a loose idea"), b[diff[0]]);
});

Deno.test("studio_26 migration: guard first, qc_prompt v2 and analysis_prompt v3 sentence edits apply to the studio_21 bodies", () => {
  const guard = migration26.indexOf("do $guard$");
  assert(guard > 0 && guard < migration26.indexOf("update public.prompt_templates"), "the active / activated guard runs before any update");
  assert(/t\.active or t\.activated_at is not null or t\.activated_by is not null/.test(migration26), "guard refuses an active or once-activated row");
  assert(!/insert\s+into\s+public\.prompt_templates/i.test(migration26), "no insert (n8n/tools/template-from-migrations keeps reading the studio_21 bodies)");
  const consts = new Map<string, string>();
  for (const m of migration26.matchAll(/(\w+) constant text := \$s\$([\s\S]*?)\$s\$;/g)) consts.set(m[1], m[2]);
  // qc_prompt v2: every pair applies once to the studio_21 body, placeholders kept, nothing judged against "the card"
  let qc = dollarQuoted("qc");
  for (const n of [1, 2, 3, 4, 5]) {
    const from = consts.get("e" + n + "_old")!, to = consts.get("e" + n + "_new")!;
    assertEquals(count(qc, from), 1, "qc_prompt v2 has sentence e" + n + ": " + from);
    qc = qc.replace(from, to);
  }
  for (const tok of ['EXPECTED ON-DESIGN TEXT: """{{EXPECTED_TEXT}}"""', "{{EXPECTED_SUBJECT}}", "{{PALETTE_RULE}}", "{{FORBID_LIST}}", "{{STYLE_CARD_JSON}}"]) assert(qc.includes(tok), "qc_prompt v2 keeps " + tok);
  assert(!qc.includes("the card's ") && !qc.includes("against the card only"), "no 'the card' left in the style tail");
  assert(qc.includes('STYLE (the look this design must have, JSON below: the Art style reference\'s look when its "source" is "art_reference", else the client\'s Style Card)'), "style header");
  // analysis_prompt v3: the ART STYLE sentence lands right after the SLOT_BLOCKS line
  const an = dollarQuoted("analysis");
  const anchor = consts.get("anchor")!, added = consts.get("added")!;
  assertEquals(count(an, anchor), 1, "anchor once");
  const an3 = an.replace(anchor, added + "\n" + anchor);
  assert(an3.includes("{{SLOT_BLOCKS}}\n" + added + "\nIf all images are the same artwork"), "sentence after SLOT_BLOCKS");
  assert(added.includes("realism") && added.includes("edge_finish") && !/\{\{/.test(added), "asks for realism + edge_finish, no new token");
});
