import type { BphEffect, BphFxContext } from "./bph-contract";
import { BPH_PROFILES } from "./bph-data";
import type { Unit } from "./rules";

export const nativeUnits = (ctx: BphFxContext): Unit[] =>
  ctx.run.squads.flatMap(squad => [squad, ...squad.soldiers]);

/** Intrinsic rows from skill_effects.csv, not account-owned foil upgrades. */
const intrinsic: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  Hero3_Portal: { HeroSpellCastSpeed: 0.5 },
  Hero3_Illusionist: { HeroExtraCopiesMultiplier: 0.5 },
  Hero5_Treant: { TreantSeedBounce: 1 },
};

export function nativeEffects(ctx: BphFxContext, unit: Unit, kind: string): readonly BphEffect[] {
  const id = ctx.profileId(unit), profile = id && BPH_PROFILES[id];
  if (!profile) return [];
  return ctx.effects.filter(effect => effect.type === kind && !effect.nodeId.startsWith("FOIL_")
    && (!effect.targets.targetHero || effect.targets.targetHero === id
      || (id === "Hero_SkeletonUpgraded" && effect.targets.targetHero === "Hero_Skeleton"))
    && (!Number(effect.targets.targetClass) || ctx.originalClasses(unit).includes(Number(effect.targets.targetClass)))
    && (effect.targets.useTargetRarity !== "1" || Number(effect.targets.targetRarity) === profile.rarity));
}

export function nativeTotal(ctx: BphFxContext, unit: Unit, kind: string): number {
  const info = ctx.unitInfo(unit);
  return nativeEffects(ctx, unit, kind).reduce((sum, effect) => sum + effect.value, 0)
    + (info?.foil ? intrinsic[unit.bph?.birthProfileId ?? info.profileId]?.[kind] ?? 0 : 0);
}

/** Collection membership is inferred; weights are native Hero 0xa00fd0-0xa01018. */
export function nativeCollectionPool(ctx: BphFxContext): readonly { id: string; weight: number }[] {
  return [...new Set(ctx.save.discovered)].flatMap(id => {
    const profile = BPH_PROFILES[id];
    if (!profile?.collectible || Number(profile.raw.heroType) === 13) return [];
    const weight = [8, 6, 4, 2][profile.rarity];
    return weight > 0 ? [{ id, weight }] : [];
  });
}
