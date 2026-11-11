import { ATTACKS } from "../engine/attacks.ts";
import type { Action, AttackKind, Observation } from "../engine/types.ts";
import type { Bot } from "./types.ts";
import {
  HEAVY_REACH,
  LIGHT_REACH,
  SPECIAL_REACH,
  approach,
  attack,
  awayDir,
  block,
  canAffordSpecial,
  dist,
  isRecovering,
  isThreat,
  neutral,
  retreat,
  towardDir,
} from "./shared.ts";

function scoreAction(obs: Observation, action: Action): number {
  const me = obs.me;
  const opp = obs.opponent;
  const d = dist(obs);
  const threat = isThreat(obs);
  const recovering = isRecovering(obs);
  const lowHealth = me.health < opp.health;
  const timeLow = obs.timeLeftTicks < 900;

  let score = 0;

  if (action.block) {
    score += threat ? 100 : 25;
    if (me.blockstun > 0) score += 60;
    if (lowHealth) score += 10;
  }

  if (action.attack !== "none") {
    const kind: AttackKind = action.attack;
    if (kind === "special" && !canAffordSpecial(obs)) {
      score -= 200;
    } else {
      const reach =
        kind === "special"
          ? SPECIAL_REACH
          : kind === "heavy"
            ? HEAVY_REACH
            : LIGHT_REACH;
      const data = ATTACKS[kind];
      if (d <= reach) {
        score += 40 + data.damage / 3;
        if (recovering) score += 70;
        if (opp.state === "hitstun") score += 50;
        if (threat) score -= 90;
        if (opp.blocking) score -= 10;
      } else {
        score -= 150;
      }
    }
  }

  if (action.move === towardDir(obs)) {
    // Lumi tune: close to heavy reach so Ledger can actually land hits (was 90 : 65).
    const preferred = HEAVY_REACH;
    if (d > preferred) score += 45;
    else score -= 15;
  }

  if (action.move === awayDir(obs)) {
    const preferred = lowHealth ? 110 : 75;
    if (d < preferred) score += 40;
    else score -= 10;
    if (threat) score += 15;
  }

  if (
    action.move === "none" &&
    action.attack === "none" &&
    !action.block
  ) {
    score += 5;
  }

  if (timeLow && lowHealth && action.attack !== "none") score += 20;

  return score;
}

/**
 * Ledger — a simple utility brain.
 * Scores legal candidate actions on safety, damage, spacing, health, and time.
 */
export function createUtilityBot(): Bot {
  return {
    id: "utility",
    name: "Ledger",
    act(obs: Observation): Action {
      if (obs.phase !== "fight") return neutral();
      if (obs.me.state === "attack") return neutral();

      const candidates: Action[] = [
        block(),
        approach(obs),
        retreat(obs),
        attack("light"),
        attack("heavy"),
        attack("special"),
        neutral(),
      ];

      let best = candidates[0]!;
      let bestScore = scoreAction(obs, best);

      for (let i = 1; i < candidates.length; i++) {
        const candidate = candidates[i]!;
        const candidateScore = scoreAction(obs, candidate);
        if (candidateScore > bestScore) {
          best = candidate;
          bestScore = candidateScore;
        }
      }

      return best;
    },
  };
}
