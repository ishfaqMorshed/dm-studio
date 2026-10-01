// DM Studio · shared pure module `style_card_rules`
// Deterministic FIXES / ERRORS / WARNINGS / AGREEMENT for a Style Card (spec 1.5) plus the CIELAB palette snap (1.6).
//
// Pure on purpose: no imports, no Deno or Node APIs, no I/O, no Date. The same file is consumed by
//   - the Edge Function style-card-check (validates the profiler output before it is stored / locked),
//   - prompt-engine render.ts (fixes only, so old drafts render without '..', 'Locked:' or 'as_typed'),
//   - the frontend through the Vite alias @shared/style_card_rules (styleCardIssues + the 'Clean up' button).
// The input card is never mutated: the result carries a fixed deep copy.
//
// Vocabulary (Style Card JSON v2, spec 1.3). v1 cards (14 keys) are accepted; every v2 key is additive.

export const BACKGROUND_LITERAL = "flat mid-grey #808080, isolated artwork";
export const CASE_ENUM = ["UPPER", "lower", "Title", "Mixed"] as const;
export const LINE_WEIGHTS = ["none", "hairline", "fine", "medium", "bold", "heavy"] as const;
export const PALETTE_WEIGHTS = ["dominant", "secondary", "accent", "outline"] as const;
export const ROLES = ["subject", "art_style", "typography"] as const;

/** Single-linkage threshold between two swatches that belong to one colour (CIELAB deltaE76). */
export const CLUSTER_DELTA_E = 12;
/** A palette hex within this distance of a cluster medoid is snapped onto it. */
export const SNAP_DELTA_E = 15;
/** Agreement below this share (mode over the eligible sheets) raises a warning. */
export const AGREEMENT_WARN_BELOW = 0.6;

export type PaletteEntryV2 = {
  name?: string;
  hex?: string;
  weight?: string;
  role?: string;
  images?: number[];
  snapped_from?: string;
  [k: string]: unknown;
};
export type PaletteVariant = { garment: "dark" | "light" | "any"; hexes: string[]; images: number[] };
export type BrandTextItem = { text: string; role: "handle" | "est" | "tagline" | "brand" | string; placement?: string };
export type FieldEvidence = { images?: number[]; contradicts?: number[]; agreement?: number };

/** Loose Style Card shape: every key optional so v1 drafts, v2 cards and hand-edited JSON all type-check. */
export type StyleCardV2 = {
  schema?: number;
  medium?: string;
  realism?: string;
  linework?: { weight?: string; style?: string; outline?: string; [k: string]: unknown };
  shading?: string;
  shading_method?: string;
  texture?: string;
  edge_finish?: string;
  palette?: PaletteEntryV2[];
  palette_variants?: PaletteVariant[];
  composition?: string;
  hero?: { framing?: string; scale?: string; [k: string]: unknown };
  typography?: {
    vibe?: string;
    placement?: string;
    case?: string;
    headline?: { family?: string; weight?: string; effects?: string[]; [k: string]: unknown };
    secondary?: { family?: string; weight?: string; effects?: string[]; [k: string]: unknown };
    [k: string]: unknown;
  };
  background?: string;
  mood?: string[];
  subjects?: string[];
  subject_sources?: Record<string, string>;
  brand_text?: { items?: BrandTextItem[]; always_present?: boolean; [k: string]: unknown };
  forbid?: string[];
  signature_moves?: string[];
  garment_colors?: string[];
  representative_images?: number[];
  field_evidence?: Record<string, FieldEvidence>;
  brief_check?: { must_have_seen?: string[]; must_have_not_seen?: string[]; avoid_seen_in?: string[]; [k: string]: unknown };
  evidence?: string[];
  rules?: { palette_mode?: string; text_case?: string; lock_typography?: boolean; lock_composition?: boolean; [k: string]: unknown };
  reference_ids?: string[];
  source?: string;
  validation?: { errors: string[]; warnings: string[]; fixes: string[]; checked_at?: string };
  [k: string]: unknown;
};

/** clients.style_brief (studio_18 + the v2 additions subjects / brand_text / typography_note). */
export type StyleBrief = {
  niche?: string;
  audience?: string;
  subjects?: string[];
  brand_text?: string[];
  typography_note?: string;
  must_have?: string[];
  avoid?: string[];
  palette_mode?: string;
  text_case?: string;
  lock_typography?: boolean;
  lock_composition?: boolean;
  [k: string]: unknown;
};

/** One per-image sheet from style_sheet v1 (WF-1b Pass A). Every key optional: a partial sheet is still usable. */
export type Sheet = {
  image?: number;
  quality?: string; // clean|draft|mockup|screenshot|low_res
  garment_seen?: string;
  colorway?: string; // dark_garment|light_garment|unknown
  medium?: string;
  realism?: string;
  line_weight?: string;
  line_style?: string;
  outline?: string;
  shading?: string;
  texture?: string;
  edge_finish?: string;
  layout?: string;
  hero?: { subject?: string; framing?: string; scale?: string };
  supporting_elements?: string[];
  swatches?: { hex?: string; role?: string; area?: string }[];
  text?: { text?: string; role?: string; family?: string; weight?: string; case?: string; effects?: string[]; placement?: string }[];
  mood?: string[];
  off_style?: boolean;
  [k: string]: unknown;
};

export type CheckOptions = {
  brief?: StyleBrief | null;
  image_count?: number | null;
  sheets?: Sheet[] | null;
  client_garments?: string[] | null;
};

export type CheckResult = {
  card: StyleCardV2;
  errors: string[];
  warnings: string[];
  fixes: string[];
  agreement: Record<string, number>;
};

// ---------------------------------------------------------------------------
// small helpers

type Dict = Record<string, unknown>;
const isObj = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr) : []);
const numArr = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : []);
const uniq = <T>(xs: T[]): T[] => Array.from(new Set(xs));
const q = (s: string): string => '"' + s + '"';

const HEX_RE = /^#[0-9A-F]{6}$/;
const RULE_WORD_RE = /\b(locked|a guide|strict|flexible|as[_ ]typed)\b/i;
/**
 * A social-media handle named as such. A bare 'handle' is NOT a text demand: 'a mug handle' in a forbid is a physical
 * object. Matches 'social media handle', 'social handle', 'Instagram handle', 'handle text', 'handle (@x)'.
 */
