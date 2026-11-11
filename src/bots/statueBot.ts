import { NEUTRAL_ACTION, type Action, type Observation } from "../engine/types.ts";
import type { Bot } from "./types.ts";

/** Stands still. Useful as a punching dummy in tests. */
export function createStatueBot(): Bot {
  return {
    id: "statue",
    name: "Statue",
    act(_obs: Observation): Action {
      return { ...NEUTRAL_ACTION };
    },
  };
}
