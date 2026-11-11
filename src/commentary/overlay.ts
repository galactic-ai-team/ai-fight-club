import type { MatchPhase } from "../engine/types.ts";

/**
 * Overlay copy for the spectator page — text only.
 *
 * Ownership split with Gemini's lane (src/render/canvas.ts, which owns the
 * canvas banner for round/match results): this module only supplies the
 * live-fight callout that sits over the stage as a DOM pill
 * (`#moment` in index.html). It deliberately returns nothing during
 * `round_end` / `match_end`, because the canvas banner already covers
 * those moments — no double banner.
 *
 * Pure functions of public match state. Same state in, same line out.
 */

export interface OverlayInput {
  phase: MatchPhase;
  round: number;
  p1Name: string;
  p2Name: string;
  /** Health as 0..1 fractions. */
  p1HealthFrac: number;
  p2HealthFrac: number;
  p1Wins: number;
  p2Wins: number;
}

export interface MomentLine {
  text: string;
  tone: "info" | "danger";
}

const LOW_HEALTH = 0.25;

export function roundIntroLine(input: OverlayInput): string {
  const base = `ROUND ${input.round} — ${input.p1Name} vs ${input.p2Name}`;
  if (input.round <= 1 || input.p1Wins === input.p2Wins) return base;
  const leader = input.p1Wins > input.p2Wins ? input.p1Name : input.p2Name;
  const score = `${Math.max(input.p1Wins, input.p2Wins)}-${Math.min(input.p1Wins, input.p2Wins)}`;
  return `${base} · ${leader} leads ${score}`;
}

/**
 * The one line the overlay shows mid-fight, or null to hide it.
 * Only fires on low health — routine play leaves the stage clean.
 */
export function momentLine(input: OverlayInput): MomentLine | null {
  if (input.phase !== "fight") return null;
  const p1Low = input.p1HealthFrac <= LOW_HEALTH;
  const p2Low = input.p2HealthFrac <= LOW_HEALTH;
  if (p1Low && p2Low) {
    return { text: "Both fighters are one clean hit from done.", tone: "danger" };
  }
  if (p1Low) {
    return { text: `${input.p1Name} is running on fumes.`, tone: "danger" };
  }
  if (p2Low) {
    return { text: `${input.p2Name} is running on fumes.`, tone: "danger" };
  }
  return null;
}
