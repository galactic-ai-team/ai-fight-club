import type { AttackData, AttackKind } from "./types.ts";

export const ATTACKS: Record<AttackKind, AttackData> = {
  light: {
    startup: 4,
    active: 3,
    recovery: 8,
    damage: 40,
    chip: 8,
    hitstun: 10,
    blockstun: 6,
    range: 36,
    hitboxH: 28,
    hitboxYOffset: 28,
    meterCost: 0,
    knockback: 3,
    popY: 0,
  },
  heavy: {
    startup: 10,
    active: 4,
    recovery: 16,
    damage: 80,
    chip: 16,
    hitstun: 16,
    blockstun: 10,
    range: 50,
    hitboxH: 32,
    hitboxYOffset: 24,
    meterCost: 0,
    knockback: 6,
    popY: 0,
  },
  // M0 special is a melee "burst", not a projectile. Projectile specials come later.
  special: {
    startup: 12,
    active: 6,
    recovery: 20,
    damage: 120,
    chip: 24,
    hitstun: 20,
    blockstun: 12,
    range: 78,
    hitboxH: 36,
    hitboxYOffset: 20,
    meterCost: 50,
    knockback: 10,
    popY: -8,
  },
};

export function attackDuration(data: AttackData): number {
  return data.startup + data.active + data.recovery;
}

export function attackPhaseOf(
  data: AttackData,
  attackT: number,
): "startup" | "active" | "recovery" {
  if (attackT < data.startup) return "startup";
  if (attackT < data.startup + data.active) return "active";
  return "recovery";
}
