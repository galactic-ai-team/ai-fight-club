/**
 * Minimal RGBA PNG encoder — pure JavaScript, no Node APIs, no native
 * canvas dependency, so the same code runs in Node tests, CI, and the
 * browser bundle (the spectator PiP imports the POV renderer, which
 * imports this file).
 *
 * DEFLATE uses stored (uncompressed) blocks: a 160x120 POV frame is
 * ~77 KB of raw pixels either way, and stored blocks keep the encoder
 * small, deterministic, and identical on every platform. Any PNG
 * decoder accepts them.
 */

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32be(n: number): Uint8Array {
  return Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function u16le(n: number): Uint8Array {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff);
}

/** Wrap raw bytes in a zlib stream using stored DEFLATE blocks. */
function zlibStore(raw: Uint8Array): Uint8Array {
  const MAX_BLOCK = 65535;
  const blocks = Math.max(1, Math.ceil(raw.length / MAX_BLOCK));
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
  let o = 0;
  out[o++] = 0x78; // CMF: deflate, 32K window
  out[o++] = 0x01; // FLG: no preset dict, FCHECK valid
  for (let b = 0; b < blocks; b++) {
    const start = b * MAX_BLOCK;
    const len = Math.min(MAX_BLOCK, raw.length - start);
    const final = b === blocks - 1 ? 1 : 0;
    out[o++] = final; // BFINAL + BTYPE 00 (stored), byte-aligned
    out.set(u16le(len), o);
    o += 2;
    out.set(u16le(~len & 0xffff), o);
    o += 2;
    out.set(raw.subarray(start, start + len), o);
    o += len;
  }
  out.set(u32be(adler32(raw)), o);
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const len = u32be(data.length);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const crc = u32be(crc32(body));
  const out = new Uint8Array(4 + body.length + 4);
  out.set(len, 0);
  out.set(body, 4);
  out.set(crc, 4 + body.length);
  return out;
}

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

/**
 * Encode an RGBA buffer (row-major, 4 bytes per pixel) as a PNG.
 * `pixels.length` must equal `width * height * 4`.
 */
export function encodePng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("encodePng: width and height must be positive integers");
  }
  if (pixels.length !== width * height * 4) {
    throw new Error(`encodePng: expected ${width * height * 4} bytes, got ${pixels.length}`);
  }

  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter: None
    raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }

  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = zlibStore(raw);

  const parts = [SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export const PNG_SIGNATURE = SIGNATURE;

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < SIGNATURE.length) return false;
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (bytes[i] !== SIGNATURE[i]) return false;
  }
  return true;
}
