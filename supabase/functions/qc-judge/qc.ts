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
// v2.2 (2026-10-02, QC sees the Art style reference): WF-2 attaches the card's Art style reference as the SECOND image of
// the vision call and sends art_reference_attached true; qc_prompt v2 (studio_28) then asks for style.art_match
// {medium_ok, linework_ok, shading_ok, texture_ok, palette_ok, overall same|close|different, notes}. It becomes ONE
// combined style_match check, id 'art_style', field 'art_reference' (one row "Drawn like the Art style reference" with the
// notes reads clearer than five sub-rows, and a different style weighs once in the score): pass false when overall is
// 'different' or any sub-key is false, true when 'same' / 'close' with no false sub-key, null 'not reported' when
// art_match is missing or unreadable. overall 'different' + settings.qc_art_regen (default true) + attached = verdict
// 'fail', needs_regen and a corrective "Redraw in the attached ART STYLE reference's look"; every other mismatch is a
// 'warn' ('close' never fails). Not attached (WF-3 edits, Style Card looks, older WF-2) = no art check; a stray
// art_match is ignored because the judge never saw the reference.
// v2.3 (2026-10-05, Fix an area = GPT Image 2.5 Sunburst, locked outside): ctx.region (regionContextOf the generation row:
// kind edit_region with a mask_rect) makes the report region-aware. WF-3 adds a REGION EDIT paragraph to the vision call
// (and the previous version as the SECOND image) and the judge returns a top-level "region" key (style.region tolerated):
// {instruction_done, seam_visible, object_cut_off, text_changed: true|false|null, notes}. Four checks are appended after
// the core checks: region_instruction_done and region_text_unchanged fail the verdict; region_no_seam and
// region_not_cut_off only warn (region-composite's measured overflow also marks the element cut off, with an Extend area
// note). Region checks never set needs_regen (WF-3 has no corrective loop). Colours and objects the instruction names
// are never a palette or subject failure (mentionedInInstruction), a palette_ok false without a colour list is not
// judged (the change may bring new colours) and the wrong hero never regenerates an area edit. qc_report.region =
// {...verdict, overflow_measured} exists ONLY when ctx.region: every other report is byte-identical to v2.2.

export type QcCheck = { id: string; name: string; pass: boolean | null; note: string };
export type StyleCheck = { id: string; field: string; pass: boolean | null; note: string };
/** style.art_match as the judge reported it, normalised (sub-keys null when not reported). */
export type ArtMatch = {
  overall: 'same' | 'close' | 'different' | null;
  medium_ok: boolean | null; linework_ok: boolean | null; shading_ok: boolean | null; texture_ok: boolean | null; palette_ok: boolean | null;
  notes: string;
};
export type StyleMatch = {
  score: number | null; checks: StyleCheck[]; subject_seen: string; case_seen: string;
  /** v2.2: true when WF-2 showed the judge the Art style reference (the art_style check exists only then) */
  art_reference_attached: boolean;
  /** v2.2: the normalised style.art_match, null when not attached or not reported */
  art_match: ArtMatch | null;
};

/** v2.3: the judge's "region" key, normalised (null = not reported / unreadable). */
export type RegionVerdict = {
  instruction_done: boolean | null; seam_visible: boolean | null; object_cut_off: boolean | null; text_changed: boolean | null;
  notes: string;
};
/** v2.3: qc_report.region - the region verdict plus whether region-composite measured the new element past the area. */
export type QcRegion = RegionVerdict & { overflow_measured: boolean };
/** v2.3: what qc-judge knows about an area edit (regionContextOf the generation row). */
export type RegionContext = {
  instruction: string;
  rect: Record<string, unknown>;
  /** region_metrics.overflow.detected === true (region-composite measured the change running past the area) */
  overflow_measured: boolean;
  overflow_px: number;
  composite_mode: string | null;
};

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
  /** v2.3: present ONLY on an area edit (ctx.region) */
  region?: QcRegion;
};

