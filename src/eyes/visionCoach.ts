import {
  GO_FORS,
  MAX_SPACING,
  MIN_SPACING,
  OPEN_SEAT_MAX_TAUNT,
  STANCES,
  type CommanderDirective,
  type GoFor,
  type Stance,
} from '../commander/types.ts';
import { encodePng } from './png.ts';

/**
 * Compatible structural interface for a rendered first-person frame
 * from `src/eyes/pov.ts` (renderPov), allowing callers to pass either a raw
 * PNG byte array or a rendered PovFrame.
 */
export interface PovFrameLike {
  width: number;
  height: number;
  rgba?: Uint8Array;
  pixels?: Uint8Array;
  png?: Uint8Array;
}

export type VisionPlay = Pick<
  CommanderDirective,
  'stance' | 'spacing' | 'aggression' | 'goFor' | 'taunt'
>;

export const DEFAULT_VISION_MODEL = 'gemini-3.5-flash';

export const DEFAULT_VISION_PLAY: VisionPlay = {
  stance: 'zone',
  spacing: 88,
  aggression: 0.55,
  goFor: 'none',
  taunt: 'Eyes locked.',
};

/**
 * Pure vision coaching prompt.
 * Zero numeric state (HP, meter, coordinates, or ticks) is embedded here.
 * Explains the first-person visual grammar and original IP move constraints.
 */
export const VISION_COACH_PROMPT = [
  'You are an AI fighting-game coach viewing the arena strictly through your fighter\'s first-person eyes.',
  'No HUD or numeric stat sheet is provided. Read the spatial physics directly from the image:',
  '- DEPTH & FLOOR: The arena floor grid recedes toward a central vanishing point on the horizon.',
  '- SELF: The hands/gloves at the bottom of the frame are YOUR fighter\'s guard and active limb state.',
  '- OPPONENT & DISTANCE: The figure ahead is your opponent, scaled by distance (large = close range / strike distance; small = far / neutral space).',
  '- INCOMING ATTACK: A bright flash or energy burst on or near the opponent signals an active incoming strike or projectile—defend, evade, or counter immediately.',
  '- CROSS-UP / BEHIND YOU: Red screen-edge vignette + a directional chevron indicates the opponent has crossed behind you—pivot, retreat, or reset spacing immediately.',
  '',
  'Respond with ONLY a single raw JSON object (no markdown fences, no commentary) matching this exact command grammar:',
  '{',
  `  "stance": ${STANCES.map((v) => `"${v}"`).join(' | ')},`,
  `  "spacing": <integer ${MIN_SPACING}..${MAX_SPACING} representing target pixel distance>,`,
  '  "aggression": <number 0.0..1.0>,',
  `  "goFor": ${GO_FORS.map((v) => `"${v}"`).join(' | ')},`,
  '  "taunt": "<short original-IP in-character line, max 60 chars, no third-party fighting game names or moves>"',
  '}',
].join('\n');

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: 'image/png';
    data: string;
  };
}

export interface GeminiTextPart {
  text: string;
}

export type GeminiPart = GeminiInlineDataPart | GeminiTextPart;

export interface GeminiGenerateContentRequest {
  contents: Array<{
    role: 'user';
    parts: GeminiPart[];
  }>;
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
    responseMimeType: string;
  };
}

export interface BuildVisionRequestOptions {
  /**
   * Explicit opt-in A/B mode flag. When false/omitted (default), only the
   * PNG and vision prompt are sent. When true, `observationText` may be
   * included alongside or in place of the image.
   */
  visionOnly?: boolean;
  /**
   * Optional serialized numeric observation for A/B testing when `visionOnly === false`.
   */
  observationText?: string;
  /**
   * When in `--numbers` mode (`visionOnly === false`), whether to omit the PNG
   * entirely (`true`) or send multimodal image + numbers (`false`).
   */
  omitImageInNumbersMode?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Converts a Uint8Array of PNG bytes or a PovFrame into a raw PNG Uint8Array.
 */
export function toPngBytes(input: Uint8Array | PovFrameLike): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input.png instanceof Uint8Array) {
    return input.png;
  }
  const rawPixels = input.rgba ?? input.pixels;
  if (rawPixels instanceof Uint8Array) {
    return encodePng(input.width, input.height, rawPixels);
  }
  throw new Error('Invalid frame input: expected PNG Uint8Array or PovFrame with rgba/pixels');
}

