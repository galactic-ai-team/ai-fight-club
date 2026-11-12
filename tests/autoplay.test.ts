import { describe, expect, it } from "vitest";
import { BUILTIN_BOTS } from "../src/bots/index.ts";
import {
  AUTO_PAIRINGS,
  SPECTATOR_CHARACTERS,
  characterPairAt,
  pairingAt,
  roundRobinPairings,
} from "../src/spectator/autoplay.ts";

describe("roundRobinPairings", () => {
  it("pairs every built-in bot against every other bot from both sides", () => {
    const pairs = roundRobinPairings(BUILTIN_BOTS);
    expect(pairs).toHaveLength(BUILTIN_BOTS.length * (BUILTIN_BOTS.length - 1));
    expect(pairs.every(([a, b]) => a !== b)).toBe(true);
    for (const id of BUILTIN_BOTS) {
      expect(pairs.some(([a]) => a === id)).toBe(true);
      expect(pairs.some(([, b]) => b === id)).toBe(true);
    }
  });

  it("returns an empty list for a single bot", () => {
    expect(roundRobinPairings(["only"])).toEqual([]);
  });
});

describe("pairingAt", () => {
  it("cycles through AUTO_PAIRINGS and wraps", () => {
    expect(pairingAt(0)).toEqual(AUTO_PAIRINGS[0]);
    expect(pairingAt(AUTO_PAIRINGS.length)).toEqual(AUTO_PAIRINGS[0]);
    expect(pairingAt(AUTO_PAIRINGS.length + 1)).toEqual(AUTO_PAIRINGS[1]);
    expect(pairingAt(-1)).toEqual(AUTO_PAIRINGS[AUTO_PAIRINGS.length - 1]);
  });
});

describe("characterPairAt", () => {
  it("always returns two distinct original characters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 32; i++) {
      const [a, b] = characterPairAt(i);
      expect(SPECTATOR_CHARACTERS).toContain(a);
      expect(SPECTATOR_CHARACTERS).toContain(b);
      expect(a).not.toBe(b);
      seen.add(a);
      seen.add(b);
    }
    expect(seen.size).toBe(SPECTATOR_CHARACTERS.length);
  });
});
