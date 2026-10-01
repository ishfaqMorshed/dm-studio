// qc-judge v2 — pure normaliser for the vision QC verdict.
// No Deno / network here so it can be unit-tested anywhere (deno test, or node --experimental-strip-types).
//
// Input verdict schema = the T-Shirt Engine 9-point JSON (docs/tshirt-engine/EXTRACT.md §3.8, node `Build QC Request`):
// {"text_found":"...","text_matches":true,"text_once":true,"extra_text":false,"text_legible":true,"no_halos":true,
//  "background_ok":true,"no_shadows":true,"flat_artwork":true,"edges_clean":true,"issues":["..."],"pass":true}
// DM Studio additions the QC prompt may also return (all optional, tolerated when absent):
//  qc_prompt v1 tail: palette_ok:boolean, style_violations:string[], min_text_height_frac:number, text_elements:[{text,role?,height_frac?}], cropped:boolean
//  qc_prompt v2 tail (studio_21): "style": {subject_seen, subject_ok:true|false|null, palette_ok, off_palette_colours:[{name,hex,area}],
//    medium_ok, typography_ok, composition_ok, forbid_hits:[n], case_seen, text_height_ok, min_text_height_frac, cropped}
//
// v2 (2026-09-30): style_match {score, checks[{id, field, pass, note}]} judged against the Style Card only; verdict 'warn'
// for style-only findings (core checks decide 'fail'); the wrong hero regenerates once when settings.qc_subject_regen is on
// and an expected subject exists; the forbid regex matcher is gone (the judge reports forbid_hits by number).
// v2.1 (2026-10-01, art-style override): the style JSON may be prompt-engine v8's magic_prompt_json.effective_style. When it
// carries source 'art_reference' the look was set by the card's Art style reference, so the palette / medium notes and
// the palette check name say "the Art style reference" instead of "the Style Card". Judging is unchanged, except that a
// value-less art look (no per-slot reading of the art image: palette [] / empty medium .. edge_finish) leaves the palette
// and medium checks not judged (pass null) - QC sees only the generated image, there is nothing to compare against.

export type QcCheck = { id: string; name: string; pass: boolean | null; note: string };
export type StyleCheck = { id: string; field: string; pass: boolean | null; note: string };
export type StyleMatch = { score: number | null; checks: StyleCheck[]; subject_seen: string; case_seen: string };

export type QcReport = {
  version: 2;
  verdict: 'pass' | 'warn' | 'fail' | 'unverified';
  checks: QcCheck[];
  score: number | null;
  style_match: StyleMatch | null;
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
  /** magic_prompt_json.subject.text (the SUBJECT block); '' when the design has no explicit subject */
  expected_subject?: unknown;
  /** settings.qc_subject_regen (default true): regenerate once when the judge reports the wrong hero */
  qc_subject_regen?: unknown;
};

type Verdict = Record<string, unknown>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** True when the style JSON is an effective_style whose look comes from the Art style reference. */
export function fromArtReference(card: unknown): boolean {
  return isObj(card) && card.source === 'art_reference';
}

/**
 * What an art-reference style JSON leaves unread: prompt-engine v8 sends a value-less look (empty medium .. edge_finish,
 * palette []) when the card's Art style slot has no per-slot reading - the prompt then says "exactly as in Image k".
 * QC sees only the generated image, so there is nothing to judge palette / medium against: those checks are not judged
 * (pass null) instead of failing against an empty list. A Style Card JSON is never "unread".
 */
export function unreadArtLook(card: unknown): { palette: boolean; medium: boolean } {
  if (!fromArtReference(card)) return { palette: false, medium: false };
  const c = card as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const lw = isObj(c.linework) ? c.linework : {};
  const palette = !(Array.isArray(c.palette) && c.palette.length > 0);
  const medium = [c.medium, c.realism, c.shading, c.shading_method, c.texture, c.edge_finish, lw.weight, lw.style].every((v) => str(v) === '');
  return { palette, medium };
}
export const UNREAD_PALETTE_NOTE = 'not judged - no colours were read from the Art style reference';
export const UNREAD_MEDIUM_NOTE = 'not judged - the Art style reference look was not read';

