// DM Studio · region-composite · pure composite logic (no I/O). Images are RGBA8 Uint8Arrays; a Box is {x,y,w,h} in
// parent pixels (integers, clipped to the image).
//
// Fix an area, locked outside (architect plan 2026-10-05, CONTRACTS C): GPT Image 2.5 Sunburst regenerates the WHOLE
// design; this module keeps only the change:
//   C1 size      - a regen of another size is resampled to the parent (Catmull-Rom up, area average down); an aspect
//                  difference above 1 % throws size_mismatch (never stretched)
//   C2 shift     - integer (dx, dy) in [-16, 16] from luma differences on pixels well outside the ring; |d| = 16 throws
//                  misaligned
//   C3 colour    - per-channel mean offset on the band just outside the ring (outliers > 40 dropped), clamped to +-16
//   C4 composite - new pixels inside the box, a linear fade across the ring, the parent untouched beyond it
//   C5 gate      - 0 pixels with dist >= ring may differ from the parent (all 4 bytes), else lock_gate (500)
//   C6 drift     - how much the raw regeneration changed outside / inside / in the ring
//   C7 overflow  - whether the new element runs past the box (see detectOverflow for the measured tuning)
//   C8 seams     - border jump ratios at the box edge and at the ring edge (measure.py border_jump, band 2)

export type Rgba = { width: number; height: number; data: Uint8Array; hasAlpha: boolean };
export type Box = { x: number; y: number; w: number; h: number };

export class RegionError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "RegionError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Overflow + correction tuning. The first nine keys are the plan's (CONTRACTS C7). The last two were added while
 * tuning against the probe fixtures (2026-10-05): with a plain per-pixel diff the regenerated fur texture of
 * b33727a9 / 45eadf6a connects everywhere, and eroding that mask (radius 1 or 2) also cuts the thin tiger tail of
 * dace73f3 off the box, so no diff_overflow / erode_radius / min_px / min_frac inside the plan's ranges separates
 * the cases (beyond-ring px: dace73f3 0, b33727a9 0 with erosion; 177 vs 335 without). The measured fix:
 *   overflow_blur_radius - the diff is taken between 3x3 box-blurred images, so re-drawn texture of the same colour
 *                          averages out while a new object (the tail) does not;
 *   diff_overflow_low    - hysteresis: the region grows from the eroded strong core (> diff_overflow) inside the box
 *                          over the weaker mask (> diff_overflow_low), which keeps thin connected parts.
 * Fixture result with these defaults (ring 31): dace73f3 px 255 beyond the ring (needs 171), b33727a9 0, 45eadf6a 0.
 */
export const TUNING = {
  diff_overflow: 40,
  erode_radius: 1,
  overflow_min_px: 48,
  overflow_min_frac: 0.004,
  max_extend_factor: 2,
  shift_cap: 16,
  colour_cap: 16,
  colour_outlier: 40,
  full_safe_pct: 1,
  overflow_blur_radius: 1,
  diff_overflow_low: 24,
};
export type Tuning = typeof TUNING;

export type ShiftMetrics = { dx: number; dy: number; applied: boolean; reliable: boolean; samples: number; score0: number; score: number };
export type ColourMetrics = { r: number; g: number; b: number; reliable: boolean; samples: number };
export type OverflowMetrics = {
  detected: boolean;
  px: number;
  suggested_rect: Box | null;
  sides: { left: number; right: number; top: number; bottom: number };
};
export type RegionMetrics = {
  version: 1;
  mode: "locked" | "extend" | "full";
  source_generation_id: string | null;
  rect: Box;
  rect_scaled: boolean;
  image_size: { w: number; h: number };
  regen_size: { w: number; h: number };
  resampled: "up" | "down" | null;
  resample_factor: number;
  ring_pct: number;
  ring_px: number;
  band_px: number;
  shift: ShiftMetrics;
  colour_offset: ColourMetrics;
  drift_outside_pct_gt8: number;
  drift_outside_pct_gt20: number;
  full_drift_high: boolean;
  changed_inside_box_pct: number;
  ring_changed_pct_gt40: number;
  ring_blend_changed_pct: number;
  overflow: OverflowMetrics;
  seam_ratio_box: number;
  seam_ratio_ring: number;
  beyond_ring_changed_px: number;
  tuning: Tuning;
  timing_ms: { download: number; decode: number; composite: number; encode: number; total: number };
  computed_at: string | null;
};

export type CompositeOptions = {
  ring_pct: number;
  ring_px?: number;
  mode: "locked" | "extend";
  tuning?: Partial<Tuning>;
  now?: string;
};

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const pct1 = (n: number, d: number): number => (d > 0 ? round1((100 * n) / d) : 0);
const nowMs = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Ring width in px: max(8, round(pct/100 * width)). */
export function ringPx(width: number, pct: number): number {
  return Math.max(8, Math.round((pct / 100) * width));
}

