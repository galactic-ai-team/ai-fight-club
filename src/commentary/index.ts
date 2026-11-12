import type { MatchEvent, Side } from "../engine/types.ts";

/**
 * Commentary for the spectator log + overlay hooks.
 *
 * Original lines only — no Capcom announcer lines, no trademark
 * catchphrases, no copied move names. The M0 special is a melee "burst"
 * (see src/engine/attacks.ts), so specials are called bursts here, never
 * given a move name.
 *
 * Rules of this module:
 * - Pure functions of the event (+ fighter names + optional public
 *   match context). Same event in, same line out — live or replay.
 * - No Math.random, no Date.now, no hidden state. Variety comes from a
 *   deterministic hash of the event's own fields, so a replay of the
 *   same match prints the same log.
 * - "Almost" / comeback color only comes from the public context
 *   (health fractions, wins, round) the caller passes in. Without
 *   context the lines still work — they just stay plain.
 */

export interface CommentaryContext {
  /** Health as 0..1 fractions, per side. */
  p1HealthFrac?: number;
  p2HealthFrac?: number;
  p1Wins?: number;
  p2Wins?: number;
  round?: number;
  timeLeftSeconds?: number;
}

export type FighterNames = { p1: string; p2: string };

const LOW_HEALTH = 0.25;
const ALMOST_OUT = 0.15;
const CLOSE_ON_CARDS = 0.1;

/** FNV-1a over a short string. Deterministic variant picking, nothing more. */
function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function pick(lines: readonly string[], key: string): string {
  if (lines.length === 0) return "";
  const line = lines[hashKey(key) % lines.length];
  return line ?? lines[0] ?? "";
}

function healthFrac(ctx: CommentaryContext | undefined, side: Side): number | undefined {
  if (!ctx) return undefined;
  return side === "p1" ? ctx.p1HealthFrac : ctx.p2HealthFrac;
}

function eventKey(event: MatchEvent): string {
  switch (event.type) {
    case "hit":
      return `hit|${event.tick}|${event.attacker}|${event.defender}|${event.kind}|${event.damage}|${event.blocked}`;
    case "ko":
      return `ko|${event.tick}|${event.winner}|${event.loser}`;
    case "timeout":
      return `timeout|${event.tick}|${event.winner}`;
    case "round_end":
      return `round_end|${event.tick}|${event.winner}|${event.round}`;
    case "match_end":
      return `match_end|${event.tick}|${event.winner}`;
  }
}

const HIT_LINES: Record<string, readonly string[]> = {
  light: [
    "{A} flicks a light out and catches {D} for {dmg}.",
    "{A} taps {D} with a quick light — {dmg}.",
    "{A} sneaks a light through on {D} for {dmg}.",
    "{A} pokes {D} with a light. {dmg}, and {D} felt that one.",
  ],
  heavy: [
    "{A} thuds a heavy into {D} for {dmg}.",
    "{A} swings big and {D} wears the heavy — {dmg}.",
    "{A} plants a heavy on {D}. That's {dmg}.",
    "{A} puts their shoulder into a heavy. {D} takes {dmg}.",
  ],
  special: [
    "{A} lets the burst rip — {D} eats {dmg}.",
    "{A} unloads the burst point-blank. {dmg} on {D}.",
    "{A} cashes in meter for a burst and {D} pays {dmg}.",
    "{A} fires the burst off and {D} is sent reeling for {dmg}.",
  ],
};

const BLOCKED_LINES: readonly string[] = [
  "{D} holds the guard — only {dmg} chip gets through.",
  "{D} blocks the {kind}, but the chip still stings for {dmg}.",
  "{A}'s {kind} clangs off {D}'s guard. {dmg} chip.",
  "{D} stands behind the guard and gives up just {dmg} chip.",
];

const ALMOST_LINES: readonly string[] = [
  "{D} is hanging by a thread after that {kind}.",
  "One more clean hit and {D} is done — they're on fumes.",
  "{D} barely stays up. That {kind} nearly ended it.",
];

/**
 * The hit that actually ends the round. Damage-free on purpose: the event
 * reports the attack's damage, not the health the defender had left.
 */
const FINISHER_LINES: readonly string[] = [
  "{A}'s {kind} ends it for {D}.",
  "That {kind} is the last one {D} takes.",
  "{D} has nothing left after that {kind} from {A}.",
];

const COMEBACK_LINES: readonly string[] = [
  "{A} is running on fumes and still swinging — {D} eats {dmg}.",
  "Backed into a corner, {A} answers with a {kind} for {dmg}.",
  "{A} refuses to fold. The {kind} lands for {dmg}.",
];

const KO_LINES: readonly string[] = [
  "{W} puts {L} down — that's the round.",
  "{L} goes down and stays down. {W} takes it.",
  "Lights out for {L}. {W} walks it off.",
  "{W} closes the round in style — {L} is down.",
];

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

