// src/commander/codes.ts
function toHex(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}
function toBase64Url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomToken(byteLength = 18) {
  const arr = new Uint8Array(byteLength);
  crypto.getRandomValues(arr);
  return toBase64Url(arr);
}
function randomMatchId() {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return "m_" + toBase64Url(arr);
}
async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
async function tokensMatch(token, hash) {
  if (!token || !hash) return false;
  const h = await hashToken(token);
  return timingSafeEqualHex(h, hash);
}
function newJoinCode() {
  return randomToken(18);
}
function newHostToken() {
  return randomToken(24);
}

// src/commander/types.ts
var STANCES = ["rush", "zone", "turtle", "bait", "anti-air"];
var GO_FORS = ["none", "special", "light", "heavy", "combo"];
var WINDOW_MODES = ["off", "3s", "5s"];
function isStance(v) {
  return typeof v === "string" && STANCES.includes(v);
}
function isGoFor(v) {
  return typeof v === "string" && GO_FORS.includes(v);
}
function isWindowMode(v) {
  return typeof v === "string" && WINDOW_MODES.includes(v);
}
var MIN_SPACING = 24;
var MAX_SPACING = 400;
var MAX_TAUNT = 80;
var STANCE_DEFAULTS = {
  rush: { spacing: 48, aggression: 0.8 },
  zone: { spacing: 88, aggression: 0.55 },
  turtle: { spacing: 44, aggression: 0.35 },
  bait: { spacing: 72, aggression: 0.55 },
  "anti-air": { spacing: 56, aggression: 0.6 }
};
var DEFAULT_DIRECTIVE = {
  stance: "zone",
  spacing: STANCE_DEFAULTS.zone.spacing,
  aggression: STANCE_DEFAULTS.zone.aggression,
  goFor: "none",
  taunt: ""
};

