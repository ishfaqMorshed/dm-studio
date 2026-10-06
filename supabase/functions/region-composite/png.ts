// DM Studio · region-composite · minimal pure-TS PNG codec (no npm, no jsr; runs in Deno and in the Node test shim).
// Decode: colour types 0, 2, 3 (PLTE + tRNS), 4, 6; bit depths 1/2/4 (grey and palette), 8, and 16 (reduced to the
// high byte); non-interlaced only; filters 0-4; any number of IDAT chunks. Output is always RGBA8 plus hasAlpha
// (colour type 4 or 6, or a tRNS chunk). CRC is checked on IHDR only. The colour-interpretation chunks sRGB, gAMA,
// cHRM, iCCP and pHYs are returned in `ancillary` so the encoder can write them back (the composite keeps the
// parent's colour interpretation).
// Encode: colour type 2 (RGB) when !hasAlpha else 6 (RGBA), 8 bit, one IDAT, row filter Sub on row 0 and Up on every
// other row, zlib via CompressionStream('deflate'). Deterministic for a given runtime.

export class PngError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PngError";
    this.code = code;
  }
}

export type ImageType = "png" | "jpeg" | "webp" | "gif" | "unknown";

export type PngChunk = { type: string; data: Uint8Array };

export type DecodedPng = {
  width: number;
  height: number;
  data: Uint8Array; // RGBA8, row-major
  hasAlpha: boolean;
  ancillary: PngChunk[];
};

export type EncodeInput = { width: number; height: number; data: Uint8Array; hasAlpha: boolean };

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const KEEP_ANCILLARY = new Set(["sRGB", "gAMA", "cHRM", "iCCP", "pHYs"]);

export function sniffImageType(bytes: Uint8Array): ImageType {
  if (bytes.length >= 8 && PNG_SIG.every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "webp";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "gif";
  return "unknown";
}

let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

/** CRC-32 (ISO 3309, as PNG uses it) of the given bytes. */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const src = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(src).arrayBuffer());
}

export function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream("deflate"));
}

export function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream("deflate"));
}

const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const typeOf = (b: Uint8Array, o: number): string => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function channelsOf(colorType: number): number {
  switch (colorType) {
    case 0: return 1;
    case 2: return 3;
    case 3: return 1;
    case 4: return 2;
    case 6: return 4;
    default: return 0;
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Undo the per-row filters in place; returns the unfiltered scanlines without filter bytes. */
function unfilter(raw: Uint8Array, height: number, stride: number, bpp: number): Uint8Array {
  const out = new Uint8Array(height * stride);
  if (raw.length < height * (stride + 1)) throw new PngError("png_corrupt", "png_corrupt: image data is truncated");
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    switch (ft) {
      case 0:
        out.set(raw.subarray(src, src + stride), row);
        break;
      case 1:
        for (let i = 0; i < stride; i++) out[row + i] = (raw[src + i] + (i >= bpp ? out[row + i - bpp] : 0)) & 0xff;
        break;
      case 2:
        for (let i = 0; i < stride; i++) out[row + i] = (raw[src + i] + (y > 0 ? out[prev + i] : 0)) & 0xff;
        break;
      case 3:
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? out[row + i - bpp] : 0;
          const b = y > 0 ? out[prev + i] : 0;
          out[row + i] = (raw[src + i] + ((a + b) >> 1)) & 0xff;
        }
        break;
      case 4:
        for (let i = 0; i < stride; i++) {
          const a = i >= bpp ? out[row + i - bpp] : 0;
          const b = y > 0 ? out[prev + i] : 0;
          const c = i >= bpp && y > 0 ? out[prev + i - bpp] : 0;
          out[row + i] = (raw[src + i] + paeth(a, b, c)) & 0xff;
        }
        break;
      default:
        throw new PngError("png_corrupt", "png_corrupt: unknown row filter " + ft);
    }
  }
  return out;
}