const HANDLE_SRC = "\\b(?:social(?:[\\s-]+media)?|instagram|insta|ig|tiktok|twitter|facebook|brand|user(?:name)?|account|creator|shop|store)[\\s-]+handles?\\b|\\bhandles?[\\s-]+(?:text|line|name|tag)\\b|\\bhandles?\\s*\\(?\\s*@";
/** A demand that TEXT be present: brand text belongs in brand_text, never in a visual rule (forbid or signature move). */
const TEXT_DEMAND_RE = new RegExp("@\\w+|" + HANDLE_SRC + "|hashtag|tagline|slogan|\\bEST\\.?\\s*\\d", "i");
/**
 * In a PRESENCE context (composition, typography.placement, signature_moves) a watermark or a signature line is a text
 * demand too. In a forbid they are legitimate visual bans (the studio's own print rules forbid watermarks), so the
 * forbid list is judged with TEXT_DEMAND_RE only.
 */
const PRESENCE_TEXT_RE = new RegExp(TEXT_DEMAND_RE.source + "|watermark|\\bsignature (?:text|line)\\b", "i");
/** 'No gradients' / 'Never use gradients' / 'Avoid neon' in a forbid name the thing itself: the negator is stripped (a fix). */
const FORBID_NEGATOR_RE = /^(?:no|never|avoid|don'?t|do not)\s+(?:(?:use|using|any|the|of)\s+)*/i;
/** 'Omitting the outline' in a forbid reads as a presence demand (X must be present); a forbid names what must never appear. */
const PRESENCE_DEMAND_RE = /^(?:omitting|missing|without|lack(?:ing)?(?:\s+of)?)\b/i;
const RULE_PREFIX_RE = /^(locked|guide)\s*(composition|typography)?\s*[:\-]\s*/i;
/**
 * Paths whose strings are data, not prose: never touched by the string fixes. brand_text.items[].text is verbatim
 * brand text ('Farm Life Co.', 'EST. 2019.') that a brief may later copy into its text lines, so it keeps its punctuation.
 */
const SKIP_FIX_PATH = /^(rules|reference_ids|source|validation|field_evidence|subject_sources)(\.|\[|$)|\.hex$|\.snapped_from$|^palette_variants\[\d+\]\.hexes\[|^brand_text\.items\[\d+\]\.text$/;
const STOPWORDS = new Set([
  "the", "and", "with", "for", "from", "that", "this", "into", "onto", "over", "under", "above", "below", "very", "every",
  "each", "some", "only", "also", "than", "then", "when", "where", "which", "while", "their", "there", "these", "those",
  "them", "they", "its", "his", "her", "our", "your", "not", "but", "are", "was", "were", "has", "have", "had", "all",
  "any", "one", "two", "three", "small", "large", "left", "right", "top", "bottom", "center", "centre", "side", "style",
]);

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Rebuilds `node` with every string leaf passed through `visit(path, value)`. */
function walkStrings(node: unknown, path: string, visit: (path: string, s: string) => string): unknown {
  if (isStr(node)) return visit(path, node);
  if (Array.isArray(node)) return node.map((v, i) => walkStrings(v, path + "[" + i + "]", visit));
  if (isObj(node)) {
    const out: Dict = {};
    for (const k of Object.keys(node)) out[k] = walkStrings(node[k], path ? path + "." + k : k, visit);
    return out;
  }
  return node;
}

export function normWords(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Crude English singular. Good enough for subject nouns (cows, calves, badges, accessories, sunglasses). */
export function singular(w: string): string {
  const x = w.toLowerCase();
  if (x.length <= 3) return x;
  if (x.endsWith("ies")) return x.slice(0, -3) + "y";
  if (x.endsWith("ves")) return x.slice(0, -3) + "f";
  if (/(ss|us|is)$/.test(x)) return x;
  if (/(s|x|z|ch|sh)es$/.test(x)) return x.slice(0, -2);
  if (x.endsWith("s")) return x.slice(0, -1);
  return x;
}
export function plural(w: string): string {
  const x = w.toLowerCase();
  if (/[^aeiou]y$/.test(x)) return x.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/.test(x)) return x + "es";
  if (x.endsWith("f")) return x.slice(0, -1) + "ves";
  return x + "s";
}
function normPhrase(s: string): string {
  return normWords(s).split(" ").filter(Boolean).map(singular).join(" ");
}

/** Whole-word, singular/plural-insensitive containment either way: 'Highland cows' includes 'highland cow'. */
export function looselyIncludes(list: string[], needle: string): boolean {
  const b = normPhrase(needle);
  if (!b) return false;
  return list.some((e) => {
    const a = normPhrase(e);
    if (!a) return false;
    return a === b || (" " + a + " ").includes(" " + b + " ") || (" " + b + " ").includes(" " + a + " ");
  });
}

/** IMAGE numbers cited by an evidence-style note: 'IMAGE 1, 4: ...' -> [1, 4]; 'IMAGE 2 and 3' -> [2, 3]. */
export function imageNumbers(note: string): number[] {
  const out: number[] = [];
  const re = /\bIMAGES?\s+((?:\d+\s*(?:,|and|&|-|to)?\s*)+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(note))) {
    const parts = m[1].match(/\d+/g) ?? [];
    for (const p of parts) out.push(parseInt(p, 10));
  }
  return uniq(out);
}

// ---------------------------------------------------------------------------
// colour: sRGB -> CIELAB (D65) and deltaE76

export type Lab = [number, number, number];

export function hexToLab(hex: string): Lab | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = lin((n >> 16) & 255), g = lin((n >> 8) & 255), b = lin(n & 255);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.0;
  const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : t * (841 / 108) + 4 / 29);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE76(a: Lab, b: Lab): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

type Swatch = { hex: string; lab: Lab; image: number; colorway: string; area: string };
export type Cluster = { hex: string; images: number[]; colorways: string[]; members: string[] };

function collectSwatches(sheets: Sheet[]): Swatch[] {
  const out: Swatch[] = [];
  sheets.forEach((sh, i) => {
    if (!isObj(sh) || sh.off_style === true) return;
    const image = typeof sh.image === "number" ? sh.image : i + 1;
    const colorway = isStr(sh.colorway) ? sh.colorway : "unknown";
    for (const sw of Array.isArray(sh.swatches) ? sh.swatches : []) {
      if (!isObj(sw) || !isStr(sw.hex)) continue;
      const hex = sw.hex.trim().toUpperCase();
      const lab = hexToLab(hex);
      if (!lab) continue;
      out.push({ hex: hex.startsWith("#") ? hex : "#" + hex, lab, image, colorway, area: isStr(sw.area) ? sw.area : "" });
    }
  });
  return out;
}

/** Single-linkage clusters (deltaE76 < CLUSTER_DELTA_E) of every swatch hex on the sheets; one medoid per cluster. */
export function clusterSwatches(sheets: Sheet[]): Cluster[] {
  const sw = collectSwatches(sheets);
  const parent = sw.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < sw.length; i++) {
    for (let j = i + 1; j < sw.length; j++) {
      if (deltaE76(sw[i].lab, sw[j].lab) < CLUSTER_DELTA_E) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Swatch[]>();
  sw.forEach((s, i) => {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(s);
    groups.set(r, g);
  });
  const clusters: Cluster[] = [];
  for (const members of groups.values()) {
    let best = members[0], bestSum = Infinity;
    for (const m of members) {
      const sum = members.reduce((acc, o) => acc + deltaE76(m.lab, o.lab), 0);
      if (sum < bestSum - 1e-9 || (Math.abs(sum - bestSum) <= 1e-9 && m.hex < best.hex)) {
        best = m;
        bestSum = sum;
      }
    }
    clusters.push({
      hex: best.hex,
      images: uniq(members.map((m) => m.image)).sort((a, b) => a - b),
      colorways: uniq(members.map((m) => m.colorway)),
      members: uniq(members.map((m) => m.hex)).sort(),
    });
  }
  return clusters.sort((a, b) => b.images.length - a.images.length || a.hex.localeCompare(b.hex));
}

function nearestCluster(hex: string, clusters: Cluster[]): { cluster: Cluster; dist: number } | null {
  const lab = hexToLab(hex);
  if (!lab) return null;
  let best: { cluster: Cluster; dist: number } | null = null;
  for (const c of clusters) {
    const l = hexToLab(c.hex);
    if (!l) continue;
    const d = deltaE76(lab, l);
    if (!best || d < best.dist) best = { cluster: c, dist: d };
  }
  return best;
}

/** How many sheets have a 'dominant' area swatch within SNAP_DELTA_E of `hex`. */
function dominantVotes(hex: string | undefined, sheets: Sheet[]): number {
  const lab = hex ? hexToLab(hex) : null;
  if (!lab) return 0;
  let votes = 0;
  for (const s of collectSwatches(sheets)) {
    if (s.area === "dominant" && deltaE76(lab, s.lab) <= SNAP_DELTA_E) votes++;
  }
  return votes;
}

// ---------------------------------------------------------------------------
// subject nouns for the composition fix

/**
 * Case-insensitive patterns (longest first) for the subject nouns a composition must not name.
 * A multi-word subject ('Highland cows', 'Pine trees') is matched as the whole phrase in singular and plural;
 * only a one-word subject ('Pitbulls', 'chickens') is matched as a bare noun (singular >= 4 chars). Bare head nouns
 * of multi-word subjects are NOT replaced on purpose: on the E2E card 'badge' and 'circle' are both subjects
 * ('Vintage outdoor badges', 'Sun or moon circles') and layout vocabulary, and replacing them wrecked the composition.
 */
function subjectPatterns(subjects: string[]): string[] {
  const out = new Set<string>();
  for (const subj of subjects) {
    const base = subj.replace(/\([^)]*\)/g, " ");
    const phrases = base.split(/\s*(?:,|;|\/|\band\b|\bwith\b|\bor\b|&)\s*/i).map((p) => normWords(p)).filter(Boolean);
    for (const p of phrases) {
      const words = p.split(" ").filter(Boolean);
      if (!words.length) continue;
      const head = words[words.length - 1];
      const headSing = singular(head);
      const stem = words.slice(0, -1).join(" ");
      if (words.length === 1 && (headSing.length < 4 || STOPWORDS.has(headSing))) continue;
      for (const h of uniq([head, headSing, plural(headSing)])) out.add((stem ? stem + " " : "") + h);
    }
  }
  return Array.from(out).filter((p) => p.replace(/ /g, "").length >= 4).sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Words earlier in the sentence that mark the noun phrase as the hero of the layout. */
const HERO_BEFORE_RE = /\b(?:hero|central|centre|centred|center|centered|middle|main|single|primary|focal|protagonist|character|portrait|mascot|subject|figure|prominent(?:ly)?|dominant)\b/i;
/** Nouns a parenthetical apposition may follow to name the hero: 'hero illustration (highland cow)'. */
const HERO_NOUN_RE = /\b(?:hero|illustration|portrait|character|figure|subject|animal|mascot|protagonist|creature)\b/i;
/** Words within the four words before the noun phrase that mark it as a SUPPORTING element, never the hero. */
const SUPPORT_BEFORE_RE = /\b(?:clusters?|groups?|rows?|pairs?|trio|sets?|series|scatter(?:ed|ing)?|sprinkled|dotted|small|tiny|little|minor|subtle|supporting|secondary|background|backdrop|surround(?:ed|ing)?|framed|flanked|flanking|among|amid|amidst|with|and|or|plus|accents?|elements?|details?|motifs?|decorations?|ornaments?|border(?:ed|s)?|wreath|garland|foliage|scenery)\b/i;
/**
 * What directly follows a hero noun phrase: a hero noun ('pitbull portrait') or a SINGULAR hero verb ('sits', 'anchors').
 * Plural verbs are deliberately absent: 'Highland cows stand in a row' would become 'The hero stand ...', so a plural
 * group is left as written (and reported) instead.
 */
const HERO_AFTER_RE = /^\s*(?:(?:portrait|illustration|figure|character|head|bust|silhouettes?|mascot|hero)\b|(?:sits|stands|anchors|dominates|fills|occupies|rests|poses|faces|stares|looks|acting as|as the hero|is (?:centered|centred|placed|positioned|anchored|framed)|takes (?:center|centre))\b)/i;
const FUNCTION_WORDS = new Set([
  "of", "with", "by", "in", "on", "at", "to", "from", "as", "is", "are", "and", "or", "but", "for", "into", "onto", "over", "under",
  "above", "below", "behind", "around", "between", "near", "that", "which", "while", "when", "then", "than", "a", "an", "the", "one",
]);

type HeroRewrite = { text: string; replaced: { from: string; to: string }[]; kept: { phrase: string; supporting: boolean }[] };

function sentenceStart(before: string): number {
  let i = 0;
  for (const sep of [". ", "; ", ": ", "! ", "? "]) {
    const k = before.lastIndexOf(sep);
    if (k >= 0 && k + 2 > i) i = k + 2;
  }
  return i;
}
function lastWords(str: string, n: number): string {
  return str.trim().split(/\s+/).filter(Boolean).slice(-n).join(" ");
}
/** Start of the noun phrase to replace: the article plus up to three adjective-like words before the noun ('A large, solid-colored circle'). */
function heroSpanStart(before: string): number {
  let rest = before;
  for (let n = 0; n < 3; n++) {
    const m = rest.match(/([A-Za-z][\w-]*),?\s+$/);
    if (!m || FUNCTION_WORDS.has(m[1].toLowerCase()) || SUPPORT_BEFORE_RE.test(m[1]) || HERO_AFTER_RE.test(m[1])) break;
    rest = rest.slice(0, rest.length - m[0].length);
  }
  const art = rest.match(/(?:^|\s)(?:a|an|the|one)\s+$/i);
  if (art) rest = rest.slice(0, rest.length - art[0].length + (art[0].startsWith(" ") ? 1 : 0));
  return rest.length;
}

/**
 * Rewrites the subject nouns of `composition` to 'the hero' where the sentence marks them as the hero; every other
 * mention is kept and reported. Hero evidence: a parenthetical apposition after a hero noun ('hero illustration
 * (highland cow)'), a hero word earlier in the sentence ('A central ...'), a hero noun or verb right after ('... sits'),
 * or a direct definite article ('above the pitbull'). Never a hero: a phrase within four words after a supporting
 * marker ('A cluster of stylized pine trees', 'framed by ...'), or a second subject in a sentence that already has
 * 'the hero'. One sentence has one hero.
 */
function rewriteHeroMentions(composition: string, subjects: string[]): HeroRewrite {
  let text = composition;
  const replaced: { from: string; to: string }[] = [];
  const kept = new Map<string, { phrase: string; supporting: boolean }>();
  const keep = (phrase: string, supporting: boolean): void => {
    const k = phrase.toLowerCase();
    const prev = kept.get(k);
    kept.set(k, { phrase: prev?.phrase ?? phrase, supporting: (prev?.supporting ?? false) || supporting });
  };
  // one combined pattern, longest phrase first, scanned left to right: the first hero-evidenced mention of a sentence
  // is the hero, every later subject in that sentence is a supporting element
  const bodies = subjectPatterns(subjects).filter((p) => !/^(?:the )?hero(?:es)?$/.test(p)).map((p) => p.split(" ").map(escapeRe).join("[\\s-]+"));
  if (bodies.length) {
    const re = new RegExp("(?<![\\w-])(" + bodies.join("|") + ")(?![\\w-])", "gi");
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(text)) && guard++ < 100) {
      const start = m.index, end = start + m[0].length;
      const before = text.slice(0, start), after = text.slice(end);
      const open = before.match(/\(\s*$/), close = after.match(/^\s*\)/);
      if (open && close) {
        const outer = before.slice(0, before.length - open[0].length);
        const ctx = lastWords(outer.slice(sentenceStart(outer)), 4);
        if (!SUPPORT_BEFORE_RE.test(ctx) && HERO_NOUN_RE.test(ctx)) {
          const from = text.slice(outer.length, end + close[0].length);
          text = outer + "(the hero)" + after.slice(close[0].length);
          replaced.push({ from, to: "(the hero)" });
          re.lastIndex = outer.length + "(the hero)".length;
        } else keep(m[0], SUPPORT_BEFORE_RE.test(ctx));
        continue;
      }
      const pre = before.slice(sentenceStart(before));
      if (SUPPORT_BEFORE_RE.test(lastWords(pre, 4))) { keep(m[0], true); continue; }
      if (/\bthe hero\b/i.test(pre)) { keep(m[0], true); continue; }
      const heroEvidence = HERO_BEFORE_RE.test(pre) || HERO_AFTER_RE.test(after) || /\bthe\s+$/i.test(before);
      if (!heroEvidence) { keep(m[0], false); continue; }
      const spanStart = heroSpanStart(before);
      const capital = spanStart === 0 || /[.!?]\s+$/.test(text.slice(0, spanStart));
      const to = capital ? "The hero" : "the hero";
      replaced.push({ from: text.slice(spanStart, end), to });
      text = text.slice(0, spanStart) + to + after;
      re.lastIndex = spanStart + to.length;
    }
  }
  text = text.replace(/\b(?:the hero)(?:\s+the hero)+\b/gi, "the hero").replace(/\bthe the hero\b/gi, "the hero");
  return { text, replaced, kept: Array.from(kept.values()) };
}

