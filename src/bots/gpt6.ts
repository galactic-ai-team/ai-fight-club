import type { Action, Observation } from "../engine/types.ts";
import type { Bot, BotStartContext } from "./types.ts";

export const id = "gpt6";
export const name = "Vanta Coil";
export const author = "GPT-6";
export const ready = true;

type Strike = "light" | "heavy" | "special";
type Direction = Action["move"];

const MOVES = {
  light: {
    startup: 4,
    active: 3,
    recovery: 8,
    range: 84,
  },
  heavy: {
    startup: 10,
    active: 4,
    recovery: 16,
    range: 98,
  },
  special: {
    startup: 12,
    active: 6,
    recovery: 20,
    range: 126,
  },
} as const;

function action(
  move: Direction = "none",
  attack: Action["attack"] = "none",
  block = false,
  vertical: Action["vertical"] = "none",
): Action {
  return { move, vertical, attack, block };
}

const GUARD = (): Action => action("none", "none", true);
const WAIT = (): Action => action();

function totalFrames(kind: Strike): number {
  const m = MOVES[kind];
  return m.startup + m.active + m.recovery;
}

function canReachAirborne(
  obs: Observation,
  kind: Strike,
): boolean {
  const target = obs.opponent;
  const me = obs.me;
  const frames = MOVES[kind].startup;

  // Predict target's feet at the first active frame.
  let y = target.y;
  let vy = target.vy;

  for (let i = 0; i < frames; i++) {
    vy = Math.min(18, vy + 1);
    y = Math.min(440, y + vy);
    if (y === 440) vy = 0;
  }

  // Grounded strikes occupy the lower body area.
  // Airborne strikes follow the attacker's feet.
  const attackTop = me.y - 96 +
    (kind === "light" ? 28 : kind === "heavy" ? 24 : 20);
  const attackBottom = attackTop +
    (kind === "light" ? 28 : kind === "heavy" ? 32 : 36);

  return y > attackTop && y - 96 < attackBottom;
}

