import { describe, expect, it } from "vitest";
import { ATTACKS } from "../src/engine/attacks.ts";
import { MAX_HEALTH, ROUND_TIME_TICKS } from "../src/engine/constants.ts";
import { normalizeAction } from "../src/engine/action.ts";
import { overlaps } from "../src/engine/boxes.ts";
import { createMatch, stepMatch } from "../src/engine/sim.ts";
import { observe } from "../src/engine/observe.ts";
import { NEUTRAL_ACTION, type Action } from "../src/engine/types.ts";

const NIL: Action = { ...NEUTRAL_ACTION };
const LEFT: Action = { ...NIL, move: "left" };
const RIGHT: Action = { ...NIL, move: "right" };
const JUMP: Action = { ...NIL, vertical: "jump" };
const CROUCH: Action = { ...NIL, vertical: "crouch" };
const LIGHT: Action = { ...NIL, attack: "light" };
const SPECIAL: Action = { ...NIL, attack: "special" };
const BLOCK: Action = { ...NIL, block: true };

function stepN(state: ReturnType<typeof createMatch>, n: number, a: Action, b: Action): void {
  for (let i = 0; i < n; i++) stepMatch(state, a, b);
}

describe("normalizeAction", () => {
  it("turns garbage into a neutral action and never throws", () => {
    expect(normalizeAction(null)).toEqual(NIL);
    expect(normalizeAction("punch")).toEqual(NIL);
    expect(normalizeAction({ move: "up", attack: "kick", block: "yes" })).toEqual(NIL);
    expect(normalizeAction({ move: "left", vertical: "jump", attack: "light", block: true })).toEqual({
      move: "left",
      vertical: "jump",
      attack: "light",
      block: true,
    });
  });
});

