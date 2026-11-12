#!/usr/bin/env npx tsx
/**
 * Commander CLI. Send live plans and read match state from the box shell.
 *
 *   npx tsx scripts/commander.ts create --api <url> --code-file <path>
 *   npx tsx scripts/commander.ts command --api <url> --code-file <path> --fighter p1 --text "STANCE rush"
 *   npx tsx scripts/commander.ts state --api <url> --match <id>
 *
 * Join codes are written only to --code-file (mode 0600). They are never printed.
 */
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

interface SecretsFile {
  matchId: string;
  apiUrl: string;
  watchUrl: string;
  relayUrl: string;
  window: string;
  seed: number;
  expiresAt: string;
  p1Controller: string;
  p2Controller: string;
  p1Code: string;
  p2Code: string;
  hostToken: string;
  createdAt: string;
}

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

function apiUrl(): string {
  const raw = arg("--api") || env("AFC_API_URL") || "http://localhost:5173";
  return raw.replace(/\/$/, "");
}

function die(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}

function usage(): never {
  console.log(`AI Fight Club Commander CLI

Usage:
  npx tsx scripts/commander.ts create   [options]
  npx tsx scripts/commander.ts command  --fighter p1|p2 --code-file <path> (--text "..." | --stance rush ...)
  npx tsx scripts/commander.ts state    --match <id> [--format text|json]
  npx tsx scripts/commander.ts matches
  npx tsx scripts/commander.ts host-url --code-file <path>

Options:
  --api <url>            Base URL (or AFC_API_URL). Default http://localhost:5173
  --code-file <path>     Where to write / read join codes (never printed). Or AFC_CODE_FILE
  --match <id>           Match id (default: from --code-file)
  --fighter p1|p2
  --text "STANCE rush"   Raw command grammar (also stdin if --text -)
  --stance --spacing --aggression --gofor --taunt
  --window off|3s|5s     (create)
  --seed --p1-name --p2-name --p1-char --p2-char --p1-bot --p2-bot
  --ttl <seconds>

Join codes and the host token are written only to --code-file with mode 0600.
This command never prints them.
`);
  process.exit(0);
}

async function loadSecrets(path: string): Promise<SecretsFile> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as SecretsFile;
}

