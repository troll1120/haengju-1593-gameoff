import type { BphSave } from "./bph-contract";
import { BPH_PROFILES, BPH_TOMES } from "./bph-data";

// Original sharedassets1.assets:2738 / PrestigeStats. The native tooltips say
// current level only; zero hero/tome overrides use FoilManager, not prior levels.
const PRESTIGE = [
  { foilChance: .00800000037997961, foilPity: .00570000009611249, monsterFoilChance: 0, foilHeroesDropFoilium: false },
  { foilChance: 0, foilPity: 0, monsterFoilChance: .00004999999873689376, foilHeroesDropFoilium: false },
  { foilChance: 0, foilPity: 0, monsterFoilChance: .00004999999873689376, foilHeroesDropFoilium: false },
] as const;
// Original level1:45085 / FoilManager defaults and Common/Rare/Epic/Legendary gates.
const FOIL_MANAGER = {
  foilChance: .009999999776482582, foilPity: .0066999997943639755,
  copiesBeforeFoil: [8, 7, 5, 3],
} as const;

export function bphDrawPrestige(dimension: number) {
  const level = PRESTIGE[Math.min(dimension, PRESTIGE.length - 1)];
  return { ...level, foilChance: level.foilChance || FOIL_MANAGER.foilChance,
    foilPity: level.foilPity || FOIL_MANAGER.foilPity };
}

/** Inferred inclusive deadline convention. Conditional hazard is equivalent to
 * a uniformly rolled Min..Max deadline, without adding saved target fields. */
export function bphDrawWindowChance(age: number, min: number, max: number): number {
  if (min <= 0 || age < min) return 0;
  const end = Math.max(min, max);
  return age >= end ? 1 : 1 / (end - age + 1);
}

export function bphDrawFoilEligible(save: BphSave, id: string): boolean {
  const card = BPH_PROFILES[id] ?? BPH_TOMES[id];
  return !!card && (save.foils.includes(id) || (save.discovered.includes(id)
    && (save.questProgress[`draw:foil-copies:${id}`] ?? 0) >= FOIL_MANAGER.copiesBeforeFoil[card.rarity]));
}
