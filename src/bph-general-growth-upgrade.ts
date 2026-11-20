import type { BphGeneralGrowthRank, BphSave } from "./bph-contract";

export const GENERAL_GROWTH_UPGRADE = {
  id: "generalGrowthSpeed", name: "장수 성장 속도",
  costs: [100, 150, 200, 250, 350], secondsPerRank: 60,
} as const;

export function parseGeneralGrowthRank(value: unknown): BphGeneralGrowthRank {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : 0;
}

export function generalGrowthRank(save: BphSave): number {
  return save.generalGrowthSpeed ?? 0;
}

export function generalGrowthUpgradePrice(save: BphSave): number | undefined {
  return GENERAL_GROWTH_UPGRADE.costs.at(generalGrowthRank(save));
}

export function generalGrowthSecondsSaved(save: BphSave): number {
  return generalGrowthRank(save) * GENERAL_GROWTH_UPGRADE.secondsPerRank;
}

export function buyGeneralGrowthUpgrade(save: BphSave): boolean {
  const rank = save.generalGrowthSpeed ?? 0;
  if (rank === 5) return false;
  const price = GENERAL_GROWTH_UPGRADE.costs[rank];
  if (save.resources.mastery < price) return false;
  save.resources.mastery -= price;
  save.generalGrowthSpeed = ([1, 2, 3, 4, 5] as const)[rank];
  return true;
}
