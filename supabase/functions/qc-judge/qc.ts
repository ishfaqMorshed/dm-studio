// qc-judge — pure normaliser for the vision QC verdict.
// No Deno / network here so it can be unit-tested anywhere (deno test, or node --experimental-strip-types).
//
// Input verdict schema = the T-Shirt Engine 9-point JSON (docs/tshirt-engine/EXTRACT.md §3.8, node `Build QC Request`):
// {"text_found":"...","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,
//  "background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":["..."],"pass":true}
// DM Studio additions the QC prompt may also return (all optional, tolerated when absent):
//  palette_ok:boolean, style_violations:string[], min_text_height_frac:number, text_elements:[{text,role?,height_frac?}], cropped:boolean

export type QcCheck = { id: string; name: string; pass: boolean | null; note: string };

export type QcReport = {
  version: 1;
  verdict: 'pass' | 'fail' | 'unverified';
  checks: QcCheck[];
  score: number | null;
  needs_regen: boolean;
  corrective_instruction: string | null;
  style_violations: string[];
  text_ok: boolean | null;
  text_found: string;
  expected_text: string[];
  min_text_height_frac: number | null;
  issues: string[];
  parse_error: string | null;
  attempt: number;
};

export type QcContext = {
  exact_text_lines?: unknown;
  style_card?: unknown;
  attempt?: unknown;
};

type Verdict = Record<string, unknown>;

// ---- the 9 checks, verbatim ids from the engine's verdict schema -------------------------------------------------
// `mode` mirrors Parse QC scoring: 'strictTrue' counts only === true, 'notFalse' counts anything but === false,
// 'strictFalse' (extra_text) counts only === false.
const CORE_CHECKS: { id: string; name: string; mode: 'strictTrue' | 'notFalse' | 'strictFalse'; regen: boolean }[] = [
  { id: 'text_matches',  name: 'Text matches expected exactly',          mode: 'strictTrue',  regen: true },
  { id: 'text_once',     name: 'Text appears exactly once',              mode: 'notFalse',    regen: true },
  { id: 'extra_text',    name: 'No extra text, watermarks or logos',     mode: 'strictFalse', regen: true },
  { id: 'text_legible',  name: 'Letters fully formed and legible',       mode: 'notFalse',    regen: true },
  { id: 'no_halos',      name: 'No white halos or fringes',              mode: 'notFalse',    regen: true },
  { id: 'background_ok', name: 'One flat even neutral grey background',  mode: 'strictTrue',  regen: true },
  { id: 'no_shadows',    name: 'No drop, cast or ambient shadows',       mode: 'strictTrue',  regen: true },
  { id: 'flat_artwork',  name: 'Flat artwork, not a mockup',             mode: 'strictTrue',  regen: true },
  { id: 'edges_clean',   name: 'Continuous edges, no stray dots',        mode: 'notFalse',    regen: true },
];

// Verbatim template pieces from `Build Corrective Gen Request` (EXTRACT.md §3.9).
const CORRECTIVE_HEAD = 'CRITICAL CORRECTIONS - a previous attempt failed quality inspection. Fix ALL of the following while keeping everything else identical: ';
const CORRECTIVE_FALLBACK = 'render the text perfectly, keep the background one flat solid grey, remove all shadows';
const CORRECTIVE_NO_TEXT = '. The image must contain NO text at all - no words, letters, watermarks or signatures.';

// ---- tolerant coercion helpers --------------------------------------------------------------------------------------
export function toBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'pass', 'ok'].includes(s)) return true;
    if (['false', 'no', 'n', '0', 'fail'].includes(s)) return false;
  }
  return undefined;
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace('%', ''));
    if (Number.isFinite(n)) return v.includes('%') ? n / 100 : n;
  }
  return null;
}

function toStrList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined && x !== '').map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).map((s) => s.trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

export function normaliseTextLines(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object' && typeof (x as Record<string, unknown>).text === 'string') return (x as Record<string, string>).text;
      return '';
    }).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof v === 'string') return v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return [];
}