/** Chebyshev distance from (x, y) to the box; 0 inside. */
export function chebyshevDist(x: number, y: number, box: Box): number {
  return Math.max(box.x - x, x - (box.x + box.w - 1), box.y - y, y - (box.y + box.h - 1), 0);
}

/** Per-index distance to [start, start+len) along one axis; dist(x, y) = max(ax[x], ay[y]). */
function axisDist(n: number, start: number, len: number): Int32Array {
  const a = new Int32Array(n);
  const end = start + len - 1;
  for (let i = 0; i < n; i++) a[i] = i < start ? start - i : i > end ? i - end : 0;
  return a;
}

/** Clips a box to the image and rounds it; throws rect_invalid when nothing is left. */
export function clipBox(box: Box, W: number, H: number): Box {
  const x0 = clamp(Math.round(box.x), 0, W), y0 = clamp(Math.round(box.y), 0, H);
  const x1 = clamp(Math.round(box.x + box.w), 0, W), y1 = clamp(Math.round(box.y + box.h), 0, H);
  if (x1 <= x0 || y1 <= y0) throw new RegionError("rect_invalid", "Region composite: the area lies outside the image", 422);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------------------------------------------------------------------------------------------------------------
// C1 resample

type AxisTaps = { start: Int32Array; count: Int32Array; idx: Int32Array; w: Float32Array };

function catmullRom(t: number): number {
  const a = -0.5;
  const x = Math.abs(t);
  if (x <= 1) return (a + 2) * x * x * x - (a + 3) * x * x + 1;
  if (x < 2) return a * x * x * x - 5 * a * x * x + 8 * a * x - 4 * a;
  return 0;
}

function axisTaps(src: number, dst: number): AxisTaps {
  const start = new Int32Array(dst), count = new Int32Array(dst);
  const idx: number[] = [], w: number[] = [];
  const scale = src / dst;
  for (let i = 0; i < dst; i++) {
    start[i] = idx.length;
    if (dst === src) {
      idx.push(i); w.push(1);
    } else if (dst > src) {
      const s = (i + 0.5) * scale - 0.5;
      const i0 = Math.floor(s);
      const t = s - i0;
      const ws = [catmullRom(t + 1), catmullRom(t), catmullRom(1 - t), catmullRom(2 - t)];
      for (let k = 0; k < 4; k++) { idx.push(clamp(i0 - 1 + k, 0, src - 1)); w.push(ws[k]); }
    } else {
      const a = i * scale, b = (i + 1) * scale;
      for (let j = Math.floor(a); j < Math.ceil(b) && j < src; j++) {
        const ov = Math.min(b, j + 1) - Math.max(a, j);
        if (ov > 0) { idx.push(j); w.push(ov / scale); }
      }
    }
    count[i] = idx.length - start[i];
  }
  return { start, count, idx: Int32Array.from(idx), w: Float32Array.from(w) };
}

/** Resamples to W x H per axis: Catmull-Rom (a = -0.5, edge clamp) when enlarging, area average when shrinking. */
export function resampleTo(img: Rgba, W: number, H: number): Rgba {
  if (img.width === W && img.height === H) return { width: W, height: H, data: img.data.slice(), hasAlpha: img.hasAlpha };
  const sw = img.width, sh = img.height, src = img.data;
  const tx = axisTaps(sw, W), ty = axisTaps(sh, H);
  const tmp = new Float32Array(W * sh * 4);
  for (let y = 0; y < sh; y++) {
    const row = y * sw * 4;
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const s0 = tx.start[x], n = tx.count[x];
      for (let k = 0; k < n; k++) {
        const p = row + tx.idx[s0 + k] * 4, wt = tx.w[s0 + k];
        r += src[p] * wt; g += src[p + 1] * wt; b += src[p + 2] * wt; a += src[p + 3] * wt;
      }
      const q = (y * W + x) * 4;
      tmp[q] = r; tmp[q + 1] = g; tmp[q + 2] = b; tmp[q + 3] = a;
    }
  }
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const s0 = ty.start[y], n = ty.count[y];
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < n; k++) {
        const p = (ty.idx[s0 + k] * W + x) * 4, wt = ty.w[s0 + k];
        r += tmp[p] * wt; g += tmp[p + 1] * wt; b += tmp[p + 2] * wt; a += tmp[p + 3] * wt;
      }
      const q = (y * W + x) * 4;
      out[q] = clamp(Math.round(r), 0, 255); out[q + 1] = clamp(Math.round(g), 0, 255);
      out[q + 2] = clamp(Math.round(b), 0, 255); out[q + 3] = clamp(Math.round(a), 0, 255);
    }
  }
  return { width: W, height: H, data: out, hasAlpha: img.hasAlpha };
}

