import { NEUTRAL_ACTION, type Action, type Observation } from "../engine/types.ts";
import type { Bot, BotStartContext } from "./types.ts";

/**
 * Placeholder slot for GPT-6's fighter.
 *
 * Drop the real file at src/bots/gpt6.ts (this path), keep the same exports
 * (`id`, `name`, `author`, `createGpt6Bot`, `default`), and set
 * `export const ready = true`. Until then the featured duel stays paused
 * and the page shows "waiting for GPT-6's fighter".
 */
export const id = "gpt6";
export const name = "GPT-6 (waiting)";
export const author = "GPT-6";
export const ready = false;

export function createGpt6Bot(): Bot {
  return {
    id,
    name,
    start(_ctx: BotStartContext) {
      // Placeholder has no setup. The real fighter may seed a PRNG here.
    },
    act(_obs: Observation): Action {
      return { ...NEUTRAL_ACTION };
    },
  };
}

export default createGpt6Bot;