// ---------------------------------------------------------------------------
// the check

export function checkStyleCard(input: unknown, opts: CheckOptions = {}): CheckResult {
  const fixes: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const agreement: Record<string, number> = {};

  if (!isObj(input)) {
    return { card: {}, errors: ["card must be a JSON object"], warnings, fixes, agreement };
  }
  let card = deepClone(input) as StyleCardV2;
  const brief: StyleBrief = isObj(opts.brief) ? (opts.brief as StyleBrief) : {};
  const sheets: Sheet[] = Array.isArray(opts.sheets) ? opts.sheets.filter(isObj) as Sheet[] : [];
  const hasSheets = sheets.length > 0;
  const imageCount = typeof opts.image_count === "number" && opts.image_count > 0 ? Math.floor(opts.image_count) : null;

  // ---- FIX 1 + 2: trailing punctuation and rule prefixes on every prose string --------------------------------
  card = walkStrings(card, "", (path, s) => {
    if (SKIP_FIX_PATH.test(path)) return s;
    let v = s;
    const t = v.match(/[.;,\s]+$/);
    if (t) {
      const chars = t[0].replace(/\s/g, "");
      v = v.slice(0, v.length - t[0].length);
      if (chars) fixes.push(path + ": stripped trailing " + q(chars));
    }
    const r = v.match(RULE_PREFIX_RE);
    if (r) {
      v = v.slice(r[0].length);
      fixes.push(path + ": stripped rule prefix " + q(r[0].trim()));
    }
    return v;
  }) as StyleCardV2;

  // ---- FIX 3: typography.case ----------------------------------------------------------------------------------
  if (isObj(card.typography) && card.typography.case !== undefined) {
    const orig = isStr(card.typography.case) ? card.typography.case : String(card.typography.case ?? "");
    const mapped = normaliseCase(orig);
    if (mapped !== orig) {
      card.typography.case = mapped;
      fixes.push("typography.case: " + q(orig) + " -> " + q(mapped));
      if (mapped === "" && orig.trim() !== "") {
        warnings.push("typography.case " + q(orig) + " is not a letter case; the text block defines case");
      }
    }
  }

  // ---- FIX 4 + 5: hex uppercase, enum values lowercase ---------------------------------------------------------
  const palette: PaletteEntryV2[] = Array.isArray(card.palette) ? card.palette.filter(isObj) as PaletteEntryV2[] : [];
  card.palette = palette;
  palette.forEach((e, i) => {
    if (isStr(e.hex)) {
      const h = e.hex.trim();
      const up = (h.startsWith("#") ? h : "#" + h).toUpperCase();
      if (up !== e.hex) {
        fixes.push("palette[" + i + "].hex: " + q(e.hex) + " -> " + q(up));
        e.hex = up;
      }
    }
    for (const k of ["weight", "role"] as const) {
      if (isStr(e[k]) && e[k] !== (e[k] as string).toLowerCase().trim()) {
        fixes.push("palette[" + i + "]." + k + ": " + q(e[k] as string) + " -> " + q((e[k] as string).toLowerCase().trim()));
        e[k] = (e[k] as string).toLowerCase().trim();
      }
    }
  });
  if (Array.isArray(card.palette_variants)) {
    card.palette_variants.forEach((pv, i) => {
      if (isObj(pv) && Array.isArray(pv.hexes)) {
        pv.hexes = pv.hexes.map((h, j) => {
          if (!isStr(h)) return h;
          const up = (h.trim().startsWith("#") ? h.trim() : "#" + h.trim()).toUpperCase();
          if (up !== h) fixes.push("palette_variants[" + i + "].hexes[" + j + "]: " + q(h) + " -> " + q(up));
          return up;
        });
      }
    });
  }
  const lowerEnum = (path: string, get: () => unknown, set: (v: string) => void): void => {
    const v = get();
    if (isStr(v) && v !== v.toLowerCase().trim()) {
      fixes.push(path + ": " + q(v) + " -> " + q(v.toLowerCase().trim()));
      set(v.toLowerCase().trim());
    }
  };
  if (isObj(card.linework)) {
    const lw = card.linework;
    // a sentence-valued weight ('Fine, precise, ...') is left to FIX 7; only a vocabulary word is lower-cased here
    if (isStr(lw.weight) && (LINE_WEIGHTS as readonly string[]).includes(lw.weight.toLowerCase().trim())) {
      lowerEnum("linework.weight", () => lw.weight, (v) => { lw.weight = v; });
    }
    lowerEnum("linework.outline", () => lw.outline, (v) => { lw.outline = v; });
  }
  lowerEnum("realism", () => card.realism, (v) => { card.realism = v; });
  lowerEnum("shading_method", () => card.shading_method, (v) => { card.shading_method = v; });
  lowerEnum("edge_finish", () => card.edge_finish, (v) => { card.edge_finish = v; });
  if (isObj(card.typography)) {
    for (const slot of ["headline", "secondary"] as const) {
      const t = card.typography[slot];
      if (isObj(t)) {
        lowerEnum("typography." + slot + ".weight", () => t.weight, (v) => { t.weight = v; });
        lowerEnum("typography." + slot + ".family", () => t.family, (v) => { t.family = v; });
      }
    }
  }

  // ---- FIX 6: exactly one dominant, listed first (area votes from the sheets when present) ---------------------
  if (palette.length) {
    const dominants = palette.map((e, i) => (e.weight === "dominant" ? i : -1)).filter((i) => i >= 0);
    if (dominants.length !== 1) {
      const votes = palette.map((e) => (hasSheets ? dominantVotes(e.hex, sheets) : 0));
      const candidates = dominants.length > 1 ? dominants : palette.map((_, i) => i);
      let keep = candidates[0];
      for (const i of candidates) if (votes[i] > votes[keep]) keep = i;
      palette.forEach((e, i) => {
        if (i === keep && e.weight !== "dominant") {
          fixes.push("palette[" + i + "] " + q(e.name ?? e.hex ?? String(i)) + ": " + q(String(e.weight ?? "")) + " -> \"dominant\"" +
            (hasSheets ? " (" + votes[i] + " dominant-area votes from the sheets)" : " (no dominant given; first entry promoted)"));
          e.weight = "dominant";
        } else if (i !== keep && e.weight === "dominant") {
          fixes.push("palette[" + i + "] " + q(e.name ?? e.hex ?? String(i)) + ": \"dominant\" -> \"secondary\" (one dominant only)");
          e.weight = "secondary";
        }
      });
    }
    const d = palette.findIndex((e) => e.weight === "dominant");
    if (d > 0) {
      const [dom] = palette.splice(d, 1);
      palette.unshift(dom);
      fixes.push("palette: dominant " + q(dom.name ?? dom.hex ?? "") + " moved first");
    }
  }

  // ---- FIX 7: linework.weight is a vocabulary word; the prose moves to linework.style --------------------------
  if (isObj(card.linework) && isStr(card.linework.weight)) {
    const lw = card.linework;
    const w = (lw.weight as string).trim();
    if (w && !(LINE_WEIGHTS as readonly string[]).includes(w)) {
      const WEIGHT_WORDS: Record<string, string> = {
        hairline: "hairline", fine: "fine", thin: "fine", medium: "medium", bold: "bold", heavy: "heavy", thick: "heavy", none: "none",
      };
      const words = w.split(/[^a-z]+/i).filter(Boolean);
      const hit = words.find((x) => WEIGHT_WORDS[x.toLowerCase()] !== undefined);
      if (hit) {
        const mapped = WEIGHT_WORDS[hit.toLowerCase()];
        const remainder = w.replace(new RegExp("\\b" + escapeRe(hit) + "\\b", "i"), "")
          .replace(/\s{2,}/g, " ").replace(/^[\s,;:\-]+|[\s,;:\-]+$/g, "");
        const style = isStr(lw.style) ? lw.style.trim() : "";
        if (remainder) lw.style = [style, remainder].filter(Boolean).join("; ");
        fixes.push("linework.weight: " + q(w) + " -> " + q(mapped) + (remainder ? "; remainder appended to linework.style" : ""));
        lw.weight = mapped;
      } else {
        warnings.push("linework.weight " + q(w) + " is not in the vocabulary (" + LINE_WEIGHTS.join("|") + ")");
      }
    }
  }

  // ---- FIX 8: text demands are not visual rules; extract handles / EST lines into brand_text ------------------
  // Only a TEXT demand is removed (brand text lives in brand_text). A negated forbid ('No gradients') is rewritten to
  // the thing itself; a forbid that reads as a presence demand ('Omitting the outline') is kept with a warning; a
  // signature move stating an absence ('Lack of outline on the hero') is a legitimate visual trait and is kept as is.
  const extracted: { text: string; role: string; placement: string }[] = [];
  for (const key of ["forbid", "signature_moves"] as const) {
    const list = Array.isArray(card[key]) ? (card[key] as unknown[]) : [];
    const demandRe = key === "forbid" ? TEXT_DEMAND_RE : PRESENCE_TEXT_RE;
    let changed = false;
    const kept: unknown[] = [];
    list.forEach((item, i) => {
      if (!isStr(item)) { kept.push(item); return; }
      if (demandRe.test(item)) {
        changed = true;
        fixes.push(key + "[" + i + "] removed: " + q(item) + " (names text that must be present, not a visual rule)");
        for (const h of item.match(/@\w+/g) ?? []) extracted.push({ text: h, role: "handle", placement: placementIn(item) });
        for (const e of item.match(/\bEST\.?\s*\d{2,4}\b/gi) ?? []) extracted.push({ text: e, role: "est", placement: placementIn(item) });
        return;
      }
      if (key === "forbid") {
        const neg = item.match(FORBID_NEGATOR_RE);
        const rest = neg ? item.slice(neg[0].length).trim() : "";
        if (neg && neg[0].trim() && rest) {
          changed = true;
          fixes.push("forbid[" + i + "]: " + q(item) + " -> " + q(rest) + " (a forbid names the thing itself)");
          kept.push(rest);
          return;
        }
        if (PRESENCE_DEMAND_RE.test(item)) {
          warnings.push("forbid[" + i + "] " + q(item) + " reads as a presence demand (omitting / missing / without / lack); a forbid names a visual thing that must never appear");
        }
      }
      kept.push(item);
    });
    if (changed) card[key] = kept as string[];
  }
  if (extracted.length) {
    const bt = isObj(card.brand_text) ? card.brand_text : (card.brand_text = { items: [], always_present: false });
    const items: BrandTextItem[] = Array.isArray(bt.items) ? bt.items.filter(isObj) as BrandTextItem[] : (bt.items = []);
    for (const ex of extracted) {
      if (items.some((it) => isStr(it.text) && it.text.toLowerCase() === ex.text.toLowerCase())) continue;
      items.push({ text: ex.text, role: ex.role, placement: ex.placement });
      fixes.push("brand_text.items: added " + q(ex.text) + " (" + ex.role + ")");
    }
    bt.items = items;
  }

  // ---- FIX 9: composition names no subject ---------------------------------------------------------------------
  // A subject noun is rewritten to 'the hero' only where the composition marks it as the hero (see rewriteHeroMentions):
  // 'hero illustration (highland cow)', 'A highland cow sits in the middle', 'text arched above the pitbull'. A subject
  // that appears as a SUPPORTING element ('A cluster of stylized pine trees sits on the lower left') or with no hero
  // evidence ('Concentric circular badge format') is left as written and warned about: replacing it produced
  // 'A cluster of stylized the hero' on the locked E2E v4 card, and prompt-engine lints every card at render time.
  if (isStr(card.composition) && Array.isArray(card.subjects)) {
    const { text, replaced, kept } = rewriteHeroMentions(card.composition, strArr(card.subjects));
    for (const r of replaced) fixes.push("composition: " + q(r.from) + " -> " + q(r.to));
    for (const k of kept) {
      warnings.push("composition names the subject " + q(k.phrase) + (k.supporting ? " as a supporting element" : "") +
        " - write \"the hero\" for the hero, otherwise describe the layout without subject nouns");
    }
    card.composition = text;
  }

  // ---- FIX 10: brief must_have copied verbatim without support -> brief_check.must_have_not_seen ---------------
  const mustHave = strArr(brief.must_have);
  if (mustHave.length && Array.isArray(card.signature_moves)) {
    const moves = strArr(card.signature_moves);
    const kept: string[] = [];
    moves.forEach((mv, i) => {
      const isMustHave = mustHave.some((m) => normWords(m) === normWords(mv));
      if (isMustHave && !moveSupported(card, i, mv)) {
        const bc = isObj(card.brief_check) ? card.brief_check : (card.brief_check = { must_have_seen: [], must_have_not_seen: [], avoid_seen_in: [] });
        const ns = strArr(bc.must_have_not_seen);
        if (!looselyIncludes(ns, mv)) ns.push(mv);
        bc.must_have_not_seen = ns;
        fixes.push("signature_moves[" + i + "] " + q(mv) + " moved to brief_check.must_have_not_seen (no supporting image)");
      } else kept.push(mv);
    });
    if (kept.length !== moves.length) card.signature_moves = kept;
  }

  // ---- FIX 11: palette snap (needs sheets) ----------------------------------------------------------------------
  let clusters: Cluster[] = [];
  if (hasSheets) {
    clusters = clusterSwatches(sheets);
    const matched = new Map<number, Cluster>();
    palette.forEach((e, i) => {
      if (!isStr(e.hex) || !HEX_RE.test(e.hex)) return;
      const near = nearestCluster(e.hex, clusters);
      if (!near || near.dist > SNAP_DELTA_E) return;
      matched.set(i, near.cluster);
      if (near.cluster.hex !== e.hex) {
        e.snapped_from = e.hex;
        fixes.push("palette[" + i + "].hex: " + q(e.hex) + " snapped to " + q(near.cluster.hex) + " (seen in images " + near.cluster.images.join(", ") + ")");
        e.hex = near.cluster.hex;
      }
      e.images = near.cluster.images.slice();
    });
    const variantsMissing = !Array.isArray(card.palette_variants) || card.palette_variants.filter(isObj).length === 0;
    if (variantsMissing) {
      const side = (cw: string): "dark" | "light" | null => (cw === "dark_garment" ? "dark" : cw === "light_garment" ? "light" : null);
      const sheetsBy = { dark: [] as number[], light: [] as number[] };
      sheets.forEach((sh, i) => {
        if (sh.off_style === true) return;
        const s = side(isStr(sh.colorway) ? sh.colorway : "");
        if (s) sheetsBy[s].push(typeof sh.image === "number" ? sh.image : i + 1);
      });
      if (sheetsBy.dark.length >= 2 && sheetsBy.light.length >= 2) {
        const on = (s: "dark" | "light"): Cluster[] => uniq(Array.from(matched.values())).filter((c) => c.images.some((n) => sheetsBy[s].includes(n)));
        const dark = on("dark"), light = on("light");
        const diff = dark.filter((c) => !light.includes(c)).length + light.filter((c) => !dark.includes(c)).length;
        if (diff > 1 && dark.length && light.length) {
          card.palette_variants = [
            { garment: "dark", hexes: dark.map((c) => c.hex), images: sheetsBy.dark.slice().sort((a, b) => a - b) },
            { garment: "light", hexes: light.map((c) => c.hex), images: sheetsBy.light.slice().sort((a, b) => a - b) },
          ];
          fixes.push("palette_variants: built 2 colourways from the sheets (dark: " + dark.length + " colours, light: " + light.length + " colours)");
        }
      }
    }
  }

  // ---- FIX 12: one hex, one entry ------------------------------------------------------------------------------
  // Two entries on the same hex - two profiler colours the sheets show as ONE cluster (cream and white both snapped to
  // #F5F2EB), or a literal duplicate - are merged into the first (the dominant is already first). Otherwise the prompt
  // would list two names for one hex and the strict palette's 'every hex exactly once' contract breaks.
  {
    const firstByHex = new Map<string, PaletteEntryV2>();
    const merged: PaletteEntryV2[] = [];
    palette.forEach((e, i) => {
      const hex = isStr(e.hex) ? e.hex : "";
      const into = hex ? firstByHex.get(hex) : undefined;
      if (!into) {
        if (hex) firstByHex.set(hex, e);
        merged.push(e);
        return;
      }
      const images = uniq([...numArr(into.images), ...numArr(e.images)]).sort((a, b) => a - b);
      if (images.length) into.images = images;
      const why = e.snapped_from || into.snapped_from ? "both snap to the same sheet colour" : "same hex";
      fixes.push("palette[" + i + "] " + q(String(e.name ?? "")) + " " + hex + " merged into " + q(String(into.name ?? "")) + " " + hex + " (" + why + ")");
    });
    if (merged.length !== palette.length) palette.splice(0, palette.length, ...merged);
  }

  // ---- AGREEMENT (sheets present) --------------------------------------------------------------------------------
  if (hasSheets) {
    const eligible = sheets.filter((s) => s.off_style !== true && (s.quality === "clean" || s.quality === "draft" || s.quality === undefined));
    const imageOf = (s: Sheet): number => (typeof s.image === "number" ? s.image : sheets.indexOf(s) + 1);
    type SheetText = NonNullable<Sheet["text"]>[number];
    const headline = (s: Sheet): SheetText | undefined => {
      const t: SheetText[] = Array.isArray(s.text) ? s.text.filter(isObj) : [];
      return t.find((x) => x.role === "headline") ?? t[0];
    };
    const fields: [string, (s: Sheet) => unknown][] = [
      ["linework.weight", (s) => s.line_weight],
      ["shading_method", (s) => s.shading],
      ["edge_finish", (s) => s.edge_finish],
      ["composition", (s) => s.layout],
      ["hero.framing", (s) => (isObj(s.hero) ? s.hero.framing : undefined)],
      ["typography.headline.family", (s) => headline(s)?.family],
      ["typography.case", (s) => headline(s)?.case],
    ];
    if (eligible.length) {
      const fe: Record<string, FieldEvidence> = isObj(card.field_evidence) ? card.field_evidence as Record<string, FieldEvidence> : {};
      for (const [path, get] of fields) {
        const votes: { image: number; value: string }[] = [];
        for (const s of eligible) {
          const v = get(s);
          if (isStr(v) && v.trim()) votes.push({ image: imageOf(s), value: v.trim().toLowerCase() });
        }
        if (!votes.length) continue;
        const counts = new Map<string, number>();
        for (const v of votes) counts.set(v.value, (counts.get(v.value) ?? 0) + 1);
        let mode = "", modeN = 0;
        for (const [val, n] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
          if (n > modeN) { mode = val; modeN = n; }
        }
        const share = Math.round((modeN / votes.length) * 100) / 100;
        agreement[path] = share;
        const entry: FieldEvidence = isObj(fe[path]) ? fe[path] : {};
        if (!Array.isArray(entry.images)) entry.images = votes.filter((v) => v.value === mode).map((v) => v.image);
        if (!Array.isArray(entry.contradicts)) entry.contradicts = votes.filter((v) => v.value !== mode).map((v) => v.image);
        entry.agreement = share;
        fe[path] = entry;
        if (share < AGREEMENT_WARN_BELOW) {
          warnings.push("low agreement for " + path + ": " + share.toFixed(2) + " (mode " + q(mode) + " in " + modeN + " of " + votes.length + " sheets)");
        }
      }
      card.field_evidence = fe;
    }
  }

  // ---- ERRORS (block store and lock) ----------------------------------------------------------------------------
  if (palette.length < 3 || palette.length > 8) errors.push("palette has " + palette.length + " entries (3 to 8 required)");
  palette.forEach((e, i) => {
    if (!isStr(e.hex) || !HEX_RE.test(e.hex)) errors.push("palette[" + i + "].hex " + q(String(e.hex ?? "")) + " is not #RRGGBB");
  });
  const dominantN = palette.filter((e) => e.weight === "dominant").length;
  if (palette.length && dominantN !== 1) errors.push("palette has " + dominantN + " dominant entries (exactly one required)");
  if (!isStr(card.medium) || !card.medium.trim()) errors.push("medium is empty");
  const typo = isObj(card.typography) ? card.typography : {};
  const vibe = isStr(typo.vibe) ? typo.vibe.trim() : "";
  const headlineFamily = isObj(typo.headline) && isStr(typo.headline.family) ? typo.headline.family.trim() : "";
  if (!vibe && !headlineFamily) errors.push("typography.vibe is empty and typography.headline.family is missing");
  const forbid = strArr(card.forbid);
  if (forbid.length < 2) errors.push("forbid has " + forbid.length + " entries (at least 2 required)");
  const evidence = strArr(card.evidence);
  if (evidence.length < 5) errors.push("evidence has " + evidence.length + " notes (at least 5 required)");
  if (imageCount !== null) {
    evidence.forEach((note, i) => {
      for (const n of imageNumbers(note)) {
        if (n < 1 || n > imageCount) errors.push("evidence[" + i + "] cites IMAGE " + n + " but only " + imageCount + " images were analysed");
      }
    });
    if (isObj(card.field_evidence)) {
      for (const [path, fe] of Object.entries(card.field_evidence)) {
        if (!isObj(fe)) continue;
        for (const n of [...numArr(fe.images), ...numArr(fe.contradicts)]) {
          if (n < 1 || n > imageCount) errors.push("field_evidence." + path + " cites IMAGE " + n + " but only " + imageCount + " images were analysed");
        }
      }
    }
    for (const n of numArr(card.representative_images)) {
      if (n < 1 || n > imageCount) warnings.push("representative_images cites IMAGE " + n + " but only " + imageCount + " images were analysed");
    }
  }
  // rule words and text demands that survived the fixes
  const proseFields: [string, unknown][] = [
    ["medium", card.medium], ["linework", card.linework], ["shading", card.shading], ["texture", card.texture],
    ["composition", card.composition], ["typography", card.typography], ["signature_moves", card.signature_moves], ["forbid", card.forbid],
  ];
  for (const [root, node] of proseFields) {
    walkStrings(node, root, (path, s) => {
      const m = RULE_WORD_RE.exec(s);
      if (m) errors.push(path + " still contains the rule word " + q(m[1]));
      return s;
    });
  }
  // presence contexts (composition, placement, signature moves) also reject watermark / signature line; a forbid may ban them
  const demandFields: [string, unknown, RegExp][] = [
    ["composition", card.composition, PRESENCE_TEXT_RE], ["typography.placement", typo.placement, PRESENCE_TEXT_RE],
    ["signature_moves", card.signature_moves, PRESENCE_TEXT_RE], ["forbid", card.forbid, TEXT_DEMAND_RE],
  ];
  for (const [root, node, re] of demandFields) {
    walkStrings(node, root, (path, s) => {
      const m = re.exec(s) ?? (s.includes("@") ? ["@"] : null);
      if (m) errors.push(path + " still contains a text demand " + q(m[0]));
      return s;
    });
  }
  const briefSubjects = strArr(brief.subjects);
  if (briefSubjects.length) {
    const subjects = strArr(card.subjects);
    for (const bs of briefSubjects) if (!looselyIncludes(subjects, bs)) errors.push("brief subject missing: " + bs);
  }
  if (card.background !== BACKGROUND_LITERAL) errors.push("background must be exactly " + q(BACKGROUND_LITERAL));

  // ---- WARNINGS -----------------------------------------------------------------------------------------------
  const notSeen = isObj(card.brief_check) ? strArr(card.brief_check.must_have_not_seen) : [];
  for (const item of notSeen) warnings.push(item + " not seen in images");
  if (vibe && !headlineFamily) {
    const fams = familiesIn(vibe);
    if (fams.length > 2) warnings.push("typography.vibe names " + fams.length + " lettering families (" + fams.join(", ") + "); split them into typography.headline and typography.secondary");
  }
  palette.forEach((e, i) => {
    const imgs = Array.isArray(e.images) ? numArr(e.images) : null;
    const weak = imgs ? imgs.length < 2 : hasSheets; // with sheets and no cluster match the entry has no support at all
    if (weak && !briefNamesColour(brief, e)) {
      warnings.push("palette[" + i + "] " + q(e.name ?? "") + " " + (e.hex ?? "") + " is seen in fewer than 2 images");
    }
  });
  const clientGarments = strArr(opts.client_garments ?? []).map(normWords).filter(Boolean);
  const cardGarments = strArr(card.garment_colors).map(normWords).filter(Boolean);
  if (clientGarments.length && cardGarments.length) {
    const a = uniq(cardGarments).sort(), b = uniq(clientGarments).sort();
    if (a.join("|") !== b.join("|")) {
      warnings.push("garment_colors [" + a.join(", ") + "] differ from the client's garments [" + b.join(", ") + "]");
    }
  }
  if (!numArr(card.representative_images).length) warnings.push("representative_images missing");
  const enumPaths: [string, unknown][] = [
    ["typography.headline.family", isObj(typo.headline) ? typo.headline.family : undefined],
    ["typography.secondary.family", isObj(typo.secondary) ? typo.secondary.family : undefined],
    ["realism", card.realism], ["shading_method", card.shading_method], ["edge_finish", card.edge_finish],
    ["linework.outline", isObj(card.linework) ? card.linework.outline : undefined],
  ];
  for (const [path, v] of enumPaths) if (v === "other") warnings.push(path + " is \"other\"");

  return { card, errors, warnings, fixes, agreement };
}

