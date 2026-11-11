import type { LadderMatch, Rating } from "./types.ts";

export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

export function updateElo(
  a: Rating,
  b: Rating,
  result: 0 | 0.5 | 1,
  k = 32,
): [Rating, Rating] {
  const ea = expectedScore(a.rating, b.rating);
  const eb = expectedScore(b.rating, a.rating);

  return [
    {
      ...a,
      rating: a.rating + k * (result - ea),
      games: a.games + 1,
      wins: a.wins + (result === 1 ? 1 : 0),
      losses: a.losses + (result === 0 ? 1 : 0),
      draws: a.draws + (result === 0.5 ? 1 : 0),
    },
    {
      ...b,
      rating: b.rating + k * (1 - result - eb),
      games: b.games + 1,
      wins: b.wins + (result === 0 ? 1 : 0),
      losses: b.losses + (result === 1 ? 1 : 0),
      draws: b.draws + (result === 0.5 ? 1 : 0),
    },
  ];
}

/**
 * Pure rating-table function. Processes matches in order and returns
 * a stable table sorted by rating, then by id.
 */
export function tableFromMatches(
  matches: LadderMatch[],
  opts?: { k?: number; initialRating?: number },
): Rating[] {
  const k = opts?.k ?? 32;
  const initial = opts?.initialRating ?? 1500;

  const ids = new Set<string>();
  for (const m of matches) {
    ids.add(m.p1);
    ids.add(m.p2);
  }

  const ratings = new Map<string, Rating>();
  for (const id of ids) {
    ratings.set(id, {
      id,
      rating: initial,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    });
  }

  for (const m of matches) {
    const a = ratings.get(m.p1)!;
    const b = ratings.get(m.p2)!;
    const aWon = m.winner === "p1";
    const [nextA, nextB] = updateElo(a, b, aWon ? 1 : 0, k);
    ratings.set(m.p1, nextA);
    ratings.set(m.p2, nextB);
  }

  return [...ratings.values()].sort(
    (x, y) => y.rating - x.rating || x.id.localeCompare(y.id),
  );
}
