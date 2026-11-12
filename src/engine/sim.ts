import { ATTACKS, attackDuration, attackPhaseOf } from "./attacks.ts";
import { normalizeAction } from "./action.ts";
import {
  BEST_OF,
  EDGE_PAD,
  FIGHTER_H,
  FIGHTER_W,
  GRAVITY,
  GROUND_Y,
  JUMP_VY,
  KNOCKDOWN_INVULN_TICKS,
  KNOCKDOWN_TICKS,
  MAX_FALL,
  MAX_HEALTH,
  MAX_METER,
  MAX_ROUNDS,
  METER_ON_BLOCK,
  METER_ON_HIT,
  METER_ON_TAKE,
  PUSH_SEPARATION,
  ROUND_END_LINGER_TICKS,
  ROUND_TIME_TICKS,
  STAGE_WIDTH,
  WAKEUP_INVULN_TICKS,
  WALK_SPEED,
  WINS_NEEDED,
} from "./constants.ts";
import { grounded, hitboxFor, hurtboxFor, overlaps } from "./boxes.ts";
import { seedRng } from "./rng.ts";
import type {
  Action,
  AttackKind,
  CreateMatchOpts,
  Fighter,
  MatchEvent,
  MatchState,
  Side,
} from "./types.ts";

const DEFAULT_P1 = "Ion";
const DEFAULT_P2 = "Quark";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function spawnFighter(
  id: Side,
  character: string,
  x: number,
  facing: 1 | -1,
): Fighter {
  const f: Fighter = {
    id,
    character,
    x,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    facing,
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    meter: 0,
    maxMeter: MAX_METER,
    state: "idle",
    stateT: 0,
    attack: null,
    attackT: 0,
    hitstun: 0,
    blockstun: 0,
    invuln: 0,
    blocking: false,
    airborne: false,
    combo: 0,
    attackConnected: false,
    hurtbox: { x: 0, y: 0, w: 0, h: 0 },
    hitbox: null,
  };
  refreshBoxes(f);
  return f;
}

function refreshBoxes(f: Fighter): void {
  f.hurtbox = hurtboxFor(f);
  if (f.state === "attack" && f.attack && !f.attackConnected) {
    const data = ATTACKS[f.attack];
    const phase = attackPhaseOf(data, f.attackT);
    f.hitbox = phase === "active" ? hitboxFor(f, data) : null;
  } else {
    f.hitbox = null;
  }
}

function addMeter(f: Fighter, amount: number): void {
  f.meter = clamp(f.meter + amount, 0, f.maxMeter);
}

function resetFighterPosition(f: Fighter, x: number, facing: 1 | -1): void {
  f.x = x;
  f.y = GROUND_Y;
  f.vx = 0;
  f.vy = 0;
  f.facing = facing;
  f.health = f.maxHealth;
  // Meter carries between rounds.
  f.state = "idle";
  f.stateT = 0;
  f.attack = null;
  f.attackT = 0;
  f.hitstun = 0;
  f.blockstun = 0;
  f.invuln = 0;
  f.blocking = false;
  f.airborne = false;
  f.combo = 0;
  f.attackConnected = false;
  refreshBoxes(f);
}

export function createMatch(opts: CreateMatchOpts): MatchState {
  const p1 = spawnFighter("p1", opts.p1Character ?? DEFAULT_P1, 240, 1);
  const p2 = spawnFighter("p2", opts.p2Character ?? DEFAULT_P2, 720, -1);
  return {
    tick: 0,
    seed: opts.seed | 0,
    rng: seedRng(opts.seed),
    phase: "fight",
    p1,
    p2,
    p1Wins: 0,
    p2Wins: 0,
    bestOf: BEST_OF,
    winsNeeded: WINS_NEEDED,
    round: {
      number: 1,
      tick: 0,
      timeLeftTicks: ROUND_TIME_TICKS,
      winner: null,
      linger: 0,
    },
    over: false,
    matchWinner: null,
    events: [],
    lastEvents: [],
  };
}

function canAct(f: Fighter): boolean {
  return (
    f.hitstun <= 0 &&
    f.blockstun <= 0 &&
    f.state !== "knockdown" &&
    f.state !== "attack"
  );
}

function startAttack(f: Fighter, kind: AttackKind): boolean {
  const data = ATTACKS[kind];
  if (data.meterCost > 0 && f.meter < data.meterCost) return false;
  if (data.meterCost > 0) f.meter -= data.meterCost;
  f.attack = kind;
  f.attackT = 0;
  f.attackConnected = false;
  f.state = "attack";
  f.stateT = 0;
  f.blocking = false;
  f.vx = 0;
  return true;
}

