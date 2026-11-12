import { ATTACKS, attackDuration } from "../engine/attacks.ts";
import {
  EDGE_PAD,
  FIGHTER_H,
  FIGHTER_W,
  GRAVITY,
  GROUND_Y,
  KNOCKDOWN_TICKS,
  MAX_FALL,
  STAGE_WIDTH,
  WAKEUP_INVULN_TICKS,
  WALK_SPEED,
} from "../engine/constants.ts";
import type {
  Action,
  AttackKind,
  AttackPhase,
  FighterView,
  Observation,
} from "../engine/types.ts";
import type { Bot, BotStartContext } from "./types.ts";

export const id = "lumi";
export const name = "Lumi";
export const author = "Lumi";

const BODY = FIGHTER_W;
const LEFT_WALL = EDGE_PAD + Math.floor(FIGHTER_W / 2);
const RIGHT_WALL = STAGE_WIDTH - EDGE_PAD - Math.floor(FIGHTER_W / 2);
const HISTORY = 240;

type MoveDir = Action["move"];

interface Memory {
  lastOppX: number;
  lastOppY: number;
  lastOppState: string;
  lastOppPhase: AttackPhase | null;
  lastOppAttack: AttackKind | null;
  lastOppAir: boolean;
  lastMeHealth: number;
  lastOppHealth: number;
  lastRound: number;
  attacks: { light: number; heavy: number; special: number };
  jumps: number;
  blocks: number;
  approaches: number;
  retreats: number;
  samples: number;
  recentAttackAt: number[];
  recentJumpAt: number[];
  windowStart: number;
}

function freshMemory(obs?: Observation): Memory {
  return {
    lastOppX: obs?.opponent.x ?? 0,
    lastOppY: obs?.opponent.y ?? GROUND_Y,
    lastOppState: obs?.opponent.state ?? "idle",
    lastOppPhase: obs?.opponent.attackPhase ?? null,
    lastOppAttack: obs?.opponent.attack ?? null,
    lastOppAir: obs?.opponent.airborne ?? false,
    lastMeHealth: obs?.me.health ?? 1000,
    lastOppHealth: obs?.opponent.health ?? 1000,
    lastRound: obs?.round ?? 1,
    attacks: { light: 0, heavy: 0, special: 0 },
    jumps: 0,
    blocks: 0,
    approaches: 0,
    retreats: 0,
    samples: 0,
    recentAttackAt: [],
    recentJumpAt: [],
    windowStart: obs?.tick ?? 0,
  };
}

function neutral(): Action {
  return { move: "none", vertical: "none", attack: "none", block: false };
}

function strike(kind: AttackKind): Action {
  return { move: "none", vertical: "none", attack: kind, block: false };
}

function guard(): Action {
  return { move: "none", vertical: "none", attack: "none", block: true };
}

function walk(dir: MoveDir): Action {
  return { move: dir, vertical: "none", attack: "none", block: false };
}

function hop(dir: MoveDir): Action {
  return { move: dir, vertical: "jump", attack: "none", block: false };
}

function centerReach(kind: AttackKind): number {
  // Hitbox starts at the edge of the 48px hurtbox and is `range` wide.
  return ATTACKS[kind].range + BODY - 1;
}

function gap(obs: Observation): number {
  return Math.abs(obs.opponent.x - obs.me.x);
}

function towardDir(obs: Observation): MoveDir {
  const dx = obs.opponent.x - obs.me.x;
  return dx > 0 ? "right" : dx < 0 ? "left" : "none";
}

function awayDir(obs: Observation): MoveDir {
  const dx = obs.opponent.x - obs.me.x;
  return dx > 0 ? "left" : dx < 0 ? "right" : "none";
}

function wallInFront(x: number, dir: MoveDir): boolean {
  if (dir === "left") return x <= LEFT_WALL + 4;
  if (dir === "right") return x >= RIGHT_WALL - 4;
  return false;
}

function firstActiveTick(kind: AttackKind): number {
  // We start the move on the next engine step (tick 1) at attackT = 0.
  // It becomes active after `startup` increments, on tick startup+1.
  return ATTACKS[kind].startup + 1;
}

function attackTicksLeft(f: FighterView): number {
  if (f.state !== "attack" || !f.attack) return 0;
  return Math.max(0, attackDuration(ATTACKS[f.attack]) - f.stateT);
}

/**
 * Next-step index (1 = next tick) on which this fighter can first act.
 * 1 means they can act on the coming step.
 */
