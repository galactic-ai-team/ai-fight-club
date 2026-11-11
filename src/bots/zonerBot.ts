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
  retreat,
} from "./shared.ts";

/**
 * Vector — a zoner.
 * Keeps around heavy/special range, blocks when threatened,
 * and punishes the opponent's recovery frames.
 */
export function createZonerBot(): Bot {
  return {
    id: "zoner",
    name: "Vector",
    act(obs: Observation): Action {
      if (obs.phase !== "fight") return neutral();
      if (obs.me.state === "attack") return neutral();

      const d = dist(obs);

      if (isThreat(obs) && d < 100 && !obs.me.airborne) {
        return block();
      }

      if (obs.me.blockstun > 0) return block();

      if (isRecovering(obs)) {
        if (canAffordSpecial(obs) && d <= SPECIAL_REACH) return attack("special");
        if (d <= HEAVY_REACH) return attack("heavy");
        if (d <= LIGHT_REACH) return attack("light");
      }

      // Too close: retreat unless cornered.
      if (d < 56) {
        if (obs.me.x <= 70 || obs.me.x >= 890) return block();
        return retreat(obs);
      }

      // Too far: close to mid-range.
      if (d > 92) return approach(obs);

      // Mid-range offense.
      if (canAffordSpecial(obs) && d <= SPECIAL_REACH) return attack("special");
      if (d <= HEAVY_REACH) return attack("heavy");
      if (d <= LIGHT_REACH) return attack("light");

      return approach(obs);
    },
  };
}
