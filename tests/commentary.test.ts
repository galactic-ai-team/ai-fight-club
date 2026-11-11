import { describe, expect, it } from "vitest";
import { commentOn } from "../src/commentary/index.ts";

const names = { p1: "Ion", p2: "Quark" };

describe("commentary", () => {
  it("names the attacker on a hit and the winner on a KO", () => {
    expect(
      commentOn(
        { type: "hit", tick: 1, attacker: "p1", defender: "p2", kind: "light", damage: 40, blocked: false },
        names,
      ),
    ).toMatch(/Ion lands a light/);
    expect(commentOn({ type: "ko", tick: 2, winner: "p2", loser: "p1" }, names)).toMatch(/Quark takes the KO/);
    expect(commentOn({ type: "match_end", tick: 3, winner: "p1" }, names)).toMatch(/Ion wins the match/);
  });
});