async function saveSecrets(path: string, data: SecretsFile): Promise<void> {
  const abs = resolve(path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(data, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  await chmod(abs, 0o600);
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown; text: string }> {
  const url = `${apiUrl()}${path}`;
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const t0 = performance.now();
  const res = await fetch(url, { ...init, headers });
  const rtt = performance.now() - t0;
  const text = await res.text();
  let body: unknown = text;
  if (text && (text.startsWith("{") || text.startsWith("["))) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const err = body && typeof body === "object" && body !== null && "error" in body
      ? String((body as { error: unknown }).error)
      : `${res.status} ${text.slice(0, 200)}`;
    die(`${init.method ?? "GET"} ${path} failed (${res.status}): ${err}`);
  }
  // attach rtt via a side channel on the returned object for callers who care
  (globalThis as { __afcRtt?: number }).__afcRtt = rtt;
  return { status: res.status, body, text };
}

function lastRtt(): number {
  return (globalThis as { __afcRtt?: number }).__afcRtt ?? 0;
}

function codeFilePath(): string {
  return arg("--code-file") || env("AFC_CODE_FILE") || "";
}

async function cmdCreate(): Promise<void> {
  const file = codeFilePath();
  if (!file) die("create requires --code-file <path> (join codes are written there, never printed)");
  const body = {
    seed: Number(arg("--seed") ?? Date.now() % 1_000_000_000),
    window: arg("--window") ?? "5s",
    p1Controller: arg("--p1-name") ?? "Lumi",
    p2Controller: arg("--p2-name") ?? "GPT-6",
    p1Character: arg("--p1-char") ?? "Ion",
    p2Character: arg("--p2-char") ?? "Quark",
    p1Bot: arg("--p1-bot") ?? "rusher",
    p2Bot: arg("--p2-bot") ?? "zoner",
    ttlSeconds: arg("--ttl") ? Number(arg("--ttl")) : undefined,
  };
  const { body: res } = await request("/api/match", { method: "POST", body: JSON.stringify(body) });
  const r = res as {
    id: string;
    watchPath: string;
    relayPath: string;
    window: string;
    seed: number;
    expiresAt: string;
    p1: { controller: string };
    p2: { controller: string };
    secrets: { p1Code: string; p2Code: string; hostToken: string };
  };
  const base = apiUrl();
  const secrets: SecretsFile = {
    matchId: r.id,
    apiUrl: base,
    watchUrl: `${base}${r.watchPath}`,
    relayUrl: `${base}${r.relayPath}`,
    window: r.window,
    seed: r.seed,
    expiresAt: r.expiresAt,
    p1Controller: r.p1.controller,
    p2Controller: r.p2.controller,
    p1Code: r.secrets.p1Code,
    p2Code: r.secrets.p2Code,
    hostToken: r.secrets.hostToken,
    createdAt: new Date().toISOString(),
  };
  await saveSecrets(file, secrets);
  console.log(`match ${r.id}`);
  console.log(`watch ${secrets.watchUrl}`);
  console.log(`relay ${secrets.relayUrl}`);
  console.log(`window ${r.window}  seed ${r.seed}  expires ${r.expiresAt}`);
  console.log(`p1 ${r.p1.controller}  p2 ${r.p2.controller}`);
  console.log(`join codes and host token written to ${resolve(file)} (mode 0600, not printed)`);
}

async function resolveMatch(): Promise<{ id: string; secrets: SecretsFile | null }> {
  const file = codeFilePath();
  let secrets: SecretsFile | null = null;
  if (file) secrets = await loadSecrets(file);
  const id = arg("--match") || secrets?.matchId;
  if (!id) die("need --match <id> or --code-file");
  return { id, secrets };
}

async function cmdCommand(): Promise<void> {
  const { id, secrets } = await resolveMatch();
  if (!secrets) die("command requires --code-file so the join code is not passed on the command line");
  const fighter = (arg("--fighter") ?? arg("-f") ?? "") as "p1" | "p2";
  if (fighter !== "p1" && fighter !== "p2") die("--fighter p1 or p2");
  const code = fighter === "p1" ? secrets.p1Code : secrets.p2Code;
  let text = arg("--text");
  if (text === "-") {
    text = await readStdin();
  }
  if (!text) {
    const parts: string[] = [];
    if (arg("--stance")) parts.push(`STANCE ${arg("--stance")}`);
    if (arg("--spacing")) parts.push(`SPACING ${arg("--spacing")}`);
    if (arg("--aggression") || arg("--aggro")) parts.push(`AGGRESSION ${arg("--aggression") || arg("--aggro")}`);
    if (arg("--gofor") || arg("--go")) parts.push(`GOFOR ${arg("--gofor") || arg("--go")}`);
    if (arg("--taunt")) parts.push(`TAUNT ${arg("--taunt")}`);
    text = parts.join("\n");
  }
  if (!text) die("need --text or --stance/--spacing/--aggression/--gofor/--taunt");
  const issuedAtMs = Date.now();
  const { body } = await request(`/api/match/${encodeURIComponent(id)}/command`, {
    method: "POST",
    body: JSON.stringify({ fighter, joinCode: code, text, issuedAtMs }),
  });
  const r = body as { seq: number; latencyMs: number; receivedAtMs: number; appliedTick: number; directive: unknown };
  const rtt = lastRtt();
  console.log(`ok  match=${id}  fighter=${fighter}  seq=${r.seq}  appliedTick=${r.appliedTick}`);
  console.log(`server_latency_ms=${r.latencyMs}  round_trip_ms=${Math.round(rtt)}`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function cmdState(): Promise<void> {
  const { id } = await resolveMatch();
  const format = arg("--format") ?? (flag("--json") ? "json" : "text");
  if (format === "json") {
    const { text } = await request(`/api/match/${encodeURIComponent(id)}/state`);
    console.log(text);
    return;
  }
  const { text, body } = await request(`/api/match/${encodeURIComponent(id)}/state?format=text`, {
    headers: { Accept: "text/plain" },
  });
  if (typeof body === "string" || !text.startsWith("{")) {
    console.log(text);
  } else {
    const r = body as { summary?: string };
    console.log(r.summary ?? text);
  }
  const rtt = lastRtt();
  console.log(`# round_trip_ms=${Math.round(rtt)}`);
}

async function cmdMatches(): Promise<void> {
  const { body } = await request("/api/match");
  const r = body as { matches: Array<{ id: string; status: string; score: string; p1: { controller: string; character: string }; p2: { controller: string; character: string }; watchPath: string }> };
  if (!r.matches?.length) {
    console.log("no live matches");
    return;
  }
  for (const m of r.matches) {
    console.log(`${m.id}  ${m.status}  ${m.p1.character}(${m.p1.controller}) vs ${m.p2.character}(${m.p2.controller})  ${m.score}  ${m.watchPath}`);
  }
}

async function cmdHostUrl(): Promise<void> {
  const file = codeFilePath();
  if (!file) die("--code-file required");
  const s = await loadSecrets(file);
  // The host token is not printed. We print the public watch URL only.
  console.log(s.watchUrl);
  console.log(`# host token is in the code file; inject it into sessionStorage as afc-host-token:${s.matchId}`);
  console.log(`# match ${s.matchId}`);
}

const cmd = process.argv[2];
if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") usage();

const cmds: Record<string, () => Promise<void>> = {
  create: cmdCreate,
  command: cmdCommand,
  cmd: cmdCommand,
  state: cmdState,
  matches: cmdMatches,
  list: cmdMatches,
  "host-url": cmdHostUrl,
};

const fn = cmds[cmd];
if (!fn) die(`unknown command "${cmd}"`);
fn().catch((err: unknown) => {
  die(err instanceof Error ? err.message : String(err));
});