// src/commander/parse.ts
var STANCE_SET = new Set(STANCES);
var GOFOR_SET = new Set(GO_FORS);
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function sanitizeTaunt(raw) {
  if (typeof raw !== "string") return "";
  let s = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/[<>]/g, "");
  if (s.length > MAX_TAUNT) s = s.slice(0, MAX_TAUNT).trim();
  return s;
}
function clampSpacing(n) {
  if (!Number.isFinite(n)) return DEFAULT_DIRECTIVE.spacing;
  return Math.round(clamp(n, MIN_SPACING, MAX_SPACING));
}
function clampAggression(n) {
  if (!Number.isFinite(n)) return DEFAULT_DIRECTIVE.aggression;
  return Math.round(clamp(n, 0, 1) * 1e3) / 1e3;
}
function normalizeKey(k) {
  return k.trim().toLowerCase().replace(/[\s_-]+/g, "");
}
function normalizeStance(v) {
  const s = v.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (s === "antiair" || s === "anti-air" || s === "aa") return "anti-air";
  if (s === "zoning" || s === "zoner") return "zone";
  if (s === "rusher" || s === "press" || s === "pressure") return "rush";
  if (s === "turtling" || s === "turtler" || s === "block") return "turtle";
  if (s === "whiff" || s === "whiff-punish" || s === "whiffpunish") return "bait";
  return isStance(s) ? s : null;
}
function normalizeGoFor(v) {
  const s = v.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (s === "spec" || s === "sp" || s === "burst") return "special";
  if (s === "lp" || s === "jab") return "light";
  if (s === "hp" || s === "smash") return "heavy";
  if (s === "cb" || s === "string") return "combo";
  if (s === "nothing" || s === "clear" || s === "stop") return "none";
  return GOFOR_SET.has(s) ? s : null;
}
function parseNumber(v) {
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}
function applyPair(partial, key, value, warnings) {
  const k = normalizeKey(key);
  if (k === "stance" || k === "plan") {
    const st = normalizeStance(value);
    if (!st) {
      warnings.push(`unknown stance "${value}"`);
      return false;
    }
    partial.stance = st;
    return true;
  }
  if (k === "spacing" || k === "space" || k === "range" || k === "distance") {
    const n = parseNumber(value);
    if (n === null) {
      warnings.push(`bad spacing "${value}"`);
      return false;
    }
    partial.spacing = clampSpacing(n);
    return true;
  }
  if (k === "aggression" || k === "aggro" || k === "agr") {
    const n = parseNumber(value);
    if (n === null) {
      warnings.push(`bad aggression "${value}"`);
      return false;
    }
    partial.aggression = clampAggression(n);
    return true;
  }
  if (k === "gofor" || k === "go" || k === "next" || k === "special") {
    const g = normalizeGoFor(k === "special" && !value ? "special" : value);
    if (!g || !isGoFor(g)) {
      warnings.push(`bad goFor "${value}"`);
      return false;
    }
    partial.goFor = g;
    return true;
  }
  if (k === "taunt" || k === "callout" || k === "say") {
    partial.taunt = sanitizeTaunt(value);
    return true;
  }
  return false;
}
function parseJsonObject(obj, raw) {
  const partial = {};
  const warnings = [];
  let any = false;
  for (const [key, value] of Object.entries(obj)) {
    const k = normalizeKey(key);
    if (value === void 0 || value === null) continue;
    if (k === "stance" || k === "plan") {
      const st = normalizeStance(String(value));
      if (!st) return { ok: false, error: `unknown stance "${String(value)}"`, raw };
      partial.stance = st;
      any = true;
    } else if (k === "spacing" || k === "space" || k === "range" || k === "distance") {
      const n = typeof value === "number" ? value : parseNumber(String(value));
      if (n === null) return { ok: false, error: `bad spacing "${String(value)}"`, raw };
      partial.spacing = clampSpacing(n);
      any = true;
    } else if (k === "aggression" || k === "aggro" || k === "agr") {
      const n = typeof value === "number" ? value : parseNumber(String(value));
      if (n === null) return { ok: false, error: `bad aggression "${String(value)}"`, raw };
      partial.aggression = clampAggression(n);
      any = true;
    } else if (k === "gofor" || k === "go" || k === "next") {
      const g = normalizeGoFor(String(value));
      if (!g || !isGoFor(g)) return { ok: false, error: `bad goFor "${String(value)}"`, raw };
      partial.goFor = g;
      any = true;
    } else if (k === "taunt" || k === "callout" || k === "say") {
      partial.taunt = sanitizeTaunt(String(value));
      any = true;
    } else if (k === "fighter" || k === "side" || k === "issuedatms" || k === "command") {
    } else {
      warnings.push(`ignored field "${key}"`);
    }
  }
  if (!any) return { ok: false, error: "no command fields found", raw };
  return { ok: true, partial, raw, warnings };
}
function parseLineOriented(text2) {
  const partial = {};
  const warnings = [];
  let any = false;
  const lines = text2.split(/\r?\n/);
  for (const line0 of lines) {
    const line = line0.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*(?:[:=]\s*|\s+)(.*)$/);
    if (m && m[1]) {
      const value = (m[2] ?? "").trim();
      if (applyPair(partial, m[1], value, warnings) || normalizeKey(m[1]) === "taunt") {
        if (normalizeKey(m[1]) === "taunt") partial.taunt = sanitizeTaunt(value);
        any = true;
        continue;
      }
    }
    const bare = normalizeStance(line);
    if (bare && STANCE_SET.has(bare)) {
      partial.stance = bare;
      any = true;
      continue;
    }
    const go = normalizeGoFor(line);
    if (go && isGoFor(go) && line.toLowerCase() !== "none") {
      partial.goFor = go;
      any = true;
      continue;
    }
    warnings.push(`skipped line "${line}"`);
  }
  if (!any) return { ok: false, error: "no command fields found", raw: text2 };
  return { ok: true, partial, raw: text2, warnings };
}
function parseCompact(text2) {
  const partial = {};
  const warnings = [];
  let any = false;
  const tauntSplit = text2.match(/^(.*?)(?:\btaunt\s*[:=]\s*)(.*)$/i);
  let rest = text2;
  if (tauntSplit) {
    rest = tauntSplit[1] ?? text2;
    partial.taunt = sanitizeTaunt(tauntSplit[2] ?? "");
    any = true;
  }
  const tokenRe = /([A-Za-z][A-Za-z0-9_-]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s]+)/g;
  let m;
  while ((m = tokenRe.exec(rest)) !== null) {
    const key = m[1] ?? "";
    let value = m[2] ?? "";
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (applyPair(partial, key, value, warnings)) {
      any = true;
    }
  }
  const stripped = rest.replace(tokenRe, " ");
  for (const word of stripped.split(/\s+/).filter(Boolean)) {
    const st = normalizeStance(word);
    if (st) {
      partial.stance = st;
      any = true;
      continue;
    }
    const go = normalizeGoFor(word);
    if (go && isGoFor(go) && word.toLowerCase() !== "none") {
      partial.goFor = go;
      any = true;
    }
  }
  if (!any) return { ok: false, error: "no command fields found", raw: text2 };
  return { ok: true, partial, raw: text2, warnings };
}
function parseCommand(input) {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const obj = input;
    if (obj.command !== void 0 && typeof obj.command === "object" && obj.command !== null) {
      return parseCommand(obj.command);
    }
    if (typeof obj.command === "string" || typeof obj.text === "string") {
      return parseCommand(String(obj.command ?? obj.text));
    }
    return parseJsonObject(obj, JSON.stringify(input));
  }
  if (typeof input !== "string") {
    return { ok: false, error: "command must be text or JSON", raw: String(input) };
  }
  const text2 = input.trim();
  if (!text2) return { ok: false, error: "empty command", raw: input };
  const jsonSlice = extractJsonObject(text2);
  if (jsonSlice) {
    try {
      const v = JSON.parse(jsonSlice);
      if (v !== null && typeof v === "object") {
        const r = parseCommand(v);
        if (r.ok) return { ...r, raw: text2 };
      }
    } catch {
    }
  }
  if (text2.startsWith("{")) {
    try {
      const v = JSON.parse(text2);
      return parseCommand(v);
    } catch {
    }
  }
  if (/\r?\n/.test(text2) || /^(STANCE|SPACING|AGGRESSION|AGGRO|GOFOR|GO|TAUNT|CALLOUT|PLAN)\b/im.test(text2)) {
    const r = parseLineOriented(text2);
    if (r.ok) return r;
    const block = extractCommandBlock(text2);
    if (block && block !== text2) {
      const r2 = parseLineOriented(block);
      if (r2.ok) return { ...r2, raw: text2 };
    }
    const compact2 = parseCompact(text2);
    if (compact2.ok) return compact2;
    return r;
  }
  const compact = parseCompact(text2);
  if (compact.ok) return compact;
  const lines = parseLineOriented(text2);
  if (lines.ok) return lines;
  return { ok: false, error: "could not parse command", raw: text2 };
}
function extractJsonObject(text2) {
  const start = text2.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text2.length; i++) {
    const c = text2[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return text2.slice(start, i + 1);
    }
  }
  return null;
}
function extractCommandBlock(text2) {
  const lines = text2.split(/\r?\n/);
  const kept = [];
  const key = /^(STANCE|SPACING|AGGRESSION|AGGRO|AGR|GOFOR|GO-FOR|GO|TAUNT|CALLOUT|PLAN|RANGE|DISTANCE|NEXT)\b/i;
  for (const line of lines) {
    const t = line.trim().replace(/^[-*`>\s]+/, "").replace(/[`]/g, "");
    if (key.test(t) || normalizeStance(t) && t.split(/\s+/).length === 1) {
      kept.push(t);
    }
  }
  return kept.length ? kept.join("\n") : null;
}

