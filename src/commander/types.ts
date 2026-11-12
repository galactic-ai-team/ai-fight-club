/** Commander mode types. Plans the controlling AI sends; autopilot executes them at 60 Hz. */

export const STANCES = ["rush", "zone", "turtle", "bait", "anti-air"] as const;
export type Stance = (typeof STANCES)[number];

export const GO_FORS = ["none", "special", "light", "heavy", "combo"] as const;
export type GoFor = (typeof GO_FORS)[number];

export const WINDOW_MODES = ["off", "3s", "5s", "5s-wait"] as const;
export type WindowMode = (typeof WINDOW_MODES)[number];

export function isStance(v: unknown): v is Stance {
  return typeof v === "string" && (STANCES as readonly string[]).includes(v);
}

export function isGoFor(v: unknown): v is GoFor {
  return typeof v === "string" && (GO_FORS as readonly string[]).includes(v);
}

export function isWindowMode(v: unknown): v is WindowMode {
  return typeof v === "string" && (WINDOW_MODES as readonly string[]).includes(v);
}

export const OPEN_SEATS = ["none", "p1", "p2", "both"] as const;
export type OpenSeat = (typeof OPEN_SEATS)[number];

export function isOpenSeat(v: unknown): v is OpenSeat {
  return typeof v === "string" && (OPEN_SEATS as readonly string[]).includes(v);
}

/** Parse create-time --open-seat / form values. Invalid input yields null. */
export function parseOpenSeat(v: unknown): OpenSeat | null {
  if (v === undefined || v === null || v === "") return "none";
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s === "none" || s === "off" || s === "closed") return "none";
  if (s === "p1" || s === "1") return "p1";
  if (s === "p2" || s === "2") return "p2";
  if (s === "both" || s === "all" || s === "p1,p2" || s === "p1+p2") return "both";
  return null;
}

export function seatIsOpen(open: OpenSeat | undefined | null, side: "p1" | "p2"): boolean {
  const s = open ?? "none";
  return s === "both" || s === side;
}

export interface CommanderDirective {
  stance: Stance;
  /** Preferred distance to the opponent, in stage pixels. */
  spacing: number;
  /** 0 = purely defensive positioning; 1 = always look for a hit. */
  aggression: number;
  /** One-shot intent: attempt this, then return to the stance. */
  goFor: GoFor;
  /** Optional on-screen callout. Sanitized, max 80 chars (60 on the open-seat GET). */
  taunt: string;
}

export const MIN_SPACING = 24;
export const MAX_SPACING = 400;
export const MAX_TAUNT = 80;
/** Open-seat GET /cmd caps taunts tighter than the authenticated POST path. */
export const OPEN_SEAT_MAX_TAUNT = 60;

export const STANCE_DEFAULTS: Record<Stance, Pick<CommanderDirective, "spacing" | "aggression">> = {
  rush: { spacing: 48, aggression: 0.8 },
  zone: { spacing: 88, aggression: 0.55 },
  turtle: { spacing: 44, aggression: 0.35 },
  bait: { spacing: 72, aggression: 0.55 },
  "anti-air": { spacing: 56, aggression: 0.6 },
};

export const DEFAULT_DIRECTIVE: CommanderDirective = {
  stance: "zone",
  spacing: STANCE_DEFAULTS.zone.spacing,
  aggression: STANCE_DEFAULTS.zone.aggression,
  goFor: "none",
  taunt: "",
};

export interface PartialDirective {
  stance?: Stance;
  spacing?: number;
  aggression?: number;
  goFor?: GoFor;
  taunt?: string;
}

export interface CommandRecord {
  seq: number;
  side: "p1" | "p2";
  directive: CommanderDirective;
  raw: string;
  issuedAtMs: number | null;
  receivedAtMs: number;
  /** Tick at which the host applied this command.  -1 if not yet applied. */
  appliedTick: number;
  latencyMs: number;
  controller: string;
}

export interface WindowSnapshot {
  mode: WindowMode;
  open: boolean;
  index: number;
  openedAtTick: number;
  remainingMs: number;
  p1Submitted: boolean;
  p2Submitted: boolean;
}

export interface FighterSnapshot {
  character: string;
  controller: string;
  health: number;
  maxHealth: number;
  meter: number;
  maxMeter: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  state: string;
  attack: string | null;
  attackPhase: string | null;
  airborne: boolean;
  blocking: boolean;
  combo: number;
  lastMoves: string[];
  command: CommanderDirective | null;
  commandSeq: number | null;
  latencyMs: number | null;
  taunt: string;
  inControl: string;
}

export interface MatchPublicState {
  id: string;
  tick: number;
  seed: number;
  phase: "waiting" | "fight" | "round_end" | "match_end" | "window" | "ended";
  matchPhase: string;
  round: number;
  timeLeftTicks: number;
  p1Wins: number;
  p2Wins: number;
  over: boolean;
  winner: "p1" | "p2" | null;
  window: WindowSnapshot;
  p1: FighterSnapshot;
  p2: FighterSnapshot;
  p1Bot: string;
  p2Bot: string;
  events: string[];
  summary: string;
  hostPresent: boolean;
  updatedAtMs: number;
  startedAtMs: number | null;
  /** Which seats can be commanded with no join code, for this match only. */
  openSeat?: OpenSeat;
}

export interface PublicMatchListItem {
  id: string;
  p1: { character: string; controller: string };
  p2: { character: string; controller: string };
  status: "waiting" | "live" | "ended" | "stale";
  score: string;
  tick: number;
  windowMode: WindowMode;
  openSeat?: OpenSeat;
  watchPath: string;
  updatedAtMs: number;
}

export interface CreateMatchRequest {
  seed?: number;
  window?: WindowMode;
  p1Bot?: string;
  p2Bot?: string;
  p1Character?: string;
  p2Character?: string;
  p1Controller?: string;
  p2Controller?: string;
  /** Seconds until the match (and its join codes) expire. Default 2 hours. */
  ttlSeconds?: number;
  /** Mark a fighter as commandable by anyone with no code, for this match only. */
  openSeat?: OpenSeat;
}

export interface CreateMatchResponse {
  id: string;
  watchPath: string;
  window: WindowMode;
  seed: number;
  expiresAt: string;
  p1: { controller: string; character: string; bot: string };
  p2: { controller: string; character: string; bot: string };
  openSeat?: OpenSeat;
  /** Present only on the create response. Never stored in the repo or re-fetched. */
  secrets?: {
    p1Code: string;
    p2Code: string;
    hostToken: string;
  };
}

export type ParseOk = { ok: true; partial: PartialDirective; raw: string; warnings: string[] };
export type ParseErr = { ok: false; error: string; raw: string };
export type ParseResult = ParseOk | ParseErr;
