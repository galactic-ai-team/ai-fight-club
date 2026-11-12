import { hashToken, newHostToken, newJoinCode, randomMatchId, tokensMatch } from "./codes.ts";
import { parseCommand } from "./parse.ts";
import {
  isWindowMode,
  parseOpenSeat,
  seatIsOpen,
  type CommandRecord,
  type CreateMatchRequest,
  type MatchPublicState,
  type OpenSeat,
  type PublicMatchListItem,
  type WindowMode,
} from "./types.ts";
import { clampReadyTimeoutMs, DEFAULT_READY_TIMEOUT_MS, parseStartWhenReady } from "./hostLease.ts";

export const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_TTL_MS = 24 * 60 * 60 * 1000;
export const STALE_HOST_MS = 15_000;
export const MAX_TAUNT_COMMANDS_PER_SEC = 8;
/** Unauthenticated open-seat commands (GET /cmd) are capped tighter. */
export const OPEN_SEAT_COMMANDS_PER_SEC = 1;

export interface StoredMatch {
  id: string;
  createdAtMs: number;
  expiresAtMs: number;
  seed: number;
  windowMode: WindowMode;
  p1Bot: string;
  p2Bot: string;
  p1Character: string;
  p2Character: string;
  p1Controller: string;
  p2Controller: string;
  /** Which seats accept commands with no join code, for this match only. */
  openSeat: OpenSeat;
  startWhenReady: boolean;
  readyTimeoutMs: number;
  p1CodeHash: string;
  p2CodeHash: string;
  hostTokenHash: string;
  volunteerTokenHash: string;
  status: "waiting" | "live" | "ended" | "stale";
  pending: CommandRecord[];
  log: CommandRecord[];
  publicState: MatchPublicState | null;
  hostPresent: boolean;
  hostSeenAtMs: number;
  nextSeq: number;
}

export interface CreatedMatch {
  record: StoredMatch;
  secrets: { p1Code: string; p2Code: string; hostToken: string };
}

export interface MatchStore {
  create(input: CreateMatchRequest, nowMs?: number): Promise<CreatedMatch>;
  get(id: string, nowMs?: number): Promise<StoredMatch | null>;
  listLive(nowMs?: number): Promise<PublicMatchListItem[]>;
  submitCommand(
    id: string,
    side: "p1" | "p2",
    code: string,
    rawCommand: unknown,
    issuedAtMs: number | null,
    nowMs?: number,
  ): Promise<CommandRecord>;
  pullPending(id: string, hostToken: string, sinceSeq: number, nowMs?: number): Promise<CommandRecord[]>;
  publishState(id: string, hostToken: string, state: MatchPublicState, nowMs?: number): Promise<void>;
  claimHost(id: string, hostToken: string, nowMs?: number): Promise<boolean>;
  volunteerHost(id: string, nowMs?: number): Promise<{ token: string; record: StoredMatch }>;
  markApplied(id: string, hostToken: string, seq: number, tick: number, nowMs?: number): Promise<void>;
}

export class StoreError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

function clampSeed(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return Math.floor(Math.random() * 1_000_000_000);
  return Math.floor(n) | 0;
}

function clampTtl(seconds: unknown): number {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return DEFAULT_TTL_MS;
  return Math.max(60_000, Math.min(MAX_TTL_MS, Math.floor(seconds * 1000)));
}

export function toListItem(m: StoredMatch, nowMs: number): PublicMatchListItem {
  let status: PublicMatchListItem["status"] = m.status;
  if (m.status === "live" && nowMs - m.hostSeenAtMs > STALE_HOST_MS) status = "stale";
  if (m.status === "waiting" && nowMs - m.hostSeenAtMs > STALE_HOST_MS && m.hostSeenAtMs > 0) {
    status = "stale";
  }
  const p1c = m.publicState?.p1.character ?? m.p1Character;
  const p2c = m.publicState?.p2.character ?? m.p2Character;
  const score = m.publicState ? `${m.publicState.p1Wins}-${m.publicState.p2Wins}` : "0-0";
  return {
    id: m.id,
    p1: { character: p1c, controller: m.p1Controller },
    p2: { character: p2c, controller: m.p2Controller },
    status,
    score,
    tick: m.publicState?.tick ?? 0,
    windowMode: m.windowMode,
    openSeat: m.openSeat ?? "none",
    watchPath: `/watch.html?m=${encodeURIComponent(m.id)}`,
    updatedAtMs: m.publicState?.updatedAtMs ?? m.createdAtMs,
  };
}

export function publicView(m: StoredMatch, nowMs: number): Record<string, unknown> {
  const item = toListItem(m, nowMs);
  return {
    id: m.id,
    seed: m.seed,
    window: m.windowMode,
    openSeat: m.openSeat ?? "none",
    startWhenReady: !!m.startWhenReady,
    readyTimeoutMs: m.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
    p1: { controller: m.p1Controller, character: m.p1Character, bot: m.p1Bot },
    p2: { controller: m.p2Controller, character: m.p2Character, bot: m.p2Bot },
    status: item.status,
    expiresAt: new Date(m.expiresAtMs).toISOString(),
    hostPresent: m.hostPresent && nowMs - m.hostSeenAtMs <= STALE_HOST_MS,
    state: m.publicState,
    commandCount: m.log.length,
    watchPath: item.watchPath,
  };
}

