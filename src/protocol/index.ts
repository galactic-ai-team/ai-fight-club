/**
 * Bot protocol v0 — the contract between the engine and any fighter brain.
 *
 * In-process JS bots implement `Bot` from `src/bots/types.ts` and are called
 * every tick. Remote / model-driven bots (M2) will use the same JSON shapes
 * over HTTP or WebSocket, with a timeout and hold-last-action policy.
 *
 * Schema is frozen enough for teammates to build against. Additive optional
 * fields may appear; removing or renaming a field requires a protocol bump.
 */
export { PROTOCOL_VERSION } from "../engine/constants.ts";
export { normalizeAction } from "../engine/action.ts";
export { observe } from "../engine/observe.ts";
export type { Action, Observation, FighterView } from "../engine/types.ts";

export const ACTION_SCHEMA = {
  $id: "afc-action-v0",
  type: "object",
  additionalProperties: false,
  required: ["move", "vertical", "attack", "block"],
  properties: {
    move: { enum: ["none", "left", "right"] },
    vertical: { enum: ["none", "crouch", "jump"] },
    attack: { enum: ["none", "light", "heavy", "special"] },
    block: { type: "boolean" },
  },
} as const;

export const OBSERVATION_SCHEMA = {
  $id: "afc-obs-v0",
  type: "object",
  required: [
    "protocol",
    "tick",
    "seed",
    "side",
    "round",
    "timeLeftTicks",
    "bestOf",
    "myWins",
    "oppWins",
    "phase",
    "me",
    "opponent",
  ],
  properties: {
    protocol: { const: "afc-obs-v0" },
    tick: { type: "integer" },
    seed: { type: "integer" },
    side: { enum: ["p1", "p2"] },
    round: { type: "integer" },
    timeLeftTicks: { type: "integer" },
    bestOf: { const: 3 },
    myWins: { type: "integer" },
    oppWins: { type: "integer" },
    phase: { enum: ["fight", "round_end", "match_end"] },
    me: { $ref: "#/definitions/FighterView" },
    opponent: { $ref: "#/definitions/FighterView" },
  },
} as const;

/** Remote adapter policy (M2). Documented here so engine and bots agree. */
export const REMOTE_POLICY = {
  decisionHzDefault: 60,
  timeoutMs: 12,
  onTimeout: "hold-last-action",
  onInvalid: "neutral",
  onDisconnect: "statue",
} as const;
