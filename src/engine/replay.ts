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
  const value: unknown = JSON.parse(json);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid replay envelope");
  }
  const raw = value as Record<string, unknown>;
  if (raw.version !== REPLAY_VERSION) {
    throw new Error(`unsupported replay version: ${String(raw.version)}`);
  }
  if (raw.protocol !== PROTOCOL_VERSION) throw new Error("unsupported replay protocol");
  if (typeof raw.seed !== "number" || !Number.isSafeInteger(raw.seed) ||
      typeof raw.stage !== "string" || !Array.isArray(raw.inputs)) {
    throw new Error("invalid replay header or inputs");
  }
  const fighter = (v: unknown): v is Replay["p1"] =>
    typeof v === "object" && v !== null && !Array.isArray(v) &&
    typeof (v as Replay["p1"]).botId === "string" &&
    typeof (v as Replay["p1"]).character === "string";
  if (!fighter(raw.p1) || !fighter(raw.p2)) throw new Error("invalid replay fighters");

  // Preserve the v1 input-pair schema and neutralize invalid button fields.
  const inputs = raw.inputs.map((row: unknown) => {
    const pair = Array.isArray(row) ? row : [];
    return [normalizeAction(pair[0]), normalizeAction(pair[1])];
  });
  const replay: Replay = {
    version: REPLAY_VERSION,
    protocol: PROTOCOL_VERSION,
    seed: raw.seed,
    stage: raw.stage,
    p1: { botId: raw.p1.botId, character: raw.p1.character },
    p2: { botId: raw.p2.botId, character: raw.p2.character },
    inputs,
  };
  if (raw.result !== undefined) {
    const r = raw.result as Record<string, unknown>;
    if (typeof r !== "object" || r === null ||
        (r.winner !== null && r.winner !== "p1" && r.winner !== "p2") ||
        ![r.p1Wins, r.p2Wins, r.ticks].every((n) => typeof n === "number" && Number.isSafeInteger(n))) {
      throw new Error("invalid replay result");
    }
    replay.result = {
      winner: r.winner as Side | null,
      p1Wins: r.p1Wins as number,
      p2Wins: r.p2Wins as number,
      ticks: r.ticks as number,
    };
  }
  return replay;
}

export function winnerLabel(side: Side | null): string {
  if (side === "p1") return "P1";
  if (side === "p2") return "P2";
  return "None";
}
