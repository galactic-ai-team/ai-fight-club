import type { Fighter, MatchEvent, MatchState } from "./types.ts";

function fighterSnap(f: Fighter): Record<string, number | string | boolean | null> {
  return {
    id: f.id,
    character: f.character,
    x: f.x,
    y: f.y,
    vx: f.vx,
    vy: f.vy,
    facing: f.facing,
    health: f.health,
    maxHealth: f.maxHealth,
    meter: f.meter,
    maxMeter: f.maxMeter,
    state: f.state,
    stateT: f.stateT,
    attack: f.attack,
    attackT: f.attackT,
    hitstun: f.hitstun,
    blockstun: f.blockstun,
    invuln: f.invuln,
    blocking: f.blocking,
    airborne: f.airborne,
    combo: f.combo,
    attackConnected: f.attackConnected,
    hx: f.hurtbox.x,
    hy: f.hurtbox.y,
    hw: f.hurtbox.w,
    hh: f.hurtbox.h,
    bx: f.hitbox ? f.hitbox.x : null,
    by: f.hitbox ? f.hitbox.y : null,
    bw: f.hitbox ? f.hitbox.w : null,
    bh: f.hitbox ? f.hitbox.h : null,
  };
}


/** Explicit field order makes history part of the canonical state. */
function eventSnap(event: MatchEvent): Record<string, number | string | boolean> {
  switch (event.type) {
    case "hit":
      return { type: event.type, tick: event.tick, attacker: event.attacker,
        defender: event.defender, kind: event.kind, damage: event.damage, blocked: event.blocked };
    case "ko":
      return { type: event.type, tick: event.tick, winner: event.winner, loser: event.loser };
    case "timeout":
      return { type: event.type, tick: event.tick, winner: event.winner };
    case "round_end":
      return { type: event.type, tick: event.tick, winner: event.winner, round: event.round };
    case "match_end":
      return { type: event.type, tick: event.tick, winner: event.winner };
  }
}

/** Stable, JSON-stringifiable snapshot used for determinism tests and replay checks. */
export function canonicalState(state: MatchState): string {
  const snap = {
    tick: state.tick,
    seed: state.seed,
    rng: state.rng,
    phase: state.phase,
    p1Wins: state.p1Wins,
    p2Wins: state.p2Wins,
    bestOf: state.bestOf,
    winsNeeded: state.winsNeeded,
    over: state.over,
    matchWinner: state.matchWinner,
    round: {
      number: state.round.number,
      tick: state.round.tick,
      timeLeftTicks: state.round.timeLeftTicks,
      winner: state.round.winner,
      linger: state.round.linger,
    },
    p1: fighterSnap(state.p1),
    p2: fighterSnap(state.p2),
    events: state.events.map(eventSnap),
    lastEvents: state.lastEvents.map(eventSnap),
  };
  return JSON.stringify(snap);
}

export function stateHash(state: MatchState): string {
  const s = canonicalState(state);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
