/** Join-code and host-token helpers. Codes are generated at match create, hashed at rest. */

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomToken(byteLength = 18): string {
  const arr = new Uint8Array(byteLength);
  crypto.getRandomValues(arr);
  return toBase64Url(arr);
}

/** Short public match id (not a secret). */
export function randomMatchId(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return "m_" + toBase64Url(arr);
}

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function tokensMatch(token: string, hash: string): Promise<boolean> {
  if (!token || !hash) return false;
  const h = await hashToken(token);
  return timingSafeEqualHex(h, hash);
}

/** Per-fighter join code, shown once. 18 random bytes ≈ 24 chars. */
export function newJoinCode(): string {
  return randomToken(18);
}

export function newHostToken(): string {
  return randomToken(24);
}
