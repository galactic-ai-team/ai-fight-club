#!/usr/bin/env npx tsx
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { renderPovPng } from '../src/eyes/index.ts';
import {
  DEFAULT_VISION_MODEL,
  DEFAULT_VISION_PLAY,
  VISION_COACH_PROMPT,
  VisionCoachSession,
  type VisionPlay,
} from '../src/eyes/visionCoach.ts';

export interface EyesCoachCliConfig {
  serverUrl: string;
  matchId: string;
  codeFile?: string;
  side: 'p1' | 'p2';
  model: string;
  visionOnly: boolean;
  numbers: boolean;
  intervalMs: number;
  timeoutMs: number;
  maxTicks: number;
  snapshotPath?: string;
  logPath: string;
  openSeatGet: boolean;
}

/**
 * Loads the Gemini API key using the exact precedence rules of `scripts/gemini-coach.ts`:
 * 1. `process.env.GEMINI_API_KEY`
 * 2. `process.env.GEMINI_API_KEY_FILE`
 * 3. The box key file fallback (/workspace/fight/secrets/gemini_api_key.txt)
 * Never logs or prints the key value or raw key contents.
 */
export function loadGeminiKey(): string {
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey) {
    return envKey;
  }

  const candidateFiles: string[] = [];
  if (process.env.GEMINI_API_KEY_FILE) {
    candidateFiles.push(process.env.GEMINI_API_KEY_FILE.trim());
  }
  candidateFiles.push('/workspace/fight/secrets/gemini_api_key.txt');

  for (const filePath of candidateFiles) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8').trim();
        if (content) {
          return content.split(/\r?\n/)[0].trim();
        }
      }
    } catch {
      // Continue checking next fallback location without leaking paths or contents
    }
  }

  throw new Error(
    'Missing Gemini API key. Set GEMINI_API_KEY or GEMINI_API_KEY_FILE in your environment.'
  );
}

export function parseEyesCoachArgs(argv: string[]): EyesCoachCliConfig {
  let serverUrl = process.env.AFC_API_URL || 'http://localhost:5173';
  let matchId = process.env.AFC_MATCH || '';
  let codeFile: string | undefined = process.env.AFC_CODE_FILE || undefined;
  let side: 'p1' | 'p2' = 'p1';
  let model = DEFAULT_VISION_MODEL;
  let visionOnly = true;
  let numbers = false;
  let intervalMs = 1500;
  let timeoutMs = 4000;
  let maxTicks = Infinity;
  let snapshotPath: string | undefined;
  let logPath = path.join(os.tmpdir(), 'ai-eyes-vision-coach.jsonl');
  let openSeatGet = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--match') {
      matchId = argv[++i] ?? matchId;
    } else if (arg.startsWith('--match=')) {
      matchId = arg.slice('--match='.length);
    } else if (arg === '--code-file') {
      codeFile = argv[++i] ?? codeFile;
    } else if (arg === '--api' || arg === '--url' || arg === '--server') {
      serverUrl = argv[++i] ?? serverUrl;
    } else if (arg.startsWith('--url=')) {
      serverUrl = arg.slice('--url='.length);
    } else if (arg === '--side' || arg === '--fighter') {
      const val = argv[++i];
      if (val === 'p1' || val === 'p2') side = val;
    } else if (arg.startsWith('--side=') || arg.startsWith('--fighter=')) {
      const val = arg.slice(arg.indexOf('=') + 1);
      if (val === 'p1' || val === 'p2') side = val;
    } else if (arg === '--model') {
      model = argv[++i] ?? model;
    } else if (arg.startsWith('--model=')) {
      model = arg.slice('--model='.length);
    } else if (arg === '--vision-only') {
      const next = argv[i + 1];
      if (next === 'false' || next === '0') {
        visionOnly = false;
        i++;
      } else if (next === 'true' || next === '1') {
        visionOnly = true;
        i++;
      } else {
        visionOnly = true;
      }
    } else if (arg.startsWith('--vision-only=')) {
      const val = arg.slice('--vision-only='.length).toLowerCase();
      visionOnly = val !== 'false' && val !== '0';
    } else if (arg === '--numbers') {
      numbers = true;
      visionOnly = false;
    } else if (arg === '--interval') {
      intervalMs = Math.max(250, Number(argv[++i]) || intervalMs);
    } else if (arg === '--timeout') {
      timeoutMs = Math.max(500, Number(argv[++i]) || timeoutMs);
    } else if (arg === '--steps' || arg === '--max-ticks') {
      maxTicks = Math.max(1, Number(argv[++i]) || 1);
    } else if (arg === '--snapshot' || arg === '--replay') {
      snapshotPath = argv[++i];
    } else if (arg.startsWith('--snapshot=')) {
      snapshotPath = arg.slice('--snapshot='.length);
    } else if (arg === '--log') {
      logPath = argv[++i] ?? logPath;
    } else if (arg.startsWith('--log=')) {
      logPath = arg.slice('--log='.length);
    } else if (arg === '--open-seat-get') {
      openSeatGet = true;
    }
  }

  return {
    serverUrl: serverUrl.replace(/\/+$/, ''),
    matchId,
    codeFile,
    side,
    model,
    visionOnly,
    numbers,
    intervalMs,
    timeoutMs,
    maxTicks,
    snapshotPath,
    logPath,
    openSeatGet,
  };
}

