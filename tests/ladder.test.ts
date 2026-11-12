import { describe, expect, it } from "vitest";
import { tableFromMatches, updateElo } from "../src/ladder/elo.ts";
import { runLadder } from "../src/ladder/roundRobin.ts";
import type { LadderMatch } from "../src/ladder/types.ts";

describe("elo", () => {
  it("rewards the winner and punishes the loser", () => {
    const a = { id: "a", rating: 1500, games: 0, wins: 0, losses: 0, draws: 0 };
    const b = { id: "b", rating: 1500, games: 0, wins: 0, losses: 0, draws: 0 };
    const [nextA, nextB] = updateElo(a, b, 1);
    expect(nextA.rating).toBeGreaterThan(1500);
    expect(nextB.rating).toBeLessThan(1500);
  });

  it("tableFromMatches is stable and sorted", () => {
    const fixture: LadderMatch[] = [
      { seed: 1, p1: "rusher", p2: "random", winner: "p1", p1Wins: 2, p2Wins: 0 },
      { seed: 2, p1: "random", p2: "rusher", winner: "p2", p1Wins: 1, p2Wins: 2 },
      { seed: 3, p1: "rusher", p2: "random", winner: "p1", p1Wins: 2, p2Wins: 1 },
    ];
    const table = tableFromMatches(fixture);
    expect(table[0]?.id).toBe("rusher");
    expect(table.length).toBe(2);
  });
});

describe("ladder", () => {
  it("is reproducible from the same bots and seeds", () => {
    const opts = {
      botIds: ["rusher", "turtler", "utility"],
      seeds: [1, 2, 3],
    };

    const first = runLadder(opts);
    const second = runLadder(opts);

    expect(first.matches).toEqual(second.matches);
    expect(first.ratings).toEqual(second.ratings);
  });

  it("keeps ranking order when the same fixture is processed twice", () => {
    const fixture: LadderMatch[] = [
      { seed: 1, p1: "rusher", p2: "random", winner: "p1", p1Wins: 2, p2Wins: 0 },
      { seed: 2, p1: "random", p2: "rusher", winner: "p2", p1Wins: 0, p2Wins: 2 },
      { seed: 3, p1: "rusher", p2: "random", winner: "p1", p1Wins: 2, p2Wins: 1 },
      { seed: 4, p1: "zoner", p2: "random", winner: "p1", p1Wins: 2, p2Wins: 0 },
      { seed: 5, p1: "random", p2: "zoner", winner: "p2", p1Wins: 1, p2Wins: 2 },
    ];

    const once = tableFromMatches(fixture);
    const twice = tableFromMatches([...fixture, ...fixture]);

    expect(once.map((r) => r.id)).toEqual(twice.map((r) => r.id));
  });
});
