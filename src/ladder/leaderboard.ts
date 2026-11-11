import { expectedScore } from "./elo.ts";
import type { LadderMatch } from "./types.ts";

export const LEADERBOARD_VERSION = 1 as const;
export const DEFAULT_RATING = 1500;
export const DEFAULT_K = 32;

export type LeaderboardResult = "win" | "loss" | "draw";

export interface LeaderboardEntry {
  id: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Positive = win streak length, negative = loss streak length, 0 = draw / no games. */
  streak: number;
  /** Elo delta from the most recent match. */
  lastDelta: number;
  lastOpponent: string | null;
  lastResult: LeaderboardResult | null;
}

export interface Leaderboard {
  version: typeof LEADERBOARD_VERSION;
  entries: LeaderboardEntry[];
}

export function createEmptyEntry(id: string, initialRating = DEFAULT_RATING): LeaderboardEntry {
  return {
    id,
    rating: initialRating,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    lastDelta: 0,
    lastOpponent: null,
    lastResult: null,
  };
}

export function initLeaderboard(
  ids: readonly string[],
  initialRating = DEFAULT_RATING,
): Leaderboard {
  const entries = [...ids].sort().map((id) => createEmptyEntry(id, initialRating));
  return { version: LEADERBOARD_VERSION, entries };
}

function sortEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return a.id.localeCompare(b.id);
  });
}

function nextStreak(prev: number, result: LeaderboardResult): number {
  if (result === "draw") return 0;
  if (result === "win") return prev > 0 ? prev + 1 : 1;
  return prev < 0 ? prev - 1 : -1;
}

function applyToEntry(
  entry: LeaderboardEntry,
  ratingDelta: number,
  result: LeaderboardResult,
  opponentId: string,
): LeaderboardEntry {
  return {
    id: entry.id,
    rating: entry.rating + ratingDelta,
    games: entry.games + 1,
    wins: entry.wins + (result === "win" ? 1 : 0),
    losses: entry.losses + (result === "loss" ? 1 : 0),
    draws: entry.draws + (result === "draw" ? 1 : 0),
    streak: nextStreak(entry.streak, result),
    lastDelta: ratingDelta,
    lastOpponent: opponentId,
    lastResult: result,
  };
}

/**
 * Pure. Applies a single match to a leaderboard and returns the next leaderboard.
 * - Elo K defaults to 32, initial rating 1500.
 * - Unseen bot ids are added at the initial rating.
 * - Result order is rating desc, then id asc.
 * - Bots playing themselves throws (never happens from `play.ts`).
 */
export function applyResult(
  table: Leaderboard,
  match: LadderMatch,
  opts?: { k?: number; initialRating?: number },
): Leaderboard {
  if (match.p1 === match.p2) {
    throw new Error(`applyResult: cannot play ${match.p1} against itself`);
  }
  const k = opts?.k ?? DEFAULT_K;
  const initialRating = opts?.initialRating ?? DEFAULT_RATING;

  const byId = new Map(table.entries.map((e) => [e.id, e]));
  const ensure = (id: string): LeaderboardEntry => {
    const existing = byId.get(id);
    if (existing) return existing;
    const fresh = createEmptyEntry(id, initialRating);
    byId.set(id, fresh);
    return fresh;
  };

  const a = ensure(match.p1);
  const b = ensure(match.p2);

  const aWon = match.winner === "p1";
  const aScore = aWon ? 1 : 0;
  const bScore = 1 - aScore;

  const aDelta = k * (aScore - expectedScore(a.rating, b.rating));
  const bDelta = k * (bScore - expectedScore(b.rating, a.rating));

  byId.set(match.p1, applyToEntry(a, aDelta, aWon ? "win" : "loss", match.p2));
  byId.set(match.p2, applyToEntry(b, bDelta, aWon ? "loss" : "win", match.p1));

  return {
    version: LEADERBOARD_VERSION,
    entries: sortEntries([...byId.values()]),
  };
}