/** Decodes a PNG to RGBA8. Throws PngError (not_png names the sniffed type: jpeg / webp / gif / unknown). */
export async function decodePng(bytes: Uint8Array): Promise<DecodedPng> {
  const kind = sniffImageType(bytes);
  if (kind !== "png") throw new PngError("not_png", "not_png: the file is " + kind + ", not PNG");
  let o = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = 0;
  let sawIhdr = false;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  const ancillary: PngChunk[] = [];
  while (o + 8 <= bytes.length) {
    const len = u32(bytes, o);
    const type = typeOf(bytes, o + 4);
    const start = o + 8;
    const end = start + len;
    if (end + 4 > bytes.length) throw new PngError("png_corrupt", "png_corrupt: chunk " + type + " runs past the end of the file");
    const data = bytes.subarray(start, end);
    if (type === "IHDR") {
      if (len !== 13) throw new PngError("png_corrupt", "png_corrupt: bad IHDR length");
      if (crc32(bytes, o + 4, end) !== u32(bytes, end)) throw new PngError("png_crc", "png_crc: IHDR checksum mismatch");
      width = u32(data, 0);
      height = u32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
      sawIhdr = true;
      if (data[10] !== 0 || data[11] !== 0) throw new PngError("png_unsupported", "png_unsupported: unknown compression or filter method");
    } else if (type === "PLTE") {
      palette = data.slice();
    } else if (type === "tRNS") {
      trns = data.slice();
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    } else if (KEEP_ANCILLARY.has(type)) {
      ancillary.push({ type, data: data.slice() });
    }
    o = end + 4;
  }
  if (!sawIhdr) throw new PngError("png_corrupt", "png_corrupt: no IHDR chunk");
  if (interlace !== 0) throw new PngError("png_interlaced", "png_interlaced: interlaced (Adam7) PNGs are not supported");
  const channels = channelsOf(colorType);
  if (!channels) throw new PngError("png_unsupported", "png_unsupported: colour type " + colorType);
  const okDepth = colorType === 0 ? [1, 2, 4, 8, 16] : colorType === 3 ? [1, 2, 4, 8] : [8, 16];
  if (!okDepth.includes(bitDepth)) throw new PngError("png_unsupported", "png_unsupported: bit depth " + bitDepth + " for colour type " + colorType);
  if (width <= 0 || height <= 0 || width > 16384 || height > 16384) throw new PngError("png_unsupported", "png_unsupported: size " + width + "x" + height);
  if (colorType === 3 && !palette) throw new PngError("png_corrupt", "png_corrupt: palette image without PLTE");
  if (!idat.length) throw new PngError("png_corrupt", "png_corrupt: no image data");

  let total = 0;
  for (const c of idat) total += c.length;
  const z = new Uint8Array(total);
  let p = 0;
  for (const c of idat) { z.set(c, p); p += c.length; }
  let raw: Uint8Array;
  try {
    raw = await inflate(z);
  } catch (e) {
    throw new PngError("png_corrupt", "png_corrupt: image data does not inflate (" + String((e as Error)?.message ?? e).slice(0, 80) + ")");
  }

  const bitsPP = channels * bitDepth;
  const stride = Math.ceil((width * bitsPP) / 8);
  const bpp = Math.max(1, bitsPP >> 3);
  const px = unfilter(raw, height, stride, bpp);
  const out = new Uint8Array(width * height * 4);
  const hasAlpha = colorType === 4 || colorType === 6 || trns !== null;

  if (bitDepth < 8) {
    const mask = (1 << bitDepth) - 1;
    const scale = 255 / mask;
    for (let y = 0; y < height; y++) {
      const row = y * stride;
      for (let x = 0; x < width; x++) {
        const bit = x * bitDepth;
        const v = (px[row + (bit >> 3)] >> (8 - bitDepth - (bit & 7))) & mask;
        const q = (y * width + x) * 4;
        if (colorType === 3) {
          const pi = v * 3;
          out[q] = palette![pi] ?? 0;
          out[q + 1] = palette![pi + 1] ?? 0;
          out[q + 2] = palette![pi + 2] ?? 0;
          out[q + 3] = trns && v < trns.length ? trns[v] : 255;
        } else {
          const g = Math.round(v * scale);
          out[q] = g; out[q + 1] = g; out[q + 2] = g;
          out[q + 3] = trns && trns.length >= 2 && ((trns[0] << 8) | trns[1]) === v ? 0 : 255;
        }
      }
    }
    return { width, height, data: out, hasAlpha, ancillary };
  }

  const bps = bitDepth >> 3; // bytes per sample: 1 or 2
  // tRNS single-colour key (grey or RGB) compared on the full sample value
  const key16 = (i: number) => (trns && trns.length >= i * 2 + 2 ? (trns[i * 2] << 8) | trns[i * 2 + 1] : -1);
  const sample = (base: number): number => (bps === 2 ? (px[base] << 8) | px[base + 1] : px[base]);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const q = (y * width + x) * 4;
      const s = row + x * channels * bps; // first byte of this pixel
      switch (colorType) {
        case 0: {
          const g = px[s];
          out[q] = g; out[q + 1] = g; out[q + 2] = g;
          out[q + 3] = trns && sample(s) === key16(0) ? 0 : 255;
          break;
        }
        case 2: {
          out[q] = px[s]; out[q + 1] = px[s + bps]; out[q + 2] = px[s + 2 * bps];
          out[q + 3] = trns && sample(s) === key16(0) && sample(s + bps) === key16(1) && sample(s + 2 * bps) === key16(2) ? 0 : 255;
          break;
        }
        case 3: {
          const v = px[s];
          const pi = v * 3;
          out[q] = palette![pi] ?? 0; out[q + 1] = palette![pi + 1] ?? 0; out[q + 2] = palette![pi + 2] ?? 0;
          out[q + 3] = trns && v < trns.length ? trns[v] : 255;
          break;
        }
        case 4: {
          const g = px[s];
          out[q] = g; out[q + 1] = g; out[q + 2] = g; out[q + 3] = px[s + bps];
          break;
        }
        default: {
          out[q] = px[s]; out[q + 1] = px[s + bps]; out[q + 2] = px[s + 2 * bps]; out[q + 3] = px[s + 3 * bps];
        }
      }
    }
  }
  return { width, height, data: out, hasAlpha, ancillary };
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const len = data.length;
  out[0] = (len >>> 24) & 0xff; out[1] = (len >>> 16) & 0xff; out[2] = (len >>> 8) & 0xff; out[3] = len & 0xff;
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const c = crc32(out, 4, 8 + len);
  out[8 + len] = (c >>> 24) & 0xff; out[9 + len] = (c >>> 16) & 0xff; out[10 + len] = (c >>> 8) & 0xff; out[11 + len] = c & 0xff;
  return out;
}

