import type { Action, Observation } from "../engine/types.ts";
import type { Bot } from "./types.ts";
import {
  SPECIAL_REACH,
  HEAVY_REACH,
  LIGHT_REACH,
  approach,
  attack,
  block,
  canAffordSpecial,
  dist,
  isRecovering,
  isThreat,
  neutral,
} from "./shared.ts";

/**
 * Bulwark — a close-range turtler.
 * Blocks first, then punishes blocked attacks and recovery.
 */
export function createTurtlerBot(): Bot {
  return {
    id: "turtler",
    name: "Bulwark",
    act(obs: Observation): Action {
      if (obs.phase !== "fight") return neutral();
      if (obs.me.state === "attack") return neutral();

      const d = dist(obs);

      // Core turtle behaviour: block incoming attacks.
      if (isThreat(obs) && !obs.me.airborne) return block();
      if (obs.me.blockstun > 0) return block();

      // Punish recovery.
      if (isRecovering(obs)) {
        if (canAffordSpecial(obs) && d <= SPECIAL_REACH) return attack("special");
        if (d <= HEAVY_REACH) return attack("heavy");
        if (d <= LIGHT_REACH) return attack("light");
      }

      // Punish hitstun if already close.
      if (obs.opponent.state === "hitstun" && d <= HEAVY_REACH) {
        return attack("heavy");
      }

      // Cautious poke against a passive opponent.
      if (
        obs.opponent.state === "idle" &&
        obs.opponent.attack === null &&
        obs.opponent.attackPhase === null &&
        d <= LIGHT_REACH
      ) {
        return attack("light");
      }

      // Stay close enough to punish, but not full-screen away.
      if (d > 42) return approach(obs);

      return block();
    },
  };
}
