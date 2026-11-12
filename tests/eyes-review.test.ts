import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { createRusherBot, createStatueBot } from "../src/bots/index.ts";
import { appendInput, emptyReplay } from "../src/engine/replay.ts";
import { runMatch } from "../src/engine/run.ts";
import { createMatch, stepMatch } from "../src/engine/sim.ts";
import { NEUTRAL_ACTION, type Action } from "../src/engine/types.ts";
import { isPng } from "../src/eyes/index.ts";
import {
  applyReview,
  buildReviewStrip,
  suggestReviewPrompt,
  type ReviewNotesUpdate,
  type ReviewStrip,
} from "../src/eyes/review.ts";

const NIL: Action = { ...NEUTRAL_ACTION };
const RIGHT: Action = { ...NIL, move: "right" };
const LEFT: Action = { ...NIL, move: "left" };
const LIGHT: Action = { ...NIL, attack: "light" };

/** Short scripted replay: walk in for 80 ticks, P1 throws a light, then neutral. */
function scriptedReplay() {
  const replay = emptyReplay({
    seed: 7,
    p1BotId: "rusher",
    p2BotId: "statue",
    p1Character: "Ion",
    p2Character: "Quark",
  });
  for (let i = 0; i < 80; i++) appendInput(replay, RIGHT, LEFT);
  appendInput(replay, LIGHT, NIL);
  for (let i = 0; i < 30; i++) appendInput(replay, NIL, NIL);
  return replay;
}

describe("buildReviewStrip", () => {
  it("includes interval frames plus hit / round_end / match_end on a full match, deterministically", () => {
    const { state, replay } = runMatch(createRusherBot(), createStatueBot(), { seed: 20261111 });
    expect(state.matchWinner).toBe("p1");
    const a = buildReviewStrip(replay, "p1");
    const b = buildReviewStrip(replay, "p1");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    const ticks = a.frames.map((f) => f.tick);
    expect(ticks).toContain(0);
    expect(ticks).toContain(30);
    expect(ticks).toContain(60);
    expect(a.frames.some((f) => f.reason === "hit")).toBe(true);
    expect(a.frames.some((f) => f.reason === "round_end")).toBe(true);
    expect(a.frames.some((f) => f.reason === "match_end")).toBe(true);
    // One frame per tick at most, in tick order.
    expect(ticks).toEqual([...ticks].sort((x, y) => x - y));
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(a.result).toEqual({
      winner: state.matchWinner,
      p1Wins: state.p1Wins,
      p2Wins: state.p2Wins,
      ticks: state.tick,
    });
    expect(a.frames.every((f) => f.png === undefined)).toBe(true);
  });

  it("attaches deterministic PNG bytes when asked", () => {
    const replay = scriptedReplay();
    const a = buildReviewStrip(replay, "p1", { includePng: true });
    const b = buildReviewStrip(replay, "p1", { includePng: true });
    expect(a.frames.length).toBeGreaterThan(0);
    for (const frame of a.frames) {
      expect(frame.png).toBeDefined();
      expect(isPng(frame.png!)).toBe(true);
    }
    expect(a.frames.map((f) => Array.from(f.png!))).toEqual(b.frames.map((f) => Array.from(f.png!)));
    // The stored-block zlib stream must actually inflate to the raw rows.
    const png = a.frames[0]!.png!;
    let offset = 8;
    let idat: Uint8Array | null = null;
    while (offset + 8 <= png.length) {
      const len = (png[offset]! << 24) | (png[offset + 1]! << 16) | (png[offset + 2]! << 8) | png[offset + 3]!;
      const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
      if (type === "IDAT") idat = png.subarray(offset + 8, offset + 8 + len);
      offset += 12 + len;
    }
    expect(idat).not.toBeNull();
    expect(inflateSync(idat!).length).toBe((160 * 4 + 1) * 120);
  });

  it("adds a frame for a provided command tick, only for the reviewed side", () => {
    const replay = scriptedReplay();
    const strip = buildReviewStrip(replay, "p1", {
      commandTicks: [{ tick: 45, side: "p1" }, 70, { tick: 50, side: "p2" }],
    });
    const byTick = new Map(strip.frames.map((f) => [f.tick, f.reason]));
    expect(byTick.get(45)).toBe("command");
    expect(byTick.get(70)).toBe("command");
    // Tick 50 is a P2 command, not a P1 moment, and not an interval tick.
    expect(byTick.has(50)).toBe(false);
  });

  it("works from a single live MatchState and from snapshots", () => {
    const state = createMatch({ seed: 5, p1Character: "Ion", p2Character: "Quark" });
    for (let i = 0; i < 40; i++) stepMatch(state, RIGHT, LEFT);
    const strip = buildReviewStrip(state, "p1");
    expect(strip.frames.length).toBeGreaterThan(0);
    expect(strip.frames[strip.frames.length - 1]!.tick).toBe(state.tick);
    expect(strip.result.ticks).toBe(state.tick);
  });

  it("rejects a bad interval", () => {
    expect(() => buildReviewStrip(scriptedReplay(), "p1", { everyTicks: 0 })).toThrow(/everyTicks/);
  });
});

