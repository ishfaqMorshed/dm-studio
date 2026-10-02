// qc-judge v2 tests. Run: npm run test:functions (Node shim, spec 3.4)   or   deno test supabase/functions/qc-judge/
// No jsr imports on purpose (local assert helpers, like render_test.ts) so the file runs under node --experimental-strip-types.
import { readFile } from 'node:fs/promises';
import {
  ART_MATCH_KEYS, ART_NOT_REPORTED, ART_UNREADABLE, artCorrection, artStyleCheck, buildStyleMatch, fromArtReference, normaliseQc, parseArtMatch,
  pickStyleJson, STYLE_FIELDS, subjectCorrection, UNREAD_MEDIUM_NOTE, UNREAD_PALETTE_NOTE, unreadArtLook,
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
