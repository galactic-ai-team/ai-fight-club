import type { AttackKind, Fighter, MatchState } from "../engine/types.ts";
import { directiveToCompact } from "./parse.ts";
import type {
  CommanderDirective,
  FighterSnapshot,
  MatchPublicState,
  WindowSnapshot,
} from "./types.ts";

const MOVE_LOG = 12;

export function pushMove(log: string[], label: string, cap = MOVE_LOG): string[] {
  const next = log.length ? log.slice() : [];
  const last = next[next.length - 1];
  if (last === label) return next; // compress runs of the same label at the tail? keep them, actually useful
  next.push(label);
  if (next.length > cap) next.splice(0, next.length - cap);
  return next;
}

export function actionLabel(opts: {
  state: string;
  attack: AttackKind | string | null;
  blocking: boolean;
  move?: string;
}): string {
  if (opts.state === "hitstun") return "hitstun";
  if (opts.state === "knockdown") return "down";
  if (opts.state === "attack" && opts.attack) return String(opts.attack);
  if (opts.blocking || opts.state === "block") return "block";
  if (opts.state === "jump") return "jump";
  if (opts.state === "crouch") return "crouch";
  if (opts.state === "walk") return "walk";
  return "idle";
}

export function describePattern(sideLabel: string, moves: string[], opponentMoves: string[]): string {
  if (moves.length < 4) return `${sideLabel} settling in.`;
  const last = moves.slice(-10);
  const blocks = last.filter((m) => m === "block").length;
  const attacks = last.filter((m) => m === "light" || m === "heavy" || m === "special").length;
  const walks = last.filter((m) => m === "walk").length;
  const oppAttacks = opponentMoves.slice(-10).filter((m) => m === "light" || m === "heavy" || m === "special").length;
  const parts: string[] = [];
  if (blocks >= 5) parts.push(`${sideLabel} is blocking a lot (${blocks}/10)`);
  if (attacks >= 4) parts.push(`${sideLabel} is pressing (${attacks} swings)`);
  if (walks >= 6 && attacks <= 1) parts.push(`${sideLabel} is repositioning`);
  if (oppAttacks >= 4 && blocks >= 3) parts.push(`${sideLabel} absorbing pressure`);
  if (!parts.length) parts.push(`${sideLabel} mixed (${last.join(",")})`);
  return parts.join("; ") + ".";
}

function fighterLine(
  tag: string,
  snap: FighterSnapshot,
): string {
  const cmd = snap.command ? directiveToCompact(snap.command) : "default";
  const lat = snap.latencyMs !== null ? `${(snap.latencyMs / 1000).toFixed(2)}s` : "—";
  const air = snap.airborne ? " air" : "";
  const taunt = snap.taunt ? `  taunt="${snap.taunt}"` : "";
  return (
    `${tag} ${snap.character} (${snap.controller})  HP=${snap.health}/${snap.maxHealth}  ` +
    `meter=${snap.meter}/${snap.maxMeter}  pos=${Math.round(snap.x)},${Math.round(snap.y)}  ` +
    `state=${snap.state}${air}  last=${snap.lastMoves.slice(-5).join(",") || "—"}  ` +
    `cmd=${cmd}  latency=${lat}${taunt}`
  );
}

export function formatStateText(s: MatchPublicState): string {
  const clock = Math.max(0, Math.ceil(s.timeLeftTicks / 60));
  const win = s.window.open
    ? `WINDOW open #${s.window.index}  remaining=${(s.window.remainingMs / 1000).toFixed(1)}s  mode=${s.window.mode}  submitted=${s.window.p1Submitted ? "P1" : "-"}${s.window.p2Submitted ? "P2" : "-"}`
    : `WINDOW closed  mode=${s.window.mode}  next in fight-time`;
  const pattern = describePattern("P1", s.p1.lastMoves, s.p2.lastMoves) + " " +
    describePattern("P2", s.p2.lastMoves, s.p1.lastMoves);
  const spacing = Math.abs(s.p1.x - s.p2.x);
  const lines = [
    `MATCH ${s.id}  tick=${s.tick}  round=${s.round}  time=${clock}s  phase=${s.phase}  score=${s.p1Wins}-${s.p2Wins}` +
      (s.over ? `  winner=${s.winner ?? "draw"}` : "") +
      (s.hostPresent ? "  host=yes" : "  host=waiting") +
      (s.openSeat && s.openSeat !== "none" ? `  openSeat=${s.openSeat}` : "") +
      (s.waitingForCoaches
        ? `  waitingForCoaches=yes p1=${s.coachesReady?.p1 ? "ready" : "waiting"} p2=${s.coachesReady?.p2 ? "ready" : "waiting"} remain=${((s.readyRemainingMs ?? 0) / 1000).toFixed(0)}s`
        : s.startWhenReady ? "  startWhenReady=yes" : ""),
    win,
    fighterLine("P1", s.p1),
    fighterLine("P2", s.p2),
    `SPACING ${Math.round(spacing)}`,
    `PATTERN ${pattern}`,
  ];
  if (s.events.length) {
    lines.push(`EVENTS ${s.events.slice(-4).join(" | ")}`);
  }
  return lines.join("\n");
}