describe("suggestReviewPrompt", () => {
  function stripWithFlags(): ReviewStrip {
    return {
      side: "p1",
      seed: 7,
      frames: [
        {
          tick: 0,
          side: "p1",
          reason: "interval",
          visibility: {
            opponentVisible: false,
            forwardDistance: -120,
            opponentAirborne: false,
            opponentState: "walk",
            incomingAttack: null,
            incomingPhase: null,
            behindThreat: true,
            wallAhead: 0,
          },
        },
        {
          tick: 30,
          side: "p1",
          reason: "hit",
          visibility: {
            opponentVisible: true,
            forwardDistance: 96,
            opponentAirborne: false,
            opponentState: "attack",
            incomingAttack: "heavy",
            incomingPhase: "active",
            behindThreat: false,
            wallAhead: 0,
          },
        },
        {
          tick: 60,
          side: "p1",
          reason: "round_end",
          visibility: {
            opponentVisible: true,
            forwardDistance: 200,
            opponentAirborne: false,
            opponentState: "idle",
            incomingAttack: null,
            incomingPhase: null,
            behindThreat: false,
            wallAhead: 0,
          },
        },
      ],
      result: { winner: "p2", p1Wins: 0, p2Wins: 1, ticks: 60 },
    };
  }

  it("mentions behind-threat and incoming attacks, with no secrets or borrowed move names", () => {
    const prompt = suggestReviewPrompt(stripWithFlags());
    expect(prompt).toMatch(/behind/i);
    expect(prompt).toMatch(/incoming/i);
    expect(prompt).toMatch(/heavy swing/);
    expect(prompt).not.toMatch(/Hadoken|Shoryuken/i);
    expect(prompt).not.toMatch(/join code|secret|token/i);
    expect(prompt).not.toMatch(/health|meter/i);
    expect(prompt).toContain("Tick 30");
    expect(prompt).toContain("Tick 0");
  });
});

describe("applyReview", () => {
  const update: ReviewNotesUpdate = {
    side: "p1",
    facts: [
      { id: "spacing", text: "I got hit when the burst filled the frame and I was still rushing.", evidenceTick: 30 },
      { id: "behind", text: "Rear-threat cue means turn around, don't keep walking.", evidenceTick: 0 },
    ],
  };

  it("keeps older facts with different ids and replaces same-id facts", () => {
    const notes = {
      version: 1,
      side: "p1" as const,
      facts: [{ id: "jump", text: "Jumps travel far.", evidenceTick: 12 }],
    };
    const merged = applyReview(notes, update) as { facts: Array<{ id: string; text: string }> };
    expect(merged.facts.map((f) => f.id)).toEqual(["jump", "spacing", "behind"]);

    const replaced = applyReview(merged, {
      side: "p1",
      facts: [{ id: "jump", text: "Jumps travel farther than I thought.", evidenceTick: 44 }],
    }) as { facts: Array<{ id: string; text: string }> };
    expect(replaced.facts.map((f) => f.id)).toEqual(["jump", "spacing", "behind"]);
    expect(replaced.facts[0]!.text).toBe("Jumps travel farther than I thought.");
  });

  it("is deterministic and idempotent, and starts a fresh doc from nothing", () => {
    const a = applyReview(null, update);
    const b = applyReview(null, update);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const again = applyReview(a, update);
    expect(JSON.stringify(again)).toBe(JSON.stringify(a));
    const doc = a as { version: number; side: string; facts: unknown[] };
    expect(doc.version).toBe(1);
    expect(doc.side).toBe("p1");
    expect(doc.facts).toHaveLength(2);
  });
});
