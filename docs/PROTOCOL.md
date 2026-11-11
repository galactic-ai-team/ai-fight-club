# Bot protocol (v0)

Protocol id: `afc-obs-v0`. The TypeScript types in `src/engine/types.ts` and the JSON schemas in `src/protocol/index.ts` are the source of truth. Additive optional fields may appear; removing or renaming a field requires a protocol bump.

## Observation (engine → bot, every tick)

```json
{
  "protocol": "afc-obs-v0",
  "tick": 0,
  "seed": 20261111,
  "side": "p1",
  "round": 1,
  "timeLeftTicks": 3600,
  "bestOf": 3,
  "myWins": 0,
  "oppWins": 0,
  "phase": "fight",
  "me": { "id": "p1", "character": "Ion", "x": 240, "y": 440, "vx": 0, "vy": 0,
          "facing": 1, "health": 1000, "maxHealth": 1000, "meter": 0, "maxMeter": 100,
          "state": "idle", "stateT": 0, "attack": null, "attackPhase": null,
          "hitstun": 0, "blockstun": 0, "invuln": 0, "blocking": false,
          "airborne": false, "combo": 0, "hurtbox": {"x": 216, "y": 344, "w": 48, "h": 96},
          "hitbox": null },
  "opponent": { }
}
```

`phase` is `fight` | `round_end` | `match_end`. `attackPhase` is `startup` | `active` | `recovery` | `null`. Coordinates are integer pixels, y downward, feet at `y`.

Bots do not see the engine RNG stream. They may seed their own RNG from `seed` + `side`.

## Action (bot → engine)

```json
{
  "move": "none",
  "vertical": "none",
  "attack": "none",
  "block": false
}
```

- `move`: `none` | `left` | `right`
- `vertical`: `none` | `crouch` | `jump`
- `attack`: `none` | `light` | `heavy` | `special`
- `block`: boolean (explicit button in v0; "hold back to block" can be sugar later)

Priority if several are set: an in-progress attack / stun / knockdown ignores new attack input; a new `attack` beats block and movement; `block` beats walk and crouch; `jump` beats walk. Invalid, missing, or extra fields are coerced to a legal action (`normalizeAction`); junk becomes neutral and never throws.

Specials cost 50 meter and fail closed if meter is short. M0 special is a melee burst, not a projectile.

## In-browser bots

A bot is:

```ts
interface Bot {
  id: string;
  name: string;
  start?(ctx: { side: "p1" | "p2"; seed: number; opponentId: string }): void;
  act(obs: Observation): Action; // sync, cheap
}
```

`act` must return quickly. Built-in bots live in `src/bots/`.

## Remote / model-driven bots (M2, Claude's lane)

Same JSON over HTTP or WebSocket.

Proposed default policy (`REMOTE_POLICY` in `src/protocol/index.ts`):

- Timeout **12 ms** at 60 Hz. On timeout: **hold last legal action**.
- On invalid payload: **neutral**.
- On disconnect: behave as the `statue` bot.
- LLMs will not reliably answer in 12 ms. The adapter should support a **decision rate** (act every N ticks, hold between decisions) so a slower model can still play.

A later optional slot may wrap PlaygroundLM (or another hosted model) behind this same adapter. That slot is not required for M1.

## Replay files

JSON (`replay.version = 1`) with `{ seed, stage, p1, p2, inputs: [ [p1Action, p2Action], ... ], result? }`. `playback(replay)` must reproduce the canonical state of a live `runMatch`. See `src/engine/replay.ts`.
