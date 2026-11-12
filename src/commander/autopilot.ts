import { ATTACKS } from "../engine/attacks.ts";
import { EDGE_PAD, STAGE_WIDTH } from "../engine/constants.ts";
import type { Action, Observation } from "../engine/types.ts";
import type { Bot, BotStartContext } from "../bots/types.ts";
import {
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
} from "../bots/shared.ts";
import { mergeDirective } from "./parse.ts";
import {
  DEFAULT_DIRECTIVE,
  STANCE_DEFAULTS,
  type CommanderDirective,
  type GoFor,
  type PartialDirective,
  type Stance,
} from "./types.ts";

export interface Autopilot extends Bot {
  setCommand(partial: PartialDirective, tick: number): CommanderDirective;
  getDirective(): CommanderDirective;
  getTaunt(): string;
  getLastAppliedTick(): number;
  /** One-shot goFor is consumed after the attack actually starts. */
  peekGoFor(): GoFor;
}

export interface AutopilotOpts {
  id?: string;
  name?: string;
  initial?: PartialDirective;
}

function inRange(obs: Observation, kind: "light" | "heavy" | "special"): boolean {
  const reach =
    kind === "light" ? ATTACKS.light.range + 6
    : kind === "heavy" ? ATTACKS.heavy.range + 10
    : ATTACKS.special.range + 8;
  return dist(obs) <= reach;
}

function nearEdge(obs: Observation): boolean {
  return obs.me.x <= EDGE_PAD + 24 || obs.me.x >= STAGE_WIDTH - EDGE_PAD - 24;
}

function holdOrBlock(obs: Observation, directive: CommanderDirective): Action {
  if (isThreat(obs) && !obs.me.airborne) return block();
  if (obs.me.blockstun > 0) return block();
  // Gentle positioning toward target spacing when idle.
  const d = dist(obs);
  const target = directive.spacing;
  if (d > target + 14) return approach(obs);
  if (d < target - 14 && !nearEdge(obs)) return retreat(obs);
  return neutral();
}

function tryGoFor(obs: Observation, kind: GoFor): Action | null {
  if (kind === "none") return null;
  if (obs.me.state === "attack") return null;
  if (kind === "special") {
    if (canAffordSpecial(obs) && inRange(obs, "special")) return attack("special");
    return null;
  }
  if (kind === "light" && inRange(obs, "light")) return attack("light");
  if (kind === "heavy" && inRange(obs, "heavy")) return attack("heavy");
  if (kind === "combo") {
    if (obs.opponent.state === "hitstun" || isRecovering(obs)) {
      if (inRange(obs, "special") && canAffordSpecial(obs)) return attack("special");
      if (inRange(obs, "heavy")) return attack("heavy");
      if (inRange(obs, "light")) return attack("light");
    }
    if (inRange(obs, "light")) return attack("light");
    return null;
  }
  return null;
}

function offense(obs: Observation, agr: number): Action | null {
  // Deterministic "should I swing?" — no Math.random. Use tick and aggression.
  // At agr=0 never poke; at agr=1 always poke when in range.
  const d = dist(obs);
  const cycle = obs.tick % 60;
  const threshold = Math.round((1 - agr) * 60);
  const swing = agr >= 0.999 || (agr > 0 && cycle >= threshold);

  if (isRecovering(obs) || obs.opponent.state === "hitstun") {
    if (canAffordSpecial(obs) && inRange(obs, "special")) return attack("special");
    if (inRange(obs, "heavy")) return attack("heavy");
    if (inRange(obs, "light")) return attack("light");
  }

  if (!swing) return null;

  if (agr >= 0.7 && canAffordSpecial(obs) && inRange(obs, "special")) return attack("special");
  if (d <= ATTACKS.light.range + 6) return attack("light");
  if (d <= ATTACKS.heavy.range + 10 && agr >= 0.4) return attack("heavy");
  if (canAffordSpecial(obs) && inRange(obs, "special") && agr >= 0.55) return attack("special");
  return null;
}

