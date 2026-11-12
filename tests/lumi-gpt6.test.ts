import { describe, expect, it } from "vitest";
import { createBot, createGpt6Bot, createLumiBot, gpt6Ready } from "../src/bots/index.ts";
import { ready as gpt6FileReady, name as gpt6Name } from "../src/bots/gpt6.ts";
import { runMatch } from "../src/engine/run.ts";
import { createMatch } from "../src/engine/sim.ts";
import { observe } from "../src/engine/observe.ts";
import { createCommanderAutopilot, initialFromBotId } from "../src/commander/autopilot.ts";
import { stepMatch } from "../src/engine/sim.ts";

describe("gpt6 fighter slot", () => {
  it("is ready and named Vanta Coil", () => {
    expect(gpt6FileReady).toBe(true);
    expect(gpt6Ready).toBe(true);
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

describe("commander autopilot wraps the AI's own bot", () => {
  it("uses Lumi's bot until a stance command is sent, then follows the command", () => {
    const raw = createLumiBot();
    const wrapped = createCommanderAutopilot({
      id: "p1",
      initial: initialFromBotId("lumi"),
      underlying: createLumiBot(),
    });
    raw.start?.({ side: "p1", seed: 7, opponentId: "gpt6" });
    wrapped.start?.({ side: "p1", seed: 7, opponentId: "gpt6" });
    const s = createMatch({ seed: 7 });
    const before = wrapped.act(observe(s, "p1"));
    expect(before).toEqual(raw.act(observe(s, "p1")));
    wrapped.setCommand({ stance: "turtle", aggression: 0, spacing: 280, taunt: "hold" }, s.tick);
    // After a turtle command, the wrapper should prefer blocking or backing off,
    // not matching the rusher-style raw Lumi bot.
    let blocked = 0;
    let rawAttack = 0;
    const a = createMatch({ seed: 7 });
    const raw2 = createLumiBot();
    raw2.start?.({ side: "p1", seed: 7, opponentId: "gpt6" });
    wrapped.setCommand({ stance: "turtle", aggression: 0, spacing: 280 }, 0);
    for (let i = 0; i < 120; i++) {
      const o = observe(a, "p1");
      const wa = wrapped.act(o);
      const ra = raw2.act(o);
      if (wa.block) blocked += 1;
      if (ra.attack !== "none") rawAttack += 1;
      stepMatch(a, wa, { move: "none", vertical: "none", attack: "none", block: false, switch: false, burst: false });
    }
    expect(blocked).toBeGreaterThan(10);
  });
});
