import type { Fighter, MatchEvent, MatchState, Rect } from "./types.ts";

/** Snapshot format independent of the v0 bot protocol and v1 input replay. */
export const MATCH_SNAPSHOT_VERSION = 1 as const;

type Dict = Record<string, unknown>;

function isRecord(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function assertFields(object: Dict, names: readonly string[], check: (value: unknown) => boolean): void {
  for (const name of names) {
    if (!check(object[name])) throw new Error(`invalid match snapshot field: ${name}`);
  }
}

function isRect(value: unknown): value is Rect {
  if (!isRecord(value)) return false;
  return isInt(value.x) && isInt(value.y) && isInt(value.w) && isInt(value.h) &&
    value.w >= 0 && value.h >= 0;
}

function isFighter(value: unknown, id: "p1" | "p2"): value is Fighter {
  if (!isRecord(value) || value.id !== id || typeof value.character !== "string") return false;
  const integers = [
    "x", "y", "vx", "vy", "health", "maxHealth", "meter", "maxMeter", "stateT",
    "attackT", "hitstun", "blockstun", "invuln", "combo",
  ];
  if (!integers.every((field) => isInt(value[field]))) return false;
  if (value.facing !== -1 && value.facing !== 1) return false;
  if (!["idle", "walk", "crouch", "jump", "attack", "block", "hitstun", "knockdown"].includes(String(value.state))) return false;
  if (value.attack !== null && !["light", "heavy", "special"].includes(String(value.attack))) return false;
  if (!["blocking", "airborne", "attackConnected"].every((field) => typeof value[field] === "boolean")) return false;
  return isRect(value.hurtbox) && (value.hitbox === null || isRect(value.hitbox));
}

function isEvent(value: unknown): value is MatchEvent {
  if (!isRecord(value) || !isInt(value.tick)) return false;
  const side = (v: unknown) => v === "p1" || v === "p2";
  const winner = (v: unknown) => side(v) || v === "draw";
  switch (value.type) {
    case "hit":
      return side(value.attacker) && side(value.defender) &&
        ["light", "heavy", "special"].includes(String(value.kind)) &&
        isInt(value.damage) && typeof value.blocked === "boolean";
    case "ko":
      return side(value.winner) && side(value.loser);
    case "timeout":
      return winner(value.winner);
    case "round_end":
      return winner(value.winner) && isInt(value.round);
    case "match_end":
      return side(value.winner);
    default:
      return false;
  }
}

function assertMatchState(value: unknown): asserts value is MatchState {
  if (!isRecord(value)) throw new Error("invalid match snapshot state");
  assertFields(value, ["tick", "seed", "rng", "p1Wins", "p2Wins", "bestOf", "winsNeeded"], isInt);
  assertFields(value, ["over"], (v) => typeof v === "boolean");
  if (!["fight", "round_end", "match_end"].includes(String(value.phase)) ||
      (value.matchWinner !== null && value.matchWinner !== "p1" && value.matchWinner !== "p2") ||
      !isFighter(value.p1, "p1") || !isFighter(value.p2, "p2")) {
    throw new Error("invalid match snapshot fighters or phase");
  }
  const round = value.round;
  if (!isRecord(round)) throw new Error("invalid match snapshot round");
  assertFields(round, ["number", "tick", "timeLeftTicks", "linger"], isInt);
  if (round.winner !== null && round.winner !== "p1" && round.winner !== "p2" && round.winner !== "draw") {
    throw new Error("invalid match snapshot round winner");
  }
  if (!Array.isArray(value.events) || !value.events.every(isEvent) ||
      !Array.isArray(value.lastEvents) || !value.lastEvents.every(isEvent)) {
    throw new Error("invalid match snapshot events");
  }
}

/** Every mutable field is recorded (including RNG, boxes, round clocks, and event history). */
export function serializeMatchState(state: MatchState): string {
  assertMatchState(state);
  return JSON.stringify({ version: MATCH_SNAPSHOT_VERSION, state });
}

/** Restores an independent, mutable state suitable for continuing stepMatch at any tick. */
export function restoreMatchState(json: string): MatchState {
  const envelope: unknown = JSON.parse(json);
  if (!isRecord(envelope) || envelope.version !== MATCH_SNAPSHOT_VERSION) {
    throw new Error("unsupported match snapshot version");
  }
  assertMatchState(envelope.state);
  return envelope.state;
}

/** Deep clone with no shared fighter, hitbox, round, or event references. */
export function cloneState(state: MatchState): MatchState {
  return restoreMatchState(serializeMatchState(state));
}
