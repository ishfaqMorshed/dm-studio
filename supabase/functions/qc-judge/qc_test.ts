// qc-judge v2 tests. Run: npm run test:functions (Node shim, spec 3.4)   or   deno test supabase/functions/qc-judge/
// No jsr imports on purpose (local assert helpers, like render_test.ts) so the file runs under node --experimental-strip-types.
import { buildStyleMatch, normaliseQc, subjectCorrection } from './qc.ts';
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
