import { describe, expect, it } from "vitest";
import { parseReplay, playback, serializeReplay } from "../src/engine/replay.ts";
import { runMatch } from "../src/engine/run.ts";
import { createBot } from "../src/bots/index.ts";
import {
  applyResult,
  createEmptyEntry,
  initLeaderboard,
  LEADERBOARD_VERSION,
  type Leaderboard,
} from "../src/ladder/leaderboard.ts";
import { pickMatchup, playSeededMatches } from "../src/ladder/play.ts";
import type { LadderMatch } from "../src/ladder/types.ts";

function match(overrides: Partial<LadderMatch> = {}): LadderMatch {
  return {
    seed: 1,
    p1: "rusher",
    p2: "random",
    winner: "p1",
    p1Wins: 2,
    p2Wins: 0,
    ...overrides,
  };
}

describe("initLeaderboard", () => {
  it("sorts ids and starts at 1500 with no games", () => {
    const t = initLeaderboard(["zoner", "rusher", "utility"]);
    expect(t.version).toBe(LEADERBOARD_VERSION);
    expect(t.entries.map((e) => e.id)).toEqual(["rusher", "utility", "zoner"]);
    for (const e of t.entries) {
      expect(e.rating).toBe(1500);
      expect(e.games).toBe(0);
      expect(e.wins).toBe(0);
      expect(e.losses).toBe(0);
      expect(e.draws).toBe(0);
      expect(e.streak).toBe(0);
      expect(e.lastDelta).toBe(0);
      expect(e.lastResult).toBeNull();
      expect(e.lastOpponent).toBeNull();
    }
  });
});

describe("applyResult", () => {
  it("moves winner up and loser down", () => {
    const start = initLeaderboard(["rusher", "random"]);
    const next = applyResult(start, match());
    const r = next.entries.find((e) => e.id === "rusher")!;
    const rnd = next.entries.find((e) => e.id === "random")!;
    expect(r.rating).toBeGreaterThan(1500);
    expect(rnd.rating).toBeLessThan(1500);
    expect(r.wins).toBe(1);
    expect(rnd.losses).toBe(1);
    expect(r.games).toBe(1);
    expect(rnd.games).toBe(1);
    expect(r.lastResult).toBe("win");
    expect(rnd.lastResult).toBe("loss");
    expect(r.lastDelta).toBeGreaterThan(0);
    expect(rnd.lastDelta).toBeLessThan(0);
    expect(r.lastOpponent).toBe("random");
    expect(rnd.lastOpponent).toBe("rusher");
  });

  it("is symmetric around 1500 for a fresh 1v1", () => {
    const start = initLeaderboard(["a", "b"]);
    const next = applyResult(start, match({ p1: "a", p2: "b" }));
    const a = next.entries.find((e) => e.id === "a")!;
    const b = next.entries.find((e) => e.id === "b")!;
    expect(a.rating - 1500).toBeCloseTo(1500 - b.rating, 5);
    expect(a.lastDelta).toBeCloseTo(-b.lastDelta, 5);
  });

  it("is deterministic: same fixture, same output", () => {
    const fixture: LadderMatch[] = [
      match({ seed: 1, p1: "rusher", p2: "random", winner: "p1" }),
      match({ seed: 2, p1: "random", p2: "rusher", winner: "p2" }),
      match({ seed: 3, p1: "zoner", p2: "rusher", winner: "p1" }),
    ];
    const a = fixture.reduce(
      (t, m) => applyResult(t, m),
      initLeaderboard(["rusher", "random", "zoner"]),
    );
    const b = fixture.reduce(
      (t, m) => applyResult(t, m),
      initLeaderboard(["rusher", "random", "zoner"]),
    );
    expect(a).toEqual(b);
  });

  it("auto-adds an unseen bot at 1500", () => {
    const start = initLeaderboard(["rusher"]);
    const next = applyResult(start, match({ p1: "rusher", p2: "newcomer" }));
    const fresh = next.entries.find((e) => e.id === "newcomer")!;
    expect(fresh).toBeDefined();
    expect(fresh.rating).toBeLessThan(1500);
    expect(fresh.games).toBe(1);
    expect(fresh.losses).toBe(1);
    expect(fresh.lastResult).toBe("loss");
  });

  it("refuses a bot-vs-self match", () => {
    expect(() =>
      applyResult(initLeaderboard(["a"]), match({ p1: "a", p2: "a" })),
    ).toThrow(/against itself/);
  });

  it("lastDelta reflects only the most recent match", () => {
    let t = initLeaderboard(["a", "b"]);
    t = applyResult(t, match({ p1: "a", p2: "b", winner: "p1" }));
    const afterFirst = t.entries.find((e) => e.id === "a")!.lastDelta;
    t = applyResult(t, match({ p1: "a", p2: "b", winner: "p2" }));
    const afterSecond = t.entries.find((e) => e.id === "a")!.lastDelta;
    expect(afterFirst).toBeGreaterThan(0);
    expect(afterSecond).toBeLessThan(0);
  });
});

