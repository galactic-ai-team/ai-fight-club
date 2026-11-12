// src/spectator/index.ts
// Unified Spectator & Live Leaderboard Entry Point
// License: CC0-1.0 / MIT

import {
  EngineFighterInput,
  drawArenaBackdrop,
  drawFighterSprite,
  drawPortraitToCanvas,
} from './pixelArt';
import { LeaderboardPanel } from './leaderboardUi';

export {
  drawArenaBackdrop,
  drawFighterSprite,
  drawPortraitToCanvas,
  LeaderboardPanel,
};

export interface SpectatorFrameState {
  tick: number;
  timerSeconds?: number;
  p1: EngineFighterInput;
  p2: EngineFighterInput;
}

/**
 * Drop-in replacement for M0's canvas render function.
 * Replaces the two colored boxes (Ion and Quark) with tick-driven original pixel-art fighters.
 */
export function renderSpectatorFrame(
  ctx: CanvasRenderingContext2D,
  state: SpectatorFrameState
): void {
  const { width, height } = ctx.canvas;
  const tick = state.tick ?? 0;

  drawArenaBackdrop(ctx, width, height, tick);

  // Auto-infer facing direction if not explicitly set on the fighter state
  const p1Facing =
    state.p1.facing ?? (state.p1.x <= state.p2.x ? 'right' : 'left');
  const p2Facing =
    state.p2.facing ?? (state.p2.x >= state.p1.x ? 'left' : 'right');

  drawFighterSprite(
    ctx,
    { ...state.p1, id: state.p1.id ?? state.p1.name ?? 'ion', facing: p1Facing },
    tick,
    width,
    height
  );

  drawFighterSprite(
    ctx,
    { ...state.p2, id: state.p2.id ?? state.p2.name ?? 'quark', facing: p2Facing },
    tick,
    width,
    height
  );
}