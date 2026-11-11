import { NEUTRAL_ACTION, type Action, type AttackInput, type MoveDir, type Vertical } from "./types.ts";

const MOVES = new Set<MoveDir>(["none", "left", "right"]);
const VERTICALS = new Set<Vertical>(["none", "crouch", "jump"]);
const ATTACKS = new Set<AttackInput>(["none", "light", "heavy", "special"]);

/**
 * Coerce any unknown payload into a legal Action.
 * Invalid or missing fields become neutral. Never throws.
 */
export function normalizeAction(raw: unknown): Action {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return { ...NEUTRAL_ACTION };
  }
  const o = raw as Record<string, unknown>;
  const move = MOVES.has(o.move as MoveDir) ? (o.move as MoveDir) : "none";
  const vertical = VERTICALS.has(o.vertical as Vertical)
    ? (o.vertical as Vertical)
    : "none";
  const attack = ATTACKS.has(o.attack as AttackInput) ? (o.attack as AttackInput) : "none";
  const block = o.block === true;
  return { move, vertical, attack, block };
}

export function actionEqual(a: Action, b: Action): boolean {
  return a.move === b.move && a.vertical === b.vertical && a.attack === b.attack && a.block === b.block;
}