describe("movement", () => {
  it("walks left and right and stops at the walls", () => {
    const s = createMatch({ seed: 1 });
    const start = s.p1.x;
    stepN(s, 10, RIGHT, NIL);
    expect(s.p1.x).toBeGreaterThan(start);
    stepN(s, 400, LEFT, NIL);
    expect(s.p1.x).toBeLessThan(start);
    const wall = s.p1.x;
    stepN(s, 20, LEFT, NIL);
    expect(s.p1.x).toBe(wall);
  });

  it("jumps and lands back on the ground", () => {
    const s = createMatch({ seed: 1 });
    stepMatch(s, JUMP, NIL);
    expect(s.p1.airborne).toBe(true);
    expect(s.p1.vy).toBeLessThan(0);
    let landed = false;
    for (let i = 0; i < 80; i++) {
      stepMatch(s, NIL, NIL);
      if (!s.p1.airborne && s.p1.y === s.p2.y) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
    expect(s.p1.state).not.toBe("jump");
  });

  it("crouch shortens the hurtbox", () => {
    const s = createMatch({ seed: 1 });
    const standH = s.p1.hurtbox.h;
    stepMatch(s, CROUCH, NIL);
    expect(s.p1.state).toBe("crouch");
    expect(s.p1.hurtbox.h).toBeLessThan(standH);
  });
});

describe("combat", () => {
  it("a light in range deals damage to a statue", () => {
    const s = createMatch({ seed: 1 });
    // Walk P1 toward P2 until just inside light range, then punch.
    for (let i = 0; i < 200; i++) {
      const dist = s.p2.x - s.p1.x - s.p1.hurtbox.w;
      if (dist <= ATTACKS.light.range - 2) break;
      stepMatch(s, RIGHT, NIL);
    }
    const hp = s.p2.health;
    stepN(s, ATTACKS.light.startup + ATTACKS.light.active + 1, LIGHT, NIL);
    expect(s.p2.health).toBe(hp - ATTACKS.light.damage);
    expect(s.p2.state).toBe("hitstun");
  });

  it("does not hit when out of range", () => {
    const s = createMatch({ seed: 1 });
    const hp = s.p2.health;
    stepN(s, 20, LIGHT, NIL);
    expect(s.p2.health).toBe(hp);
  });

  it("block turns a hit into chip damage and no hitstun", () => {
    const s = createMatch({ seed: 7 });
    for (let i = 0; i < 200; i++) {
      const dist = s.p2.x - s.p1.x - s.p1.hurtbox.w;
      if (dist <= ATTACKS.light.range - 2) break;
      stepMatch(s, RIGHT, NIL);
    }
    const hp = s.p2.health;
    // Give P2 a tick to raise the block, then P1 swings.
    stepMatch(s, NIL, BLOCK);
    expect(s.p2.blocking).toBe(true);
    stepN(s, ATTACKS.light.startup + ATTACKS.light.active + 1, LIGHT, BLOCK);
    expect(s.p2.health).toBe(hp - ATTACKS.light.chip);
    expect(s.p2.state).not.toBe("hitstun");
    expect(s.p2.health).toBeGreaterThan(hp - ATTACKS.light.damage);
  });

  it("a light hitbox does not re-hit every active frame", () => {
    const s = createMatch({ seed: 3 });
    for (let i = 0; i < 200; i++) {
      const dist = s.p2.x - s.p1.x - s.p1.hurtbox.w;
      if (dist <= ATTACKS.light.range - 2) break;
      stepMatch(s, RIGHT, NIL);
    }
    stepN(s, ATTACKS.light.startup + ATTACKS.light.active + ATTACKS.light.recovery, LIGHT, NIL);
    const hits = s.events.filter((e) => e.type === "hit");
    expect(hits).toHaveLength(1);
  });

  it("rejects a special when meter is empty and spends meter when it is not", () => {
    const s = createMatch({ seed: 4 });
    for (let i = 0; i < 200; i++) {
      const dist = s.p2.x - s.p1.x - s.p1.hurtbox.w;
      if (dist <= ATTACKS.special.range - 4) break;
      stepMatch(s, RIGHT, NIL);
    }
    stepMatch(s, SPECIAL, NIL);
    expect(s.p1.state).not.toBe("attack");
    s.p1.meter = 100;
    stepMatch(s, SPECIAL, NIL);
    expect(s.p1.state).toBe("attack");
    expect(s.p1.attack).toBe("special");
    expect(s.p1.meter).toBe(100 - ATTACKS.special.meterCost);
  });

  it("KO ends the round and awards a win", () => {
    const s = createMatch({ seed: 5 });
    s.p2.health = 10;
    for (let i = 0; i < 200; i++) {
      const dist = s.p2.x - s.p1.x - s.p1.hurtbox.w;
      if (dist <= ATTACKS.light.range - 2) break;
      stepMatch(s, RIGHT, NIL);
    }
    stepN(s, 30, LIGHT, NIL);
    expect(s.p2.health).toBe(0);
    expect(s.phase).toBe("round_end");
    expect(s.p1Wins).toBe(1);
    expect(s.events.some((e) => e.type === "ko")).toBe(true);
  });

  it("first to two rounds wins the match", () => {
    const s = createMatch({ seed: 6 });
    function koP2(state: typeof s) {
      state.p2.health = 10;
      for (let i = 0; i < 200; i++) {
        const dist = state.p2.x - state.p1.x - state.p1.hurtbox.w;
        if (dist <= ATTACKS.light.range - 2) break;
        stepMatch(state, RIGHT, NIL);
      }
      stepN(state, 30, LIGHT, NIL);
    }
    koP2(s);
    expect(s.p1Wins).toBe(1);
    // Linger through the round-end pause.
    stepN(s, 200, NIL, NIL);
    expect(s.phase).toBe("fight");
    expect(s.round.number).toBe(2);
    expect(s.p1.health).toBe(MAX_HEALTH);
    koP2(s);
    expect(s.p1Wins).toBe(2);
    expect(s.over).toBe(true);
    expect(s.matchWinner).toBe("p1");
    expect(s.events.some((e) => e.type === "match_end")).toBe(true);
  });

  it("timeout awards the round to the fighter with more health", () => {
    const s = createMatch({ seed: 8 });
    s.p2.health = s.p2.health - 50;
    s.round.timeLeftTicks = 2;
    stepN(s, 3, NIL, NIL);
    expect(s.phase).toBe("round_end");
    expect(s.round.winner).toBe("p1");
    expect(s.events.some((e) => e.type === "timeout")).toBe(true);
  });
});

describe("observations", () => {
  it("hands each side a protocol v0 observation of itself and the opponent", () => {
    const s = createMatch({ seed: 9 });
    const obs = observe(s, "p1");
    expect(obs.protocol).toBe("afc-obs-v0");
    expect(obs.side).toBe("p1");
    expect(obs.me.id).toBe("p1");
    expect(obs.opponent.id).toBe("p2");
    expect(obs.timeLeftTicks).toBe(ROUND_TIME_TICKS);
  });
});

describe("boxes", () => {
  it("detects overlap and misses", () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe("heavy exists", () => {
  it("has longer reach than light", () => {
    expect(ATTACKS.heavy.range).toBeGreaterThan(ATTACKS.light.range);
    expect(ATTACKS.heavy.damage).toBeGreaterThan(ATTACKS.light.damage);
  });
});
