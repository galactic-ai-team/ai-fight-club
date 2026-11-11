import { PROTOCOL_VERSION, REPLAY_VERSION, STAGE_ID } from "./constants.ts";
import { normalizeAction } from "./action.ts";
import { createMatch, stepMatch } from "./sim.ts";
import type { Action, Replay, Side } from "./types.ts";

export interface RecordedMatch {
  replay: Replay;
}

export function emptyReplay(opts: {
  seed: number;
  p1BotId: string;
  p2BotId: string;
  p1Character: string;
  p2Character: string;
}): Replay {
  return {
    version: REPLAY_VERSION,
    protocol: PROTOCOL_VERSION,
    seed: opts.seed,
    stage: STAGE_ID,
    p1: { botId: opts.p1BotId, character: opts.p1Character },
    p2: { botId: opts.p2BotId, character: opts.p2Character },
    inputs: [],
  };
}

export function appendInput(replay: Replay, p1: Action, p2: Action): void {
  replay.inputs.push([normalizeAction(p1), normalizeAction(p2)]);
}

export function playback(replay: Replay) {
  const state = createMatch({
    seed: replay.seed,
    p1Character: replay.p1.character,
    p2Character: replay.p2.character,
  });
  for (const pair of replay.inputs) {
    const a = pair[0] ?? { move: "none", vertical: "none", attack: "none", block: false };
    const b = pair[1] ?? { move: "none", vertical: "none", attack: "none", block: false };
    stepMatch(state, a, b);
    if (state.over) break;
  }
  return state;
}

export function serializeReplay(replay: Replay): string {
  return JSON.stringify(replay);
}

export function parseReplay(json: string): Replay {
  const raw = JSON.parse(json) as Replay;
  if (raw.version !== REPLAY_VERSION) {
    throw new Error(`unsupported replay version: ${String(raw.version)}`);
  }
  if (!Array.isArray(raw.inputs)) {
    throw new Error("replay missing inputs");
  }
  return raw;
}

export function winnerLabel(side: Side | null): string {
  if (side === "p1") return "P1";
  if (side === "p2") return "P2";
  return "None";
}
