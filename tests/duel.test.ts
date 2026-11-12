import { describe, expect, it } from "vitest";
import { createBot, createGpt6Bot, createLumiBot, gpt6Ready } from "../src/bots/index.ts";
import { ready as gpt6FileReady, name as gpt6Name } from "../src/bots/gpt6.ts";
import { runMatch } from "../src/engine/run.ts";
import { createMatch } from "../src/engine/sim.ts";
import { observe } from "../src/engine/observe.ts";
import {
  DUEL_TITLE,
  GPT6_DISPLAY_NAME,
  LUMI_DISPLAY_NAME,
  WAITING_MESSAGE,
  applyDuelMatch,
  applyHeadToHead,
  duelScoreLine,
  duelSeedFromSearch,
  duelStatusLine,
  emptyDuelSet,
  emptyHeadToHead,
  gpt6IsReady,
  headToHeadLine,
  hudName,
  isDuelQuery,
  loadHeadToHead,
  newVisitSeed,
  saveHeadToHead,
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
    expect(LUMI_DISPLAY_NAME).toBe("Lumi");
    expect(GPT6_DISPLAY_NAME).toBe("Vanta Coil (GPT-6)");
    expect(duelStatusLine({ ready: false, set: emptyDuelSet() })).toBe(WAITING_MESSAGE);
    expect(duelStatusLine({ ready: true, set: emptyDuelSet(), live: true })).toBe(
      "First to 3 · match 1",
    );
    expect(hudName("lumi", "Ion")).toBe("Ion · Lumi");
    expect(hudName("gpt6", "Quark")).toBe("Quark · Vanta Coil (GPT-6)");
    expect(winnerToDuelFighter("p1", "p1")).toBe("lumi");
    expect(winnerToDuelFighter("p2", "p1")).toBe("gpt6");
  });

  it("pins ?seed=N and otherwise varies the visit seed", () => {
    expect(duelSeedFromSearch("?duel=lumi-gpt6")).toBeNull();
    expect(duelSeedFromSearch("?duel=lumi-gpt6&seed=42")).toBe(42);
    expect(duelSeedFromSearch("seed=7")).toBe(7);
    expect(duelSeedFromSearch("?seed=nope")).toBeNull();
    expect(newVisitSeed(1_700_000_000_123)).toBe((1_700_000_000_123 >>> 0) % 2_000_000_000);
    expect(newVisitSeed(1_700_000_000_123)).not.toBe(newVisitSeed(1_700_000_000_999));
    expect(newVisitSeed(0)).toBe(1);
  });

  it("tracks a running head-to-head record", () => {
    let h2h = emptyHeadToHead();
    h2h = applyHeadToHead(h2h, "gpt6");
    h2h = applyHeadToHead(h2h, "gpt6");
    h2h = applyHeadToHead(h2h, "lumi");
    expect(headToHeadLine(h2h)).toBe("Head-to-head: Lumi 1 – 2 Vanta Coil (GPT-6)");
    const store: Record<string, string> = {};
    saveHeadToHead(
      { setItem: (k, v) => { store[k] = v; } },
      h2h,
    );
    expect(loadHeadToHead({ getItem: (k) => store[k] ?? null })).toEqual(h2h);
    expect(loadHeadToHead({ getItem: () => null })).toEqual(emptyHeadToHead());
  });
});

describe("gpt6 fighter slot", () => {
  it("is ready and named Vanta Coil", () => {
    expect(gpt6FileReady).toBe(true);
    expect(gpt6Ready).toBe(true);
    expect(gpt6IsReady()).toBe(true);
    expect(gpt6Name).toBe("Vanta Coil");
    const bot = createGpt6Bot();
    expect(bot.id).toBe("gpt6");
    expect(bot.name).toBe("Vanta Coil");
    expect(createBot("gpt6").id).toBe("gpt6");
  });

  it("is deterministic for a given observation stream", () => {
    const a = createGpt6Bot();
    const b = createGpt6Bot();
    a.start?.({ side: "p2", seed: 11, opponentId: "lumi" });
    b.start?.({ side: "p2", seed: 11, opponentId: "lumi" });
    const s = createMatch({ seed: 11 });
    for (let i = 0; i < 80; i++) {
      const obs = observe(s, "p2");
      expect(a.act(obs)).toEqual(b.act(obs));
    }
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
