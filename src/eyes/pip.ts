/**
 * Spectator picture-in-picture: "what the AI sees" (AI Eyes, Project 7).
 *
 * Pure logic, no DOM — the watch page and the auto arena both paint
 * from this. A PiP frame is a first-person POV render (see src/eyes/pov.ts):
 * the fighter's own view, vision-only, with the rear-threat cue when the
 * opponent is behind them. It never shows join codes, host tokens, or
 * raw observation data — the PiP only ever receives a MatchState or a
 * public match snapshot, neither of which carries secrets.
 *
 * Layout: "both" shows the two frames side by side on wide screens and
 * stacked on narrow ones, so the strip still reads at 375px wide.
 */

import { BEST_OF, WINS_NEEDED } from "../engine/constants.ts";
import type { Fighter, FighterStateName, MatchState, Side } from "../engine/types.ts";
import type { FighterSnapshot, MatchPublicState } from "../commander/types.ts";
import { renderPov, type PovFrame, type PovRenderOpts } from "./pov.ts";

export type PipMode = "p1" | "p2" | "both" | "off";

export const PIP_MODES: readonly PipMode[] = ["p1", "p2", "both", "off"];

export const DEFAULT_PIP_MODE: PipMode = "both";

/** Wide layout starts here; below it, "both" stacks vertically. */
export const PIP_STACK_BELOW_PX = 560;

export function parsePipMode(value: unknown): PipMode {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "p1" || v === "p2" || v === "both" || v === "off") return v;
  }
  return DEFAULT_PIP_MODE;
}

export function pipVisibleSides(mode: PipMode): Side[] {
  if (mode === "p1") return ["p1"];
  if (mode === "p2") return ["p2"];
  if (mode === "both") return ["p1", "p2"];
  return [];
}

export interface PipLayout {
  mode: PipMode;
  sides: Side[];
  /** 1 or 2 columns of frames. */
  columns: number;
  /** True when "both" is stacked top-to-bottom (narrow screens). */
  stacked: boolean;
}

/** Pure layout decision, testable without a browser. */
export function pipLayout(mode: PipMode, containerWidthPx: number): PipLayout {
  const sides = pipVisibleSides(mode);
  const width = Number.isFinite(containerWidthPx) && containerWidthPx > 0 ? containerWidthPx : 375;
  const columns = sides.length === 2 && width >= PIP_STACK_BELOW_PX ? 2 : 1;
  return { mode, sides, columns, stacked: sides.length === 2 && columns === 1 };
}

/** Caption for one PiP frame. Set as text content, never as HTML. */
export function pipLabel(side: Side, character: string): string {
  const name = character.trim() || side.toUpperCase();
  return `${name} — what they see`;
}

const FIGHTER_STATES: readonly FighterStateName[] = [
  "idle",
  "walk",
  "crouch",
  "jump",
  "attack",
  "block",
  "hitstun",
  "knockdown",
];

function snapshotState(value: string): FighterStateName {
  return (FIGHTER_STATES as readonly string[]).includes(value) ? (value as FighterStateName) : "idle";
}

function snapshotAttack(value: string | null): Fighter["attack"] {
  return value === "light" || value === "heavy" || value === "special" ? value : null;
}

function snapshotToFighter(snap: FighterSnapshot, id: Side): Fighter {
  const facing: 1 | -1 = snap.facing === 1 || snap.facing === -1 ? snap.facing : id === "p1" ? 1 : -1;
  return {
    id,
    character: snap.character,
    x: snap.x,
    y: snap.y,
    vx: snap.vx,
    vy: snap.vy,
    facing,
    health: snap.health,
    maxHealth: snap.maxHealth,
    meter: snap.meter,
    maxMeter: snap.maxMeter,
    state: snapshotState(snap.state),
    stateT: 0,
    attack: snapshotAttack(snap.attack),
    attackT: 0,
    hitstun: 0,
    blockstun: 0,
    invuln: 0,
    blocking: snap.blocking,
    airborne: snap.airborne,
    combo: snap.combo,
    attackConnected: false,
    hurtbox: { x: 0, y: 0, w: 0, h: 0 },
    hitbox: null,
  };
}

/**
 * Rebuild the minimum MatchState a POV render needs from a public
 * match snapshot. Only positions, facing, state, and attack info are
 * carried — exactly what the eyes can see. The spectator client only
 * ever receives this public shape, so no secret can leak through here.
 */
export function publicStateToMatchState(pub: MatchPublicState): MatchState {
  const phase: MatchState["phase"] =
    pub.matchPhase === "round_end" || pub.matchPhase === "match_end" ? pub.matchPhase : "fight";
  return {
    tick: pub.tick,
    seed: pub.seed,
    rng: 0,
    phase,
    p1: snapshotToFighter(pub.p1, "p1"),
    p2: snapshotToFighter(pub.p2, "p2"),
    p1Wins: pub.p1Wins,
    p2Wins: pub.p2Wins,
    bestOf: BEST_OF,
    winsNeeded: WINS_NEEDED,
    round: {
      number: pub.round,
      tick: 0,
      timeLeftTicks: pub.timeLeftTicks,
      winner: null,
      linger: 0,
    },
    over: pub.over,
    matchWinner: pub.winner,
    events: [],
    lastEvents: [],
  };
}

/** First-person frames for the visible sides of a live MatchState. */
export function renderPipFrames(state: MatchState, mode: PipMode, opts: PovRenderOpts = {}): PovFrame[] {
  return pipVisibleSides(mode).map((side) => renderPov(state, side, opts));
}

/** First-person frames for the visible sides of a public match snapshot. */
export function renderPipFramesFromPublic(
  pub: MatchPublicState,
  mode: PipMode,
  opts: PovRenderOpts = {},
): PovFrame[] {
  return renderPipFrames(publicStateToMatchState(pub), mode, opts);
}
