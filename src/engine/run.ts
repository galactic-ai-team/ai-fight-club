import { appendInput, emptyReplay } from "./replay.ts";
import { normalizeAction } from "./action.ts";
import { observe } from "./observe.ts";
import { createMatch, stepMatch } from "./sim.ts";
import type { Bot } from "../bots/types.ts";
import type { MatchState, Replay } from "./types.ts";

const MAX_TICKS = 60 * 60 * 8; // 8 minutes of sim as a hard stop

export interface RunResult {
  state: MatchState;
  replay: Replay;
}

export function runMatch(
  p1: Bot,
  p2: Bot,
  opts: { seed: number; p1Character?: string; p2Character?: string },
): RunResult {
  const state = createMatch({
    seed: opts.seed,
    p1Character: opts.p1Character,
    p2Character: opts.p2Character,
  });
  const replay = emptyReplay({
    seed: opts.seed,
    p1BotId: p1.id,
    p2BotId: p2.id,
    p1Character: state.p1.character,
    p2Character: state.p2.character,
  });
  p1.start?.({ side: "p1", seed: opts.seed, opponentId: p2.id });
  p2.start?.({ side: "p2", seed: opts.seed, opponentId: p1.id });

  while (!state.over && state.tick < MAX_TICKS) {
    // Record precisely the same normalized inputs the simulator consumes.
    // This prevents desyncs from untrusted getters or malformed bot output.
    const a1 = normalizeAction(p1.act(observe(state, "p1")));
    const a2 = normalizeAction(p2.act(observe(state, "p2")));
    appendInput(replay, a1, a2);
    stepMatch(state, a1, a2);
  }

  replay.result = {
    winner: state.matchWinner,
    p1Wins: state.p1Wins,
    p2Wins: state.p2Wins,
    ticks: state.tick,
  };
  return { state, replay };
}