// ---- raw → verdict object (fenced strings, whole Gemini responses, nested content) --------------------------------
export function extractVerdict(raw: unknown): { verdict: Verdict | null; error: string | null } {
  let candidate: unknown = raw;
  // Whole chat-completions response: { choices:[{ message:{ content } }] }
  for (let i = 0; i < 3 && candidate && typeof candidate === 'object' && !Array.isArray(candidate); i++) {
    const o = candidate as Record<string, unknown>;
    if (Array.isArray(o.choices) && o.choices[0] && typeof o.choices[0] === 'object') {
      const msg = (o.choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
      candidate = msg?.content ?? (o.choices[0] as Record<string, unknown>).text ?? null;
      continue;
    }
    if (typeof o.content === 'string' || typeof o.qc_raw === 'string' || typeof o.text === 'string') {
      // Gemini content may itself be an array of parts; accept the first text part.
      candidate = o.content ?? o.qc_raw ?? o.text;
      continue;
    }
    if (Array.isArray(o.content)) {
      const part = (o.content as unknown[]).find((p) => p && typeof p === 'object' && typeof (p as Record<string, unknown>).text === 'string') as Record<string, unknown> | undefined;
      candidate = part?.text ?? null;
      continue;
    }
    break;
  }
  if (candidate === null || candidate === undefined || candidate === '') return { verdict: null, error: 'empty QC response' };
  if (typeof candidate === 'string') {
    const cleaned = candidate.replace(/```(?:json|JSON)?/g, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    try {
      const parsed = JSON.parse(m ? m[0] : cleaned);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { verdict: parsed as Verdict, error: null };
      return { verdict: null, error: 'QC response is not a JSON object' };
    } catch (e) {
      return { verdict: null, error: 'QC response is not valid JSON: ' + ((e as Error).message || 'parse failed').slice(0, 120) };
    }
  }
  if (typeof candidate === 'object' && !Array.isArray(candidate)) return { verdict: candidate as Verdict, error: null };
  return { verdict: null, error: 'QC response has an unsupported type: ' + typeof candidate };
}

// ---- corrective instruction (EXTRACT.md §3.9 wording) ---------------------------------------------------------------
export function buildCorrective(issues: string[], expectedLines: string[]): string {
  let add = CORRECTIVE_HEAD + (issues.length ? issues.join('; ') : CORRECTIVE_FALLBACK);
  if (expectedLines.length) {
    const expected = expectedLines.join(' / ');
    const spelled = expectedLines.map((l) => l.split('').join(' ')).join(' / ');
    add += '. The ONLY text in the image must read exactly: "' + expected + '" - spelled letter for letter (' + spelled + ') - with no other words, watermarks or signatures anywhere.';
  } else {
    add += CORRECTIVE_NO_TEXT;
  }
  return add;
}

// ---- main -------------------------------------------------------------------------------------------------------------
export function normaliseQc(raw: unknown, ctx: QcContext = {}): { qc_report: QcReport; needs_regen: boolean; text_elements: unknown[] } {
  const expected = normaliseTextLines(ctx.exact_text_lines);
  const attemptN = toNum(ctx.attempt);
  const attempt = attemptN && attemptN >= 1 ? Math.floor(attemptN) : 1;
  const card = ctx.style_card && typeof ctx.style_card === 'object' ? (ctx.style_card as Record<string, unknown>) : null;
  const palette = card && Array.isArray(card.palette) ? (card.palette as unknown[]) : [];

  const { verdict, error } = extractVerdict(raw);
  const known = CORE_CHECKS.map((c) => c.id).concat(['pass', 'issues', 'text_found']);
  const hasVerdictKeys = !!verdict && known.some((k) => k in verdict);

  // -- fail-open: the engine passes as `unverified`; DM Studio flags it for the designer, never regenerates on it.
  if (!verdict || !hasVerdictKeys) {
    const parse_error = error ?? 'QC verdict has none of the expected keys';
    const checks: QcCheck[] = CORE_CHECKS.map((c) => ({ id: c.id, name: c.name, pass: null, note: 'unverified - ' + parse_error }));
    checks.push({ id: 'style_palette', name: 'Palette matches Style Card', pass: null, note: 'unverified' });
    if (expected.length) checks.push({ id: 'text_height', name: 'Text large enough to print', pass: null, note: 'unverified' });
    const report: QcReport = {
      version: 1, verdict: 'unverified', checks, score: null, needs_regen: false, corrective_instruction: null,
      style_violations: [], text_ok: null, text_found: '', expected_text: expected, min_text_height_frac: null,
      issues: [], parse_error, attempt,
    };
    return { qc_report: report, needs_regen: false, text_elements: [] };
  }

  const v = verdict as Verdict;
  const issues = toStrList(v.issues);
  const text_found = typeof v.text_found === 'string' ? v.text_found.trim() : (v.text_found == null ? '' : String(v.text_found));

  // -- the 9 core checks, scored exactly like `Parse QC`
  let ok = 0;
  const failedRegen: string[] = [];
  const checks: QcCheck[] = CORE_CHECKS.map((c) => {
    const b = toBool(v[c.id]);
    let pass: boolean;
    if (c.mode === 'strictTrue') pass = b === true;
    else if (c.mode === 'strictFalse') pass = b === false;
    else pass = b !== false; // notFalse: missing counts as pass (engine behaviour)
    if (pass) ok++; else if (c.regen) failedRegen.push(c.id);
    const note = b === undefined ? (pass ? 'not reported' : 'not reported - treated as failed') : (pass ? '' : (issueFor(issues, c.id) ?? 'failed'));
    return { id: c.id, name: c.name, pass, note };
  });
  const score = Math.round((ok / CORE_CHECKS.length) * 100);

  // -- optional: cropping (regen-worthy when the judge reports it)
  const cropped = toBool(v.cropped);
  if (cropped !== undefined) {
    checks.push({ id: 'not_cropped', name: 'Artwork not cropped by the frame', pass: !cropped, note: cropped ? (issueFor(issues, 'crop') ?? 'artwork touches or leaves the frame') : '' });
    if (cropped) failedRegen.push('not_cropped');
  }

  // -- Style Card palette check + rules-violated list (designer flags, never regen)
  const style_violations = toStrList(v.style_violations);
  const paletteOk = toBool(v.palette_ok);
  const paletteViolation = style_violations.find((s) => /palette|colou?r|hex/i.test(s));
  if (paletteOk === false && !paletteViolation) style_violations.push('palette drifts from the Style Card' + (palette.length ? ' (' + palette.map(hexOf).filter(Boolean).join(', ') + ')' : ''));
  const palettePass = paletteOk !== false && !paletteViolation;
  checks.push({
    id: 'style_palette', name: 'Palette matches Style Card',
    pass: palettePass,
    note: palettePass ? (paletteOk === undefined ? (palette.length ? 'not reported' : 'no palette on Style Card') : '') : (paletteViolation ?? 'palette drifts from the Style Card'),
  });
  // Forbidden elements from the Style Card the judge named in issues/violations
  const forbid = card ? toStrList(card.forbid) : [];
  for (const f of forbid) {
    const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (issues.concat(style_violations).some((s) => re.test(s)) && !style_violations.some((s) => s.toLowerCase().includes(f.toLowerCase()))) style_violations.push('forbidden element present: ' + f);
  }

  // -- text height (informational unless the judge says it is too small)
  const min_text_height_frac = toNum(v.min_text_height_frac);
  const textHeightOk = toBool(v.text_height_ok);
  if (expected.length) {
    const pass = textHeightOk !== false;
    checks.push({ id: 'text_height', name: 'Text large enough to print', pass, note: pass ? (min_text_height_frac === null ? 'not reported' : 'min glyph height ' + (min_text_height_frac * 100).toFixed(1) + '% of image') : (issueFor(issues, 'small') ?? 'text too small to print') });
  }

  // -- text verdict
  const tm = toBool(v.text_matches) === true;
  const to = toBool(v.text_once) !== false;
  const et = toBool(v.extra_text) === false;
  const text_ok = tm && to && et;

  // -- overall: `pass` from the judge, else derived from the checks
  let pass = toBool(v.pass);
  if (pass === undefined) pass = checks.every((c) => c.pass !== false);
  if (pass && checks.some((c) => c.pass === false)) pass = false; // the judge said pass but a check is explicitly false: trust the checks

  const needs_regen = !pass && failedRegen.length > 0;
  const corrective_instruction = needs_regen ? buildCorrective(issues, expected) : null;

  // -- text_elements for generations.text_elements
  let text_elements: unknown[] = [];
  if (Array.isArray(v.text_elements) && v.text_elements.length) {
    text_elements = v.text_elements.map((t) => (t && typeof t === 'object') ? t : { text: String(t) });
  } else {
    text_elements = [{ text: text_found, expected, matches: text_ok, min_height_frac: min_text_height_frac }];
  }

  const report: QcReport = {
    version: 1,
    verdict: pass ? 'pass' : 'fail',
    checks, score, needs_regen, corrective_instruction, style_violations, text_ok, text_found,
    expected_text: expected, min_text_height_frac, issues, parse_error: null, attempt,
  };
  return { qc_report: report, needs_regen, text_elements };
}

function issueFor(issues: string[], key: string): string | undefined {
  const words: Record<string, RegExp> = {
    text_matches: /spell|word|text|read|letter/i, text_once: /once|repeat|duplicate|echo|mirror|twice/i, extra_text: /extra|watermark|signature|logo|tagline|additional/i,
    text_legible: /legib|stroke|broken|distress|wav|warp/i, no_halos: /halo|fringe|glow|outline/i, background_ok: /background|grey|gray|gradient/i,
    no_shadows: /shadow/i, flat_artwork: /mockup|garment|shirt|photo/i, edges_clean: /edge|dot|speck|noise|jagged/i, crop: /crop|cut off|frame|edge of the image/i, small: /small|tiny|height|larger/i,
  };
  const re = words[key];
  return re ? issues.find((s) => re.test(s)) : undefined;
}

function hexOf(p: unknown): string {
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object' && typeof (p as Record<string, unknown>).hex === 'string') return (p as Record<string, string>).hex;
  return '';
}