function ticksUntilAct(f: FighterView): number {
  if (f.hitstun > 0) return f.hitstun;
  if (f.blockstun > 0) return f.blockstun;
  if (f.state === "knockdown") {
    const kdLeft = Math.max(0, KNOCKDOWN_TICKS - f.stateT);
    return kdLeft + WAKEUP_INVULN_TICKS;
  }
  if (f.state === "attack") return attackTicksLeft(f);
  if (f.invuln > 0 && f.stateT === 0) return f.invuln;
  return 0;
}

function ticksUntilOppActive(f: FighterView): number {
  if (f.state !== "attack" || !f.attack) return 10_000;
  if (f.attackPhase === "active") return 0;
  if (f.attackPhase === "recovery") return 10_000;
  return Math.max(0, ATTACKS[f.attack].startup - f.stateT);
}

function projectY(y: number, vy: number, ticks: number): number {
  let cy = y;
  let cv = vy;
  for (let i = 0; i < ticks; i++) {
    cv = Math.max(-99, Math.min(MAX_FALL, cv + GRAVITY));
    cy += cv;
    if (cy >= GROUND_Y) {
      cy = GROUND_Y;
      cv = 0;
    }
  }
  return cy;
}

function standingHitOverlaps(kind: AttackKind, meY: number, oppY: number): boolean {
  const data = ATTACKS[kind];
  const hbY = meY - FIGHTER_H;
  const top = Math.min(hbY + data.hitboxYOffset, hbY + Math.max(0, FIGHTER_H - data.hitboxH));
  const bot = top + data.hitboxH;
  const oppTop = oppY - FIGHTER_H;
  return top < oppY && bot > oppTop;
}

function inReach(kind: AttackKind, distance: number, slack = 0): boolean {
  return distance <= centerReach(kind) + slack;
}

function canLand(
  kind: AttackKind,
  distance: number,
  oppActTick: number,
  oppMayRetreat: boolean,
): boolean {
  const activeAt = firstActiveTick(kind);
  if (activeAt >= oppActTick) return false;
  const drift = oppMayRetreat ? WALK_SPEED * activeAt : 0;
  return inReach(kind, distance + drift);
}

function bestPunish(
  obs: Observation,
  oppActTick: number,
  oppMayRetreat: boolean,
): AttackKind | null {
  const d = gap(obs);
  const order: AttackKind[] = obs.me.meter >= ATTACKS.special.meterCost
    ? ["special", "heavy", "light"]
    : ["heavy", "light"];
  let pick: AttackKind | null = null;
  for (const kind of order) {
    if (canLand(kind, d, oppActTick, oppMayRetreat)) {
      if (!pick || ATTACKS[kind].damage > ATTACKS[pick].damage) pick = kind;
    }
  }
  // Prefer a light if the window is tight and heavy/special might drop.
  if (!pick && canLand("light", d, oppActTick, oppMayRetreat)) return "light";
  return pick;
}

function prune(times: number[], now: number): number[] {
  return times.filter((t) => now - t <= HISTORY);
}

function note(mem: Memory, obs: Observation): void {
  if (obs.round !== mem.lastRound) {
    mem.lastRound = obs.round;
    mem.lastOppPhase = null;
    mem.lastOppAttack = null;
    mem.lastOppState = "idle";
  }
  const opp = obs.opponent;
  const d = gap(obs);
  const lastD = Math.abs(mem.lastOppX - obs.me.x);
  mem.samples += 1;

  if (opp.attack && opp.attackPhase === "startup" && mem.lastOppPhase !== "startup") {
    mem.attacks[opp.attack] += 1;
    mem.recentAttackAt.push(obs.tick);
  }
  if (opp.airborne && !mem.lastOppAir) {
    mem.jumps += 1;
    mem.recentJumpAt.push(obs.tick);
  }
  if (opp.blocking || opp.state === "block") mem.blocks += 1;
  if (d < lastD - 1) mem.approaches += 1;
  if (d > lastD + 1) mem.retreats += 1;

  mem.recentAttackAt = prune(mem.recentAttackAt, obs.tick);
  mem.recentJumpAt = prune(mem.recentJumpAt, obs.tick);
  if (obs.tick - mem.windowStart > HISTORY * 4) {
    // Keep rates from exploding over a long set; decay raw counters slowly.
    mem.attacks.light = Math.ceil(mem.attacks.light / 2);
    mem.attacks.heavy = Math.ceil(mem.attacks.heavy / 2);
    mem.attacks.special = Math.ceil(mem.attacks.special / 2);
    mem.jumps = Math.ceil(mem.jumps / 2);
    mem.blocks = Math.ceil(mem.blocks / 2);
    mem.approaches = Math.ceil(mem.approaches / 2);
    mem.retreats = Math.ceil(mem.retreats / 2);
    mem.samples = Math.ceil(mem.samples / 2);
    mem.windowStart = obs.tick;
  }

  mem.lastOppX = opp.x;
  mem.lastOppY = opp.y;
  mem.lastOppState = opp.state;
  mem.lastOppPhase = opp.attackPhase;
  mem.lastOppAttack = opp.attack;
  mem.lastOppAir = opp.airborne;
  mem.lastMeHealth = obs.me.health;
  mem.lastOppHealth = opp.health;
}

