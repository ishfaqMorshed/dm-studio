// qc-judge v2 tests. Run: npm run test:functions (Node shim, spec 3.4)   or   deno test supabase/functions/qc-judge/
// No jsr imports on purpose (local assert helpers, like render_test.ts) so the file runs under node --experimental-strip-types.
import { readFile } from 'node:fs/promises';
import {
  ART_MATCH_KEYS, ART_NOT_REPORTED, ART_UNREADABLE, artCorrection, artStyleCheck, buildStyleMatch, fromArtReference, mentionedInInstruction, normaliseQc,
  parseArtMatch, parseRegionVerdict, pickStyleJson, REGION_CHECKS, REGION_NO_TEXT_NOTE, REGION_NOT_REPORTED, REGION_PALETTE_NOTE, regionContextOf,
  STYLE_FIELDS, subjectCorrection, UNREAD_MEDIUM_NOTE, UNREAD_PALETTE_NOTE, unreadArtLook,
} from './qc.ts';
import { CHICKEN_FORBID, FIXTURES } from './qc_fixtures.ts';

function assert(cond: unknown, msg?: string): void {
  if (!cond) throw new Error('Assertion failed' + (msg ? ': ' + msg : ''));
}
function assertEquals<T>(a: T, b: T, msg?: string): void {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((msg ? msg + ': ' : '') + 'expected ' + jb + ' got ' + ja);
}
function assertStringIncludes(hay: string, needle: string, msg?: string): void {
  if (!hay.includes(needle)) throw new Error((msg ? msg + ': ' : '') + JSON.stringify(hay) + ' does not include ' + JSON.stringify(needle));
}

const ctx = { exact_text_lines: ['FAMILY FIRST'], style_card: { palette: [{ name: 'ink', hex: '#111111', weight: 'dominant' }], forbid: ['gradients'] } };
const chickenCard = {
  palette: [{ name: 'Line Art Black', hex: '#0C0C0C', weight: 'dominant' }, { name: 'High Contrast White', hex: '#F9F9F9', weight: 'secondary' }],
  forbid: CHICKEN_FORBID,
  rules: { text_case: 'as_typed', palette_mode: 'strict', lock_typography: true, lock_composition: true },
};
const chickenCtx = { exact_text_lines: ['CHICKEN HAPPY HOUR', 'EST. 2026'], style_card: chickenCard, expected_subject: 'a highland cow', qc_subject_regen: true };
const styleCheck = (r: ReturnType<typeof normaliseQc>, id: string) => r.qc_report.style_match?.checks.find((c) => c.id === id);

// ---------------------------------------------------------------------------
// v1 behaviours that must not change

Deno.test('clean pass', () => {
  const r = normaliseQc(FIXTURES.cleanPass, ctx);
  assertEquals(r.qc_report.verdict, 'pass');
  assertEquals(r.qc_report.score, 100);
  assertEquals(r.needs_regen, false);
  assertEquals(r.qc_report.corrective_instruction, null);
  assertEquals(r.qc_report.text_ok, true);
  assertEquals(r.qc_report.parse_error, null);
  assertEquals(r.qc_report.checks.length, 11);
  assert(r.qc_report.checks.every((c) => c.pass === true));
  assertEquals(r.qc_report.version, 2);
});

Deno.test('text fail → needs_regen with corrective instruction', () => {
  const r = normaliseQc(FIXTURES.textFail, ctx);
  assertEquals(r.qc_report.verdict, 'fail');
  assertEquals(r.needs_regen, true);
  assertEquals(r.qc_report.text_ok, false);
  assertEquals(r.qc_report.score, 78);
  assertEquals(r.qc_report.checks.find((c) => c.id === 'text_matches')?.pass, false);
  assertEquals(r.qc_report.checks.find((c) => c.id === 'extra_text')?.pass, false);
  assertStringIncludes(r.qc_report.corrective_instruction!, 'CRITICAL CORRECTIONS - a previous attempt failed quality inspection.');
  assertStringIncludes(r.qc_report.corrective_instruction!, 'Spell the text exactly "FAMILY FIRST"; Remove the watermark');
  assertStringIncludes(r.qc_report.corrective_instruction!, '(F A M I L Y   F I R S T)');
  assertEquals(r.text_elements[0], { text: 'FAMILY FRIST © 2024', expected: ['FAMILY FIRST'], matches: false, min_height_frac: null });
});

Deno.test('malformed JSON → unverified, never regen', () => {
  const r = normaliseQc(FIXTURES.malformed, ctx);
  assertEquals(r.qc_report.verdict, 'unverified');
  assertEquals(r.needs_regen, false);
  assertEquals(r.qc_report.score, null);
  assertEquals(r.qc_report.style_match, null);
  assert(typeof r.qc_report.parse_error === 'string' && r.qc_report.parse_error.length > 0);
  assert(r.qc_report.checks.every((c) => c.pass === null));
  assertEquals(r.text_elements, []);
});

Deno.test('fenced JSON with prose and string booleans', () => {
  const r = normaliseQc(FIXTURES.fenced, ctx);
  assertEquals(r.qc_report.parse_error, null);
  assertEquals(r.qc_report.verdict, 'fail');
  assertEquals(r.needs_regen, true);
  assertEquals(r.qc_report.checks.find((c) => c.id === 'background_ok')?.pass, false);
  assertEquals(r.qc_report.checks.find((c) => c.id === 'text_once')?.pass, true); // missing key = not false
  assertEquals(r.qc_report.style_violations, ['uses a gradient behind the lettering']);
  assertEquals(r.qc_report.checks.find((c) => c.id === 'style_palette')?.pass, true); // a gradient note is not a palette violation
});

Deno.test('whole Gemini response object is unwrapped', () => {
  const r = normaliseQc(FIXTURES.geminiEnvelope, ctx);
  assertEquals(r.qc_report.verdict, 'pass');
  assertEquals(r.qc_report.min_text_height_frac, 0.12);
});

Deno.test('style-only violation (v1 palette_ok false) → warn, never regen, palette check false', () => {
  const r = normaliseQc(FIXTURES.styleOnly, ctx);
  assertEquals(r.qc_report.verdict, 'warn', 'v2: style findings warn; only core checks fail');
  assertEquals(r.qc_report.score, 100);
  assertEquals(r.qc_report.checks.find((c) => c.id === 'style_palette')?.pass, false);
  assertEquals(r.qc_report.style_violations, ['neon pink accent is not in the palette']);
  assertEquals(r.needs_regen, false);
  assertEquals(r.qc_report.corrective_instruction, null);
});

Deno.test('no expected text and empty/null raw', () => {
  const r = normaliseQc(null, { exact_text_lines: [] });
  assertEquals(r.qc_report.verdict, 'unverified');
  assertEquals(r.qc_report.parse_error, 'empty QC response');
  const r2 = normaliseQc(FIXTURES.noTextFail, { exact_text_lines: [] });
  assertEquals(r2.needs_regen, true);
  assertStringIncludes(r2.qc_report.corrective_instruction!, 'The image must contain NO text at all');
});

// ---------------------------------------------------------------------------
// v2: style_match, warn verdict, subject regen (spec 3.3)

Deno.test('006b5ba1 raw (no style key) → every style_match check not reported, verdict unchanged (pass)', () => {
  const r = normaliseQc(FIXTURES.live006b5ba1, { ...chickenCtx, expected_subject: '' });
  assertEquals(r.qc_report.verdict, 'pass');
  assertEquals(r.qc_report.score, 100);
  assertEquals(r.needs_regen, false);
  const sm = r.qc_report.style_match!;
  assertEquals(sm.checks.map((c) => c.id), ['palette', 'medium', 'typography', 'composition', 'subject', 'forbid']);
  assertEquals(sm.checks.map((c) => c.field), ['palette', 'medium', 'typography.headline', 'composition', 'subjects', 'forbid']);
  assert(sm.checks.every((c) => c.pass === null), JSON.stringify(sm.checks));
  assert(sm.checks.filter((c) => c.id !== 'subject').every((c) => c.note === 'not reported'), JSON.stringify(sm.checks));
  assertEquals(sm.checks.find((c) => c.id === 'subject')?.note, 'no subject given');
  assertEquals(sm.score, null);
  // the v1 tail keys still feed the compat check and the violations list
  assertEquals(r.qc_report.checks.find((c) => c.id === 'style_palette')?.pass, true);
  assertEquals(r.qc_report.style_violations, ['Omitting the bottom center social media handle']);
});

Deno.test('4199a165 raw (pass:false, 9/9 true) → warn, needs_regen false, score 100', () => {
  const r = normaliseQc(FIXTURES.live4199a165, { exact_text_lines: ['I am racoon baby', 'Adore ME', 'I love to eat'], style_card: chickenCard });
  assertEquals(r.qc_report.verdict, 'warn');
  assertEquals(r.qc_report.score, 100);
  assertEquals(r.needs_regen, false);
  assertEquals(r.qc_report.corrective_instruction, null);
  assert(r.qc_report.checks.every((c) => c.pass !== false), 'no check failed');
  assertEquals(r.qc_report.issues.length, 2, 'the judge issues are kept for the designer');
});

