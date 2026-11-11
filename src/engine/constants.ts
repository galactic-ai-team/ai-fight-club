/** Fixed-tick rate. The engine never uses wall-clock time for simulation. */
export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;

/** Stage is axis-aligned, y increases downward (canvas space). */
export const STAGE_WIDTH = 960;
export const STAGE_HEIGHT = 540;
export const GROUND_Y = 440;
export const EDGE_PAD = 40;

export const FIGHTER_W = 48;
export const FIGHTER_H = 96;
export const CROUCH_H = 60;

export const WALK_SPEED = 4;
export const JUMP_VY = -16;
export const GRAVITY = 1;
export const MAX_FALL = 18;
export const PUSH_SEPARATION = FIGHTER_W;

export const MAX_HEALTH = 1000;
export const MAX_METER = 100;
export const METER_ON_HIT = 12;
export const METER_ON_TAKE = 8;
export const METER_ON_BLOCK = 4;

export const ROUND_TIME_SECONDS = 60;
export const ROUND_TIME_TICKS = ROUND_TIME_SECONDS * TICK_HZ;
export const ROUND_END_LINGER_TICKS = 120;
export const BEST_OF = 3;
export const WINS_NEEDED = 2;
export const MAX_ROUNDS = 5;

export const KNOCKDOWN_TICKS = 45;
export const KNOCKDOWN_INVULN_TICKS = 30;
export const WAKEUP_INVULN_TICKS = 10;

export const PROTOCOL_VERSION = "afc-obs-v0" as const;
export const REPLAY_VERSION = 1 as const;
export const STAGE_ID = "dojo-v0" as const;