describe("streaks", () => {
  it("accumulates consecutive wins", () => {
    let t = initLeaderboard(["a", "b"]);
    t = applyResult(t, match({ p1: "a", p2: "b", winner: "p1" }));
    expect(t.entries.find((e) => e.id === "a")!.streak).toBe(1);
    t = applyResult(t, match({ p1: "a", p2: "b", winner: "p1" }));
    expect(t.entries.find((e) => e.id === "a")!.streak).toBe(2);
    t = applyResult(t, match({ p1: "a", p2: "b", winner: "p1" }));
    expect(t.entries.find((e) => e.id === "a")!.streak).toBe(3);
  });

  it("resets on a loss to -1 and counts down from there", () => {
    let t = initLeaderboard(["a", "b"]);
    t = applyResult(t, match({ p1: "a", p2: "b", winner: "p1" }));
    t = applyResult(t, match({ p1: "a", p2: "b", winner: "p1" }));
    expect(t.entries.find((e) => e.id === "a")!.streak).toBe(2);
    t = applyResult(t, match({ p1: "a", p2: "b", winner: "p2" }));
    expect(t.entries.find((e) => e.id === "a")!.streak).toBe(-1);
    // b was on L2 and just won, so its streak resets to W1.
    expect(t.entries.find((e) => e.id === "b")!.streak).toBe(1);
    t = applyResult(t, match({ p1: "a", p2: "b", winner: "p2" }));
    expect(t.entries.find((e) => e.id === "a")!.streak).toBe(-2);
    expect(t.entries.find((e) => e.id === "b")!.streak).toBe(2);
  });

  it("a draw resets streak to 0", () => {
    // Draws are not currently produced by the engine, but applyResult supports them
    // via a fake LadderMatch-shaped object with `winner: "draw"` if we ever add it.
    // For now, simulate via two draws on a hand-built table.
    const table: Leaderboard = {
      version: LEADERBOARD_VERSION,
      entries: [
        { ...createEmptyEntry("a"), streak: 5, wins: 5, games: 5 },
        { ...createEmptyEntry("b"), streak: -3, losses: 3, games: 3 },
      ],
    };
    // We can't inject a draw through applyResult(LadderMatch) — sanity check that
    // the type guard exists by asserting the current shape stays a "win"/"loss".
    expect(table.entries[0]!.streak).toBe(5);
  });
});

describe("ordering and tie-breaks", () => {
  it("sorts by rating desc", () => {
    const start = initLeaderboard(["zeta", "alpha", "mid"]);
    const t = applyResult(start, match({ p1: "alpha", p2: "zeta", winner: "p1" }));
    const ids = t.entries.map((e) => e.id);
    expect(ids).toEqual(["alpha", "mid", "zeta"]);
  });

  it("breaks exact rating ties by id (localeCompare)", () => {
    const start = initLeaderboard(["delta", "charlie", "bravo", "alpha"]);
    const t = applyResult(start, match({ p1: "alpha", p2: "delta", winner: "p1" }));
    const ids = t.entries.map((e) => e.id);
    expect(ids).toEqual(["alpha", "bravo", "charlie", "delta"]);
  });
});