function freshness(m: StoredMatch, nowMs: number): StoredMatch {
  if (!m.openSeat) m = { ...m, openSeat: "none" };
  if (m.startWhenReady === undefined) m = { ...m, startWhenReady: false };
  if (!m.readyTimeoutMs) m = { ...m, readyTimeoutMs: DEFAULT_READY_TIMEOUT_MS };
  if (nowMs > m.expiresAtMs) {
    return { ...m, status: m.status === "ended" ? "ended" : "stale" };
  }
  if (
    (m.status === "live" || m.status === "waiting") &&
    m.hostSeenAtMs > 0 &&
    nowMs - m.hostSeenAtMs > STALE_HOST_MS
  ) {
    return { ...m, status: "stale", hostPresent: false };
  }
  return m;
}

export class MemoryStore implements MatchStore {
  readonly matches = new Map<string, StoredMatch>();

  async create(input: CreateMatchRequest, nowMs = Date.now()): Promise<CreatedMatch> {
    const id = randomMatchId();
    const p1Code = newJoinCode();
    const p2Code = newJoinCode();
    const hostToken = newHostToken();
    const windowMode: WindowMode = isWindowMode(input.window) ? input.window : "5s";
    const openSeat: OpenSeat = parseOpenSeat(input.openSeat) ?? "none";
    const startWhenReady = parseStartWhenReady(input.startWhenReady);
    const readyTimeoutMs = clampReadyTimeoutMs(input.readyTimeoutMs);
    const record: StoredMatch = {
      id,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + clampTtl(input.ttlSeconds),
      seed: clampSeed(input.seed),
      windowMode,
      p1Bot: (input.p1Bot ?? "rusher").slice(0, 40),
      p2Bot: (input.p2Bot ?? "zoner").slice(0, 40),
      p1Character: (input.p1Character ?? "Ion").slice(0, 40),
      p2Character: (input.p2Character ?? "Quark").slice(0, 40),
      p1Controller: (input.p1Controller ?? "Lumi").slice(0, 40),
      p2Controller: (input.p2Controller ?? "GPT-6").slice(0, 40),
      openSeat,
      startWhenReady,
      readyTimeoutMs,
      p1CodeHash: await hashToken(p1Code),
      p2CodeHash: await hashToken(p2Code),
      hostTokenHash: await hashToken(hostToken),
      volunteerTokenHash: "",
      status: "waiting",
      pending: [],
      log: [],
      publicState: null,
      hostPresent: false,
      hostSeenAtMs: 0,
      nextSeq: 1,
    };
    this.matches.set(id, record);
    return { record, secrets: { p1Code, p2Code, hostToken } };
  }

  async get(id: string, nowMs = Date.now()): Promise<StoredMatch | null> {
    const m = this.matches.get(id);
    if (!m) return null;
    const fresh = freshness(m, nowMs);
    if (fresh !== m) this.matches.set(id, fresh);
    if (nowMs > fresh.expiresAtMs) return fresh;
    return fresh;
  }

  async listLive(nowMs = Date.now()): Promise<PublicMatchListItem[]> {
    const items: PublicMatchListItem[] = [];
    for (const m of this.matches.values()) {
      const fresh = freshness(m, nowMs);
      if (nowMs > fresh.expiresAtMs) continue;
      if (fresh.status === "ended") continue;
      items.push(toListItem(fresh, nowMs));
    }
    items.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    return items;
  }

  private async requireMatch(id: string, nowMs: number): Promise<StoredMatch> {
    const m = await this.get(id, nowMs);
    if (!m) throw new StoreError(404, "match not found");
    if (nowMs > m.expiresAtMs) throw new StoreError(410, "match expired");
    return m;
  }

  private async requireHost(m: StoredMatch, token: string): Promise<"host" | "volunteer"> {
    if (await tokensMatch(token, m.hostTokenHash)) {
      // Original host reclaiming clears any volunteer lease to avoid two sims.
      m.volunteerTokenHash = "";
      return "host";
    }
    if (m.volunteerTokenHash && (await tokensMatch(token, m.volunteerTokenHash))) {
      return "volunteer";
    }
    throw new StoreError(401, "invalid host token");
  }

