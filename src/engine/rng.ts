/** Deterministic xorshift32. Seed 0 is remapped so the stream is never stuck. */
export function seedRng(seed: number): number {
  let s = seed | 0;
  if (s === 0) s = 0x9e3779b9;
  return s;
}

export function nextRng(state: number): { state: number; value: number } {
  let x = state | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  const next = x | 0;
  return { state: next, value: next >>> 0 };
}

/** Inclusive integer in [lo, hi]. */
export function rngInt(state: number, lo: number, hi: number): { state: number; n: number } {
  const { state: s, value } = nextRng(state);
  const span = hi - lo + 1;
  return { state: s, n: lo + (value % span) };
}