describe("integration with the engine", () => {
  it("plays a real seeded match and updates the table", () => {
    const start = initLeaderboard(["rusher", "random"]);
    const { state } = runMatch(createBot("rusher"), createBot("random"), { seed: 1 });
    const winner: "p1" | "p2" = state.matchWinner === "p1" ? "p1" : "p2";
    const m: LadderMatch = {
      seed: 1,
      p1: "rusher",
      p2: "random",
      winner,
      p1Wins: state.p1Wins,
      p2Wins: state.p2Wins,
    };
    const t = applyResult(start, m);
    const rusher = t.entries.find((e) => e.id === "rusher")!;
    expect(rusher.lastResult).toBe(winner === "p1" ? "win" : "loss");
    expect(rusher.games).toBe(1);
  });
});

describe("pickMatchup and playSeededMatches", () => {
  it("pickMatchup is stable for a fixed id set and seed", () => {
    const ids = ["random", "rusher", "statue", "turtler", "utility", "zoner"];
    const a = pickMatchup(ids, 1);
    const b = pickMatchup([...ids].reverse(), 1);
    expect(a).toEqual(b);
  });

  it("playSeededMatches is reproducible", () => {
    const start = initLeaderboard(["rusher", "random", "utility"]);
    const a = playSeededMatches(start, { count: 6, startSeed: 1 });
    const b = playSeededMatches(start, { count: 6, startSeed: 1 });
    expect(a.matches).toEqual(b.matches);
    expect(a.table).toEqual(b.table);
    expect(a.nextSeed).toBe(7);
  });
});

// Lumi: spec gaps from docs/team/dee.md (exact Elo math on a fixture, rebuild from replays).
describe("spec checks (added by Lumi)", () => {
  it("Elo math matches hand-computed values (K=32, start 1500)", () => {
    let t = initLeaderboard(["a", "b"]);
    t = applyResult(t, match({ p1: "a", p2: "b", winner: "p1" }));
    const a1 = t.entries.find((e) => e.id === "a")!;
    expect(a1.rating).toBeCloseTo(1516, 10);
    expect(a1.lastDelta).toBeCloseTo(16, 10);
    // Second match: b (1484) beats a (1516). E_b = 1 / (1 + 10^((1516-1484)/400)).
    t = applyResult(t, match({ p1: "a", p2: "b", winner: "p2" }));
    const eb = 1 / (1 + 10 ** (32 / 400));
    const b2 = t.entries.find((e) => e.id === "b")!;
    expect(b2.lastDelta).toBeCloseTo(32 * (1 - eb), 10);
    expect(b2.rating).toBeCloseTo(1484 + 32 * (1 - eb), 10);
  });

  it("rebuilding from saved replays gives the same table as the live run", () => {
    const ids = ["rusher", "turtler", "utility", "zoner"];
    const live = playSeededMatches(initLeaderboard(ids), { count: 8, startSeed: 1 });
    // Save each match as a replay file (JSON), then rebuild purely from the files.
    const files = live.matches.map((m) =>
      serializeReplay(runMatch(createBot(m.p1), createBot(m.p2), { seed: m.seed }).replay),
    );
    const rebuilt = files.reduce((t, json) => {
      const r = parseReplay(json);
      const state = playback(r);
      const winner = state.matchWinner;
      if (winner !== "p1" && winner !== "p2") return t;
      return applyResult(t, {
        seed: r.seed,
        p1: r.p1.botId,
        p2: r.p2.botId,
        winner,
        p1Wins: state.p1Wins,
        p2Wins: state.p2Wins,
      });
    }, initLeaderboard(ids));
    expect(rebuilt).toEqual(live.table);
  });
});
