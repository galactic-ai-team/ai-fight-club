#!/usr/bin/env npx tsx
/**
 * Render first-person POV PNGs for AI Eyes, and optionally send one frame
 * to Gemini 3.5 Flash for a vision play.
 *
 * The API key is read only from GEMINI_API_KEY, GEMINI_API_KEY_FILE, or
 * /workspace/fight/secrets/gemini_api_key.txt. It is never printed, logged,
 * or written to the output JSON.
 *
 *   npx tsx scripts/pov-frame.ts
 *   npx tsx scripts/pov-frame.ts --out-dir /workspace/fight/eyes
 *   npx tsx scripts/pov-frame.ts --gemini --model gemini-3.5-flash
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createMatch, stepMatch } from "../src/engine/sim.ts";
import { NEUTRAL_ACTION, type Action, type MatchState, type Side } from "../src/engine/types.ts";
import { encodePovPng, renderPov, type PovFrame } from "../src/eyes/index.ts";

const DEFAULT_KEY_FILE = "/workspace/fight/secrets/gemini_api_key.txt";
const DEFAULT_OUT = "/workspace/fight/eyes";
const DEFAULT_MODEL = "gemini-3.5-flash";
const MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const NIL: Action = { ...NEUTRAL_ACTION };
const RIGHT: Action = { ...NIL, move: "right" };
const LEFT: Action = { ...NIL, move: "left" };
const JUMP: Action = { ...NIL, vertical: "jump" };
const HEAVY: Action = { ...NIL, attack: "heavy" };

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

function keyFilePath(): string {
  return arg("--key-file") || env("GEMINI_API_KEY_FILE") || DEFAULT_KEY_FILE;
}

async function loadKey(): Promise<string | null> {
  const fromEnv = env("GEMINI_API_KEY").trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = (await readFile(keyFilePath(), "utf8")).trim();
    return raw || null;
  } catch {
    return null;
  }
}

function geminiHeaders(key: string, json = false): Record<string, string> {
  const h: Record<string, string> = { "x-goog-api-key": key };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

const VISION_PROMPT = `You are looking through your fighter's own eyes in AI Fight Club, an original 2D fighting game (not Street Fighter, no Capcom IP).

The image is a first-person view: the floor recedes toward a vanishing point, your own hands are at the bottom, and the opponent appears only if they are in front of you. A bright burst in front of the opponent means an attack is coming. Red edges and a downward chevron mean the opponent is behind you.

Do not assume numeric health or meter — you are not given a stat sheet. Infer distance, pose, and threat from the picture only.

Reply with JSON only, no markdown, no extra keys:
{"stance":"rush|zone|turtle|bait|anti-air","spacing":24-400,"aggression":0-1,"goFor":"none|special|light|heavy|combo","taunt":"max 60 chars, original and clean"}`;

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
  let taunt = typeof raw?.taunt === "string" ? raw.taunt : "";
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

async function askGemini(
  key: string,
  model: string,
  png: Uint8Array,
): Promise<{ play: Play; latencyMs: number; raw: string; status: number; finishReason: string }> {
  const url = `${MODELS_URL}/${encodeURIComponent(model)}:generateContent`;
  const t0 = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: geminiHeaders(key, true),
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: VISION_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: "Here is what you see. Return one JSON play now." },
            { inlineData: { mimeType: "image/png", data: Buffer.from(png).toString("base64") } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        // Gemini 3.x may spend the output budget on thinking; keep a real JSON play.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });
  const latencyMs = Math.round(performance.now() - t0);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`generateContent ${res.status} (${latencyMs}ms): ${text.slice(0, 180)}`);
  }
  let raw = "";
  let finishReason = "";
  try {
    const body = JSON.parse(text) as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const cand = body.candidates?.[0];
    finishReason = cand?.finishReason ?? "";
    raw = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  } catch {
    raw = text;
  }
  return {
    play: clampPlay(extractJson(raw)),
    latencyMs,
    raw: raw.slice(0, 400),
    status: res.status,
    finishReason,
  };
}

function scene(name: string, build: () => MatchState): { name: string; state: MatchState } {
  return { name, state: build() };
}

function walkIn(ticks: number): MatchState {
  const s = createMatch({ seed: 42, p1Character: "Ion", p2Character: "Vexel" });
  for (let i = 0; i < ticks; i++) stepMatch(s, RIGHT, LEFT);
  return s;
}

function scenes(): { name: string; state: MatchState }[] {
  return [
    scene("spawn", () => createMatch({ seed: 42, p1Character: "Ion", p2Character: "Vexel" })),
    scene("close", () => walkIn(90)),
    scene("jump", () => {
      const s = walkIn(70);
      stepMatch(s, NIL, JUMP);
      return s;
    }),
    scene("incoming-heavy", () => {
      const s = walkIn(90);
      stepMatch(s, NIL, HEAVY);
      return s;
    }),
    scene("behind", () => {
      const s = createMatch({ seed: 42, p1Character: "Ion", p2Character: "Vexel" });
      s.p1.facing = -1;
      return s;
    }),
  ];
}

function summary(frame: PovFrame): Record<string, unknown> {
  return {
    side: frame.side,
    tick: frame.tick,
    width: frame.width,
    height: frame.height,
    visibility: frame.visibility,
  };
}

async function writeFrame(dir: string, name: string, side: Side, state: MatchState): Promise<{ path: string; frame: PovFrame }> {
  const frame = renderPov(state, side);
  const file = resolve(dir, `${name}-${side}.png`);
  await writeFile(file, Buffer.from(encodePovPng(frame)));
  return { path: file, frame };
}

async function main(): Promise<void> {
  const outDir = resolve(arg("--out-dir") || env("AFC_EYES_OUT") || DEFAULT_OUT);
  await mkdir(outDir, { recursive: true });
  const manifest: Array<Record<string, unknown>> = [];

  for (const sc of scenes()) {
    for (const side of ["p1", "p2"] as Side[]) {
      const { path, frame } = await writeFrame(outDir, sc.name, side, sc.state);
      const entry = { scene: sc.name, path, ...summary(frame) };
      manifest.push(entry);
      const vis = frame.visibility;
      console.log(
        `${sc.name} ${side}: ${path}  fwd=${vis.forwardDistance} visible=${vis.opponentVisible}` +
          ` behind=${vis.behindThreat} air=${vis.opponentAirborne}` +
          (vis.incomingAttack ? ` incoming=${vis.incomingAttack}/${vis.incomingPhase}` : ""),
      );
    }
  }

  const result: Record<string, unknown> = {
    outDir,
    model: arg("--model") || env("GEMINI_MODEL") || DEFAULT_MODEL,
    gemini: null,
    frames: manifest,
  };

  if (flag("--gemini")) {
    const key = await loadKey();
    if (!key) {
      console.error("No Gemini key found (GEMINI_API_KEY or key file). Skipping the vision probe.");
      process.exitCode = 2;
    } else {
      const model = String(result.model);
      const target = manifest.find((f) => f.scene === "incoming-heavy" && f.side === "p1");
      const pngPath = String(target?.path ?? "");
      const png = await readFile(pngPath);
      console.log(`Sending ${pngPath} (${png.length} bytes) to ${model} (vision-only, no stat sheet)...`);
      const probe = await askGemini(key, model, png);
      result.gemini = {
        model,
        image: pngPath,
        bytes: png.length,
        latencyMs: probe.latencyMs,
        status: probe.status,
        finishReason: probe.finishReason,
        play: probe.play,
        raw: probe.raw,
      };
      console.log(`Gemini vision play in ${probe.latencyMs}ms: ${JSON.stringify(probe.play)}`);
    }
  }

  const reportPath = resolve(outDir, "pov-manifest.json");
  await writeFile(reportPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`Wrote ${reportPath}`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