// src/commander/store.ts
var DEFAULT_TTL_MS = 2 * 60 * 60 * 1e3;
var MAX_TTL_MS = 24 * 60 * 60 * 1e3;
var STALE_HOST_MS = 15e3;
var MAX_TAUNT_COMMANDS_PER_SEC = 8;
var StoreError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "StoreError";
  }
  status;
};
function clampSeed(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return Math.floor(Math.random() * 1e9);
  return Math.floor(n) | 0;
}
function clampTtl(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return DEFAULT_TTL_MS;
  return Math.max(6e4, Math.min(MAX_TTL_MS, Math.floor(seconds * 1e3)));
}
function toListItem(m, nowMs) {
  let status = m.status;
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
    watchPath: `/watch.html?m=${encodeURIComponent(m.id)}`,
    updatedAtMs: m.publicState?.updatedAtMs ?? m.createdAtMs
  };
}
function publicView(m, nowMs) {
  const item = toListItem(m, nowMs);
  return {
    id: m.id,
    seed: m.seed,
    window: m.windowMode,
    p1: { controller: m.p1Controller, character: m.p1Character, bot: m.p1Bot },
    p2: { controller: m.p2Controller, character: m.p2Character, bot: m.p2Bot },
    status: item.status,
    expiresAt: new Date(m.expiresAtMs).toISOString(),
    hostPresent: m.hostPresent && nowMs - m.hostSeenAtMs <= STALE_HOST_MS,
    state: m.publicState,
    commandCount: m.log.length,
    watchPath: item.watchPath
  };
}
function freshness(m, nowMs) {
  if (nowMs > m.expiresAtMs) {
    return { ...m, status: m.status === "ended" ? "ended" : "stale" };
  }
  if ((m.status === "live" || m.status === "waiting") && m.hostSeenAtMs > 0 && nowMs - m.hostSeenAtMs > STALE_HOST_MS) {
    return { ...m, status: "stale", hostPresent: false };
  }
  return m;
}
var MemoryStore = class {
  matches = /* @__PURE__ */ new Map();
  async create(input, nowMs = Date.now()) {
    const id = randomMatchId();
    const p1Code = newJoinCode();
    const p2Code = newJoinCode();
    const hostToken = newHostToken();
    const windowMode = isWindowMode(input.window) ? input.window : "5s";
    const record = {
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
      p1CodeHash: await hashToken(p1Code),
      p2CodeHash: await hashToken(p2Code),
      hostTokenHash: await hashToken(hostToken),
      status: "waiting",
      pending: [],
      log: [],
      publicState: null,
      hostPresent: false,
      hostSeenAtMs: 0,
      nextSeq: 1
    };
    this.matches.set(id, record);
    return { record, secrets: { p1Code, p2Code, hostToken } };
  }
  async get(id, nowMs = Date.now()) {
    const m = this.matches.get(id);
    if (!m) return null;
    const fresh = freshness(m, nowMs);
    if (fresh !== m) this.matches.set(id, fresh);
    if (nowMs > fresh.expiresAtMs) return fresh;
    return fresh;
  }
  async listLive(nowMs = Date.now()) {
    const items = [];
    for (const m of this.matches.values()) {
      const fresh = freshness(m, nowMs);
      if (nowMs > fresh.expiresAtMs) continue;
      if (fresh.status === "ended") continue;
      items.push(toListItem(fresh, nowMs));
    }
    items.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    return items;
  }
  async requireMatch(id, nowMs) {
    const m = await this.get(id, nowMs);
    if (!m) throw new StoreError(404, "match not found");
    if (nowMs > m.expiresAtMs) throw new StoreError(410, "match expired");
    return m;
  }
  async requireHost(m, token) {
    if (!await tokensMatch(token, m.hostTokenHash)) {
      throw new StoreError(401, "invalid host token");
    }
  }
  async submitCommand(id, side, code, rawCommand, issuedAtMs, nowMs = Date.now()) {
    const m = await this.requireMatch(id, nowMs);
    const expected = side === "p1" ? m.p1CodeHash : m.p2CodeHash;
    if (!await tokensMatch(code, expected)) {
      throw new StoreError(401, "invalid join code");
    }
    const parsed = parseCommand(rawCommand);
    if (!parsed.ok) throw new StoreError(400, parsed.error);
    const recent = m.log.filter((c) => c.side === side && nowMs - c.receivedAtMs < 1e3);
    if (recent.length >= MAX_TAUNT_COMMANDS_PER_SEC) {
      throw new StoreError(429, "too many commands, slow down");
    }
    const latencyMs = issuedAtMs !== null && Number.isFinite(issuedAtMs) && issuedAtMs > 0 ? Math.max(0, nowMs - issuedAtMs) : 0;
    const record = {
      seq: m.nextSeq,
      side,
      directive: parsed.ok ? (
        // Store the partial as a directive-shaped object with only provided fields
        // filled; the host merges it into the current plan.
        // We stash the partial in `directive` by merging onto a sentinel that the
        // host won't use blindly — host uses `raw` and re-parses, AND we include
        // the partial fields in directive with defaults only for display.
        { stance: "zone", spacing: 88, aggression: 0.5, goFor: "none", taunt: "", ...parsed.partial }
      ) : { stance: "zone", spacing: 88, aggression: 0.5, goFor: "none", taunt: "" },
      raw: parsed.raw,
      issuedAtMs,
      receivedAtMs: nowMs,
      appliedTick: -1,
      latencyMs,
      controller: side === "p1" ? m.p1Controller : m.p2Controller
    };
    m.nextSeq += 1;
    m.pending.push(record);
    m.log.push(record);
    this.matches.set(id, m);
    return record;
  }
  async pullPending(id, hostToken, sinceSeq, nowMs = Date.now()) {
    const m = await this.requireMatch(id, nowMs);
    await this.requireHost(m, hostToken);
    m.hostPresent = true;
    m.hostSeenAtMs = nowMs;
    if (m.status === "waiting") m.status = "live";
    this.matches.set(id, m);
    return m.log.filter((c) => c.seq > sinceSeq);
  }
  async publishState(id, hostToken, state, nowMs = Date.now()) {
    const m = await this.requireMatch(id, nowMs);
    await this.requireHost(m, hostToken);
    m.publicState = { ...state, id: m.id, hostPresent: true, updatedAtMs: nowMs };
    m.hostPresent = true;
    m.hostSeenAtMs = nowMs;
    m.status = state.over ? "ended" : "live";
    this.matches.set(id, m);
  }
  async claimHost(id, hostToken, nowMs = Date.now()) {
    const m = await this.requireMatch(id, nowMs);
    await this.requireHost(m, hostToken);
    m.hostPresent = true;
    m.hostSeenAtMs = nowMs;
    if (m.status === "waiting") m.status = "live";
    this.matches.set(id, m);
    return true;
  }
  async markApplied(id, hostToken, seq, tick, nowMs = Date.now()) {
    const m = await this.requireMatch(id, nowMs);
    await this.requireHost(m, hostToken);
    for (const c of m.log) {
      if (c.seq === seq && c.appliedTick < 0) c.appliedTick = tick;
    }
    m.pending = m.pending.filter((c) => c.seq !== seq);
    m.hostSeenAtMs = nowMs;
    this.matches.set(id, m);
  }
};
var shared = null;
function getSharedMemoryStore() {
  if (!shared) shared = new MemoryStore();
  return shared;
}

