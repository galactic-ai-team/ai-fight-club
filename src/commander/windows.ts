import { TICK_HZ } from "../engine/constants.ts";
import type { WindowMode, WindowSnapshot } from "./types.ts";

/** Wall-clock pause, in ms, that a standard 3s/5s decision window stays open. */
export const WINDOW_PAUSE_MS = 2500;
/** Wait-for-both windows stay open until both sides submit, or this timeout. */
export const WAIT_FOR_BOTH_PAUSE_MS = 45_000;

export function pauseMs(mode: WindowMode): number {
  return mode === "5s-wait" ? WAIT_FOR_BOTH_PAUSE_MS : WINDOW_PAUSE_MS;
}

export function intervalTicks(mode: WindowMode): number | null {
  if (mode === "off") return null;
  if (mode === "3s") return 3 * TICK_HZ;
  return 5 * TICK_HZ;
}

export function intervalSeconds(mode: WindowMode): number | null {
  if (mode === "off") return null;
  return mode === "3s" ? 3 : 5;
}

export interface DecisionWindowState {
  mode: WindowMode;
  open: boolean;
  index: number;
  openedAtTick: number;
  openedAtMs: number;
  closesAtMs: number;
  p1Submitted: boolean;
  p2Submitted: boolean;
  lastOpenedTick: number;
}

export function createWindowState(mode: WindowMode): DecisionWindowState {
  return {
    mode,
    open: false,
    index: 0,
    openedAtTick: -1,
    openedAtMs: 0,
    closesAtMs: 0,
    p1Submitted: false,
    p2Submitted: false,
    lastOpenedTick: -1,
  };
}

/**
 * A window opens when fight-time reaches a multiple of the interval,
 * after the first interval (not at tick 0), and only if one is not already open.
 */
export function shouldOpenWindow(tick: number, w: DecisionWindowState): boolean {
  const iv = intervalTicks(w.mode);
  if (iv === null || w.open) return false;
  if (tick <= 0) return false;
  if (tick % iv !== 0) return false;
  if (w.lastOpenedTick === tick) return false;
  return true;
}

export function openWindow(w: DecisionWindowState, tick: number, nowMs: number): void {
  w.open = true;
  w.index += 1;
  w.openedAtTick = tick;
  w.lastOpenedTick = tick;
  w.openedAtMs = nowMs;
  w.closesAtMs = nowMs + pauseMs(w.mode);
  w.p1Submitted = false;
  w.p2Submitted = false;
}

/**
 * Close when both fighters have submitted, or when the wall-clock pause ends.
 * If nobody answers, play continues on the last command (callers keep the directive).
 */
export function shouldCloseWindow(w: DecisionWindowState, nowMs: number): boolean {
  if (!w.open) return false;
  if (w.p1Submitted && w.p2Submitted) return true;
  if (nowMs >= w.closesAtMs) return true;
  return false;
}

export function closeWindow(w: DecisionWindowState): void {
  w.open = false;
  w.closesAtMs = 0;
}

export function markSubmitted(w: DecisionWindowState, side: "p1" | "p2"): void {
  if (side === "p1") w.p1Submitted = true;
  else w.p2Submitted = true;
}

export function remainingMs(w: DecisionWindowState, nowMs: number): number {
  if (!w.open) return 0;
  return Math.max(0, w.closesAtMs - nowMs);
}

export function snapshotWindow(w: DecisionWindowState, nowMs: number): WindowSnapshot {
  return {
    mode: w.mode,
    open: w.open,
    index: w.index,
    openedAtTick: w.openedAtTick,
    remainingMs: remainingMs(w, nowMs),
    p1Submitted: w.p1Submitted,
    p2Submitted: w.p2Submitted,
  };
}

/**
 * Pure helper used by tests: next tick at which a window should open after `tick`.
 * Returns null when windows are off.
 */
export function nextWindowTick(tick: number, mode: WindowMode): number | null {
  const iv = intervalTicks(mode);
  if (iv === null) return null;
  if (tick < iv) return iv;
  const rem = tick % iv;
  if (rem === 0) return tick === 0 ? iv : tick;
  return tick + (iv - rem);
}
