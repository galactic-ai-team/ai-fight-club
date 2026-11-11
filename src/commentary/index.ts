import type { MatchEvent } from "../engine/types.ts";

/** Short arcade-style lines for the spectator log. Nova will expand this. */
export function commentOn(event: MatchEvent, names: { p1: string; p2: string }): string {
  const name = (side: "p1" | "p2") => (side === "p1" ? names.p1 : names.p2);
  switch (event.type) {
    case "hit":
      if (event.blocked) {
        return `${name(event.defender)} blocks the ${event.kind} (${event.damage} chip).`;
      }
      return `${name(event.attacker)} lands a ${event.kind} for ${event.damage}!`;
    case "ko":
      return `${name(event.winner)} takes the KO!`;
    case "timeout":
      if (event.winner === "draw") return "Time! It's a draw.";
      return `Time! ${name(event.winner)} wins the round on health.`;
    case "round_end":
      if (event.winner === "draw") return `Round ${event.round} is a draw.`;
      return `${name(event.winner)} wins round ${event.round}.`;
    case "match_end":
      return `${name(event.winner)} wins the match!`;
  }
}