function applyControl(f: Fighter, input: Action, opponentX: number): void {
  if (!canAct(f)) return;

  if (input.attack !== "none") {
    startAttack(f, input.attack);
    return;
  }

  const onGround = grounded(f);

  if (input.block && onGround) {
    f.state = "block";
    f.stateT = 0;
    f.blocking = true;
    f.vx = 0;
    return;
  }

  f.blocking = false;

  if (input.vertical === "jump" && onGround) {
    f.vy = JUMP_VY;
    f.airborne = true;
    f.state = "jump";
    f.stateT = 0;
    f.vx =
      input.move === "left" ? -WALK_SPEED : input.move === "right" ? WALK_SPEED : 0;
    return;
  }

  if (input.vertical === "crouch" && onGround) {
    f.state = "crouch";
    f.stateT += 1;
    f.vx = 0;
    return;
  }

  if (onGround && input.move !== "none") {
    f.state = "walk";
    f.stateT += 1;
    f.vx = input.move === "left" ? -WALK_SPEED : WALK_SPEED;
    return;
  }

  f.vx = onGround ? 0 : f.vx;
  if (onGround) {
    f.state = "idle";
    f.stateT += 1;
  }
  void opponentX;
}

function tickPhysics(f: Fighter): void {
  f.vy = clamp(f.vy + GRAVITY, -99, MAX_FALL);
  f.x += f.vx;
  f.y += f.vy;

  const minX = EDGE_PAD + Math.floor(FIGHTER_W / 2);
  const maxX = STAGE_WIDTH - EDGE_PAD - Math.floor(FIGHTER_W / 2);
  f.x = clamp(f.x, minX, maxX);

  if (f.y >= GROUND_Y) {
    f.y = GROUND_Y;
    f.vy = 0;
    if (f.airborne && f.state === "jump") {
      f.state = "idle";
      f.stateT = 0;
    }
    f.airborne = false;
  } else {
    f.airborne = true;
  }
}

function tickStunAndAttacks(f: Fighter): void {
  if (f.invuln > 0) f.invuln -= 1;

  if (f.hitstun > 0) {
    f.hitstun -= 1;
    f.state = "hitstun";
    f.stateT += 1;
    f.blocking = false;
    f.hitbox = null;
    if (f.hitstun === 0) {
      f.state = f.airborne ? "jump" : "idle";
      f.stateT = 0;
      f.vx = 0;
    }
    return;
  }

  if (f.blockstun > 0) {
    f.blockstun -= 1;
    f.state = "block";
    f.stateT += 1;
    f.blocking = true;
    f.vx = 0;
    if (f.blockstun === 0) {
      f.state = "idle";
      f.stateT = 0;
      f.blocking = false;
    }
    return;
  }

  if (f.state === "knockdown") {
    f.stateT += 1;
    f.vx = 0;
    f.attack = null;
    f.hitbox = null;
    if (f.stateT >= KNOCKDOWN_TICKS) {
      f.state = "idle";
      f.stateT = 0;
      f.invuln = WAKEUP_INVULN_TICKS;
    }
    return;
  }

  if (f.state === "attack" && f.attack) {
    f.attackT += 1;
    f.stateT += 1;
    const data = ATTACKS[f.attack];
    if (f.attackT >= attackDuration(data)) {
      f.attack = null;
      f.attackT = 0;
      f.state = f.airborne ? "jump" : "idle";
      f.stateT = 0;
    }
  }
}

function faceOpponent(f: Fighter, otherX: number): void {
  if (f.state === "attack" || f.state === "hitstun" || f.state === "knockdown") return;
  if (f.airborne) return;
  if (otherX === f.x) return;
  f.facing = otherX > f.x ? 1 : -1;
}

function pushApart(a: Fighter, b: Fighter): void {
  const dx = b.x - a.x;
  const dist = Math.abs(dx);
  if (dist >= PUSH_SEPARATION || dist === 0) {
    if (dist === 0) {
      a.x -= 1;
      b.x += 1;
    }
    return;
  }
  const overlap = PUSH_SEPARATION - dist;
  const dir = dx > 0 ? 1 : -1;
  const half = Math.floor(overlap / 2);
  a.x -= dir * half;
  b.x += dir * (overlap - half);
  const minX = EDGE_PAD + Math.floor(FIGHTER_W / 2);
  const maxX = STAGE_WIDTH - EDGE_PAD - Math.floor(FIGHTER_W / 2);
  a.x = clamp(a.x, minX, maxX);
  b.x = clamp(b.x, minX, maxX);
}

