import { describe, expect, it } from "vitest";
import { createMatch, stepMatch } from "../src/engine/sim.ts";
import { NEUTRAL_ACTION } from "../src/engine/types.ts";
import { emptyWindow, publicFromMatch } from "../src/commander/summary.ts";
import type { MatchPublicState } from "../src/commander/types.ts";
import {
  parsePipMode,
  pipLabel,
  pipLayout,
  pipVisibleSides,
  publicStateToMatchState,
  renderPipFrames,
  renderPipFramesFromPublic,
} from "../src/eyes/pip.ts";

function publicSnapshot(): MatchPublicState {
  const state = createMatch({ seed: 7, p1Character: "Ion", p2Character: "Quark" });
  for (let i = 0; i < 10; i++) stepMatch(state, NEUTRAL_ACTION, NEUTRAL_ACTION);
  return publicFromMatch("m-test", state, {
    seed: 7,
    window: emptyWindow("off"),
    p1: { controller: "Lumi", lastMoves: [], command: null, commandSeq: null, latencyMs: null, attackPhase: null },
    p2: { controller: "GPT-6", lastMoves: [], command: null, commandSeq: null, latencyMs: null, attackPhase: null },
    p1Bot: "rusher",
    p2Bot: "statue",
    events: [],
    hostPresent: true,
    updatedAtMs: 0,
    startedAtMs: null,
  });
}

describe("pip mode", () => {
  it("parses modes and defaults unknown values to both", () => {
    expect(parsePipMode("p1")).toBe("p1");
    expect(parsePipMode("P2")).toBe("p2");
    expect(parsePipMode("both")).toBe("both");
    expect(parsePipMode("off")).toBe("off");
    expect(parsePipMode("nope")).toBe("both");
    expect(parsePipMode(undefined)).toBe("both");
  });

  it("lists the visible sides per mode", () => {
    expect(pipVisibleSides("p1")).toEqual(["p1"]);
    expect(pipVisibleSides("p2")).toEqual(["p2"]);
    expect(pipVisibleSides("both")).toEqual(["p1", "p2"]);
    expect(pipVisibleSides("off")).toEqual([]);
  });

  it("labels a frame with the fighter name and what they see", () => {
    expect(pipLabel("p1", "Ion")).toBe("Ion — what they see");
    expect(pipLabel("p2", "Quark")).toBe("Quark — what they see");
  });
});

describe("pip layout", () => {
  it("stacks both frames at 375px wide and sits them side by side when wide", () => {
    const narrow = pipLayout("both", 375);
    expect(narrow.columns).toBe(1);
    expect(narrow.stacked).toBe(true);
    const wide = pipLayout("both", 800);
    expect(wide.columns).toBe(2);
    expect(wide.stacked).toBe(false);
  });

  it("uses one column for a single side at any width", () => {
    expect(pipLayout("p1", 800).columns).toBe(1);
    expect(pipLayout("off", 800).columns).toBe(1);
  });
});

describe("pip frames from public state", () => {
  it("renders one first-person frame per visible side, vision-only", () => {
    const pub = publicSnapshot();
    const both = renderPipFramesFromPublic(pub, "both");
    expect(both.map((f) => f.side)).toEqual(["p1", "p2"]);
    expect(both[0]!.width).toBe(160);
    expect(both[0]!.height).toBe(120);
    expect(both[0]!.visibility.opponentVisible).toBe(true);
    expect(both[0]!.visibility.behindThreat).toBe(false);
    expect(renderPipFramesFromPublic(pub, "p2").map((f) => f.side)).toEqual(["p2"]);
    expect(renderPipFramesFromPublic(pub, "off")).toEqual([]);
  });

  it("shows the rear-threat cue when the opponent is behind the fighter", () => {
    const pub = publicSnapshot();
    pub.p1.facing = -1;
    const [frame] = renderPipFramesFromPublic(pub, "p1");
    expect(frame!.visibility.opponentVisible).toBe(false);
    expect(frame!.visibility.behindThreat).toBe(true);
  });

  it("rebuilds a MatchState whose POV matches the live state", () => {
    const state = createMatch({ seed: 7, p1Character: "Ion", p2Character: "Quark" });
    const pub = publicSnapshot();
    const rebuilt = publicStateToMatchState(pub);
    expect(rebuilt.tick).toBe(pub.tick);
    expect(rebuilt.p1.x).toBe(state.p1.x);
    expect(rebuilt.p2.character).toBe("Quark");
    expect(renderPipFrames(rebuilt, "p1")[0]!.visibility.forwardDistance).toBe(480);
  });
});
