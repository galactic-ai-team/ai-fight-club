import { seedRng, rngInt } from "../engine/rng.ts";
import type { Action, AttackInput, MoveDir, Observation, Vertical } from "../engine/types.ts";
import type { Bot, BotStartContext } from "./types.ts";

const MOVES: MoveDir[] = ["none", "left", "right"];
const VERT: Vertical[] = ["none", "none", "none", "crouch", "jump"];
const ATK: AttackInput[] = ["none", "none", "none", "none", "light", "light", "heavy", "special"];

/**
 * Seeded random bot. Same match seed + side always yields the same actions.
 */
export function createRandomBot(): Bot {
  let rng = seedRng(1);
  return {
    id: "random",
    name: "Random",
    start(ctx: BotStartContext) {
      rng = seedRng((ctx.seed ^ (ctx.side === "p1" ? 0xa5a5a5a5 : 0x5a5a5a5a)) | 0);
    },
    act(_obs: Observation): Action {
      let move: MoveDir;
      let vertical: Vertical;
      let attack: AttackInput;
      let r = rngInt(rng, 0, MOVES.length - 1);
      rng = r.state;
      move = MOVES[r.n] ?? "none";
      r = rngInt(rng, 0, VERT.length - 1);
      rng = r.state;
      vertical = VERT[r.n] ?? "none";
      r = rngInt(rng, 0, ATK.length - 1);
      rng = r.state;
      attack = ATK[r.n] ?? "none";
      r = rngInt(rng, 0, 4);
      rng = r.state;
      const block = r.n === 0;
      return { move, vertical, attack, block };
    },
  };
}
