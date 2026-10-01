// Tests for the shared Style Card rules (spec 1.5 acceptance list + 1.6 palette snap).
// Run: deno test supabase/functions/style-card-check/   or, without deno,   npm run test:functions (Node shim, 3.4).
// No jsr imports on purpose so the same file runs under `node --experimental-strip-types` with globalThis.Deno = {test}.
// Fixtures are the LIVE style_cards json rows, fetched verbatim on 2026-09-30 (see fixtures/*.json "source").
import {
  AGREEMENT_WARN_BELOW,
  BACKGROUND_LITERAL,
  checkStyleCard,
  clusterSwatches,
  deltaE76,
  familiesIn,
  hexToLab,
  imageNumbers,
  looselyIncludes,
  normaliseCase,
  type Sheet,
  type StyleCardV2,
} from "../_shared/style_card_rules.ts";
import chickenV1 from "./fixtures/chicken_v1_0b86b10e.json" with { type: "json" };
import chickenV2 from "./fixtures/chicken_v2_695743b6.json" with { type: "json" };
import e2eV4 from "./fixtures/e2e_v4_2e6c714a.json" with { type: "json" };

function assert(cond: unknown, msg?: string): void {
  if (!cond) throw new Error("Assertion failed" + (msg ? ": " + msg : ""));
}
function assertEquals<T>(a: T, b: T, msg?: string): void {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((msg ? msg + ": " : "") + "expected " + jb + " got " + ja);
}
function some(list: string[], re: RegExp): boolean {
  return list.some((s) => re.test(s));
}
function countMatching(list: string[], re: RegExp): number {
  return list.filter((s) => re.test(s)).length;
}

const V1 = chickenV1.json as unknown as StyleCardV2;
const V2 = chickenV2.json as unknown as StyleCardV2;
const E2E = e2eV4.json as unknown as StyleCardV2;
const E2E_BRIEF = e2eV4.client.style_brief;
const E2E_GARMENTS = e2eV4.client.garment_colors;
const CHICKEN_IMAGES = 9; // client_references count of f947a150 (Chicken Happy Hour)
const E2E_IMAGES = 6;

// ---------------------------------------------------------------------------
// Chicken v1 (0b86b10e) - the 2-colour draft with 'Locked:' prefixes and case as_typed

Deno.test("v1: palette count 2 is an error, and the only error", () => {
  const r = checkStyleCard(V1, { image_count: CHICKEN_IMAGES });
  assert(some(r.errors, /^palette has 2 entries/), "palette count 2 error: " + JSON.stringify(r.errors));
  assertEquals(r.errors.length, 1, "no other error on v1: " + JSON.stringify(r.errors));
});

