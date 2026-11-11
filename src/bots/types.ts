import type { Action, Observation, Side } from "../engine/types.ts";

export interface BotStartContext {
  side: Side;
  seed: number;
  opponentId: string;
}

export interface Bot {
  id: string;
  name: string;
  start?(ctx: BotStartContext): void;
  /** Synchronous. Must return quickly. Invalid actions become neutral. */
  act(obs: Observation): Action;
}

export type BotFactory = (seed: number) => Bot;
