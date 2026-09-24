// Golden tests for the deterministic renderer. Run: deno test supabase/functions/prompt-engine/
// No jsr imports on purpose so the same file also runs under a Node shim when deno is absent.
import {
  applyEdit,
  EditError,
  imageRoleLabels,
  type MagicPrompt,
  pickAspect,
  pickTierRule,
  renderPrompt,
  renderStyleCard,
  spellOut,
  TARGETED_EDIT_RULE,
} from "./render.ts";

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
  const sc = renderStyleCard(styleCardJson);
  return {
    print_rules: "PRINT RULES (fixture): flat grey background, no shadows.",
    style_card: { version: 2, prose: sc.prose, negatives: sc.negatives },
    lessons: ["Never let grunge eat into letterforms."],
    exemplars: ["BRIEF: Vintage bear badge for a hiking brand. TEXT: TAKE THE LONG WAY"],
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
    brief: { description: "Vintage bear badge for a hiking brand", garment_color: "black", placement: "front_chest", avoid_notes: "no skulls" },
    text: {
      rule: "TEXT - EXACT, NOTHING ELSE:\n- Render EXACTLY the QUOTE / ON-DESIGN TEXT provided, character for character, spelled exactly.",
      typography: "condensed vintage sans, arched over the hero, upper",
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
  assert(out.includes("(locked v2)"), "style card version shown");
});

Deno.test("forbid tokens land in the NEGATIVE line", () => {
  const out = renderPrompt(fixture());
  const neg = out.split("\n").find((l) => l.startsWith("NEGATIVE - never include:"));
  assert(neg, "NEGATIVE line exists");
  assert(neg!.includes("gradients") && neg!.includes("drop shadows"), "both forbid tokens in the negative line");
  assertEquals(count(out, "NEGATIVE - never include:"), 1, "negative line once");
});

Deno.test("no text lines -> 'no text anywhere' line, no QUOTE block", () => {
  const m = fixture();
  m.text.lines = [];
  const out = renderPrompt(m);
  assert(out.includes("no text anywhere"), "no text anywhere line present");
  assert(!out.includes("QUOTE / ON-DESIGN TEXT"), "no quote block");
});

Deno.test("section order follows the spec (print rules -> style card -> lessons -> exemplars -> reference -> tier -> brief -> text)", () => {
  const out = renderPrompt(fixture());
  const idx = [
    "PRINT RULES (fixture)",
    "CLIENT STYLE CARD",
    "LEARNED CLIENT PREFERENCES",
    "APPROVED EXEMPLARS",
    "REFERENCE DESIGN DESCRIPTION",
    "PRIMARY RULE - SIMILARITY POLICY (tier 4/5)",
    "\nBRIEF:\n",
    "QUOTE / ON-DESIGN TEXT",
  ].map((k) => out.indexOf(k));
  assert(idx.every((i) => i >= 0), "all sections present: " + JSON.stringify(idx));
  for (let i = 1; i < idx.length; i++) assert(idx[i] > idx[i - 1], "order at " + i);
  assert(out.includes("Image 1-2: style/subject references for this design; Image 3: examples of the client's established look"), "image role labels");
});

Deno.test("renderer is deterministic", () => {
  assertEquals(renderPrompt(fixture()), renderPrompt(fixture()));
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