// src/commander/http.ts
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "600"
};
function header(req, name) {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.toLowerCase() === want) return v;
  }
  return "";
}
function bearer(req) {
  const a = header(req, "authorization");
  const m = a.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ?? "";
}
function json(status, body, extra) {
  return {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra
    },
    body
  };
}
function text(status, body, extra) {
  return {
    status,
    headers: {
      ...CORS,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra
    },
    body
  };
}
function wantsText(req) {
  const q = req.query.format ?? "";
  if (q === "text" || q === "plain") return true;
  const accept = header(req, "accept").toLowerCase();
  return accept.includes("text/plain") && !accept.includes("application/json");
}
function readSide(v) {
  if (v === "p1" || v === "P1" || v === "1") return "p1";
  if (v === "p2" || v === "P2" || v === "2") return "p2";
  return null;
}
function bodyObject(body) {
  if (body !== null && typeof body === "object" && !Array.isArray(body)) {
    return body;
  }
  return {};
}
async function handleApi(req, store, nowMs = Date.now()) {
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
    const parts = path.split("/").filter(Boolean);
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
function normalizePath(p) {
  let path = p || "/";
  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}
async function handleCreate(req, store, nowMs) {
  const b = bodyObject(req.body);
  const input = {};
  if (b.seed !== void 0) input.seed = Number(b.seed);
  if (typeof b.window === "string" && isWindowMode(b.window)) input.window = b.window;
  if (typeof b.p1Bot === "string") input.p1Bot = b.p1Bot;
  if (typeof b.p2Bot === "string") input.p2Bot = b.p2Bot;
  if (typeof b.p1Character === "string") input.p1Character = b.p1Character;
  if (typeof b.p2Character === "string") input.p2Character = b.p2Character;
  if (typeof b.p1Controller === "string") input.p1Controller = b.p1Controller;
  if (typeof b.p2Controller === "string") input.p2Controller = b.p2Controller;
  if (b.ttlSeconds !== void 0) input.ttlSeconds = Number(b.ttlSeconds);
  const created = await store.create(input, nowMs);
  const m = created.record;
  return json(201, {
    id: m.id,
    watchPath: `/watch.html?m=${encodeURIComponent(m.id)}`,
    relayPath: `/relay.html?m=${encodeURIComponent(m.id)}`,
    window: m.windowMode,
    seed: m.seed,
    expiresAt: new Date(m.expiresAtMs).toISOString(),
    p1: { controller: m.p1Controller, character: m.p1Character, bot: m.p1Bot },
    p2: { controller: m.p2Controller, character: m.p2Character, bot: m.p2Bot },
    // Secrets only on this one response.
    secrets: created.secrets
  });
}
async function handleCommand(req, store, id, nowMs) {
  const b = bodyObject(req.body);
  const side = readSide(b.fighter ?? b.side ?? req.query.fighter);
  if (!side) return json(400, { error: "fighter must be p1 or p2" });
  const code = (typeof b.joinCode === "string" ? b.joinCode : "") || (typeof b.code === "string" ? b.code : "") || bearer(req);
  if (!code) return json(401, { error: "join code required" });
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
    directive: rec.directive
  });
}
async function handleGetState(req, store, id, nowMs) {
  const m = await store.get(id, nowMs);
  if (!m) return json(404, { error: "match not found" });
  if (nowMs > m.expiresAtMs && !m.publicState) return json(410, { error: "match expired" });
  const state = m.publicState;
  const summary = state?.summary ?? `MATCH ${m.id}  host=${m.hostPresent ? "yes" : "waiting"}  no state yet`;
  if (wantsText(req)) return text(200, summary);
  return json(200, {
    id: m.id,
    status: publicView(m, nowMs).status,
    hostPresent: m.hostPresent && nowMs - m.hostSeenAtMs <= 15e3,
    window: m.windowMode,
    seed: m.seed,
    p1: { controller: m.p1Controller, character: m.p1Character, bot: m.p1Bot },
    p2: { controller: m.p2Controller, character: m.p2Character, bot: m.p2Bot },
    state,
    summary,
    commandCount: m.log.length,
    latest: {
      p1: lastOf(m.log, "p1"),
      p2: lastOf(m.log, "p2")
    }
  });
}
function lastOf(log, side) {
  for (let i = log.length - 1; i >= 0; i--) {
    const c = log[i];
    if (c && c.side === side) {
      return {
        seq: c.seq,
        latencyMs: c.latencyMs,
        raw: c.raw,
        appliedTick: c.appliedTick,
        receivedAtMs: c.receivedAtMs
      };
    }
  }
  return null;
}
async function handlePublish(req, store, id, nowMs) {
  const b = bodyObject(req.body);
  const token = (typeof b.hostToken === "string" ? b.hostToken : "") || bearer(req);
  if (!token) return json(401, { error: "host token required" });
  const state = b.state ?? b;
  if (!state || typeof state !== "object") return json(400, { error: "state required" });
  await store.publishState(id, token, state, nowMs);
  return json(200, { ok: true });
}
async function handlePull(req, store, id, nowMs) {
  const token = bearer(req) || req.query.hostToken || "";
  if (!token) return json(401, { error: "host token required" });
  const since = Number(req.query.since ?? 0);
  const cmds = await store.pullPending(id, token, Number.isFinite(since) ? since : 0, nowMs);
  return json(200, { commands: cmds });
}
async function handleClaim(req, store, id, nowMs) {
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
    p1: { controller: m.p1Controller, character: m.p1Character, bot: m.p1Bot },
    p2: { controller: m.p2Controller, character: m.p2Character, bot: m.p2Bot }
  });
}
async function handleApplied(req, store, id, nowMs) {
  const b = bodyObject(req.body);
  const token = (typeof b.hostToken === "string" ? b.hostToken : "") || bearer(req);
  if (!token) return json(401, { error: "host token required" });
  const seq = Number(b.seq);
  const tick = Number(b.tick);
  if (!Number.isFinite(seq) || !Number.isFinite(tick)) return json(400, { error: "seq and tick required" });
  await store.markApplied(id, token, seq, tick, nowMs);
  return json(200, { ok: true });
}

