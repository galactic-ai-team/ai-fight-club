import { describe, expect, it } from "vitest";
import { createBot, createRandomBot, createRusherBot, createStatueBot } from "../src/bots/index.ts";
import { ATTACKS } from "../src/engine/attacks.ts";
import { runMatch } from "../src/engine/run.ts";
import { createMatch, stepMatch } from "../src/engine/sim.ts";
import { observe } from "../src/engine/observe.ts";

describe("builtin bots", () => {
  it("createBot rejects unknown ids", () => {
    expect(() => createBot("hadoken-master")).toThrow(/unknown bot/);
  });

  it("random bot is deterministic for a given start seed", () => {
    const a = createRandomBot();
    const b = createRandomBot();
    a.start?.({ side: "p1", seed: 11, opponentId: "r" });
    b.start?.({ side: "p1", seed: 11, opponentId: "r" });
    const s = createMatch({ seed: 11 });
    const obs = observe(s, "p1");
    for (let i = 0; i < 50; i++) {
      expect(a.act(obs)).toEqual(b.act(obs));
    }
  });

  it("rusher walks toward the opponent and attacks in range", () => {
    const bot = createRusherBot();
    const s = createMatch({ seed: 1 });
    const first = bot.act(observe(s, "p1"));
    expect(first.move).toBe("right");
    // Place them in light range.
    s.p1.x = s.p2.x - (ATTACKS.light.range + 20);
    const close = bot.act(observe(s, "p1"));
    expect(close.attack === "light" || close.attack === "heavy" || close.move === "right").toBe(true);
  });

  it("rusher knocks out a statue in one match", () => {
    const { state } = runMatch(createRusherBot(), createStatueBot(), { seed: 21 });
    expect(state.over).toBe(true);
    expect(state.matchWinner).toBe("p1");
    expect(state.p1Wins).toBeGreaterThanOrEqual(2);
  });

  it("rusher beats random on a fixed seed set more often than not", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    let wins = 0;
    for (const seed of seeds) {
      const { state } = runMatch(createRusherBot(), createRandomBot(), { seed });
      if (state.matchWinner === "p1") wins += 1;
    }
    expect(wins).toBeGreaterThanOrEqual(14);
  });
});

describe("stepMatch safety", () => {
  it("survives a bot returning junk", () => {
    const s = createMatch({ seed: 1 });
    expect(() => stepMatch(s, { nope: true }, undefined)).not.toThrow();
    expect(s.tick).toBe(1);
  });
});
