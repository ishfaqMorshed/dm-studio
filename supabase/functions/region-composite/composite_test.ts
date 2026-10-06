// region-composite tests (architect plan 2026-10-05, section 1 T1-T13). Run: npm run test:functions (Node shim, spec 3.4)
// or deno test --allow-read supabase/functions/region-composite/. No jsr imports (local assert helpers like qc_test.ts);
// fixtures are read with node:fs/promises relative to import.meta.url. The fixtures are CROPS of the probe parents and
// Sunburst outputs around each box (fixtures.json rect_in_crop), so ring_px 31 (= 3 % of the 1024 px parents) is passed
// explicitly instead of ring_pct x crop width.
import { readFile } from "node:fs/promises";
import { crc32, decodePng, deflate, encodePng, PngError, sniffImageType, type DecodedPng } from "./png.ts";
import { type Box, type Rgba, chebyshevDist, compositeLocked, enforceLockGate, lockGate, maxRectOf, RegionError, resampleTo, ringPx, runComposite, TUNING } from "./composite.ts";
import { cleanMessage, CORS_HEADERS, GEN_SELECT, handler, SB_URL, scrubSecrets } from "./handler.ts";

function assert(cond: unknown, msg?: string): void {
  if (!cond) throw new Error("Assertion failed" + (msg ? ": " + msg : ""));
}
function assertEquals<T>(a: T, b: T, msg?: string): void {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((msg ? msg + ": " : "") + "expected " + jb + " got " + ja);
}
function assertClose(a: number, b: number, tol: number, msg?: string): void {
  if (!(Math.abs(a - b) <= tol)) throw new Error((msg ? msg + ": " : "") + a + " is not within " + tol + " of " + b);
}
async function assertThrowsRegion(fn: () => unknown | Promise<unknown>, code: string, status: number): Promise<RegionError> {
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof RegionError)) throw new Error("expected RegionError " + code + ", got " + String((e as Error)?.message ?? e));
    assertEquals(e.code, code, "RegionError code");
    assertEquals(e.status, status, "RegionError status");
    return e;
  }
  throw new Error("expected RegionError " + code + " but nothing was thrown");
}

// ---------------------------------------------------------------------------------------------------------------
// fixtures

type FixtureMeta = { crop_origin: number[]; rect_in_crop: Box; full_size: number[]; instruction: string };
const RING = 31; // = ringPx(1024, 3): the probe parents are 1024 px wide
const CIDS = ["b33727a9", "45eadf6a", "dace73f3"] as const;
type Cid = (typeof CIDS)[number];

const fixtureUrl = (name: string): URL => new URL("./fixtures/" + name, import.meta.url);
const readFixture = (name: string): Promise<Uint8Array> => readFile(fixtureUrl(name)).then((b) => new Uint8Array(b));
let metaCache: Record<string, FixtureMeta> | null = null;
async function meta(): Promise<Record<string, FixtureMeta>> {
  if (!metaCache) metaCache = JSON.parse(new TextDecoder().decode(await readFixture("fixtures.json"))) as Record<string, FixtureMeta>;
  return metaCache;
}
type Pair = { parent: DecodedPng; regen: DecodedPng; box: Box; parentBytes: Uint8Array; regenBytes: Uint8Array };
const pairCache = new Map<string, Pair>();
async function pair(cid: Cid): Promise<Pair> {
  const hit = pairCache.get(cid);
  if (hit) return hit;
  const [parentBytes, regenBytes, m] = await Promise.all([readFixture(cid + "_parent_crop.png"), readFixture(cid + "_sunburst_crop.png"), meta()]);
  const p: Pair = { parent: await decodePng(parentBytes), regen: await decodePng(regenBytes), box: m[cid].rect_in_crop, parentBytes, regenBytes };
  pairCache.set(cid, p);
  return p;
}
const locked = (p: Pair, box: Box = p.box, mode: "locked" | "extend" = "locked") => runComposite(p.parent, p.regen, box, { ring_pct: 3, ring_px: RING, mode });

// probe measurements this implementation must reproduce (docs/region-edit/probe/results.json, variant A_mask)
const PROBE_SEAM_BOX: Record<Cid, number> = { b33727a9: 0.85, "45eadf6a": 0.82, dace73f3: 1.25 };
async function probeSeam(cid: Cid): Promise<number> {
  try {
    const j = JSON.parse(new TextDecoder().decode(await readFile(new URL("../../../docs/region-edit/probe/results.json", import.meta.url)))) as Record<string, { composite_seam_ratio_box?: number }>;
    const v = j[cid + "_A_mask"]?.composite_seam_ratio_box;
    if (typeof v === "number") return v;
  } catch {
    // the docs folder is not shipped with the function; fall back to the pinned values
  }
  return PROBE_SEAM_BOX[cid];
}

// synthetic helpers
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const copy = (img: Rgba): Rgba => ({ width: img.width, height: img.height, data: img.data.slice(), hasAlpha: img.hasAlpha });
/** The box area recoloured (an edit the model would have drawn). */
function alterBox(img: Rgba, box: Box): Rgba {
  const o = copy(img);
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const p = (y * img.width + x) * 4;
      o.data[p] = 255 - o.data[p];
      o.data[p + 1] = (o.data[p + 1] + 97) & 255;
      o.data[p + 2] = 255 - o.data[p + 2];
    }
  }
  return o;
}
/** R(x, y) = img(x - dx, y - dy) edge-clamped, so the aligned A(x, y) = R(x + dx, y + dy) = img(x, y). */
function shiftImage(img: Rgba, dx: number, dy: number): Rgba {
  const W = img.width, H = img.height, out = new Uint8Array(img.data.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = clamp(x - dx, 0, W - 1), sy = clamp(y - dy, 0, H - 1);
      const s = (sy * W + sx) * 4;
      out.set(img.data.subarray(s, s + 4), (y * W + x) * 4);
    }
  }
  return { width: W, height: H, data: out, hasAlpha: img.hasAlpha };
}
function addOffset(img: Rgba, r: number, g: number, b: number): Rgba {
  const o = copy(img);
  for (let p = 0; p < o.data.length; p += 4) {
    o.data[p] = clamp(o.data[p] + r, 0, 255);
    o.data[p + 1] = clamp(o.data[p + 1] + g, 0, 255);
    o.data[p + 2] = clamp(o.data[p + 2] + b, 0, 255);
  }
  return o;
}
function cropTo(img: Rgba, W: number, H: number): Rgba {
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) out.set(img.data.subarray(y * img.width * 4, y * img.width * 4 + W * 4), y * W * 4);
  return { width: W, height: H, data: out, hasAlpha: img.hasAlpha };
}
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const insideBox = (box: Box, fn: (p: number, x: number, y: number) => void, W: number): void => {
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) fn((y * W + x) * 4, x, y);
};
const containsBox = (outer: Box, inner: Box): boolean =>
  outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.w >= inner.x + inner.w && outer.y + outer.h >= inner.y + inner.h;