function isFacingAttacker(defender: Fighter, attacker: Fighter): boolean {
  const dirToAttacker = attacker.x >= defender.x ? 1 : -1;
  return defender.facing === dirToAttacker;
}

function applyHit(
  attacker: Fighter,
  defender: Fighter,
  kind: AttackKind,
  tick: number,
  events: MatchEvent[],
): void {
  const data = ATTACKS[kind];
  const canBlock =
    defender.blocking &&
    defender.hitstun <= 0 &&
    defender.state !== "knockdown" &&
    !defender.airborne &&
    isFacingAttacker(defender, attacker);

  if (canBlock) {
    const dmg = data.chip;
    defender.health = Math.max(0, defender.health - dmg);
    defender.blockstun = data.blockstun;
    defender.state = "block";
    defender.stateT = 0;
    defender.combo = 0;
    attacker.combo = 0;
    addMeter(attacker, METER_ON_BLOCK);
    addMeter(defender, METER_ON_BLOCK);
    events.push({
      type: "hit",
      tick,
      attacker: attacker.id,
      defender: defender.id,
      kind,
      damage: dmg,
      blocked: true,
    });
    return;
  }

  const dmg = data.damage;
  defender.health = Math.max(0, defender.health - dmg);
  defender.hitstun = data.hitstun;
  defender.state = "hitstun";
  defender.stateT = 0;
  defender.blocking = false;
  defender.attack = null;
  defender.attackT = 0;
  defender.vx = attacker.facing * data.knockback;
  if (data.popY !== 0) defender.vy = data.popY;
  defender.combo = 0;
  attacker.combo += 1;
  addMeter(attacker, METER_ON_HIT);
  addMeter(defender, METER_ON_TAKE);
  events.push({
    type: "hit",
    tick,
    attacker: attacker.id,
    defender: defender.id,
    kind,
    damage: dmg,
    blocked: false,
  });
}

function tryHits(state: MatchState, events: MatchEvent[]): void {
  const { p1, p2, tick } = state;
  const p1Hit =
    p1.hitbox &&
    p2.invuln <= 0 &&
    p2.state !== "knockdown" &&
    overlaps(p1.hitbox, p2.hurtbox);
  const p2Hit =
    p2.hitbox &&
    p1.invuln <= 0 &&
    p1.state !== "knockdown" &&
    overlaps(p2.hitbox, p1.hurtbox);

  // Snapshot both attack kinds before applying damage: the first hit may
  // clear the other fighter's attack, but must not erase a same-tick trade.
  const p1Kind = p1Hit ? p1.attack : null;
  const p2Kind = p2Hit ? p2.attack : null;
  if (p1Kind) applyHit(p1, p2, p1Kind, tick, events);
  if (p2Kind) applyHit(p2, p1, p2Kind, tick, events);

  // A connecting hitbox is one-shot so it does not re-hit every active frame.
  if (p1Hit) {
    p1.attackConnected = true;
    p1.hitbox = null;
  }
  if (p2Hit) {
    p2.attackConnected = true;
    p2.hitbox = null;
  }
}

function enterKnockdown(f: Fighter): void {
  f.state = "knockdown";
  f.stateT = 0;
  f.hitstun = 0;
  f.blockstun = 0;
  f.attack = null;
  f.attackT = 0;
  f.hitbox = null;
  f.blocking = false;
  f.vx = 0;
  f.invuln = KNOCKDOWN_INVULN_TICKS;
  if (f.y > GROUND_Y - FIGHTER_H) {
    // stay where they are; physics will drop them
  }
}

