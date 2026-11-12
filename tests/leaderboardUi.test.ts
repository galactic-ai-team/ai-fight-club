import { describe, expect, it } from "vitest";
import {
  adaptPr1Leaderboard,
  DEFAULT_LEADERBOARD_FIXTURE,
  formatLeaderboardRows,
} from "../src/spectator/leaderboardUi.ts";
import { emptyStandings } from "../src/spectator/mountBoard.ts";

/** Shape of draft PR #1's Leaderboard / LeaderboardEntry. */
function pr1Table() {
  return {
    version: 1 as const,
    entries: [
      {
        id: "rusher",
        rating: 1532.0,
        games: 3,
        wins: 2,
        losses: 1,
        draws: 0,
        streak: 2,
        lastDelta: 16.0,
        lastOpponent: "random",
        lastResult: "win" as const,
      },
      {
        id: "random",
        rating: 1484.0,
        games: 2,
        wins: 0,
        losses: 2,
        draws: 0,
        streak: -2,
        lastDelta: -16.0,
        lastOpponent: "rusher",
        lastResult: "loss" as const,
      },
      {
        id: "statue",
        rating: 1500,
        games: 1,
        wins: 0,
        losses: 0,
        draws: 1,
        streak: 0,
        lastDelta: 0,
        lastOpponent: "turtler",
        lastResult: "draw" as const,
      },
      {
        id: "turtler",
        rating: 1500,
        games: 1,
        wins: 0,
        losses: 0,
        draws: 1,
        streak: 0,
        lastDelta: 0,
        lastOpponent: "statue",
        lastResult: "draw" as const,
      },
    ],
  };
}

describe("adaptPr1Leaderboard", () => {
  it("accepts PR #1 { version, entries } and keeps rating-desc, id-asc order", () => {
    const state = adaptPr1Leaderboard(pr1Table());
    expect(state.rows.map((r) => r.id)).toEqual(["rusher", "statue", "turtler", "random"]);
    expect(state.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(state.rows[0]?.elo).toBe(1532);
    expect(state.rows[3]?.elo).toBe(1484);
    // Tied 1500 ratings break ties by id, not by wins.
    expect(state.rows[1]?.id).toBe("statue");
    expect(state.rows[2]?.id).toBe("turtler");
  });

  it("preserves W-L-D, streaks, and last Elo delta from PR #1 entries", () => {
    const state = adaptPr1Leaderboard(pr1Table());
    const rusher = state.rows.find((r) => r.id === "rusher");
    const random = state.rows.find((r) => r.id === "random");
    const statue = state.rows.find((r) => r.id === "statue");
    expect(rusher?.wins).toBe(2);
    expect(rusher?.losses).toBe(1);
    expect(rusher?.draws).toBe(0);
    expect(rusher?.streak).toBe(2);
    expect(rusher?.lastDelta).toBe(16);
    expect(random?.streak).toBe(-2);
    expect(random?.lastDelta).toBe(-16);
    expect(statue?.draws).toBe(1);
    expect(statue?.streak).toBe(0);
    // Four results (2 decisive + 1 draw counted on both sides) -> 3 matches.
    expect(state.totalMatches).toBe(3);
  });

  it("does not fall back to the demo fixture when a real table is provided", () => {
    const state = adaptPr1Leaderboard(pr1Table());
    expect(state.rows.map((r) => r.id)).not.toEqual(
      DEFAULT_LEADERBOARD_FIXTURE.rows.map((r) => r.id),
    );
    expect(state.totalMatches).not.toBe(DEFAULT_LEADERBOARD_FIXTURE.totalMatches);
  });
  it("round-trips emptyStandings without falling back to the demo fixture", () => {
    const empty = emptyStandings();
    const state = adaptPr1Leaderboard(empty);
    expect(state.totalMatches).toBe(0);
    expect(state.rows.map((r) => r.id)).toEqual(["cadence9", "ion", "quark", "vexel"]);
    expect(state.rows.every((r) => r.elo === 1500 && r.wins === 0 && r.draws === 0)).toBe(true);
  });

});

describe("formatLeaderboardRows", () => {
  it("renders rows in rank order with W-L-D records and W/L streak text", () => {
    const views = formatLeaderboardRows(adaptPr1Leaderboard(pr1Table()));
    expect(views.map((v) => v.rank)).toEqual([1, 2, 3, 4]);
    expect(views.map((v) => v.id)).toEqual(["rusher", "statue", "turtler", "random"]);
    expect(views[0]?.record).toBe("2-1-0");
    expect(views[0]?.streakText).toBe("W2");
    expect(views[0]?.deltaText).toBe("+16");
    expect(views[1]?.record).toBe("0-0-1");
    expect(views[1]?.streakText).toBe("—");
    expect(views[3]?.record).toBe("0-2-0");
    expect(views[3]?.streakText).toBe("L2");
    expect(views[3]?.deltaText).toBe("-16");
  });
});

describe("emptyStandings", () => {
  it("starts the four original fighters at 1500 with no matches, sorted by id", () => {
    const state = emptyStandings();
    expect(state.totalMatches).toBe(0);
    expect(state.rows.map((r) => r.id)).toEqual(["cadence9", "ion", "quark", "vexel"]);
    expect(state.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    for (const row of state.rows) {
      expect(row.elo).toBe(1500);
      expect(row.wins).toBe(0);
      expect(row.losses).toBe(0);
      expect(row.draws).toBe(0);
      expect(row.streak).toBe(0);
    }
    expect(state.rows[0]?.name).toBe("CADENCE-9");
  });
});
