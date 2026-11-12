import { publicView, StoreError, type MatchStore } from "./store.ts";
import { sanitizeTaunt, directiveToCompact } from "./parse.ts";
import {
  isWindowMode,
  parseOpenSeat,
  seatIsOpen,
  OPEN_SEAT_MAX_TAUNT,
  type CreateMatchRequest,
  type MatchPublicState,
} from "./types.ts";
import { clampReadyTimeoutMs, DEFAULT_READY_TIMEOUT_MS, parseStartWhenReady } from "./hostLease.ts";

type Side = "p1" | "p2";

export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "600",
};

function header(req: ApiRequest, name: string): string {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.toLowerCase() === want) return v;
  }
  return "";
}

function bearer(req: ApiRequest): string {
  const a = header(req, "authorization");
  const m = a.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? "";
}

function json(status: number, body: unknown, extra?: Record<string, string>): ApiResponse {
  return {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
    body,
  };
}

function text(status: number, body: string, extra?: Record<string, string>): ApiResponse {
  return {
    status,
    headers: {
      ...CORS,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
    body,
  };
}

function wantsText(req: ApiRequest): boolean {
  const q = req.query.format ?? "";
  if (q === "text" || q === "plain") return true;
  const accept = header(req, "accept").toLowerCase();
  return accept.includes("text/plain") && !accept.includes("application/json");
}

function readSide(v: unknown): Side | null {
  if (v === "p1" || v === "P1" || v === "1") return "p1";
  if (v === "p2" || v === "P2" || v === "2") return "p2";
  return null;
}

function bodyObject(body: unknown): Record<string, unknown> {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

/** Route a request like /api/match/:id/command onto the store. */
export async function handleApi(req: ApiRequest, store: MatchStore, nowMs = Date.now()): Promise<ApiResponse> {
  if (req.method === "OPTIONS") {
    return { status: 204, headers: { ...CORS }, body: "" };
  }

  const path = normalizePath(req.path);
  try {
    if (path === "/api/match" && req.method === "GET") {
      const items = await store.listLive(nowMs);
      return json(200, { matches: items });
    }
    if (path === "/api/match" && req.method === "POST") {
      return await handleCreate(req, store, nowMs);
    }

    const parts = path.split("/").filter(Boolean); // api, match, :id, maybe verb
    if (parts[0] !== "api" || parts[1] !== "match" || !parts[2]) {
      return json(404, { error: "not found" });
    }
    const id = decodeURIComponent(parts[2]);
    const verb = parts[3] ?? "";

    if (verb === "" && req.method === "GET") {
      const m = await store.get(id, nowMs);
      if (!m) return json(404, { error: "match not found" });
      if (nowMs > m.expiresAtMs) return json(410, { error: "match expired", ...publicView(m, nowMs) });
      return json(200, publicView(m, nowMs));
    }
    if (verb === "command" && req.method === "POST") {
      return await handleCommand(req, store, id, nowMs);
    }
    if ((verb === "cmd" || verb === "command") && req.method === "GET") {
      return await handleGetCmd(req, store, id, nowMs);
    }
    if (verb === "state" && req.method === "GET") {
      return await handleGetState(req, store, id, nowMs);
    }
    if (verb === "state" && req.method === "POST") {
      return await handlePublish(req, store, id, nowMs);
    }
    if (verb === "commands" && req.method === "GET") {
      return await handlePull(req, store, id, nowMs);
    }
    if (verb === "host" && req.method === "POST") {
      return await handleClaim(req, store, id, nowMs);
    }
    if (verb === "volunteer" && req.method === "POST") {
      return await handleVolunteer(req, store, id, nowMs);
    }
    if (verb === "applied" && req.method === "POST") {
      return await handleApplied(req, store, id, nowMs);
    }
    return json(405, { error: "method not allowed" });
  } catch (err) {
    if (err instanceof StoreError) return json(err.status, { error: err.message });
    const message = err instanceof Error ? err.message : "internal error";
    return json(500, { error: message });
  }
}

function normalizePath(p: string): string {
  let path = p || "/";
  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

async function handleCreate(req: ApiRequest, store: MatchStore, nowMs: number): Promise<ApiResponse> {
  const b = bodyObject(req.body);
  const input: CreateMatchRequest = {};
  if (b.seed !== undefined) input.seed = Number(b.seed);
  if (typeof b.window === "string" && isWindowMode(b.window)) input.window = b.window;
  if (typeof b.p1Bot === "string") input.p1Bot = b.p1Bot;
  if (typeof b.p2Bot === "string") input.p2Bot = b.p2Bot;
  if (typeof b.p1Character === "string") input.p1Character = b.p1Character;
  if (typeof b.p2Character === "string") input.p2Character = b.p2Character;
  if (typeof b.p1Controller === "string") input.p1Controller = b.p1Controller;
  if (typeof b.p2Controller === "string") input.p2Controller = b.p2Controller;
  if (b.ttlSeconds !== undefined) input.ttlSeconds = Number(b.ttlSeconds);
  const openRaw = b.openSeat ?? b.open_seat ?? b["open-seat"];
  if (openRaw !== undefined && openRaw !== null && openRaw !== "") {
    const parsed = parseOpenSeat(openRaw);
    if (!parsed) return json(400, { error: "openSeat must be none, p1, p2, or both" });
    input.openSeat = parsed;
  }
  const readyRaw = b.startWhenReady ?? b.start_when_ready ?? b["start-when-ready"] ?? b.waitForCoaches;
  if (readyRaw !== undefined && readyRaw !== null && readyRaw !== "") {
    input.startWhenReady = parseStartWhenReady(readyRaw);
  }
  const timeoutRaw = b.readyTimeoutMs ?? b.ready_timeout_ms ?? b.readyTimeoutSeconds ?? b.ready_timeout;
  if (timeoutRaw !== undefined && timeoutRaw !== null && timeoutRaw !== "") {
    const n = Number(timeoutRaw);
    // Values under 1000 are treated as seconds for the CLI-friendly form.
    input.readyTimeoutMs = clampReadyTimeoutMs(n > 0 && n < 1000 ? n * 1000 : n);
  }
  const created = await store.create(input, nowMs);
  const m = created.record;
  return json(201, {
    id: m.id,
    watchPath: `/watch.html?m=${encodeURIComponent(m.id)}`,
    relayPath: `/relay.html?m=${encodeURIComponent(m.id)}`,
    window: m.windowMode,
    openSeat: m.openSeat ?? "none",
    startWhenReady: !!m.startWhenReady,
    readyTimeoutMs: m.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
    seed: m.seed,
    expiresAt: new Date(m.expiresAtMs).toISOString(),
    p1: { controller: m.p1Controller, character: m.p1Character, bot: m.p1Bot },
    p2: { controller: m.p2Controller, character: m.p2Character, bot: m.p2Bot },
    // Secrets only on this one response.
    secrets: created.secrets,
  });
}

async function handleCommand(
  req: ApiRequest, store: MatchStore, id: string, nowMs: number,
): Promise<ApiResponse> {
  const b = bodyObject(req.body);
  const side = readSide(b.fighter ?? b.side ?? req.query.fighter);
  if (!side) return json(400, { error: "fighter must be p1 or p2" });
  const code =
    (typeof b.joinCode === "string" ? b.joinCode : "") ||
    (typeof b.code === "string" ? b.code : "") ||
    bearer(req);
  const raw = b.text ?? b.command ?? b;
  const issued = typeof b.issuedAtMs === "number" ? b.issuedAtMs : null;
  const rec = await store.submitCommand(id, side, code, raw, issued, nowMs);
  return json(200, {
    ok: true,
    seq: rec.seq,
    fighter: rec.side,
    appliedTick: rec.appliedTick,
    receivedAtMs: rec.receivedAtMs,
    latencyMs: rec.latencyMs,
    controller: rec.controller,
    directive: rec.directive,
  });
}

async function handleGetState(
  req: ApiRequest, store: MatchStore, id: string, nowMs: number,
): Promise<ApiResponse> {
  const m = await store.get(id, nowMs);
  if (!m) return json(404, { error: "match not found" });
  if (nowMs > m.expiresAtMs && !m.publicState) return json(410, { error: "match expired" });
  const state = m.publicState;
  const openSeat = m.openSeat ?? "none";
  const summary = state?.summary ?? (
    `MATCH ${m.id}  host=${m.hostPresent ? "yes" : "waiting"}` +
    (openSeat !== "none" ? `  openSeat=${openSeat}` : "") +
    "  no state yet"
  );
  if (wantsText(req)) return text(200, summary);
  return json(200, {
    id: m.id,
    status: publicView(m, nowMs).status,
    hostPresent: m.hostPresent && nowMs - m.hostSeenAtMs <= 15_000,
    window: m.windowMode,
    openSeat,
    startWhenReady: !!m.startWhenReady,
    readyTimeoutMs: m.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
    seed: m.seed,
    p1: { controller: m.p1Controller, character: m.p1Character, bot: m.p1Bot },
    p2: { controller: m.p2Controller, character: m.p2Character, bot: m.p2Bot },
    state,
    summary,
    commandCount: m.log.length,
    latest: {
      p1: lastOf(m.log, "p1"),
      p2: lastOf(m.log, "p2"),
    },
  });
}

function lastOf(log: { side: Side; seq: number; latencyMs: number; raw: string; appliedTick: number; receivedAtMs: number }[], side: Side) {
  for (let i = log.length - 1; i >= 0; i--) {
    const c = log[i];
    if (c && c.side === side) {
      return {
        seq: c.seq,
        latencyMs: c.latencyMs,
        raw: c.raw,
        appliedTick: c.appliedTick,
        receivedAtMs: c.receivedAtMs,
      };
    }
  }
  return null;
}

async function handlePublish(
  req: ApiRequest, store: MatchStore, id: string, nowMs: number,
): Promise<ApiResponse> {
  const b = bodyObject(req.body);
  const token = (typeof b.hostToken === "string" ? b.hostToken : "") || bearer(req);
  if (!token) return json(401, { error: "host token required" });
  const state = b.state ?? b;
  if (!state || typeof state !== "object") return json(400, { error: "state required" });
  await store.publishState(id, token, state as MatchPublicState, nowMs);
  return json(200, { ok: true });
}

async function handlePull(
  req: ApiRequest, store: MatchStore, id: string, nowMs: number,
): Promise<ApiResponse> {
  const token = bearer(req) || req.query.hostToken || "";
  if (!token) return json(401, { error: "host token required" });
  // Prefer header; query is a last resort for simple tools (not join codes).
  const since = Number(req.query.since ?? 0);
  const cmds = await store.pullPending(id, token, Number.isFinite(since) ? since : 0, nowMs);
  return json(200, { commands: cmds });
}

async function handleClaim(
  req: ApiRequest, store: MatchStore, id: string, nowMs: number,
): Promise<ApiResponse> {
  const b = bodyObject(req.body);
  const token = (typeof b.hostToken === "string" ? b.hostToken : "") || bearer(req);
  if (!token) return json(401, { error: "host token required" });
  await store.claimHost(id, token, nowMs);
  const m = await store.get(id, nowMs);
  if (!m) return json(404, { error: "match not found" });
  return json(200, {
    ok: true,
    id: m.id,
    seed: m.seed,
    window: m.windowMode,
    openSeat: m.openSeat ?? "none",
    startWhenReady: !!m.startWhenReady,
    readyTimeoutMs: m.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
    p1: { controller: m.p1Controller, character: m.p1Character, bot: m.p1Bot },
    p2: { controller: m.p2Controller, character: m.p2Character, bot: m.p2Bot },
  });
}

async function handleApplied(
  req: ApiRequest, store: MatchStore, id: string, nowMs: number,
): Promise<ApiResponse> {
  const b = bodyObject(req.body);
  const token = (typeof b.hostToken === "string" ? b.hostToken : "") || bearer(req);
  if (!token) return json(401, { error: "host token required" });
  const seq = Number(b.seq);
  const tick = Number(b.tick);
  if (!Number.isFinite(seq) || !Number.isFinite(tick)) return json(400, { error: "seq and tick required" });
  await store.markApplied(id, token, seq, tick, nowMs);
  return json(200, { ok: true });
}


async function handleVolunteer(
  _req: ApiRequest, store: MatchStore, id: string, nowMs: number,
): Promise<ApiResponse> {
  const result = await store.volunteerHost(id, nowMs);
  const m = result.record;
  return json(200, {
    ok: true,
    id: m.id,
    seed: m.seed,
    window: m.windowMode,
    openSeat: m.openSeat ?? "none",
    startWhenReady: !!m.startWhenReady,
    readyTimeoutMs: m.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
    volunteer: true,
    // Lease shown once to this caller; it is a short-lived host token, not a join code.
    volunteerToken: result.token,
    p1: { controller: m.p1Controller, character: m.p1Character, bot: m.p1Bot },
    p2: { controller: m.p2Controller, character: m.p2Character, bot: m.p2Bot },
  });
}


function cmdQueryInput(query: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...query };
  if (out.go && !out.goFor && !out.gofor && !out.go_for) out.goFor = out.go;
  if (out.taunt !== undefined) out.taunt = sanitizeTaunt(out.taunt, OPEN_SEAT_MAX_TAUNT);
  return out;
}

function stateSummary(m: { id: string; hostPresent: boolean; openSeat?: string; publicState: MatchPublicState | null }): string {
  if (m.publicState?.summary) return m.publicState.summary;
  const open = m.openSeat && m.openSeat !== "none" ? `  openSeat=${m.openSeat}` : "";
  return `MATCH ${m.id}  host=${m.hostPresent ? "yes" : "waiting"}${open}  no state yet`;
}

/**
 * GET /api/match/:id/cmd?fighter=p2&stance=rush&...
 * Open seats only. One GET both submits a plan and returns a compact state
 * summary, so an LLM that can only issue GET requests can command a fighter.
 * Never accepts a join code in the query string.
 */
async function handleGetCmd(
  req: ApiRequest, store: MatchStore, id: string, nowMs: number,
): Promise<ApiResponse> {
  const side = readSide(req.query.fighter ?? req.query.side);
  if (!side) return text(400, "error: fighter must be p1 or p2");
  try {
    const m0 = await store.get(id, nowMs);
    if (!m0) return text(404, "error: match not found");
    if (nowMs > m0.expiresAtMs) return text(410, "error: match expired");
    if (!seatIsOpen(m0.openSeat, side)) {
      return text(403, `error: ${side} is not an open seat`);
    }
    const input = cmdQueryInput(req.query);
    const rec = await store.submitCommand(id, side, "", input, null, nowMs);
    const fresh = await store.get(id, nowMs);
    const summary = fresh ? stateSummary(fresh) : `MATCH ${id}  no state yet`;
    const ack =
      `OK seq=${rec.seq} fighter=${rec.side} appliedTick=${rec.appliedTick} ` +
      `receivedAtMs=${rec.receivedAtMs} ${directiveToCompact(rec.directive)}`;
    return text(200, `${ack}\n${summary}`);
  } catch (err) {
    if (err instanceof StoreError) {
      const fresh = await store.get(id, nowMs);
      const summary = fresh ? stateSummary(fresh) : "";
      return text(err.status, `error: ${err.message}` + (summary ? `\n${summary}` : ""));
    }
    throw err;
  }
}