// ---------------------------------------------------------------------------------------------------------------
// C2 shift

function luma(img: Rgba): Uint8Array {
  const n = img.width * img.height, d = img.data, y = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) y[i] = (77 * d[p] + 150 * d[p + 1] + 29 * d[p + 2]) >> 8;
  return y;
}

/**
 * Integer shift (dx, dy) so that the aligned regen A(x, y) = R(x + dx, y + dy) matches the parent outside the ring.
 * Samples: dist >= ring + 2 and at least cap + 1 px from every edge (so a +-(cap + 1) probe never leaves the image),
 * on a stride grid. Coarse: every offset in [-cap, cap]^2 on <= 10000 samples; refine: the 3x3 neighbourhood of the
 * coarse best on <= 60000 samples. An offset other than (0, 0) is accepted only when it lowers the mean absolute luma
 * difference to <= 0.9 x the unshifted one. Under 500 eligible pixels: (0, 0), reliable false. |dx| or |dy| >= cap
 * throws misaligned.
 */
export function estimateShift(parent: Rgba, regen: Rgba, box: Box, ring: number, cap = TUNING.shift_cap): ShiftMetrics {
  const W = parent.width, H = parent.height;
  if (regen.width !== W || regen.height !== H) throw new RegionError("internal", "Region composite: shift needs equal sizes", 500);
  const ax = axisDist(W, box.x, box.w), ay = axisDist(H, box.y, box.h);
  const m = cap + 1, minD = ring + 2;
  const collect = (stride: number, limit: number): Int32Array | null => {
    const out: number[] = [];
    for (let y = m; y <= H - 1 - m; y += stride) {
      const dyy = ay[y];
      for (let x = m; x <= W - 1 - m; x += stride) {
        if (dyy >= minD || ax[x] >= minD) {
          out.push(y * W + x);
          if (out.length > limit) return null;
        }
      }
    }
    return Int32Array.from(out);
  };
  let eligible = 0;
  for (let y = m; y <= H - 1 - m; y++) {
    if (ay[y] >= minD) { eligible += Math.max(0, W - 2 * m); continue; }
    for (let x = m; x <= W - 1 - m; x++) if (ax[x] >= minD) eligible++;
  }
  const pick = (limit: number): Int32Array => {
    let s = Math.max(1, Math.ceil(Math.sqrt(eligible / limit)));
    for (;;) {
      const got = collect(s, limit);
      if (got) return got;
      s++;
    }
  };
  if (eligible < 500) return { dx: 0, dy: 0, applied: false, reliable: false, samples: eligible, score0: 0, score: 0 };
  const Yp = luma(parent), Yr = luma(regen);
  const score = (set: Int32Array, dx: number, dy: number): number => {
    const off = dy * W + dx;
    let s = 0;
    for (let k = 0; k < set.length; k++) {
      const i = set[k];
      const d = Yp[i] - Yr[i + off];
      s += d < 0 ? -d : d;
    }
    return s / set.length;
  };
  // offsets ordered by distance so a tie keeps the smaller shift
  const offsets: [number, number][] = [];
  for (let dy = -cap; dy <= cap; dy++) for (let dx = -cap; dx <= cap; dx++) offsets.push([dx, dy]);
  offsets.sort((a, b) => Math.max(Math.abs(a[0]), Math.abs(a[1])) - Math.max(Math.abs(b[0]), Math.abs(b[1])) ||
    (Math.abs(a[0]) + Math.abs(a[1])) - (Math.abs(b[0]) + Math.abs(b[1])) || a[1] - b[1] || a[0] - b[0]);
  const coarse = pick(10000);
  let bx = 0, by = 0, best = Infinity;
  for (const [dx, dy] of offsets) {
    const s = score(coarse, dx, dy);
    if (s < best) { best = s; bx = dx; by = dy; }
  }
  const dense = pick(60000);
  const score0 = score(dense, 0, 0);
  let rx = 0, ry = 0, rs = score0;
  const near: [number, number][] = [];
  for (let dy = by - 1; dy <= by + 1; dy++) for (let dx = bx - 1; dx <= bx + 1; dx++) {
    if (Math.abs(dx) <= m && Math.abs(dy) <= m) near.push([dx, dy]);
  }
  near.sort((a, b) => (Math.abs(a[0]) + Math.abs(a[1])) - (Math.abs(b[0]) + Math.abs(b[1])) || a[1] - b[1] || a[0] - b[0]);
  let nbx = 0, nby = 0, nbs = Infinity;
  for (const [dx, dy] of near) {
    const s = dx === 0 && dy === 0 ? score0 : score(dense, dx, dy);
    if (s < nbs) { nbs = s; nbx = dx; nby = dy; }
  }
  if ((nbx !== 0 || nby !== 0) && nbs <= 0.9 * score0) { rx = nbx; ry = nby; rs = nbs; }
  if (Math.abs(rx) >= cap || Math.abs(ry) >= cap) {
    throw new RegionError("misaligned", "Region composite: the regenerated image moved by more than " + cap + " px - run Fix an area again", 422);
  }
  return { dx: rx, dy: ry, applied: rx !== 0 || ry !== 0, reliable: true, samples: dense.length, score0: round2(score0), score: round2(rs) };
}