export type QcContext = {
  exact_text_lines?: unknown;
  style_card?: unknown;
  attempt?: unknown;
  /** magic_prompt_json.subject.text (the SUBJECT block, whatever its source: brief, subject reference, Style Card or the description fallback); '' only when none reached the judge */
  expected_subject?: unknown;
  /** settings.qc_subject_regen (default true): regenerate once when the judge reports the wrong hero */
  qc_subject_regen?: unknown;
  /** WF-2 body.art_reference_attached: true ONLY when the Art style reference was the second image of the vision call */
  art_reference_attached?: unknown;
  /** settings.qc_art_regen (default true): regenerate once when the judge sees a different art style than the reference */
  qc_art_regen?: unknown;
  /** v2.3: regionContextOf(generation) - set ONLY for an edit_region with a mask_rect */
  region?: unknown;
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

/** style_match check ids -> the Style Card field they judge (deep links in the UI); art_style is no Style Card field -
 *  'art_reference' sends the UI to the card's References panel. */
export const STYLE_FIELDS: Record<string, string> = {
  palette: 'palette', medium: 'medium', typography: 'typography.headline', composition: 'composition', subject: 'subjects', forbid: 'forbid',
  art_style: 'art_reference',
};
/** style.art_match sub-keys, in the order qc_prompt v2 (studio_28) lists them, with the words a note uses. */
export const ART_MATCH_KEYS: { key: 'medium_ok' | 'linework_ok' | 'shading_ok' | 'texture_ok' | 'palette_ok'; word: string }[] = [
  { key: 'medium_ok', word: 'medium' }, { key: 'linework_ok', word: 'linework' }, { key: 'shading_ok', word: 'shading' },
  { key: 'texture_ok', word: 'texture' }, { key: 'palette_ok', word: 'palette' },
];
export const ART_NOT_REPORTED = 'not reported';
export const ART_UNREADABLE = 'not reported - art_match unreadable';

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

/**
 * The sentence appended to the corrective instruction when the judge sees a different art style than the attached reference.
 * Its tail names what to take from the reference (the look only), never what to keep from the failed attempt: the corrective
 * attempt is a fresh render, and a "keep the subject" tail would contradict the wrong-hero sentence when both fire.
 */
export function artCorrection(notes: string, differs: string[] = []): string {
  const what = notes.trim().replace(/[.;\s]+$/, '') || 'match its ' + (differs.length ? differs.join(', ') : 'medium, linework, shading, texture and colours');
  return "Redraw in the attached ART STYLE reference's look: " + what + '; take only its look, never its subject, layout or words';
}

// ---- art_match (qc_prompt v2 + studio_28: the Art style reference is the SECOND image) --------------------------------
function artOverall(v: unknown): ArtMatch['overall'] {
  const w = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (w === 'same' || w === 'identical') return 'same';
  if (w === 'close' || w === 'similar') return 'close';
  if (w === 'different' || w === 'differs' || w === 'differ') return 'different';
  return null;
}

/**
 * style.art_match -> ArtMatch. 'missing' = the key is absent; 'unreadable' = present but neither an overall word nor a
 * boolean sub-key can be read (a bare boolean counts as unreadable - a guess must never trigger a paid retry). A string
 * holding JSON is parsed; a bare string is read as the overall word.
 */
export function parseArtMatch(raw: unknown): { match: ArtMatch | null; state: 'ok' | 'missing' | 'unreadable' } {
  if (raw === undefined || raw === null || raw === '') return { match: null, state: 'missing' };
  let o: unknown = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('{')) { try { o = JSON.parse(t); } catch { return { match: null, state: 'unreadable' }; } }
    else o = { overall: t };
  }
  if (!isObj(o)) return { match: null, state: 'unreadable' };
  const am: Record<string, unknown> = o;
  const sub = (k: string): boolean | null => { const b = toBool(am[k]); return b === undefined ? null : b; };
  const notes = (typeof am.notes === 'string' ? am.notes : typeof am.note === 'string' ? am.note : '').replace(/\s+/g, ' ').trim().replace(/[.;\s]+$/, '').slice(0, 240);
  const match: ArtMatch = {
    overall: artOverall(am.overall), medium_ok: sub('medium_ok'), linework_ok: sub('linework_ok'), shading_ok: sub('shading_ok'),
    texture_ok: sub('texture_ok'), palette_ok: sub('palette_ok'), notes,
  };
  const readable = match.overall !== null || ART_MATCH_KEYS.some((k) => match[k.key] !== null);
  return readable ? { match, state: 'ok' } : { match: null, state: 'unreadable' };
}