function appendJsonLog(logPath: string, entry: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[eyes-coach] Failed writing log to ${logPath}: ${msg}`);
  }
}

async function fetchMatchState(
  config: EyesCoachCliConfig
): Promise<{ state: unknown; observationText?: string }> {
  if (config.snapshotPath) {
    const raw = fs.readFileSync(config.snapshotPath, 'utf8');
    const parsed = JSON.parse(raw);
    const state = Array.isArray(parsed.frames) ? parsed.frames[0] : parsed.state ?? parsed;
    return {
      state,
      observationText: config.numbers ? JSON.stringify(parsed.observation ?? state) : undefined,
    };
  }

  if (!config.matchId) {
    throw new Error('Live mode needs --match <id> (or AFC_MATCH)');
  }
  const res = await fetch(`${config.serverUrl}/api/match/${encodeURIComponent(config.matchId)}/state`);
  if (!res.ok) {
    throw new Error(`State poll returned HTTP ${res.status}`);
  }
  const payload = (await res.json()) as Record<string, unknown>;
  const state = payload.state ?? payload;
  const observationText =
    !config.visionOnly && config.numbers
      ? JSON.stringify(payload.observation ?? state)
      : undefined;

  return { state, observationText };
}

async function postDirective(
  config: EyesCoachCliConfig,
  play: VisionPlay
): Promise<number> {
  if (config.snapshotPath) {
    // Offline snapshot/replay mode does not require a live match server POST
    return 200;
  }

  if (config.openSeatGet) {
    const params = new URLSearchParams({
      fighter: config.side,
      stance: play.stance,
      spacing: String(play.spacing),
      aggression: String(play.aggression),
      goFor: play.goFor,
      taunt: play.taunt ?? '',
    });
    const res = await fetch(
      `${config.serverUrl}/api/match/${encodeURIComponent(config.matchId)}/cmd?${params.toString()}`
    );
    return res.status;
  }

  // Authenticated seat: same POST /command path as scripts/lumi-coach.ts.
  // The join code is read from --code-file (JSON with p1Code/p2Code) and never logged.
  if (!config.codeFile) {
    throw new Error('Authenticated mode needs --code-file, or pass --open-seat-get for an open seat');
  }
  const secrets = JSON.parse(fs.readFileSync(config.codeFile, 'utf8')) as {
    p1Code?: string;
    p2Code?: string;
  };
  const joinCode = config.side === 'p1' ? secrets.p1Code : secrets.p2Code;
  if (!joinCode) {
    throw new Error('Code file is missing the join code for this seat');
  }
  const text = [
    `STANCE ${play.stance}`,
    `SPACING ${play.spacing}`,
    `AGGRESSION ${play.aggression}`,
    `GOFOR ${play.goFor}`,
    `TAUNT ${play.taunt ?? ''}`,
  ].join('\n');
  const res = await fetch(
    `${config.serverUrl}/api/match/${encodeURIComponent(config.matchId)}/command`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fighter: config.side, joinCode, text, issuedAtMs: Date.now() }),
    }
  );
  return res.status;
}

export async function runEyesCoachLoop(config: EyesCoachCliConfig): Promise<void> {
  const apiKey = loadGeminiKey();
  const session = new VisionCoachSession(DEFAULT_VISION_PLAY);

  let ticks = 0;
  while (ticks < config.maxTicks) {
    ticks += 1;
    let pngBytes: Uint8Array | null = null;
    let observationText: string | undefined;

    try {
      const { state, observationText: obs } = await fetchMatchState(config);
      observationText = obs;
      // Render first-person PNG from the avatar's perspective
      pngBytes = renderPovPng(state as never, config.side);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const heldPlay = session.getLastPlay();
      appendJsonLog(config.logPath, {
        timestamp: new Date().toISOString(),
        tick: ticks,
        side: config.side,
        mode: config.visionOnly ? 'vision-only' : 'numbers-ab',
        status: 0,
        latencyMs: 0,
        heldPrevious: true,
        play: heldPlay,
        error: `State/render failed: ${msg}`,
      });
      if (config.snapshotPath) break;
      await new Promise((r) => setTimeout(r, config.intervalMs));
      continue;
    }

    const result = await session.step(pngBytes, {
      apiKey,
      model: config.model,
      prompt: VISION_COACH_PROMPT,
      visionOnly: config.visionOnly,
      observationText: !config.visionOnly && config.numbers ? observationText : undefined,
      timeoutMs: config.timeoutMs,
    });

    let postStatus = 0;
    try {
      postStatus = await postDirective(config, result.play);
    } catch {
      postStatus = 0;
    }

    appendJsonLog(config.logPath, {
      timestamp: new Date().toISOString(),
      tick: ticks,
      side: config.side,
      model: config.model,
      mode: config.visionOnly ? 'vision-only' : 'numbers-ab',
      status: result.status,
      postStatus,
      latencyMs: result.latencyMs,
      heldPrevious: result.heldPrevious,
      rateLimited: result.rateLimited,
      play: result.play,
      ...(result.error ? { error: result.error } : {}),
    });

    if (config.snapshotPath) {
      break;
    }

    await new Promise((r) => setTimeout(r, config.intervalMs));
  }
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('eyes-coach.ts') || process.argv[1].endsWith('eyes-coach.js'));

if (isMain) {
  const cfg = parseEyesCoachArgs(process.argv.slice(2));
  runEyesCoachLoop(cfg).catch((err) => {
    console.error('[eyes-coach] Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
