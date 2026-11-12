import { describe, expect, it } from "vitest";
import { momentLine, roundIntroLine, type OverlayInput } from "../src/commentary/overlay.ts";

const base: OverlayInput = {
  phase: "fight",
  round: 1,
  p1Name: "Ion",
  p2Name: "Quark",
  p1HealthFrac: 1,
  p2HealthFrac: 1,
  p1Wins: 0,
  p2Wins: 0,
};

describe("overlay", () => {
  it("stays quiet while both fighters are healthy", () => {
    expect(momentLine(base)).toBeNull();
    expect(momentLine({ ...base, p1HealthFrac: 0.3, p2HealthFrac: 0.26 })).toBeNull();
  });

  it("calls out the fighter running on fumes", () => {
    expect(momentLine({ ...base, p2HealthFrac: 0.25 })).toEqual({
      text: "Quark is running on fumes.",
      tone: "danger",
    });
    expect(momentLine({ ...base, p1HealthFrac: 0.1 })).toEqual({
      text: "Ion is running on fumes.",
      tone: "danger",
    });
  });

  it("calls out both fighters on the edge", () => {
    expect(momentLine({ ...base, p1HealthFrac: 0.2, p2HealthFrac: 0.05 })).toEqual({
      text: "Both fighters are one clean hit from done.",
      tone: "danger",
    });
  });

  it("says nothing during round end or match end — the canvas banner owns those", () => {
    expect(momentLine({ ...base, phase: "round_end", p1HealthFrac: 0.1 })).toBeNull();
    expect(momentLine({ ...base, phase: "match_end", p1HealthFrac: 0.1, p2HealthFrac: 0.1 })).toBeNull();
  });

  it("writes a round intro, with the lead from round 2 on", () => {
    expect(roundIntroLine(base)).toBe("ROUND 1 — Ion vs Quark");
    expect(roundIntroLine({ ...base, round: 2, p1Wins: 1, p2Wins: 0 })).toBe(
      "ROUND 2 — Ion vs Quark · Ion leads 1-0",
    );
    expect(roundIntroLine({ ...base, round: 3, p1Wins: 1, p2Wins: 1 })).toBe(
      "ROUND 3 — Ion vs Quark",
    );
  });
});