function maybeEndRound(state: MatchState, events: MatchEvent[]): void {
  if (state.phase !== "fight") return;
  const p1Dead = state.p1.health <= 0;
  const p2Dead = state.p2.health <= 0;
  let winner: "p1" | "p2" | "draw" | null = null;

  if (p1Dead && p2Dead) {
    winner = "draw";
  } else if (p1Dead) {
    winner = "p2";
  } else if (p2Dead) {
    winner = "p1";
  } else if (state.round.timeLeftTicks <= 0) {
    if (state.p1.health > state.p2.health) winner = "p1";
    else if (state.p2.health > state.p1.health) winner = "p2";
    else winner = "draw";
    events.push({ type: "timeout", tick: state.tick, winner });
  }

  if (!winner) return;

  if (p1Dead && !p2Dead) {
    enterKnockdown(state.p1);
    events.push({ type: "ko", tick: state.tick, winner: "p2", loser: "p1" });
  } else if (p2Dead && !p1Dead) {
    enterKnockdown(state.p2);
    events.push({ type: "ko", tick: state.tick, winner: "p1", loser: "p2" });
  } else if (p1Dead && p2Dead) {
    enterKnockdown(state.p1);
    enterKnockdown(state.p2);
    events.push({ type: "ko", tick: state.tick, winner: "p1", loser: "p2" });
    events.push({ type: "ko", tick: state.tick, winner: "p2", loser: "p1" });
  }

  state.phase = "round_end";
  state.round.winner = winner;
  state.round.linger = ROUND_END_LINGER_TICKS;
  if (winner === "p1") state.p1Wins += 1;
  if (winner === "p2") state.p2Wins += 1;
  events.push({
    type: "round_end",
    tick: state.tick,
    winner,
    round: state.round.number,
  });

  if (state.p1Wins >= WINS_NEEDED || state.p2Wins >= WINS_NEEDED) {
    finishMatch(state, events);
  }
}

function finishMatch(state: MatchState, events: MatchEvent[]): void {
  const winner: Side =
    state.p1Wins === state.p2Wins
      ? state.p1.health >= state.p2.health
        ? "p1"
        : "p2"
      : state.p1Wins > state.p2Wins
        ? "p1"
        : "p2";
  // If wins are already decisive, use that.
  const decisive: Side | null =
    state.p1Wins >= WINS_NEEDED && state.p1Wins > state.p2Wins
      ? "p1"
      : state.p2Wins >= WINS_NEEDED && state.p2Wins > state.p1Wins
        ? "p2"
        : state.p1Wins >= WINS_NEEDED || state.p2Wins >= WINS_NEEDED
          ? state.p1Wins > state.p2Wins
            ? "p1"
            : "p2"
          : null;
  state.phase = "match_end";
  state.over = true;
  state.matchWinner = decisive ?? winner;
  events.push({ type: "match_end", tick: state.tick, winner: state.matchWinner });
}

function advanceRoundOrMatch(state: MatchState, events: MatchEvent[]): void {
  if (state.phase !== "round_end") return;
  state.round.linger -= 1;
  if (state.round.linger > 0) return;
  if (state.over) return;

  if (state.round.number >= MAX_ROUNDS) {
    finishMatch(state, events);
    return;
  }

  state.round.number += 1;
  state.round.tick = 0;
  state.round.timeLeftTicks = ROUND_TIME_TICKS;
  state.round.winner = null;
  state.round.linger = 0;
  state.phase = "fight";
  resetFighterPosition(state.p1, 240, 1);
  resetFighterPosition(state.p2, 720, -1);
}

/**
 * Advance the match one tick. Actions are normalized, so a bot can return
 * anything without crashing the sim.
 */
export function stepMatch(
  state: MatchState,
  p1Raw: unknown,
  p2Raw: unknown,
): MatchState {
  const events: MatchEvent[] = [];
  const p1Input = normalizeAction(p1Raw);
  const p2Input = normalizeAction(p2Raw);

  if (state.phase === "match_end") {
    state.lastEvents = [];
    return state;
  }

  state.tick += 1;

  if (state.phase === "round_end") {
    tickStunAndAttacks(state.p1);
    tickStunAndAttacks(state.p2);
    tickPhysics(state.p1);
    tickPhysics(state.p2);
    pushApart(state.p1, state.p2);
    refreshBoxes(state.p1);
    refreshBoxes(state.p2);
    advanceRoundOrMatch(state, events);
    state.lastEvents = events;
    state.events.push(...events);
    return state;
  }

  state.round.tick += 1;
  state.round.timeLeftTicks = Math.max(0, state.round.timeLeftTicks - 1);

  // Decrement stun/attacks first so a just-ended recovery can act? 
  // Input is applied after last tick's stun decays at the start of this tick.
  tickStunAndAttacks(state.p1);
  tickStunAndAttacks(state.p2);

  applyControl(state.p1, p1Input, state.p2.x);
  applyControl(state.p2, p2Input, state.p1.x);

  tickPhysics(state.p1);
  tickPhysics(state.p2);
  pushApart(state.p1, state.p2);

  faceOpponent(state.p1, state.p2.x);
  faceOpponent(state.p2, state.p1.x);

  refreshBoxes(state.p1);
  refreshBoxes(state.p2);
  tryHits(state, events);
  refreshBoxes(state.p1);
  refreshBoxes(state.p2);

  maybeEndRound(state, events);

  state.lastEvents = events;
  state.events.push(...events);
  return state;
}