// ---------------------------------------------------------------------------
// helpers used above (exported where a consumer may want them)

/** Letter-case synonyms -> enum; anything that is not a letter case (as_typed, as written, ...) -> ''. */
export function normaliseCase(v: string): string {
  const s = String(v ?? "").trim();
  if ((CASE_ENUM as readonly string[]).includes(s)) return s;
  const k = s.toLowerCase().replace(/[\s_-]+/g, " ");
  if (/^(upper( ?case)?|all ?caps|caps|capitals|uppercase)$/.test(k)) return "UPPER";
  if (/^(title( ?case)?|capitali[sz]ed|titlecase)$/.test(k)) return "Title";
  if (/^(lower( ?case)?|lowercase)$/.test(k)) return "lower";
  if (/^(mixed( ?case)?|sentence( ?case)?|mixedcase)$/.test(k)) return "Mixed";
  return "";
}

function placementIn(s: string): string {
  const m = /\b(bottom[\s-]?(?:center|centre|margin|edge)|top[\s-]?(?:center|centre|margin|edge)|below the hero|above the hero|inside the badge|bottom|top)\b/i.exec(s);
  return m ? m[1].toLowerCase().replace(/\s+/g, " ") : "";
}

/** 4-char prefix stems of the significant words of a note (>= 4 chars, not a stopword). */
function stems(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of normWords(s).split(" ")) {
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    out.add(singular(w).slice(0, 4));
  }
  return out;
}