Deno.test('style.subject_ok=false + expected subject + flag → fail, needs_regen true, corrective names the subject', () => {
  const r = normaliseQc(FIXTURES.v2WrongHero, chickenCtx);
  assertEquals(r.qc_report.verdict, 'fail');
  assertEquals(r.needs_regen, true);
  assertEquals(r.qc_report.score, 100, 'core score untouched');
  assertEquals(styleCheck(r, 'subject'), { id: 'subject', field: 'subjects', pass: false, note: 'drawn: a chicken' });
  assertEquals(r.qc_report.style_match?.score, 83, '5 of 6 style checks pass');
  assertEquals(r.qc_report.style_match?.subject_seen, 'a chicken');
  assertEquals(r.qc_report.style_match?.case_seen, 'UPPER');
  assertStringIncludes(r.qc_report.corrective_instruction!, 'CRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: Draw a highland cow as the hero, not a chicken; the text is lettering only and never chooses the subject. The ONLY text in the image must read exactly: "CHICKEN HAPPY HOUR / EST. 2026"');
  assertEquals(subjectCorrection('a bear', ''), 'Draw a bear as the hero, not what the text names; the text is lettering only and never chooses the subject');
  // v2 puts text height / cropping inside "style"
  assertEquals(r.qc_report.min_text_height_frac, 0.08);
  assertEquals(r.qc_report.checks.find((c) => c.id === 'not_cropped')?.pass, true);
  assertEquals(r.qc_report.checks.find((c) => c.id === 'text_height')?.note, 'min glyph height 8.0% of image');
});

Deno.test('wrong hero without the flag, or without an expected subject → warn, no regen', () => {
  const off = normaliseQc(FIXTURES.v2WrongHero, { ...chickenCtx, qc_subject_regen: false });
  assertEquals(off.qc_report.verdict, 'warn');
  assertEquals(off.needs_regen, false);
  assertEquals(off.qc_report.corrective_instruction, null);
  assertEquals(styleCheck(off, 'subject')?.pass, false, 'the finding is still reported');
  const noSubject = normaliseQc(FIXTURES.v2WrongHero, { ...chickenCtx, expected_subject: '' });
  assertEquals(noSubject.qc_report.verdict, 'warn');
  assertEquals(noSubject.needs_regen, false);
  // the flag defaults to on when the context does not carry it
  const dflt = normaliseQc(FIXTURES.v2WrongHero, { exact_text_lines: chickenCtx.exact_text_lines, style_card: chickenCard, expected_subject: 'a highland cow' });
  assertEquals(dflt.needs_regen, true);
});

Deno.test('palette_ok=false only → warn, score 100, palette check false, no regen', () => {
  const r = normaliseQc(FIXTURES.v2PaletteOnly, chickenCtx);
  assertEquals(r.qc_report.verdict, 'warn');
  assertEquals(r.qc_report.score, 100);
  assertEquals(r.needs_regen, false);
  assertEquals(styleCheck(r, 'palette'), { id: 'palette', field: 'palette', pass: false, note: 'off-palette: teal #2F8F8F (small)' });
  assertEquals(r.qc_report.style_match?.score, 83);
  assertEquals(r.qc_report.checks.find((c) => c.id === 'style_palette')?.pass, false, 'compat check follows the v2 palette check');
  assertEquals(r.qc_report.style_violations, ['off-palette: teal #2F8F8F (small)']);
  // flexible mode: a small off-palette accent is allowed unless palette_ok says otherwise; a LARGE one fails
  const flexCard = { ...chickenCard, rules: { ...chickenCard.rules, palette_mode: 'flexible' } };
  const large = buildStyleMatch({ style: { palette_ok: true, off_palette_colours: [{ name: 'neon', hex: '#ff00ff', area: 'large' }] } }, flexCard, '');
  assertEquals(large.checks.find((c) => c.id === 'palette')?.pass, false, 'large off-palette area fails in flexible mode');
  const small = buildStyleMatch({ style: { palette_ok: true, off_palette_colours: [{ name: 'neon', hex: '#ff00ff', area: 'small' }] } }, flexCard, '');
  assertEquals(small.checks.find((c) => c.id === 'palette')?.pass, true);
});

Deno.test('forbid_hits [5] → style_violations includes forbidden element present: forbid[4]; composition guide never fails', () => {
  const r = normaliseQc(FIXTURES.v2ForbidHit, chickenCtx);
  assertEquals(r.qc_report.verdict, 'warn');
  assertEquals(r.needs_regen, false);
  assertEquals(styleCheck(r, 'forbid'), { id: 'forbid', field: 'forbid', pass: false, note: 'forbidden element present: Omitting the bottom center social media handle' });
  assertEquals(r.qc_report.style_violations, ['forbidden element present: Omitting the bottom center social media handle']);
  assertEquals(styleCheck(r, 'composition')?.pass, false, 'locked composition judged');
  // lock_composition false -> always pass
  const guide = normaliseQc(FIXTURES.v2ForbidHit, { ...chickenCtx, style_card: { ...chickenCard, rules: { ...chickenCard.rules, lock_composition: false } } });
  assertEquals(styleCheck(guide, 'composition'), { id: 'composition', field: 'composition', pass: true, note: 'guide - not judged' });
  // the v1 regex matcher is gone: an issue that merely mentions a forbid word no longer becomes a violation
  const mention = normaliseQc({ ...JSON.parse(FIXTURES.v2AllGood), issues: ['gradients look fine here'] }, { ...chickenCtx, style_card: { ...chickenCard, forbid: ['gradients'] } });
  assertEquals(mention.qc_report.style_violations, []);
  // out-of-range hit numbers are ignored
  const oob = buildStyleMatch({ style: { forbid_hits: [9, 2] } }, chickenCard, '');
  assertEquals(oob.checks.find((c) => c.id === 'forbid')?.note, 'forbidden element present: Photorealism or 3D rendering');
});

Deno.test('all style checks green → pass with style_match score 100', () => {
  const r = normaliseQc(FIXTURES.v2AllGood, chickenCtx);
  assertEquals(r.qc_report.verdict, 'pass');
  assertEquals(r.qc_report.style_match?.score, 100);
  assert(r.qc_report.style_match?.checks.every((c) => c.pass === true));
  assertEquals(styleCheck(r, 'subject')?.note, 'drawn: a highland cow');
  assertEquals(r.qc_report.style_violations, []);
  assertEquals(r.needs_regen, false);
});

Deno.test('v2 cropped / text too small inside "style" → fail on core checks, regen for cropping', () => {
  const r = normaliseQc(FIXTURES.v2CroppedAndSmall, chickenCtx);
  assertEquals(r.qc_report.verdict, 'fail');
  assertEquals(r.qc_report.checks.find((c) => c.id === 'not_cropped')?.pass, false);
  assertEquals(r.qc_report.checks.find((c) => c.id === 'text_height')?.pass, false);
  assertEquals(r.needs_regen, true);
  assertStringIncludes(r.qc_report.corrective_instruction!, 'Keep the artwork inside the frame');
  assertEquals(r.qc_report.min_text_height_frac, 0.02);
});

// ---------------------------------------------------------------------------
// art-style override (2026-10-01): the style JSON is prompt-engine v8's effective_style

// effective_style as prompt-engine v8 writes it for a card whose Art style reference governs the look
const artLook = {
  source: 'art_reference', reference_slot: 2,
  medium: 'screen-print vector', realism: 'stylised', linework: { weight: 'bold', style: 'uniform outlines', outline: '' },
  shading: 'halftone', shading_method: 'halftone', texture: 'paper grain', edge_finish: 'clean',
  palette: [{ name: 'cream', hex: '#F2E8D5', role: 'fill' }, { name: 'rust', hex: '#B5482A', role: 'accent' }],
  palette_mode: 'strict', forbid: chickenCard.forbid.filter((f) => !/social media handle/.test(f)), composition: 'centred badge',
  typography: {}, rules: chickenCard.rules,
};
const artCtx = { ...chickenCtx, style_card: artLook };