// hand-built PNGs for the codec tests
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const len = data.length;
  out[0] = (len >>> 24) & 0xff; out[1] = (len >>> 16) & 0xff; out[2] = (len >>> 8) & 0xff; out[3] = len & 0xff;
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const c = crc32(out, 4, 8 + len);
  out[8 + len] = (c >>> 24) & 0xff; out[9 + len] = (c >>> 16) & 0xff; out[10 + len] = (c >>> 8) & 0xff; out[11 + len] = c & 0xff;
  return out;
}
async function buildPng(o: { width: number; height: number; bitDepth: number; colorType: number; rows: Uint8Array; interlace?: number; plte?: Uint8Array; trns?: Uint8Array }): Promise<Uint8Array> {
  const stride = o.rows.length / o.height;
  const filtered = new Uint8Array(o.height * (stride + 1));
  for (let y = 0; y < o.height; y++) {
    filtered[y * (stride + 1)] = 0;
    filtered.set(o.rows.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  ihdr[3] = o.width & 0xff; ihdr[2] = (o.width >>> 8) & 0xff;
  ihdr[7] = o.height & 0xff; ihdr[6] = (o.height >>> 8) & 0xff;
  ihdr[8] = o.bitDepth; ihdr[9] = o.colorType; ihdr[12] = o.interlace ?? 0;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr)];
  if (o.plte) parts.push(pngChunk("PLTE", o.plte));
  if (o.trns) parts.push(pngChunk("tRNS", o.trns));
  parts.push(pngChunk("IDAT", await deflate(filtered)), pngChunk("IEND", new Uint8Array(0)));
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// T1 PNG round trip

Deno.test("T1 png round trip on all 6 fixtures: identical pixels, size <= 1.6 x the file", async () => {
  for (const cid of CIDS) {
    for (const kind of ["parent", "sunburst"]) {
      const bytes = await readFixture(cid + "_" + kind + "_crop.png");
      const a = await decodePng(bytes);
      const enc = await encodePng(a, { ancillary: a.ancillary });
      const b = await decodePng(enc);
      assertEquals([b.width, b.height, b.hasAlpha], [a.width, a.height, a.hasAlpha], cid + " " + kind + " header");
      assert(sameBytes(a.data, b.data), cid + " " + kind + " pixels differ after re-encode");
      assert(enc.length <= 1.6 * bytes.length, cid + " " + kind + " encoded " + enc.length + " > 1.6 x " + bytes.length);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// T2 codec edge cases

Deno.test("T2 grey 8-bit (type 0) decodes to RGBA", async () => {
  const png = await buildPng({ width: 2, height: 2, bitDepth: 8, colorType: 0, rows: new Uint8Array([0, 128, 255, 64]) });
  const img = await decodePng(png);
  assertEquals([img.width, img.height, img.hasAlpha], [2, 2, false]);
  assertEquals(Array.from(img.data), [0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255, 64, 64, 64, 255]);
});

Deno.test("T2 palette + tRNS (type 3) decodes with per-entry alpha", async () => {
  const png = await buildPng({
    width: 2, height: 1, bitDepth: 8, colorType: 3, rows: new Uint8Array([0, 1]),
    plte: new Uint8Array([255, 0, 0, 0, 0, 255]), trns: new Uint8Array([255, 0]),
  });
  const img = await decodePng(png);
  assertEquals(img.hasAlpha, true);
  assertEquals(Array.from(img.data), [255, 0, 0, 255, 0, 0, 255, 0]);
});

Deno.test("T2 grey + alpha (type 4) decodes", async () => {
  const png = await buildPng({ width: 1, height: 2, bitDepth: 8, colorType: 4, rows: new Uint8Array([10, 200, 250, 5]) });
  const img = await decodePng(png);
  assertEquals(img.hasAlpha, true);
  assertEquals(Array.from(img.data), [10, 10, 10, 200, 250, 250, 250, 5]);
});

Deno.test("T2 16-bit RGB (type 2) is reduced to the high byte", async () => {
  const png = await buildPng({ width: 1, height: 1, bitDepth: 16, colorType: 2, rows: new Uint8Array([0x12, 0x34, 0xab, 0xcd, 0xff, 0x00]) });
  const img = await decodePng(png);
  assertEquals(img.hasAlpha, false);
  assertEquals(Array.from(img.data), [0x12, 0xab, 0xff, 255]);
});

Deno.test("T2 interlaced PNG throws png_interlaced; JPEG magic throws not_png naming jpeg", async () => {
  const png = await buildPng({ width: 1, height: 1, bitDepth: 8, colorType: 2, rows: new Uint8Array([1, 2, 3]), interlace: 1 });
  try {
    await decodePng(png);
    throw new Error("interlaced PNG did not throw");
  } catch (e) {
    assert(e instanceof PngError && e.code === "png_interlaced", "expected png_interlaced, got " + String((e as Error).message));
  }
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assertEquals(sniffImageType(jpeg), "jpeg");
  try {
    await decodePng(jpeg);
    throw new Error("JPEG did not throw");
  } catch (e) {
    assert(e instanceof PngError && e.code === "not_png", "expected not_png");
    assert((e as PngError).message.includes("jpeg"), "message names jpeg: " + (e as PngError).message);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// T3 gate, T4 inside box, T5 shift, T6 colour, T7 resample, T8 seam, T9 overflow, T10 extend, T11 determinism

Deno.test("T3 gate: 0 pixels beyond the ring differ from the parent on every fixture (independent recount)", async () => {
  for (const cid of CIDS) {
    const p = await pair(cid);
    const { image, metrics } = locked(p);
    assertEquals(metrics.beyond_ring_changed_px, 0, cid + " gate");
    assertEquals(metrics.ring_px, RING, cid + " ring");
    const W = p.parent.width, H = p.parent.height, P = p.parent.data, O = image.data;
    let changed = 0, counted = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (chebyshevDist(x, y, p.box) < RING) continue;
        counted++;
        const q = (y * W + x) * 4;
        if (O[q] !== P[q] || O[q + 1] !== P[q + 1] || O[q + 2] !== P[q + 2] || O[q + 3] !== P[q + 3]) changed++;
      }
    }
    assert(counted > 0, cid + " has pixels beyond the ring");
    assertEquals(changed, 0, cid + " independent recount beyond the ring");
    assertEquals(metrics.shift, { ...metrics.shift, dx: 0, dy: 0, applied: false }, cid + " shift is (0, 0)");
  }
});

Deno.test("T3 gate trips when forced: a pixel changed beyond the ring is counted and enforceLockGate throws lock_gate (500)", async () => {
  const p = await pair("b33727a9");
  const out = compositeLocked(p.parent, p.regen, p.box, RING);
  assertEquals(lockGate(p.parent, out, p.box, RING), 0, "the real composite passes");
  assertEquals(enforceLockGate(p.parent, out, p.box, RING), 0);
  const W = p.parent.width;
  // one pixel exactly on the ring edge (dist = RING) and one far away, each changed by a single level
  const edge = { x: p.box.x - RING, y: p.box.y + 10 };
  assertEquals(chebyshevDist(edge.x, edge.y, p.box), RING);
  const forced = { ...out, data: out.data.slice() };
  forced.data[(edge.y * W + edge.x) * 4 + 1] ^= 1;
  forced.data[(5 * W + 5) * 4] ^= 1;
  assertEquals(lockGate(p.parent, forced, p.box, RING), 2, "both forced pixels counted");
  const e = await assertThrowsRegion(() => enforceLockGate(p.parent, forced, p.box, RING), "lock_gate", 500);
  assert(e.message.startsWith("Region composite: 2 pixels beyond the blend ring changed"), e.message);
  // a pixel just inside the ring (dist = RING - 1) is a blend pixel and is not counted
  const inner = { ...out, data: out.data.slice() };
  inner.data[((p.box.y + 10) * W + p.box.x - RING + 1) * 4] ^= 1;
  assertEquals(lockGate(p.parent, inner, p.box, RING), 0);
});

Deno.test("T7 synthetic 512 -> 1024 upscale path: factor 2, gate 0, the altered box survives the round trip", () => {
  const W = 1024, H = 1024;
  const P = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const q = (y * W + x) * 4;
      P[q] = (x >> 2) & 255; P[q + 1] = (y >> 2) & 255; P[q + 2] = 90 + (((x >> 4) + (y >> 4)) & 1) * 60; P[q + 3] = 255;
    }
  }
  const parent: Rgba = { width: W, height: H, data: P, hasAlpha: false };
  const box: Box = { x: 413, y: 287, w: 305, h: 158 };
  const altered = alterBox(parent, box);
  const regen = resampleTo(altered, 512, 512);
  assertEquals([regen.width, regen.height], [512, 512]);
  const { image, metrics } = runComposite(parent, regen, box, { ring_pct: 3, mode: "locked" });
  assertEquals([metrics.resampled, metrics.resample_factor, metrics.ring_px, metrics.beyond_ring_changed_px], ["up", 2, 31, 0]);
  assertEquals(metrics.regen_size, { w: 512, h: 512 });
  assertEquals([metrics.shift.dx, metrics.shift.dy], [0, 0]);
  let err = 0, n = 0;
  insideBox(box, (q) => { for (let c = 0; c < 3; c++) { err += Math.abs(image.data[q + c] - altered.data[q + c]); n++; } }, W);
  assert(err / n < 12, "inside-box MAE " + (err / n).toFixed(2));
  assert(metrics.changed_inside_box_pct > 50, "the alteration is seen inside the box: " + metrics.changed_inside_box_pct + " %");
});

Deno.test("T4 inside the box the output is exactly clamp(round(regen - colour offset))", async () => {
  for (const cid of CIDS) {
    const p = await pair(cid);
    const { image, metrics } = locked(p);
    const off = [metrics.colour_offset.r, metrics.colour_offset.g, metrics.colour_offset.b];
    assertEquals(metrics.shift.dx, 0);
    assertEquals(metrics.shift.dy, 0);
    let bad = 0;
    insideBox(p.box, (q) => {
      for (let c = 0; c < 3; c++) if (image.data[q + c] !== clamp(Math.round(p.regen.data[q + c] - off[c]), 0, 255)) bad++;
      if (image.data[q + 3] !== 255) bad++;
    }, p.parent.width);
    assertEquals(bad, 0, cid + " inside-box bytes");
  }
});

Deno.test("T5 shift: a regen shifted by (3, -2) is detected and undone; (20, 0) is misaligned", async () => {
  for (const cid of CIDS) {
    const p = await pair(cid);
    const altered = alterBox(p.parent, p.box);
    const regen = shiftImage(altered, 3, -2);
    const { image, metrics } = runComposite(p.parent, regen, p.box, { ring_pct: 3, ring_px: RING, mode: "locked" });
    assertEquals([metrics.shift.dx, metrics.shift.dy, metrics.shift.applied, metrics.shift.reliable], [3, -2, true, true], cid + " shift");
    assert(metrics.shift.score < metrics.shift.score0, cid + " aligned score lower");
    assertEquals(metrics.beyond_ring_changed_px, 0, cid + " gate");
    let bad = 0;
    insideBox(p.box, (q) => { for (let c = 0; c < 3; c++) if (image.data[q + c] !== altered.data[q + c]) bad++; }, p.parent.width);
    assertEquals(bad, 0, cid + " inside-box pixels equal the un-shifted alteration");
    const e = await assertThrowsRegion(() => runComposite(p.parent, shiftImage(altered, 20, 0), p.box, { ring_pct: 3, ring_px: RING, mode: "locked" }), "misaligned", 422);
    assertEquals(e.message, "Region composite: the regenerated image moved by more than 16 px - run Fix an area again");
  }
});

Deno.test("T6 colour: a (+6, -4, +10) cast is measured and removed; +30 is clamped to 16", async () => {
  // dace73f3 has the fewest saturated band pixels, so the mean is exact there; the others are within 0.5 (0 / 255 clipping)
  for (const cid of CIDS) {
    const p = await pair(cid);
    const regen = addOffset(alterBox(p.parent, p.box), 6, -4, 10);
    const { metrics } = runComposite(p.parent, regen, p.box, { ring_pct: 3, ring_px: RING, mode: "locked" });
    assertEquals(metrics.colour_offset.reliable, true, cid + " reliable");
    assertClose(metrics.colour_offset.r, 6, 0.5, cid + " r");
    assertClose(metrics.colour_offset.g, -4, 0.5, cid + " g");
    assertClose(metrics.colour_offset.b, 10, 0.5, cid + " b");
    assertEquals(metrics.beyond_ring_changed_px, 0, cid + " gate");
    const big = runComposite(p.parent, addOffset(alterBox(p.parent, p.box), 30, 30, 30), p.box, { ring_pct: 3, ring_px: RING, mode: "locked" });
    assertEquals([big.metrics.colour_offset.r, big.metrics.colour_offset.g, big.metrics.colour_offset.b], [16, 16, 16], cid + " clamp");
    assertEquals(TUNING.colour_cap, 16);
  }
});

Deno.test("T7 resample: a half-size regen is upscaled (factor 2, gate 0, small inside-box error); a wrong aspect is size_mismatch", async () => {
  // measured inside-box mean absolute error vs the full-size Sunburst crop (2026-10-05): 45eadf6a 7.9, dace73f3 10.2,
  // b33727a9 16.1 - its box is fine fur texture that a 2x round trip cannot keep, so that one is bounded at 20
  const bound: Record<Cid, number> = { b33727a9: 20, "45eadf6a": 12, dace73f3: 12 };
  for (const cid of CIDS) {
    const p = await pair(cid);
    const W = p.parent.width & ~1, H = p.parent.height & ~1; // even so the factor is exactly 2
    const parent = cropTo(p.parent, W, H), full = cropTo(p.regen, W, H);
    const small = resampleTo(full, W / 2, H / 2);
    assertEquals([small.width, small.height], [W / 2, H / 2]);
    const { image, metrics } = runComposite(parent, small, p.box, { ring_pct: 3, ring_px: RING, mode: "locked" });
    assertEquals(metrics.resampled, "up", cid + " resampled");
    assertEquals(metrics.resample_factor, 2, cid + " factor");
    assertEquals(metrics.regen_size, { w: W / 2, h: H / 2 }, cid + " regen_size");
    assertEquals(metrics.image_size, { w: W, h: H }, cid + " image_size");
    assertEquals(metrics.beyond_ring_changed_px, 0, cid + " gate");
    let err = 0, n = 0;
    insideBox(p.box, (q) => { for (let c = 0; c < 3; c++) { err += Math.abs(image.data[q + c] - full.data[q + c]); n++; } }, W);
    const mae = err / n;
    assert(mae < bound[cid], cid + " inside-box MAE " + mae.toFixed(2) + " >= " + bound[cid]);
    if (cid !== "b33727a9") assert(mae < 12, cid + " inside-box MAE " + mae.toFixed(2) + " >= 12");
  }
  const p = await pair("b33727a9");
  const square = { width: 300, height: 300, data: new Uint8Array(300 * 300 * 4), hasAlpha: false };
  const e = await assertThrowsRegion(() => runComposite(p.parent, square, p.box, { ring_pct: 3, ring_px: RING, mode: "locked" }), "size_mismatch", 422);
  assertEquals(e.message, "Region composite: the regenerated image has a different shape (300x300 vs 497x350) and is never stretched");
});

Deno.test("T8 seam ratio at the box edge matches the probe (A_mask) within 0.15; <= 1.2 on the in-box edits", async () => {
  for (const cid of CIDS) {
    const p = await pair(cid);
    const { metrics } = locked(p);
    const expected = await probeSeam(cid);
    assertClose(metrics.seam_ratio_box, expected, 0.15, cid + " seam_ratio_box vs probe " + expected);
    if (cid !== "dace73f3") assert(metrics.seam_ratio_box <= 1.2, cid + " seam_ratio_box " + metrics.seam_ratio_box + " > 1.2");
    assertClose(metrics.seam_ratio_ring, 1, 0.15, cid + " seam_ratio_ring");
  }
});

Deno.test("T9 overflow: dace73f3 (bear -> tiger, tail left of the box) detected with a containing rect; b33727a9 not", async () => {
  const d = await pair("dace73f3");
  const { metrics } = locked(d);
  assertEquals(metrics.overflow.detected, true, "dace73f3 detected");
  assert(metrics.overflow.px >= Math.max(TUNING.overflow_min_px, Math.round(TUNING.overflow_min_frac * d.box.w * d.box.h)), "px above the threshold");
  const s = metrics.overflow.suggested_rect;
  assert(s !== null, "suggested_rect present");
  assert(containsBox(s as Box, d.box), "suggested_rect contains the box");
  assert((s as Box).x < d.box.x, "the tail is on the left: suggested x " + (s as Box).x + " < box x " + d.box.x);
  assert(containsBox(maxRectOf(d.box, d.parent.width, d.parent.height), s as Box), "suggested_rect within the 2x window");
  assertEquals(metrics.overflow.sides.left, d.box.x - (s as Box).x, "sides.left");
  assert(metrics.overflow.sides.left > 0, "left side extended");

  const b = await pair("b33727a9");
  const bm = locked(b).metrics;
  assertEquals(bm.overflow.detected, false, "b33727a9 not detected");
  assertEquals(bm.overflow.suggested_rect, null);

  // 45eadf6a (rose -> sunflower): measured 2026-10-05 detected false, px 0 - only determinism is asserted
  const f = await pair("45eadf6a");
  const a1 = locked(f).metrics.overflow, a2 = locked(f).metrics.overflow;
  assertEquals(a1, a2, "45eadf6a overflow deterministic");
  // tuning used for these results (plan ranges: diff 32-64, erode 1-2, min_px 32-160, min_frac 0.002-0.01)
  assertEquals([TUNING.diff_overflow, TUNING.erode_radius, TUNING.overflow_min_px, TUNING.overflow_min_frac], [40, 1, 48, 0.004]);
  assertEquals(metrics.tuning, TUNING, "tuning copied into metrics");
});

Deno.test("T10 extend: re-compositing dace73f3 over the suggested rect gates 0 on the new ring and removes the overflow", async () => {
  const d = await pair("dace73f3");
  const first = locked(d).metrics;
  const rect = first.overflow.suggested_rect as Box;
  const { image, metrics } = locked(d, rect, "extend");
  assertEquals(metrics.mode, "extend");
  assertEquals(metrics.rect, rect, "the new rect is the box");
  assertEquals(metrics.beyond_ring_changed_px, 0, "gate on the new ring");
  const W = d.parent.width, H = d.parent.height;
  let changed = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (chebyshevDist(x, y, rect) < RING) continue;
      const q = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) if (image.data[q + c] !== d.parent.data[q + c]) { changed++; break; }
    }
  }
  assertEquals(changed, 0, "independent recount on the new ring");
  assert(metrics.overflow.px < first.overflow.px, "overflow px " + metrics.overflow.px + " < " + first.overflow.px);
});

Deno.test("T11 determinism: the same inputs give identical encoded bytes", async () => {
  const p = await pair("b33727a9");
  const a = await encodePng(locked(p).image, { ancillary: p.parent.ancillary });
  const b = await encodePng(locked(p).image, { ancillary: p.parent.ancillary });
  assert(sameBytes(a, b), "encoded bytes differ between runs");
  const strip = (m: ReturnType<typeof locked>["metrics"]) => ({ ...m, timing_ms: null }); // wall-clock timing is the only non-deterministic key
  assertEquals(strip(locked(p).metrics), strip(locked(p).metrics), "metrics identical");
});

// ---------------------------------------------------------------------------------------------------------------
// T12 performance guard

Deno.test("T12 performance: 2048x2048 parent + 1024x1024 regen composite and encode under 6000 ms", async () => {
  const W = 2048, H = 2048;
  const P = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const q = (y * W + x) * 4;
      const s = ((x >> 5) + (y >> 5)) & 1 ? 40 : 0;
      P[q] = (x * 255 / W) | 0; P[q + 1] = (y * 255 / H) | 0; P[q + 2] = 128 + s + ((x * 7 + y * 13) % 23); P[q + 3] = 255;
    }
  }
  const parent: Rgba = { width: W, height: H, data: P, hasAlpha: false };
  const box: Box = { x: 800, y: 900, w: 400, h: 300 };
  const regen = resampleTo(alterBox(parent, box), 1024, 1024);
  const t0 = Date.now();
  const { image, metrics } = runComposite(parent, regen, box, { ring_pct: 3, mode: "locked" });
  const t1 = Date.now();
  const bytes = await encodePng(image, {});
  const t2 = Date.now();
  console.log("       T12 timing: composite " + (t1 - t0) + " ms, encode " + (t2 - t1) + " ms, " + bytes.length + " bytes");
  assert(t2 - t0 < 6000, "took " + (t2 - t0) + " ms");
  assertEquals(metrics.ring_px, ringPx(W, 3));
  assertEquals(metrics.ring_px, 61);
  assertEquals(metrics.resampled, "up");
  assertEquals(metrics.resample_factor, 2);
  assertEquals(metrics.beyond_ring_changed_px, 0);
  assertEquals([metrics.shift.dx, metrics.shift.dy], [0, 0]);
});