Deno.test("v1: 'Locked:' prefixes stripped exactly twice (typography.placement + composition)", () => {
  const r = checkStyleCard(V1, { image_count: CHICKEN_IMAGES });
  assertEquals(countMatching(r.fixes, /stripped rule prefix "Locked/), 2, JSON.stringify(r.fixes));
  assert(r.card.typography?.placement?.startsWith("Arched prominently"), "placement without prefix: " + r.card.typography?.placement);
  assert(r.card.composition?.startsWith("A prominently scaled"), "composition without prefix: " + r.card.composition);
  assert(!/\b(locked|a guide|strict|flexible|as[_ ]typed)\b/i.test(r.card.composition ?? ""), "no rule word left in composition");
});

Deno.test("v1: typography.case as_typed -> '' with the 'not a letter case' warning", () => {
  const r = checkStyleCard(V1, { image_count: CHICKEN_IMAGES });
  assertEquals(r.card.typography?.case, "", "case emptied");
  assert(some(r.fixes, /^typography\.case: "as_typed" -> ""$/), "case fix logged: " + JSON.stringify(r.fixes));
  assert(some(r.warnings, /typography\.case .*is not a letter case; the text block defines case/), JSON.stringify(r.warnings));
});

Deno.test("v1: sentence-valued linework.weight -> 'fine', remainder appended to linework.style, logged once", () => {
  const r = checkStyleCard(V1, { image_count: CHICKEN_IMAGES });
  assertEquals(r.card.linework?.weight, "fine");
  assert((r.card.linework?.style ?? "").includes("precise, and highly detailed, anchored by clean, solid outer contours"), "remainder in style: " + r.card.linework?.style);
  // the trailing '.' strip is a separate, legitimate fix; the vocabulary fix itself must be logged once (no lower-case pre-fix)
  assertEquals(countMatching(r.fixes, /^linework\.weight: ".*" -> "fine"/), 1, JSON.stringify(r.fixes.filter((f) => f.startsWith("linework.weight"))));
  assert(!some(r.fixes, /^linework\.weight: "Fine, precise.*" -> "fine, precise/), "no lower-case pre-fix on a sentence");
});

// ---------------------------------------------------------------------------
// Chicken v2 (695743b6 == generations 006b5ba1 style_card_snapshot) - brand text leaked into style, cow in composition

Deno.test("v2: forbid[4] and signature_moves[1] removed as text demands", () => {
  const r = checkStyleCard(V2, { image_count: CHICKEN_IMAGES });
  assert(some(r.fixes, /^forbid\[4\] removed: "Omitting the bottom center social media handle"/), JSON.stringify(r.fixes));
  assert(some(r.fixes, /^signature_moves\[1\] removed: "Anchoring every design with a social media handle/), JSON.stringify(r.fixes));
  assertEquals(r.card.forbid?.length, 5);
  assertEquals(r.card.signature_moves?.length, 3);
  assert(!r.card.forbid?.some((f) => /handle|omitting/i.test(f)), "no handle left in forbid");
  assert(!r.card.signature_moves?.some((f) => /@|handle/i.test(f)), "no handle left in signature_moves");
});

Deno.test("v2: the handle is extracted into brand_text.items[0].text = '@TheHappyHourFarm' (placement bottom center)", () => {
  const r = checkStyleCard(V2, { image_count: CHICKEN_IMAGES });
  const items = r.card.brand_text?.items ?? [];
  assertEquals(items[0]?.text, "@TheHappyHourFarm");
  assertEquals(items[0]?.role, "handle");
  assertEquals(items[0]?.placement, "bottom center");
  assertEquals(items[1]?.text, "@HighlandCowHappyHour");
  assert(some(r.fixes, /^brand_text\.items: added "@TheHappyHourFarm" \(handle\)$/), JSON.stringify(r.fixes));
});

Deno.test("v2: composition '(highland cow)' -> the hero; no 'cow' remains in composition", () => {
  const r = checkStyleCard(V2, { image_count: CHICKEN_IMAGES });
  assert(some(r.fixes, /^composition: "\(highland cow\)" -> "\(the hero\)"$/), JSON.stringify(r.fixes));
  assert(!/cow/i.test(r.card.composition ?? ""), "composition: " + r.card.composition);
  assert((r.card.composition ?? "").includes("A central hero illustration (the hero) sits"), r.card.composition ?? "");
});

Deno.test("v2: 14 trailing periods stripped (live row and the 006b5ba1 snapshot both hold 14 such strings, not the spec's 18)", () => {
  const r = checkStyleCard(V2, { image_count: CHICKEN_IMAGES });
  // verified with SQL on 2026-09-30: count of jsonb string leaves ending in '.' = 14 for both the style_cards row
  // and generations 006b5ba1.style_card_snapshot (which is byte-identical to the row)
  assertEquals(countMatching(r.fixes, /: stripped trailing "\.+"$/), 14, JSON.stringify(r.fixes));
  let trailing = 0;
  const walk = (v: unknown): void => {
    if (typeof v === "string") { if (/[.;,]$/.test(v)) trailing++; }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  const { rules: _rules, ...prose } = r.card;
  walk(prose);
  assertEquals(trailing, 0, "no prose string ends in punctuation after the fixes");
});

Deno.test("v2: the surviving text demand in composition/placement and 'locked' in placement are errors (repair-call territory)", () => {
  const r = checkStyleCard(V2, { image_count: CHICKEN_IMAGES });
  // a handle counts as a text demand only when named as one ('social media handle', 'social handle'); see the mug-handle test
  assert(some(r.errors, /^composition still contains a text demand "social media handle"$/), JSON.stringify(r.errors));
  assert(some(r.errors, /^typography\.placement still contains a text demand "social handle"$/), JSON.stringify(r.errors));
  assert(some(r.errors, /^typography\.placement still contains the rule word "locked"$/), JSON.stringify(r.errors));
  assertEquals(r.errors.length, 3, JSON.stringify(r.errors));
});

Deno.test("v2 with brief.subjects ['Highland cows','chickens'] -> error 'brief subject missing: chickens' only", () => {
  const r = checkStyleCard(V2, { image_count: CHICKEN_IMAGES, brief: { subjects: ["Highland cows", "chickens"] } });
  assert(r.errors.includes("brief subject missing: chickens"), JSON.stringify(r.errors));
  assert(!some(r.errors, /brief subject missing: Highland cows/), "Highland cows is loosely included");
});

Deno.test("v2: vibe naming five lettering families warns to split headline/secondary", () => {
  const r = checkStyleCard(V2, { image_count: CHICKEN_IMAGES });
  assert(some(r.warnings, /^typography\.vibe names 5 lettering families/), JSON.stringify(r.warnings));
  assertEquals(familiesIn(V2.typography?.vibe ?? ""), ["slab_serif", "display_serif", "script", "brush", "woodtype"]);
  assertEquals(familiesIn(V1.typography?.vibe ?? ""), ["display_serif"]);
});

// ---------------------------------------------------------------------------
// E2E v4 (2e6c714a, locked) - clean apart from 'QA test move' and the sentence weight

Deno.test("E2E v4 with 'QA test move' as a brief must_have -> moved to brief_check.must_have_not_seen + warning", () => {
  // The spec's acceptance presumes the move is a brief must_have; the live E2E brief lists only two items, so the
  // test extends it. The two live must_have items ARE supported by the evidence notes and stay in signature_moves.
  const brief = { ...E2E_BRIEF, must_have: [...E2E_BRIEF.must_have, "QA test move"] };
  const r = checkStyleCard(E2E, { image_count: E2E_IMAGES, brief, client_garments: E2E_GARMENTS });
  assert(some(r.warnings, /^QA test move not seen in images$/), JSON.stringify(r.warnings));
  assert(some(r.fixes, /^signature_moves\[2\] "QA test move" moved to brief_check\.must_have_not_seen/), JSON.stringify(r.fixes));
  assertEquals(r.card.brief_check?.must_have_not_seen, ["QA test move"]);
  assert(!r.card.signature_moves?.includes("QA test move"), "moved out of signature_moves");
  assert(r.card.signature_moves?.includes("circular badge frame"), "supported must_have stays");
  assert(r.card.signature_moves?.includes("ink banner across the bottom"), "supported must_have stays");
  assertEquals(r.errors, [], "no errors on E2E v4");
});

Deno.test("E2E v4 with the live brief -> zero errors; garments differ from the client's -> warning; weight sentence -> heavy", () => {
  const r = checkStyleCard(E2E, { image_count: E2E_IMAGES, brief: E2E_BRIEF, client_garments: E2E_GARMENTS });
  assertEquals(r.errors, []);
  assert(some(r.warnings, /^garment_colors \[black, forest green, heather grey, navy\] differ from the client's garments \[black, white\]$/), JSON.stringify(r.warnings));
  assert(!some(r.warnings, /QA test move/), "no must_have warning without the brief item");
  assertEquals(r.card.linework?.weight, "heavy", "Thick -> heavy");
  assertEquals(r.card.typography?.case, "UPPER", "UPPER kept");
  // 'pine trees' is a SUPPORTING element ('A cluster of stylized pine trees') on this locked card: it is kept as written
  // and warned about, never rewritten to 'A cluster of stylized the hero' (prompt-engine lints every card at render time)
  assert(!some(r.fixes, /^composition: ".*" -> ".*hero/), "no hero rewrite on E2E v4: " + JSON.stringify(r.fixes.filter((f) => f.startsWith("composition"))));
  assertEquals(r.card.composition, (E2E.composition ?? "").replace(/\.$/, ""), "composition rendered as stored (minus the trailing period)");
  assert((r.card.composition ?? "").includes("A cluster of stylized pine trees sits on the lower left of the mountains"), r.card.composition ?? "");
  assert(some(r.warnings, /^composition names the subject "pine trees" as a supporting element/), JSON.stringify(r.warnings));
});

Deno.test("composition: a subject in hero position becomes 'the hero'; supporting elements and ambiguous mentions are kept with a warning", () => {
  const subjects = ["Highland cows", "Pitbulls", "Sunflowers", "UFOs"];
  const run = (composition: string) => checkStyleCard({ ...CLEAN_V2, subjects, composition }, { image_count: 4 });
  const compFixes = (r: ReturnType<typeof checkStyleCard>) => r.fixes.filter((f) => f.startsWith("composition:"));
  const compWarns = (r: ReturnType<typeof checkStyleCard>) => r.warnings.filter((w) => w.startsWith("composition names"));

  // hero verb after the phrase; the article is consumed so the sentence still reads; sunflowers stay (supporting, one hero per sentence)
  let r = run("A highland cow sits in the middle, framed by arched text above and sunflowers below");
  assertEquals(r.card.composition, "The hero sits in the middle, framed by arched text above and sunflowers below");
  assertEquals(compFixes(r), ["composition: \"A highland cow\" -> \"The hero\""]);
  assertEquals(compWarns(r).length, 1, JSON.stringify(r.warnings));
  assert(compWarns(r)[0].startsWith("composition names the subject \"sunflowers\" as a supporting element"), compWarns(r)[0]);

  // direct definite article: the thing text frames is the hero; 'a small sunflower' is supporting ('small' wins over 'sits');
  // 'UFO' is too short to be a subject pattern at all (singular < 4 chars), so it is neither rewritten nor reported
  r = run("Bold text frames the pitbull; a small sunflower sits top right beside a UFO");
  assertEquals(r.card.composition, "Bold text frames the hero; a small sunflower sits top right beside a UFO");
  assertEquals(compWarns(r).length, 1, JSON.stringify(r.warnings));
  assert(compWarns(r)[0].startsWith("composition names the subject \"sunflower\" as a supporting element"), compWarns(r)[0]);

  // hero noun after the phrase
  r = run("Pitbull head centered, text arched above");
  assertEquals(r.card.composition, "The hero head centered, text arched above");

  // hero word before + adjective run consumed ('A central highland cow portrait' -> 'The hero portrait')
  r = run("A central highland cow portrait fills the badge, with sunflowers scattered around it");
  assertEquals(r.card.composition, "The hero portrait fills the badge, with sunflowers scattered around it");

  // no hero evidence at all: nothing is rewritten, both subjects are reported
  r = run("Stacked layout: sunflowers scattered around a highland cow");
  assertEquals(r.card.composition, "Stacked layout: sunflowers scattered around a highland cow");
  assertEquals(compFixes(r), []);
  assertEquals(compWarns(r).length, 2, JSON.stringify(r.warnings));

  // the reviewer's one-word probe on the E2E card: 'Concentric circular badge format' is never 'Concentric circular the hero format',
  // and the sentence 'A large, solid-colored circle anchors ...' gets ONE hero, not 'solid-colored the hero'
  const one = checkStyleCard({ ...E2E, subjects: ["Badges", "Mountains", "Circles"] }, { image_count: E2E_IMAGES });
  const comp = one.card.composition ?? "";
  assert(comp.startsWith("Concentric circular badge format. The hero anchors the center, partially covered by flat mountain silhouettes"), comp);
  assert(!/solid-colored the hero|circular the hero|stylized the hero/.test(comp), comp);
  assert(some(one.warnings, /^composition names the subject "badge"/), JSON.stringify(one.warnings));
  assert(some(one.warnings, /^composition names the subject "mountain" as a supporting element/), JSON.stringify(one.warnings));

  // the Chicken v2 apposition still resolves, and the clean sample is untouched
  assert(some(checkStyleCard(V2, { image_count: CHICKEN_IMAGES }).fixes, /^composition: "\(highland cow\)" -> "\(the hero\)"$/), "apposition after 'hero illustration'");
  assertEquals(compWarns(checkStyleCard(CLEAN_V2, { image_count: 4 })), []);
});

// ---------------------------------------------------------------------------
// a clean v2 sample

const CLEAN_V2: StyleCardV2 = {
  schema: 2,
  medium: "vintage etching and woodcut illustration",
  realism: "detailed",
  linework: { weight: "fine", style: "dense hand-drawn hatching and contour strokes", outline: "thin" },
  shading: "hatching density only, no gradients",
  shading_method: "hatching",
  texture: "organic grit from the linework",
  edge_finish: "clean",
  palette: [
    { name: "Line Art Black", hex: "#0C0C0C", weight: "dominant", role: "line", images: [1, 2, 3, 4] },
    { name: "White", hex: "#F9F9F9", weight: "secondary", role: "fill", images: [1, 2, 4] },
    { name: "Rust Brown", hex: "#8C3B1A", weight: "accent", role: "accent", images: [3, 4] },
  ],
  palette_variants: [],
  composition: "Centrally aligned and vertically stacked; the hero sits in the middle framed by arched text above and straight text below",
  hero: { framing: "chest_up", scale: "large" },
  typography: {
    vibe: "vintage western slab serif",
    placement: "arched above the hero and straight below",
    case: "UPPER",
    headline: { family: "slab_serif", weight: "bold", effects: ["arched"] },
    secondary: { family: "script", weight: "regular", effects: [] },
  },
  background: BACKGROUND_LITERAL,
  mood: ["rustic", "humorous"],
  subjects: ["Highland cows", "chickens"],
  subject_sources: { "Highland cows": "both", chickens: "brief" },
  brand_text: { items: [{ text: "@TheHappyHourFarm", role: "handle", placement: "bottom center" }], always_present: true },
  forbid: ["gradients", "photorealism", "asymmetrical layouts"],
  signature_moves: ["four-point sparkles in the negative space", "symmetrical text frame"],
  garment_colors: ["black", "tan"],
  representative_images: [1, 2, 4],
  field_evidence: { "linework.weight": { images: [1, 2, 3, 4], contradicts: [] }, "signature_moves[1]": { images: [1, 2], contradicts: [] } },
  brief_check: { must_have_seen: [], must_have_not_seen: [], avoid_seen_in: [] },
  evidence: ["IMAGE 1: fine hatching", "IMAGE 2: arched headline", "IMAGE 3: rust accent", "IMAGE 4: sparkles", "IMAGE 1, 2: white fills"],
  rules: { palette_mode: "strict", text_case: "upper", lock_typography: true, lock_composition: true },
};

Deno.test("clean v2 sample -> zero errors, zero fixes, zero warnings", () => {
  const r = checkStyleCard(CLEAN_V2, { image_count: 4, brief: { subjects: ["Highland cows", "chickens"], must_have: ["symmetrical text frame"] }, client_garments: ["black", "tan"] });
  assertEquals(r.errors, []);
  assertEquals(r.fixes, []);
  assertEquals(r.warnings, []);
});

Deno.test("input card is never mutated and the check is deterministic", () => {
  const before = JSON.stringify(V2);
  const a = checkStyleCard(V2, { image_count: CHICKEN_IMAGES });
  const b = checkStyleCard(V2, { image_count: CHICKEN_IMAGES });
  assertEquals(JSON.stringify(V2), before, "input untouched");
  assertEquals(JSON.stringify(a), JSON.stringify(b), "same result twice");
});

// ---------------------------------------------------------------------------
// individual rules

Deno.test("case synonyms map to the enum; anything else empties with a warning", () => {
  assertEquals(normaliseCase("uppercase"), "UPPER");
  assertEquals(normaliseCase("ALL CAPS"), "UPPER");
  assertEquals(normaliseCase("Title Case"), "Title");
  assertEquals(normaliseCase("lowercase"), "lower");
  assertEquals(normaliseCase("mixed"), "Mixed");
  assertEquals(normaliseCase("as written"), "");
  assertEquals(normaliseCase("as_typed"), "");
  const r = checkStyleCard({ ...CLEAN_V2, typography: { ...CLEAN_V2.typography, case: "all caps" } }, { image_count: 4 });
  assertEquals(r.card.typography?.case, "UPPER");
  assert(some(r.fixes, /^typography\.case: "all caps" -> "UPPER"$/), JSON.stringify(r.fixes));
  assert(!some(r.warnings, /letter case/), "a mapped synonym does not warn");
});

Deno.test("forbid: 'No gradients' is rewritten to the thing itself, a presence demand warns, only TEXT demands are removed; a mug handle and watermarks are visual", () => {
  const r = checkStyleCard({
    ...CLEAN_V2,
    forbid: ["No gradients", "No drop shadows", "watermarks or signatures", "photo textures", "Missing teeth grin", "a mug handle", "Never use neon hues",
      "Omitting the bottom center social media handle", "@TheHappyHourFarm anywhere"],
    signature_moves: ["No-fill outlined lettering", "Lack of outline on the hero", "hand-drawn tagline banner ribbon", "a small watermark bottom right", "the Instagram handle under the art"],
  }, { image_count: 4 });
  assertEquals(r.card.forbid, ["gradients", "drop shadows", "watermarks or signatures", "photo textures", "Missing teeth grin", "a mug handle", "neon hues"]);
  assert(some(r.fixes, /^forbid\[0\]: "No gradients" -> "gradients" \(a forbid names the thing itself\)$/), JSON.stringify(r.fixes));
  assert(some(r.fixes, /^forbid\[6\]: "Never use neon hues" -> "neon hues"/), JSON.stringify(r.fixes));
  assert(some(r.fixes, /^forbid\[7\] removed: "Omitting the bottom center social media handle"/), JSON.stringify(r.fixes));
  assert(some(r.fixes, /^forbid\[8\] removed: "@TheHappyHourFarm anywhere"/), JSON.stringify(r.fixes));
  assert(some(r.warnings, /^forbid\[4\] "Missing teeth grin" reads as a presence demand/), JSON.stringify(r.warnings));
  assert(!some(r.errors, /forbid/), "seven visual forbids remain, no count error, no text-demand error: " + JSON.stringify(r.errors));
  // signature moves: an absence is a legitimate trait; watermark / tagline / handle are text demands there
  assertEquals(r.card.signature_moves, ["No-fill outlined lettering", "Lack of outline on the hero"]);
  assert(some(r.fixes, /^signature_moves\[2\] removed: "hand-drawn tagline banner ribbon"/), JSON.stringify(r.fixes));
  assert(some(r.fixes, /^signature_moves\[3\] removed: "a small watermark bottom right"/), JSON.stringify(r.fixes));
  assert(some(r.fixes, /^signature_moves\[4\] removed: "the Instagram handle under the art"/), JSON.stringify(r.fixes));
  assertEquals(r.card.brand_text?.items?.some((i) => i.text === "@TheHappyHourFarm"), true, "handle literal extracted into brand_text");
  // the studio's own print rules forbid watermarks: a forbid 'watermarks' must never be an error, a composition naming one is
  const w = checkStyleCard({ ...CLEAN_V2, forbid: ["watermarks", "gradients"], composition: "the hero centered with a small watermark bottom right" }, { image_count: 4 });
  assert(!some(w.errors, /^forbid/), JSON.stringify(w.errors));
  assert(w.errors.includes("composition still contains a text demand \"watermark\""), JSON.stringify(w.errors));
});

Deno.test("brand_text.items[].text is verbatim: 'Farm Life Co.' and 'EST. 2019.' keep their punctuation", () => {
  const r = checkStyleCard({ ...CLEAN_V2, brand_text: { items: [{ text: "Farm Life Co.", role: "brand" }, { text: "EST. 2019.", role: "est", placement: "bottom center." }], always_present: true } }, { image_count: 4 });
  assertEquals(r.card.brand_text?.items?.map((i) => i.text), ["Farm Life Co.", "EST. 2019."]);
  assert(!some(r.fixes, /^brand_text\.items\[\d+\]\.text/), JSON.stringify(r.fixes));
  assertEquals(r.card.brand_text?.items?.[1].placement, "bottom center", "placement is prose and is still cleaned");
});

Deno.test("palette snap: two entries that fall on ONE sheet colour are merged (first wins), so no hex is listed twice; literal duplicates merge without sheets", () => {
  const sheets: Sheet[] = [1, 2, 3].map((i) => ({ image: i, quality: "clean", swatches: [{ hex: "#F5F2EB", area: "dominant" }, { hex: "#0D0D0D", area: "secondary" }, { hex: "#B84B34", area: "accent" }] }));
  const card: StyleCardV2 = { ...CLEAN_V2, palette: [
    { name: "Cream", hex: "#EAE6D9", weight: "dominant" }, { name: "White", hex: "#FFFFFF", weight: "secondary" },
    { name: "Black", hex: "#000000", weight: "accent" }, { name: "Charcoal", hex: "#1A1A1A", weight: "accent" }, { name: "Rust", hex: "#B84B34", weight: "accent" },
  ] };
  const r = checkStyleCard(card, { image_count: 4, sheets }); // CLEAN_V2 evidence cites IMAGE 4; the sheets cover 1..3
  assertEquals(r.card.palette?.map((p) => p.name + " " + p.hex), ["Cream #F5F2EB", "Black #0D0D0D", "Rust #B84B34"]);
  const hexes = r.card.palette!.map((p) => p.hex);
  assertEquals(new Set(hexes).size, hexes.length, "every hex once");
  assertEquals(r.card.palette?.[0].weight, "dominant");
  assertEquals(r.card.palette?.[0].images, [1, 2, 3]);
  assert(some(r.fixes, /^palette\[1\] "White" #F5F2EB merged into "Cream" #F5F2EB \(both snap to the same sheet colour\)$/), JSON.stringify(r.fixes));
  assert(some(r.fixes, /^palette\[3\] "Charcoal" #0D0D0D merged into "Black" #0D0D0D \(both snap to the same sheet colour\)$/), JSON.stringify(r.fixes));
  assertEquals(r.errors, [], "three distinct colours remain");
  // a literal duplicate hex (case-insensitive) merges without sheets; images are united
  const dup = checkStyleCard({ ...CLEAN_V2, palette: [
    { name: "Ink", hex: "#0C0C0C", weight: "dominant", role: "line", images: [1, 2] }, { name: "Text Black", hex: "#0c0c0c", weight: "accent", role: "text", images: [3] },
    { name: "White", hex: "#F9F9F9", weight: "secondary", images: [1, 2] }, { name: "Rust", hex: "#8C3B1A", weight: "accent", images: [3, 4] },
  ] }, { image_count: 4 });
  assertEquals(dup.card.palette?.map((p) => p.name), ["Ink", "White", "Rust"]);
  assertEquals(dup.card.palette?.[0].images, [1, 2, 3]);
  assert(some(dup.fixes, /^palette\[1\] "Text Black" #0C0C0C merged into "Ink" #0C0C0C \(same hex\)$/), JSON.stringify(dup.fixes));
  // merging can expose a palette the images do not support: two clusters -> the count error, never a duplicate hex
  const two = checkStyleCard({ ...card, palette: card.palette!.slice(0, 4) }, { image_count: 4, sheets });
  assertEquals(two.card.palette?.map((p) => p.hex), ["#F5F2EB", "#0D0D0D"]);
  assert(two.errors.includes("palette has 2 entries (3 to 8 required)"), JSON.stringify(two.errors));
});

Deno.test("hex is upper-cased; an invalid hex is an error; weights lower-cased", () => {
  const card: StyleCardV2 = { ...CLEAN_V2, palette: [
    { name: "a", hex: "#0c0c0c", weight: "Dominant", images: [1, 2] },
    { name: "b", hex: "F9F9F9", weight: "secondary", images: [1, 2] },
    { name: "c", hex: "#12345", weight: "accent", images: [1, 2] },
  ] };
  const r = checkStyleCard(card, { image_count: 4 });
  assertEquals(r.card.palette?.[0].hex, "#0C0C0C");
  assertEquals(r.card.palette?.[0].weight, "dominant");
  assertEquals(r.card.palette?.[1].hex, "#F9F9F9");
  assert(some(r.errors, /^palette\[2\]\.hex "#12345" is not #RRGGBB$/), JSON.stringify(r.errors));
});

Deno.test("two dominants -> one kept (sheet votes decide) and moved first; zero dominants -> first promoted", () => {
  const sheets: Sheet[] = [1, 2, 3].map((i) => ({ image: i, quality: "clean", swatches: [{ hex: "#F9F9F9", area: "dominant" }, { hex: "#0C0C0C", area: "secondary" }] }));
  const two: StyleCardV2 = { ...CLEAN_V2, palette: [
    { name: "black", hex: "#0C0C0C", weight: "dominant" },
    { name: "white", hex: "#F9F9F9", weight: "dominant" },
    { name: "rust", hex: "#8C3B1A", weight: "accent" },
  ] };
  const r = checkStyleCard(two, { image_count: 3, sheets });
  assertEquals(r.card.palette?.map((p) => p.name + ":" + p.weight), ["white:dominant", "black:secondary", "rust:accent"]);
  assert(some(r.fixes, /^palette\[0\] "black": "dominant" -> "secondary" \(one dominant only\)$/), JSON.stringify(r.fixes));
  assert(some(r.fixes, /^palette: dominant "white" moved first$/), JSON.stringify(r.fixes));
  assert(!some(r.errors, /dominant/), "no dominant error after the fix");

  const none: StyleCardV2 = { ...CLEAN_V2, palette: CLEAN_V2.palette!.map((p) => ({ ...p, weight: "accent" })) };
  const r2 = checkStyleCard(none, { image_count: 4 });
  assertEquals(r2.card.palette?.[0].weight, "dominant");
  assert(some(r2.fixes, /^palette\[0\] "Line Art Black": "accent" -> "dominant"/), JSON.stringify(r2.fixes));
  assert(!some(r2.errors, /dominant/), JSON.stringify(r2.errors));
});

Deno.test("evidence citing IMAGE n > image_count, field_evidence out of range, wrong background, thin evidence -> errors", () => {
  const card: StyleCardV2 = { ...CLEAN_V2, evidence: ["IMAGE 1: a", "IMAGE 2, 9: b", "IMAGE 3: c", "IMAGE 4: d"], field_evidence: { medium: { images: [1, 12] } }, background: "flat grey" };
  const r = checkStyleCard(card, { image_count: 4 });
  assert(r.errors.includes("evidence has 4 notes (at least 5 required)"), JSON.stringify(r.errors));
  assert(r.errors.includes("evidence[1] cites IMAGE 9 but only 4 images were analysed"), JSON.stringify(r.errors));
  assert(r.errors.includes("field_evidence.medium cites IMAGE 12 but only 4 images were analysed"), JSON.stringify(r.errors));
  assert(r.errors.includes("background must be exactly \"" + BACKGROUND_LITERAL + "\""), JSON.stringify(r.errors));
  assertEquals(imageNumbers("IMAGE 1, 2, 7: Classic"), [1, 2, 7]);
  assertEquals(imageNumbers("IMAGE 3 and 8: accent"), [3, 8]);
  assertEquals(imageNumbers("IMAGE 6: exception - green"), [6]);
});

Deno.test("empty medium / vibe without headline.family / forbid < 2 -> errors; headline.family alone satisfies typography", () => {
  const r = checkStyleCard({ ...CLEAN_V2, medium: "", typography: { vibe: "", placement: "" }, forbid: ["gradients"] }, { image_count: 4 });
  assert(r.errors.includes("medium is empty"), JSON.stringify(r.errors));
  assert(r.errors.includes("typography.vibe is empty and typography.headline.family is missing"), JSON.stringify(r.errors));
  assert(r.errors.includes("forbid has 1 entries (at least 2 required)"), JSON.stringify(r.errors));
  const ok = checkStyleCard({ ...CLEAN_V2, typography: { vibe: "", placement: "above", case: "UPPER", headline: { family: "slab_serif", weight: "bold", effects: [] } } }, { image_count: 4 });
  assert(!some(ok.errors, /typography\.vibe/), JSON.stringify(ok.errors));
});

Deno.test("rule words in prose fields are errors after the fixes; brief_check.must_have_not_seen and 'other' warn", () => {
  const r = checkStyleCard({
    ...CLEAN_V2,
    medium: "strict etching",
    shading: "a guide only",
    signature_moves: ["flexible framing", "as_typed lettering"],
    typography: { ...CLEAN_V2.typography, headline: { family: "other", weight: "bold", effects: [] } },
    brief_check: { must_have_seen: [], must_have_not_seen: ["ink banner"], avoid_seen_in: [] },
    representative_images: [],
  }, { image_count: 4 });
  assert(r.errors.includes("medium still contains the rule word \"strict\""), JSON.stringify(r.errors));
  assert(r.errors.includes("shading still contains the rule word \"a guide\""), JSON.stringify(r.errors));
  assert(r.errors.includes("signature_moves[0] still contains the rule word \"flexible\""), JSON.stringify(r.errors));
  assert(r.errors.includes("signature_moves[1] still contains the rule word \"as_typed\""), JSON.stringify(r.errors));
  assert(r.warnings.includes("ink banner not seen in images"), JSON.stringify(r.warnings));
  assert(r.warnings.includes("typography.headline.family is \"other\""), JSON.stringify(r.warnings));
  assert(r.warnings.includes("representative_images missing"), JSON.stringify(r.warnings));
});

Deno.test("looselyIncludes: whole words, singular/plural, either direction, no substring false positives", () => {
  assert(looselyIncludes(["Highland cows"], "highland cow"));
  assert(looselyIncludes(["Highland cows"], "cows"));
  assert(looselyIncludes(["chickens"], "Chicken"));
  assert(looselyIncludes(["Farm animals with humorous accessories (sunglasses, hats)"], "farm animals"));
  assert(!looselyIncludes(["Cowboy hats and western bandanas"], "cows"), "cow is not inside cowboy");
  assert(!looselyIncludes(["Highland cows"], "goats"));
});

// ---------------------------------------------------------------------------
// 1.6 palette snap + agreement (needs sheets)

const TRIPLETS = {
  cream: ["#EAE6D9", "#EBE8D8", "#F0EBE1"],
  charcoal: ["#151515", "#181A19", "#1A1A1A"],
  rust: ["#BA4B36", "#BA4830", "#B84B34"],
};

function e2eSheets(colorway = "light_garment"): Sheet[] {
  return [1, 2, 3].map((i) => ({
    image: i, quality: "clean", colorway, off_style: false,
    line_weight: "none", shading: "flat", edge_finish: "distressed", layout: "badge", hero: { framing: "scene", scale: "large" },
    text: [{ text: "TAKE THE LONG WAY", role: "headline", family: "condensed_sans", weight: "bold", case: "UPPER", effects: ["arched"], placement: "above_hero" }],
    swatches: [
      { hex: TRIPLETS.cream[i - 1], role: "fill", area: "dominant" },
      { hex: TRIPLETS.charcoal[i - 1], role: "line", area: "secondary" },
      { hex: TRIPLETS.rust[i - 1], role: "accent", area: "accent" },
    ],
  }));
}

Deno.test("CIELAB + deltaE76: E2E triplets are within one cluster (dE < 12), cream vs mustard is far", () => {
  for (const [name, hs] of Object.entries(TRIPLETS)) {
    const labs = hs.map((h) => hexToLab(h)!);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert(deltaE76(labs[i], labs[j]) < 12, name + " dE " + deltaE76(labs[i], labs[j]));
  }
  assert(deltaE76(hexToLab("#F0EBE1")!, hexToLab("#DAA53F")!) > 40, "cream vs mustard far apart");
  assertEquals(hexToLab("nope"), null);
  const white = hexToLab("#FFFFFF")!;
  assert(Math.abs(white[0] - 100) < 0.01 && Math.abs(white[1]) < 0.05 && Math.abs(white[2]) < 0.05, "white is L=100, a=b=0: " + JSON.stringify(white));
});

Deno.test("palette snap: each E2E triplet snaps to ONE hex (its medoid), with snapped_from and images recorded", () => {
  const sheets = e2eSheets();
  const clusters = clusterSwatches(sheets);
  assertEquals(clusters.length, 3, "three clusters: " + JSON.stringify(clusters.map((c) => c.hex)));
  for (const [name, hs] of Object.entries(TRIPLETS)) {
    const snapped = new Set<string>();
    for (const h of hs) {
      const card: StyleCardV2 = { ...CLEAN_V2, palette: [
        { name, hex: h, weight: "dominant" }, { name: "x", hex: "#DAA53F", weight: "accent" }, { name: "y", hex: "#324B3B", weight: "accent" },
      ] };
      const r = checkStyleCard(card, { image_count: 3, sheets });
      const e = r.card.palette![0];
      snapped.add(e.hex!);
      assert(hs.includes(e.hex!), name + " snaps onto a member hex: " + e.hex);
      assertEquals(e.images, [1, 2, 3], name + " images");
      if (e.hex !== h) {
        assertEquals(e.snapped_from, h, name + " snapped_from");
        assert(some(r.fixes, new RegExp("^palette\\[0\\]\\.hex: \"" + h + "\" snapped to \"" + e.hex + "\" \\(seen in images 1, 2, 3\\)$")), JSON.stringify(r.fixes));
      }
      assert(!r.card.palette![1].images, "mustard is on no sheet -> no images");
      assert(some(r.warnings, /^palette\[1\] "x" #DAA53F is seen in fewer than 2 images$/), JSON.stringify(r.warnings));
    }
    assertEquals(snapped.size, 1, name + " -> one hex, got " + JSON.stringify([...snapped]));
  }
});

Deno.test("palette snap: a colour the brief names is not warned about when unsupported", () => {
  const card: StyleCardV2 = { ...CLEAN_V2, palette: [
    { name: "cream", hex: "#EAE6D9", weight: "dominant" }, { name: "Mustard Yellow", hex: "#DAA53F", weight: "accent" }, { name: "charcoal", hex: "#1A1A1A", weight: "secondary" },
  ] };
  const r = checkStyleCard(card, { image_count: 3, sheets: e2eSheets(), brief: { must_have: ["a mustard yellow sun disc"] } });
  assert(!some(r.warnings, /Mustard Yellow/), JSON.stringify(r.warnings));
});

Deno.test("palette_variants built when >= 2 sheets fall on each garment side and the sides differ in > 1 cluster", () => {
  const dark: Sheet[] = [1, 2].map((i) => ({ image: i, quality: "clean", colorway: "dark_garment", swatches: [{ hex: TRIPLETS.cream[i - 1], area: "dominant" }, { hex: TRIPLETS.charcoal[i - 1], area: "secondary" }] }));
  const light: Sheet[] = [3, 4].map((i) => ({ image: i, quality: "clean", colorway: "light_garment", swatches: [{ hex: TRIPLETS.cream[i - 2], area: "dominant" }, { hex: TRIPLETS.rust[i - 3], area: "accent" }, { hex: "#DAA53F", area: "accent" }] }));
  const card: StyleCardV2 = { ...CLEAN_V2, palette: [
    { name: "cream", hex: "#EAE6D9", weight: "dominant" }, { name: "charcoal", hex: "#1A1A1A", weight: "secondary" },
    { name: "rust", hex: "#B84B34", weight: "accent" }, { name: "mustard", hex: "#DAA53F", weight: "accent" },
  ] };
  const r = checkStyleCard(card, { image_count: 4, sheets: [...dark, ...light] });
  const pv = r.card.palette_variants ?? [];
  assertEquals(pv.map((v) => v.garment), ["dark", "light"], JSON.stringify(pv));
  assertEquals(pv[0].images, [1, 2]);
  assertEquals(pv[1].images, [3, 4]);
  assertEquals(pv[0].hexes.length, 2, "dark side: cream + charcoal");
  assertEquals(pv[1].hexes.length, 3, "light side: cream + rust + mustard");
  assert(some(r.fixes, /^palette_variants: built 2 colourways from the sheets/), JSON.stringify(r.fixes));
  // one side only -> no variants
  const r2 = checkStyleCard(card, { image_count: 3, sheets: e2eSheets() });
  assertEquals(r2.card.palette_variants, [], "no variants on a single colourway");
});

Deno.test("agreement: mode share per enum field lands in field_evidence[path].agreement; low agreement warns; low_res/off_style sheets excluded", () => {
  const sheets = e2eSheets();
  sheets[2].line_weight = "bold"; // 2 of 3 say none -> 0.67
  sheets.push({ image: 4, quality: "low_res", line_weight: "bold", shading: "hatching" }); // excluded: low_res
  sheets.push({ image: 5, quality: "clean", off_style: true, line_weight: "bold", shading: "hatching" }); // excluded: off_style
  const card: StyleCardV2 = { ...CLEAN_V2, field_evidence: {}, linework: { weight: "none", style: "flat shapes" }, shading_method: "flat", edge_finish: "distressed", hero: { framing: "scene", scale: "large" } };
  const r = checkStyleCard(card, { image_count: 5, sheets });
  // a profiler-supplied field_evidence entry keeps its images and only gains the agreement number
  const kept = checkStyleCard({ ...card, field_evidence: { "linework.weight": { images: [1, 2, 3], contradicts: [] } } }, { image_count: 5, sheets });
  assertEquals(kept.card.field_evidence?.["linework.weight"], { images: [1, 2, 3], contradicts: [], agreement: 0.67 });
  assertEquals(r.agreement["linework.weight"], 0.67);
  assertEquals(r.agreement["shading_method"], 1);
  assertEquals(r.agreement["edge_finish"], 1);
  assertEquals(r.agreement["composition"], 1);
  assertEquals(r.agreement["hero.framing"], 1);
  assertEquals(r.agreement["typography.headline.family"], 1);
  assertEquals(r.agreement["typography.case"], 1);
  assertEquals(r.card.field_evidence?.["linework.weight"]?.agreement, 0.67);
  assertEquals(r.card.field_evidence?.["linework.weight"]?.images, [1, 2]);
  assertEquals(r.card.field_evidence?.["linework.weight"]?.contradicts, [3]);
  assert(!some(r.warnings, /low agreement/), "0.67 is above " + AGREEMENT_WARN_BELOW);

  const split = e2eSheets();
  split[0].shading = "hatching"; split[1].shading = "cel"; // 1/3 each -> 0.33
  const r2 = checkStyleCard(card, { image_count: 3, sheets: split });
  assertEquals(r2.agreement["shading_method"], 0.33);
  assert(some(r2.warnings, /^low agreement for shading_method: 0\.33 \(mode "cel" in 1 of 3 sheets\)$/), JSON.stringify(r2.warnings));
});

Deno.test("no sheets -> no agreement, no snap, no per-image palette warnings on a v1-shaped card", () => {
  const r = checkStyleCard(E2E, { image_count: E2E_IMAGES });
  assertEquals(r.agreement, {});
  assert(!some(r.fixes, /snapped to/), "no snap without sheets");
  assert(!some(r.warnings, /fewer than 2 images/), "no support warnings without sheets or images");
});

Deno.test("garbage input -> a single error, never a throw", () => {
  const r = checkStyleCard("not a card", {});
  assertEquals(r.errors, ["card must be a JSON object"]);
  const r2 = checkStyleCard({ palette: "nope", typography: null, forbid: 3, evidence: { a: 1 } }, { image_count: 2 });
  assert(r2.errors.length >= 4, JSON.stringify(r2.errors));
});
