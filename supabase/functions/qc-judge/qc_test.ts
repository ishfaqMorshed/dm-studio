// deno test supabase/functions/qc-judge/qc_test.ts
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { normaliseQc } from './qc.ts';
import { FIXTURES } from './qc_fixtures.ts';

const ctx = { exact_text_lines: ['FAMILY FIRST'], style_card: { palette: [{ name: 'ink', hex: '#111111', weight: 'dominant' }], forbid: ['gradients'] } };

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

Deno.test('style-only violation does not regen', () => {
  const r = normaliseQc(FIXTURES.styleOnly, ctx);
  assertEquals(r.qc_report.verdict, 'fail');
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
