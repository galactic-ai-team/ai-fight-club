import { ATTACKS } from "../engine/attacks.ts";
import type { Action, AttackKind, Observation } from "../engine/types.ts";

export const LIGHT_REACH = ATTACKS.light.range + 6;
export const HEAVY_REACH = ATTACKS.heavy.range + 10;
export const SPECIAL_REACH = ATTACKS.special.range + 8;

export function dist(obs: Observation): number {
  return Math.abs(obs.opponent.x - obs.me.x);
}

export function towardDir(obs: Observation): Action["move"] {
  const dx = obs.opponent.x - obs.me.x;
  return dx > 0 ? "right" : dx < 0 ? "left" : "none";
}

export function awayDir(obs: Observation): Action["move"] {
  const dx = obs.opponent.x - obs.me.x;
  return dx > 0 ? "left" : dx < 0 ? "right" : "none";
}

export function neutral(): Action {
  return { move: "none", vertical: "none", attack: "none", block: false };
}

export function attack(kind: AttackKind): Action {
  return { move: "none", vertical: "none", attack: kind, block: false };
}

export function block(): Action {
  return { move: "none", vertical: "none", attack: "none", block: true };
}

export function retreat(obs: Observation): Action {
  return { move: awayDir(obs), vertical: "none", attack: "none", block: false };
}

export function approach(obs: Observation): Action {
  return { move: towardDir(obs), vertical: "none", attack: "none", block: false };
}

export function isThreat(obs: Observation): boolean {
  return (
    obs.opponent.attackPhase === "startup" ||
    obs.opponent.attackPhase === "active"
  );
}

export function isRecovering(obs: Observation): boolean {
  return obs.opponent.attackPhase === "recovery";
}

export function canAffordSpecial(obs: Observation): boolean {
  return obs.me.meter >= ATTACKS.special.meterCost;
}
