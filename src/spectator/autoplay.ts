import { BUILTIN_BOTS } from "../bots/index.ts";

/** Original pixel-art fighters shown in the spectator view. */
export const SPECTATOR_CHARACTERS = ["Ion", "Quark", "Vexel", "Cadence-9"] as const;

/** Pause after a finished match so the result and leaderboard can be seen. */
export const NEXT_MATCH_DELAY_MS = 2500;

/**
 * Ordered round-robin of built-in bots: every bot plays every other bot
 * from both sides, then the list repeats.
 */
export function roundRobinPairings(
  ids: readonly string[] = BUILTIN_BOTS,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = 0; j < ids.length; j++) {
      if (i === j) continue;
      const a = ids[i];
      const b = ids[j];
      if (a === undefined || b === undefined) continue;
      pairs.push([a, b]);
    }
  }
  return pairs;
}

export const AUTO_PAIRINGS = roundRobinPairings(BUILTIN_BOTS);

export function pairingAt(
  index: number,
  pairs: ReadonlyArray<readonly [string, string]> = AUTO_PAIRINGS,
): [string, string] {
  if (pairs.length === 0) return ["rusher", "random"];
  const n = ((index % pairs.length) + pairs.length) % pairs.length;
  const pair = pairs[n] ?? ["rusher", "random"];
  return [pair[0], pair[1]];
}

/** Rotate the four original characters so both sides stay distinct. */
export function characterPairAt(
  index: number,
  chars: readonly string[] = SPECTATOR_CHARACTERS,
): [string, string] {
  const n = chars.length;
  if (n === 0) return ["Ion", "Quark"];
  if (n === 1) {
    const only = chars[0] ?? "Ion";
    return [only, only];
  }
  const p1 = chars[((index % n) + n) % n] ?? "Ion";
  const offset = 1 + (Math.floor(Math.abs(index) / n) % (n - 1));
  const p2 = chars[(((index % n) + n) % n + offset) % n] ?? "Quark";
  return [p1, p2];
}