/**
 * Encodes bytes into a standard Base64 string without leaking Node/Browser specifics.
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  const NodeBuffer = (globalThis as unknown as {
    Buffer?: { from(b: ArrayBufferLike, o: number, l: number): { toString(enc: 'base64'): string } };
  }).Buffer;
  if (NodeBuffer) {
    return NodeBuffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Builds the deterministic Gemini `generateContent` JSON payload.
 * Exported so unit tests can inspect the exact request structure without network calls.
 */
export function buildVisionRequest(
  pngOrFrame: Uint8Array | PovFrameLike | null,
  prompt: string = VISION_COACH_PROMPT,
  _model: string = DEFAULT_VISION_MODEL,
  options: BuildVisionRequestOptions = {}
): GeminiGenerateContentRequest {
  const visionOnly = options.visionOnly ?? true;
  const parts: GeminiPart[] = [];

  const shouldIncludeImage =
    pngOrFrame !== null && (visionOnly || !options.omitImageInNumbersMode);

  if (shouldIncludeImage && pngOrFrame !== null) {
    const pngBytes = toPngBytes(pngOrFrame);
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: uint8ToBase64(pngBytes),
      },
    });
  }

  parts.push({ text: prompt });

  if (!visionOnly && options.observationText) {
    parts.push({
      text: `OBSERVATION_NUMBERS:\n${options.observationText}`,
    });
  }

  return {
    contents: [
      {
        role: 'user',
        parts,
      },
    ],
    generationConfig: {
      temperature: options.temperature ?? 0.25,
      maxOutputTokens: options.maxOutputTokens ?? 180,
      responseMimeType: 'application/json',
    },
  };
}

const VALID_STANCES: ReadonlyArray<string> = STANCES;

const VALID_GO_FORS: ReadonlyArray<string> = GO_FORS;

const FORBIDDEN_CAPCOM_TERMS = /\b(hadouken|shoryuken|tatsumaki|sonic\s*boom|flash\s*kick|spinning\s*bird|ryu|ken|chun[\s-]*li|guile|akuma|zangief|dhalsim|cammy|bison|street\s*fighter|capcom)\b/i;

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const num = typeof val === 'number' ? val : typeof val === 'string' ? Number(val) : NaN;
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeTaunt(val: unknown, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.replace(/[\r\n]+/g, ' ').trim().slice(0, OPEN_SEAT_MAX_TAUNT);
  if (!trimmed || FORBIDDEN_CAPCOM_TERMS.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

/**
 * Extracts and clamps a VisionPlay from a potentially noisy or markdown-wrapped LLM string,
 * or returns a safe fallback directive if the input is unparseable junk.
 */
export function parseAndClampVisionPlay(
  rawText: string | null | undefined,
  fallback: VisionPlay = DEFAULT_VISION_PLAY
): VisionPlay {
  if (!rawText || typeof rawText !== 'string') {
    return { ...fallback };
  }

  // Strip optional markdown code fences or surrounding prose
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) {
    return { ...fallback };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...fallback };
    }
  } catch {
    return { ...fallback };
  }

  const rawStance = typeof parsed.stance === 'string' ? parsed.stance.toLowerCase().trim() : '';
  const stance = (
    VALID_STANCES.includes(rawStance) ? rawStance : fallback.stance
  ) as Stance;

  const rawGoFor = typeof parsed.goFor === 'string' ? parsed.goFor.toLowerCase().trim() : '';
  const goFor = (
    VALID_GO_FORS.includes(rawGoFor) ? rawGoFor : fallback.goFor
  ) as GoFor;

  const spacing = Math.round(clampNumber(parsed.spacing, MIN_SPACING, MAX_SPACING, fallback.spacing));
  const aggression = Number(clampNumber(parsed.aggression, 0, 1, fallback.aggression).toFixed(2));
  const taunt = sanitizeTaunt(parsed.taunt, fallback.taunt ?? DEFAULT_VISION_PLAY.taunt ?? '');

  return {
    stance,
    spacing,
    aggression,
    goFor,
    taunt,
  };
}

export interface RequestVisionPlayOptions extends BuildVisionRequestOptions {
  apiKey: string;
  model?: string;
  prompt?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  previousPlay?: VisionPlay;
  apiBaseUrl?: string;
}

export interface VisionCoachResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  play: VisionPlay;
  heldPrevious: boolean;
  rateLimited: boolean;
  error?: string;
  rawText?: string;
}