// ---------------------------------------------------------------------------------------------------------------
// T13 handler with a mocked fetch

const G = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PARENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CHILD = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-05T12:00:00.000Z");
const SECRET = "good-secret";
const JWT = "Bearer staff-jwt";
const MASK = { x: 96, y: 96, w: 305, h: 158, width: 497, height: 350 };

type Call = { method: string; url: string; headers: Record<string, string>; body: string | Uint8Array | null };
type Env = {
  gen?: Record<string, unknown> | null;
  parent?: Record<string, unknown> | null;
  settings?: Record<string, unknown>;
  parentBytes?: Uint8Array;
  rawBytes?: Uint8Array;
  rpcError?: { status: number; body: unknown };
};

function headersOf(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (h instanceof Headers) h.forEach((v, k) => { out[k.toLowerCase()] = v; });
  else if (Array.isArray(h)) for (const [k, v] of h) out[k.toLowerCase()] = v;
  else for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}
const jsonRes = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function mockEnv(env: Env = {}) {
  const b = await pair("b33727a9");
  const gen = env.gen === undefined
    ? { id: G, card_id: CARD, kind: "edit_region", status: "done", parent_generation_id: PARENT, mask_rect: MASK, mask_path: CARD + "/" + G + ".mask.png", raw_image_path: CARD + "/" + G + ".raw.png", image_path: null, composite_mode: null, region_metrics: null }
    : env.gen;
  const parent = env.parent === undefined ? { id: PARENT, image_path: CARD + "/" + PARENT + ".png" } : env.parent;
  const parentBytes = env.parentBytes ?? b.parentBytes, rawBytes = env.rawBytes ?? b.regenBytes;
  const calls: Call[] = [];
  const uploads: { path: string; upsert: string; bytes: Uint8Array }[] = [];
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = headersOf(init?.headers);
    const body = init?.body;
    calls.push({ method, url, headers, body: body instanceof Uint8Array ? body : typeof body === "string" ? body : null });
    assertEquals(headers.apikey, "sb_publishable_shDVoGzgpaS2L9OTmzyRGA_JOx52p0I", "every call carries the publishable apikey");
    const path = url.replace(SB_URL, "");
    if (path === "/rest/v1/rpc/studio_secret_ok") return jsonRes(200, headers["x-studio-secret"] === SECRET);
    if (path === "/rest/v1/rpc/is_staff") return jsonRes(200, headers.authorization === JWT);
    if (method === "GET" && path.startsWith("/rest/v1/generations?id=eq." + G + "&")) return jsonRes(200, gen ? [gen] : []);
    if (method === "GET" && path.startsWith("/rest/v1/generations?id=eq." + PARENT + "&")) return jsonRes(200, parent ? [parent] : []);
    if (method === "GET" && path.startsWith("/rest/v1/settings?")) return jsonRes(200, [env.settings ?? { id: 1, region_ring_pct: 3 }]);
    if (method === "POST" && path.startsWith("/storage/v1/object/sign/gens/")) {
      const p = path.slice("/storage/v1/object/sign/gens/".length);
      assertEquals(body, JSON.stringify({ expiresIn: 600 }), "sign body");
      return jsonRes(200, { signedURL: "/object/sign/gens/" + p + "?token=t0k3n" });
    }
    if (method === "GET" && path.startsWith("/storage/v1/object/sign/gens/")) {
      const p = path.slice("/storage/v1/object/sign/gens/".length).split("?")[0];
      const bytes = p.endsWith(".raw.png") ? rawBytes : parentBytes;
      return new Response(bytes as unknown as BodyInit, { status: 200, headers: { "content-type": "image/png" } });
    }
    if (method === "POST" && path.startsWith("/storage/v1/object/gens/")) {
      const p = path.slice("/storage/v1/object/gens/".length);
      uploads.push({ path: p, upsert: headers["x-upsert"], bytes: body as Uint8Array });
      return jsonRes(200, { Key: "gens/" + p });
    }
    if (method === "PATCH" && path.startsWith("/rest/v1/generations?id=eq." + G)) return new Response(null, { status: 204 });
    if (method === "POST" && path === "/rest/v1/rpc/region_child") {
      if (env.rpcError) return jsonRes(env.rpcError.status, env.rpcError.body);
      const args = JSON.parse(String(body)) as Record<string, unknown>;
      return jsonRes(200, { id: args.p_child_id, card_id: CARD, kind: "edit_region", status: "done", composite_mode: args.p_mode, image_path: args.p_image_path, mask_rect: args.p_mask_rect, region_metrics: args.p_region_metrics, drift_pct: args.p_drift_pct, raw_image_path: gen?.raw_image_path ?? null });
    }
    return jsonRes(404, { message: "unmocked " + method + " " + path });
  };
  return { calls, uploads, fetch };
}