Deno.test('art reference: palette / medium notes and the palette check name say "the Art style reference"; judging unchanged', () => {
  const r = normaliseQc(FIXTURES.v2PaletteOnly, artCtx);
  assertEquals(r.qc_report.verdict, 'warn', 'palette only stays a warn');
  assertEquals(r.needs_regen, false);
  const pal = r.qc_report.checks.find((c) => c.id === 'style_palette');
  assertEquals(pal?.name, 'Palette matches Art style reference');
  assertEquals(pal?.pass, false);
  assertEquals(styleCheck(r, 'palette')?.note, 'off-palette: teal #2F8F8F (small)', 'off-palette colours named as before');
  // no off-palette list -> the generic note names the Art style reference and its hexes
  const bare = normaliseQc('{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"style":{"palette_ok":false,"medium_ok":false}}', artCtx);
  assertEquals(styleCheck(bare, 'palette')?.note, 'palette drifts from the Art style reference');
  assertEquals(styleCheck(bare, 'medium')?.note, 'not drawn in the Art style reference medium, linework or shading');
  assert(bare.qc_report.style_violations.includes('palette drifts from the Art style reference'), JSON.stringify(bare.qc_report.style_violations));
  // the same verdict against the Style Card keeps the Style Card wording (no regression)
  const card = normaliseQc('{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"style":{"palette_ok":false,"medium_ok":false}}', chickenCtx);
  assertEquals(styleCheck(card, 'palette')?.note, 'palette drifts from the Style Card');
  assertEquals(styleCheck(card, 'medium')?.note, 'not drawn in the card medium, linework or shading method');
  assertEquals(card.qc_report.checks.find((c) => c.id === 'style_palette')?.name, 'Palette matches Style Card');
  // the v1 compat path (no "style" key): palette_ok false without a violation names the reference and its hexes
  const v1 = normaliseQc('{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"palette_ok":false}', artCtx);
  assert(v1.qc_report.style_violations.includes('palette drifts from the Art style reference (#F2E8D5, #B5482A)'), JSON.stringify(v1.qc_report.style_violations));
  // unverified (malformed) keeps the reference wording in the palette check name
  assertEquals(normaliseQc(FIXTURES.malformed, artCtx).qc_report.checks.find((c) => c.id === 'style_palette')?.name, 'Palette matches Art style reference');
  // forbid numbering follows the JSON received (the effective forbid list)
  const hit = normaliseQc(FIXTURES.v2ForbidHit, artCtx);
  assert(hit.qc_report.style_violations.includes('forbidden element present: ' + artLook.forbid[4]), JSON.stringify(hit.qc_report.style_violations));
  assertEquals(fromArtReference(artLook), true);
  assertEquals(fromArtReference({ ...artLook, source: 'style_card' }), false);
  assertEquals(fromArtReference(chickenCard), false);
});

Deno.test('style JSON: the caller style_card, else magic_prompt_json.effective_style, else the style_card_snapshot', () => {
  const snapshot = { palette: [{ hex: '#111111' }] };
  assertEquals(pickStyleJson({ medium: 'x' }, { effective_style: artLook }, snapshot), { medium: 'x' }, 'caller wins');
  assertEquals(pickStyleJson(undefined, { effective_style: artLook }, snapshot), artLook, 'engine v8 effective_style');
  assertEquals(pickStyleJson(null, { subject: { text: 'a cow' } }, snapshot), snapshot, 'engine <= v7: snapshot');
  assertEquals(pickStyleJson(undefined, null, snapshot), snapshot, 'no magic prompt');
  assertEquals(pickStyleJson(undefined, { effective_style: 'nope' }, snapshot), snapshot, 'a malformed effective_style is ignored');
});

Deno.test('art reference with no reading of the art image (value-less look): palette and medium not judged, the rest unchanged', () => {
  // prompt-engine v8 on a card whose stamped Art style slot has no per-slot reading: empty look, palette []
  const unread = { ...artLook, medium: '', realism: '', linework: { weight: '', style: '', outline: '' }, shading: '', shading_method: '', texture: '', edge_finish: '', palette: [] };
  assertEquals(unreadArtLook(unread), { palette: true, medium: true });
  assertEquals(unreadArtLook(artLook), { palette: false, medium: false }, 'a read art look is judged');
  assertEquals(unreadArtLook({ ...chickenCard, palette: [] }), { palette: false, medium: false }, 'a Style Card JSON is never unread');
  assertEquals(unreadArtLook({ ...artLook, palette: [] }), { palette: true, medium: false }, 'palette only');
  const verdict = '{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"palette_ok":false,"style":{"palette_ok":false,"medium_ok":false,"typography_ok":true,"composition_ok":true,"forbid_hits":[]}}';
  const r = normaliseQc(verdict, { ...chickenCtx, style_card: unread });
  assertEquals(styleCheck(r, 'palette'), { id: 'palette', field: styleCheck(r, 'palette')!.field, pass: null, note: UNREAD_PALETTE_NOTE });
  assertEquals(styleCheck(r, 'medium')?.pass, null);
  assertEquals(styleCheck(r, 'medium')?.note, UNREAD_MEDIUM_NOTE);
  const pal = r.qc_report.checks.find((c) => c.id === 'style_palette');
  assertEquals([pal?.name, pal?.pass, pal?.note], ['Palette matches Art style reference', null, UNREAD_PALETTE_NOTE]);
  assert(!r.qc_report.style_violations.some((s) => /palette/i.test(s)), 'no palette violation invented: ' + JSON.stringify(r.qc_report.style_violations));
  assertEquals(r.qc_report.verdict, 'pass', 'nothing judged against an empty look -> pass');
  assertEquals(r.qc_report.style_match?.score, 100, 'unjudged checks leave the score');
  // the same verdict against a read art look still fails palette / medium (no regression)
  const read = normaliseQc(verdict, artCtx);
  assertEquals([styleCheck(read, 'palette')?.pass, styleCheck(read, 'medium')?.pass, read.qc_report.verdict], [false, false, 'warn']);
});

// ---------------------------------------------------------------------------
// v2.2 (2026-10-02): QC sees the Art style reference - WF-2 attaches it as the SECOND image (art_reference_attached true)
// and qc_prompt v2 (studio_28) asks for style.art_match; one combined style_match check 'art_style' (field 'art_reference')

/** v2AllGood with style.art_match (or any other style keys) merged in. */
const withArt = (artMatch: unknown, extra: Record<string, unknown> = {}, style: Record<string, unknown> = {}) => {
  const v = JSON.parse(FIXTURES.v2AllGood);
  return JSON.stringify({ ...v, ...extra, style: { ...v.style, ...style, ...(artMatch === undefined ? {} : { art_match: artMatch }) } });
};
const attachedCtx = { ...artCtx, art_reference_attached: true, qc_art_regen: true };
const DIFFERENT = { medium_ok: true, linework_ok: false, shading_ok: false, texture_ok: true, palette_ok: true, overall: 'different', notes: 'thin brush lines instead of bold uniform outlines, no halftone.' };
const REDRAW = "Redraw in the attached ART STYLE reference's look: thin brush lines instead of bold uniform outlines, no halftone; take only its look, never its subject, layout or words";

Deno.test('art reference attached: art_match same / close / different -> one art_style check; different fails and regenerates once', () => {
  // same: pass, the check is the last style_match check, the score counts it
  const same = normaliseQc(withArt({ medium_ok: true, linework_ok: true, shading_ok: true, texture_ok: true, palette_ok: true, overall: 'same', notes: '' }), attachedCtx);
  assertEquals(same.qc_report.style_match?.checks.map((c) => c.id), ['palette', 'medium', 'typography', 'composition', 'subject', 'forbid', 'art_style']);
  assertEquals(styleCheck(same, 'art_style'), { id: 'art_style', field: 'art_reference', pass: true, note: 'same' });
  assertEquals(STYLE_FIELDS.art_style, 'art_reference', 'the UI links art_reference to the card References panel');
  assertEquals([same.qc_report.verdict, same.needs_regen, same.qc_report.style_match?.score, same.qc_report.corrective_instruction], ['pass', false, 100, null]);
  assertEquals(same.qc_report.style_match?.art_reference_attached, true);
  assertEquals(same.qc_report.style_match?.art_match, { overall: 'same', medium_ok: true, linework_ok: true, shading_ok: true, texture_ok: true, palette_ok: true, notes: '' });
  // close with every sub-key true: pass; close with a false sub-key: warn, never a retry ('close' never fails)
  const closeOk = normaliseQc(withArt({ medium_ok: true, linework_ok: true, shading_ok: true, texture_ok: true, palette_ok: true, overall: 'close', notes: 'slightly finer grain' }), attachedCtx);
  assertEquals([styleCheck(closeOk, 'art_style')?.pass, styleCheck(closeOk, 'art_style')?.note, closeOk.qc_report.verdict], [true, 'close: slightly finer grain', 'pass']);
  const close = normaliseQc(withArt({ medium_ok: true, linework_ok: false, shading_ok: true, texture_ok: true, palette_ok: true, overall: 'close', notes: 'lines a little thinner' }), attachedCtx);
  assertEquals(styleCheck(close, 'art_style'), { id: 'art_style', field: 'art_reference', pass: false, note: 'close: lines a little thinner (linework differs)' });
  assertEquals([close.qc_report.verdict, close.needs_regen, close.qc_report.corrective_instruction, close.qc_report.style_match?.score], ['warn', false, null, 86]);
  // different: fail, needs_regen, the corrective names the reference look and takes only the look from it (never its subject, layout or words)
  const diff = normaliseQc(withArt(DIFFERENT), attachedCtx);
  assertEquals(styleCheck(diff, 'art_style'), { id: 'art_style', field: 'art_reference', pass: false, note: 'different: thin brush lines instead of bold uniform outlines, no halftone (linework, shading differ)' });
  assertEquals([diff.qc_report.verdict, diff.needs_regen, diff.qc_report.score, diff.qc_report.style_match?.score], ['fail', true, 100, 86], 'core score untouched, 6 of 7 style checks');
  assertStringIncludes(diff.qc_report.corrective_instruction!, 'CRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: ' + REDRAW + '. The ONLY text in the image must read exactly: "CHICKEN HAPPY HOUR / EST. 2026"');
  assert(diff.qc_report.checks.every((c) => c.pass !== false), 'no core check failed - the art style alone decided the retry');
  // no notes: the corrective names the differing parts, else the whole look
  assertEquals(artCorrection('', ['linework', 'shading']), "Redraw in the attached ART STYLE reference's look: match its linework, shading; take only its look, never its subject, layout or words");
  assertEquals(artCorrection('  '), "Redraw in the attached ART STYLE reference's look: match its medium, linework, shading, texture and colours; take only its look, never its subject, layout or words");
  const bare = normaliseQc(withArt({ overall: 'different' }), attachedCtx);
  assertStringIncludes(bare.qc_report.corrective_instruction!, 'look: match its medium, linework, shading, texture and colours; take only its look');
  assertEquals(styleCheck(bare, 'art_style')?.note, 'different');
  // WF-2 caps the retry (attempt 2 never retries); qc-judge reports the same decision on attempt 2
  const second = normaliseQc(withArt(DIFFERENT), { ...attachedCtx, attempt: 2 });
  assertEquals([second.qc_report.attempt, second.qc_report.verdict, second.needs_regen], [2, 'fail', true]);
});

