import { describe, expect, it } from "vitest";
import { createBot, createGpt6Bot, createLumiBot, gpt6Ready } from "../src/bots/index.ts";
import { ready as gpt6FileReady, name as gpt6Name } from "../src/bots/gpt6.ts";
import { runMatch } from "../src/engine/run.ts";
import { createMatch } from "../src/engine/sim.ts";
import { observe } from "../src/engine/observe.ts";
import { NEUTRAL_ACTION } from "../src/engine/types.ts";
import {
  DUEL_TITLE,
  WAITING_MESSAGE,
  applyDuelMatch,
  duelScoreLine,
  duelStatusLine,
  emptyDuelSet,
  gpt6IsReady,
  hudName,
  isDuelQuery,
  winnerToDuelFighter,
} from "../src/spectator/duel.ts";

describe("duel query and set score", () => {
  it("opens only on ?duel=lumi-gpt6", () => {
    expect(isDuelQuery("?duel=lumi-gpt6")).toBe(true);
    expect(isDuelQuery("duel=lumi-gpt6")).toBe(true);
    expect(isDuelQuery("?duel=lumi-gpt6&x=1")).toBe(true);
    expect(isDuelQuery("")).toBe(false);
    expect(isDuelQuery("?duel=lumi-lumi")).toBe(false);
    expect(isDuelQuery("?foo=lumi-gpt6")).toBe(false);
  });

  it("plays a first-to-3 set and freezes after a winner", () => {
    let set = emptyDuelSet();
    set = applyDuelMatch(set, "lumi");
    set = applyDuelMatch(set, "gpt6");
    set = applyDuelMatch(set, "lumi");
    expect(duelScoreLine(set)).toBe("2 – 1");
    expect(set.over).toBe(false);
    set = applyDuelMatch(set, "lumi");
    expect(set.over).toBe(true);
    expect(set.winner).toBe("lumi");
    expect(set.lumiWins).toBe(3);
    expect(duelScoreLine(set)).toBe("3 – 1");
    const frozen = applyDuelMatch(set, "gpt6");
    expect(frozen).toEqual(set);
    expect(duelStatusLine({ ready: true, set })).toBe("Set over — Lumi wins 3–1");
  });

  it("labels the waiting state and HUD names", () => {
    expect(DUEL_TITLE).toBe("Featured: Lumi vs GPT-6");
    expect(duelStatusLine({ ready: false, set: emptyDuelSet() })).toBe(WAITING_MESSAGE);
    expect(duelStatusLine({ ready: true, set: emptyDuelSet(), live: true })).toBe(
      "First to 3 · match 1",
    );
    expect(hudName("lumi", "Ion")).toBe("Ion · Lumi");
    expect(hudName("gpt6", "Quark")).toBe("Quark · GPT-6");
    expect(winnerToDuelFighter("p1", "p1")).toBe("lumi");
    expect(winnerToDuelFighter("p2", "p1")).toBe("gpt6");
  });
});

describe("gpt6 placeholder slot", () => {
  it("is clearly labeled and not ready", () => {
    expect(gpt6FileReady).toBe(false);
    expect(gpt6Ready).toBe(false);
    expect(gpt6IsReady()).toBe(false);
    expect(gpt6Name).toMatch(/waiting/i);
    const bot = createGpt6Bot();
    expect(bot.id).toBe("gpt6");
    expect(bot.name).toMatch(/waiting/i);
    const s = createMatch({ seed: 1 });
    expect(bot.act(observe(s, "p2"))).toEqual(NEUTRAL_ACTION);
    expect(createBot("gpt6").id).toBe("gpt6");
  });
});

describe("lumi bot", () => {
  it("is registered and deterministic for a given observation stream", () => {
    const a = createLumiBot();
    const b = createLumiBot();
    a.start?.({ side: "p1", seed: 42, opponentId: "statue" });
    b.start?.({ side: "p1", seed: 42, opponentId: "statue" });
    const s = createMatch({ seed: 42 });
    for (let i = 0; i < 80; i++) {
      const obs = observe(s, "p1");
      expect(a.act(obs)).toEqual(b.act(obs));
    }
    expect(createBot("lumi").id).toBe("lumi");
    expect(createBot("lumi").name).toBe("Lumi");
  });

  it("beats the statue dummy in a match", () => {
    const { state } = runMatch(createLumiBot(), createBot("statue"), { seed: 9 });
    expect(state.over).toBe(true);
    expect(state.matchWinner).toBe("p1");
    expect(state.p1Wins).toBeGreaterThanOrEqual(2);
  });
});
