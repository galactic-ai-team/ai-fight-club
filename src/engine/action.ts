import { NEUTRAL_ACTION, type Action, type AttackInput, type MoveDir, type Vertical } from "./types.ts";

const MOVES = new Set<MoveDir>(["none", "left", "right"]);
const VERTICALS = new Set<Vertical>(["none", "crouch", "jump"]);
const ATTACKS = new Set<AttackInput>(["none", "light", "heavy", "special"]);

/**
 * Coerce any unknown payload into a legal Action.
 * Invalid or missing fields become neutral. Never throws.
 */
export function normalizeAction(raw: unknown): Action {
  // Reading each property exactly once matters for untrusted getters.
  try {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ...NEUTRAL_ACTION };
    }
    const o = raw as Record<string, unknown>;
    const m = o.move;
    const v = o.vertical;
    const a = o.attack;
    const b = o.block;
    const move = MOVES.has(m as MoveDir) ? (m as MoveDir) : "none";
    const vertical = VERTICALS.has(v as Vertical) ? (v as Vertical) : "none";
    const attack = ATTACKS.has(a as AttackInput) ? (a as AttackInput) : "none";
    return { move, vertical, attack, block: b === true };
  } catch {
    return { ...NEUTRAL_ACTION };
  }
}

export function actionEqual(a: Action, b: Action): boolean {
  return a.move === b.move && a.vertical === b.vertical && a.attack === b.attack && a.block === b.block;
}
