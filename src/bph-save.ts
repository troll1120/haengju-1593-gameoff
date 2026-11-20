import type { BphDrawResult, BphSave, BphWallet } from "./bph-contract";
import { BPH_PACKS, BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { migrateBphHiddenUpgrades } from "./bph-upgrade-migration";
import { foldBphMergedBalances } from "./bph-cost-merge";
import { reconcileBphCodexRewards } from "./bph-codex-rewards";
import { parseBphShop } from "./bph-shop-save";
import { migrateQuestIncomeReceipts } from "./bph-quests";
import { parseBphUnitUpgrades } from "./bph-unit-upgrades";
import { parseBphGeneralUpgrades } from "./bph-general-upgrades";
import { parseGeneralGrowthRank } from "./bph-general-growth-upgrade";
import { bphUnitPack } from "./bph-recruit";
import { bphScaledMedals } from "./bph-medal-scale";

export const freshBphSave = (seed = 1593): BphSave => ({
  version: 1, medalScale: 1, rng: seed >>> 0 || 1, coins: 3, income: 3,
  resources: { mastery: 0, skull: 0, coinIncome: 0, zenith: 0, ink: 0, fruit: 0,
    foilium: 0, shard: 0, runeA: 0, runeB: 0, runeC: 0, prestigePoint: 0, relic: 0 },
  packs: {}, discovered: [], foils: [], seen: [], purchasedNodes: [], purchasedPlacements: [], unitUpgrades: {},
  questProgress: {}, questActivatedAt: {}, firstThunderstorm: false, firstSquireFoil: false,
  totalOpened: 0, totalKills: 0, chapter: 0, dimension: 0, inventory: [],
  nextPackId: 1, nextResultId: 1, pendingResults: [], unlockedGenerals: ["권율"],
  relicState: { owned: [], discovered: [], equipped: [], destroyed: [], slots: 0, recoveries: 0 },
  lifecycle: { campaignAttempt: 1, managementVisit: 1, claimed: [] }, salaryApplied: 0,
});
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const amount = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
const count = (value: unknown, fallback = 0): number => Math.floor(amount(value, fallback));
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string"))] : [];
const counters = (value: unknown): Record<string, number> =>
  object(value) ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, amount(v)])) : {};