/** Sub-keys the judge reported false, as note words (medium, linework, shading, texture, palette). */
export function artDiffers(m: ArtMatch | null): string[] {
  return m ? ART_MATCH_KEYS.filter((k) => m[k.key] === false).map((k) => k.word) : [];
}

/** The one combined art_style check (see the v2.2 header): false on 'different' or any false sub-key. */
export function artStyleCheck(m: ArtMatch | null, state: 'ok' | 'missing' | 'unreadable'): StyleCheck {
  const field = STYLE_FIELDS.art_style;
  if (!m) return { id: 'art_style', field, pass: null, note: state === 'unreadable' ? ART_UNREADABLE : ART_NOT_REPORTED };
  const differs = artDiffers(m);
  const pass = m.overall === 'different' || differs.length ? false : (m.overall !== null || ART_MATCH_KEYS.some((k) => m[k.key] === true) ? true : null);
  const head = m.overall ? (m.notes ? m.overall + ': ' + m.notes : m.overall) : m.notes;
  const tail = differs.length ? differs.join(', ') + (differs.length === 1 ? ' differs' : ' differ') : '';
  const note = head && tail ? head + ' (' + tail + ')' : head || tail;
  return { id: 'art_style', field, pass, note: pass === null && !note ? ART_NOT_REPORTED : note };
}

// ---- v2.3 region (Fix an area): the judge's "region" key, the 4 region checks, instruction exemptions ----------------
export const REGION_CHECKS: { id: string; name: string; warnOnly: boolean }[] = [
  { id: 'region_instruction_done', name: 'Requested change done inside the area', warnOnly: false },
  { id: 'region_text_unchanged', name: 'Lettering unchanged by the area edit', warnOnly: false },
  { id: 'region_no_seam', name: 'No visible seam at the area border', warnOnly: true },
  { id: 'region_not_cut_off', name: 'New element not cut off at the area border', warnOnly: true },
];
/** Checks whose false never makes the verdict 'fail' (they warn): the palette and the two region border checks. */
const WARN_ONLY = new Set(['style_palette', 'region_no_seam', 'region_not_cut_off']);
export const REGION_PALETTE_NOTE = 'not judged on an area edit - the change may bring new colours';
export const REGION_NO_TEXT_NOTE = 'no lettering touches the area';
export const REGION_NOT_REPORTED = 'not reported';
const REGION_KEYS = ['instruction_done', 'seam_visible', 'object_cut_off', 'text_changed'] as const;

/**
 * The judge's region key -> RegionVerdict. 'missing' = absent; 'unreadable' = present but no key can be read (a string
 * holding JSON is parsed). text_null = the judge said text_changed null on purpose (no lettering touches the area).
 */
