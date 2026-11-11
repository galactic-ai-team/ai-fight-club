import {
  CROUCH_H,
  FIGHTER_H,
  FIGHTER_W,
  GROUND_Y,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from "../engine/constants.ts";
import type { Fighter, MatchState, Rect } from "../engine/types.ts";

const P1 = "#4be3ff";
const P2 = "#ffb347";
const BG_TOP = "#0b1020";
const BG_BOT = "#1a1040";
const GROUND = "#2a2158";
const GRID = "rgba(120, 200, 255, 0.08)";
const HIT = "#fff4c8";

export function resizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = STAGE_WIDTH * dpr;
  canvas.height = STAGE_HEIGHT * dpr;
  canvas.style.width = "100%";
  canvas.style.maxWidth = `${STAGE_WIDTH}px`;
  canvas.style.height = "auto";
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function renderMatch(ctx: CanvasRenderingContext2D, state: MatchState): void {
  drawArena(ctx);
  drawFighter(ctx, state.p1, P1);
  drawFighter(ctx, state.p2, P2);
  if (state.p1.hitbox) drawBox(ctx, state.p1.hitbox, "rgba(255, 80, 80, 0.55)", "rgba(255, 80, 80, 0.9)");
  if (state.p2.hitbox) drawBox(ctx, state.p2.hitbox, "rgba(255, 80, 80, 0.55)", "rgba(255, 80, 80, 0.9)");
  drawBanner(ctx, state);
}

function drawArena(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, STAGE_HEIGHT);
  g.addColorStop(0, BG_TOP);
  g.addColorStop(1, BG_BOT);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (let x = 0; x < STAGE_WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GROUND_Y);
    ctx.stroke();
  }
  for (let y = 0; y < GROUND_Y; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(STAGE_WIDTH, y);
    ctx.stroke();
  }

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, GROUND_Y, STAGE_WIDTH, STAGE_HEIGHT - GROUND_Y);
  ctx.fillStyle = "#3d2d7a";
  ctx.fillRect(0, GROUND_Y, STAGE_WIDTH, 6);
  ctx.fillStyle = "rgba(75, 227, 255, 0.25)";
  ctx.fillRect(0, GROUND_Y, STAGE_WIDTH, 2);
}

function bodyH(f: Fighter): number {
  return f.state === "crouch" && !f.airborne ? CROUCH_H : FIGHTER_H;
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, color: string): void {
  const h = bodyH(f);
  const x = f.x - Math.floor(FIGHTER_W / 2);
  const y = f.y - h;
  const flashing = f.state === "hitstun" && f.stateT % 4 < 2;
  ctx.fillStyle = flashing ? HIT : color;
  ctx.fillRect(x, y, FIGHTER_W, h);
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, FIGHTER_W - 2, h - 2);

  // Face mark so direction is readable.
  ctx.fillStyle = "#0b1020";
  const eyeX = f.facing === 1 ? x + FIGHTER_W - 16 : x + 8;
  ctx.fillRect(eyeX, y + 16, 8, 8);
  ctx.fillRect(eyeX + (f.facing === 1 ? -6 : 6), y + 28, 14, 4);

  if (f.blocking) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    const sx = f.facing === 1 ? x + FIGHTER_W + 4 : x - 8;
    ctx.beginPath();
    ctx.moveTo(sx, y + 12);
    ctx.lineTo(sx, y + h - 12);
    ctx.stroke();
  }

  if (f.state === "knockdown") {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x, y, FIGHTER_W, h);
  }

  ctx.fillStyle = "#e8eeff";
  ctx.font = "12px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(f.character, f.x, y - 8);
}

function drawBox(ctx: CanvasRenderingContext2D, r: Rect, fill: string, stroke: string): void {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
}

function drawBanner(ctx: CanvasRenderingContext2D, state: MatchState): void {
  if (state.phase === "fight") return;
  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(0, 200, STAGE_WIDTH, 80);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 28px ui-monospace, monospace";
  ctx.textAlign = "center";
  if (state.phase === "round_end") {
    const w = state.round.winner;
    const text =
      w === "draw" ? "ROUND DRAW" : w === "p1" ? `${state.p1.character} WINS ROUND` : `${state.p2.character} WINS ROUND`;
    ctx.fillText(text, STAGE_WIDTH / 2, 250);
  } else if (state.matchWinner) {
    const name = state.matchWinner === "p1" ? state.p1.character : state.p2.character;
    ctx.fillText(`${name} WINS`, STAGE_WIDTH / 2, 250);
  }
}