// ---------------------------------------------------------------------------------------------------------------
// C3 colour

/**
 * Mean per-channel difference aligned regen - parent over the band just outside the ring (ring <= dist < ring + band),
 * dropping pixels where any channel differs by more than colour_outlier; clamped to +-colour_cap and rounded to one
 * decimal (the rounded value is the one applied). Under 200 kept pixels: 0, reliable false.
 */
export function colourOffset(
  parent: Rgba, regen: Rgba, box: Box, ring: number, band: number, shift: { dx: number; dy: number }, tuning: Tuning = TUNING,
): ColourMetrics {
  const W = parent.width, H = parent.height, P = parent.data, R = regen.data;
  const ax = axisDist(W, box.x, box.w), ay = axisDist(H, box.y, box.h);
  const g = ring + band - 1;
  const x0 = Math.max(0, box.x - g), x1 = Math.min(W - 1, box.x + box.w - 1 + g);
  const y0 = Math.max(0, box.y - g), y1 = Math.min(H - 1, box.y + box.h - 1 + g);
  const lim = tuning.colour_outlier;
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let y = y0; y <= y1; y++) {
    const ry = clamp(y + shift.dy, 0, H - 1);
    for (let x = x0; x <= x1; x++) {
      const d = Math.max(ax[x], ay[y]);
      if (d < ring || d >= ring + band) continue;
      const p = (y * W + x) * 4;
      const q = (ry * W + clamp(x + shift.dx, 0, W - 1)) * 4;
      const dr = R[q] - P[p], dg = R[q + 1] - P[p + 1], db = R[q + 2] - P[p + 2];
      if (Math.abs(dr) > lim || Math.abs(dg) > lim || Math.abs(db) > lim) continue;
      sr += dr; sg += dg; sb += db; n++;
    }
  }
  if (n < 200) return { r: 0, g: 0, b: 0, reliable: false, samples: n };
  const cap = tuning.colour_cap;
  return { r: round1(clamp(sr / n, -cap, cap)), g: round1(clamp(sg / n, -cap, cap)), b: round1(clamp(sb / n, -cap, cap)), reliable: true, samples: n };
}

/** C(x, y) = clamp(round(R(x + dx, y + dy) - offset)) per RGB channel (edge clamp); alpha = the regen's. */
export function alignAndCorrect(regen: Rgba, shift: { dx: number; dy: number }, offset: { r: number; g: number; b: number }): Rgba {
  const W = regen.width, H = regen.height, R = regen.data;
  const lut = (o: number): Uint8Array => {
    const t = new Uint8Array(256);
    for (let v = 0; v < 256; v++) t[v] = clamp(Math.round(v - o), 0, 255);
    return t;
  };
  const lr = lut(offset.r), lg = lut(offset.g), lb = lut(offset.b);
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = clamp(y + shift.dy, 0, H - 1) * W;
    for (let x = 0; x < W; x++) {
      const q = (sy + clamp(x + shift.dx, 0, W - 1)) * 4, p = (y * W + x) * 4;
      out[p] = lr[R[q]]; out[p + 1] = lg[R[q + 1]]; out[p + 2] = lb[R[q + 2]]; out[p + 3] = R[q + 3];
    }
  }
  return { width: W, height: H, data: out, hasAlpha: regen.hasAlpha };
}

// ---------------------------------------------------------------------------------------------------------------
// C4 composite + C5 gate

/**
 * out = parent; for dist < ring: a = 1 inside the box, else 1 - dist / ring; channel = round(C a + P (1 - a));
 * alpha = parent.hasAlpha ? the same blend : 255. Pixels with dist >= ring are never written.
 */