/** Known fields are parsed, while fields owned by newer/other lanes survive a round trip. */
function preserveUnknown(original: Record<string, unknown>, parsed: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries({ ...original, ...parsed }).map(([key, value]) =>
    [key, object(original[key]) && object(value) ? preserveUnknown(original[key], value) : value]));
}
function wallet(value: unknown): BphWallet {
  const fresh = freshBphSave().resources;
  if (!object(value)) return fresh;
  return {
    mastery: amount(value.mastery), skull: amount(value.skull), coinIncome: amount(value.coinIncome),
    zenith: amount(value.zenith), ink: amount(value.ink), fruit: amount(value.fruit),
    foilium: amount(value.foilium), shard: amount(value.shard), runeA: amount(value.runeA),
    runeB: amount(value.runeB), runeC: amount(value.runeC), prestigePoint: amount(value.prestigePoint),
    relic: amount(value.relic),
  };
}
function result(value: unknown): BphDrawResult | null {
  if (!object(value) || typeof value.packId !== "string" || !BPH_PACKS[value.packId]
    || !Array.isArray(value.cards) || !count(value.id)) return null;
  const reason = value.reason;
  if (reason !== "opening" && reason !== "scheduled" && reason !== "hero-pity" && reason !== "weighted") return null;
  const cards: BphDrawResult["cards"][number][] = [];
  for (const card of value.cards) {
    if (!object(card) || typeof card.profileId !== "string" || !count(card.copies)) return null;
    cards.push({ profileId: card.profileId, foil: card.foil === true, ...(card.giant === true ? { giant: true } : {}),
      ...(typeof card.foilDiscovered === "boolean" ? { foilDiscovered: card.foilDiscovered } : {}),
      copies: count(card.copies), discovered: card.discovered === true });
  }
  return { id: count(value.id), packId: value.packId, ordinal: count(value.ordinal),
    cards, frenzy: value.frenzy === true, reason,
    ...(typeof value.multiplier === "number" && value.multiplier > 1 ? { multiplier: Math.floor(value.multiplier) } : {}),
    ...(typeof value.spawned === "number" && value.spawned >= 0 ? { spawned: Math.floor(value.spawned) } : {}) };
}
/** Parse persisted JSON at its only boundary; internal APIs receive BphSave. */
export function parseBphSave(value: unknown): BphSave {
  const save = freshBphSave();
  if (!object(value) || value.version !== 1) return save;
  save.rng = count(value.rng, save.rng) >>> 0;
  save.coins = amount(value.coins, 3); save.income = amount(value.income, 3);
  save.resources = wallet(value.resources);
  if (object(value.packs)) for (const [id, v] of Object.entries(value.packs)) {
    if (BPH_PACKS[id] && object(v)) save.packs[id] = {
      opened: count(v.opened), sinceNewHero: count(v.sinceNewHero), sinceNewFoil: count(v.sinceNewFoil),
    };
  }
  // Enemy IDs are discovered by combat too, so do not restrict this to ally IDs.
  save.discovered = strings(value.discovered); save.foils = strings(value.foils);
  save.seen = strings(value.seen); save.purchasedNodes = strings(value.purchasedNodes);
  save.purchasedPlacements = strings(value.purchasedPlacements);
  if (value.pendingSupplyPacks !== undefined)
    save.pendingSupplyPacks = strings(value.pendingSupplyPacks).filter(id => id !== "Pack1_Basic" && bphUnitPack(id));
  save.questProgress = counters(value.questProgress); save.questActivatedAt = counters(value.questActivatedAt);
  if (object(value.killTally)) save.killTally = counters(value.killTally);
  save.firstThunderstorm = value.firstThunderstorm === true || save.discovered.includes("Tome_Thunderstorm");
  save.firstSquireFoil = value.firstSquireFoil === true || save.foils.includes("Hero1_Squire");
  if (value.foilTooltipSeen === true) save.foilTooltipSeen = true;
  if (value.foilHintVersion === 1) save.foilHintVersion = 1;
  save.totalOpened = count(value.totalOpened); save.totalKills = count(value.totalKills);
  save.chapter = count(value.chapter); save.dimension = count(value.dimension);
  if (Array.isArray(value.inventory)) for (const item of value.inventory) {
    if (object(item) && typeof item.packId === "string" && BPH_PACKS[item.packId] && count(item.id)
      && !save.inventory.some(pack => pack.id === item.id)) {
      save.inventory.push({ id: count(item.id), packId: item.packId, box: item.box === true,
        ...(typeof item.sourceBuilding === "string" ? { sourceBuilding: item.sourceBuilding } : {}),
        ...(typeof item.sourceWave === "string" ? { sourceWave: item.sourceWave } : {}),
        ...(typeof item.foilChanceBonus === "number" ? { foilChanceBonus: amount(item.foilChanceBonus) } : {}),
        ...(typeof item.giantChance === "number" ? { giantChance: amount(item.giantChance) } : {}),
        ...(typeof item.multiplier === "number" && item.multiplier > 1 ? { multiplier: Math.floor(item.multiplier) } : {}) });
    }
  }
  if (Array.isArray(value.pendingResults)) for (const item of value.pendingResults) {
    const parsed = result(item);
    if (parsed && !save.pendingResults.some(item => item.id === parsed.id)) save.pendingResults.push(parsed);
  }
  save.nextPackId = Math.max(1, count(value.nextPackId), ...save.inventory.map(item => item.id + 1));
  save.nextResultId = Math.max(1, count(value.nextResultId), ...save.pendingResults.map(item => item.id + 1));
  save.unlockedGenerals = [...new Set(["권율", ...strings(value.unlockedGenerals)])];
  if (object(value.relicState)) {
    const relics = value.relicState;
    save.relicState = { owned: strings(relics.owned), discovered: strings(relics.discovered),
      equipped: strings(relics.equipped), destroyed: strings(relics.destroyed),
      slots: count(relics.slots), recoveries: count(relics.recoveries) };
  }
  if (object(value.lifecycle)) save.lifecycle = {
    campaignAttempt: Math.max(1, count(value.lifecycle.campaignAttempt)),
    managementVisit: Math.max(1, count(value.lifecycle.managementVisit)),
    claimed: strings(value.lifecycle.claimed).filter(id => !id.startsWith("mastery-respec:")),
  };
  save.salaryApplied = amount(value.salaryApplied);
  const refund = value.hiddenUpgradeRefund;
  if (object(refund) && (refund.version === 1 || refund.version === 2)) {
    save.hiddenUpgradeRefund = { version: refund.version, count: count(refund.count),
      resources: wallet(refund.resources), announced: refund.announced === true,
      ...(refund.version === 2 ? { movedCount: count(refund.movedCount) } : {}) };
  }
  migrateBphHiddenUpgrades(save);
  foldBphMergedBalances(save);
  if (object(value.codexRewards) && value.codexRewards.version === 1) {
    save.codexRewards = { version: 1, claimed: strings(value.codexRewards.claimed),
      pendingGold: amount(value.codexRewards.pendingGold) };
  }
  reconcileBphCodexRewards(save);
  const { shop: savedShop, unitUpgrades, generalUpgrades, generalGrowthSpeed, masteryWebPayments: _retiredPayments, ...original } = value;
  save.unitUpgrades = parseBphUnitUpgrades(unitUpgrades);
  const generalStages = parseBphGeneralUpgrades(generalUpgrades, save.unlockedGenerals);
  if (generalStages) save.generalUpgrades = generalStages;
  const growth = parseGeneralGrowthRank(generalGrowthSpeed);
  if (growth > 0) save.generalGrowthSpeed = growth;
  Object.assign(save, preserveUnknown(original, save));
  if (value.medalScale !== 1) {
    save.resources.mastery = bphScaledMedals(save.resources.mastery);
    if (save.hiddenUpgradeRefund)
      save.hiddenUpgradeRefund.resources.mastery = bphScaledMedals(save.hiddenUpgradeRefund.resources.mastery);
  }
  if (savedShop !== undefined) {
    const shop = parseBphShop(savedShop);
    if (shop) save.shop = shop;
  }
  if (save.chapter >= 3) grantBphReachabilityFoil(save);
  migrateQuestIncomeReceipts(save);
  return save;
}
/** First C3 survival reward and legacy C4 entry share one persistent receipt. */
export function grantBphReachabilityFoil(save: BphSave): void {
  const receipt = "reachability:v1:foil:C3";
  if (save.lifecycle.claimed.includes(receipt)) return;
  save.resources.foilium += 10;
  save.lifecycle.claimed.push(receipt);
}
export function acknowledgeBphResult(save: BphSave, id: number): boolean {
  const index = save.pendingResults.findIndex(item => item.id === id);
  if (index < 0) return false;
  save.pendingResults.splice(index, 1);
  return true;
}
export function bphDiscoveryName(id: string): string {
  return BPH_PROFILES[id]?.name ?? BPH_TOMES[id]?.name ?? id;
}
