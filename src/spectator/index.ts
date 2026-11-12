// src/spectator/index.ts
// Unified Spectator & Live Leaderboard Entry Point
// License: CC0-1.0 / MIT

import {
  drawArenaBackdrop,
  drawFighterSprite,
  drawPortraitToCanvas,
  type EngineFighterInput,
} from "./pixelArt.ts";
import { LeaderboardPanel } from "./leaderboardUi.ts";

export {
  drawArenaBackdrop,
  drawFighterSprite,
  drawPortraitToCanvas,
  LeaderboardPanel,
};

export { lookupSpriteFrame } from "./pixelArt.ts";
export {
  adaptPr1Leaderboard,
  formatLeaderboardRows,
  DEFAULT_LEADERBOARD_FIXTURE,
} from "./leaderboardUi.ts";
export type {
  NormalizedLeaderboardRow,
  NormalizedLeaderboardState,
  LeaderboardRowView,
} from "./leaderboardUi.ts";
export { fighterToSpriteInput, renderPixelMatch, STAGE_FLOOR_Y_RATIO } from "./engineBridge.ts";
export { emptyStandings, mountSpectatorArtBoard, STARTER_FIGHTER_IDS } from "./mountBoard.ts";
export type { ArtBoardHandle, LiveBoardSource } from "./mountBoard.ts";

export interface SpectatorFrameState {
  tick: number;
  timerSeconds?: number;
  p1: EngineFighterInput;
  p2: EngineFighterInput;
}

/**
 * Drop-in replacement for M0's canvas render function.
 * Replaces the two colored boxes (Ion and Quark) with tick-driven original pixel-art fighters.
 *
 * Prefer `renderPixelMatch` when drawing an engine MatchState: it uses logical
 * stage size (960×540) and the engine ground line, which is required when the
 * canvas has a device-pixel-ratio transform.
 */
export function renderSpectatorFrame(
  ctx: CanvasRenderingContext2D,
  state: SpectatorFrameState,
): void {
  const { width, height } = ctx.canvas;
  const tick = state.tick ?? 0;

  drawArenaBackdrop(ctx, width, height, tick);

  // Auto-infer facing direction if not explicitly set on the fighter state
  const p1Facing = state.p1.facing ?? (state.p1.x <= state.p2.x ? "right" : "left");
  const p2Facing = state.p2.facing ?? (state.p2.x >= state.p1.x ? "left" : "right");

  drawFighterSprite(
    ctx,
    { ...state.p1, id: state.p1.id ?? state.p1.name ?? "ion", facing: p1Facing },
    tick,
    width,
    height,
  );

  drawFighterSprite(
    ctx,
    { ...state.p2, id: state.p2.id ?? state.p2.name ?? "quark", facing: p2Facing },
    tick,
    width,
    height,
  );
}
