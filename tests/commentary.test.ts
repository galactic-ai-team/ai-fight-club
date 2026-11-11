import { describe, expect, it } from "vitest";
import { runMatch } from "../src/engine/run.ts";
import type { MatchEvent } from "../src/engine/types.ts";
import {
  commentOn,
  commentOnEvents,
  matchStartLine,
  type CommentaryContext,
} from "../src/commentary/index.ts";
import { createRandomBot, createRusherBot } from "../src/bots/index.ts";

const names = { p1: "Ion", p2: "Quark" };

const healthy: CommentaryContext = {
  p1HealthFrac: 0.9,
  p2HealthFrac: 0.9,
  p1Wins: 0,
  p2Wins: 0,
  round: 1,
  timeLeftSeconds: 60,
};

describe("commentary", () => {
  it("names the attacker on a hit and the winner on a KO", () => {
    expect(
      commentOn(
        { type: "hit", tick: 1, attacker: "p1", defender: "p2", kind: "light", damage: 40, blocked: false },
        names,
      ),
    ).toMatch(/Ion/);
    expect(
      commentOn(
        { type: "hit", tick: 1, attacker: "p1", defender: "p2", kind: "light", damage: 40, blocked: false },
        names,
      ),
    ).toMatch(/light/);
    expect(commentOn({ type: "ko", tick: 2, winner: "p2", loser: "p1" }, names)).toMatch(/Quark/);
    expect(commentOn({ type: "match_end", tick: 3, winner: "p1" }, names)).toMatch(/Ion (wins|takes) the match/);
  });

  it("covers every required event type", () => {
    const cases: Array<[MatchEvent, RegExp]> = [
      [
        { type: "hit", tick: 10, attacker: "p1", defender: "p2", kind: "heavy", damage: 80, blocked: false },
        /Ion.*heavy|heavy.*Quark/,
      ],
      [
        { type: "hit", tick: 11, attacker: "p2", defender: "p1", kind: "special", damage: 120, blocked: false },
        /Quark.*burst|burst.*Ion/,
      ],
      [
        { type: "hit", tick: 12, attacker: "p1", defender: "p2", kind: "light", damage: 8, blocked: true },
        /Quark.*chip|chip.*Quark/,
      ],
      [{ type: "ko", tick: 13, winner: "p1", loser: "p2" }, /Ion/],
      [{ type: "timeout", tick: 14, winner: "p2" }, /Time! Quark/],
      [{ type: "timeout", tick: 15, winner: "draw" }, /draw/],
      [{ type: "round_end", tick: 16, winner: "p1", round: 2 }, /Ion.*round 2|round 2.*Ion/],
      [{ type: "round_end", tick: 17, winner: "draw", round: 1 }, /Round 1 ends even/],
      [{ type: "match_end", tick: 18, winner: "p2" }, /Quark (wins|takes) the match/],
    ];
    for (const [event, re] of cases) {
      expect(commentOn(event, names, healthy)).toMatch(re);
    }
  });

  it("keeps the damage number on every hit line, blocked or not", () => {
    for (const kind of ["light", "heavy", "special"] as const) {
      const damage = kind === "light" ? 40 : kind === "heavy" ? 80 : 120;
      expect(
        commentOn(
          { type: "hit", tick: 20, attacker: "p1", defender: "p2", kind, damage, blocked: false },
          names,
          healthy,
        ),
      ).toContain(String(damage));
      expect(
        commentOn(
          { type: "hit", tick: 21, attacker: "p1", defender: "p2", kind, damage: 24, blocked: true },
          names,
          healthy,
        ),
      ).toMatch(/24.*chip|chip.*24/);
    }
  });

  it("is deterministic: the same event always prints the same line", () => {
    const event: MatchEvent = {
      type: "hit",
      tick: 42,
      attacker: "p1",
      defender: "p2",
      kind: "special",
      damage: 120,
      blocked: false,
    };
    expect(commentOn(event, names, healthy)).toBe(commentOn(event, names, healthy));
    expect(commentOn({ type: "ko", tick: 7, winner: "p1", loser: "p2" }, names)).toBe(
      commentOn({ type: "ko", tick: 7, winner: "p1", loser: "p2" }, names),
    );
  });

  it("prints the same log for the same match twice (live == replay)", () => {
    const logFor = () => {
      const { state } = runMatch(createRusherBot(), createRandomBot(), { seed: 20261111 });
      return state.events.map((ev) => commentOn(ev, names));
    };
    expect(logFor()).toEqual(logFor());
    expect(logFor().length).toBeGreaterThan(0);
  });

  it("calls out an 'almost' when the defender is nearly out", () => {
    const almost: CommentaryContext = { ...healthy, p2HealthFrac: 0.1 };
    expect(
      commentOn(
        { type: "hit", tick: 30, attacker: "p1", defender: "p2", kind: "heavy", damage: 80, blocked: false },
        names,
        almost,
      ),
    ).toMatch(/hanging by a thread|on fumes|barely stays up/);
    // Healthy defender: no "almost" line.
    expect(
      commentOn(
        { type: "hit", tick: 30, attacker: "p1", defender: "p2", kind: "heavy", damage: 80, blocked: false },
        names,
        healthy,
      ),
    ).not.toMatch(/hanging by a thread|barely stays up/);
  });

  it("calls the finisher when a hit actually ends the round", () => {
    const finisher: CommentaryContext = { ...healthy, p2HealthFrac: 0 };
    expect(
      commentOn(
        { type: "hit", tick: 32, attacker: "p1", defender: "p2", kind: "heavy", damage: 80, blocked: false },
        names,
        finisher,
      ),
    ).toMatch(/ends it|last one|nothing left/);
  });

  it("calls out a comeback when a low-health fighter lands a big hit", () => {
    const comeback: CommentaryContext = { ...healthy, p1HealthFrac: 0.2 };
    expect(
      commentOn(
        { type: "hit", tick: 31, attacker: "p1", defender: "p2", kind: "heavy", damage: 80, blocked: false },
        names,
        comeback,
      ),
    ).toMatch(/running on fumes|Backed into a corner|refuses to fold/);
    // A low-health light jab is not a comeback moment.
    expect(
      commentOn(
        { type: "hit", tick: 31, attacker: "p1", defender: "p2", kind: "light", damage: 40, blocked: false },
        names,
        comeback,
      ),
    ).not.toMatch(/refuses to fold|Backed into a corner/);
  });

  it("reads the cards on a close timeout", () => {
    const close: CommentaryContext = { ...healthy, p1HealthFrac: 0.5, p2HealthFrac: 0.45 };
    expect(commentOn({ type: "timeout", tick: 40, winner: "p1" }, names, close)).toMatch(/photo finish/);
    const clear: CommentaryContext = { ...healthy, p1HealthFrac: 0.8, p2HealthFrac: 0.2 };
    expect(commentOn({ type: "timeout", tick: 40, winner: "p1" }, names, clear)).toMatch(/on health/);
  });

  it("prints the score on round and match ends when context has it", () => {
    expect(
      commentOn({ type: "round_end", tick: 50, winner: "p1", round: 1 }, names, {
        ...healthy,
        p1Wins: 1,
        p2Wins: 0,
      }),
    ).toBe("Ion takes round 1 — that's 1-0.");
    expect(
      commentOn({ type: "match_end", tick: 51, winner: "p1" }, names, {
        ...healthy,
        p1Wins: 2,
        p2Wins: 0,
      }),
    ).toMatch(/clean sweep/);
    expect(
      commentOn({ type: "match_end", tick: 52, winner: "p2" }, names, {
        ...healthy,
        p1Wins: 1,
        p2Wins: 2,
      }),
    ).toMatch(/Went the distance/);
  });

  it("collapses a double KO into one line instead of two contradictory ones", () => {
    const events: MatchEvent[] = [
      { type: "hit", tick: 60, attacker: "p1", defender: "p2", kind: "heavy", damage: 80, blocked: false },
      { type: "ko", tick: 61, winner: "p1", loser: "p2" },
      { type: "ko", tick: 61, winner: "p2", loser: "p1" },
      { type: "round_end", tick: 61, winner: "draw", round: 1 },
    ];
    const lines = commentOnEvents(events, names, healthy);
    expect(lines).toHaveLength(3);
    expect(lines[1]?.text).toMatch(/Double KO/);
    expect(lines[1]?.kind).toBe("ko");
    expect(lines[2]?.text).toMatch(/ends even/);
  });

  it("leaves a single KO alone", () => {
    const lines = commentOnEvents(
      [
        { type: "ko", tick: 70, winner: "p2", loser: "p1" },
        { type: "round_end", tick: 70, winner: "p2", round: 1 },
      ],
      names,
      healthy,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]?.text).toMatch(/Quark/);
  });

  it("writes a match-start line with bots and seed", () => {
    expect(matchStartLine(names, { seed: 20261111, p1Bot: "Rusher", p2Bot: "Random" })).toBe(
      "Match start. Ion (Rusher) vs Quark (Random). Seed 20261111.",
    );
    expect(matchStartLine(names)).toBe("Match start. Ion vs Quark.");
  });

  it("never prints Capcom IP or a copied catchphrase", () => {
    const banned: RegExp[] = [
      /hadoken/i,
      /shoryuken/i,
      /sonic boom/i,
      /tatsumaki/i,
      /\bryu\b/i,
      /\bken\b/i,
      /chun-?li/i,
      /guile/i,
      /blanka/i,
      /\bbison\b/i,
      /dhalsim/i,
      /zangief/i,
      /\bvega\b/i,
      /sagat/i,
      /balrog/i,
      /finish him/i,
      /fatality/i,
      /flawless victory/i,
    ];
    const contexts: Array<CommentaryContext | undefined> = [
      undefined,
      healthy,
      { ...healthy, p2HealthFrac: 0.1 },
      { ...healthy, p1HealthFrac: 0.2 },
      { ...healthy, p1HealthFrac: 0.5, p2HealthFrac: 0.45 },
      { ...healthy, p1Wins: 2, p2Wins: 0 },
    ];
    const lines: string[] = [];
    for (let tick = 1; tick <= 20; tick++) {
      for (const kind of ["light", "heavy", "special"] as const) {
        for (const blocked of [false, true]) {
          for (const ctx of contexts) {
            lines.push(
              commentOn(
                { type: "hit", tick, attacker: "p1", defender: "p2", kind, damage: 40, blocked },
                names,
                ctx,
              ),
            );
          }
        }
      }
      lines.push(commentOn({ type: "ko", tick, winner: "p1", loser: "p2" }, names));
      lines.push(commentOn({ type: "timeout", tick, winner: "p2" }, names, contexts[4]));
      lines.push(commentOn({ type: "round_end", tick, winner: "p1", round: 1 }, names, contexts[5]));
      lines.push(commentOn({ type: "match_end", tick, winner: "p1" }, names, contexts[5]));
      lines.push(...commentOnEvents(
        [
          { type: "ko", tick, winner: "p1", loser: "p2" },
          { type: "ko", tick, winner: "p2", loser: "p1" },
        ],
        names,
      ).map((l) => l.text));
    }
    expect(lines.length).toBeGreaterThan(100);
    for (const line of lines) {
      expect(line).not.toContain("{");
      expect(line).not.toContain("undefined");
      for (const re of banned) {
        expect(line).not.toMatch(re);
      }
    }
  });
});