function request(body: unknown, headers: Record<string, string>, method = "POST"): Request {
  return new Request("https://edge.local/functions/v1/region-composite", { method, headers: { "content-type": "application/json", ...headers }, body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined });
}
const run = (req: Request, env: Awaited<ReturnType<typeof mockEnv>>) => handler(req, { fetch: env.fetch, now: () => NOW, uuid: () => CHILD });
const route = (c: Call): string => c.method + " " + c.url.replace(SB_URL, "");
function assertErrorBody(body: Record<string, unknown>, code: string): void {
  assertEquals(Object.keys(body).sort(), ["code", "message", "ok"], "error body keys");
  assertEquals(body.ok, false);
  assertEquals(body.code, code);
  const m = String(body.message);
  assert(m.startsWith("Region composite: "), "message starts with the prefix: " + m);
  assert(!m.includes('"') && !m.includes("\\"), "message has no double quote or backslash: " + m);
}
function assertCors(res: Response): void {
  for (const [k, v] of Object.entries(CORS_HEADERS)) assertEquals(res.headers.get(k), v, "CORS header " + k);
}

Deno.test("T13 no auth -> 401 without any upstream call; wrong secret / non-staff JWT -> 401", async () => {
  const env = await mockEnv();
  const r1 = await run(request({ generation_id: G, mode: "locked" }, {}), env);
  assertEquals(r1.status, 401);
  assertCors(r1);
  assertErrorBody(await r1.json(), "unauthorized");
  assertEquals(env.calls.length, 0, "no upstream call without auth headers");
  const r2 = await run(request({ generation_id: G, mode: "locked" }, { "x-studio-secret": "wrong" }), env);
  assertEquals(r2.status, 401);
  assertErrorBody(await r2.json(), "unauthorized");
  assertEquals(env.calls.map(route), ["POST /rest/v1/rpc/studio_secret_ok"]);
  const r3 = await run(request({ generation_id: G, mode: "extend" }, { authorization: "Bearer not-staff" }), env);
  assertEquals(r3.status, 401);
  assertEquals(env.calls.map(route).at(-1), "POST /rest/v1/rpc/is_staff");
});

