import type { BphEffect } from "./bph-contract";
import { BPH_GENERAL_CLASS, BPH_GENERALS } from "./bph-commanders";
import { BPH_PROFILES } from "./bph-data";
import type { General } from "./roster";
import type { Run } from "./rules";
import { CHAOS_LEVELS, CHAOS_MAX_LEVEL } from "./chaos-contract";
import type { ChaosMods } from "./chaos-contract";
import { BPH_UNIT_STAT_PURCHASES } from "./bph-unit-upgrades";

export type SkillMods = {
  readonly arrowCountBonus: number;
  readonly radiusBonus: number;
  readonly chargeDistanceBonus: number;
  readonly chargeStunBonus: number;
  readonly shieldSecondsBonus: number;
  readonly healRatioBonus: number;
  readonly extraPass: number;
  readonly lineLengthBonus: number;
  readonly militiaCountBonus: number;
};
export type SkillGrowthState = Pick<Run, "level"> & {
  readonly squads: readonly { readonly general: General; readonly tier: number }[];
  readonly bph?: { readonly upgrades: readonly BphEffect[] };
};
const STAT_UPGRADES = new Set([
  "HeroDuration", "HeroMaxHP", "HeroAttackPower", "HeroAttackSpeed", "HeroAttackRange",
  "HeroAreaAttack", "HeroMoveSpeed", "HeroBlockChance", "HeroCritChance",
  "HeroCritDamage", "HeroDamageReduction", "ArcherFireRate", "ArcherRange", "FireMageAttackSpeed",
]);

/** A placement is one purchase even when it raises several stats. Economy and unlocks do not count. */
export function skillUpgradeCount(generalId: General, effects: readonly BphEffect[]): number {
  const general = BPH_GENERALS.find(name => name === generalId);
  if (!general) return 0;
  const profiles = Object.values(BPH_PROFILES).filter(profile => profile.classId === BPH_GENERAL_CLASS[general]);
  const purchases = new Set<string>();
  let unitStatPurchases = 0;
  for (const effect of effects) {
    if (effect.type === BPH_UNIT_STAT_PURCHASES) {
      unitStatPurchases += effect.value;
      continue;
    }
    if (!STAT_UPGRADES.has(effect.type) || effect.value <= 0 || !effect.targets.placementId
      || effect.targets.nodeType !== "0") continue;
    if (!profiles.some(profile =>
      (!effect.targets.targetHero || effect.targets.targetHero === profile.id) &&
      (!Number(effect.targets.targetClass) || Number(effect.targets.targetClass) === Number(profile.raw.heroClass)) &&
      (effect.targets.useTargetRarity !== "1" || profile.rarity === Number(effect.targets.targetRarity)))) continue;
    purchases.add(effect.targets.placementId);
  }
  return purchases.size + unitStatPurchases;
}

/** BPH stat purchases reach tiers at 3 and 6. Legacy combat retains its existing growth rules. */
export function growthFor(generalId: General, runState: SkillGrowthState): {
  readonly tier: 1 | 2 | 3; readonly mods: SkillMods;
  readonly level: number; readonly purchases: number; readonly army: ChaosMods | null;
} {
  const supported = BPH_GENERALS.find(name => name === generalId);
  const purchases = skillUpgradeCount(generalId, runState.bph?.upgrades ?? []);
  const tier = !supported || !runState.bph ? 1 : purchases >= 6 ? 3 : purchases >= 3 ? 2 : 1;
  const level = supported && runState.bph ? Math.min(CHAOS_MAX_LEVEL, purchases) : 0;
  const step = tier - 1;
  return { tier, level, purchases, army: supported ? CHAOS_LEVELS[supported][level] : null, mods: {
    arrowCountBonus: generalId === "권율" ? step * 2 : 0,
    radiusBonus: generalId === "권율" ? step * 8 : generalId === "황진" ? step * 9 : 0,
    chargeDistanceBonus: generalId === "신립" ? step * 24 : 0,
    chargeStunBonus: generalId === "신립" ? step * .2 : 0,
    shieldSecondsBonus: 0,
    healRatioBonus: 0,
    extraPass: generalId === "이순신" ? step : 0,
    lineLengthBonus: 0,
    militiaCountBonus: generalId === "곽재우" ? step : 0,
  } };
}