/** Wording of the look the style JSON describes (notes and the palette check name). */
function lookWords(card: unknown): { name: string; the: string; medium: string } {
  return fromArtReference(card)
    ? { name: 'Art style reference', the: 'the Art style reference', medium: 'not drawn in the Art style reference medium, linework or shading' }
    : { name: 'Style Card', the: 'the Style Card', medium: 'not drawn in the card medium, linework or shading method' };
}

/**
 * The style JSON qc-judge judges against: the caller's style_card, else prompt-engine v8's
 * magic_prompt_json.effective_style (the look the prompt asked for - the Art style reference look on an art-reference
 * card), else the generation's style_card_snapshot (engines <= v7).
 */
export function pickStyleJson(bodyStyleCard: unknown, magic: unknown, snapshot: unknown): unknown {
  if (bodyStyleCard !== undefined && bodyStyleCard !== null) return bodyStyleCard;
  const es = isObj(magic) ? magic.effective_style : undefined;
  if (isObj(es)) return es;
  return snapshot;
}

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

/** style_match check ids -> the Style Card field they judge (deep links in the UI). */
export const STYLE_FIELDS: Record<string, string> = {
  palette: 'palette', medium: 'medium', typography: 'typography.headline', composition: 'composition', subject: 'subjects', forbid: 'forbid',
};

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