Deno.test('art reference attached, settings.qc_art_regen off -> a different style is a warn, no retry; the flag defaults to on', () => {
  const off = normaliseQc(withArt(DIFFERENT), { ...attachedCtx, qc_art_regen: false });
  assertEquals([off.qc_report.verdict, off.needs_regen, off.qc_report.corrective_instruction], ['warn', false, null]);
  assertEquals(styleCheck(off, 'art_style')?.pass, false, 'the finding is still reported');
  assertEquals(normaliseQc(withArt(DIFFERENT), { ...attachedCtx, qc_art_regen: 'false' }).needs_regen, false, 'string false');
  const { qc_art_regen: _drop, ...noFlag } = attachedCtx;
  assertEquals(normaliseQc(withArt(DIFFERENT), noFlag).needs_regen, true, 'absent -> on');
  assertEquals(normaliseQc(withArt(DIFFERENT), { ...attachedCtx, qc_art_regen: null }).needs_regen, true, 'null -> on');
  // the subject switch is independent of the art switch
  const both = normaliseQc(withArt(DIFFERENT, {}, { subject_ok: false, subject_seen: 'a chicken' }), { ...attachedCtx, qc_art_regen: false, qc_subject_regen: true });
  assertEquals(both.needs_regen, true, 'the wrong hero still retries');
  assert(!both.qc_report.corrective_instruction!.includes('ART STYLE reference'), 'no art sentence when the art switch is off');
});

Deno.test('art reference NOT attached (WF-3 edits, Style Card looks, older WF-2): no art_style check, a stray art_match is ignored', () => {
  for (const c of [artCtx, { ...artCtx, art_reference_attached: false }, { ...artCtx, art_reference_attached: 'true' }, { ...artCtx, art_reference_attached: 1 }, chickenCtx]) {
    const r = normaliseQc(withArt(DIFFERENT), c);
    assertEquals(r.qc_report.style_match?.checks.map((x) => x.id), ['palette', 'medium', 'typography', 'composition', 'subject', 'forbid'], 'no art_style check: ' + JSON.stringify((c as { art_reference_attached?: unknown }).art_reference_attached));
    assertEquals([r.qc_report.verdict, r.needs_regen, r.qc_report.style_match?.art_match, r.qc_report.style_match?.art_reference_attached], ['pass', false, null, false]);
  }
  // buildStyleMatch defaults to not attached
  assertEquals(buildStyleMatch({ style: { art_match: DIFFERENT } }, null, '').checks.some((c) => c.id === 'art_style'), false);
});

Deno.test('malformed art_match: missing -> not reported, unreadable -> not reported (unreadable), tolerant strings, never a retry on a guess', () => {
  const missing = normaliseQc(withArt(undefined), attachedCtx);
  assertEquals(styleCheck(missing, 'art_style'), { id: 'art_style', field: 'art_reference', pass: null, note: ART_NOT_REPORTED });
  assertEquals([missing.qc_report.verdict, missing.needs_regen, missing.qc_report.style_match?.score], ['pass', false, 100], 'an unreported check leaves the score');
  for (const junk of [[1, 2], 42, true, false, '{"overall": diff', { foo: 1 }, { overall: 'kinda', notes: 'n/a' }]) {
    const r = normaliseQc(withArt(junk), attachedCtx);
    assertEquals(styleCheck(r, 'art_style'), { id: 'art_style', field: 'art_reference', pass: null, note: ART_UNREADABLE }, 'unreadable ' + JSON.stringify(junk));
    assertEquals([r.qc_report.verdict, r.needs_regen], ['pass', false], 'no verdict change for ' + JSON.stringify(junk));
  }
  // a bare overall word, a JSON string, string booleans and an upper-case word are read
  assertEquals(normaliseQc(withArt('different'), attachedCtx).needs_regen, true, 'bare word');
  assertEquals(parseArtMatch('{"overall":"Same","palette_ok":"true"}').match?.overall, 'same', 'JSON string, case-insensitive');
  assertEquals(parseArtMatch({ overall: ' DIFFERENT ', medium_ok: 'false' }).match, { overall: 'different', medium_ok: false, linework_ok: null, shading_ok: null, texture_ok: null, palette_ok: null, notes: '' });
  assertEquals(parseArtMatch(null).state, 'missing');
  // the literal template choice "same|close|different" is no overall word; a false sub-key still warns, never retries
  const literal = normaliseQc(withArt({ overall: 'same|close|different', palette_ok: false, notes: 'rust swapped for teal' }), attachedCtx);
  assertEquals(styleCheck(literal, 'art_style'), { id: 'art_style', field: 'art_reference', pass: false, note: 'rust swapped for teal (palette differs)' });
  assertEquals([literal.qc_report.verdict, literal.needs_regen], ['warn', false]);
  // sub-keys only, all true: pass
  assertEquals(artStyleCheck(parseArtMatch({ medium_ok: true }).match, 'ok').pass, true);
  // notes are one line, trimmed of a trailing full stop, at most 240 characters
  assertEquals(parseArtMatch({ overall: 'close', notes: 'a\n  b.' }).match?.notes, 'a b');
  assertEquals(parseArtMatch({ overall: 'close', notes: 'x'.repeat(400) }).match?.notes.length, 240);
  assertEquals(ART_MATCH_KEYS.map((k) => k.key), ['medium_ok', 'linework_ok', 'shading_ok', 'texture_ok', 'palette_ok']);
});

Deno.test('art reference different combined with a text failure and a wrong hero: one retry, every correction in order', () => {
  const textFail = { text_found: 'CHICKEN HAPY HOUR EST. 2026', text_matches: false, issues: ['Spell the text exactly "CHICKEN HAPPY HOUR"'] };
  const r = normaliseQc(withArt(DIFFERENT, textFail, { subject_ok: false, subject_seen: 'a chicken' }), attachedCtx);
  assertEquals([r.qc_report.verdict, r.needs_regen, r.qc_report.text_ok], ['fail', true, false]);
  assertStringIncludes(r.qc_report.corrective_instruction!, 'identical: Spell the text exactly "CHICKEN HAPPY HOUR"; Draw a highland cow as the hero, not a chicken; the text is lettering only and never chooses the subject; ' + REDRAW + '. The ONLY text in the image must read exactly: "CHICKEN HAPPY HOUR / EST. 2026" - spelled letter for letter');
  // the art sentence never tells the redraw to keep the subject: with a wrong hero that would contradict the hero sentence
  assert(!/keep(ing)? the subject/i.test(r.qc_report.corrective_instruction!), r.qc_report.corrective_instruction!);
  assertEquals(r.qc_report.corrective_instruction!.match(/Draw a highland cow as the hero/g)?.length, 1);
  // the art switch off: the text failure still retries, without the art sentence
  const off = normaliseQc(withArt(DIFFERENT, textFail), { ...attachedCtx, qc_art_regen: false });
  assertEquals([off.qc_report.verdict, off.needs_regen], ['fail', true]);
  assert(!off.qc_report.corrective_instruction!.includes('ART STYLE reference'), off.qc_report.corrective_instruction!);
  // a close style with a text failure: the text retry carries no art sentence ('close' never asks for a redraw)
  const close = normaliseQc(withArt({ ...DIFFERENT, overall: 'close' }, textFail), attachedCtx);
  assert(close.needs_regen && !close.qc_report.corrective_instruction!.includes('ART STYLE reference'), close.qc_report.corrective_instruction!);
});

Deno.test('value-less art look (live card 72354a02 shape) + the reference attached: palette / medium stay not judged, the art_style check closes the gap', () => {
  const unread = { ...artLook, medium: '', realism: '', linework: { weight: '', style: '', outline: '' }, shading: '', shading_method: '', texture: '', edge_finish: '', palette: [] };
  const r = normaliseQc(withArt(DIFFERENT, {}, { palette_ok: true, medium_ok: true }), { ...attachedCtx, style_card: unread });
  assertEquals([styleCheck(r, 'palette')?.pass, styleCheck(r, 'medium')?.pass], [null, null], 'nothing read to judge the text look against');
  assertEquals(styleCheck(r, 'art_style')?.pass, false, 'judged against the image itself');
  assertEquals([r.qc_report.verdict, r.needs_regen], ['fail', true]);
  assertEquals(r.qc_report.checks.find((c) => c.id === 'style_palette')?.name, 'Palette matches Art style reference');
});

