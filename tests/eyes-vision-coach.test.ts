import { describe, it, expect, vi } from 'vitest';
import {
  VISION_COACH_PROMPT,
  DEFAULT_VISION_MODEL,
  DEFAULT_VISION_PLAY,
  buildVisionRequest,
  parseAndClampVisionPlay,
  requestVisionPlay,
  VisionCoachSession,
  type VisionPlay,
} from '../src/eyes/visionCoach.ts';

describe('AI Eyes Vision Coach (src/eyes/visionCoach.ts)', () => {
  const samplePng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  it('buildVisionRequest includes inlineData image/png and explains visual language without embedding HP/meter/x/tick numbers', () => {
    const req = buildVisionRequest(samplePng, VISION_COACH_PROMPT, DEFAULT_VISION_MODEL);

    expect(req.contents).toHaveLength(1);
    const parts = req.contents[0]!.parts;
    expect(parts).toHaveLength(2);

    const imagePart = parts[0]!;
    expect('inlineData' in imagePart).toBe(true);
    if ('inlineData' in imagePart) {
      expect(imagePart.inlineData.mimeType).toBe('image/png');
      expect(typeof imagePart.inlineData.data).toBe('string');
      expect(imagePart.inlineData.data.length).toBeGreaterThan(0);
    }

    const textParts = parts
      .filter((p): p is { text: string } => 'text' in p)
      .map((p) => p.text)
      .join('\n');

    // Visual language explanations required by specification
    expect(textParts).toMatch(/vanishing point/i);
    expect(textParts).toMatch(/hands/i);
    expect(textParts).toMatch(/scaled by distance/i);
    expect(textParts).toMatch(/bright/i);
    expect(textParts).toMatch(/chevron/i);

    // Ensure no stat-sheet telemetry / coordinates / HP / meter numbers are injected
    expect(textParts).not.toMatch(/\b(p1Hp|p2Hp|hp\s*[:=]\s*\d|meter\s*[:=]\s*\d|tick\s*[:=]\s*\d|x\s*[:=]\s*\d)/i);
    expect(textParts).not.toContain('OBSERVATION_NUMBERS');
  });

  it('parseAndClampVisionPlay accepts messy model replies, clamps out-of-range values, and falls back safely on junk', () => {
    const messyReply = `
      Sure! Based on the opponent scale and bright burst, here is your play:
      \`\`\`json
      {
        "stance": "BAIT",
        "spacing": 999,
        "aggression": -0.45,
        "goFor": "heavy",
        "taunt": "Nice try, step into my trap!"
      }
      \`\`\`
    `;

    const parsed = parseAndClampVisionPlay(messyReply);
    expect(parsed).toEqual({
      stance: 'bait',
      spacing: 400, // clamped to MAX_SPACING (400)
      aggression: 0, // clamped to min 0
      goFor: 'heavy',
      taunt: 'Nice try, step into my trap!',
    });

    // Capcom IP filter check on taunt
    const capcomTauntReply = JSON.stringify({
      stance: 'zone',
      spacing: 200,
      aggression: 0.4,
      goFor: 'special',
      taunt: 'Eat my Hadouken Ryu!',
    });
    const sanitized = parseAndClampVisionPlay(capcomTauntReply, DEFAULT_VISION_PLAY);
    expect(sanitized.taunt).toBe(DEFAULT_VISION_PLAY.taunt);

    // Complete junk returns safe fallback
    const junk = parseAndClampVisionPlay('<<<not valid json at all>>>', DEFAULT_VISION_PLAY);
    expect(junk).toEqual(DEFAULT_VISION_PLAY);
  });

  it('returns the parsed play and latency >= 0 on a mock 200 response', async () => {
    const expectedPlay: VisionPlay = {
      stance: 'rush',
      spacing: 75,
      aggression: 0.85,
      goFor: 'combo',
      taunt: 'Closing the gap.',
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(expectedPlay) }],
            },
          },
        ],
      }),
    });

    const result = await requestVisionPlay(samplePng, {
      apiKey: 'mock-test-key-never-real',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.heldPrevious).toBe(false);
    expect(result.play).toEqual(expectedPlay);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('handles mock 429 and 500 without throwing uncaught and preserves the previous play', async () => {
    const initialPlay: VisionPlay = {
      stance: 'turtle',
      spacing: 240,
      aggression: 0.2,
      goFor: 'light',
      taunt: 'Holding my ground.',
    };

    const session = new VisionCoachSession(initialPlay, {
      baseBackoffMs: 2000,
      maxBackoffMs: 10000,
    });

    const mockFetch429 = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Quota exceeded' } }),
    });

    const res429 = await session.step(
      samplePng,
      {
        apiKey: 'mock-test-key',
        fetchImpl: mockFetch429 as unknown as typeof fetch,
      },
      1000
    );

    expect(res429.ok).toBe(false);
    expect(res429.status).toBe(429);
    expect(res429.rateLimited).toBe(true);
    expect(res429.heldPrevious).toBe(true);
    expect(res429.play).toEqual(initialPlay);
    expect(session.getBackoffRemainingMs(1500)).toBe(1500);

    // Next step after backoff expires encounters HTTP 500
    const mockFetch500 = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal error' } }),
    });

    const res500 = await session.step(
      samplePng,
      {
        apiKey: 'mock-test-key',
        fetchImpl: mockFetch500 as unknown as typeof fetch,
      },
      4000
    );

    expect(res500.ok).toBe(false);
    expect(res500.status).toBe(500);
    expect(res500.rateLimited).toBe(false);
    expect(res500.heldPrevious).toBe(true);
    expect(res500.play).toEqual(initialPlay);
  });
});