Deno.test("T13 locked with a staff JWT -> 403 forbidden_mode; OPTIONS -> 204 + CORS; GET -> 405; bad body -> 400", async () => {
  const env = await mockEnv();
  const r = await run(request({ generation_id: G, mode: "locked" }, { authorization: JWT }), env);
  assertEquals(r.status, 403);
  const body = await r.json();
  assertErrorBody(body, "forbidden_mode");
  assertEquals(body.message, "Region composite: locked mode is run by the worker");
  assertEquals(env.calls.map(route), ["POST /rest/v1/rpc/is_staff"], "nothing after the auth check");

  const o = await run(request(null, { origin: "https://dm-studio.example", "access-control-request-method": "POST" }, "OPTIONS"), env);
  assertEquals(o.status, 204);
  assertCors(o);
  assert(o.headers.get("access-control-allow-headers")?.includes("x-studio-secret"), "x-studio-secret allowed");

  const g = await run(request(null, { "x-studio-secret": SECRET }, "GET"), env);
  assertEquals(g.status, 405);
  assertCors(g);

  const badJson = await run(request("{not json", { "x-studio-secret": SECRET }), env);
  assertEquals(badJson.status, 400);
  assertErrorBody(await badJson.json(), "bad_request");
  const badUuid = await run(request({ generation_id: "nope", mode: "locked" }, { "x-studio-secret": SECRET }), env);
  assertEquals(badUuid.status, 400);
  const badMode = await run(request({ generation_id: G, mode: "merge" }, { "x-studio-secret": SECRET }), env);
  assertEquals(badMode.status, 400);
  assertErrorBody(await badMode.json(), "bad_request");
  const badRect = await run(request({ generation_id: G, mode: "extend", rect_override: { x: 1 } }, { authorization: JWT }), env);
  assertEquals(badRect.status, 400);
});

