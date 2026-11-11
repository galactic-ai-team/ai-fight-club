import type { PROTOCOL_VERSION, REPLAY_VERSION } from "./constants.ts";

export type Side = "p1" | "p2";
export type MoveDir = "none" | "left" | "right";
export type Vertical = "none" | "crouch" | "jump";
export type AttackKind = "light" | "heavy" | "special";
export type AttackInput = "none" | AttackKind;

export type FighterStateName =
  | "idle"
  | "walk"
  | "crouch"
  | "jump"
  | "attack"
  | "block"
  | "hitstun"
  | "knockdown";

export type AttackPhase = "startup" | "active" | "recovery";

export type MatchPhase = "fight" | "round_end" | "match_end";

export type RoundWinner = Side | "draw";

export interface Action {
  move: MoveDir;
  vertical: Vertical;
  attack: AttackInput;
  block: boolean;
}

export const NEUTRAL_ACTION: Action = {
  move: "none",
  vertical: "none",
  attack: "none",
  block: false,
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Fighter {
  id: Side;
  character: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  health: number;
  maxHealth: number;
  meter: number;
  maxMeter: number;
  state: FighterStateName;
  stateT: number;
  attack: AttackKind | null;
  attackT: number;
  hitstun: number;
  blockstun: number;
  invuln: number;
  blocking: boolean;
  airborne: boolean;
  combo: number;
  /** Set when the current attack's hitbox has already connected. */
  attackConnected: boolean;
  hurtbox: Rect;
  hitbox: Rect | null;
}

export interface FighterView {
  id: Side;
  character: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  health: number;
  maxHealth: number;
  meter: number;
  maxMeter: number;
  state: FighterStateName;
  stateT: number;
  attack: AttackKind | null;
  attackPhase: AttackPhase | null;
  hitstun: number;
  blockstun: number;
  invuln: number;
  blocking: boolean;
  airborne: boolean;
  combo: number;
  hurtbox: Rect;
  hitbox: Rect | null;
}

export interface Observation {
  protocol: typeof PROTOCOL_VERSION;
  tick: number;
  seed: number;
  side: Side;
  round: number;
  timeLeftTicks: number;
  bestOf: 3;
  myWins: number;
  oppWins: number;
  phase: MatchPhase;
  me: FighterView;
  opponent: FighterView;
}

export type MatchEvent =
  | {
      type: "hit";
      tick: number;
      attacker: Side;
      defender: Side;
      kind: AttackKind;
      damage: number;
      blocked: boolean;
    }
  | { type: "ko"; tick: number; winner: Side; loser: Side }
  | { type: "timeout"; tick: number; winner: RoundWinner }
  | { type: "round_end"; tick: number; winner: RoundWinner; round: number }
  | { type: "match_end"; tick: number; winner: Side };

export interface RoundState {
  number: number;
  tick: number;
  timeLeftTicks: number;
  winner: RoundWinner | null;
  linger: number;
}

export interface MatchState {
  tick: number;
  seed: number;
  rng: number;
  phase: MatchPhase;
  p1: Fighter;
  p2: Fighter;
  p1Wins: number;
  p2Wins: number;
  bestOf: 3;
  winsNeeded: number;
  round: RoundState;
  over: boolean;
  matchWinner: Side | null;
  events: MatchEvent[];
  lastEvents: MatchEvent[];
}

export interface ReplayHeader {
  version: typeof REPLAY_VERSION;
  protocol: typeof PROTOCOL_VERSION;
  seed: number;
  stage: string;
  p1: { botId: string; character: string };
  p2: { botId: string; character: string };
}

export interface Replay extends ReplayHeader {
  inputs: Action[][];
  result?: {
    winner: Side | null;
    p1Wins: number;
    p2Wins: number;
    ticks: number;
  };
}

export interface AttackData {
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  chip: number;
  hitstun: number;
  blockstun: number;
  range: number;
  hitboxH: number;
  hitboxYOffset: number;
  meterCost: number;
  knockback: number;
  popY: number;
}

export interface CreateMatchOpts {
  seed: number;
  p1Character?: string;
  p2Character?: string;
}
