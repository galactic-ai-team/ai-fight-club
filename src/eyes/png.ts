/** Minimal RGBA PNG encoder. Uses Node's zlib only — no native canvas dependency. */

import { deflateSync } from "node:zlib";

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

function u32(n: number): Uint8Array {
  return Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const len = u32(data.length);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const crc = u32(crc32(body));
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
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = deflateSync(raw, { level: 9 });

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
