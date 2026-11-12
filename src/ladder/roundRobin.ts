import { createBot } from "../bots/index.ts";
import { runMatch } from "../engine/run.ts";
import type { Replay } from "../engine/types.ts";
import { updateElo } from "./elo.ts";
import type { LadderMatch, Rating } from "./types.ts";

export interface LadderOptions {
  botIds: string[];
  seeds: number[];
  k?: number;
  initialRating?: number;
  onMatch?: (match: LadderMatch, replay: Replay) => void;
}

/**
 * Seeded double round-robin: each pair plays each seed twice, once from each side.
 * Same bot list + same seed list always produces the same match order and rating table.
 */
export function runLadder(opts: LadderOptions): {
  ratings: Rating[];
  matches: LadderMatch[];
} {
  const k = opts.k ?? 32;
  const initial = opts.initialRating ?? 1500;

  const botIds = [...opts.botIds].sort();
  const ratings = new Map<string, Rating>();

  for (const id of botIds) {
    ratings.set(id, {
      id,
      rating: initial,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    });
  }

  const matches: LadderMatch[] = [];

  for (let i = 0; i < botIds.length; i++) {
    for (let j = i + 1; j < botIds.length; j++) {
      const a = botIds[i]!;
      const b = botIds[j]!;

      for (const seed of opts.seeds) {
        for (const side of ["p1", "p2"] as const) {
          const p1Id = side === "p1" ? a : b;
          const p2Id = side === "p1" ? b : a;

          const p1 = createBot(p1Id);
          const p2 = createBot(p2Id);
          const { state, replay } = runMatch(p1, p2, { seed });

          const winner: "p1" | "p2" =
            state.matchWinner === "p1" ? "p1" : "p2";

          const match: LadderMatch = {
            seed,
            p1: p1Id,
            p2: p2Id,
            winner,
            p1Wins: state.p1Wins,
            p2Wins: state.p2Wins,
          };

          matches.push(match);
          opts.onMatch?.(match, replay);

          const ra = ratings.get(a)!;
          const rb = ratings.get(b)!;
          const aWon =
            (winner === "p1" && p1Id === a) ||
            (winner === "p2" && p2Id === a);

          const [nextA, nextB] = updateElo(ra, rb, aWon ? 1 : 0, k);
          ratings.set(a, nextA);
          ratings.set(b, nextB);
        }
      }
    }
  }

  const table = [...ratings.values()].sort(
    (x, y) => y.rating - x.rating || x.id.localeCompare(y.id),
  );

  return { ratings: table, matches };
}
