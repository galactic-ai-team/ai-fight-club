/**
 * First-person POV renderer for AI Eyes (Project 7).
 *
 * Draws what one fighter could actually see: a corridor view looking along
 * their facing direction. The opponent appears only when they are in front,
 * scaled by distance. Attacks telegraph as shapes coming toward the camera.
 * Exact HP / meter numbers are omitted in the default vision-only mode.
 *
 * Pure integer/float rasterizer — no DOM, no canvas. Deterministic for a
 * given MatchState + side + options.
 */

import type { AttackKind, AttackPhase, Fighter, FighterStateName, MatchState, Side } from "../engine/types.ts";
import { FIGHTER_H, GROUND_Y, STAGE_WIDTH } from "../engine/constants.ts";
import { attackPhaseOf, ATTACKS } from "../engine/attacks.ts";
import { FIGHTER_PALETTES, type CanonicalFighterId, type FighterPalette } from "../spectator/pixelArt.ts";
import { encodePng } from "./png.ts";

export const POV_WIDTH = 160;
export const POV_HEIGHT = 120;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface PovVisibility {
  opponentVisible: boolean;
  /** Stage pixels in front of the camera (positive = in front). */
  forwardDistance: number;
  opponentAirborne: boolean;
  opponentState: FighterStateName;
  incomingAttack: AttackKind | null;
  incomingPhase: AttackPhase | null;
  /** True when the opponent is behind the facing direction. */
  behindThreat: boolean;
  /** Distance in px to the stage wall ahead; 0 if none close. */
  wallAhead: number;
}

export interface PovFrame {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  pixels: Uint8Array;
  side: Side;
  tick: number;
  visibility: PovVisibility;
}

export interface PovRenderOpts {
  width?: number;
  height?: number;
  /**
   * When true (default), no numeric HUD is drawn — the image is only what
   * the fighter's eyes could see. Set false to stamp a tiny health tick
   * bar for debugging.
   */
  visionOnly?: boolean;
}

const FALLBACK_PALETTE: FighterPalette = {
  outline: "#101418",
  primary: "#7a8494",
  secondary: "#3a4250",
  accent: "#c8d0dc",
  glow: "#e8eef6",
  visor: "#f4f7fb",
  effect: "#d0d6e0",
};

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function canonicalId(name: string): CanonicalFighterId | null {
  const key = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "ion") return "ion";
  if (key === "quark") return "quark";
  if (key === "vexel") return "vexel";
  if (key === "cadence9" || key === "cadence") return "cadence9";
  return null;
}

export function paletteFor(character: string): FighterPalette {
  const id = canonicalId(character);
  return id ? FIGHTER_PALETTES[id] : FALLBACK_PALETTE;
}

function phaseOf(f: Fighter): AttackPhase | null {
  if (f.state !== "attack" || !f.attack) return null;
  return attackPhaseOf(ATTACKS[f.attack], f.attackT);
}

export function describePov(state: MatchState, side: Side): PovVisibility {
  const me = side === "p1" ? state.p1 : state.p2;
  const opp = side === "p1" ? state.p2 : state.p1;
  const forwardDistance = (opp.x - me.x) * me.facing;
  const opponentVisible = forwardDistance > 0;
  const edgeX = me.facing === 1 ? STAGE_WIDTH - me.x : me.x;
  const wallAhead = edgeX <= 120 ? edgeX : 0;
  const incoming = opponentVisible && opp.state === "attack" && opp.attack ? opp.attack : null;
  return {
    opponentVisible,
    forwardDistance,
    opponentAirborne: opp.airborne,
    opponentState: opp.state,
    incomingAttack: incoming,
    incomingPhase: incoming ? phaseOf(opp) : null,
    behindThreat: !opponentVisible,
    wallAhead,
  };
}

function idx(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function blend(pixels: Uint8Array, width: number, height: number, x: number, y: number, c: Rgb, a: number): void {
  if (x < 0 || y < 0 || x >= width || y >= height || a <= 0) return;
  const i = idx(width, x, y);
  const ia = Math.max(0, Math.min(255, a));
  const inv = 255 - ia;
  pixels[i] = (pixels[i]! * inv + c.r * ia) / 255 | 0;
  pixels[i + 1] = (pixels[i + 1]! * inv + c.g * ia) / 255 | 0;
  pixels[i + 2] = (pixels[i + 2]! * inv + c.b * ia) / 255 | 0;
  pixels[i + 3] = 255;
}

function fillRect(
  pixels: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  c: Rgb,
  a = 255,
): void {
  const x1 = Math.min(width, Math.ceil(x0 + w));
  const y1 = Math.min(height, Math.ceil(y0 + h));
  for (let y = Math.max(0, y0 | 0); y < y1; y++) {
    for (let x = Math.max(0, x0 | 0); x < x1; x++) blend(pixels, width, height, x, y, c, a);
  }
}

function fillEllipse(
  pixels: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: Rgb,
  a = 255,
): void {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(width - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(height - 1, Math.ceil(cy + ry));
  const rx2 = rx * rx || 1;
  const ry2 = ry * ry || 1;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1) blend(pixels, width, height, x, y, c, a);
    }
  }
}