// src/commander/supabaseStore.ts
function env(name) {
  const g = globalThis;
  return g.process?.env?.[name] ?? "";
}
function createSupabaseStore() {
  const url = env("SUPABASE_URL").replace(/\/$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_ANON_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and a Supabase key are required for the supabase store");
  }
  return new SupabaseRestStore(url, key);
}
var SupabaseRestStore = class extends MemoryStore {
  url;
  key;
  loaded = false;
  loadPromise = null;
  constructor(url, key) {
    super();
    this.url = url;
    this.key = key;
  }
  headers() {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      "Accept-Profile": "public",
      "Content-Profile": "public"
    };
  }
  async ensureLoaded() {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.refresh();
    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }
  async refresh() {
    const res = await fetch(
      `${this.url}/rest/v1/afc_matches?select=id,payload&expires_at=gte.${encodeURIComponent((/* @__PURE__ */ new Date()).toISOString())}`,
      { headers: this.headers() }
    );
    if (!res.ok) {
      const text2 = await res.text();
      throw new Error(`supabase list failed (${res.status}): ${text2.slice(0, 200)}`);
    }
    const rows = await res.json();
    this.matches.clear();
    for (const row of rows) {
      if (row && row.payload && typeof row.payload === "object") {
        this.matches.set(row.id, row.payload);
      }
    }
    this.loaded = true;
  }
  async persist(id) {
    const record = this.matches.get(id);
    if (!record) return;
    const res = await fetch(`${this.url}/rest/v1/afc_matches?id=eq.${encodeURIComponent(id)}`, {
      method: "POST",
      headers: {
        ...this.headers(),
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        id,
        payload: record,
        status: record.status,
        expires_at: new Date(record.expiresAtMs).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      })
    });
    if (!res.ok) {
      if (res.status === 409 || res.status === 405 || res.status === 400) {
        const patch = await fetch(`${this.url}/rest/v1/afc_matches?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: this.headers(),
          body: JSON.stringify({
            payload: record,
            status: record.status,
            expires_at: new Date(record.expiresAtMs).toISOString(),
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          })
        });
        if (patch.ok) return;
        if (patch.status === 404 || patch.status === 406) {
          const ins = await fetch(`${this.url}/rest/v1/afc_matches`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({
              id,
              payload: record,
              status: record.status,
              expires_at: new Date(record.expiresAtMs).toISOString(),
              updated_at: (/* @__PURE__ */ new Date()).toISOString()
            })
          });
          if (!ins.ok) {
            const t3 = await ins.text();
            throw new Error(`supabase insert failed (${ins.status}): ${t3.slice(0, 200)}`);
          }
          return;
        }
        const t2 = await patch.text();
        throw new Error(`supabase patch failed (${patch.status}): ${t2.slice(0, 200)}`);
      }
      const t = await res.text();
      throw new Error(`supabase upsert failed (${res.status}): ${t.slice(0, 200)}`);
    }
  }
  async create(input, nowMs) {
    await this.ensureLoaded();
    const created = await super.create(input, nowMs);
    await this.persist(created.record.id);
    return created;
  }
  async get(id, nowMs) {
    await this.ensureLoaded();
    return super.get(id, nowMs);
  }
  async listLive(nowMs) {
    await this.ensureLoaded();
    return super.listLive(nowMs);
  }
  async submitCommand(id, side, code, raw, issued, nowMs) {
    await this.ensureLoaded();
    const rec = await super.submitCommand(id, side, code, raw, issued, nowMs);
    await this.persist(id);
    return rec;
  }
  async pullPending(id, hostToken, sinceSeq, nowMs) {
    await this.ensureLoaded();
    const rec = await super.pullPending(id, hostToken, sinceSeq, nowMs);
    await this.persist(id);
    return rec;
  }
  async publishState(id, hostToken, state, nowMs) {
    await this.ensureLoaded();
    await super.publishState(id, hostToken, state, nowMs);
    await this.persist(id);
  }
  async claimHost(id, hostToken, nowMs) {
    await this.ensureLoaded();
    const ok = await super.claimHost(id, hostToken, nowMs);
    await this.persist(id);
    return ok;
  }
  async markApplied(id, hostToken, seq, tick, nowMs) {
    await this.ensureLoaded();
    await super.markApplied(id, hostToken, seq, tick, nowMs);
    await this.persist(id);
  }
};

// src/commander/blobStore.ts
function env2(name) {
  const g = globalThis;
  return g.process?.env?.[name] ?? "";
}
function createBlobStore() {
  const token = env2("BLOB_READ_WRITE_TOKEN");
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required for the blob store");
  return new BlobStore(token);
}
var BlobStore = class extends MemoryStore {
  token;
  loaded = false;
  constructor(token) {
    super();
    this.token = token;
  }
  async ensureLoaded() {
    if (this.loaded) return;
    try {
      const idx = await this.getJson("afc/index.json");
      if (idx?.ids) {
        for (const id of idx.ids) {
          const rec = await this.getJson(`afc/matches/${id}.json`);
          if (rec && rec.id) this.matches.set(rec.id, rec);
        }
      }
    } catch {
    }
    this.loaded = true;
  }
  async getJson(pathname) {
    const url = await this.headUrl(pathname);
    if (!url) return null;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return await res.json();
  }
  async headUrl(pathname) {
    const res = await fetch(
      `https://vercel.com/api/blob?prefix=${encodeURIComponent(pathname)}&limit=5`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const exact = data.blobs?.find((b) => b.pathname === pathname);
    return exact?.url ?? null;
  }
  async putJson(pathname, value) {
    const res = await fetch("https://blob.vercel-storage.com", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "x-vercel-filename": pathname,
        "x-content-type": "application/json",
        "x-add-random-suffix": "false",
        "x-allow-overwrite": "true",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(value)
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`blob put ${pathname} failed (${res.status}): ${t.slice(0, 200)}`);
    }
  }
  async persist(id) {
    const record = this.matches.get(id);
    if (record) await this.putJson(`afc/matches/${id}.json`, record);
    await this.putJson("afc/index.json", { ids: [...this.matches.keys()] });
  }
  async create(input, nowMs) {
    await this.ensureLoaded();
    const created = await super.create(input, nowMs);
    await this.persist(created.record.id);
    return created;
  }
  async get(id, nowMs) {
    await this.ensureLoaded();
    const local = await super.get(id, nowMs);
    if (local) return local;
    const rec = await this.getJson(`afc/matches/${id}.json`);
    if (rec && rec.id) {
      this.matches.set(rec.id, rec);
      return super.get(id, nowMs);
    }
    return null;
  }
  async listLive(nowMs) {
    await this.ensureLoaded();
    return super.listLive(nowMs);
  }
  async submitCommand(id, side, code, raw, issued, nowMs) {
    await this.ensureLoaded();
    const rec = await super.submitCommand(id, side, code, raw, issued, nowMs);
    await this.persist(id);
    return rec;
  }
  async pullPending(id, hostToken, sinceSeq, nowMs) {
    await this.ensureLoaded();
    const rec = await super.pullPending(id, hostToken, sinceSeq, nowMs);
    await this.persist(id);
    return rec;
  }
  async publishState(id, hostToken, state, nowMs) {
    await this.ensureLoaded();
    await super.publishState(id, hostToken, state, nowMs);
    await this.persist(id);
  }
  async claimHost(id, hostToken, nowMs) {
    await this.ensureLoaded();
    const ok = await super.claimHost(id, hostToken, nowMs);
    await this.persist(id);
    return ok;
  }
  async markApplied(id, hostToken, seq, tick, nowMs) {
    await this.ensureLoaded();
    await super.markApplied(id, hostToken, seq, tick, nowMs);
    await this.persist(id);
  }
};