function toIntList(v: unknown): number[] {
  const arr = Array.isArray(v) ? v : (v === null || v === undefined || v === '' ? [] : [v]);
  const out: number[] = [];
  for (const x of arr) {
    const n = typeof x === 'number' ? x : (typeof x === 'string' ? Number(x.replace(/[^\d.-]/g, '')) : NaN);
    if (Number.isFinite(n) && Math.round(n) >= 1 && !out.includes(Math.round(n))) out.push(Math.round(n));
  }
  return out;
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

/** The sentence appended to the corrective instruction when the judge reports the wrong hero. */
export function subjectCorrection(expectedSubject: string, subjectSeen: string): string {
  return 'Draw ' + expectedSubject + ' as the hero, not ' + (subjectSeen || 'what the text names') + '; the text is lettering only and never chooses the subject';
}

// ---- style_match (qc_prompt v2 "style" key, judged against the Style Card only) ---------------------------------------
export function buildStyleMatch(v: Verdict, card: Record<string, unknown> | null, expectedSubject: string): StyleMatch {
  const style = isObj(v.style) ? v.style : {};
  const look = lookWords(card);
  const unread = unreadArtLook(card);
  const rules = card && isObj(card.rules) ? card.rules : {};
  const forbid = card ? toStrList(card.forbid) : [];
  const checks: StyleCheck[] = [];
  const nr = 'not reported';
  const push = (id: string, pass: boolean | null, note: string) => checks.push({ id, field: STYLE_FIELDS[id], pass, note: pass === null && !note ? nr : note });

  // palette: palette_ok, plus off_palette_colours with a LARGE area in flexible mode
  if (unread.palette) push('palette', null, UNREAD_PALETTE_NOTE);
  else {
    const ok = toBool(style.palette_ok);
    const off = (Array.isArray(style.off_palette_colours) ? style.off_palette_colours : []).filter(isObj);
    const large = off.filter((o) => /large/i.test(String(o.area ?? '')));
    const flexible = rules.palette_mode === 'flexible';
    const offNote = off.length ? 'off-palette: ' + off.map((o) => [String(o.name ?? '').trim(), String(o.hex ?? '').trim().toUpperCase()].filter(Boolean).join(' ') + (o.area ? ' (' + String(o.area) + ')' : '')).join(', ') : '';
    let pass: boolean | null;
    if (ok === undefined) pass = flexible && large.length ? false : (off.length ? true : null);
    else pass = ok && !(flexible && large.length);
    push('palette', pass, pass === false ? (offNote || 'palette drifts from ' + look.the) : offNote);
  }
  if (unread.medium) push('medium', null, UNREAD_MEDIUM_NOTE);
  else {
    const ok = toBool(style.medium_ok);
    push('medium', ok === undefined ? null : ok, ok === false ? look.medium : '');
  }
  {
    const ok = toBool(style.typography_ok);
    push('typography', ok === undefined ? null : ok, ok === false ? 'letterform style or placement differs from the card typography' : '');
  }
  {
    if (rules.lock_composition === false) push('composition', true, 'guide - not judged');
    else {
      const ok = toBool(style.composition_ok);
      push('composition', ok === undefined ? null : ok, ok === false ? 'composition differs from the card' : '');
    }
  }
  const subjectSeen = typeof style.subject_seen === 'string' ? style.subject_seen.trim() : '';
  {
    const raw = style.subject_ok;
    const ok = raw === null ? null : toBool(raw);
    const pass = ok === undefined ? null : ok;
    const drawn = subjectSeen ? 'drawn: ' + subjectSeen : '';
    push('subject', pass, pass === null ? (raw === null || !expectedSubject ? (drawn ? drawn + ' (no subject given)' : 'no subject given') : '') : drawn);
  }
  {
    const hits = toIntList(style.forbid_hits).filter((n) => n <= forbid.length || !forbid.length);
    const named = hits.map((n) => 'forbidden element present: ' + (forbid[n - 1] ?? '#' + n));
    const reported = 'forbid_hits' in style;
    push('forbid', hits.length ? false : (reported ? true : null), named.join('; '));
  }
  const judged = checks.filter((c) => c.pass !== null);
  const score = judged.length ? Math.round((judged.filter((c) => c.pass === true).length / judged.length) * 100) : null;
  return { score, checks, subject_seen: subjectSeen, case_seen: typeof style.case_seen === 'string' ? style.case_seen.trim() : '' };
}

// ---- main -------------------------------------------------------------------------------------------------------------
export function normaliseQc(raw: unknown, ctx: QcContext = {}): { qc_report: QcReport; needs_regen: boolean; text_elements: unknown[] } {
  const expected = normaliseTextLines(ctx.exact_text_lines);
  const attemptN = toNum(ctx.attempt);
  const attempt = attemptN && attemptN >= 1 ? Math.floor(attemptN) : 1;
  const card = isObj(ctx.style_card) ? ctx.style_card : null;
  const palette = card && Array.isArray(card.palette) ? (card.palette as unknown[]) : [];
  const look = lookWords(card);
  const expectedSubject = typeof ctx.expected_subject === 'string' ? ctx.expected_subject.trim() : '';
  const subjectRegenOn = ctx.qc_subject_regen === undefined || ctx.qc_subject_regen === null ? true : toBool(ctx.qc_subject_regen) !== false;

  const { verdict, error } = extractVerdict(raw);
  const known = CORE_CHECKS.map((c) => c.id).concat(['pass', 'issues', 'text_found']);
  const hasVerdictKeys = !!verdict && known.some((k) => k in verdict);

  // -- fail-open: the engine passes as `unverified`; DM Studio flags it for the designer, never regenerates on it.
  if (!verdict || !hasVerdictKeys) {
    const parse_error = error ?? 'QC verdict has none of the expected keys';
    const checks: QcCheck[] = CORE_CHECKS.map((c) => ({ id: c.id, name: c.name, pass: null, note: 'unverified - ' + parse_error }));
    checks.push({ id: 'style_palette', name: 'Palette matches ' + look.name, pass: null, note: 'unverified' });
    if (expected.length) checks.push({ id: 'text_height', name: 'Text large enough to print', pass: null, note: 'unverified' });
    const report: QcReport = {
      version: 2, verdict: 'unverified', checks, score: null, style_match: null, needs_regen: false, corrective_instruction: null,
      style_violations: [], text_ok: null, text_found: '', expected_text: expected, min_text_height_frac: null,
      issues: [], parse_error, attempt,
    };
    return { qc_report: report, needs_regen: false, text_elements: [] };
  }

  const v = verdict as Verdict;
  const style = isObj(v.style) ? v.style : {};
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

  // -- optional: cropping (regen-worthy when the judge reports it; qc_prompt v2 reports it inside "style")
  const cropped = toBool(v.cropped ?? style.cropped);
  if (cropped !== undefined) {
    checks.push({ id: 'not_cropped', name: 'Artwork not cropped by the frame', pass: !cropped, note: cropped ? (issueFor(issues, 'crop') ?? 'artwork touches or leaves the frame') : '' });
    if (cropped) failedRegen.push('not_cropped');
  }

  // -- Style Card: style_match (v2) + the compat palette check + the rules-violated list (designer flags)
  const style_match = buildStyleMatch(v, card, expectedSubject);
  const style_violations = toStrList(v.style_violations);
  const paletteUnread = unreadArtLook(card).palette;
  const paletteOk = paletteUnread ? undefined : toBool(style.palette_ok ?? v.palette_ok);
  const paletteViolation = paletteUnread ? undefined : style_violations.find((s) => /palette|colou?r|hex/i.test(s));
  const paletteCheck = style_match.checks.find((c) => c.id === 'palette');
  const palettePass = paletteOk !== false && !paletteViolation && paletteCheck?.pass !== false;
  if (!palettePass && !paletteViolation) style_violations.push(paletteCheck?.note && paletteCheck.pass === false ? paletteCheck.note : 'palette drifts from ' + look.the + (palette.length ? ' (' + palette.map(hexOf).filter(Boolean).join(', ') + ')' : ''));
  checks.push({
    id: 'style_palette', name: 'Palette matches ' + look.name,
    pass: paletteUnread ? null : palettePass,
    note: paletteUnread ? UNREAD_PALETTE_NOTE : palettePass ? (paletteOk === undefined && paletteCheck?.pass === null ? (palette.length ? 'not reported' : 'no palette on ' + look.name) : '') : (paletteViolation ?? style_violations[style_violations.length - 1]),
  });
  // forbid hits the judge numbered (the v1 regex matcher over issues is gone)
  const forbidCheck = style_match.checks.find((c) => c.id === 'forbid');
  if (forbidCheck?.pass === false) for (const n of forbidCheck.note.split('; ')) if (n && !style_violations.includes(n)) style_violations.push(n);

  // -- text height (informational unless the judge says it is too small; v2 reports it inside "style")
  const min_text_height_frac = toNum(v.min_text_height_frac ?? style.min_text_height_frac);
  const textHeightOk = toBool(v.text_height_ok ?? style.text_height_ok);
  if (expected.length) {
    const pass = textHeightOk !== false;
    checks.push({ id: 'text_height', name: 'Text large enough to print', pass, note: pass ? (min_text_height_frac === null ? 'not reported' : 'min glyph height ' + (min_text_height_frac * 100).toFixed(1) + '% of image') : (issueFor(issues, 'small') ?? 'text too small to print') });
  }

  // -- text verdict
  const tm = toBool(v.text_matches) === true;
  const to = toBool(v.text_once) !== false;
  const et = toBool(v.extra_text) === false;
  const text_ok = tm && to && et;

  // -- overall: core checks decide 'fail'; style findings (or a judge pass:false with every check green) are 'warn'
  const judgePass = toBool(v.pass);
  const coreFailed = checks.some((c) => c.pass === false && c.id !== 'style_palette');
  const subjectCheck = style_match.checks.find((c) => c.id === 'subject');
  const subjectRegen = subjectRegenOn && !!expectedSubject && subjectCheck?.pass === false;
  const styleWarn = (style_match.score !== null && style_match.score < 100) || judgePass === false || !palettePass;
  const verdictWord: QcReport['verdict'] = coreFailed || subjectRegen ? 'fail' : (styleWarn ? 'warn' : 'pass');

  const needs_regen = (coreFailed && failedRegen.length > 0) || subjectRegen;
  const correctiveIssues = issues.slice();
  if (subjectRegen) correctiveIssues.push(subjectCorrection(expectedSubject, style_match.subject_seen));
  const corrective_instruction = needs_regen ? buildCorrective(correctiveIssues, expected) : null;

  // -- text_elements for generations.text_elements
  let text_elements: unknown[] = [];
  if (Array.isArray(v.text_elements) && v.text_elements.length) {
    text_elements = v.text_elements.map((t) => (t && typeof t === 'object') ? t : { text: String(t) });
  } else {
    text_elements = [{ text: text_found, expected, matches: text_ok, min_height_frac: min_text_height_frac }];
  }

  const report: QcReport = {
    version: 2,
    verdict: verdictWord,
    checks, score, style_match, needs_regen, corrective_instruction, style_violations, text_ok, text_found,
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
