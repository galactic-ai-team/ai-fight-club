import { describe, expect, it } from "vitest";
import { createRandomBot, createRusherBot } from "../src/bots/index.ts";
import { canonicalState, stateHash } from "../src/engine/canonical.ts";
import { createMatch, stepMatch } from "../src/engine/sim.ts";
import { observe } from "../src/engine/observe.ts";
import { playback } from "../src/engine/replay.ts";
import { runMatch } from "../src/engine/run.ts";
import { NEUTRAL_ACTION, type Action } from "../src/engine/types.ts";

function scripted(inputs: Action[]): { act: () => Action } {
  let i = 0;
  return {
    act() {
      const a = inputs[i] ?? NEUTRAL_ACTION;
      i += 1;
      return a;
    },
  };
}

describe("determinism", () => {
  it("two fresh matches with the same seed and inputs stay byte-identical", () => {
    const inputs: Action[] = [];
    const bot = createRandomBot();
    bot.start?.({ side: "p1", seed: 42, opponentId: "x" });
    // Build a 600-tick script from a seeded bot, then replay it twice.
    const s0 = createMatch({ seed: 99 });
    for (let t = 0; t < 600; t++) {
      inputs.push(bot.act(observe(s0, "p1")));
    }

    const a = createMatch({ seed: 12345 });
    const b = createMatch({ seed: 12345 });
    for (const act of inputs) {
      stepMatch(a, act, NEUTRAL_ACTION);
      stepMatch(b, act, NEUTRAL_ACTION);
    }
    expect(canonicalState(a)).toBe(canonicalState(b));
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it("runMatch + playback of the recorded replay is identical", () => {
    const p1 = createRusherBot();
    const p2 = createRandomBot();
    const { state, replay } = runMatch(p1, p2, { seed: 20261111 });
    const replayed = playback(replay);
    expect(canonicalState(replayed)).toBe(canonicalState(state));
    expect(replayed.matchWinner).toBe(state.matchWinner);
    expect(replayed.p1Wins).toBe(state.p1Wins);
    expect(replayed.p2Wins).toBe(state.p2Wins);
  });

  it("the same bots and seed produce the same match twice", () => {
    const a = runMatch(createRusherBot(), createRandomBot(), { seed: 777 });
    const b = runMatch(createRusherBot(), createRandomBot(), { seed: 777 });
    expect(canonicalState(a.state)).toBe(canonicalState(b.state));
    expect(a.replay.inputs.length).toBe(b.replay.inputs.length);
  });

  it("different seeds diverge", () => {
    const a = runMatch(createRandomBot(), createRandomBot(), { seed: 1 });
    const b = runMatch(createRandomBot(), createRandomBot(), { seed: 2 });
    expect(canonicalState(a.state)).not.toBe(canonicalState(b.state));
  });
});

describe("script helper", () => {
  it("exists so leftover helpers typecheck", () => {
    const s = scripted([NEUTRAL_ACTION]);
    expect(s.act().attack).toBe("none");
  });
});