/** Vertical gradient from top color to bottom color. */
function fillVGradient(
  pixels: Uint8Array,
  width: number,
  height: number,
  y0: number,
  y1: number,
  top: Rgb,
  bot: Rgb,
): void {
  const span = Math.max(1, y1 - y0);
  for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
    const t = (y - y0) / span;
    const c = {
      r: (top.r + (bot.r - top.r) * t) | 0,
      g: (top.g + (bot.g - top.g) * t) | 0,
      b: (top.b + (bot.b - top.b) * t) | 0,
    };
    for (let x = 0; x < width; x++) blend(pixels, width, height, x, y, c, 255);
  }
}

function drawFloor(
  pixels: Uint8Array,
  width: number,
  height: number,
  horizon: number,
  vanishingX: number,
): void {
  const floorDark = { r: 28, g: 24, b: 36 };
  const floorLite = { r: 48, g: 42, b: 58 };
  const line = { r: 90, g: 80, b: 110 };
  fillVGradient(pixels, width, height, horizon, height, { r: 40, g: 36, b: 52 }, { r: 18, g: 16, b: 24 });

  // Perspective bands: closer rows are taller.
  for (let y = horizon + 1; y < height; y++) {
    const depth = (y - horizon) / Math.max(1, height - horizon);
    const stripe = Math.floor(1 / Math.max(0.08, depth)) % 2 === 0;
    const c = stripe ? floorLite : floorDark;
    const a = 80 + Math.floor(depth * 80);
    for (let x = 0; x < width; x++) blend(pixels, width, height, x, y, c, a);
  }

  // Converging lane lines.
  for (const side of [-1, 1]) {
    for (let y = horizon + 1; y < height; y++) {
      const depth = (y - horizon) / Math.max(1, height - horizon);
      const x = Math.round(vanishingX + side * (8 + depth * (width * 0.48)));
      blend(pixels, width, height, x, y, line, 160);
      blend(pixels, width, height, x + 1, y, line, 80);
    }
  }

  // Center dashed line for distance feel.
  for (let y = horizon + 2; y < height; y += 3) {
    const depth = (y - horizon) / Math.max(1, height - horizon);
    if (Math.floor(depth * 12) % 2 === 0) {
      blend(pixels, width, height, vanishingX, y, line, 140);
    }
  }
}

function figureSize(height: number, forwardDistance: number): { w: number; h: number } {
  // Smaller focal length so a far opponent stays clearly smaller than a close one.
  const focal = height * 1.35;
  const h = Math.max(8, Math.min(height * 0.88, (focal * FIGHTER_H) / Math.max(24, forwardDistance)));
  return { w: Math.max(5, h * 0.42), h };
}

