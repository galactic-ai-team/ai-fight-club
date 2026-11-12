import { describe, expect, it } from "vitest";
import {
  DEFAULT_READY_TIMEOUT_MS,
  afterHostTransportError,
  clampReadyTimeoutMs,
  coachStartGate,
  isHostLeaseError,
  parseStartWhenReady,
} from "../src/commander/hostLease.ts";

describe("host lease loss falls back to spectating", () => {
  it("detects invalid-host, unauthorized, and 401 errors", () => {
    expect(isHostLeaseError(new Error("invalid host token"))).toBe(true);
    expect(isHostLeaseError(new Error("Unauthorized"))).toBe(true);
    expect(isHostLeaseError(new Error("401"))).toBe(true);
    expect(isHostLeaseError(new Error("network down"))).toBe(false);
    expect(isHostLeaseError("invalid host")).toBe(true);
  });

  it("switches a hosting tab to spectator polling instead of freezing on stale state", () => {
    const lost = afterHostTransportError("hosting", new Error("invalid host token"));
    expect(lost.resumeSpectator).toBe(true);
    expect(lost.mode).toBe("spectating");
    expect(lost.status).toMatch(/watching the live server state/i);
    expect(lost.log).toMatch(/no longer in control/i);

    // A spectator or already-stopped tab does not change role on a random error.
    const spec = afterHostTransportError("spectating", new Error("invalid host token"));
    expect(spec.resumeSpectator).toBe(false);
    expect(spec.mode).toBe("spectating");

    const net = afterHostTransportError("hosting", new Error("failed to fetch"));
    expect(net.resumeSpectator).toBe(false);
    expect(net.mode).toBe("hosting");
  });
});

describe("startWhenReady coach gate", () => {
  const base = {
    startWhenReady: true,
    p1CommandCount: 0,
    p2CommandCount: 0,
    alreadyReleased: false,
    heldSinceMs: 1_000,
    nowMs: 1_000,
    timeoutMs: DEFAULT_READY_TIMEOUT_MS,
  };

  it("holds until both coaches have sent a command", () => {
    expect(coachStartGate(base).hold).toBe(true);
    expect(coachStartGate(base).releasedBecause).toBe("waiting");
    expect(coachStartGate({ ...base, p1CommandCount: 1 }).hold).toBe(true);
    expect(coachStartGate({ ...base, p1CommandCount: 1 }).p1Ready).toBe(true);
    expect(coachStartGate({ ...base, p1CommandCount: 1, p2CommandCount: 1 }).hold).toBe(false);
    expect(coachStartGate({ ...base, p1CommandCount: 1, p2CommandCount: 1 }).releasedBecause).toBe("both-ready");
  });

  it("starts anyway when the timeout elapses", () => {
    const g = coachStartGate({ ...base, nowMs: 1_000 + DEFAULT_READY_TIMEOUT_MS });
    expect(g.hold).toBe(false);
    expect(g.releasedBecause).toBe("timeout");
    expect(g.remainingMs).toBe(0);
  });

  it("does not hold when the flag is off, and does not re-hold after release", () => {
    expect(coachStartGate({ ...base, startWhenReady: false }).hold).toBe(false);
    expect(coachStartGate({ ...base, startWhenReady: false }).releasedBecause).toBe("disabled");
    expect(coachStartGate({ ...base, alreadyReleased: true }).hold).toBe(false);
    expect(coachStartGate({ ...base, alreadyReleased: true }).releasedBecause).toBe("already-started");
  });

  it("parses and clamps ready-timeout and the startWhenReady flag", () => {
    expect(parseStartWhenReady(true)).toBe(true);
    expect(parseStartWhenReady("yes")).toBe(true);
    expect(parseStartWhenReady("off")).toBe(false);
    expect(clampReadyTimeoutMs(1_000)).toBe(5_000);
    expect(clampReadyTimeoutMs(10_000_000)).toBe(5 * 60_000);
    expect(clampReadyTimeoutMs(undefined)).toBe(DEFAULT_READY_TIMEOUT_MS);
  });
});