function defend(obs: Observation, agr: number): Action | null {
  if (obs.me.blockstun > 0) return block();
  if (!isThreat(obs) || obs.me.airborne) return null;
  const d = dist(obs);
  // High aggression: only block close heavy/special startups. Low: always block threats.
  if (agr >= 0.9) {
    if (d < 64 && (obs.opponent.attack === "heavy" || obs.opponent.attack === "special")) {
      return block();
    }
    return null;
  }
  if (agr >= 0.65) {
    if (d < 90) return block();
    return null;
  }
  return block();
}

function maintainSpacing(obs: Observation, target: number): Action {
  const d = dist(obs);
  if (d > target + 12) return approach(obs);
  if (d < target - 12) {
    if (nearEdge(obs)) return block();
    return retreat(obs);
  }
  return neutral();
}

function actRush(obs: Observation, d: CommanderDirective): Action {
  const guarded = defend(obs, d.aggression);
  if (guarded) return guarded;
  const hit = offense(obs, d.aggression);
  if (hit) return hit;
  return maintainSpacing(obs, d.spacing);
}

function actZone(obs: Observation, d: CommanderDirective): Action {
  const guarded = defend(obs, Math.min(d.aggression + 0.15, 1));
  if (guarded) return guarded;
  const distNow = dist(obs);
  // Keep the pocket: poke at mid/long, back off if crowded.
  if (distNow < d.spacing - 16) {
    if (isRecovering(obs) && d.aggression > 0.45) {
      const hit = offense(obs, d.aggression);
      if (hit) return hit;
    }
    return nearEdge(obs) ? block() : retreat(obs);
  }
  const hit = offense(obs, d.aggression);
  if (hit) return hit;
  return maintainSpacing(obs, d.spacing);
}

function actTurtle(obs: Observation, d: CommanderDirective): Action {
  // Block first. Punish recovery and hitstun. Cautious pokes only at higher agr.
  if (isThreat(obs) && !obs.me.airborne) return block();
  if (obs.me.blockstun > 0) return block();
  if (isRecovering(obs) || obs.opponent.state === "hitstun") {
    if (canAffordSpecial(obs) && inRange(obs, "special")) return attack("special");
    if (inRange(obs, "heavy")) return attack("heavy");
    if (inRange(obs, "light")) return attack("light");
  }
  if (d.aggression >= 0.5) {
    const hit = offense(obs, d.aggression * 0.6);
    if (hit) return hit;
  }
  const distNow = dist(obs);
  if (distNow > d.spacing + 20) return approach(obs);
  return block();
}

function actBait(obs: Observation, d: CommanderDirective): Action {
  const guarded = defend(obs, 0.4);
  // If they're swinging at mid range, fade back and punish the recovery.
  if (isThreat(obs) && dist(obs) < ATTACKS.heavy.range + 28 && !nearEdge(obs)) {
    return { move: awayDir(obs), vertical: "none", attack: "none", block: true };
  }
  if (isRecovering(obs) || obs.opponent.state === "hitstun") {
    if (canAffordSpecial(obs) && inRange(obs, "special")) return attack("special");
    if (inRange(obs, "heavy")) return attack("heavy");
    if (inRange(obs, "light")) return attack("light");
    return approach(obs);
  }
  if (guarded) return guarded;
  // Deterministic approach-retreat rhythm (90-tick cycle).
  const phase = obs.tick % 90;
  const distNow = dist(obs);
  if (phase < 40) {
    if (distNow > ATTACKS.heavy.range + 4) return approach(obs);
    return neutral();
  }
  if (phase < 70) {
    // Sit just outside their heavy and invite a swing.
    return maintainSpacing(obs, Math.max(d.spacing, ATTACKS.heavy.range + 16));
  }
  if (!nearEdge(obs) && distNow < d.spacing + 10) return retreat(obs);
  const hit = offense(obs, d.aggression * 0.7);
  if (hit) return hit;
  return maintainSpacing(obs, d.spacing);
}