function drawOpponent(
  pixels: Uint8Array,
  width: number,
  height: number,
  horizon: number,
  vanishingX: number,
  opp: Fighter,
  vis: PovVisibility,
): void {
  const pal = paletteFor(opp.character);
  const primary = hexToRgb(pal.primary);
  const secondary = hexToRgb(pal.secondary);
  const outline = hexToRgb(pal.outline);
  const visor = hexToRgb(pal.visor);
  const accent = hexToRgb(pal.accent);
  const { w, h } = figureSize(height, vis.forwardDistance);

  const crouch = opp.state === "crouch" && !opp.airborne;
  const bodyH = crouch ? h * 0.62 : h;
  const jumpLift = opp.airborne ? Math.min(horizon * 0.7, Math.max(6, (groundLift(opp) * h) / 50)) : 0;
  const knockdown = opp.state === "knockdown";

  let cx = vanishingX;
  let feetY = horizon + Math.max(8, Math.min(height - horizon - 4, (h * 0.35 + 14) * (80 / Math.max(40, vis.forwardDistance)) + 10));
  if (knockdown) {
    feetY = Math.min(height - 4, feetY + 6);
  }
  let topY = knockdown ? feetY - bodyH * 0.35 : feetY - bodyH - jumpLift;
  // Keep a jumping figure inside the frame so the head is still visible.
  if (topY < 2) {
    feetY += 2 - topY;
    topY = 2;
  }

  if (knockdown) {
    fillEllipse(pixels, width, height, cx, feetY - 4, w * 1.1, bodyH * 0.28, outline, 255);
    fillEllipse(pixels, width, height, cx, feetY - 5, w * 0.95, bodyH * 0.22, primary, 255);
    return;
  }

  // Body
  fillRect(pixels, width, height, cx - w / 2 - 1, topY - 1, w + 2, bodyH + 2, outline, 255);
  fillRect(pixels, width, height, cx - w / 2, topY, w, bodyH, primary, 255);
  // Chest plate
  fillRect(pixels, width, height, cx - w * 0.28, topY + bodyH * 0.28, w * 0.56, bodyH * 0.38, secondary, 220);
  // Head
  const headR = Math.max(3, w * 0.38);
  const headY = topY + headR * 0.2;
  fillEllipse(pixels, width, height, cx, headY, headR + 1, headR + 1, outline, 255);
  fillEllipse(pixels, width, height, cx, headY, headR, headR, primary, 255);
  fillEllipse(pixels, width, height, cx, headY, headR * 0.62, headR * 0.38, visor, 255);

  if (opp.state === "block" || opp.blocking) {
    // Guard: arms up as a bar in front of the torso.
    fillRect(pixels, width, height, cx - w * 0.7, topY + bodyH * 0.25, w * 1.4, Math.max(3, bodyH * 0.16), accent, 255);
  }

  if (opp.state === "hitstun") {
    const flash = { r: 255, g: 220, b: 220 };
    fillRect(pixels, width, height, cx - w / 2, topY, w, bodyH, flash, 90);
  }
}

function groundLift(opp: Fighter): number {
  // How far above the ground the feet are, in stage pixels (y grows downward).
  return Math.max(0, GROUND_Y - opp.y);
}

function drawIncoming(
  pixels: Uint8Array,
  width: number,
  height: number,
  vanishingX: number,
  horizon: number,
  opp: Fighter,
  vis: PovVisibility,
): void {
  if (!vis.incomingAttack || !vis.incomingPhase) return;
  const pal = paletteFor(opp.character);
  const effect = hexToRgb(pal.effect);
  const glow = hexToRgb(pal.glow);
  const { w, h } = figureSize(height, vis.forwardDistance);
  const phase = vis.incomingPhase;
  const scale = phase === "startup" ? 0.35 : phase === "active" ? 1 : 0.55;
  const alpha = phase === "startup" ? 140 : phase === "active" ? 230 : 110;
  const punchW = Math.max(6, w * 0.9 * scale);
  const punchH = Math.max(5, h * 0.28 * scale);
  // Active frames: the strike sits closer to the camera (lower and larger).
  const yOff = phase === "active" ? h * 0.55 : h * 0.2;
  const cy = horizon + yOff;
  fillEllipse(pixels, width, height, vanishingX, cy, punchW * 1.15, punchH * 1.15, glow, Math.floor(alpha * 0.45));
  fillEllipse(pixels, width, height, vanishingX, cy, punchW, punchH, effect, alpha);
}

function drawHands(
  pixels: Uint8Array,
  width: number,
  height: number,
  me: Fighter,
): void {
  const pal = paletteFor(me.character);
  const primary = hexToRgb(pal.primary);
  const outline = hexToRgb(pal.outline);
  const accent = hexToRgb(pal.accent);
  const guarding = me.blocking || me.state === "block";
  const attacking = me.state === "attack";
  const handW = Math.max(14, width * 0.18);
  const handH = guarding ? height * 0.28 : height * 0.2;
  const y = guarding ? height - handH - 2 : height - handH + 4;
  const leftX = 4;
  const rightX = width - handW - 4;

  const drawHand = (x: number, lift: number, color: Rgb): void => {
    fillRect(pixels, width, height, x - 1, y - lift - 1, handW + 2, handH + 2, outline, 255);
    fillRect(pixels, width, height, x, y - lift, handW, handH, color, 255);
  };

  if (attacking) {
    // Lead hand punches toward the vanishing point.
    drawHand(width / 2 - handW / 2, height * 0.18, accent);
    drawHand(leftX, 0, primary);
  } else {
    drawHand(leftX, 0, primary);
    drawHand(rightX, 0, primary);
  }
}

