#!/usr/bin/env npx tsx
/**
 * Lumi's live P1 commander. Rule-based, labeled as Lumi's coach.
 * Join codes are read from --code-file and never printed.
 *
 *   npx tsx scripts/lumi-coach.ts --api <url> --code-file <path> --fighter p1
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_LOG = "/workspace/fight/live/lumi_log.md";

interface SecretsFile {
  matchId: string;
  apiUrl?: string;
  p1Code: string;
  p2Code: string;
}

interface Play {
  stance: string;
  spacing: number;
  aggression: number;
  goFor: string;
  taunt: string;
  why: string;
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  return fallback;
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

function apiUrl(secrets: SecretsFile | null): string {
  return (arg("--api") || env("AFC_API_URL") || secrets?.apiUrl || "").replace(/\/$/, "");
}

async function logLine(text: string): Promise<void> {
  const path = arg("--log") || env("AFC_LUMI_LOG") || DEFAULT_LOG;
  await mkdir(dirname(resolve(path)), { recursive: true });
  await appendFile(path, text.endsWith("\n") ? text : text + "\n", "utf8");
}

async function loadSecrets(path: string): Promise<SecretsFile> {
  return JSON.parse(await readFile(path, "utf8")) as SecretsFile;
}

interface FighterSnap {
  x?: number;
  health?: number;
  meter?: number;
  airborne?: boolean;
  state?: string;
  lastMoves?: string[];
  command?: { stance?: string };
}

interface PublicState {
  over?: boolean;
  phase?: string;
  matchPhase?: string;
  p1Wins?: number;
  p2Wins?: number;
  winner?: string;
  round?: number;
  timeLeftTicks?: number;
  tick?: number;
  p1?: FighterSnap;
  p2?: FighterSnap;
  window?: { open?: boolean; index?: number; remainingMs?: number; p1Submitted?: boolean; p2Submitted?: boolean };
}

function decide(st: PublicState): Play {
  const p1 = st.p1 ?? {};
  const p2 = st.p2 ?? {};
  const spacing = Math.abs(Number(p1.x ?? 0) - Number(p2.x ?? 0));
  const cornered = Number(p1.x ?? 400) <= 130 || Number(p1.x ?? 400) >= 830;
  const p2Air = !!p2.airborne;
  const hp1 = Number(p1.health ?? 0);
  const hp2 = Number(p2.health ?? 0);
  const meter = Number(p1.meter ?? 0);
  const timeLeft = Number(st.timeLeftTicks ?? 0) / 60;
  const p2Moves = (p2.lastMoves ?? []).map((m) => m.toLowerCase());
  const swings = p2Moves.filter((m) => m === "light" || m === "heavy" || m === "special").length;
  const pressing = swings >= 3;
  const behind = hp1 + 50 < hp2;
  const ahead = hp1 > hp2 + 50;
  const late = timeLeft <= 12;
  const veryLate = timeLeft <= 6;
  const phase = st.phase ?? st.matchPhase ?? "";

  if (phase !== "fight" && phase !== "window") {
    return { stance: "zone", spacing: 120, aggression: 0.4, goFor: "none", taunt: "hold the pocket", why: `phase=${phase}; keep mid plan` };
  }
  let plan: Play;
  if (p2Air) {
    plan = {
      stance: "anti-air",
      spacing: cornered ? 56 : 70,
      aggression: 0.6,
      goFor: meter >= 50 ? "special" : "heavy",
      taunt: "stay grounded",
      why: "opponent airborne — anti-air",
    };
  } else if (cornered) {
    plan = {
      stance: "turtle",
      spacing: 52,
      aggression: 0.4,
      goFor: meter >= 50 && spacing <= 90 ? "special" : "light",
      taunt: meter >= 50 && spacing <= 90 ? "out of the corner" : "jab out",
      why: `cornered at x=${p1.x} spacing=${Math.round(spacing)}; turtle-punish and push`,
    };
  } else if (ahead && late) {
    plan = { stance: "zone", spacing: 160, aggression: 0.2, goFor: "none", taunt: "clock is mine", why: `ahead ${hp1}-${hp2} with ${timeLeft.toFixed(0)}s left — keep space` };
  } else if (behind && veryLate) {
    plan = {
      stance: "rush",
      spacing: 56,
      aggression: 0.8,
      goFor: meter >= 50 ? "combo" : "light",
      taunt: "going for it",
      why: `behind ${hp1}-${hp2} with ${timeLeft.toFixed(0)}s — have to hit`,
    };
  } else if (behind && late) {
    plan = {
      stance: "bait",
      spacing: 108,
      aggression: 0.6,
      goFor: meter >= 50 && spacing >= 70 && spacing <= 110 ? "special" : "light",
      taunt: "come get me",
      why: `behind ${hp1}-${hp2}, ${timeLeft.toFixed(0)}s; bait a whiff then punish`,
    };
  } else if (pressing && !cornered) {
    plan = {
      stance: "bait",
      spacing: 118,
      aggression: 0.45,
      goFor: "none",
      taunt: "step and miss",
      why: `P2 pressing (${swings} swings); hold outside heavy`,
    };
  } else {
    plan = {
      stance: "zone",
      spacing: 120,
      aggression: 0.45,
      goFor: "none",
      taunt: "hold the pocket",
      why: `mid-screen spacing=${Math.round(spacing)} HP ${hp1}-${hp2}; keep the pocket`,
    };
  }
  if (plan.goFor === "special" && spacing > 100 && !(behind && veryLate)) {
    plan.goFor = "none";
    plan.why += " (held special; too far for a safe walk-up)";
  }
  return plan;
}

function planChanged(a: Play | null, b: Play): boolean {
  if (!a) return true;
  return a.stance !== b.stance || a.spacing !== b.spacing || a.aggression !== b.aggression || a.goFor !== b.goFor;
}

async function getState(base: string, id: string): Promise<{ status: number; json: Record<string, unknown>; rtt: number }> {
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
  return { status: res.status, json, rtt };
}

async function sendCommand(
  base: string,
  id: string,
  fighter: "p1" | "p2",
  code: string,
  play: Play,
): Promise<{ status: number; text: string; rtt: number }> {
  const text = [
    `STANCE ${play.stance}`,
    `SPACING ${play.spacing}`,
    `AGGRESSION ${play.aggression}`,
    `GOFOR ${play.goFor}`,
    `TAUNT ${play.taunt}`,
  ].join("\n");
  const t0 = performance.now();
  const res = await fetch(`${base}/api/match/${encodeURIComponent(id)}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fighter, joinCode: code, text, issuedAtMs: Date.now() }),
  });
  const body = await res.text();
  return { status: res.status, text: body.slice(0, 300), rtt: Math.round(performance.now() - t0) };
}

function matchOver(st: PublicState, status: string): boolean {
  if (status === "ended" || st.over) return true;
  const phase = st.phase ?? st.matchPhase ?? "";
  if (phase === "ended" || phase === "match_end") return true;
  return Number(st.p1Wins ?? 0) >= 2 || Number(st.p2Wins ?? 0) >= 2;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const file = arg("--code-file") || env("AFC_CODE_FILE") || "";
  if (!file) die("need --code-file (join codes are read from the file, never printed)");
  const secrets = await loadSecrets(file);
  const base = apiUrl(secrets);
  const id = arg("--match") || env("AFC_MATCH") || secrets.matchId;
  const fighter = (arg("--fighter") || env("AFC_FIGHTER") || "p1") as "p1" | "p2";
  if (!base) die("need --api or AFC_API_URL");
  if (!id) die("need --match, AFC_MATCH, or matchId in the code file");
  if (fighter !== "p1" && fighter !== "p2") die("--fighter p1 or p2");
  const code = fighter === "p1" ? secrets.p1Code : secrets.p2Code;
  if (!code) die("code file is missing the join code for this seat");

  await logLine(`\n## Lumi coach started ${nowEt()}\n- match=${id} fighter=${fighter} api=${base} (rule-based Lumi)\n`);
  console.log(`lumi-coach  match=${id}  fighter=${fighter}`);

  let last: Play | null = null;
  let lastCmdAt = 0;
  let lastWindow = -1;
  let lastRound = -1;

  for (;;) {
    let snap: Awaited<ReturnType<typeof getState>>;
    try {
      snap = await getState(base, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logLine(`- ${nowEt()}: state poll failed: ${msg}\n`);
      await sleep(1000);
      continue;
    }
    if (snap.status === 404 || snap.status === 410) {
      await logLine(`- ${nowEt()}: match gone (${snap.status}). stopping.\n`);
      console.log(`STOP match ${snap.status}`);
      break;
    }
    const st = (snap.json.state ?? {}) as PublicState;
    const status = String(snap.json.status ?? "");
    if (matchOver(st, status)) {
      await logLine(`- ${nowEt()}: SET OVER score=${st.p1Wins ?? 0}-${st.p2Wins ?? 0} winner=${st.winner ?? ""}\n`);
      console.log(`SET_OVER ${st.p1Wins}-${st.p2Wins} winner=${st.winner}`);
      break;
    }
    const rnd = Number(st.round ?? 0);
    if (lastRound !== -1 && rnd !== lastRound) {
      await logLine(`- ${nowEt()}: round change ${lastRound} → ${rnd}. Score ${st.p1Wins}-${st.p2Wins}.\n`);
    }
    lastRound = rnd;

    const plan = decide(st);
    const win = st.window ?? {};
    const winOpen = !!win.open;
    const winIdx = Number(win.index ?? 0);
    const submitted = fighter === "p1" ? !!win.p1Submitted : !!win.p2Submitted;
    const since = Date.now() - lastCmdAt;
    const phase = st.phase ?? "";
    let need = false;
    let reason = "";
    if (!last && (phase === "fight" || phase === "window" || phase === "waiting")) {
      need = true;
      reason = "opening plan";
    } else if (winOpen && !submitted && winIdx !== lastWindow) {
      need = true;
      reason = `decision window #${winIdx}`;
    } else if (planChanged(last, plan) && since >= 2000 && (phase === "fight" || phase === "window")) {
      need = true;
      reason = "situation changed";
    } else if (since >= 2000 && (phase === "fight" || phase === "waiting") && !(winOpen && submitted)) {
      need = true;
      reason = "periodic refresh";
    }

    if (need) {
      const sent = await sendCommand(base, id, fighter, code, plan);
      lastCmdAt = Date.now();
      last = plan;
      if (winOpen) lastWindow = winIdx;
      const hp1 = st.p1?.health;
      const hp2 = st.p2?.health;
      const spacing = Math.abs(Number(st.p1?.x ?? 0) - Number(st.p2?.x ?? 0));
      await logLine(
        `\n### ${nowEt()}\n` +
          `- Situation: round=${rnd} score=${st.p1Wins}-${st.p2Wins} phase=${phase} HP ${hp1}-${hp2} spacing=${Math.round(spacing)}\n` +
          `- Why: ${plan.why} | trigger: ${reason}\n` +
          `- Command: stance=${plan.stance} spacing=${plan.spacing} aggro=${plan.aggression} go=${plan.goFor} taunt=${JSON.stringify(plan.taunt)}\n` +
          `- Result: ${sent.status} rtt=${sent.rtt}ms ${sent.text.replace(/\n/g, " | ")}\n`,
      );
      console.log(`${nowEt()} ${plan.stance} sp=${plan.spacing} ag=${plan.aggression} go=${plan.goFor}  ${sent.status}/${sent.rtt}ms`);
    }
    await sleep(1000);
  }
}

main().catch((err: unknown) => {
  die(err instanceof Error ? err.message : String(err));
});