function actAntiAir(obs: Observation, d: CommanderDirective): Action {
  if (obs.opponent.airborne) {
    if (inRange(obs, "special") && canAffordSpecial(obs)) return attack("special");
    if (inRange(obs, "heavy")) return attack("heavy");
    if (inRange(obs, "light")) return attack("light");
    return approach(obs);
  }
  const guarded = defend(obs, d.aggression);
  if (guarded) return guarded;
  // Stay close-mid, grounded, ready. Don't jump — that would waste the anti-air.
  const hit = offense(obs, d.aggression * 0.7);
  if (hit) return hit;
  return maintainSpacing(obs, d.spacing);
}

function actStance(obs: Observation, d: CommanderDirective): Action {
  switch (d.stance) {
    case "rush":
      return actRush(obs, d);
    case "zone":
      return actZone(obs, d);
    case "turtle":
      return actTurtle(obs, d);
    case "bait":
      return actBait(obs, d);
    case "anti-air":
      return actAntiAir(obs, d);
    default:
      return holdOrBlock(obs, d);
  }
}

export function stanceFromBotId(botId: string): Stance {
  switch (botId) {
    case "rusher":
      return "rush";
    case "zoner":
      return "zone";
    case "turtler":
      return "turtle";
    case "utility":
      return "bait";
    case "statue":
      return "turtle";
    default:
      return "zone";
  }
}

export function initialFromBotId(botId: string): CommanderDirective {
  const stance = stanceFromBotId(botId);
  const defaults = STANCE_DEFAULTS[stance];
  return {
    stance,
    spacing: defaults.spacing,
    aggression: botId === "statue" ? 0 : defaults.aggression,
    goFor: "none",
    taunt: "",
  };
}

export function createCommanderAutopilot(opts: AutopilotOpts = {}): Autopilot {
  let directive: CommanderDirective = mergeDirective(DEFAULT_DIRECTIVE, opts.initial ?? {});
  let lastAppliedTick = -1;
  let pendingGoFor: GoFor = directive.goFor;
  const id = opts.id ?? "commander";
  const name = opts.name ?? "Commander";

  const bot: Autopilot = {
    id,
    name,
    start(_ctx: BotStartContext) {
      pendingGoFor = directive.goFor;
    },
    setCommand(partial: PartialDirective, tick: number): CommanderDirective {
      directive = mergeDirective(directive, partial);
      lastAppliedTick = tick;
      pendingGoFor = directive.goFor;
      return directive;
    },
    getDirective() {
      return { ...directive };
    },
    getTaunt() {
      return directive.taunt;
    },
    getLastAppliedTick() {
      return lastAppliedTick;
    },
    peekGoFor() {
      return pendingGoFor;
    },
    act(obs: Observation): Action {
      if (obs.phase !== "fight") return neutral();
      if (obs.me.state === "attack") return neutral();
      if (obs.me.hitstun > 0) return neutral();

      if (pendingGoFor !== "none") {
        const go = tryGoFor(obs, pendingGoFor);
        if (go && go.attack !== "none") {
          // Consume the one-shot (combo stays until it lands a non-starter or we leave range long enough).
          if (pendingGoFor !== "combo") {
            pendingGoFor = "none";
            directive = { ...directive, goFor: "none" };
          }
          return go;
        }
        // Walk into range if the order is a specific move we're not close enough for.
        if (pendingGoFor === "special" || pendingGoFor === "heavy" || pendingGoFor === "light") {
          return approach(obs);
        }
      }

      const action = actStance(obs, directive);
      // Face-preserving helpers already pick toward/away. Jump is reserved for
      // explicit future commands; autopilot stays grounded so anti-air works.
      if (action.vertical === "jump") {
        return { ...action, vertical: "none" };
      }
      return action;
    },
  };
  return bot;
}

/** Exported for tests: one tick of a given directive, no state. */
export function actWithDirective(obs: Observation, directive: CommanderDirective): Action {
  const bot = createCommanderAutopilot({ initial: directive });
  return bot.act(obs);
}

export { towardDir, awayDir };
