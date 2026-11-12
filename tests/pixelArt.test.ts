import { describe, expect, it } from "vitest";
import { createMatch } from "../src/engine/sim.ts";
import { fighterToSpriteInput } from "../src/spectator/engineBridge.ts";
import {
  lookupSpriteFrame,
  resolveCanonicalFighterId,
  resolveFighterPose,
  type CanonicalFighterId,
  type FighterPose,
} from "../src/spectator/pixelArt.ts";

const IDS: CanonicalFighterId[] = ["ion", "quark", "vexel", "cadence9"];
const CELL = /^[OPSAGVE.]$/;

function assertGrid(grid: string[], label: string): void {
  expect(grid.length, `${label} rows`).toBe(18);
  for (const row of grid) {
    expect(row.length, `${label} cols`).toBe(16);
    for (const ch of row) {
      expect(ch, `${label} cell ${ch}`).toMatch(CELL);
    }
  }
}

describe("resolveCanonicalFighterId", () => {
  it("maps original character names, including punctuation", () => {
    expect(resolveCanonicalFighterId("Ion")).toBe("ion");
    expect(resolveCanonicalFighterId("QUARK")).toBe("quark");
    expect(resolveCanonicalFighterId("Vexel")).toBe("vexel");
    expect(resolveCanonicalFighterId("Cadence-9")).toBe("cadence9");
    expect(resolveCanonicalFighterId("cadence 9")).toBe("cadence9");
  });

  it("hashes unknown names deterministically onto the original roster", () => {
    const a = resolveCanonicalFighterId("rusher");
    expect(IDS).toContain(a);
    expect(resolveCanonicalFighterId("rusher")).toBe(a);
    expect(resolveCanonicalFighterId("totally-new-bot")).toBe(
      resolveCanonicalFighterId("totally-new-bot"),
    );
  });
});

describe("lookupSpriteFrame", () => {
  it("returns 16×18 original matrices for every starter fighter and base pose", () => {
    const poses: FighterPose[] = ["idle", "walk", "jump", "attack", "hit", "ko", "crouch", "block"];
    for (const id of IDS) {
      for (const pose of poses) {
        assertGrid(lookupSpriteFrame(id, pose, 0), `${id}/${pose}@0`);
      }
    }
  });

  it("alternates walk and idle every 6 ticks, and uses distinct attack/hit frames", () => {
    const idle = lookupSpriteFrame("ion", "idle", 0);
    const walk0 = lookupSpriteFrame("ion", "walk", 0);
    const walk6 = lookupSpriteFrame("ion", "walk", 6);
    const jump0 = lookupSpriteFrame("ion", "jump", 0);
    const attack = lookupSpriteFrame("ion", "attack", 3);
    const hit = lookupSpriteFrame("ion", "hit", 0);
    const ko = lookupSpriteFrame("ion", "ko", 0);

    expect(walk0).not.toEqual(idle);
    expect(walk0).toEqual(jump0);
    expect(walk6).toEqual(idle);
    expect(attack).not.toEqual(idle);
    expect(attack.some((row) => row.includes("E"))).toBe(true);
    expect(hit).toEqual(ko);
    expect(hit).not.toEqual(idle);
  });
});

describe("resolveFighterPose", () => {
  it("derives poses from engine-like fighter state", () => {
    expect(resolveFighterPose({ x: 0, y: 0, health: 0 })).toBe("ko");
    expect(resolveFighterPose({ x: 0, y: 0, state: "hitstun" })).toBe("hit");
    expect(resolveFighterPose({ x: 0, y: 0, state: "attack" })).toBe("attack");
    expect(resolveFighterPose({ x: 0, y: 0, state: "block", blocking: true })).toBe("block");
    expect(resolveFighterPose({ x: 0, y: 0, state: "jump" })).toBe("jump");
    expect(resolveFighterPose({ x: 0, y: 0, state: "walk" })).toBe("walk");
    expect(resolveFighterPose({ x: 0, y: 0, vx: 4 })).toBe("walk");
    expect(resolveFighterPose({ x: 0, y: 0, state: "idle" })).toBe("idle");
  });
});

describe("fighterToSpriteInput", () => {
  it("maps an engine fighter onto sprite input using character name and foot position", () => {
    const match = createMatch({ seed: 1 });
    const input = fighterToSpriteInput(match.p1);
    expect(input.id).toBe(match.p1.character);
    expect(input.x).toBe(match.p1.x);
    expect(input.y).toBe(match.p1.y);
    expect(input.facing).toBe(match.p1.facing);
    expect(input.state).toBe(match.p1.state);
    expect(resolveCanonicalFighterId(input.id)).toBe("ion");
  });
});
