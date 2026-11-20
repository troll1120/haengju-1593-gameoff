import { BPH_GENERALS } from "./bph-commanders";
import { GENERAL_GROWTH_UPGRADE, buyGeneralGrowthUpgrade, generalGrowthUpgradePrice } from "./bph-general-growth-upgrade";
import type { BphGeneral } from "./bph-commanders";
import type { BphGeneralUpgradeStages, BphGeneralUpgradeTrack, BphSave } from "./bph-contract";

export { GENERAL_GROWTH_UPGRADE, buyGeneralGrowthUpgrade, generalGrowthRank, generalGrowthSecondsSaved } from "./bph-general-growth-upgrade";

export const GENERAL_UPGRADE_TRACKS = ["health", "attack", "attackSpeed", "skill"] as const satisfies readonly BphGeneralUpgradeTrack[];
export const GENERAL_UPGRADE_PERCENT = 5;
// Same linear tier pricing as a 20-point troop card's stat track.
const BASE_PRICE = 20;

type GeneralGrowthUpgradeId = typeof GENERAL_GROWTH_UPGRADE.id;

export function generalUpgradeMax(track: BphGeneralUpgradeTrack): number | null {
  return track === "skill" ? 5 : null;
}

export function bphGeneralUpgradePrice(save: BphSave, id: GeneralGrowthUpgradeId): number | undefined;
export function bphGeneralUpgradePrice(save: BphSave, general: BphGeneral, track: BphGeneralUpgradeTrack): number | undefined;
export function bphGeneralUpgradePrice(save: BphSave, general: BphGeneral | GeneralGrowthUpgradeId, track?: BphGeneralUpgradeTrack): number | undefined {
  if (general === GENERAL_GROWTH_UPGRADE.id) return generalGrowthUpgradePrice(save);
  if (track === undefined) return;
  const tier = (save.generalUpgrades?.[general]?.[track] ?? 0) + 1;
  const max = generalUpgradeMax(track);
  if (Number.isSafeInteger(tier) && (max === null || tier <= max)) return BASE_PRICE * tier;
}

export function buyBphGeneralUpgrade(save: BphSave, id: GeneralGrowthUpgradeId): boolean;
export function buyBphGeneralUpgrade(save: BphSave, general: BphGeneral, track: BphGeneralUpgradeTrack): boolean;
export function buyBphGeneralUpgrade(save: BphSave, general: BphGeneral | GeneralGrowthUpgradeId, track?: BphGeneralUpgradeTrack): boolean {
  if (general === GENERAL_GROWTH_UPGRADE.id) return buyGeneralGrowthUpgrade(save);
  if (track === undefined || !save.unlockedGenerals.includes(general)) return false;
  const price = bphGeneralUpgradePrice(save, general, track);
  if (price === undefined || save.resources.mastery < price) return false;
  const all = save.generalUpgrades ??= {};
  const stages = all[general] ??= {};
  stages[track] = (stages[track] ?? 0) + 1;
  save.resources.mastery -= price;
  return true;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

export function parseBphGeneralUpgrades(input: unknown, unlocked: readonly string[]): BphGeneralUpgradeStages | undefined {
  if (!isRecord(input)) return;
  const parsed: BphGeneralUpgradeStages = {};
  for (const general of BPH_GENERALS) {
    if (!unlocked.includes(general)) continue;
    const raw = input[general];
    if (!isRecord(raw)) continue;
    for (const track of GENERAL_UPGRADE_TRACKS) {
      const tier = raw[track];
      const max = generalUpgradeMax(track);
      if (typeof tier === "number" && Number.isSafeInteger(tier) && tier > 0 && (max === null || tier <= max)) {
        (parsed[general] ??= {})[track] = tier;
      }
    }
  }
  if (Object.keys(parsed).length) return parsed;
}

export function generalUpgradeMultiplier(upgrades: BphGeneralUpgradeStages | undefined, general: string, track: Exclude<BphGeneralUpgradeTrack, "attackSpeed">): number {
  return 1 + generalUpgradeRank(upgrades, general, track) * GENERAL_UPGRADE_PERCENT / 100;
}

export function generalUpgradeRank(upgrades: BphGeneralUpgradeStages | undefined, general: string, track: BphGeneralUpgradeTrack): number {
  if (!upgrades) return 0;
  const id = BPH_GENERALS.find(name => name === general);
  return id ? upgrades[id]?.[track] ?? 0 : 0;
}

export function generalBasicAttackInterval(legacyCycle: number, rank: number): number {
  // A legacy naval tempo bonus can already beat .25s. Buying speed must never slow it down.
  const floor = Math.min(.25, legacyCycle);
  return floor + (legacyCycle - floor) / (1 + .36 * rank);
}
