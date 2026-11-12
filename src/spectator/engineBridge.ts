import { GROUND_Y, STAGE_HEIGHT, STAGE_WIDTH } from "../engine/constants.ts";
import type { Fighter, MatchState } from "../engine/types.ts";
import {
  drawArenaBackdrop,
  drawFighterSprite,
  type EngineFighterInput,
} from "./pixelArt.ts";

/** Engine ground line as a fraction of stage height (440 / 540). */
export const STAGE_FLOOR_Y_RATIO = GROUND_Y / STAGE_HEIGHT;

/**
 * Map an engine Fighter onto Gemini's sprite input.
 * Coordinates stay in stage pixels (x = center, y = feet). Knockdown uses the
 * ko pose; hitstun / attack / block / jump / walk flow through resolveFighterPose.
 */
export function fighterToSpriteInput(f: Fighter): EngineFighterInput {
  const knocked = f.state === "knockdown";
  return {
    id: f.character,
    name: f.character,
    x: f.x,
    y: f.y,
    vx: f.vx,
    vy: f.vy,
    health: f.health,
    hp: f.health,
    maxHealth: f.maxHealth,
    maxHp: f.maxHealth,
    facing: f.facing,
    state: knocked ? "ko" : f.state,
    attacking: f.state === "attack",
    isAttacking: f.state === "attack",
    blocking: f.blocking || f.state === "block",
    isBlocking: f.blocking || f.state === "block",
    hit: f.state === "hitstun",
    isHit: f.state === "hitstun",
  };
}

/** Draw Gemini's arena + fighters in engine stage space (logical 960×540). */
export function renderPixelMatch(ctx: CanvasRenderingContext2D, state: MatchState): void {
  const ratio = STAGE_FLOOR_Y_RATIO;
  drawArenaBackdrop(ctx, STAGE_WIDTH, STAGE_HEIGHT, state.tick, ratio);
  drawFighterSprite(
    ctx,
    fighterToSpriteInput(state.p1),
    state.tick,
    STAGE_WIDTH,
    STAGE_HEIGHT,
    ratio,
  );
  drawFighterSprite(
    ctx,
    fighterToSpriteInput(state.p2),
    state.tick,
    STAGE_WIDTH,
    STAGE_HEIGHT,
    ratio,
  );
}