Deno.test("T13 locked with the secret: calls in the B4 order, upsert upload, PATCH with exactly 4 keys, 200 body", async () => {
  const env = await mockEnv();
  const r = await run(request({ generation_id: G, mode: "locked" }, { "x-studio-secret": SECRET }), env);
  const body = await r.json();
  assertEquals(r.status, 200, JSON.stringify(body));
  assertCors(r);
  const parentPath = CARD + "/" + PARENT + ".png", rawPath = CARD + "/" + G + ".raw.png", imagePath = CARD + "/" + G + ".png";
  assertEquals(env.calls.map(route), [
    "POST /rest/v1/rpc/studio_secret_ok",
    "GET /rest/v1/generations?id=eq." + G + "&select=" + GEN_SELECT,
    "GET /rest/v1/generations?id=eq." + PARENT + "&select=id,image_path",
    "GET /rest/v1/settings?id=eq.1&select=*",
    "POST /storage/v1/object/sign/gens/" + parentPath,
    "GET /storage/v1/object/sign/gens/" + parentPath + "?token=t0k3n",
    "POST /storage/v1/object/sign/gens/" + rawPath,
    "GET /storage/v1/object/sign/gens/" + rawPath + "?token=t0k3n",
    "POST /storage/v1/object/gens/" + imagePath,
    "PATCH /rest/v1/generations?id=eq." + G,
  ]);
  for (const c of env.calls) assertEquals(c.headers["x-studio-secret"], SECRET, "secret forwarded on " + route(c));
  assertEquals(env.uploads.length, 1);
  assertEquals(env.uploads[0].path, imagePath);
  assertEquals(env.uploads[0].upsert, "true");
  assertEquals(env.calls[8].headers["content-type"], "image/png");
  assertEquals(sniffImageType(env.uploads[0].bytes), "png");
  const patch = env.calls[9];
  assertEquals(patch.headers.prefer, "return=minimal");
  const pb = JSON.parse(String(patch.body)) as Record<string, unknown>;
  assertEquals(Object.keys(pb), ["image_path", "composite_mode", "region_metrics", "drift_pct"], "PATCH keys");
  assertEquals(pb.image_path, imagePath);
  assertEquals(pb.composite_mode, "locked");
  assertEquals(pb.drift_pct, 0);
  const m = pb.region_metrics as Record<string, unknown>;
  assertEquals([m.version, m.mode, m.source_generation_id, m.rect_scaled, m.beyond_ring_changed_px, m.computed_at], [1, "locked", null, false, 0, NOW.toISOString()]);
  assertEquals(m.rect, { x: 96, y: 96, w: 305, h: 158 });
  assertEquals(m.ring_pct, 3);
  assertEquals(m.ring_px, ringPx(497, 3)); // = 15 on the 497 px crop
  assertEquals(Object.keys(m.timing_ms as object), ["download", "decode", "composite", "encode", "total"]);
  assertEquals(body.ok, true);
  assertEquals(body.mode, "locked");
  assertEquals(body.generation_id, G);
  assertEquals(body.image_path, imagePath);
  assertEquals(JSON.stringify(body.metrics), JSON.stringify(m), "response metrics = stored metrics");
  // the uploaded PNG is the composite: identical to the parent beyond the ring
  const out = await decodePng(env.uploads[0].bytes);
  const b = await pair("b33727a9");
  let changed = 0;
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    if (chebyshevDist(x, y, b.box) < (m.ring_px as number)) continue;
    const q = (y * out.width + x) * 4;
    for (let c = 0; c < 4; c++) if (out.data[q + c] !== b.parent.data[q + c]) { changed++; break; }
  }
  assertEquals(changed, 0, "uploaded composite untouched beyond the ring");
});

Deno.test("T13 locked: a mask_rect drawn at another size is scaled to the parent (rect_scaled true); ring_pct from settings is clamped", async () => {
  const env = await mockEnv({
    gen: { id: G, card_id: CARD, kind: "edit_region", status: "working", parent_generation_id: PARENT, mask_rect: { x: 192, y: 192, w: 610, h: 316, width: 994, height: 700 }, mask_path: null, raw_image_path: CARD + "/" + G + ".raw.png", image_path: null, composite_mode: null, region_metrics: null },
    settings: { id: 1, region_ring_pct: 25 },
  });
  const r = await run(request({ generation_id: G, mode: "locked" }, { "x-studio-secret": SECRET }), env);
  const body = await r.json();
  assertEquals(r.status, 200, JSON.stringify(body));
  assertEquals(body.metrics.rect, { x: 96, y: 96, w: 305, h: 158 });
  assertEquals(body.metrics.rect_scaled, true);
  assertEquals(body.metrics.ring_pct, 10);
  assertEquals(body.metrics.ring_px, ringPx(497, 10));
});

Deno.test("T13 locked: row errors -> 404 not_found, 422 not_region_edit / no_mask_rect / no_raw / no_parent; storage -> 502; non-PNG raw -> 422 not_png", async () => {
  const secret = { "x-studio-secret": SECRET };
  const r404 = await run(request({ generation_id: G, mode: "locked" }, secret), await mockEnv({ gen: null }));
  assertEquals(r404.status, 404);
  assertErrorBody(await r404.json(), "not_found");
  const base = { id: G, card_id: CARD, kind: "edit_region", status: "working", parent_generation_id: PARENT, mask_rect: MASK, mask_path: null, raw_image_path: CARD + "/" + G + ".raw.png", image_path: null, composite_mode: null, region_metrics: null };
  const cases: [Record<string, unknown>, string][] = [
    [{ ...base, kind: "edit_text" }, "not_region_edit"],
    [{ ...base, mask_rect: { x: 1, y: 2 } }, "no_mask_rect"],
    [{ ...base, mask_rect: "96,96,305,158" }, "no_mask_rect"],
    [{ ...base, raw_image_path: null }, "no_raw"],
    [{ ...base, parent_generation_id: null }, "no_parent"],
  ];
  for (const [gen, code] of cases) {
    const r = await run(request({ generation_id: G, mode: "locked" }, secret), await mockEnv({ gen }));
    assertEquals(r.status, 422, code);
    assertErrorBody(await r.json(), code);
  }
  const noImg = await run(request({ generation_id: G, mode: "locked" }, secret), await mockEnv({ parent: { id: PARENT, image_path: null } }));
  assertEquals(noImg.status, 422);
  assertErrorBody(await noImg.json(), "no_parent");

  // storage error on the sign call
  const env = await mockEnv();
  const inner = env.fetch;
  env.fetch = async (url, init) => (init?.method === "POST" && url.includes("/storage/v1/object/sign/")) ? jsonRes(400, { message: "Object not found" }) : inner(url, init);
  const s = await run(request({ generation_id: G, mode: "locked" }, secret), env);
  assertEquals(s.status, 502);
  assertErrorBody(await s.json(), "storage");

  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const j = await run(request({ generation_id: G, mode: "locked" }, secret), await mockEnv({ rawBytes: jpeg }));
  assertEquals(j.status, 422);
  const jb = await j.json();
  assertErrorBody(jb, "not_png");
  assertEquals(jb.message, "Region composite: the regenerated image is jpeg, not PNG");
});