function drawBehindThreat(pixels: Uint8Array, width: number, height: number): void {
  const red = { r: 200, g: 40, b: 50 };
  for (let i = 0; i < 8; i++) {
    const a = 160 - i * 16;
    for (let y = 0; y < height; y++) {
      blend(pixels, width, height, i, y, red, a);
      blend(pixels, width, height, width - 1 - i, y, red, a);
    }
  }
  // Chevron at the bottom: "they're behind you".
  const cy = height - 14;
  const cx = Math.floor(width / 2);
  for (let i = 0; i < 8; i++) {
    blend(pixels, width, height, cx - i, cy - i, red, 220);
    blend(pixels, width, height, cx + i, cy - i, red, 220);
  }
}

function drawWall(
  pixels: Uint8Array,
  width: number,
  height: number,
  horizon: number,
  vanishingX: number,
  wallAhead: number,
): void {
  if (wallAhead <= 0) return;
  const closeness = Math.max(0, Math.min(1, (120 - wallAhead) / 120));
  const wallW = 10 + closeness * (width * 0.45);
  const wall = { r: 30, g: 28, b: 40 };
  const edge = { r: 70, g: 64, b: 88 };
  const x0 = vanishingX - wallW / 2;
  fillRect(pixels, width, height, x0, 8, wallW, horizon - 4, wall, Math.floor(80 + closeness * 140));
  fillRect(pixels, width, height, x0, 8, 2, horizon - 4, edge, 200);
  fillRect(pixels, width, height, x0 + wallW - 2, 8, 2, horizon - 4, edge, 200);
}

function drawDebugHud(
  pixels: Uint8Array,
  width: number,
  height: number,
  me: Fighter,
  opp: Fighter,
): void {
  const bg = { r: 0, g: 0, b: 0 };
  fillRect(pixels, width, height, 0, 0, width, 6, bg, 180);
  const myW = Math.max(1, Math.round((me.health / Math.max(1, me.maxHealth)) * (width / 2 - 4)));
  const oppW = Math.max(1, Math.round((opp.health / Math.max(1, opp.maxHealth)) * (width / 2 - 4)));
  fillRect(pixels, width, height, 2, 2, myW, 2, { r: 80, g: 220, b: 140 }, 255);
  fillRect(pixels, width, height, width - 2 - oppW, 2, oppW, 2, { r: 220, g: 80, b: 100 }, 255);
}

export function renderPov(state: MatchState, side: Side, opts: PovRenderOpts = {}): PovFrame {
  const width = opts.width ?? POV_WIDTH;
  const height = opts.height ?? POV_HEIGHT;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 24) {
    throw new Error("renderPov: width/height must be integers >= 32x24");
  }
  const visionOnly = opts.visionOnly !== false;
  const me = side === "p1" ? state.p1 : state.p2;
  const opp = side === "p1" ? state.p2 : state.p1;
  const vis = describePov(state, side);
  const pixels = new Uint8Array(width * height * 4);
  // Opaque black start.
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;

  const horizon = Math.floor(height * 38 / 100);
  const vanishingX = Math.floor(width / 2);

  fillVGradient(pixels, width, height, 0, horizon + 1, { r: 8, g: 10, b: 22 }, { r: 36, g: 42, b: 72 });
  drawFloor(pixels, width, height, horizon, vanishingX);
  drawWall(pixels, width, height, horizon, vanishingX, vis.wallAhead);

  if (vis.opponentVisible) {
    drawOpponent(pixels, width, height, horizon, vanishingX, opp, vis);
    drawIncoming(pixels, width, height, vanishingX, horizon, opp, vis);
  }
  if (vis.behindThreat) drawBehindThreat(pixels, width, height);

  drawHands(pixels, width, height, me);

  if (!visionOnly) drawDebugHud(pixels, width, height, me, opp);

  // Soft vignette so the frame reads as a "view through eyes".
  const vig = { r: 0, g: 0, b: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x + 0.5) / width - 0.5;
      const ny = (y + 0.5) / height - 0.5;
      const d = Math.sqrt(nx * nx * 1.6 + ny * ny * 1.2);
      if (d > 0.62) {
        const a = Math.min(160, Math.floor((d - 0.62) * 420));
        blend(pixels, width, height, x, y, vig, a);
      }
    }
  }

  return { width, height, pixels, side, tick: state.tick, visibility: vis };
}

export function encodePovPng(frame: PovFrame): Uint8Array {
  return encodePng(frame.width, frame.height, frame.pixels);
}

export function renderPovPng(state: MatchState, side: Side, opts: PovRenderOpts = {}): Uint8Array {
  return encodePovPng(renderPov(state, side, opts));
}