Deno.test('studio_28 migration: guard first, qc_prompt v2 gets the ART STYLE REFERENCE paragraph once, every placeholder kept, the art_match keys qc-judge reads, settings.qc_art_regen', async () => {
  const mig = await readFile(new URL('../../migrations/20261002_studio_28_qc_art_reference.sql', import.meta.url), 'utf8');
  const guard = mig.indexOf('do $guard$');
  assert(guard > 0 && guard < mig.indexOf('update public.prompt_templates'), 'the inactive / never-activated guard runs before any update');
  assert(/t\.active or t\.activated_at is not null or t\.activated_by is not null/.test(mig), 'guard refuses an active or once-activated row');
  assert(/where slug = 'qc_prompt' and version = 2 and not active and activated_at is null and activated_by is null;/.test(mig), 'the update itself is guarded');
  assert(!/insert\s+into\s+public\.prompt_templates/i.test(mig) && !/set\s+active\s*=/i.test(mig), 'no insert, no activation');
  assert(/alter table public\.settings add column if not exists qc_art_regen boolean not null default true;/.test(mig), 'settings.qc_art_regen boolean not null default true');
  assert(/comment on column public\.settings\.qc_art_regen is/.test(mig), 'column comment');
  const m = mig.match(/art_tail constant text := \$s\$([\s\S]*?)\$s\$;/);
  assert(m, 'art_tail constant');
  const tail = m![1];
  assert(tail.startsWith('ART STYLE REFERENCE ATTACHED: {{ART_REFERENCE_ATTACHED}}.\nWhen yes, TWO images are attached: the FIRST is the generated design, the SECOND is the client\'s Art style reference'), 'paragraph head');
  assertEquals(tail.split('{{').length - 1, 1, 'exactly one placeholder in the paragraph');
  for (const k of ART_MATCH_KEYS) assertStringIncludes(tail, '"' + k.key + '":true|false', 'art_match key ' + k.key);
  assertStringIncludes(tail, '"overall":"same|close|different"');
  assertStringIncludes(tail, '"notes":"25 words or fewer naming what differs');
  assertStringIncludes(tail, 'never its subject, layout or words');
  assert(tail.endsWith('When no, only the generated design is attached: omit "art_match".'), 'the no branch closes the paragraph');
  assert(!tail.includes("the card's") && !/\bthe reference\b/.test(tail), 'never "the card" / a bare "the reference"');
  // the studio_21 body + the studio_26 sentence edits + this paragraph: every placeholder kept, the paragraph last
  const m21 = await readFile(new URL('../../migrations/20260930_studio_21_style_card_v2.sql', import.meta.url), 'utf8');
  const m26 = await readFile(new URL('../../migrations/20261001_studio_26_art_style_wins.sql', import.meta.url), 'utf8');
  let body = m21.match(/\$qc\$([\s\S]*?)\$qc\$/)![1];
  const c26 = new Map<string, string>();
  for (const x of m26.matchAll(/(\w+) constant text := \$s\$([\s\S]*?)\$s\$;/g)) c26.set(x[1], x[2]);
  for (const n of [1, 2, 3, 4, 5]) body = body.replace(c26.get('e' + n + '_old')!, c26.get('e' + n + '_new')!);
  assert(body.endsWith('{{STYLE_CARD_JSON}}'), 'qc_prompt v2 ends with the STYLE_CARD_JSON placeholder (the migration checks it before appending)');
  const v2 = body + '\n\n' + tail;
  for (const tok of ['EXPECTED ON-DESIGN TEXT: """{{EXPECTED_TEXT}}"""', '{{EXPECTED_SUBJECT}}', '{{PALETTE_RULE}}', '{{FORBID_LIST}}', '{{STYLE_CARD_JSON}}', '{{ART_REFERENCE_ATTACHED}}']) assertStringIncludes(v2, tok, 'keeps ' + tok);
  // the self-check LIKE patterns hold on the appended body
  for (const x of mig.matchAll(/body like '%([^%]+)%'/g)) assert(v2.includes(x[1].replace(/''/g, "'")), 'self-check pattern present: ' + x[1]);
  for (const x of mig.matchAll(/body not like '%([^%]+)%'/g)) assert(!v2.includes(x[1].replace(/''/g, "'")), 'self-check pattern absent: ' + x[1]);
  assert(v2.endsWith('omit "art_match".'), 'ends with the no branch (the anchored LIKE)');
});

// ---------------------------------------------------------------------------
// v2.3 (2026-10-05): Fix an area = GPT Image 2.5 Sunburst, locked outside. An edit_region with a mask_rect is judged
// region-aware: WF-3 adds the REGION EDIT paragraph (and the previous version as the SECOND image) and the judge returns a
// "region" key; qc-judge appends 4 region checks, exempts the colours and objects the instruction names, never retries.

const regionRect = { x: 413, y: 287, w: 305, h: 158, width: 1024, height: 1024 };
/** A generations row as index.ts loads it for an edit_region (b33727a9 shape: sunglasses -> red, locked composite, no overflow). */
const regionGen = (over: Record<string, unknown> = {}) => ({
  id: 'b33727a9', kind: 'edit_region', mask_rect: regionRect, edit_instruction: 'change the sunglass color to red',
  region_metrics: { version: 1, mode: 'locked', overflow: { detected: false, px: 0, suggested_rect: null } }, ...over,
});
const regionCtx = { ...chickenCtx, region: regionContextOf(regionGen()) };
const GOOD_REGION = { instruction_done: true, seam_visible: false, object_cut_off: false, text_changed: false, notes: 'sunglasses now red, border clean' };
/** v2AllGood with the judge's region key (top level, or inside "style" when nested) plus extra style / top-level keys. */
const withRegion = (region: unknown, style: Record<string, unknown> = {}, extra: Record<string, unknown> = {}, nested = false) => {
  const v = JSON.parse(FIXTURES.v2AllGood);
  const top = region === undefined || nested ? {} : { region };
  const inStyle = region !== undefined && nested ? { region } : {};
  return JSON.stringify({ ...v, ...extra, ...top, style: { ...v.style, ...style, ...inStyle } });
};
const check = (r: ReturnType<typeof normaliseQc>, id: string) => r.qc_report.checks.find((c) => c.id === id);
const REGION_IDS = ['region_instruction_done', 'region_text_unchanged', 'region_no_seam', 'region_not_cut_off'];

Deno.test('v2.3 region: every region key good -> pass, the 4 region checks true and appended after the core checks, qc_report.region = verdict + overflow_measured', () => {
  const r = normaliseQc(withRegion(GOOD_REGION), regionCtx);
  assertEquals([r.qc_report.verdict, r.needs_regen, r.qc_report.score, r.qc_report.corrective_instruction], ['pass', false, 100, null]);
  assertEquals(r.qc_report.checks.length, 16, '12 checks of v2AllGood + 4 region checks');
  assertEquals(r.qc_report.checks.slice(12).map((c) => c.id), REGION_IDS, 'region checks come last');
  assertEquals(REGION_CHECKS.map((c) => c.id), REGION_IDS);
  assertEquals(REGION_CHECKS.map((c) => c.name), ['Requested change done inside the area', 'Lettering unchanged by the area edit', 'No visible seam at the area border', 'New element not cut off at the area border']);
  assertEquals(REGION_CHECKS.map((c) => c.warnOnly), [false, false, true, true]);
  for (const id of REGION_IDS) assertEquals(check(r, id), { id, name: REGION_CHECKS.find((c) => c.id === id)!.name, pass: true, note: '' }, id);
  assertEquals(r.qc_report.region, { ...GOOD_REGION, overflow_measured: false });
  assertEquals(r.qc_report.style_match?.score, 100, 'region checks are no style checks');
  // the judge may nest the key inside "style": same report
  assertEquals(JSON.stringify(normaliseQc(withRegion(GOOD_REGION, {}, {}, true), regionCtx)), JSON.stringify(r), 'style.region fallback');
  // string booleans are read like everywhere else
  const strings = normaliseQc(withRegion({ instruction_done: 'yes', seam_visible: 'no', object_cut_off: 'false', text_changed: 'false', notes: 'ok.' }), regionCtx);
  assertEquals([strings.qc_report.verdict, strings.qc_report.region?.notes], ['pass', 'ok']);
  assert(REGION_IDS.every((id) => check(strings, id)?.pass === true), JSON.stringify(strings.qc_report.checks.slice(12)));
});

