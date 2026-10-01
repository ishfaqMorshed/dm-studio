// qc-judge v2 tests. Run: npm run test:functions (Node shim, spec 3.4)   or   deno test supabase/functions/qc-judge/
// No jsr imports on purpose (local assert helpers, like render_test.ts) so the file runs under node --experimental-strip-types.
import { buildStyleMatch, fromArtReference, normaliseQc, pickStyleJson, subjectCorrection, UNREAD_MEDIUM_NOTE, UNREAD_PALETTE_NOTE, unreadArtLook } from './qc.ts';
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
