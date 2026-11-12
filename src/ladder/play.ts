import { createBot } from "../bots/index.ts";
import { runMatch } from "../engine/run.ts";
import { applyResult, type Leaderboard } from "./leaderboard.ts";
import type { LadderMatch } from "./types.ts";

export function pickMatchup(ids: string[], seed: number): { p1: string; p2: string } {
  const sorted = [...ids].sort();
  const pairs: [string, string][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      pairs.push([sorted[i]!, sorted[j]!]);
    }
  }
  if (pairs.length === 0) throw new Error("pickMatchup: need at least two bots");
  const idx = ((seed - 1) >>> 0) % pairs.length;
  const [a, b] = pairs[idx]!;
  // Alternate sides by seed parity so bots see both p1 and p2.
  return seed % 2 === 0 ? { p1: b, p2: a } : { p1: a, p2: b };
}

export function playSeededMatch(
  table: Leaderboard,
  seed: number,
): { table: Leaderboard; match: LadderMatch } {
  const ids = table.entries.map((e) => e.id);
  const { p1, p2 } = pickMatchup(ids, seed);
  const { state } = runMatch(createBot(p1), createBot(p2), { seed });
  const winner: "p1" | "p2" = state.matchWinner === "p1" ? "p1" : "p2";
  const match: LadderMatch = {
    seed,
    p1,
    p2,
    winner,
    p1Wins: state.p1Wins,
    p2Wins: state.p2Wins,
  };
  return { table: applyResult(table, match), match };
}

export function playSeededMatches(
  table: Leaderboard,
  opts: { count: number; startSeed: number },
): { table: Leaderboard; matches: LadderMatch[]; nextSeed: number } {
  let t = table;
  const matches: LadderMatch[] = [];
  let seed = opts.startSeed;
  for (let i = 0; i < opts.count; i++) {
    const r = playSeededMatch(t, seed);
    t = r.table;
    matches.push(r.match);
    seed += 1;
  }
  return { table: t, matches, nextSeed: seed };
}