Deno.test('v2.3 region: instruction_done false -> verdict fail, never needs_regen (WF-3 has no corrective loop); a core text failure still retries on its own', () => {
  const r = normaliseQc(withRegion({ ...GOOD_REGION, instruction_done: false, notes: 'sunglasses still black' }), regionCtx);
  assertEquals([r.qc_report.verdict, r.needs_regen, r.qc_report.corrective_instruction], ['fail', false, null]);
  assertEquals(check(r, 'region_instruction_done'), { id: 'region_instruction_done', name: 'Requested change done inside the area', pass: false, note: 'the requested change is not visible inside the area' });
  assertEquals(r.qc_report.score, 100, 'core score untouched');
  assertEquals(r.qc_report.region?.instruction_done, false);
  // with a text failure the retry comes from the core check only; the corrective never mentions the area
  const both = normaliseQc(withRegion({ ...GOOD_REGION, instruction_done: false }, {}, { text_found: 'CHICKEN HAPY HOUR EST. 2026', text_matches: false, issues: ['Spell the text exactly "CHICKEN HAPPY HOUR"'] }), regionCtx);
  assertEquals([both.qc_report.verdict, both.needs_regen], ['fail', true]);
  assertStringIncludes(both.qc_report.corrective_instruction!, 'identical: Spell the text exactly "CHICKEN HAPPY HOUR". The ONLY text');
  assert(!/area|region/i.test(both.qc_report.corrective_instruction!), both.qc_report.corrective_instruction!);
  // not reported: pass null, verdict untouched
  const nr = normaliseQc(withRegion({ ...GOOD_REGION, instruction_done: undefined }), regionCtx);
  assertEquals(check(nr, 'region_instruction_done'), { id: 'region_instruction_done', name: 'Requested change done inside the area', pass: null, note: REGION_NOT_REPORTED });
  assertEquals(nr.qc_report.verdict, 'pass');
});

Deno.test('v2.3 region: seam_visible true -> warn only; the judge seeing the element cut off -> warn only; neither retries', () => {
  const seam = normaliseQc(withRegion({ ...GOOD_REGION, seam_visible: true, notes: 'faint halo along the left edge' }), regionCtx);
  assertEquals([seam.qc_report.verdict, seam.needs_regen, seam.qc_report.corrective_instruction], ['warn', false, null]);
  assertEquals(check(seam, 'region_no_seam'), { id: 'region_no_seam', name: 'No visible seam at the area border', pass: false, note: 'a visible edge, step or colour jump along the area border' });
  assertEquals(seam.qc_report.region?.seam_visible, true);
  assertEquals(seam.qc_report.style_match?.score, 100);
  const cut = normaliseQc(withRegion({ ...GOOD_REGION, object_cut_off: true }), regionCtx);
  assertEquals([cut.qc_report.verdict, cut.needs_regen], ['warn', false]);
  assertEquals(check(cut, 'region_not_cut_off'), { id: 'region_not_cut_off', name: 'New element not cut off at the area border', pass: false, note: 'the new element looks cut off at the area border' });
  assertEquals(cut.qc_report.region?.object_cut_off, true);
  // both warn-only findings together are still a warn, and the pass:false of the judge changes nothing more
  const both = normaliseQc(withRegion({ ...GOOD_REGION, seam_visible: true, object_cut_off: true }, {}, { pass: false }), regionCtx);
  assertEquals([both.qc_report.verdict, both.needs_regen], ['warn', false]);
  // not reported seam / cut-off: pass null
  const nr = normaliseQc(withRegion({ instruction_done: true, text_changed: false }), regionCtx);
  assertEquals([check(nr, 'region_no_seam')?.pass, check(nr, 'region_no_seam')?.note, check(nr, 'region_not_cut_off')?.pass, check(nr, 'region_not_cut_off')?.note], [null, REGION_NOT_REPORTED, null, REGION_NOT_REPORTED]);
  assertEquals(nr.qc_report.verdict, 'pass');
});

Deno.test('v2.3 region: region-composite measured overflow -> region_not_cut_off false (warn) with the Extend area note, whatever the judge saw', () => {
  const measured = regionContextOf(regionGen({ region_metrics: { version: 1, mode: 'locked', overflow: { detected: true, px: 612, suggested_rect: { x: 380, y: 287, w: 338, h: 158 } } } }));
  assertEquals([measured?.overflow_measured, measured?.overflow_px, measured?.composite_mode], [true, 612, 'locked']);
  const r = normaliseQc(withRegion(GOOD_REGION), { ...chickenCtx, region: measured });
  assertEquals([r.qc_report.verdict, r.needs_regen], ['warn', false]);
  assertEquals(check(r, 'region_not_cut_off'), { id: 'region_not_cut_off', name: 'New element not cut off at the area border', pass: false, note: 'the new element runs past your area (measured 612 px) - use Extend area' });
  assertEquals(r.qc_report.region, { ...GOOD_REGION, overflow_measured: true }, 'the judge object_cut_off false is kept, overflow_measured says why the check failed');
  // the judge agreeing (object_cut_off true) keeps the measured note (it names the fix)
  const agree = normaliseQc(withRegion({ ...GOOD_REGION, object_cut_off: true }), { ...chickenCtx, region: measured });
  assertStringIncludes(check(agree, 'region_not_cut_off')!.note, 'measured 612 px) - use Extend area');
  // px as a string, detected as anything but true: tolerant
  assertEquals(regionContextOf(regionGen({ region_metrics: { overflow: { detected: true, px: '48' } } }))?.overflow_px, 48);
  assertEquals(regionContextOf(regionGen({ region_metrics: { overflow: { detected: 'true', px: 99 } } }))?.overflow_measured, false, 'only the boolean true counts');
  assertEquals(regionContextOf(regionGen({ region_metrics: null }))?.overflow_measured, false);
});

Deno.test('v2.3 region: text_changed null -> lettering check skipped ("no lettering touches the area"); absent -> not reported; true -> fail, no retry; false -> pass', () => {
  const skipped = normaliseQc(withRegion({ ...GOOD_REGION, text_changed: null }), regionCtx);
  assertEquals(check(skipped, 'region_text_unchanged'), { id: 'region_text_unchanged', name: 'Lettering unchanged by the area edit', pass: null, note: REGION_NO_TEXT_NOTE });
  assertEquals(REGION_NO_TEXT_NOTE, 'no lettering touches the area');
  assertEquals([skipped.qc_report.verdict, skipped.qc_report.region?.text_changed], ['pass', null]);
  // the judge writing the word null
  assertEquals(check(normaliseQc(withRegion({ ...GOOD_REGION, text_changed: 'null' }), regionCtx), 'region_text_unchanged')?.note, REGION_NO_TEXT_NOTE);
  // key absent: not reported (the judge did not say)
  const { text_changed: _t, ...noKey } = GOOD_REGION;
  assertEquals(check(normaliseQc(withRegion(noKey), regionCtx), 'region_text_unchanged'), { id: 'region_text_unchanged', name: 'Lettering unchanged by the area edit', pass: null, note: REGION_NOT_REPORTED });
  // lettering changed: fail, never a retry
  const changed = normaliseQc(withRegion({ ...GOOD_REGION, text_changed: true, notes: 'EST. 2026 lost its full stop' }), regionCtx);
  assertEquals([changed.qc_report.verdict, changed.needs_regen, changed.qc_report.corrective_instruction], ['fail', false, null]);
  assertEquals(check(changed, 'region_text_unchanged'), { id: 'region_text_unchanged', name: 'Lettering unchanged by the area edit', pass: false, note: 'lettering changed by the area edit' });
  assertEquals(check(normaliseQc(withRegion(GOOD_REGION), regionCtx), 'region_text_unchanged')?.pass, true);
});

Deno.test('v2.3 region: an off-palette colour the instruction asked for is no palette failure - "asked for by the edit", no style_violation', () => {
  const r = normaliseQc(withRegion(GOOD_REGION, { palette_ok: false, off_palette_colours: [{ name: 'bright red', hex: '#E53935', area: 'small' }] }, { style_violations: ['bright red sunglasses are not in the palette'] }), regionCtx);
  assertEquals(styleCheck(r, 'palette'), { id: 'palette', field: 'palette', pass: true, note: 'asked for by the edit: bright red' });
  assertEquals(check(r, 'style_palette'), { id: 'style_palette', name: 'Palette matches Style Card', pass: true, note: 'asked for by the edit: bright red' });
  assertEquals(r.qc_report.style_violations, [], 'the colour remark about the asked-for colour is dropped');
  assertEquals([r.qc_report.verdict, r.needs_regen, r.qc_report.style_match?.score], ['pass', false, 100]);
  // the hex alone ties the colour to the instruction
  const hex = normaliseQc(withRegion(GOOD_REGION, { palette_ok: false, off_palette_colours: [{ name: 'crimson', hex: '#e53935', area: 'small' }] }), { ...chickenCtx, region: regionContextOf(regionGen({ edit_instruction: 'paint the sunglasses #E53935' })) });
  assertEquals(styleCheck(hex, 'palette')?.pass, true);
  assertEquals(styleCheck(hex, 'palette')?.note, 'asked for by the edit: crimson');
  // a colour the instruction never named is judged as before (warn), and only the unasked colours are in the note
  const teal = normaliseQc(withRegion(GOOD_REGION, { palette_ok: false, off_palette_colours: [{ name: 'teal', hex: '#2f8f8f', area: 'small' }] }), regionCtx);
  assertEquals(styleCheck(teal, 'palette'), { id: 'palette', field: 'palette', pass: false, note: 'off-palette: teal #2F8F8F (small)' });
  assertEquals([teal.qc_report.verdict, teal.needs_regen, check(teal, 'style_palette')?.pass], ['warn', false, false]);
  assertEquals(teal.qc_report.style_violations, ['off-palette: teal #2F8F8F (small)']);
  const mixed = normaliseQc(withRegion(GOOD_REGION, { palette_ok: false, off_palette_colours: [{ name: 'bright red', hex: '#E53935', area: 'small' }, { name: 'teal', hex: '#2f8f8f', area: 'small' }] }), regionCtx);
  assertEquals(styleCheck(mixed, 'palette'), { id: 'palette', field: 'palette', pass: false, note: 'off-palette: teal #2F8F8F (small)' });
  // the same verdict without the region context fails the palette as in v2.2 (no regression)
  const plain = normaliseQc(withRegion(GOOD_REGION, { palette_ok: false, off_palette_colours: [{ name: 'bright red', hex: '#E53935', area: 'small' }] }), chickenCtx);
  assertEquals([styleCheck(plain, 'palette')?.pass, plain.qc_report.verdict], [false, 'warn']);
  // mentionedInInstruction: whole words of 3+ letters, case-insensitive; function words and generic colour words never count alone
  assertEquals(mentionedInInstruction('change the sunglass color to red', 'bright red'), true);
  assertEquals(mentionedInInstruction('CHANGE THE SUNGLASS COLOR TO RED', 'red'), true);
  assertEquals(mentionedInInstruction('change the sunglass color to red', 'skin colour'), false);
  assertEquals(mentionedInInstruction('make it reddish', 'red'), false, 'whole word only');
  assertEquals(mentionedInInstruction('change the sunglass color to red', 'the colour'), false, 'stop words alone never match');
  assertEquals(mentionedInInstruction('', 'red'), false);
  assertEquals(mentionedInInstruction('make the bear to look like a tiger', 'a tiger'), true);
  assertEquals(mentionedInInstruction(null, undefined), false);
});