export function compositeLocked(parent: Rgba, corrected: Rgba, box: Box, ring: number): Rgba {
  const W = parent.width, H = parent.height, P = parent.data, C = corrected.data;
  const out = P.slice();
  const ax = axisDist(W, box.x, box.w), ay = axisDist(H, box.y, box.h);
  const g = ring - 1;
  const x0 = Math.max(0, box.x - g), x1 = Math.min(W - 1, box.x + box.w - 1 + g);
  const y0 = Math.max(0, box.y - g), y1 = Math.min(H - 1, box.y + box.h - 1 + g);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.max(ax[x], ay[y]);
      if (d >= ring) continue;
      const p = (y * W + x) * 4;
      if (d === 0) {
        out[p] = C[p]; out[p + 1] = C[p + 1]; out[p + 2] = C[p + 2];
        out[p + 3] = parent.hasAlpha ? C[p + 3] : 255;
        continue;
      }
      const a = 1 - d / ring, b = 1 - a;
      out[p] = Math.round(C[p] * a + P[p] * b);
      out[p + 1] = Math.round(C[p + 1] * a + P[p + 1] * b);
      out[p + 2] = Math.round(C[p + 2] * a + P[p + 2] * b);
      out[p + 3] = parent.hasAlpha ? Math.round(C[p + 3] * a + P[p + 3] * b) : 255;
    }
  }
  return { width: W, height: H, data: out, hasAlpha: parent.hasAlpha };
}

/** Number of pixels with dist >= ring where any of the 4 bytes of out differs from the parent (must be 0). */
export function lockGate(parent: Rgba, out: Rgba, box: Box, ring: number): number {
  const W = parent.width, H = parent.height, P = parent.data, O = out.data;
  if (out.width !== W || out.height !== H) return W * H;
  const ax = axisDist(W, box.x, box.w), ay = axisDist(H, box.y, box.h);
  let n = 0;
  for (let y = 0; y < H; y++) {
    const full = ay[y] >= ring;
    for (let x = 0, p = y * W * 4; x < W; x++, p += 4) {
      if (!full && ax[x] < ring) continue;
      if (O[p] !== P[p] || O[p + 1] !== P[p + 1] || O[p + 2] !== P[p + 2] || O[p + 3] !== P[p + 3]) n++;
    }
  }
  return n;
}