Deno.test("T13 extend with a staff JWT: new child upload (no upsert) then rpc region_child with exactly the B6 args", async () => {
  const d = await pair("dace73f3");
  const first = locked(d).metrics;
  const suggested = first.overflow.suggested_rect as Box;
  const dMask = { x: d.box.x, y: d.box.y, w: d.box.w, h: d.box.h, width: d.parent.width, height: d.parent.height };
  const gen = { id: G, card_id: CARD, kind: "edit_region", status: "done", parent_generation_id: PARENT, mask_rect: dMask, mask_path: null, raw_image_path: CARD + "/" + G + ".raw.png", image_path: CARD + "/" + G + ".png", composite_mode: "locked", region_metrics: first };
  const env = await mockEnv({ gen, parentBytes: d.parentBytes, rawBytes: d.regenBytes });
  const r = await run(request({ generation_id: G, mode: "extend" }, { authorization: JWT }), env);
  const body = await r.json();
  assertEquals(r.status, 200, JSON.stringify(body));
  const imagePath = CARD + "/" + CHILD + ".png";
  assertEquals(env.calls.map(route).slice(0, 4), [
    "POST /rest/v1/rpc/is_staff",
    "GET /rest/v1/generations?id=eq." + G + "&select=" + GEN_SELECT,
    "GET /rest/v1/generations?id=eq." + PARENT + "&select=id,image_path",
    "GET /rest/v1/settings?id=eq.1&select=*",
  ]);
  for (const c of env.calls) {
    assertEquals(c.headers.authorization, JWT, "JWT forwarded on " + route(c));
    assertEquals(c.headers["x-studio-secret"], undefined, "no secret invented on " + route(c));
  }
  assertEquals(env.uploads.length, 1);
  assertEquals(env.uploads[0].path, imagePath);
  assertEquals(env.uploads[0].upsert, "false");
  const rpc = env.calls.find((c) => c.url.endsWith("/rest/v1/rpc/region_child"));
  assert(rpc, "rpc region_child called");
  assertEquals(route(env.calls.at(-1) as Call), "POST /rest/v1/rpc/region_child", "the RPC is the last call, after the upload");
  assertEquals((rpc as Call).headers.accept, "application/vnd.pgrst.object+json");
  const args = JSON.parse(String((rpc as Call).body)) as Record<string, unknown>;
  assertEquals(Object.keys(args), ["p_source_generation_id", "p_child_id", "p_mode", "p_mask_rect", "p_image_path", "p_region_metrics", "p_drift_pct"], "B6 args");
  assertEquals([args.p_source_generation_id, args.p_child_id, args.p_mode, args.p_image_path, args.p_drift_pct], [G, CHILD, "extend", imagePath, 0]);
  assertEquals(args.p_mask_rect, { x: suggested.x, y: suggested.y, w: suggested.w, h: suggested.h, width: d.parent.width, height: d.parent.height });
  const m = args.p_region_metrics as Record<string, unknown>;
  assertEquals([m.mode, m.source_generation_id, m.rect_scaled, m.beyond_ring_changed_px, m.computed_at], ["extend", G, false, 0, NOW.toISOString()]);
  assertEquals(m.rect, suggested);
  assert((m.overflow as { px: number }).px < first.overflow.px, "overflow shrank");
  assertEquals([body.ok, body.mode, body.generation_id, body.source_generation_id, body.image_path], [true, "extend", CHILD, G, imagePath]);
  assertEquals(body.generation.id, CHILD);
  assertEquals(body.generation.composite_mode, "extend");
  assertEquals(JSON.stringify(body.metrics), JSON.stringify(m));

  // rect_override wins over the suggested rect and must contain the box; a rect that does not is rect_invalid
  const env2 = await mockEnv({ gen, parentBytes: d.parentBytes, rawBytes: d.regenBytes });
  const over = { x: d.box.x - 20, y: d.box.y - 10, w: d.box.w + 40, h: d.box.h + 20 };
  const r2 = await run(request({ generation_id: G, mode: "extend", rect_override: over }, { authorization: JWT }), env2);
  const b2 = await r2.json();
  assertEquals(r2.status, 200, JSON.stringify(b2));
  assertEquals(b2.metrics.rect, over);
  const env3 = await mockEnv({ gen, parentBytes: d.parentBytes, rawBytes: d.regenBytes });
  const r3 = await run(request({ generation_id: G, mode: "extend", rect_override: { x: d.box.x + 10, y: d.box.y, w: d.box.w, h: d.box.h } }, { authorization: JWT }), env3);
  assertEquals(r3.status, 422);
  const b3 = await r3.json();
  assertErrorBody(b3, "rect_invalid");
  assertEquals(b3.message, "Region composite: the extended area must contain the original area");
  assertEquals(env3.uploads.length, 0, "nothing uploaded on rect_invalid");
  // no suggested rect and no override
  const env4 = await mockEnv({ gen: { ...gen, region_metrics: { ...first, overflow: { ...first.overflow, suggested_rect: null } } }, parentBytes: d.parentBytes, rawBytes: d.regenBytes });
  const r4 = await run(request({ generation_id: G, mode: "extend" }, { authorization: JWT }), env4);
  assertEquals(r4.status, 422);
  assertErrorBody(await r4.json(), "no_overflow_rect");
  // the source must be done
  const env5 = await mockEnv({ gen: { ...gen, status: "working" }, parentBytes: d.parentBytes, rawBytes: d.regenBytes });
  const r5 = await run(request({ generation_id: G, mode: "extend" }, { authorization: JWT }), env5);
  assertEquals(r5.status, 422);
  assertErrorBody(await r5.json(), "not_done");
});

Deno.test("T13 full: never downloads the parent, re-uploads the raw bytes unchanged, RPC with the source mask_rect and drift", async () => {
  const b = await pair("b33727a9");
  const first = locked(b).metrics;
  const gen = { id: G, card_id: CARD, kind: "edit_region", status: "done", parent_generation_id: PARENT, mask_rect: MASK, mask_path: CARD + "/" + G + ".mask.png", raw_image_path: CARD + "/" + G + ".raw.png", image_path: CARD + "/" + G + ".png", composite_mode: "locked", region_metrics: first };
  const env = await mockEnv({ gen });
  const r = await run(request({ generation_id: G, mode: "full" }, { authorization: JWT }), env);
  const body = await r.json();
  assertEquals(r.status, 200, JSON.stringify(body));
  const rawPath = CARD + "/" + G + ".raw.png", imagePath = CARD + "/" + CHILD + ".png";
  assertEquals(env.calls.map(route), [
    "POST /rest/v1/rpc/is_staff",
    "GET /rest/v1/generations?id=eq." + G + "&select=" + GEN_SELECT,
    "POST /storage/v1/object/sign/gens/" + rawPath,
    "GET /storage/v1/object/sign/gens/" + rawPath + "?token=t0k3n",
    "POST /storage/v1/object/gens/" + imagePath,
    "POST /rest/v1/rpc/region_child",
  ]);
  assert(!env.calls.some((c) => c.url.includes(PARENT)), "the parent row and image are never touched");
  assertEquals(env.uploads[0].upsert, "false");
  assert(sameBytes(env.uploads[0].bytes, b.regenBytes), "raw bytes uploaded unchanged");
  const args = JSON.parse(String((env.calls.at(-1) as Call).body)) as Record<string, unknown>;
  assertEquals(Object.keys(args), ["p_source_generation_id", "p_child_id", "p_mode", "p_mask_rect", "p_image_path", "p_region_metrics", "p_drift_pct"]);
  assertEquals([args.p_mode, args.p_child_id, args.p_image_path], ["full", CHILD, imagePath]);
  assertEquals(args.p_mask_rect, MASK, "the source mask_rect as stored");
  assertEquals(args.p_drift_pct, first.drift_outside_pct_gt8);
  const m = args.p_region_metrics as Record<string, unknown>;
  assertEquals([m.version, m.mode, m.source_generation_id, m.computed_at], [1, "full", G, NOW.toISOString()]);
  assertEquals(m.drift_outside_pct_gt8, first.drift_outside_pct_gt8);
  assertEquals(m.beyond_ring_changed_px, first.beyond_ring_changed_px, "the source measurements are carried over");
  assertEquals([body.ok, body.mode, body.generation_id, body.source_generation_id, body.image_path], [true, "full", CHILD, G, imagePath]);

  // a non-PNG raw is refused before anything is uploaded
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
  const env2 = await mockEnv({ gen, rawBytes: jpeg });
  const r2 = await run(request({ generation_id: G, mode: "full" }, { authorization: JWT }), env2);
  assertEquals(r2.status, 422);
  assertErrorBody(await r2.json(), "not_png");
  assertEquals(env2.uploads.length, 0);
  // a source without stored metrics still works (drift null)
  const env3 = await mockEnv({ gen: { ...gen, region_metrics: null } });
  const r3 = await run(request({ generation_id: G, mode: "full" }, { "x-studio-secret": SECRET }), env3);
  assertEquals(r3.status, 200);
  const a3 = JSON.parse(String((env3.calls.at(-1) as Call).body)) as Record<string, unknown>;
  assertEquals(a3.p_drift_pct, null);
  assertEquals((a3.p_region_metrics as Record<string, unknown>).version, 1);
});

