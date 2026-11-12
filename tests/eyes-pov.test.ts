import { describe, expect, it } from "vitest";
import { createMatch, stepMatch } from "../src/engine/sim.ts";
import { NEUTRAL_ACTION, type Action } from "../src/engine/types.ts";
import {
  POV_HEIGHT,
  POV_WIDTH,
  describePov,
  encodePng,
  encodePovPng,
  isPng,
  renderPov,
  renderPovPng,
} from "../src/eyes/index.ts";

const NIL: Action = { ...NEUTRAL_ACTION };
const JUMP: Action = { ...NIL, vertical: "jump" };
const LIGHT: Action = { ...NIL, attack: "light" };
const RIGHT: Action = { ...NIL, move: "right" };
const LEFT: Action = { ...NIL, move: "left" };

function countNear(pixels: Uint8Array, target: { r: number; g: number; b: number }, tol = 40): number {
  let n = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (
      Math.abs(pixels[i]! - target.r) <= tol &&
      Math.abs(pixels[i + 1]! - target.g) <= tol &&
      Math.abs(pixels[i + 2]! - target.b) <= tol
    ) {
      n++;
    }
  }
  return n;
}

describe("encodePng", () => {
  it("writes a valid PNG signature and rejects a bad buffer size", () => {
    const pixels = new Uint8Array(4 * 2 * 2);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255;
      pixels[i + 3] = 255;
    }
    const png = encodePng(2, 2, pixels);
    expect(isPng(png)).toBe(true);
    expect(png[1]).toBe(80); // P
    expect(png[2]).toBe(78); // N
    expect(png[3]).toBe(71); // G
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow(/expected 16/);
  });
});

describe("renderPov", () => {
  it("renders a 160x120 RGBA frame from each side at spawn", () => {
    const s = createMatch({ seed: 7, p1Character: "Ion", p2Character: "Quark" });
    const p1 = renderPov(s, "p1");
    const p2 = renderPov(s, "p2");
    expect(p1.width).toBe(POV_WIDTH);
    expect(p1.height).toBe(POV_HEIGHT);
    expect(p1.pixels.length).toBe(POV_WIDTH * POV_HEIGHT * 4);
    expect(p1.visibility.opponentVisible).toBe(true);
    expect(p2.visibility.opponentVisible).toBe(true);
    expect(p1.visibility.forwardDistance).toBe(480);
    expect(p2.visibility.forwardDistance).toBe(480);
    expect(p1.visibility.behindThreat).toBe(false);
    expect(isPng(encodePovPng(p1))).toBe(true);
    expect(isPng(renderPovPng(s, "p2"))).toBe(true);
  });

  it("is deterministic: same state yields identical PNG bytes", () => {
    const s = createMatch({ seed: 11, p1Character: "Ion", p2Character: "Vexel" });
    const a = renderPovPng(s, "p1");
    const b = renderPovPng(s, "p1");
    expect(a.length).toBe(b.length);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("hides the opponent when they are behind the camera (perception mask)", () => {
    const s = createMatch({ seed: 3, p1Character: "Ion", p2Character: "Quark" });
    const facing = renderPov(s, "p1");
    // Quark primary #F72585 — present while they stand in front.
    const quark = { r: 0xf7, g: 0x25, b: 0x85 };
    expect(countNear(facing.pixels, quark, 50)).toBeGreaterThan(30);

    s.p1.facing = -1;
    const vis = describePov(s, "p1");
    expect(vis.opponentVisible).toBe(false);
    expect(vis.behindThreat).toBe(true);
    expect(vis.forwardDistance).toBeLessThan(0);
    const behind = renderPov(s, "p1");
    expect(behind.visibility.opponentVisible).toBe(false);
    expect(countNear(behind.pixels, quark, 50)).toBe(0);
  });

  it("telegraphs an incoming attack and a jump in the visibility record", () => {
    const s = createMatch({ seed: 5, p1Character: "Ion", p2Character: "Quark" });
    // Walk P1 in, then have P2 start a light.
    for (let i = 0; i < 80; i++) stepMatch(s, RIGHT, LEFT);
    stepMatch(s, NIL, LIGHT);
    const vis = describePov(s, "p1");
    expect(vis.opponentVisible).toBe(true);
    expect(vis.incomingAttack).toBe("light");
    expect(vis.incomingPhase).toBe("startup");

    const jumped = createMatch({ seed: 5, p1Character: "Ion", p2Character: "Quark" });
    stepMatch(jumped, NIL, JUMP);
    const jvis = describePov(jumped, "p1");
    expect(jvis.opponentAirborne).toBe(true);
    expect(jvis.opponentState).toBe("jump");
  });

  it("omits the debug health bar in vision-only mode and includes it otherwise", () => {
    const s = createMatch({ seed: 9, p1Character: "Ion", p2Character: "Quark" });
    const hidden = renderPov(s, "p1", { visionOnly: true });
    const shown = renderPov(s, "p1", { visionOnly: false });
    // Debug HUD paints a 2px green bar at y=2. Vision-only should not.
    const green = { r: 80, g: 220, b: 140 };
    function barPixels(pixels: Uint8Array, width: number): number {
      let n = 0;
      for (let x = 0; x < width; x++) {
        const i = (2 * width + x) * 4;
        if (
          Math.abs(pixels[i]! - green.r) <= 5 &&
          Math.abs(pixels[i + 1]! - green.g) <= 5 &&
          Math.abs(pixels[i + 2]! - green.b) <= 5
        ) {
          n++;
        }
      }
      return n;
    }
    expect(barPixels(hidden.pixels, hidden.width)).toBe(0);
    expect(barPixels(shown.pixels, shown.width)).toBeGreaterThan(4);
  });
});