  async submitCommand(
    id: string,
    side: "p1" | "p2",
    code: string,
    rawCommand: unknown,
    issuedAtMs: number | null,
    nowMs = Date.now(),
  ): Promise<CommandRecord> {
    const m = await this.requireMatch(id, nowMs);
    const open = seatIsOpen(m.openSeat, side);
    const hasCode = typeof code === "string" && code.length > 0;
    let authed = false;
    if (hasCode) {
      const expected = side === "p1" ? m.p1CodeHash : m.p2CodeHash;
      authed = await tokensMatch(code, expected);
    }
    // Open seats may be commanded with no code. A bad code on an open seat
    // still succeeds so we do not leak whether a hash matched.
    if (!authed && !open) {
      throw new StoreError(401, hasCode ? "invalid join code" : "join code required");
    }
    const parsed = parseCommand(rawCommand);
    if (!parsed.ok) throw new StoreError(400, parsed.error);

    // Authenticated POST keeps the original cap; unauthenticated open-seat
    // commands (including GET /cmd) are limited to 1 per second per side.
    const maxPerSec = authed ? MAX_TAUNT_COMMANDS_PER_SEC : OPEN_SEAT_COMMANDS_PER_SEC;
    const recent = m.log.filter((c) => c.side === side && nowMs - c.receivedAtMs < 1000);
    if (recent.length >= maxPerSec) {
      throw new StoreError(429, "too many commands, slow down");
    }

    const latencyMs =
      issuedAtMs !== null && Number.isFinite(issuedAtMs) && issuedAtMs > 0
        ? Math.max(0, nowMs - issuedAtMs)
        : 0;
    const record: CommandRecord = {
      seq: m.nextSeq,
      side,
      directive: parsed.ok
        ? // Store the partial as a directive-shaped object with only provided fields
          // filled; the host merges it into the current plan.
          // We stash the partial in `directive` by merging onto a sentinel that the
          // host won't use blindly — host uses `raw` and re-parses, AND we include
          // the partial fields in directive with defaults only for display.
          { stance: "zone", spacing: 88, aggression: 0.5, goFor: "none", taunt: "", ...parsed.partial }
        : { stance: "zone", spacing: 88, aggression: 0.5, goFor: "none", taunt: "" },
      raw: parsed.raw,
      issuedAtMs,
      receivedAtMs: nowMs,
      appliedTick: -1,
      latencyMs,
      controller: side === "p1" ? m.p1Controller : m.p2Controller,
    };
    // Attach the actual partial as a non-enumerable field? Simpler: host re-parses raw.
    m.nextSeq += 1;
    m.pending.push(record);
    m.log.push(record);
    this.matches.set(id, m);
    return record;
  }

  async pullPending(
    id: string,
    hostToken: string,
    sinceSeq: number,
    nowMs = Date.now(),
  ): Promise<CommandRecord[]> {
    const m = await this.requireMatch(id, nowMs);
    await this.requireHost(m, hostToken);
    m.hostPresent = true;
    m.hostSeenAtMs = nowMs;
    if (m.status === "waiting") m.status = "live";
    this.matches.set(id, m);
    return m.log.filter((c) => c.seq > sinceSeq);
  }

  async publishState(
    id: string,
    hostToken: string,
    state: MatchPublicState,
    nowMs = Date.now(),
  ): Promise<void> {
    const m = await this.requireMatch(id, nowMs);
    await this.requireHost(m, hostToken);
    m.publicState = { ...state, id: m.id, hostPresent: true, updatedAtMs: nowMs };
    m.hostPresent = true;
    m.hostSeenAtMs = nowMs;
    m.status = state.over ? "ended" : "live";
    this.matches.set(id, m);
  }

  async claimHost(id: string, hostToken: string, nowMs = Date.now()): Promise<boolean> {
    const m = await this.requireMatch(id, nowMs);
    await this.requireHost(m, hostToken);
    m.hostPresent = true;
    m.hostSeenAtMs = nowMs;
    if (m.status === "waiting") m.status = "live";
    this.matches.set(id, m);
    return true;
  }

  async volunteerHost(id: string, nowMs = Date.now()): Promise<{ token: string; record: StoredMatch }> {
    const m = await this.requireMatch(id, nowMs);
    const stale = !m.hostPresent || nowMs - m.hostSeenAtMs > STALE_HOST_MS;
    if (!stale) {
      throw new StoreError(409, "host already active");
    }
    const token = newHostToken();
    m.volunteerTokenHash = await hashToken(token);
    m.hostPresent = true;
    m.hostSeenAtMs = nowMs;
    if (m.status === "waiting" || m.status === "stale") m.status = "live";
    this.matches.set(id, m);
    return { token, record: m };
  }

  /** Seed this store with a record (used by the Supabase adapter). */
  loadRecord(record: StoredMatch): void {
    this.matches.set(record.id, record);
  }

  exportRecord(id: string): StoredMatch | undefined {
    const m = this.matches.get(id);
    return m ? structuredClone(m) : undefined;
  }

  async markApplied(
    id: string,
    hostToken: string,
    seq: number,
    tick: number,
    nowMs = Date.now(),
  ): Promise<void> {
    const m = await this.requireMatch(id, nowMs);
    await this.requireHost(m, hostToken);
    for (const c of m.log) {
      if (c.seq === seq && c.appliedTick < 0) c.appliedTick = tick;
    }
    m.pending = m.pending.filter((c) => c.seq !== seq);
    m.hostSeenAtMs = nowMs;
    this.matches.set(id, m);
  }
}

/** Process-wide memory store used by the Vite dev plugin (single process). */
let shared: MemoryStore | null = null;

export function getSharedMemoryStore(): MemoryStore {
  if (!shared) shared = new MemoryStore();
  return shared;
}

export function resetSharedMemoryStore(): MemoryStore {
  shared = new MemoryStore();
  return shared;
}