export function commentOn(
  event: MatchEvent,
  names: FighterNames,
  ctx?: CommentaryContext,
): string {
  const name = (side: Side) => (side === "p1" ? names.p1 : names.p2);
  const key = eventKey(event);

  switch (event.type) {
    case "hit": {
      const attacker = name(event.attacker);
      const defender = name(event.defender);
      const vars = {
        A: attacker,
        D: defender,
        kind: event.kind,
        dmg: String(event.damage),
      };
      if (event.blocked) {
        return fill(pick(BLOCKED_LINES, key), vars);
      }
      // A hit that leaves the defender at 0 is the finisher, not an "almost".
      const defenderHealth = healthFrac(ctx, event.defender);
      if (defenderHealth !== undefined && defenderHealth <= 0) {
        return fill(pick(FINISHER_LINES, key), vars);
      }
      // "Almost" beats "comeback": the round is about to end, say so.
      if (defenderHealth !== undefined && defenderHealth <= ALMOST_OUT) {
        return fill(pick(ALMOST_LINES, key), vars);
      }
      const attackerHealth = healthFrac(ctx, event.attacker);
      if (
        attackerHealth !== undefined &&
        attackerHealth <= LOW_HEALTH &&
        (event.kind === "heavy" || event.kind === "special")
      ) {
        return fill(pick(COMEBACK_LINES, key), vars);
      }
      return fill(pick(HIT_LINES[event.kind] ?? HIT_LINES.light ?? [], key), vars);
    }
    case "ko": {
      return fill(pick(KO_LINES, key), {
        W: name(event.winner),
        L: name(event.loser),
      });
    }
    case "timeout": {
      if (event.winner === "draw") return "Time! Nobody ahead — the round is a draw.";
      const winner = name(event.winner);
      const p1 = ctx?.p1HealthFrac;
      const p2 = ctx?.p2HealthFrac;
      if (p1 !== undefined && p2 !== undefined && Math.abs(p1 - p2) <= CLOSE_ON_CARDS) {
        return `Time! ${winner} takes it on the cards — a photo finish.`;
      }
      return `Time! ${winner} takes the round on health.`;
    }
    case "round_end": {
      if (event.winner === "draw") {
        return `Round ${event.round} ends even — nobody scores.`;
      }
      const winner = name(event.winner);
      const wWins = event.winner === "p1" ? ctx?.p1Wins : ctx?.p2Wins;
      const lWins = event.winner === "p1" ? ctx?.p2Wins : ctx?.p1Wins;
      if (wWins !== undefined && lWins !== undefined) {
        return `${winner} takes round ${event.round} — that's ${wWins}-${lWins}.`;
      }
      return `${winner} wins round ${event.round}.`;
    }
    case "match_end": {
      const winner = name(event.winner);
      const wWins = event.winner === "p1" ? ctx?.p1Wins : ctx?.p2Wins;
      const lWins = event.winner === "p1" ? ctx?.p2Wins : ctx?.p1Wins;
      if (wWins !== undefined && lWins !== undefined) {
        if (wWins === 2 && lWins === 0) {
          return `${winner} takes the match 2-0 — a clean sweep.`;
        }
        if (wWins === 2 && lWins === 1) {
          return `${winner} takes the match 2-1. Went the distance.`;
        }
        return `${winner} wins the match ${wWins}-${lWins}.`;
      }
      return `${winner} wins the match!`;
    }
  }
}

export interface CommentedEvent {
  text: string;
  /** Log-line class. Double KO reuses "ko" so existing log styling applies. */
  kind: MatchEvent["type"];
}

/**
 * Comment on a tick's events in order. Collapses the engine's double-KO
 * case (two "ko" events on the same tick, one per side — see
 * src/engine/sim.ts maybeEndRound) into a single line, instead of printing
 * two contradictory "X takes the KO" lines.
 */
export function commentOnEvents(
  events: readonly MatchEvent[],
  names: FighterNames,
  ctx?: CommentaryContext,
): CommentedEvent[] {
  const koWinnersByTick = new Map<number, Set<Side>>();
  for (const ev of events) {
    if (ev.type !== "ko") continue;
    const winners = koWinnersByTick.get(ev.tick) ?? new Set<Side>();
    winners.add(ev.winner);
    koWinnersByTick.set(ev.tick, winners);
  }
  const doubleKoTicks = new Set<number>();
  for (const [tick, winners] of koWinnersByTick) {
    if (winners.size > 1) doubleKoTicks.add(tick);
  }

  const out: CommentedEvent[] = [];
  const seenDoubleKo = new Set<number>();
  for (const ev of events) {
    if (ev.type === "ko" && doubleKoTicks.has(ev.tick)) {
      if (!seenDoubleKo.has(ev.tick)) {
        seenDoubleKo.add(ev.tick);
        out.push({
          text: "Double KO — both fighters go down at once. Nobody scores the round.",
          kind: "ko",
        });
      }
      continue;
    }
    out.push({ text: commentOn(ev, names, ctx), kind: ev.type });
  }
  return out;
}

export function matchStartLine(
  names: FighterNames,
  opts?: { seed?: number; p1Bot?: string; p2Bot?: string },
): string {
  const p1 = opts?.p1Bot ? `${names.p1} (${opts.p1Bot})` : names.p1;
  const p2 = opts?.p2Bot ? `${names.p2} (${opts.p2Bot})` : names.p2;
  const seed = opts?.seed !== undefined ? ` Seed ${opts.seed}.` : "";
  return `Match start. ${p1} vs ${p2}.${seed}`;
}