function attackN(mem: Memory): number {
  return mem.attacks.light + mem.attacks.heavy + mem.attacks.special;
}

function style(mem: Memory): {
  turtle: boolean;
  rusher: boolean;
  jumper: boolean;
  prefersHeavy: boolean;
} {
  const n = Math.max(1, mem.samples);
  const swings = attackN(mem);
  return {
    turtle: mem.blocks / n > 0.28 && swings < mem.blocks,
    rusher: mem.approaches > mem.retreats * 1.4 && swings > 4,
    jumper: mem.recentJumpAt.length >= 3 || mem.jumps / n > 0.04,
    prefersHeavy: mem.attacks.heavy >= mem.attacks.light && mem.attacks.heavy >= mem.attacks.special,
  };
}

function favoriteRange(mem: Memory): number {
  const { prefersHeavy, rusher, turtle } = style(mem);
  const attackN = mem.attacks.light + mem.attacks.heavy + mem.attacks.special;
  // A totally passive opponent will never walk in; close to light range.
  if (attackN === 0 && mem.approaches === 0) return centerReach("light") - 4;
  if (turtle) return centerReach("heavy") - 4;
  if (rusher || prefersHeavy) return centerReach("heavy") - 6;
  return centerReach("heavy") - 8;
}

function shouldChip(obs: Observation, mem: Memory): boolean {
  if (obs.me.meter < ATTACKS.special.meterCost) return false;
  if (!inReach("special", gap(obs))) return false;
  const behind = obs.me.health + 40 < obs.opponent.health;
  const late = obs.timeLeftTicks < 900 && obs.me.health <= obs.opponent.health;
  return style(mem).turtle || behind || late;
}