/**
 * Encodes RGBA8 pixels as an 8-bit PNG: colour type 2 when !hasAlpha (the alpha bytes are dropped), else 6.
 * `ancillary` chunks (sRGB, gAMA, cHRM, iCCP, pHYs only) are written after IHDR, before the single IDAT.
 */
export async function encodePng(img: EncodeInput, opts: { ancillary?: PngChunk[] } = {}): Promise<Uint8Array> {
  const { width, height, data } = img;
  if (!(width > 0 && height > 0) || data.length !== width * height * 4) throw new PngError("png_encode", "png_encode: bad image buffer");
  const ch = img.hasAlpha ? 4 : 3;
  const stride = width * ch;
  const filtered = new Uint8Array(height * (stride + 1));
  // pack to RGB(A) scanlines first, then filter: row 0 Sub, other rows Up
  const line = new Uint8Array(stride);
  const prevLine = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const srcRow = y * width * 4;
    if (ch === 4) {
      line.set(data.subarray(srcRow, srcRow + width * 4));
    } else {
      for (let x = 0, s = srcRow, d = 0; x < width; x++, s += 4, d += 3) {
        line[d] = data[s]; line[d + 1] = data[s + 1]; line[d + 2] = data[s + 2];
      }
    }
    const dst = y * (stride + 1);
    if (y === 0) {
      filtered[dst] = 1;
      for (let i = 0; i < stride; i++) filtered[dst + 1 + i] = (line[i] - (i >= ch ? line[i - ch] : 0)) & 0xff;
    } else {
      filtered[dst] = 2;
      for (let i = 0; i < stride; i++) filtered[dst + 1 + i] = (line[i] - prevLine[i]) & 0xff;
    }
    prevLine.set(line);
  }
  const idat = await deflate(filtered);
  const ihdr = new Uint8Array(13);
  ihdr[0] = (width >>> 24) & 0xff; ihdr[1] = (width >>> 16) & 0xff; ihdr[2] = (width >>> 8) & 0xff; ihdr[3] = width & 0xff;
  ihdr[4] = (height >>> 24) & 0xff; ihdr[5] = (height >>> 16) & 0xff; ihdr[6] = (height >>> 8) & 0xff; ihdr[7] = height & 0xff;
  ihdr[8] = 8; ihdr[9] = img.hasAlpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts: Uint8Array[] = [new Uint8Array(PNG_SIG), chunk("IHDR", ihdr)];
  for (const a of opts.ancillary ?? []) if (KEEP_ANCILLARY.has(a.type)) parts.push(chunk(a.type, a.data));
  parts.push(chunk("IDAT", idat), chunk("IEND", new Uint8Array(0)));
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
