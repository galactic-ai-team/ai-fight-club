import { describe, expect, it } from "vitest";
import { createRandomBot, createRusherBot, createStatueBot } from "../src/bots/index.ts";
import { normalizeAction } from "../src/engine/action.ts";
import { ATTACKS } from "../src/engine/attacks.ts";
import { canonicalState, stateHash } from "../src/engine/canonical.ts";
import { cloneState, restoreMatchState, serializeMatchState } from "../src/engine/state.ts";
import { createMatch, stepMatch } from "../src/engine/sim.ts";
import { parseReplay, playback, serializeReplay } from "../src/engine/replay.ts";
import { runMatch } from "../src/engine/run.ts";
import { NEUTRAL_ACTION, type Action, type MatchState, type Side } from "../src/engine/types.ts";

const N: Action = { ...NEUTRAL_ACTION };
const LIGHT: Action = { ...N, attack: "light" };
const BLOCK: Action = { ...N, block: true };

function stepN(state: MatchState, ticks: number, p1: Action, p2: Action): void {
  for (let i = 0; i < ticks; i++) stepMatch(state, p1, p2);
}

function inRange(seed: number): MatchState {
  const state = createMatch({ seed });
  state.p1.x = 440;
  state.p2.x = 500;
  // Boxes are refreshed inside stepMatch, before collisions.
  return state;
}

function actionAt(tick: number, side: Side): Action {
  const phase = tick % 101;
  return {
    move: side === "p1" ? "left" : "right",
    vertical: phase === 0 ? "jump" : phase < 7 ? "crouch" : "none",
    attack: phase === 20 ? "light" : phase === 50 ? "heavy" : "none",
    block: phase >= 80 && phase < 86,
  };
}

describe("M1 frame combat and safety regression", () => {
  it("resolves both attacks in a same-tick trade, without canceling the second", () => {
    const state = inRange(99);
    stepMatch(state, LIGHT, LIGHT);
    stepN(state, ATTACKS.light.startup, N, N);
    expect(state.p1.health).toBe(1000 - ATTACKS.light.damage);
    expect(state.p2.health).toBe(1000 - ATTACKS.light.damage);
    const hits = state.events.filter((event) => event.type === "hit");
    expect(hits).toHaveLength(2);
    expect(hits[0]?.tick).toBe(hits[1]?.tick);
    expect(state.p1.attackConnected).toBe(true);
    expect(state.p2.attackConnected).toBe(true);
    expect(state.p1.hitbox).toBeNull();
    expect(state.p2.hitbox).toBeNull();
  });

  it("simultaneous lethal hits are a draw rather than a one-sided KO", () => {
    const state = inRange(100);
    state.p1.health = 10;
    state.p2.health = 10;
    stepMatch(state, LIGHT, LIGHT);
    stepN(state, ATTACKS.light.startup, N, N);
    expect(state.p1.health).toBe(0);
    expect(state.p2.health).toBe(0);
    expect(state.round.winner).toBe("draw");
    expect(state.p1Wins + state.p2Wins).toBe(0);
    expect(state.events.filter((event) => event.type === "ko")).toHaveLength(2);
  });

  it("a blocked one-shot hit causes chip and blockstun but no hitstun", () => {
    const state = inRange(31);
    stepMatch(state, LIGHT, BLOCK);
    stepN(state, ATTACKS.light.startup + ATTACKS.light.active, N, BLOCK);
    expect(state.p2.health).toBe(1000 - ATTACKS.light.chip);
    expect(state.p2.hitstun).toBe(0);
    expect(state.p2.blockstun).toBeGreaterThan(0);
    expect(state.events.filter((event) => event.type === "hit")).toHaveLength(1);
  });

  it("out-of-range attacks miss, and KO ends a round with the expected winner", () => {
    const miss = createMatch({ seed: 11 });
    stepMatch(miss, LIGHT, N);
    stepN(miss, ATTACKS.light.startup + ATTACKS.light.active, N, N);
    expect(miss.p2.health).toBe(1000);
    expect(miss.events.filter((event) => event.type === "hit")).toHaveLength(0);

    const ko = inRange(12);
    ko.p2.health = 1;
    stepMatch(ko, LIGHT, N);
    stepN(ko, ATTACKS.light.startup, N, N);
    expect(ko.phase).toBe("round_end");
    expect(ko.p1Wins).toBe(1);
    expect(ko.events.some((event) => event.type === "ko" && event.winner === "p1")).toBe(true);
  });

  it("timeout resolves by remaining health and an equal-health timeout draws", () => {
    const lead = createMatch({ seed: 12 });
    lead.p2.health -= 10;
    lead.round.timeLeftTicks = 1;
    stepMatch(lead, N, N);
    expect(lead.round.winner).toBe("p1");
    expect(lead.events.some((event) => event.type === "timeout")).toBe(true);

    const draw = createMatch({ seed: 13 });
    draw.round.timeLeftTicks = 1;
    stepMatch(draw, N, N);
    expect(draw.round.winner).toBe("draw");
    expect(draw.p1Wins + draw.p2Wins).toBe(0);
  });

  it("normalizeAction contains malformed primitives, extra fields and throwing getters", () => {
    expect(normalizeAction(undefined)).toEqual(N);
    expect(normalizeAction([])).toEqual(N);
    expect(normalizeAction({ move: "up", attack: "launch", block: "true", extra: 42 })).toEqual(N);
    const hostile = Object.defineProperty({}, "move", {
      get() { throw new Error("hostile action"); },
    });
    expect(() => normalizeAction(hostile)).not.toThrow();
    expect(normalizeAction(hostile)).toEqual(N);
  });
});