export function parseRegionVerdict(raw: unknown): { region: RegionVerdict; state: 'ok' | 'missing' | 'unreadable'; text_null: boolean } {
  const empty: RegionVerdict = { instruction_done: null, seam_visible: null, object_cut_off: null, text_changed: null, notes: '' };
  if (raw === undefined || raw === null || raw === '') return { region: empty, state: 'missing', text_null: false };
  let o: unknown = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t.startsWith('{')) return { region: empty, state: 'unreadable', text_null: false };
    try { o = JSON.parse(t); } catch { return { region: empty, state: 'unreadable', text_null: false }; }
  }
  if (!isObj(o)) return { region: empty, state: 'unreadable', text_null: false };
  const rv: Record<string, unknown> = o;
  const sub = (k: string): boolean | null => { const b = toBool(rv[k]); return b === undefined ? null : b; };
  const tc = rv.text_changed;
  const text_null = 'text_changed' in rv && (tc === null || (typeof tc === 'string' && /^(null|none|n\/a)$/i.test(tc.trim())));
  const notes = (typeof rv.notes === 'string' ? rv.notes : typeof rv.note === 'string' ? rv.note : '').replace(/\s+/g, ' ').trim().replace(/[.;\s]+$/, '').slice(0, 240);
  const region: RegionVerdict = {
    instruction_done: sub('instruction_done'), seam_visible: sub('seam_visible'), object_cut_off: sub('object_cut_off'),
    text_changed: sub('text_changed'), notes,
  };
  const readable = REGION_KEYS.some((k) => region[k] !== null) || text_null;
  return readable ? { region, state: 'ok', text_null } : { region: empty, state: 'unreadable', text_null: false };
}

/** A mask_rect qc-judge accepts: an object with finite x, y >= 0 and w, h > 0 (width / height > 0 when present). */
function validRect(v: unknown): v is Record<string, unknown> {
  if (!isObj(v)) return false;
  const n = (k: string) => (typeof v[k] === 'number' && Number.isFinite(v[k]) ? (v[k] as number) : NaN);
  const [x, y, w, h] = [n('x'), n('y'), n('w'), n('h')];
  if (!(x >= 0 && y >= 0 && w > 0 && h > 0)) return false;
  for (const k of ['width', 'height']) if (k in v && !(n(k) > 0)) return false;
  return true;
}

/** The region context of a generation row: an edit_region with a usable mask_rect, else null (every other kind). */
export function regionContextOf(gen: unknown): RegionContext | null {
  if (!isObj(gen) || gen.kind !== 'edit_region' || !validRect(gen.mask_rect)) return null;
  const rm = isObj(gen.region_metrics) ? gen.region_metrics : {};
  const ov = isObj(rm.overflow) ? rm.overflow : {};
  return {
    instruction: typeof gen.edit_instruction === 'string' ? gen.edit_instruction : '',
    rect: gen.mask_rect,
    overflow_measured: ov.detected === true,
    overflow_px: Number(ov.px) || 0,
    composite_mode: typeof rm.mode === 'string' ? rm.mode : null,
  };
}

// words that never tie a colour or subject phrase to the instruction on their own (function words, generic colour words)
const MENTION_STOP = new Set([
  'the', 'and', 'with', 'for', 'from', 'into', 'onto', 'that', 'this', 'its', 'are', 'was', 'has', 'have', 'not', 'but', 'all',
  'any', 'one', 'very', 'more', 'less', 'than', 'then', 'like', 'look', 'looks', 'make', 'change', 'colour', 'color', 'colours',
  'colors', 'coloured', 'colored', 'tone', 'tones', 'shade', 'shades', 'light', 'dark', 'bright', 'pale', 'deep', 'soft', 'area', 'new',
]);
/**
 * True when a word of 3+ letters of `phrase` (a colour name, a subject) appears as a whole word in the instruction,
 * case-insensitive. Function words and generic colour words (the, colour, bright, light ...) never count on their own,
 * so 'bright red' is mentioned by 'change the sunglass color to red' but 'skin colour' is not.
 */
export function mentionedInInstruction(instruction: unknown, phrase: unknown): boolean {
  const ins = String(instruction ?? '').toLowerCase();
  const words = String(phrase ?? '').toLowerCase().match(/[a-z\u00c0-\u024f]{3,}/g) ?? [];
  return words.some((w) => !MENTION_STOP.has(w) && new RegExp('(^|[^a-z\u00c0-\u024f])' + w + '([^a-z\u00c0-\u024f]|$)').test(ins));
}

