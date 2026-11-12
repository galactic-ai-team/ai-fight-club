#!/usr/bin/env npx tsx
/**
 * Gemini live coach for an open P2 (or P1) seat.
 *
 * Reads the API key only from GEMINI_API_KEY, GEMINI_API_KEY_FILE, or
 * /workspace/fight/secrets/gemini_api_key.txt. Never prints or logs the key.
 *
 *   npx tsx scripts/gemini-coach.ts --probe
 *   npx tsx scripts/gemini-coach.ts --api <url> --match <id> --fighter p2
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_KEY_FILE = "/workspace/fight/secrets/gemini_api_key.txt";
const DEFAULT_LOG = "/workspace/fight/live/gemini_log.md";
const MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const PREFERRED_MODELS = [
  // Quality first, then the fast 3.x flash family. Probe timings decide the live pick.
  "gemini-4-carbon",
  "gemini-4-argon",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

/** Candidates we time during --probe, in quality-then-speed order. */
const PROBE_MODELS = [
  // Time the fast 3.x flashes first (free-tier RPM), then the stronger 4.x models.
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-4-carbon",
  "gemini-4-argon",
];

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  return fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function die(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}

function nowEt(): string {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }) + " ET";
}

function apiUrl(): string {
  return (arg("--api") || env("AFC_API_URL") || "").replace(/\/$/, "");
}

function keyFilePath(): string {
  return arg("--key-file") || env("GEMINI_API_KEY_FILE") || DEFAULT_KEY_FILE;
}

async function loadKey(): Promise<string | null> {
  const fromEnv = env("GEMINI_API_KEY").trim();
  if (fromEnv) return fromEnv;
  const file = keyFilePath();
  try {
    const raw = (await readFile(file, "utf8")).trim(); // strip trailing newline
    return raw || null;
  } catch {
    return null;
  }
}