Deno.test('v2.3 region: palette_ok false with no colour list -> palette not judged ("the change may bring new colours"), compat check follows, no violation', () => {
  const r = normaliseQc(withRegion(GOOD_REGION, { palette_ok: false, off_palette_colours: [] }), regionCtx);
  assertEquals(REGION_PALETTE_NOTE, 'not judged on an area edit - the change may bring new colours');
  assertEquals(styleCheck(r, 'palette'), { id: 'palette', field: 'palette', pass: null, note: REGION_PALETTE_NOTE });
  assertEquals(check(r, 'style_palette'), { id: 'style_palette', name: 'Palette matches Style Card', pass: null, note: REGION_PALETTE_NOTE });
  assertEquals(r.qc_report.style_violations, []);
  assertEquals([r.qc_report.verdict, r.needs_regen, r.qc_report.style_match?.score], ['pass', false, 100], 'an unjudged check leaves the score');
  // the v1 tail (palette_ok false at the top level, no colour list) on an area edit: the compat check is not judged either
  const v1 = normaliseQc('{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"palette_ok":false,"region":{"instruction_done":true,"seam_visible":false,"object_cut_off":false,"text_changed":null}}', regionCtx);
  assertEquals([check(v1, 'style_palette')?.pass, check(v1, 'style_palette')?.note, v1.qc_report.verdict], [null, REGION_PALETTE_NOTE, 'pass']);
  assertEquals(v1.qc_report.style_violations, []);
  // a colour remark naming nothing the instruction asked for stays a violation and, with palette_ok true, fails the compat check as in v2.2 (warn) ...
  const remark = normaliseQc(withRegion(GOOD_REGION, { palette_ok: true }, { style_violations: ['teal accents off the palette'] }), regionCtx);
  assertEquals(remark.qc_report.style_violations, ['teal accents off the palette']);
  assertEquals([check(remark, 'style_palette')?.pass, check(remark, 'style_palette')?.note, remark.qc_report.verdict], [false, 'teal accents off the palette', 'warn']);
  // ... while a remark about the asked-for colour is dropped and the check passes
  const asked = normaliseQc(withRegion(GOOD_REGION, { palette_ok: true }, { style_violations: ['red sunglasses are off the palette'] }), regionCtx);
  assertEquals([asked.qc_report.style_violations, check(asked, 'style_palette')?.pass, asked.qc_report.verdict], [[], true, 'pass']);
  // a colour remark without palette_ok (no style key) on an area edit: not judged - there is no colour list to tell asked from unasked
  const v1remark = normaliseQc('{"text_found":"CHICKEN HAPPY HOUR EST. 2026","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,"background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":[],"pass":true,"style_violations":["teal accents off the palette"],"region":{"instruction_done":true,"seam_visible":false,"object_cut_off":false,"text_changed":false}}', regionCtx);
  assertEquals([check(v1remark, 'style_palette')?.pass, check(v1remark, 'style_palette')?.note, v1remark.qc_report.verdict], [null, REGION_PALETTE_NOTE, 'pass']);
  // the same verdict without the region context: v2.2 warn (no regression)
  const plain = normaliseQc(withRegion(GOOD_REGION, { palette_ok: false, off_palette_colours: [] }), chickenCtx);
  assertEquals([styleCheck(plain, 'palette')?.pass, check(plain, 'style_palette')?.pass, plain.qc_report.verdict], [false, false, 'warn']);
});

Deno.test('v2.3 region: the subject the instruction asks for (bear -> tiger) is no wrong hero - pass null "(asked for by the edit)", never a subject regen on an area edit', () => {
  const tigerCtx = { ...chickenCtx, expected_subject: 'a bear', region: regionContextOf(regionGen({ id: 'dace73f3', edit_instruction: 'make the bear to look like a tiger' })) };
  const r = normaliseQc(withRegion(GOOD_REGION, { subject_ok: false, subject_seen: 'a tiger' }), tigerCtx);
  assertEquals(styleCheck(r, 'subject'), { id: 'subject', field: 'subjects', pass: null, note: 'drawn: a tiger (asked for by the edit)' });
  assertEquals([r.qc_report.verdict, r.needs_regen, r.qc_report.corrective_instruction, r.qc_report.style_match?.subject_seen], ['pass', false, null, 'a tiger']);
  assertEquals(r.qc_report.style_match?.score, 100);
  // a hero the instruction never asked for is still reported, but an area edit never regenerates for it: warn, not fail
  const chicken = normaliseQc(withRegion(GOOD_REGION, { subject_ok: false, subject_seen: 'a chicken' }), tigerCtx);
  assertEquals(styleCheck(chicken, 'subject'), { id: 'subject', field: 'subjects', pass: false, note: 'drawn: a chicken' });
  assertEquals([chicken.qc_report.verdict, chicken.needs_regen, chicken.qc_report.corrective_instruction], ['warn', false, null]);
  // the same verdict without the region context regenerates as in v2.2 (no regression)
  const plain = normaliseQc(withRegion(GOOD_REGION, { subject_ok: false, subject_seen: 'a chicken' }), { ...chickenCtx, expected_subject: 'a bear' });
  assertEquals([plain.qc_report.verdict, plain.needs_regen], ['fail', true]);
  assertStringIncludes(plain.qc_report.corrective_instruction!, 'Draw a bear as the hero, not a chicken');
});

// Frozen v2.2 output (qc.ts at the commit before v2.3, run through the Node shim on 2026-10-06) for two fixtures: a
// v2.3 report without a region context must equal it byte for byte - no "region" key, nothing reordered.
const SNAP_V22_ALL_GOOD = '{"qc_report":{"version":2,"verdict":"pass","checks":[{"id":"text_matches","name":"Text matches expected exactly","pass":true,"note":""},{"id":"text_once","name":"Text appears exactly once","pass":true,"note":""},{"id":"extra_text","name":"No extra text, watermarks or logos","pass":true,"note":""},{"id":"text_legible","name":"Letters fully formed and legible","pass":true,"note":""},{"id":"no_halos","name":"No white halos or fringes","pass":true,"note":""},{"id":"background_ok","name":"One flat even neutral grey background","pass":true,"note":""},{"id":"no_shadows","name":"No drop, cast or ambient shadows","pass":true,"note":""},{"id":"flat_artwork","name":"Flat artwork, not a mockup","pass":true,"note":""},{"id":"edges_clean","name":"Continuous edges, no stray dots","pass":true,"note":""},{"id":"not_cropped","name":"Artwork not cropped by the frame","pass":true,"note":""},{"id":"style_palette","name":"Palette matches Style Card","pass":true,"note":""},{"id":"text_height","name":"Text large enough to print","pass":true,"note":"min glyph height 9.0% of image"}],"score":100,"style_match":{"score":100,"checks":[{"id":"palette","field":"palette","pass":true,"note":""},{"id":"medium","field":"medium","pass":true,"note":""},{"id":"typography","field":"typography.headline","pass":true,"note":""},{"id":"composition","field":"composition","pass":true,"note":""},{"id":"subject","field":"subjects","pass":true,"note":"drawn: a highland cow"},{"id":"forbid","field":"forbid","pass":true,"note":""}],"subject_seen":"a highland cow","case_seen":"UPPER","art_reference_attached":false,"art_match":null},"needs_regen":false,"corrective_instruction":null,"style_violations":[],"text_ok":true,"text_found":"CHICKEN HAPPY HOUR EST. 2026","expected_text":["CHICKEN HAPPY HOUR","EST. 2026"],"min_text_height_frac":0.09,"issues":[],"parse_error":null,"attempt":1},"needs_regen":false,"text_elements":[{"text":"CHICKEN HAPPY HOUR EST. 2026","expected":["CHICKEN HAPPY HOUR","EST. 2026"],"matches":true,"min_height_frac":0.09}]}';
const SNAP_V22_LIVE_006B5BA1 = '{"qc_report":{"version":2,"verdict":"pass","checks":[{"id":"text_matches","name":"Text matches expected exactly","pass":true,"note":""},{"id":"text_once","name":"Text appears exactly once","pass":true,"note":""},{"id":"extra_text","name":"No extra text, watermarks or logos","pass":true,"note":""},{"id":"text_legible","name":"Letters fully formed and legible","pass":true,"note":""},{"id":"no_halos","name":"No white halos or fringes","pass":true,"note":""},{"id":"background_ok","name":"One flat even neutral grey background","pass":true,"note":""},{"id":"no_shadows","name":"No drop, cast or ambient shadows","pass":true,"note":""},{"id":"flat_artwork","name":"Flat artwork, not a mockup","pass":true,"note":""},{"id":"edges_clean","name":"Continuous edges, no stray dots","pass":true,"note":""},{"id":"style_palette","name":"Palette matches Style Card","pass":true,"note":""},{"id":"text_height","name":"Text large enough to print","pass":true,"note":"not reported"}],"score":100,"style_match":{"score":null,"checks":[{"id":"palette","field":"palette","pass":null,"note":"not reported"},{"id":"medium","field":"medium","pass":null,"note":"not reported"},{"id":"typography","field":"typography.headline","pass":null,"note":"not reported"},{"id":"composition","field":"composition","pass":null,"note":"not reported"},{"id":"subject","field":"subjects","pass":null,"note":"no subject given"},{"id":"forbid","field":"forbid","pass":null,"note":"not reported"}],"subject_seen":"","case_seen":"","art_reference_attached":false,"art_match":null},"needs_regen":false,"corrective_instruction":null,"style_violations":["Omitting the bottom center social media handle"],"text_ok":true,"text_found":"CHICKEN HAPPY HOUR EST. 2026","expected_text":["CHICKEN HAPPY HOUR","EST. 2026"],"min_text_height_frac":null,"issues":[],"parse_error":null,"attempt":1},"needs_regen":false,"text_elements":[{"text":"CHICKEN HAPPY HOUR EST. 2026","expected":["CHICKEN HAPPY HOUR","EST. 2026"],"matches":true,"min_height_frac":null}]}';