export function createGpt6Bot(): Bot {
  let previousRound = 0;
  let lastTick = -1;
  let previousDistance = 480;
  let guardStreak = 0;
  let pressure = 0;

  return {
    id,
    name,

    start(_ctx: BotStartContext): void {
      previousRound = 0;
      lastTick = -1;
      previousDistance = 480;
      guardStreak = 0;
      pressure = 0;
    },

    act(obs: Observation): Action {
      if (obs.protocol !== "afc-obs-v0" ||
          obs.phase !== "fight") {
        return WAIT();
      }

      const me = obs.me;
      const foe = obs.opponent;

      const dx = foe.x - me.x;
      const distance = Math.abs(dx);

      const toward: Direction =
        dx > 0 ? "right" :
        dx < 0 ? "left" : "none";

      const away: Direction =
        dx > 0 ? "left" :
        dx < 0 ? "right" : "none";

      if (
        obs.round !== previousRound ||
        obs.tick <= lastTick
      ) {
        previousRound = obs.round;
        guardStreak = 0;
        pressure = 0;
        previousDistance = distance;
      }

      lastTick = obs.tick;

      if (foe.blocking && !foe.airborne) {
        guardStreak = Math.min(240, guardStreak + 1);
      } else {
        guardStreak = Math.max(0, guardStreak - 3);
      }

      const closing = distance < previousDistance;
      previousDistance = distance;

      const foeFacingMe =
        dx > 0 ? foe.facing === -1 :
        dx < 0 ? foe.facing === 1 : true;

      const foeAttack = foe.attack;
      const foeMove = foeAttack ? MOVES[foeAttack] : null;

      const remaining = foeAttack
        ? totalFrames(foeAttack) - foe.stateT
        : 0;

      const windup = foeMove
        ? Math.max(0, foeMove.startup - foe.stateT)
        : 0;

      const attackThreat =
        foeAttack !== null &&
        foe.attackPhase !== "recovery" &&
        (foe.attackPhase !== "active" ||
          foe.hitbox !== null) &&
        foeFacingMe;

      const threateningRange = foeMove
        ? foeMove.range + 4
        : 0;

      const canRetreat =
        away === "left"
          ? me.x > 70
          : away === "right"
            ? me.x < 890
            : false;

      const healthyLead =
        me.health > foe.health + 70;

      const urgent =
        obs.timeLeftTicks < 480 &&
        me.health < foe.health;

      // The engine may finish recovery at the start
      // of this tick. Buffer defense by default.
      if (me.state === "attack" && me.attack) {
        const almostFree =
          me.stateT >= totalFrames(me.attack) - 1;

        if (!almostFree) return GUARD();
      }

      if (me.state === "knockdown") {
        return GUARD();
      }

      // Buffer guard during stun. On the release
      // tick the action can become effective.
      if (me.hitstun > 1 || me.blockstun > 1) {
        return GUARD();
      }

      // Do not waste meter or recovery on an
      // opponent who cannot currently be hit.
      if (foe.state === "knockdown") {
        if (distance > 76) return action(toward);
        return GUARD();
      }

      if (foe.invuln > 12) {
        if (distance > 90) return action(toward);
        return GUARD();
      }

      // Air approach: retain horizontal jump momentum.
      // Attack late in descent, when the strike will
      // intersect a grounded opponent.
      if (me.airborne) {
        if (
          me.vy >= 5 &&
          me.y >= 350 &&
          distance < 82 &&
          foe.invuln <= 4 &&
          canReachAirborne(obs, "light") &&
          !foe.blocking
        ) {
          return action("none", "light");
        }
        return WAIT();
      }

      // Defensive spacing and counter-interruption.
      if (attackThreat && foeMove) {
        const danger =
          distance <= threateningRange &&
          (
            !foe.airborne ||
            foe.y >= 370
          );

        if (danger) {
          // A 4-frame jab interrupts a slower
          // committed heavy/special before activation.
          if (
            windup >= 5 &&
            distance < 81 &&
            foe.invuln <= 4 &&
            canReachAirborne(obs, "light")
          ) {
            pressure++;
            return action("none", "light");
          }

          // Make committed strikes whiff if there
          // is sufficient runway before activation.
          const escapeTicks = Math.max(
            0,
            Math.floor(
              (threateningRange + 2 - distance) / 4,
            ) + 1,
          );

          if (
            windup >= escapeTicks + 1 &&
            escapeTicks <= 7 &&
            canRetreat &&
            (
              away === "left"
                ? me.x - 4 * escapeTicks >= 64
                : me.x + 4 * escapeTicks <= 896
            )
          ) {
            return action(away);
          }

          return GUARD();
        }

        // Don't walk into an already active hitbox.
        if (
          foe.attackPhase === "active" &&
          distance <= threateningRange + 8
        ) {
          return GUARD();
        }

        // Enemy cannot turn while committed.
        // Approach from outside its effective reach.
        if (distance > threateningRange + 8) {
          return action(toward);
        }

        // Safe punish outside the enemy's range.
        if (
          distance < 96 &&
          distance > threateningRange &&
          windup >= 11 &&
          foe.invuln <= 10 &&
          canReachAirborne(obs, "heavy")
        ) {
          return action("none", "heavy");
        }

        return GUARD();
      }

      // Punish recovery frames. Choose the strongest
      // move guaranteed to activate before recovery
      // ends, rather than using specials blindly.
      if (
        foeAttack !== null &&
        foe.attackPhase === "recovery"
      ) {
        if (
          me.meter >= 50 &&
          distance < 123 &&
          remaining >= 14 &&
          foe.invuln <= 12 &&
          canReachAirborne(obs, "special")
        ) {
          pressure++;
          return action("none", "special");
        }

        if (
          distance < 96 &&
          remaining >= 12 &&
          foe.invuln <= 10 &&
          canReachAirborne(obs, "heavy")
        ) {
          pressure++;
          return action("none", "heavy");
        }

        if (
          distance < 82 &&
          remaining >= 5 &&
          foe.invuln <= 4 &&
          canReachAirborne(obs, "light")
        ) {
          pressure++;
          return action("none", "light");
        }

        if (distance > 76) return action(toward);
        return GUARD();
      }

      // Protect a meaningful life lead near timeout.
      // Continue defending rather than surrendering
      // space without an exit.
      if (
        healthyLead &&
        obs.timeLeftTicks < 360 &&
        !urgent
      ) {
        if (distance < 140 && canRetreat) {
          return action(away);
        }
        if (distance >= 140) return GUARD();
      }

      // Opponent holding guard: pressure the outer
      // edge of heavy range instead of charging into
      // point-blank counterattacks.
      if (
        guardStreak >= 2 &&
        foe.blocking &&
        foeAttack === null
      ) {
        if (
          distance < 89 &&
          canRetreat &&
          me.x > 70 &&
          me.x < 890
        ) {
          return action(away);
        }

        if (
          distance >= 89 &&
          distance < 96 &&
          foe.invuln <= 10
        ) {
          pressure++;
          return action("none", "heavy");
        }

        if (
          distance >= 99 &&
          distance < 123 &&
          me.meter >= 50 &&
          guardStreak >= 30 &&
          foe.invuln <= 12
        ) {
          pressure++;
          return action("none", "special");
        }

        return action(toward);
      }

      // Active jumping targets are difficult to hit
      // with grounded attacks. Track their descent.
      if (
        foe.airborne &&
        foe.y < 365 &&
        foe.vy <= 1
      ) {
        if (distance > 65) return action(toward);
        return GUARD();
      }

      // Neutral: fast, low-commitment pressure wins
      // initiative against slower startup moves.
      if (
        distance <= 80 &&
        foe.invuln <= 4 &&
        canReachAirborne(obs, "light")
      ) {
        pressure++;
        return action("none", "light");
      }

      // Landing trap: attack at the edge of reach
      // if the foe is descending into the strike.
      if (
        foe.airborne &&
        foe.vy > 4 &&
        distance < 96 &&
        foe.invuln <= 10 &&
        canReachAirborne(obs, "heavy")
      ) {
        return action("none", "heavy");
      }

      // Meter is saved for true recovery punishes
      // unless we're behind and need immediate damage.
      if (
        urgent &&
        me.meter >= 50 &&
        distance < 122 &&
        foe.invuln <= 12 &&
        !foe.airborne
      ) {
        return action("none", "special");
      }

      // Approach without jumping into unknown attacks.
      if (distance > 80) {
        return action(toward);
      }

      // At equal spacing, holding defense can force
      // an aggressive opponent to commit first.
      if (
        closing &&
        foe.meter >= 50 &&
        distance > 80 &&
        distance < 128
      ) {
        return GUARD();
      }

      return action("none", "light");
    },
  };
}

export default createGpt6Bot;