/** New AQ. keys authenticate with the x-goog-api-key header, not a query string. */
function geminiHeaders(key: string, json = false): Record<string, string> {
  const h: Record<string, string> = { "x-goog-api-key": key };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function logLine(text: string): Promise<void> {
  const path = arg("--log") || env("AFC_GEMINI_LOG") || DEFAULT_LOG;
  await mkdir(dirname(resolve(path)), { recursive: true });
  await appendFile(path, text.endsWith("\n") ? text : text + "\n", "utf8");
}

interface ModelInfo {
  name: string;
  supportedGenerationMethods?: string[];
}

function shortModelName(name: string): string {
  return name.replace(/^models\//, "");
}

function canGenerate(m: ModelInfo): boolean {
  const methods = m.supportedGenerationMethods ?? [];
  return methods.includes("generateContent") || methods.length === 0;
}

function scoreModel(name: string): number {
  const n = shortModelName(name).toLowerCase();
  const idx = PREFERRED_MODELS.findIndex((p) => n === p || n.startsWith(p));
  if (idx >= 0) return 1000 - idx;
  if (n.includes("flash-lite") && !n.includes("8b") && !n.includes("exp")) return 50;
  if (n.includes("flash") && !n.includes("8b") && !n.includes("exp") && !n.includes("image")) return 25;
  return 0;
}

async function listModels(key: string): Promise<string[]> {
  const url = `${MODELS_URL}?pageSize=200`;
  const res = await fetch(url, { headers: geminiHeaders(key), signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`models list failed (${res.status}): ${text.slice(0, 180)}`);
  }
  const body = JSON.parse(text) as { models?: ModelInfo[] };
  const names = (body.models ?? []).filter(canGenerate).map((m) => shortModelName(m.name));
  return names;
}

function pickModel(names: string[], forced?: string): string {
  if (forced) {
    const hit = names.find((n) => n === forced || n.startsWith(forced) || shortModelName(n) === forced);
    if (hit) return hit;
    return forced;
  }
  const ranked = names
    .map((n) => ({ n, s: scoreModel(n) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (ranked[0]) return ranked[0].n;
  const flash = names.find((n) => /flash/i.test(n) && !/image|embed|exp/i.test(n));
  if (flash) return flash;
  throw new Error("no suitable flash model found on this key");
}

interface Play {
  stance: string;
  spacing: number;
  aggression: number;
  goFor: string;
  taunt: string;
}

const STANCES = ["rush", "zone", "turtle", "bait", "anti-air"] as const;
const GO_FORS = ["none", "special", "light", "heavy", "combo"] as const;

function clampPlay(raw: Partial<Play> | null): Play {
  const stance = STANCES.includes(raw?.stance as (typeof STANCES)[number]) ? (raw!.stance as string) : "zone";
  const goFor = GO_FORS.includes(raw?.goFor as (typeof GO_FORS)[number]) ? (raw!.goFor as string) : "none";
  let spacing = Number(raw?.spacing);
  if (!Number.isFinite(spacing)) spacing = 88;
  spacing = Math.max(24, Math.min(400, Math.round(spacing)));
  let aggression = Number(raw?.aggression);
  if (!Number.isFinite(aggression)) aggression = 0.55;
  aggression = Math.max(0, Math.min(1, Math.round(aggression * 100) / 100));
  let taunt = typeof raw?.taunt === "string" ? raw!.taunt : "";
  taunt = taunt.replace(/[\r\n]+/g, " ").trim().slice(0, 60);
  return { stance, spacing, aggression, goFor, taunt };
}

function extractJson(text: string): Partial<Play> | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Partial<Play>;
  } catch {
    return null;
  }
}

const SYSTEM = `You are Gemini, commanding an original fighting-game character in AI Fight Club (not Street Fighter). You send one short plan per decision. Reply with JSON only, no markdown, no extra keys:
{"stance":"rush|zone|turtle|bait|anti-air","spacing":24-400,"aggression":0-1,"goFor":"none|special|light|heavy|combo","taunt":"max 60 chars"}
Rules: hold mid-screen pockets outside jab range (~84) and heavy range (~98) when ahead; anti-air if the opponent is airborne; turtle-punish if you are cornered (x<=130 or x>=830); special only with meter>=50 and spacing<=100; taunts stay original and clean.`;

async function generatePlay(
  key: string,
  model: string,
  stateText: string,
): Promise<{ play: Play; latencyMs: number; raw: string }> {
  const url = `${MODELS_URL}/${encodeURIComponent(model)}:generateContent`;
  const t0 = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: geminiHeaders(key, true),
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Match state:\n${stateText}\n\nReturn one JSON play now.` }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 160,
        responseMimeType: "application/json",
      },
    }),
  });
  const latencyMs = Math.round(performance.now() - t0);
  const text = await res.text();
  if (res.status === 429) {
    const err = new Error(`429 rate limited (${latencyMs}ms)`);
    (err as Error & { status: number }).status = 429;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`generateContent ${res.status} (${latencyMs}ms): ${text.slice(0, 180)}`);
  }
  let raw = "";
  try {
    const body = JSON.parse(text) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    raw = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  } catch {
    raw = text;
  }
  const play = clampPlay(extractJson(raw));
  return { play, latencyMs, raw: raw.slice(0, 240) };
}

async function getState(base: string, id: string): Promise<{ status: number; json: Record<string, unknown>; text: string; rtt: number }> {
  const t0 = performance.now();
  const res = await fetch(`${base}/api/match/${encodeURIComponent(id)}/state`);
  const text = await res.text();
  const rtt = Math.round(performance.now() - t0);
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { summary: text };
  }
  return { status: res.status, json, text, rtt };
}

async function sendOpenCmd(
  base: string,
  id: string,
  fighter: string,
  play: Play,
): Promise<{ status: number; text: string; rtt: number }> {
  const q = new URLSearchParams({
    fighter,
    stance: play.stance,
    spacing: String(play.spacing),
    aggression: String(play.aggression),
    goFor: play.goFor,
    taunt: play.taunt,
  });
  const t0 = performance.now();
  const res = await fetch(`${base}/api/match/${encodeURIComponent(id)}/cmd?${q.toString()}`);
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 400), rtt: Math.round(performance.now() - t0) };
}

function stateSummary(json: Record<string, unknown>): string {
  if (typeof json.summary === "string" && json.summary.trim()) return json.summary;
  return JSON.stringify(json.state ?? json).slice(0, 2000);
}

function matchOver(json: Record<string, unknown>): boolean {
  const status = String(json.status ?? "");
  const st = (json.state ?? {}) as Record<string, unknown>;
  if (status === "ended") return true;
  if (st.over === true) return true;
  const phase = String(st.phase ?? st.matchPhase ?? "");
  if (phase === "ended" || phase === "match_end") return true;
  const p1 = Number(st.p1Wins ?? 0);
  const p2 = Number(st.p2Wins ?? 0);
  return p1 >= 2 || p2 >= 2;
}

function windowIndex(json: Record<string, unknown>): { open: boolean; index: number; submitted: boolean } {
  const st = (json.state ?? {}) as Record<string, unknown>;
  const win = (st.window ?? {}) as Record<string, unknown>;
  const fighter = arg("--fighter") || env("AFC_FIGHTER") || "p2";
  const submitted = fighter === "p1" ? !!win.p1Submitted : !!win.p2Submitted;
  return { open: !!win.open, index: Number(win.index ?? 0), submitted };
}

function fightTick(json: Record<string, unknown>): number {
  const st = (json.state ?? {}) as Record<string, unknown>;
  return Number(st.tick ?? 0);
}

function phaseOf(json: Record<string, unknown>): string {
  const st = (json.state ?? {}) as Record<string, unknown>;
  return String(st.phase ?? json.status ?? "");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function resolveAvailable(wanted: string, names: string[]): string | null {
  const exact = names.find((n) => n === wanted);
  if (exact) return exact;
  const prefix = names.find((n) => n.startsWith(wanted) || n.startsWith(`${wanted}-`));
  return prefix ?? null;
}

/**
 * Prefer a 4.x quality model if it answers in <= 2s; otherwise the fastest
 * 3.x / flash model that answers in about 1–2 seconds.
 */
function chooseFromTimings(
  rows: Array<{ model: string; ok: boolean; latencyMs: number }>,
): { model: string; why: string } {
  const ok = rows.filter((r) => r.ok).sort((a, b) => a.latencyMs - b.latencyMs);
  if (!ok.length) throw new Error("no probe model returned a play");
  const fastCap = 2000;
  const quality = ok
    .filter((r) => /gemini-4-(carbon|argon)/i.test(r.model) && r.latencyMs <= fastCap)
    .sort((a, b) => a.latencyMs - b.latencyMs);
  if (quality[0]) {
    return {
      model: quality[0].model,
      why: `${quality[0].model} answered in ${quality[0].latencyMs}ms (within the 1–2s live budget) and is the stronger 4.x quality pick`,
    };
  }
  const flash = ok.filter((r) => r.latencyMs <= fastCap);
  const pick = (flash[0] ?? ok[0])!;
  return {
    model: pick.model,
    why: flash[0]
      ? `${pick.model} was the fastest model at ${pick.latencyMs}ms within the 1–2s live budget` +
        (ok.some((r) => /gemini-4-(carbon|argon)/i.test(r.model))
          ? "; 4.x quality models were slower than 2s so they were skipped for live commands"
          : "")
      : `${pick.model} was the fastest available at ${pick.latencyMs}ms (none finished within 2s)`,
  };
}

async function probe(key: string): Promise<string> {
  const tList0 = performance.now();
  const names = await listModels(key);
  const listMs = Math.round(performance.now() - tList0);
  const forced = arg("--model");
  const fakeState = [
    "MATCH probe  tick=120  round=1  time=58s  phase=fight  score=0-0  host=yes  openSeat=p2",
    "P1 Ion (Lumi)  HP=1000/1000  meter=0  pos=280,0  state=idle",
    "P2 Vexel (Gemini)  HP=1000/1000  meter=0  pos=680,0  state=idle",
    "SPACING 400",
  ].join("\n");

  const wanted = forced ? [forced] : [...PROBE_MODELS];
  // Also time any listed flash we asked for that exists under a slightly different id.
  const toTime: string[] = [];
  for (const w of wanted) {
    const hit = resolveAvailable(w, names);
    if (hit && !toTime.includes(hit)) toTime.push(hit);
    else if (forced && !toTime.includes(w)) toTime.push(w);
  }
  if (!toTime.length) toTime.push(pickModel(names, forced));

  const rows: Array<{ model: string; ok: boolean; latencyMs: number; play?: string; error?: string }> = [];
  for (const model of toTime) {
    try {
      const { play, latencyMs } = await generatePlay(key, model, fakeState);
      rows.push({ model, ok: true, latencyMs, play: `${play.stance}/${play.spacing}/${play.aggression}/${play.goFor}` });
      console.log(`probe  model=${model}  generate_ms=${latencyMs}  stance=${play.stance} spacing=${play.spacing} aggro=${play.aggression} go=${play.goFor}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const ms = Number((/\((\d+)ms\)/.exec(msg) ?? [])[1] ?? 0);
      rows.push({ model, ok: false, latencyMs: ms, error: msg.slice(0, 180) });
      console.log(`probe  model=${model}  FAILED  ${msg.slice(0, 160)}`);
      if (/429/.test(msg)) {
        console.log("probe  backing off 8s after 429");
        await sleep(8_000);
      }
    }
  }

  const chosen = forced
    ? { model: toTime[0]!, why: `forced via --model ${forced}` }
    : chooseFromTimings(rows);
  const lines = [
    `\n## Gemini probe ${nowEt()}`,
    `- models_listed=${names.length} list_ms=${listMs}`,
    ...rows.map((r) =>
      r.ok
        ? `- ${r.model}  ok  generate_ms=${r.latencyMs}  play=${r.play}`
        : `- ${r.model}  FAIL  ${r.error}`,
    ),
    `- chosen=${chosen.model}`,
    `- why: ${chosen.why}`,
    "",
  ];
  await logLine(lines.join("\n"));
  console.log(`probe chosen  model=${chosen.model}`);
  console.log(`probe why  ${chosen.why}`);
  return chosen.model;
}

async function runLoop(key: string): Promise<void> {
  const base = apiUrl();
  const id = arg("--match") || env("AFC_MATCH") || "";
  const fighter = arg("--fighter") || env("AFC_FIGHTER") || "p2";
  if (!base) die("need --api or AFC_API_URL");
  if (!id) die("need --match or AFC_MATCH");
  if (fighter !== "p1" && fighter !== "p2") die("--fighter p1 or p2");

  const names = await listModels(key);
  const model = arg("--model") || env("AFC_GEMINI_MODEL") || pickModel(names, undefined);
  await logLine(`\n## Gemini coach started ${nowEt()}\n- match=${id} fighter=${fighter} model=${model} api=${base}\n`);
  console.log(`gemini-coach  match=${id}  fighter=${fighter}  model=${model}`);

  let backoffMs = 0;
  let lastAskAt = 0;
  let lastWindow = -1;
  let lastFightAskTick = -9999;
  let stopped = false;

  while (!stopped) {
    if (backoffMs > 0) {
      await sleep(backoffMs);
    }
    let snap: Awaited<ReturnType<typeof getState>>;
    try {
      snap = await getState(base, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logLine(`- ${nowEt()}: state poll failed: ${msg}\n`);
      backoffMs = Math.min(15_000, Math.max(2000, backoffMs * 2 || 2000));
      continue;
    }
    if (snap.status === 404 || snap.status === 410) {
      await logLine(`- ${nowEt()}: match gone (${snap.status}). stopping.\n`);
      console.log(`STOP match ${snap.status}`);
      break;
    }
    if (matchOver(snap.json)) {
      const st = (snap.json.state ?? {}) as Record<string, unknown>;
      await logLine(`- ${nowEt()}: SET OVER score=${st.p1Wins ?? "?"}-${st.p2Wins ?? "?"} winner=${st.winner ?? ""}\n`);
      console.log(`SET_OVER ${st.p1Wins}-${st.p2Wins} winner=${st.winner}`);
      break;
    }

    const phase = phaseOf(snap.json);
    const win = windowIndex(snap.json);
    const tick = fightTick(snap.json);
    const since = Date.now() - lastAskAt;
    const windowNeed = win.open && !win.submitted && win.index !== lastWindow;
    const fightNeed = (phase === "fight" || phase === "waiting" || phase === "window") &&
      since >= 2000 &&
      tick - lastFightAskTick >= 120; // ~2s of 60 Hz fight time
    const opening = lastAskAt === 0 && (phase === "waiting" || phase === "fight" || phase === "window");
    const need = windowNeed || opening || (fightNeed && !win.open);

    if (need) {
      try {
        const { play, latencyMs } = await generatePlay(key, model, stateSummary(snap.json));
        const sent = await sendOpenCmd(base, id, fighter, play);
        lastAskAt = Date.now();
        if (win.open) lastWindow = win.index;
        lastFightAskTick = tick;
        backoffMs = sent.status === 429 ? Math.min(30_000, Math.max(2000, (backoffMs || 1000) * 2)) : 0;
        await logLine(
          `\n### ${nowEt()}\n` +
            `- trigger: ${opening ? "opening" : windowNeed ? `window #${win.index}` : "periodic ~2s"}\n` +
            `- model=${model}  gemini_ms=${latencyMs}  cmd_status=${sent.status}  cmd_rtt_ms=${sent.rtt}\n` +
            `- play: stance=${play.stance} spacing=${play.spacing} aggro=${play.aggression} go=${play.goFor} taunt=${JSON.stringify(play.taunt)}\n` +
            `- result: ${sent.text.replace(/\n/g, " | ")}\n`,
        );
        console.log(
          `${nowEt()} ${play.stance} sp=${play.spacing} ag=${play.aggression} go=${play.goFor}  gemini=${latencyMs}ms cmd=${sent.status}/${sent.rtt}ms`,
        );
        if (sent.status === 429) {
          await logLine(`- ${nowEt()}: command 429, backing off ${backoffMs}ms\n`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const is429 = /429/.test(msg) || (err as { status?: number }).status === 429;
        backoffMs = is429 ? Math.min(30_000, Math.max(2000, (backoffMs || 1000) * 2)) : Math.min(8_000, 2000);
        await logLine(`- ${nowEt()}: ask failed: ${msg}  backoff=${backoffMs}ms\n`);
        console.error(`ask failed: ${msg}`);
      }
    } else {
      backoffMs = 0;
    }
    await sleep(1000);
  }
}

async function main(): Promise<void> {
  if (flag("-h") || flag("--help")) {
    console.log(`Gemini coach
  --probe              List models, pick a fast flash model, one test generate (no match required)
  --api --match --fighter p2
  --model <name>       Force a model id
  --key-file <path>    Default /workspace/fight/secrets/gemini_api_key.txt
  --log <path>         Default /workspace/fight/live/gemini_log.md
Key from GEMINI_API_KEY or the key file. Never printed.
`);
    return;
  }
  const key = await loadKey();
  if (!key) {
    die(`Gemini API key not found. Set GEMINI_API_KEY or write ${keyFilePath()} (mode 0600). Coaches will not start.`);
  }
  if (flag("--probe")) {
    await probe(key);
    return;
  }
  await runLoop(key);
}

main().catch((err: unknown) => {
  die(err instanceof Error ? err.message : String(err));
});