export function snapshotFighter(
  f: Fighter,
  opts: {
    controller: string;
    attackPhase: string | null;
    lastMoves: string[];
    command: CommanderDirective | null;
    commandSeq: number | null;
    latencyMs: number | null;
  },
): FighterSnapshot {
  return {
    character: f.character,
    controller: opts.controller,
    health: f.health,
    maxHealth: f.maxHealth,
    meter: f.meter,
    maxMeter: f.maxMeter,
    x: f.x,
    y: f.y,
    vx: f.vx,
    vy: f.vy,
    facing: f.facing,
    state: f.state,
    attack: f.attack,
    attackPhase: opts.attackPhase,
    airborne: f.airborne,
    blocking: f.blocking,
    combo: f.combo,
    lastMoves: opts.lastMoves.slice(-MOVE_LOG),
    command: opts.command,
    commandSeq: opts.commandSeq,
    latencyMs: opts.latencyMs,
    taunt: opts.command?.taunt ?? "",
    inControl: opts.controller,
  };
}

export function emptyWindow(mode: WindowSnapshot["mode"]): WindowSnapshot {
  return {
    mode,
    open: false,
    index: 0,
    openedAtTick: -1,
    remainingMs: 0,
    p1Submitted: false,
    p2Submitted: false,
  };
}

/** Build a compact public state from a live engine match (host side). */
export function publicFromMatch(
  id: string,
  state: MatchState,
  extras: {
    seed: number;
    window: WindowSnapshot;
    p1: Omit<Parameters<typeof snapshotFighter>[1], "attackPhase"> & { attackPhase?: string | null };
    p2: Omit<Parameters<typeof snapshotFighter>[1], "attackPhase"> & { attackPhase?: string | null };
    p1Bot: string;
    p2Bot: string;
    events: string[];
    hostPresent: boolean;
    updatedAtMs: number;
    startedAtMs: number | null;
    phaseOverride?: MatchPublicState["phase"];
    openSeat?: MatchPublicState["openSeat"];
    startWhenReady?: boolean;
    waitingForCoaches?: boolean;
    coachesReady?: { p1: boolean; p2: boolean };
    readyRemainingMs?: number;
  },
): MatchPublicState {
  const p1 = snapshotFighter(state.p1, {
    ...extras.p1,
    attackPhase: extras.p1.attackPhase ?? null,
  });
  const p2 = snapshotFighter(state.p2, {
    ...extras.p2,
    attackPhase: extras.p2.attackPhase ?? null,
  });
  const phase: MatchPublicState["phase"] =
    extras.phaseOverride ??
    (extras.window.open ? "window"
    : state.over ? "ended"
    : state.phase === "fight" ? "fight"
    : state.phase === "round_end" ? "round_end"
    : "match_end");
  const pub: MatchPublicState = {
    id,
    tick: state.tick,
    seed: extras.seed,
    phase,
    matchPhase: state.phase,
    round: state.round.number,
    timeLeftTicks: state.round.timeLeftTicks,
    p1Wins: state.p1Wins,
    p2Wins: state.p2Wins,
    over: state.over,
    winner: state.matchWinner,
    window: extras.window,
    p1,
    p2,
    p1Bot: extras.p1Bot,
    p2Bot: extras.p2Bot,
    events: extras.events.slice(-8),
    summary: "",
    hostPresent: extras.hostPresent,
    updatedAtMs: extras.updatedAtMs,
    startedAtMs: extras.startedAtMs,
    openSeat: extras.openSeat ?? "none",
    startWhenReady: extras.startWhenReady,
    waitingForCoaches: extras.waitingForCoaches,
    coachesReady: extras.coachesReady,
    readyRemainingMs: extras.readyRemainingMs,
  };
  pub.summary = formatStateText(pub);
  return pub;
}