Deno.test('v2.3 region: without a region context the report is byte-identical to v2.2 (frozen snapshots, no "region" key); a stray region key is ignored', () => {
  const allGood = normaliseQc(FIXTURES.v2AllGood, chickenCtx);
  assertEquals(JSON.stringify(allGood), SNAP_V22_ALL_GOOD, 'v2AllGood / chickenCtx');
  assert(!('region' in allGood.qc_report), 'no region key');
  const live = normaliseQc(FIXTURES.live006b5ba1, { ...chickenCtx, expected_subject: '' });
  assertEquals(JSON.stringify(live), SNAP_V22_LIVE_006B5BA1, 'live006b5ba1');
  assert(!('region' in live.qc_report));
  // a context whose region is not an object (edit_text rows: regionContextOf gives null) changes nothing
  for (const stray of [null, undefined, false, 'edit_region', 42, []]) {
    assertEquals(JSON.stringify(normaliseQc(FIXTURES.v2AllGood, { ...chickenCtx, region: stray })), SNAP_V22_ALL_GOOD, 'region ctx ' + JSON.stringify(stray));
  }
  assertEquals(JSON.stringify(normaliseQc(FIXTURES.v2AllGood, { ...chickenCtx, region: regionContextOf({ kind: 'edit_text', mask_rect: regionRect }) })), SNAP_V22_ALL_GOOD, 'edit_text');
  // the judge returning a region key on a non-region generation: ignored (no checks, no region key)
  const strayKey = normaliseQc(withRegion(GOOD_REGION), chickenCtx);
  assertEquals(JSON.stringify(strayKey), SNAP_V22_ALL_GOOD, 'stray region key ignored');
  // the fail-open path is unchanged on an area edit: unverified, no region key, never a retry
  const malformed = normaliseQc(FIXTURES.malformed, regionCtx);
  assertEquals(JSON.stringify(malformed), JSON.stringify(normaliseQc(FIXTURES.malformed, chickenCtx)));
  assertEquals([malformed.qc_report.verdict, malformed.needs_regen, 'region' in malformed.qc_report], ['unverified', false, false]);
});

Deno.test('v2.3 regionContextOf: null for edit_text, for an edit_region without a mask_rect and for a non-object mask_rect; the fields qc-judge reads', () => {
  assertEquals(regionContextOf(regionGen()), { instruction: 'change the sunglass color to red', rect: regionRect, overflow_measured: false, overflow_px: 0, composite_mode: 'locked' });
  for (const gen of [
    regionGen({ kind: 'edit_text' }), regionGen({ kind: 'initial' }), regionGen({ kind: 'regen' }), regionGen({ kind: null }),
    regionGen({ mask_rect: undefined }), regionGen({ mask_rect: null }), regionGen({ mask_rect: '413,287,305,158' }), regionGen({ mask_rect: [413, 287, 305, 158] }),
    regionGen({ mask_rect: 42 }), regionGen({ mask_rect: {} }), regionGen({ mask_rect: { x: 1, y: 1, w: 0, h: 5 } }), regionGen({ mask_rect: { x: -1, y: 1, w: 5, h: 5 } }),
    regionGen({ mask_rect: { x: '413', y: 287, w: 305, h: 158 } }), regionGen({ mask_rect: { ...regionRect, width: 0 } }), null, undefined, 'edit_region', [],
  ]) {
    assertEquals(regionContextOf(gen), null, 'null for ' + JSON.stringify(gen));
  }
  // a rect without width / height (older rows) is still a rect; a null instruction is ''; no metrics -> nothing measured
  const bare = regionContextOf({ kind: 'edit_region', mask_rect: { x: 10, y: 20, w: 30, h: 40 }, edit_instruction: null });
  assertEquals(bare, { instruction: '', rect: { x: 10, y: 20, w: 30, h: 40 }, overflow_measured: false, overflow_px: 0, composite_mode: null });
  assertEquals(regionContextOf(regionGen({ region_metrics: { version: 1, mode: 'extend', overflow: { detected: false, px: 0 } } }))?.composite_mode, 'extend');
});

Deno.test('v2.3 parseRegionVerdict: tolerant reading, missing / unreadable states, notes one line; an unreadable key -> 4 checks not reported, verdict untouched', () => {
  assertEquals(parseRegionVerdict(undefined).state, 'missing');
  assertEquals(parseRegionVerdict(null).state, 'missing');
  assertEquals(parseRegionVerdict('').state, 'missing');
  for (const junk of [{ foo: 1 }, 42, true, 'yes', '{"instruction_done": tru', [1], { notes: 'only notes' }]) assertEquals(parseRegionVerdict(junk).state, 'unreadable', 'unreadable ' + JSON.stringify(junk));
  const str = parseRegionVerdict('{"instruction_done":"yes","seam_visible":"no","object_cut_off":0,"text_changed":null,"notes":"  all\\n good.  "}');
  assertEquals(str, { region: { instruction_done: true, seam_visible: false, object_cut_off: false, text_changed: null, notes: 'all good' }, state: 'ok', text_null: true });
  assertEquals(parseRegionVerdict({ text_changed: null }).text_null, true, 'a lone text_changed null is readable');
  assertEquals(parseRegionVerdict({ instruction_done: true }).text_null, false);
  assertEquals(parseRegionVerdict({ instruction_done: true, note: 'x'.repeat(300) }).region.notes.length, 240);
  // on an area edit an unreadable region key reports nothing and changes no verdict
  const r = normaliseQc(withRegion({ foo: 1 }), regionCtx);
  for (const id of REGION_IDS) assertEquals([check(r, id)?.pass, check(r, id)?.note], [null, REGION_NOT_REPORTED], id);
  assertEquals([r.qc_report.verdict, r.needs_regen], ['pass', false]);
  assertEquals(r.qc_report.region, { instruction_done: null, seam_visible: null, object_cut_off: null, text_changed: null, notes: '', overflow_measured: false });
  // the key missing altogether: the same, the report still carries region (the generation IS an area edit)
  const missing = normaliseQc(FIXTURES.v2AllGood, regionCtx);
  assertEquals(missing.qc_report.checks.length, 16);
  assertEquals(missing.qc_report.region?.instruction_done, null);
});

Deno.test('qc-judge index.ts v2.3 wiring: the row is loaded with kind, mask_rect, edit_instruction and region_metrics; regionContextOf feeds normaliseQc; the response adds region', async () => {
  const src = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
  assertStringIncludes(src, 'select=id,attempt,kind,mask_rect,edit_instruction,region_metrics,style_card_snapshot,magic_prompt_json,brief_snapshot,cards!generations_card_id_fkey(print_text,client_submission)');
  assertStringIncludes(src, 'const region = regionContextOf(gen);');
  assertStringIncludes(src, 'qc_subject_regen, art_reference_attached, qc_art_regen, region });');
  assertStringIncludes(src, 'region: qc_report.region ?? null,');
  assert(src.startsWith('// qc-judge v2.3'), 'header names v2.3');
});
