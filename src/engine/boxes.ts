import {
  CROUCH_H,
  FIGHTER_H,
  FIGHTER_W,
  GROUND_Y,
} from "./constants.ts";
import type { AttackData, Fighter, Rect } from "./types.ts";

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function hurtboxFor(f: Fighter): Rect {
  const h = f.state === "crouch" && !f.airborne ? CROUCH_H : FIGHTER_H;
  return {
    x: f.x - Math.floor(FIGHTER_W / 2),
    y: f.y - h,
    w: FIGHTER_W,
    h,
  };
}

export function hitboxFor(f: Fighter, data: AttackData): Rect {
  const hb = hurtboxFor(f);
  const w = data.range;
  const x = f.facing === 1 ? hb.x + hb.w : hb.x - w;
  // Keep the hitbox on the body; crouched fighters punch lower.
  const top = Math.min(hb.y + data.hitboxYOffset, hb.y + Math.max(0, hb.h - data.hitboxH));
  return { x, y: top, w, h: data.hitboxH };
}

export function grounded(f: { y: number; vy: number }): boolean {
  return f.y >= GROUND_Y && f.vy >= 0;
}