export function createLumiBot(): Bot {
  let mem = freshMemory();

  return {
    id,
    name,
    start(_ctx: BotStartContext) {
      mem = freshMemory();
    },
    act(obs: Observation): Action {
      if (obs.phase !== "fight") {
        return neutral();
      }

      note(mem, obs);

      const me = obs.me;
      const opp = obs.opponent;
      const d = gap(obs);
      const in_ = towardDir(obs);
      const out = awayDir(obs);
      const traits = style(mem);

      if (me.state === "attack" || me.state === "hitstun" || me.state === "knockdown") {
        return neutral();
      }
      if (me.blockstun > 0) return guard();

      const oppAct = ticksUntilAct(opp);
      const oppLocked = oppAct > 1;
      const threatPhase = opp.attackPhase === "startup" || opp.attackPhase === "active";
      const oppReach = opp.attack ? centerReach(opp.attack) : 0;
      const activeIn = ticksUntilOppActive(opp);
      const closing = Math.max(0, -Math.sign(opp.x - me.x) * opp.vx) + (me.vx !== 0 ? 0 : 0);
      const threatReach =
        threatPhase && opp.attack
          ? d <= oppReach + WALK_SPEED * Math.max(1, activeIn + 1) + closing
          : false;

      // 1. Interrupt a slower startup with a faster button, if it will land clean.
      if (opp.attackPhase === "startup" && opp.attack && !me.airborne) {
        const theirActive = activeIn;
        const buttons: AttackKind[] =
          me.meter >= ATTACKS.special.meterCost ? ["light", "heavy", "special"] : ["light", "heavy"];
        let interrupt: AttackKind | null = null;
        for (const kind of buttons) {
          if (firstActiveTick(kind) < theirActive && inReach(kind, d)) {
            const oppY = projectY(opp.y, opp.vy, firstActiveTick(kind));
            if (standingHitOverlaps(kind, me.y, oppY)) {
              interrupt = kind;
              break;
            }
          }
        }
        if (interrupt) return strike(interrupt);
      }

      // 2. Block strikes that will be in range during their active frames.
      if (threatReach && !me.airborne) {
        return guard();
      }
      if (threatPhase && opp.attack && opp.airborne && !me.airborne) {
        // Jump-in: block if they will land close enough for the hitbox to graze.
        const when = Math.max(1, activeIn);
        const futureY = projectY(opp.y, opp.vy, when);
        const futureD = Math.abs((opp.x + opp.vx * when) - me.x);
        if (futureD <= oppReach + 8 && (futureY >= GROUND_Y - 80 || standingHitOverlaps(opp.attack, me.y, futureY))) {
          return guard();
        }
      }

      // 3. Anti-air: hit them on the way down if a standing button will overlap.
      if (opp.airborne && !me.airborne && !threatReach) {
        const aaButtons: AttackKind[] =
          me.meter >= ATTACKS.special.meterCost ? ["light", "heavy", "special"] : ["light", "heavy"];
        for (const kind of aaButtons) {
          const t = firstActiveTick(kind);
          const futureD = Math.abs(opp.x + opp.vx * t - me.x);
          const futureY = projectY(opp.y, opp.vy, t);
          if (inReach(kind, futureD, 4) && standingHitOverlaps(kind, me.y, futureY) && t < Math.max(oppAct, 16)) {
            return strike(kind);
          }
        }
        // If they are still high and closing, hop back or space out; don't eat a meaty landing.
        if (d < centerReach("heavy") && opp.vy >= 0 && !wallInFront(me.x, out)) {
          return walk(out);
        }
        if (d < centerReach("light") + 10 && traits.jumper && !wallInFront(me.x, out)) {
          return hop(out);
        }
      }

      // 4. Punish recovery, hitstun, or a committed whiff (attack that cannot reach).
      const whiffing =
        opp.state === "attack" &&
        !!opp.attack &&
        (opp.attackPhase === "startup" || opp.attackPhase === "active" || opp.attackPhase === "recovery") &&
        d > centerReach(opp.attack) + WALK_SPEED * Math.max(2, activeIn);
      if (oppLocked || opp.state === "hitstun" || opp.attackPhase === "recovery" || whiffing) {
        const retreatRisk =
          !oppLocked && opp.attackPhase !== "recovery" && opp.state !== "hitstun";
        const punish = bestPunish(obs, Math.max(oppAct, 1), retreatRisk);
        if (punish) return strike(punish);
        // Walk into punish range if the window is long enough to step in.
        const step = WALK_SPEED;
        const needed = d - centerReach("light");
        const steps = needed > 0 ? Math.ceil(needed / step) : 0;
        if (steps > 0 && steps + firstActiveTick("light") < oppAct && !wallInFront(me.x, in_)) {
          return walk(in_);
        }
        if (opp.invuln > 0) return d < favoriteRange(mem) && !wallInFront(me.x, out) ? walk(out) : neutral();
      }

      // 5. Don't mash into a turtling opponent except for a paid special chip.
      if (opp.blocking && !oppLocked) {
        if (shouldChip(obs, mem)) return strike("special");
        if (d < favoriteRange(mem) && !wallInFront(me.x, out)) return walk(out);
        if (d > favoriteRange(mem) + 12) return walk(in_);
        return guard();
      }

      // 6. Clock / health: run the lead, press if behind late.
      const ahead = me.health > opp.health + 20 || obs.myWins > obs.oppWins;
      const late = obs.timeLeftTicks < 720;
      if (late && ahead) {
        if (threatReach && !me.airborne) return guard();
        if (!wallInFront(me.x, out) && d < centerReach("special") + 20) return walk(out);
        return guard();
      }

      // 7. Neutral spacing and pokes, adapted to what we've seen.
      const want = favoriteRange(mem);
      if (d > want + 10) return walk(in_);
      if (d < want - 10) {
        if (wallInFront(me.x, out)) {
          // Cornered: jab if they're idle and in range, otherwise hold space.
          if (opp.state === "idle" && inReach("light", d) && !traits.turtle) return strike("light");
          return guard();
        }
        return walk(out);
      }

      if (late && !ahead && inReach("heavy", d)) {
        if (me.meter >= ATTACKS.special.meterCost && inReach("special", d)) return strike("special");
        return strike("heavy");
      }

      // Poke a standing or incoming opponent. Use light up close; heavy if that's
      // the button that actually reaches. Don't mash a turtle.
      const open =
        opp.state === "idle" ||
        opp.state === "walk" ||
        opp.state === "crouch" ||
        (opp.state === "jump" && opp.vy > 0);
      const recentlySwung = mem.recentAttackAt.some((t) => obs.tick - t < 18);
      if (open && !traits.turtle && !recentlySwung) {
        if (inReach("light", d)) return strike("light");
        if (inReach("heavy", d) && attackN(mem) === 0) return strike("heavy");
        if (inReach("heavy", d) && d > centerReach("light") + 4) return strike("heavy");
      }

      if (shouldChip(obs, mem) && opp.state !== "block") return strike("special");

      if (d > want) return walk(in_);
      return guard();
    },
  };
}

export default createLumiBot;
