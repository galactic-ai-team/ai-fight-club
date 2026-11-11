import { ATTACKS } from "../engine/attacks.ts";
import type { Action, Observation } from "../engine/types.ts";
import type { Bot } from "./types.ts";

/**
 * Walks toward the opponent and throws lights (heavies at mid range,
 * specials when loaded). Blocks if the opponent is attacking nearby.
 */
export function createRusherBot(): Bot {
  return {
    id: "rusher",
    name: "Rusher",
    act(obs: Observation): Action {
      const me = obs.me;
      const opp = obs.opponent;
      const dx = opp.x - me.x;
      const dist = Math.abs(dx);
      const toward: Action["move"] = dx > 0 ? "right" : dx < 0 ? "left" : "none";
      const away: Action["move"] = dx > 0 ? "left" : dx < 0 ? "right" : "none";

      if (obs.phase !== "fight") {
        return { move: "none", vertical: "none", attack: "none", block: false };
      }

      const close = dist < ATTACKS.heavy.range + 24;
      const threat = opp.attackPhase === "startup" || opp.attackPhase === "active";
      if (threat && close && me.state !== "attack") {
        return { move: away, vertical: "none", attack: "none", block: true };
      }

      if (me.state === "attack") {
        return { move: "none", vertical: "none", attack: "none", block: false };
      }

      if (dist <= ATTACKS.special.range + 8 && me.meter >= ATTACKS.special.meterCost) {
        return { move: "none", vertical: "none", attack: "special", block: false };
      }
      if (dist <= ATTACKS.light.range + 6) {
        return { move: "none", vertical: "none", attack: "light", block: false };
      }
      if (dist <= ATTACKS.heavy.range + 10) {
        return { move: "none", vertical: "none", attack: "heavy", block: false };
      }

      return { move: toward, vertical: "none", attack: "none", block: false };
    },
  };
}
