/** Host-lease and pre-fight coach-ready helpers. Pure, so tests can cover the watch-page fallback. */

export const DEFAULT_READY_TIMEOUT_MS = 90_000;
export const MIN_READY_TIMEOUT_MS = 5_000;
export const MAX_READY_TIMEOUT_MS = 5 * 60_000;

export function clampReadyTimeoutMs(v: unknown, fallback = DEFAULT_READY_TIMEOUT_MS): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.max(MIN_READY_TIMEOUT_MS, Math.min(MAX_READY_TIMEOUT_MS, Math.floor(v)));
}

export function isHostLeaseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /invalid host|unauthorized|401/i.test(msg);
}

export type WatchSessionMode = "hosting" | "spectating" | "stopped";

export const LEASE_LOST_LOG = "Host lease lost — this tab is no longer in control.";
export const LEASE_LOST_STATUS = "Host lease lost — watching the live server state.";

/**
 * When the hosting tab loses its lease, it must become a spectator and keep
 * polling / subscribing to server state. It must not freeze on the last local frame.
 */
export function afterHostTransportError(
  mode: WatchSessionMode,
  err: unknown,
): { mode: WatchSessionMode; resumeSpectator: boolean; status: string; log: string } {
  if (mode === "hosting" && isHostLeaseError(err)) {
    return {
      mode: "spectating",
      resumeSpectator: true,
      status: LEASE_LOST_STATUS,
      log: LEASE_LOST_LOG,
    };
  }
  return { mode, resumeSpectator: false, status: "", log: "" };
}

export interface CoachReadyInput {
  startWhenReady: boolean;
  p1CommandCount: number;
  p2CommandCount: number;
  /** True once the fight has already left the pre-round hold (do not re-hold). */
  alreadyReleased: boolean;
  heldSinceMs: number;
  nowMs: number;
  timeoutMs: number;
}

export type CoachReleaseReason = "disabled" | "already-started" | "both-ready" | "timeout" | "waiting";

export interface CoachStartGate {
  hold: boolean;
  releasedBecause: CoachReleaseReason;
  p1Ready: boolean;
  p2Ready: boolean;
  remainingMs: number;
}

/** Hold round 1 until both coaches have sent a command, or the timeout elapses. */
export function coachStartGate(input: CoachReadyInput): CoachStartGate {
  const p1Ready = input.p1CommandCount > 0;
  const p2Ready = input.p2CommandCount > 0;
  const remainingMs = Math.max(0, input.timeoutMs - (input.nowMs - input.heldSinceMs));
  if (!input.startWhenReady) {
    return { hold: false, releasedBecause: "disabled", p1Ready, p2Ready, remainingMs: 0 };
  }
  if (input.alreadyReleased) {
    return { hold: false, releasedBecause: "already-started", p1Ready, p2Ready, remainingMs: 0 };
  }
  if (p1Ready && p2Ready) {
    return { hold: false, releasedBecause: "both-ready", p1Ready, p2Ready, remainingMs: 0 };
  }
  if (remainingMs <= 0) {
    return { hold: false, releasedBecause: "timeout", p1Ready, p2Ready, remainingMs: 0 };
  }
  return { hold: true, releasedBecause: "waiting", p1Ready, p2Ready, remainingMs };
}

export function parseStartWhenReady(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "on";
  }
  return false;
}
