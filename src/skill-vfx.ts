import type { Effect, Run, Squad } from "./rules";
import { reachLevel } from "./general-reach";

export type SkillVfx = { readonly tier: number; readonly alpha: number; readonly density: number; readonly heavy: boolean };
const LOOKS: readonly SkillVfx[] = [
  { tier: 0, alpha: .45, density: .18, heavy: false },
  { tier: 1, alpha: .65, density: .4, heavy: false },
  { tier: 2, alpha: .82, density: .7, heavy: true },
  { tier: 3, alpha: 1, density: 1, heavy: true },
];

/** Presentation only: survival's shared combat level and the caster's own promotion reveal richer artwork.
 * Legacy battles use their shared level. Nothing here changes a reach, hit, clock or seeded random stream. */
export function skillVfx(run: Pick<Run, "level" | "chaos" | "bph" | "squads">, squad?: Pick<Squad, "general" | "tier" | "awakened">): SkillVfx {
  if (!squad) return LOOKS[0];
  const level = run.bph ? reachLevel(run) : Math.max(1, Math.min(20, run.level));
  // Awakening is recorded by the rules as tier - 1, not a second promotion.
  const tier = Math.min(3, Math.floor((level - 1) / 6) + Math.max(0, squad.tier - 1));
  return LOOKS[tier];
}

/** Hits keep the recorded commander even when the attacker has moved or its projectile has outlived it. */
export function hitVfx(run: Pick<Run, "level" | "chaos" | "bph" | "squads">, effect: Pick<Effect, "squad">): SkillVfx {
  return skillVfx(run, run.squads.find(squad => squad.id === effect.squad));
}
