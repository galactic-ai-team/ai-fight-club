import { appendInput, emptyReplay, playback, serializeReplay } from "../engine/replay.ts";
import { createMatch, stepMatch } from "../engine/sim.ts";
import { observe } from "../engine/observe.ts";
import { canonicalState, stateHash } from "../engine/canonical.ts";
import type { MatchState, Replay, Side } from "../engine/types.ts";
import { createCommanderAutopilot, initialFromBotId, type Autopilot } from "./autopilot.ts";
import type { CommanderDirective, PartialDirective, WindowMode } from "./types.ts";

export interface TimedCommand {
  tick: number;
  side: Side;
  partial: PartialDirective;
}

export interface CommanderReplay {
  seed: number;
  p1Character: string;
  p2Character: string;
  p1Bot: string;
  p2Bot: string;
  p1Controller: string;
  p2Controller: string;
  windowMode: WindowMode;
  commands: TimedCommand[];
  engine?: Replay;
}

export interface CommanderRunResult {
  state: MatchState;
  engineReplay: Replay;
  applied: Array<{ tick: number; side: Side; directive: CommanderDirective }>;
  hash: string;
}

function makePilot(botId: string, id: string, name: string): Autopilot {
  return createCommanderAutopilot({
    id,
    name,
    initial: initialFromBotId(botId),
  });
}

const MAX_TICKS = 60 * 60 * 8;

/**
 * Run a deterministic commander match: autopilots execute every tick,
 * and timed commands are applied at the start of their tick (before act).
 * Decision-window pauses are wall-clock only and do not appear here —
 * they never affect the simulation.
 */
export function runCommanderMatch(
  replay: CommanderReplay,
  opts: { maxTicks?: number } = {},
): CommanderRunResult {
  const maxTicks = opts.maxTicks ?? MAX_TICKS;
  const state = createMatch({
    seed: replay.seed,
    p1Character: replay.p1Character,
    p2Character: replay.p2Character,
  });
  const p1 = makePilot(replay.p1Bot, "p1-commander", replay.p1Controller);
  const p2 = makePilot(replay.p2Bot, "p2-commander", replay.p2Controller);
  p1.start?.({ side: "p1", seed: replay.seed, opponentId: p2.id });
  p2.start?.({ side: "p2", seed: replay.seed, opponentId: p1.id });

  const engine = emptyReplay({
    seed: replay.seed,
    p1BotId: p1.id,
    p2BotId: p2.id,
    p1Character: state.p1.character,
    p2Character: state.p2.character,
  });

  const queued = replay.commands
    .slice()
    .sort((a, b) => a.tick - b.tick || a.side.localeCompare(b.side));
  let qi = 0;
  const applied: CommanderRunResult["applied"] = [];

  while (!state.over && state.tick < maxTicks) {
    const tick = state.tick;
    while (qi < queued.length) {
      const c = queued[qi];
      if (!c || c.tick > tick) break;
      const pilot = c.side === "p1" ? p1 : p2;
      const dir = pilot.setCommand(c.partial, tick);
      applied.push({ tick, side: c.side, directive: dir });
      qi += 1;
    }
    const a1 = p1.act(observe(state, "p1"));
    const a2 = p2.act(observe(state, "p2"));
    appendInput(engine, a1, a2);
    stepMatch(state, a1, a2);
  }

  engine.result = {
    winner: state.matchWinner,
    p1Wins: state.p1Wins,
    p2Wins: state.p2Wins,
    ticks: state.tick,
  };
  return { state, engineReplay: engine, applied, hash: stateHash(state) };
}

/** Re-run from the recorded engine inputs; used to confirm the log is complete. */
export function playbackEngine(engine: Replay): MatchState {
  return playback(engine);
}

export function sameCanonical(a: MatchState, b: MatchState): boolean {
  return canonicalState(a) === canonicalState(b);
}

export function serializeCommanderReplay(r: CommanderReplay): string {
  return JSON.stringify({
    seed: r.seed,
    p1Character: r.p1Character,
    p2Character: r.p2Character,
    p1Bot: r.p1Bot,
    p2Bot: r.p2Bot,
    p1Controller: r.p1Controller,
    p2Controller: r.p2Controller,
    windowMode: r.windowMode,
    commands: r.commands,
    engine: r.engine,
  });
}

export { serializeReplay };