/** Throws RegionError lock_gate (500) when the gate is not 0; returns 0 otherwise. */
export function enforceLockGate(parent: Rgba, out: Rgba, box: Box, ring: number): number {
  const n = lockGate(parent, out, box, ring);
  if (n !== 0) {
    throw new RegionError("lock_gate", "Region composite: " + n + " pixels beyond the blend ring changed - the result was not saved", 500);
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------
// C6 drift

export type DriftMetrics = {
  drift_outside_pct_gt8: number;
  drift_outside_pct_gt20: number;
  changed_inside_box_pct: number;
  ring_changed_pct_gt40: number;
  ring_blend_changed_pct: number;
};

/** Raw drift of the corrected regen C against the parent (max RGB channel difference), plus the blend in the ring. */
export function rawDrift(parent: Rgba, corrected: Rgba, out: Rgba, box: Box, ring: number): DriftMetrics {
  const W = parent.width, H = parent.height, P = parent.data, C = corrected.data, O = out.data;
  const ax = axisDist(W, box.x, box.w), ay = axisDist(H, box.y, box.h);
  let nOut = 0, out8 = 0, out20 = 0, nIn = 0, in20 = 0, nRing = 0, ring40 = 0, blend8 = 0;
  for (let y = 0; y < H; y++) {
    const dy = ay[y];
    for (let x = 0, p = y * W * 4; x < W; x++, p += 4) {
      const d = dy > ax[x] ? dy : ax[x];
      const a = Math.abs(C[p] - P[p]), b = Math.abs(C[p + 1] - P[p + 1]), c = Math.abs(C[p + 2] - P[p + 2]);
      const m = a > b ? (a > c ? a : c) : b > c ? b : c;
      if (d >= ring) {
        nOut++;
        if (m > 8) out8++;
        if (m > 20) out20++;
      } else if (d === 0) {
        nIn++;
        if (m > 20) in20++;
      } else {
        nRing++;
        if (m > 40) ring40++;
        const oa = Math.abs(O[p] - P[p]), ob = Math.abs(O[p + 1] - P[p + 1]), oc = Math.abs(O[p + 2] - P[p + 2]);
        if (oa > 8 || ob > 8 || oc > 8) blend8++;
      }
    }
  }
  return {
    drift_outside_pct_gt8: pct1(out8, nOut),
    drift_outside_pct_gt20: pct1(out20, nOut),
    changed_inside_box_pct: pct1(in20, nIn),
    ring_changed_pct_gt40: pct1(ring40, nRing),
    ring_blend_changed_pct: pct1(blend8, nRing),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// C7 overflow

/** The search window: the box grown by (max_extend_factor - 1) / 2 of its size per side, clipped (2x the box). */
export function maxRectOf(box: Box, W: number, H: number, tuning: Tuning = TUNING): Box {
  const f = Math.max(1, tuning.max_extend_factor);
  const gx = Math.floor((box.w * (f - 1)) / 2), gy = Math.floor((box.h * (f - 1)) / 2);
  const x0 = Math.max(0, box.x - gx), y0 = Math.max(0, box.y - gy);
  const x1 = Math.min(W, box.x + box.w + gx), y1 = Math.min(H, box.y + box.h + gy);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Does the new element run past the box? Inside the search window (maxRectOf):
 *   d      = max RGB |blur(C) - blur(P)|, blur = (2 overflow_blur_radius + 1)^2 box filter, image-edge clamp
 *   core   = (d > diff_overflow) eroded with a (2 erode_radius + 1)^2 all-set kernel (outside the window = unset)
 *   R      = 8-connected flood from the core pixels inside the box over (d > diff_overflow_low) or core
 *   px     = |R beyond the ring| ; detected = px >= max(overflow_min_px, round(overflow_min_frac * w * h))
 *   suggested_rect = bbox(R dilated by erode_radius, union the box) grown by 4 px, clipped to the window and the
 *   image; null when not detected or when it equals the box. sides = how far it reaches past the box per side.
 */
export function detectOverflow(parent: Rgba, corrected: Rgba, box: Box, ring: number, tuning: Tuning = TUNING): OverflowMetrics {
  const W = parent.width, H = parent.height, P = parent.data, C = corrected.data;
  const none: OverflowMetrics = { detected: false, px: 0, suggested_rect: null, sides: { left: 0, right: 0, top: 0, bottom: 0 } };
  const mr = maxRectOf(box, W, H, tuning);
  const mw = mr.w, mh = mr.h;
  if (mw <= 0 || mh <= 0) return none;
  const br = Math.max(0, Math.round(tuning.overflow_blur_radius));
  const k = 2 * br + 1, k2 = k * k;
  const ew = mw + 2 * br, eh = mh + 2 * br;
  // signed diff on the window grown by the blur radius (coordinates clamped into the image)
  const D = new Int16Array(ew * eh * 3);
  for (let j = 0; j < eh; j++) {
    const y = clamp(mr.y - br + j, 0, H - 1);
    for (let i = 0; i < ew; i++) {
      const x = clamp(mr.x - br + i, 0, W - 1);
      const p = (y * W + x) * 4, q = (j * ew + i) * 3;
      D[q] = C[p] - P[p]; D[q + 1] = C[p + 1] - P[p + 1]; D[q + 2] = C[p + 2] - P[p + 2];
    }
  }
  // horizontal then vertical box sums -> max |channel sum| per window pixel
  const Hs = new Int32Array(mw * eh * 3);
  for (let j = 0; j < eh; j++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += D[(j * ew + t) * 3 + c];
      Hs[(j * mw) * 3 + c] = s;
      for (let i = 1; i < mw; i++) {
        s += D[(j * ew + i + k - 1) * 3 + c] - D[(j * ew + i - 1) * 3 + c];
        Hs[(j * mw + i) * 3 + c] = s;
      }
    }
  }
  const dmax = new Int32Array(mw * mh);
  const col = new Int32Array(3);
  for (let i = 0; i < mw; i++) {
    col[0] = 0; col[1] = 0; col[2] = 0;
    for (let t = 0; t < k; t++) for (let c = 0; c < 3; c++) col[c] += Hs[(t * mw + i) * 3 + c];
    for (let j = 0; j < mh; j++) {
      if (j > 0) {
        for (let c = 0; c < 3; c++) col[c] += Hs[((j + k - 1) * mw + i) * 3 + c] - Hs[((j - 1) * mw + i) * 3 + c];
      }
      const a = Math.abs(col[0]), b = Math.abs(col[1]), c2 = Math.abs(col[2]);
      dmax[j * mw + i] = a > b ? (a > c2 ? a : c2) : b > c2 ? b : c2;
    }
  }
  const hi = tuning.diff_overflow * k2, lo = Math.min(tuning.diff_overflow_low, tuning.diff_overflow) * k2;
  const n = mw * mh;
  const strong = new Uint8Array(n), weak = new Uint8Array(n);
  for (let i = 0; i < n; i++) { if (dmax[i] > hi) strong[i] = 1; if (dmax[i] > lo) weak[i] = 1; }
  // erosion (separable all-set test; outside the window counts as unset)
  const r = Math.max(0, Math.round(tuning.erode_radius));
  let core = strong;
  if (r > 0) {
    const h1 = new Uint8Array(n);
    for (let j = 0; j < mh; j++) {
      let run = 0;
      for (let i = 0; i < mw; i++) {
        run = strong[j * mw + i] ? run + 1 : 0;
        // run = consecutive set pixels ending at i; the window centred at i - r is all set when run >= 2r + 1
        if (run >= 2 * r + 1) h1[j * mw + i - r] = 1;
      }
    }
    const v1 = new Uint8Array(n);
    for (let i = 0; i < mw; i++) {
      let run = 0;
      for (let j = 0; j < mh; j++) {
        run = h1[j * mw + i] ? run + 1 : 0;
        if (run >= 2 * r + 1) v1[(j - r) * mw + i] = 1;
      }
    }
    core = v1;
  }
  // flood from the core pixels inside the box
  const bx0 = box.x - mr.x, by0 = box.y - mr.y, bx1 = bx0 + box.w - 1, by1 = by0 + box.h - 1;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let j = by0; j <= by1; j++) for (let i = bx0; i <= bx1; i++) {
    const id = j * mw + i;
    if (core[id]) { seen[id] = 1; queue[qt++] = id; }
  }
  while (qh < qt) {
    const id = queue[qh++];
    const j = (id / mw) | 0, i = id - j * mw;
    for (let dj = -1; dj <= 1; dj++) {
      const jj = j + dj;
      if (jj < 0 || jj >= mh) continue;
      for (let di = -1; di <= 1; di++) {
        const ii = i + di;
        if ((di === 0 && dj === 0) || ii < 0 || ii >= mw) continue;
        const nid = jj * mw + ii;
        if (seen[nid] || !(weak[nid] || core[nid])) continue;
        seen[nid] = 1;
        queue[qt++] = nid;
      }
    }
  }
  if (!qt) return none;
  let px = 0, minX = mw, minY = mh, maxX = -1, maxY = -1;
  for (let t = 0; t < qt; t++) {
    const id = queue[t];
    const j = (id / mw) | 0, i = id - j * mw;
    if (i < minX) minX = i;
    if (i > maxX) maxX = i;
    if (j < minY) minY = j;
    if (j > maxY) maxY = j;
    const dx = i < bx0 ? bx0 - i : i > bx1 ? i - bx1 : 0;
    const dy = j < by0 ? by0 - j : j > by1 ? j - by1 : 0;
    if ((dx > dy ? dx : dy) >= ring) px++;
  }
  const need = Math.max(tuning.overflow_min_px, Math.round(tuning.overflow_min_frac * box.w * box.h));
  const detected = px >= need;
  if (!detected) return { detected: false, px, suggested_rect: null, sides: { left: 0, right: 0, top: 0, bottom: 0 } };
  const grow = 4;
  const ux0 = Math.min(mr.x + minX - r, box.x) - grow, uy0 = Math.min(mr.y + minY - r, box.y) - grow;
  const ux1 = Math.max(mr.x + maxX + r, box.x + box.w - 1) + grow, uy1 = Math.max(mr.y + maxY + r, box.y + box.h - 1) + grow;
  const sx0 = Math.max(ux0, mr.x, 0), sy0 = Math.max(uy0, mr.y, 0);
  const sx1 = Math.min(ux1, mr.x + mr.w - 1, W - 1), sy1 = Math.min(uy1, mr.y + mr.h - 1, H - 1);
  const s: Box = { x: sx0, y: sy0, w: sx1 - sx0 + 1, h: sy1 - sy0 + 1 };
  const same = s.x === box.x && s.y === box.y && s.w === box.w && s.h === box.h;
  return {
    detected: true,
    px,
    suggested_rect: same ? null : s,
    sides: same ? { left: 0, right: 0, top: 0, bottom: 0 } : {
      left: box.x - s.x, right: s.x + s.w - (box.x + box.w), top: box.y - s.y, bottom: s.y + s.h - (box.y + box.h),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// C8 seams

/** measure.py border_jump: mean over the usable sides of mean(sum RGB |inside 2 px band - outside 2 px band|). */
export function borderJump(img: Rgba, rect: Box, band = 2): number {
  const W = img.width, H = img.height, d = img.data;
  const x0 = rect.x, y0 = rect.y, x1 = rect.x + rect.w, y1 = rect.y + rect.h;
  const diff = (p: number, q: number): number => Math.abs(d[p] - d[q]) + Math.abs(d[p + 1] - d[q + 1]) + Math.abs(d[p + 2] - d[q + 2]);
  const sides: number[] = [];
  const rows = (ya: number, yb: number): number => { // rows ya.. vs yb.., band rows each, columns x0..x1-1
    let s = 0;
    for (let t = 0; t < band; t++) for (let x = x0; x < x1; x++) s += diff(((ya + t) * W + x) * 4, ((yb + t) * W + x) * 4);
    return s / (band * (x1 - x0));
  };
  const cols = (xa: number, xb: number): number => {
    let s = 0;
    for (let y = y0; y < y1; y++) for (let t = 0; t < band; t++) s += diff((y * W + xa + t) * 4, (y * W + xb + t) * 4);
    return s / (band * (y1 - y0));
  };
  if (y0 - band >= 0) sides.push(rows(y0, y0 - band));
  if (y1 + band <= H) sides.push(rows(y1 - band, y1));
  if (x0 - band >= 0) sides.push(cols(x0, x0 - band));
  if (x1 + band <= W) sides.push(cols(x1 - band, x1));
  if (!sides.length) return 0;
  return sides.reduce((a, b) => a + b, 0) / sides.length;
}

/** jump(out, rect) / max(1e-6, jump(parent, rect)), unrounded. */
export function seamRatio(parent: Rgba, out: Rgba, rect: Box): number {
  return borderJump(out, rect) / Math.max(1e-6, borderJump(parent, rect));
}

// ---------------------------------------------------------------------------------------------------------------
// the whole pipeline

/**
 * Size -> shift -> colour -> composite -> gate -> drift -> overflow -> seams. Returns the composited image (parent
 * size, parent alpha mode) and region_metrics version 1. The handler fills source_generation_id, timing_ms.download /
 * decode / encode / total and computed_at.
 */
export function runComposite(parent: Rgba, regen: Rgba, boxIn: Box, opts: CompositeOptions): { image: Rgba; metrics: RegionMetrics } {
  const t0 = nowMs();
  const tuning: Tuning = { ...TUNING, ...(opts.tuning ?? {}) };
  const W = parent.width, H = parent.height;
  const box = clipBox(boxIn, W, H);
  const ring = opts.ring_px !== undefined ? Math.max(1, Math.round(opts.ring_px)) : ringPx(W, opts.ring_pct);
  const band = Math.max(8, ring);

  // C1 size
  const rw = regen.width, rh = regen.height;
  let resampled: "up" | "down" | null = null;
  let R = regen;
  if (rw !== W || rh !== H) {
    const want = W / H, got = rw / rh;
    if (Math.abs(got - want) / want > 0.01) {
      throw new RegionError("size_mismatch", "Region composite: the regenerated image has a different shape (" + rw + "x" + rh + " vs " + W + "x" + H + ") and is never stretched", 422);
    }
    resampled = W * H >= rw * rh ? "up" : "down";
    R = resampleTo(regen, W, H);
  }

  // C2 shift, C3 colour, aligned + corrected regen
  const shift = estimateShift(parent, R, box, ring, tuning.shift_cap);
  const colour = colourOffset(parent, R, box, ring, band, shift, tuning);
  const C = alignAndCorrect(R, shift, colour);
  R = C; // the resampled copy is no longer needed

  // C4 composite, C5 gate
  const out = compositeLocked(parent, C, box, ring);
  const beyond = enforceLockGate(parent, out, box, ring);

  // C6 drift, C7 overflow, C8 seams
  const drift = rawDrift(parent, C, out, box, ring);
  const overflow = detectOverflow(parent, C, box, ring, tuning);
  const ringRect = clipBox({ x: box.x - ring, y: box.y - ring, w: box.w + 2 * ring, h: box.h + 2 * ring }, W, H);
  const metrics: RegionMetrics = {
    version: 1,
    mode: opts.mode,
    source_generation_id: null,
    rect: { x: box.x, y: box.y, w: box.w, h: box.h },
    rect_scaled: false,
    image_size: { w: W, h: H },
    regen_size: { w: rw, h: rh },
    resampled,
    resample_factor: resampled ? round3(W / rw) : 1,
    ring_pct: opts.ring_pct,
    ring_px: ring,
    band_px: band,
    shift,
    colour_offset: colour,
    drift_outside_pct_gt8: drift.drift_outside_pct_gt8,
    drift_outside_pct_gt20: drift.drift_outside_pct_gt20,
    full_drift_high: drift.drift_outside_pct_gt8 > tuning.full_safe_pct,
    changed_inside_box_pct: drift.changed_inside_box_pct,
    ring_changed_pct_gt40: drift.ring_changed_pct_gt40,
    ring_blend_changed_pct: drift.ring_blend_changed_pct,
    overflow,
    seam_ratio_box: round2(seamRatio(parent, out, box)),
    seam_ratio_ring: round2(seamRatio(parent, out, ringRect)),
    beyond_ring_changed_px: beyond,
    tuning,
    timing_ms: { download: 0, decode: 0, composite: 0, encode: 0, total: 0 },
    computed_at: opts.now ?? null,
  };
  metrics.timing_ms.composite = Math.round(nowMs() - t0);
  return { image: out, metrics };
}