Deno.test("T13 rpc errors: 'card must be in needs_review' -> 409 card_not_in_review; others -> 422 rpc with quotes stripped", async () => {
  const b = await pair("b33727a9");
  const gen = { id: G, card_id: CARD, kind: "edit_region", status: "done", parent_generation_id: PARENT, mask_rect: MASK, mask_path: null, raw_image_path: CARD + "/" + G + ".raw.png", image_path: CARD + "/" + G + ".png", composite_mode: "locked", region_metrics: locked(b).metrics };
  const e1 = await mockEnv({ gen, rpcError: { status: 400, body: { code: "P0001", message: "card must be in needs_review (is accepted)", details: null, hint: null } } });
  const r1 = await run(request({ generation_id: G, mode: "full" }, { authorization: JWT }), e1);
  assertEquals(r1.status, 409);
  const b1 = await r1.json();
  assertErrorBody(b1, "card_not_in_review");
  assertEquals(b1.message, "Region composite: card must be in needs_review (is accepted)");
  const e2 = await mockEnv({ gen, rpcError: { status: 400, body: { code: "P0001", message: 'image "' + CARD + "/" + CHILD + '.png" was not uploaded \\ retry', details: null, hint: null } } });
  const r2 = await run(request({ generation_id: G, mode: "full" }, { authorization: JWT }), e2);
  assertEquals(r2.status, 422);
  const b2 = await r2.json();
  assertErrorBody(b2, "rpc");
  assert(b2.message.includes("was not uploaded"), b2.message);
  assert(b2.message.includes("(HTTP 400)"), b2.message);
  const e3 = await mockEnv({ gen, rpcError: { status: 403, body: { code: "42501", message: "not allowed" } } });
  const r3 = await run(request({ generation_id: G, mode: "full" }, { authorization: JWT }), e3);
  assertEquals(r3.status, 422);
  assertErrorBody(await r3.json(), "rpc");
});

Deno.test("T13 network failures never echo the URL: sign / download / upload -> 502 storage naming only the path; REST read / PATCH -> 500 internal; rpc -> 422 rpc", async () => {
  const secret = { "x-studio-secret": SECRET };
  const parentPath = CARD + "/" + PARENT + ".png", imagePath = CARD + "/" + G + ".png", childPath = CARD + "/" + CHILD + ".png";
  // Deno's fetch rejects with the whole URL in its message - for a signed storage URL that includes ?token=<jwt>
  const reject = (url: string) => Promise.reject(new TypeError("error sending request for url (" + url + "): client error (Connect)"));
  const failing = async (match: (method: string, url: string) => boolean) => {
    const env = await mockEnv();
    const inner = env.fetch;
    env.fetch = (url, init) => (match((init?.method ?? "GET").toUpperCase(), url) ? reject(url) : inner(url, init));
    return env;
  };
  type Case = [string, (m: string, u: string) => boolean, number, string, string];
  const locked: Case[] = [
    ["sign", (m, u) => m === "POST" && u.endsWith("/storage/v1/object/sign/gens/" + parentPath), 502, "storage", "Region composite: signing gens/" + parentPath + " failed (network)"],
    ["download", (m, u) => m === "GET" && u.includes("/storage/v1/object/sign/gens/" + parentPath + "?token="), 502, "storage", "Region composite: download of gens/" + parentPath + " failed (network)"],
    ["upload", (m, u) => m === "POST" && u.endsWith("/storage/v1/object/gens/" + imagePath), 502, "storage", "Region composite: upload of gens/" + imagePath + " failed (network)"],
    ["rest read", (m, u) => m === "GET" && u.includes("/rest/v1/generations?id=eq." + G), 500, "internal", "Region composite: database read failed (network)"],
    ["patch", (m, u) => m === "PATCH" && u.includes("/rest/v1/generations?id=eq." + G), 500, "internal", "Region composite: saving the result failed (network)"],
  ];
  for (const [name, match, status, code, message] of locked) {
    const env = await failing(match);
    const r = await run(request({ generation_id: G, mode: "locked" }, secret), env);
    const text = await r.text();
    assertEquals(r.status, status, name + ": " + text);
    const body = JSON.parse(text) as Record<string, unknown>;
    assertErrorBody(body, code);
    assertEquals(body.message, message, name);
    assert(!text.includes("token=") && !text.includes("t0k3n") && !text.includes("/storage/v1/object/sign/") && !text.includes(SB_URL), name + ": the body never carries a URL: " + text);
  }
  // extend with a staff JWT: the child upload and the RPC
  const up = await failing((m, u) => m === "POST" && u.endsWith("/storage/v1/object/gens/" + childPath));
  const r1 = await run(request({ generation_id: G, mode: "extend", rect_override: { x: 80, y: 80, w: 330, h: 190 } }, { authorization: JWT }), up);
  const t1 = await r1.text();
  assertEquals(r1.status, 502, t1);
  assertEquals((JSON.parse(t1) as Record<string, unknown>).message, "Region composite: upload of gens/" + childPath + " failed (network)");
  const rpc = await failing((m, u) => m === "POST" && u.endsWith("/rest/v1/rpc/region_child"));
  const r2 = await run(request({ generation_id: G, mode: "extend", rect_override: { x: 80, y: 80, w: 330, h: 190 } }, { authorization: JWT }), rpc);
  const t2 = await r2.text();
  assertEquals(r2.status, 422, t2);
  const b2 = JSON.parse(t2) as Record<string, unknown>;
  assertErrorBody(b2, "rpc");
  assert(String(b2.message).startsWith("Region composite: rpc region_child failed (network)"), t2);
  assert(!t2.includes(SB_URL), "no URL in the rpc failure: " + t2);
});

Deno.test("T13 an unexpected error never leaks a signed-URL token or a JWT: scrubSecrets / cleanMessage redact them and the generic 500 body is clean", async () => {
  const rawPath = CARD + "/" + G + ".raw.png";
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJnZW5zL3gifQ.abcDEF-ghi_JKL";
  const signed = SB_URL + "/storage/v1/object/sign/gens/" + rawPath + "?token=" + jwt;
  assertEquals(scrubSecrets("error sending request for url (" + signed + "): timeout"), "error sending request for url (" + SB_URL + "/storage/v1/object/sign/gens/" + rawPath + "?token=redacted): timeout");
  assertEquals(scrubSecrets("x?token=abc.def&y=1 then " + jwt + " end"), "x?token=redacted&y=1 then redacted end");
  assertEquals(scrubSecrets("Bearer " + jwt), "Bearer redacted");
  assertEquals(scrubSecrets("a token=t0k3n) b"), "a token=redacted) b");
  assertEquals(scrubSecrets("eyJ short and tokens= bare and access_token=abc123&next=1 end"), "eyJ short and tokens= bare and access_token=redacted&next=1 end", "a bare eyJ or an empty token= is left alone; any *token=<value> loses its value");
  assertEquals(cleanMessage("could not read " + signed), "Region composite: could not read " + SB_URL + "/storage/v1/object/sign/gens/" + rawPath + "?token=redacted");
  assertEquals(cleanMessage('a "quoted" \\ path'), "Region composite: a quoted path");
  assertEquals(cleanMessage("Region composite: already prefixed"), "Region composite: already prefixed");
  // the generic catch: an unexpected error raised inside the run quotes a signed URL
  const env = await mockEnv();
  const boom = () => { throw new Error("clock failed while fetching " + signed); };
  const r = await handler(request({ generation_id: G, mode: "locked" }, { "x-studio-secret": SECRET }), { fetch: env.fetch, now: boom, uuid: () => CHILD });
  const text = await r.text();
  assertEquals(r.status, 500, text);
  const body = JSON.parse(text) as Record<string, unknown>;
  assertErrorBody(body, "internal");
  assert(text.includes("token=redacted") && !text.includes("eyJ"), "token scrubbed in the generic 500: " + text);
});
