import { PROTOCOL_VERSION } from "./constants.ts";
import { ATTACKS, attackPhaseOf } from "./attacks.ts";
import type {
  AttackPhase,
  Fighter,
  FighterView,
  MatchState,
  Observation,
  Side,
} from "./types.ts";

function phase(f: Fighter): AttackPhase | null {
  if (f.state !== "attack" || !f.attack) return null;
  return attackPhaseOf(ATTACKS[f.attack], f.attackT);
}

export function viewFighter(f: Fighter): FighterView {
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
    attackPhase: phase(f),
    hitstun: f.hitstun,
    blockstun: f.blockstun,
    invuln: f.invuln,
    blocking: f.blocking,
    airborne: f.airborne,
    combo: f.combo,
    hurtbox: { ...f.hurtbox },
    hitbox: f.hitbox ? { ...f.hitbox } : null,
  };
}

export function observe(state: MatchState, side: Side): Observation {
  const me = side === "p1" ? state.p1 : state.p2;
  const opp = side === "p1" ? state.p2 : state.p1;
  return {
    protocol: PROTOCOL_VERSION,
    tick: state.tick,
    seed: state.seed,
    side,
    round: state.round.number,
    timeLeftTicks: state.round.timeLeftTicks,
    bestOf: 3,
    myWins: side === "p1" ? state.p1Wins : state.p2Wins,
    oppWins: side === "p1" ? state.p2Wins : state.p1Wins,
    phase: state.phase,
    me: viewFighter(me),
    opponent: viewFighter(opp),
  };
}