/** An off-palette colour the instruction asked for: its name is mentioned, or its hex (with or without #) appears. */
function askedColour(instruction: string, o: Record<string, unknown>): boolean {
  if (mentionedInInstruction(instruction, o.name)) return true;
  const hex = String(o.hex ?? '').trim().replace(/^#/, '').toLowerCase();
  return /^[0-9a-f]{3}([0-9a-f]{3})?$/.test(hex) && new RegExp('(^|[^0-9a-f])#?' + hex + '([^0-9a-f]|$)').test(instruction.toLowerCase());
}

// ---- style_match (qc_prompt v2 "style" key, judged against the Style Card only) ---------------------------------------
export function buildStyleMatch(
  v: Verdict, card: Record<string, unknown> | null, expectedSubject: string, opts: { art_attached?: boolean; region?: RegionContext | null } = {},
): StyleMatch {
  const style = isObj(v.style) ? v.style : {};
  const look = lookWords(card);
  const unread = unreadArtLook(card);
  const rules = card && isObj(card.rules) ? card.rules : {};
  const forbid = card ? toStrList(card.forbid) : [];
  const checks: StyleCheck[] = [];
  const nr = 'not reported';
  const push = (id: string, pass: boolean | null, note: string) => checks.push({ id, field: STYLE_FIELDS[id], pass, note: pass === null && !note ? nr : note });

  const region = opts.region ?? null;
  // palette: palette_ok, plus off_palette_colours with a LARGE area in flexible mode
  if (unread.palette) push('palette', null, UNREAD_PALETTE_NOTE);
  else if (region) {
    // v2.3 area edit: colours the instruction asks for are intended; a bare palette_ok false is not judged
    const ok = toBool(style.palette_ok);
    const off = (Array.isArray(style.off_palette_colours) ? style.off_palette_colours : []).filter(isObj);
    const asked = off.filter((o) => askedColour(region.instruction, o));
    const rest = off.filter((o) => !asked.includes(o));
    const large = rest.filter((o) => /large/i.test(String(o.area ?? '')));
    const flexible = rules.palette_mode === 'flexible';
    const askedNames = asked.map((o) => String(o.name ?? '').trim() || String(o.hex ?? '').trim().toUpperCase()).filter(Boolean).join(', ');
    const offNote = rest.length ? 'off-palette: ' + rest.map((o) => [String(o.name ?? '').trim(), String(o.hex ?? '').trim().toUpperCase()].filter(Boolean).join(' ') + (o.area ? ' (' + String(o.area) + ')' : '')).join(', ') : '';
    if (off.length && !rest.length) push('palette', true, 'asked for by the edit: ' + askedNames);
    else if (ok === false && !off.length) push('palette', null, REGION_PALETTE_NOTE);
    else {
      let pass: boolean | null;
      if (ok === undefined) pass = flexible && large.length ? false : (rest.length ? true : null);
      else pass = ok && !(flexible && large.length);
      push('palette', pass, pass === false ? (offNote || 'palette drifts from ' + look.the) : offNote);
    }
  } else {
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
    // v2.3 area edit: a hero the instruction asks for (bear -> tiger) is intended, not a wrong subject
    if (region && pass === false && subjectSeen && mentionedInInstruction(region.instruction, subjectSeen)) push('subject', null, drawn + ' (asked for by the edit)');
    else push('subject', pass, pass === null ? (raw === null || !expectedSubject ? (drawn ? drawn + ' (no subject given)' : 'no subject given') : '') : drawn);
  }
  {
    const hits = toIntList(style.forbid_hits).filter((n) => n <= forbid.length || !forbid.length);
    const named = hits.map((n) => 'forbidden element present: ' + (forbid[n - 1] ?? '#' + n));
    const reported = 'forbid_hits' in style;
    push('forbid', hits.length ? false : (reported ? true : null), named.join('; '));
  }
  // art_style: only when WF-2 attached the Art style reference (the judge saw it); otherwise style.art_match is ignored
  const attached = opts.art_attached === true;
  let art_match: ArtMatch | null = null;
  if (attached) {
    const parsed = parseArtMatch(style.art_match);
    art_match = parsed.match;
    checks.push(artStyleCheck(parsed.match, parsed.state));
  }
  const judged = checks.filter((c) => c.pass !== null);
  const score = judged.length ? Math.round((judged.filter((c) => c.pass === true).length / judged.length) * 100) : null;
  return {
    score, checks, subject_seen: subjectSeen, case_seen: typeof style.case_seen === 'string' ? style.case_seen.trim() : '',
    art_reference_attached: attached, art_match,
  };
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
  const artAttached = ctx.art_reference_attached === true;
  const artRegenOn = ctx.qc_art_regen === undefined || ctx.qc_art_regen === null ? true : toBool(ctx.qc_art_regen) !== false;
  // v2.3: an area edit (null for every other kind - the code below is then v2.2 unchanged)
  const region = asRegionContext(ctx.region);

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
  const style_match = buildStyleMatch(v, card, expectedSubject, { art_attached: artAttached, region });
  const style_violations = toStrList(v.style_violations);
  // v2.3 area edit: a colour remark about what the instruction asked for is no violation
  if (region) for (let i = style_violations.length - 1; i >= 0; i--) if (/palette|colou?r|hex/i.test(style_violations[i]) && mentionedInInstruction(region.instruction, style_violations[i])) style_violations.splice(i, 1);
  const paletteUnread = unreadArtLook(card).palette;
  const paletteOk = paletteUnread ? undefined : toBool(style.palette_ok ?? v.palette_ok);
  const paletteViolation = paletteUnread ? undefined : style_violations.find((s) => /palette|colou?r|hex/i.test(s));
  const paletteCheck = style_match.checks.find((c) => c.id === 'palette');
  let palettePass: boolean;
  if (region && !paletteUnread) {
    // v2.3 area edit: the compat check follows the region-aware palette check (asked-for colours pass; a palette_ok
    // false or a colour remark without a colour list is not judged - the change may bring new colours)
    let pass: boolean | null;
    let note: string;
    if (paletteCheck?.pass === true || paletteCheck?.pass === false) {
      pass = paletteCheck.pass && !paletteViolation;
      note = pass ? paletteCheck.note : (paletteViolation ?? paletteCheck.note);
      if (!pass && !paletteViolation && !style_violations.includes(paletteCheck.note)) style_violations.push(paletteCheck.note);
    } else if (paletteCheck?.note === REGION_PALETTE_NOTE || paletteOk === false || paletteViolation) {
      pass = null;
      note = REGION_PALETTE_NOTE;
    } else {
      pass = true;
      note = palette.length ? 'not reported' : 'no palette on ' + look.name;
    }
    palettePass = pass !== false;
    checks.push({ id: 'style_palette', name: 'Palette matches ' + look.name, pass, note });
  } else {
    palettePass = paletteOk !== false && !paletteViolation && paletteCheck?.pass !== false;
    if (!palettePass && !paletteViolation) style_violations.push(paletteCheck?.note && paletteCheck.pass === false ? paletteCheck.note : 'palette drifts from ' + look.the + (palette.length ? ' (' + palette.map(hexOf).filter(Boolean).join(', ') + ')' : ''));
    checks.push({
      id: 'style_palette', name: 'Palette matches ' + look.name,
      pass: paletteUnread ? null : palettePass,
      note: paletteUnread ? UNREAD_PALETTE_NOTE : palettePass ? (paletteOk === undefined && paletteCheck?.pass === null ? (palette.length ? 'not reported' : 'no palette on ' + look.name) : '') : (paletteViolation ?? style_violations[style_violations.length - 1]),
    });
  }
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

  // -- v2.3 area edit: the judge's region key -> 4 checks (change done / lettering unchanged fail; seam / cut off warn)
  let regionReport: QcRegion | null = null;
  if (region) {
    const parsed = parseRegionVerdict(v.region !== undefined && v.region !== null ? v.region : style.region);
    const r = parsed.region;
    const [done, text, seam, cut] = REGION_CHECKS;
    const nr = REGION_NOT_REPORTED;
    checks.push({ id: done.id, name: done.name, pass: r.instruction_done, note: r.instruction_done === false ? 'the requested change is not visible inside the area' : r.instruction_done === null ? nr : '' });
    checks.push({ id: text.id, name: text.name, pass: r.text_changed === null ? null : !r.text_changed, note: r.text_changed === true ? 'lettering changed by the area edit' : r.text_changed === null ? (parsed.text_null ? REGION_NO_TEXT_NOTE : nr) : '' });
    checks.push({ id: seam.id, name: seam.name, pass: r.seam_visible === null ? null : !r.seam_visible, note: r.seam_visible === true ? 'a visible edge, step or colour jump along the area border' : r.seam_visible === null ? nr : '' });
    const cutPass = region.overflow_measured || r.object_cut_off === true ? false : r.object_cut_off === false ? true : null;
    const cutNote = region.overflow_measured
      ? 'the new element runs past your area (measured ' + region.overflow_px + ' px) - use Extend area'
      : r.object_cut_off === true ? 'the new element looks cut off at the area border' : cutPass === null ? nr : '';
    checks.push({ id: cut.id, name: cut.name, pass: cutPass, note: cutNote });
    regionReport = { ...r, overflow_measured: region.overflow_measured };
  }

  // -- text verdict
  const tm = toBool(v.text_matches) === true;
  const to = toBool(v.text_once) !== false;
  const et = toBool(v.extra_text) === false;
  const text_ok = tm && to && et;

  // -- overall: core checks decide 'fail'; style findings (or a judge pass:false with every check green) are 'warn'
  const judgePass = toBool(v.pass);
  const coreFailed = checks.some((c) => c.pass === false && !WARN_ONLY.has(c.id));
  const subjectCheck = style_match.checks.find((c) => c.id === 'subject');
  // an area edit never regenerates for the subject (WF-3 has no corrective loop; the instruction may change the hero)
  const subjectRegen = !region && subjectRegenOn && !!expectedSubject && subjectCheck?.pass === false;
  // a different art style regenerates once only when the judge saw the reference and the setting is on ('close' never)
  const artRegen = artRegenOn && artAttached && style_match.art_match?.overall === 'different';
  const regionWarn = !!region && checks.some((c) => c.pass === false && WARN_ONLY.has(c.id) && c.id !== 'style_palette');
  const styleWarn = (style_match.score !== null && style_match.score < 100) || judgePass === false || !palettePass || regionWarn;
  const verdictWord: QcReport['verdict'] = coreFailed || subjectRegen || artRegen ? 'fail' : (styleWarn ? 'warn' : 'pass');

  const needs_regen = (coreFailed && failedRegen.length > 0) || subjectRegen || artRegen;
  const correctiveIssues = issues.slice();
  if (subjectRegen) correctiveIssues.push(subjectCorrection(expectedSubject, style_match.subject_seen));
  if (artRegen) correctiveIssues.push(artCorrection(style_match.art_match?.notes ?? '', artDiffers(style_match.art_match)));
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
  if (regionReport) report.region = regionReport;
  return { qc_report: report, needs_regen, text_elements };
}

/** ctx.region -> RegionContext (tolerant: any object; null for everything else). */
function asRegionContext(v: unknown): RegionContext | null {
  if (!isObj(v)) return null;
  return {
    instruction: typeof v.instruction === 'string' ? v.instruction : '',
    rect: isObj(v.rect) ? v.rect : {},
    overflow_measured: v.overflow_measured === true,
    overflow_px: Number(v.overflow_px) || 0,
    composite_mode: typeof v.composite_mode === 'string' ? v.composite_mode : null,
  };
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