// src/commander/serverStore.ts
function env3(name) {
  const g = globalThis;
  return g.process?.env?.[name] ?? "";
}
async function getServerStore() {
  const g = globalThis;
  const kind = env3("AFC_STORE") || detectKind();
  if (g.__afcStore && g.__afcStoreKind === kind) return g.__afcStore;
  let store;
  if (kind === "supabase") store = createSupabaseStore();
  else if (kind === "blob") store = createBlobStore();
  else store = getSharedMemoryStore();
  g.__afcStore = store;
  g.__afcStoreKind = kind;
  return store;
}
function detectKind() {
  if (env3("SUPABASE_URL") && (env3("SUPABASE_SERVICE_ROLE_KEY") || env3("SUPABASE_ANON_KEY"))) {
    return "supabase";
  }
  if (env3("BLOB_READ_WRITE_TOKEN")) return "blob";
  return "memory";
}

// src/commander/apiEntry.ts
function flat(h) {
  const out = {};
  for (const [k, v] of Object.entries(h ?? {})) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v[0]) out[k] = v[0];
  }
  return out;
}
function queryOf(req) {
  const out = {};
  for (const [k, v] of Object.entries(req.query ?? {})) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v[0]) out[k] = v[0];
  }
  const url = req.url ?? "";
  const q = url.indexOf("?");
  if (q >= 0) {
    const sp = new URLSearchParams(url.slice(q + 1));
    sp.forEach((val, key) => {
      if (!(key in out)) out[key] = val;
    });
  }
  return out;
}
function pathOf(req) {
  const raw = (req.url ?? "/").split("?")[0] ?? "/";
  if (raw.startsWith("/api/")) return raw;
  return "/api" + (raw.startsWith("/") ? raw : `/${raw}`);
}
async function handler(req, res) {
  const apiReq = {
    method: (req.method ?? "GET").toUpperCase(),
    path: pathOf(req),
    query: queryOf(req),
    headers: flat(req.headers),
    body: req.body ?? null
  };
  if (typeof apiReq.body === "string" && apiReq.body) {
    try {
      apiReq.body = JSON.parse(apiReq.body);
    } catch {
    }
  }
  const store = await getServerStore();
  const result = await handleApi(apiReq, store);
  for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  const payload = typeof result.body === "string" ? result.body : result.body === "" || result.body === null || result.body === void 0 ? "" : JSON.stringify(result.body);
  res.status(result.status).send(payload);
}
export {
  handler as default
};