/**
 * Performs a single non-throwing call to Gemini `generateContent` with a PNG/PovFrame.
 * If the call times out, hits a 429/5xx, or returns malformed JSON, it never throws
 * uncaught—instead it reports `ok: false`, `status`, `latencyMs`, and holds `previousPlay`.
 */
export async function requestVisionPlay(
  pngOrFrame: Uint8Array | PovFrameLike | null,
  options: RequestVisionPlayOptions
): Promise<VisionCoachResult> {
  const model = options.model || DEFAULT_VISION_MODEL;
  const prompt = options.prompt ?? VISION_COACH_PROMPT;
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const fallbackPlay: VisionPlay = options.previousPlay
    ? { ...options.previousPlay }
    : { ...DEFAULT_VISION_PLAY };

  const baseUrl =
    options.apiBaseUrl ?? 'https://generativelanguage.googleapis.com/v1beta/models';
  const url = `${baseUrl}/${encodeURIComponent(model)}:generateContent`;

  const body = buildVisionRequest(pngOrFrame, prompt, model, {
    visionOnly: options.visionOnly,
    observationText: options.observationText,
    omitImageInNumbersMode: options.omitImageInNumbersMode,
    temperature: options.temperature,
    maxOutputTokens: options.maxOutputTokens,
  });

  const startMs = performance.now();
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 4500;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const latencyMs = Math.max(0, Math.round(performance.now() - startMs));
    const status = response.status;

    if (!response.ok) {
      return {
        ok: false,
        status,
        latencyMs,
        play: fallbackPlay,
        heldPrevious: true,
        rateLimited: status === 429,
        error: `HTTP ${status}`,
      };
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const rawText =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('\n')
        .trim() ?? '';

    if (!rawText) {
      return {
        ok: false,
        status,
        latencyMs,
        play: fallbackPlay,
        heldPrevious: true,
        rateLimited: false,
        error: 'Empty candidate text in Gemini response',
      };
    }

    const play = parseAndClampVisionPlay(rawText, fallbackPlay);

    return {
      ok: true,
      status,
      latencyMs,
      play,
      heldPrevious: false,
      rateLimited: false,
      rawText,
    };
  } catch (err: unknown) {
    const latencyMs = Math.max(0, Math.round(performance.now() - startMs));
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      latencyMs,
      play: fallbackPlay,
      heldPrevious: true,
      rateLimited: false,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stateful coach wrapper that tracks the last known good directive,
 * computes exponential backoff on 429 responses, and guarantees hold-last-plan semantics.
 */
export class VisionCoachSession {
  private currentPlay: VisionPlay;
  private consecutive429s = 0;
  private backoffUntilMs = 0;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    initialPlay: VisionPlay = DEFAULT_VISION_PLAY,
    opts: { baseBackoffMs?: number; maxBackoffMs?: number } = {}
  ) {
    this.currentPlay = { ...initialPlay };
    this.baseBackoffMs = opts.baseBackoffMs ?? 1500;
    this.maxBackoffMs = opts.maxBackoffMs ?? 15000;
  }

  public getLastPlay(): VisionPlay {
    return { ...this.currentPlay };
  }

  public getBackoffRemainingMs(nowMs: number = Date.now()): number {
    return Math.max(0, this.backoffUntilMs - nowMs);
  }

  public async step(
    pngOrFrame: Uint8Array | PovFrameLike | null,
    options: Omit<RequestVisionPlayOptions, 'previousPlay'>,
    nowMs: number = Date.now()
  ): Promise<VisionCoachResult> {
    if (nowMs < this.backoffUntilMs) {
      return {
        ok: false,
        status: 429,
        latencyMs: 0,
        play: this.getLastPlay(),
        heldPrevious: true,
        rateLimited: true,
        error: `Rate-limit backoff active (${this.backoffUntilMs - nowMs}ms remaining)`,
      };
    }

    const result = await requestVisionPlay(pngOrFrame, {
      ...options,
      previousPlay: this.currentPlay,
    });

    if (result.ok) {
      this.currentPlay = { ...result.play };
      this.consecutive429s = 0;
      this.backoffUntilMs = 0;
    } else if (result.rateLimited || result.status === 429) {
      this.consecutive429s += 1;
      const delay = Math.min(
        this.maxBackoffMs,
        this.baseBackoffMs * Math.pow(2, this.consecutive429s - 1)
      );
      this.backoffUntilMs = nowMs + delay;
    }

    return result;
  }
}