describe("M1 canonical state, snapshot and replay determinism", () => {
  it("runs 5,401 scripted ticks twice with identical canonical state and hashes", () => {
    const a = createMatch({ seed: 20261111 });
    const b = createMatch({ seed: 20261111 });
    let resumed: MatchState | null = null;
    for (let tick = 0; tick < 5401; tick++) {
      const one = actionAt(tick, "p1");
      const two = actionAt(tick, "p2");
      stepMatch(a, one, two);
      stepMatch(b, one, two);
      if (tick === 2800) {
        const serialized = serializeMatchState(a);
        resumed = restoreMatchState(serialized);
        expect(serializeMatchState(resumed)).toBe(serialized);
        expect(resumed).not.toBe(a);
        expect(resumed.p1).not.toBe(a.p1);
        expect(resumed.p1.hurtbox).not.toBe(a.p1.hurtbox);
      } else if (tick > 2800 && resumed) {
        stepMatch(resumed, one, two);
      }
      if (tick % 131 === 0) {
        expect(canonicalState(a)).toBe(canonicalState(b));
        expect(stateHash(a)).toBe(stateHash(b));
      }
    }
    expect(a.tick).toBe(5401);
    expect(a.round.number).toBeGreaterThan(1);
    expect(canonicalState(a)).toBe(canonicalState(b));
    expect(stateHash(a)).toBe(stateHash(b));
    expect(canonicalState(resumed!)).toBe(canonicalState(a));
  });

  it("clone is deep and canonical state accounts for event history and limits", () => {
    const original = inRange(77);
    stepMatch(original, LIGHT, LIGHT);
    stepN(original, ATTACKS.light.startup, N, N);
    const copy = cloneState(original);
    expect(copy).toEqual(original);
    expect(copy.events).not.toBe(original.events);
    expect(copy.lastEvents).not.toBe(original.lastEvents);
    expect(copy.events[0]).not.toBe(original.events[0]);
    const previous = canonicalState(original);
    copy.p1.maxHealth += 1;
    expect(canonicalState(copy)).not.toBe(previous);
    copy.p1.maxHealth -= 1;
    copy.events.pop();
    expect(canonicalState(copy)).not.toBe(previous);
    expect(canonicalState(original)).toBe(previous);
  });

  it("rejects incompatible or malformed snapshot envelopes", () => {
    const sample = serializeMatchState(createMatch({ seed: 9 }));
    expect(() => restoreMatchState(sample.replace('"version":1', '"version":99'))).toThrow();
    expect(() => restoreMatchState('{"version":1,"state":{"tick":"oops"}}')).toThrow();
    expect(() => restoreMatchState("not JSON")).toThrow();
  });

  it.each([1, 42, 20261111])("runMatch/replay across round transitions and winner, seed %i", (seed) => {
    const { state, replay } = runMatch(createRusherBot(), createStatueBot(), { seed });
    expect(state.over).toBe(true);
    expect(state.matchWinner).toBe("p1");
    expect(state.p1Wins).toBe(2);
    expect(state.events.filter((event) => event.type === "round_end")).toHaveLength(2);
    const parsed = parseReplay(serializeReplay(replay));
    const watched = playback(parsed);
    expect(canonicalState(watched)).toBe(canonicalState(state));
    expect(stateHash(watched)).toBe(stateHash(state));
    expect(watched.round).toEqual(state.round);
    expect(watched.matchWinner).toBe(state.matchWinner);
    expect(replay.result).toEqual({ winner: state.matchWinner, p1Wins: state.p1Wins, p2Wins: state.p2Wins, ticks: state.tick });
  });

  it("round-trips runMatch against a stochastic seeded opponent", () => {
    const { state, replay } = runMatch(createRusherBot(), createRandomBot(), { seed: 1234 });
    expect(canonicalState(playback(parseReplay(serializeReplay(replay))))).toBe(canonicalState(state));
  });
});

describe("replay v1 input normalization", () => {
  it("reads untrusted action getters once per frame before recording and stepping", () => {
    let reads = 0;
    const dynamic = {
      id: "getter-bot",
      name: "Getter Bot",
      act(): Action {
        return {
          get move() {
            reads++;
            return reads % 2 === 1 ? "left" as const : "right" as const;
          },
          vertical: "none",
          attack: "none",
          block: false,
        };
      },
    };
    const result = runMatch(dynamic, createStatueBot(), { seed: 555 });
    expect(reads).toBe(result.replay.inputs.length);
    expect(canonicalState(playback(result.replay))).toBe(canonicalState(result.state));
  });

  it("rejects incompatible replay headers and normalizes junk button fields", () => {
    const { replay } = runMatch(createRusherBot(), createStatueBot(), { seed: 5 });
    const invalidVersion = { ...replay, version: 99 };
    expect(() => parseReplay(JSON.stringify(invalidVersion))).toThrow(/unsupported replay version/);
    const invalidProtocol = { ...replay, protocol: "not-v0" };
    expect(() => parseReplay(JSON.stringify(invalidProtocol))).toThrow(/unsupported replay protocol/);
    const dirty = { ...replay, inputs: [[{ attack: "hack", move: "up" }, { block: true }]] };
    const clean = parseReplay(JSON.stringify(dirty));
    expect(clean.inputs[0]?.[0]).toEqual(N);
    expect(clean.inputs[0]?.[1]).toEqual(BLOCK);
  });
});