/** A signature move is supported when field_evidence lists an image for it or an evidence note shares a word with it. */
function moveSupported(card: StyleCardV2, index: number, move: string): boolean {
  const fe = isObj(card.field_evidence) ? card.field_evidence : {};
  const keys = ["signature_moves[" + index + "]", "signature_moves." + index, "signature_moves"];
  for (const k of keys) {
    const e = fe[k];
    if (isObj(e) && numArr(e.images).length) return true;
  }
  const want = stems(move);
  if (!want.size) return false;
  for (const note of strArr(card.evidence)) {
    if (note.toLowerCase().includes(move.toLowerCase())) return true;
    const have = stems(note.replace(/^IMAGE[^:]*:/i, ""));
    for (const w of want) if (have.has(w)) return true;
  }
  return false;
}

/** Lettering families named in free prose (used to warn when a vibe mixes more than two). */
export function familiesIn(vibe: string): string[] {
  const s = vibe.toLowerCase();
  const found: string[] = [];
  const add = (f: string): void => { if (!found.includes(f)) found.push(f); };
  if (/\bslab[\s-]?serifs?\b/.test(s)) add("slab_serif");
  if (/\bdisplay[\s-]?serifs?\b/.test(s)) add("display_serif");
  if (/\bcondensed[\s-]?(sans|gothic)/.test(s)) add("condensed_sans");
  if (/\b(grotesk|grotesque)\b/.test(s)) add("grotesk_sans");
  if (/\bscripts?\b/.test(s)) add("script");
  if (/\bbrush\b/.test(s)) add("brush");
  if (/\bblackletter\b/.test(s)) add("blackletter");
  if (/\bwood[\s-]?type\b/.test(s)) add("woodtype");
  if (/\bstencil/.test(s)) add("stencil");
  if (/\bhand[\s-]?letter/.test(s)) add("hand_lettered");
  if (!found.includes("slab_serif") && !found.includes("display_serif") && /\bserifs?\b/.test(s.replace(/sans[\s-]?serifs?/g, ""))) add("serif");
  if (!found.includes("condensed_sans") && !found.includes("grotesk_sans") && /\bsans\b/.test(s)) add("sans");
  return found;
}

function briefNamesColour(brief: StyleBrief, e: PaletteEntryV2): boolean {
  const blob = JSON.stringify(brief ?? {}).toLowerCase();
  if (isStr(e.hex) && e.hex.length === 7 && blob.includes(e.hex.toLowerCase())) return true;
  if (isStr(e.name) && e.name.trim().length >= 3 && blob.includes(e.name.trim().toLowerCase())) return true;
  return false;
}

/** The blocking list a consumer (lock button, RPC) should use: errors only. */
export function isBlocking(result: CheckResult): boolean {
  return result.errors.length > 0;
}
