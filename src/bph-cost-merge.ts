import type { BphResource, BphSave } from "./bph-contract";
import type { BphUpgradeNode } from "./bph-upgrade-data";

/** Owner DM 1794932710.472839: 전공·조각·군량·수입·진영 점수 fold into 강화 포인트 (mastery).
 * None of the five has a per-run producer in survival (only one-time discoveries/quests), so each
 * rate prices a node at the same tree tier: the median main-tree mastery node (1500) over the
 * median node price in that currency (skull 33, shard 11, fruit 40, prestigePoint 1, coinIncome 4). */
export const BPH_MERGED_RATES = { skull: 45, shard: 136, fruit: 38, prestigePoint: 1500, coinIncome: 375 } as const;
export type BphMergedResource = keyof typeof BPH_MERGED_RATES;
export const isBphMergedResource = (resource: BphResource): resource is BphMergedResource =>
  Object.hasOwn(BPH_MERGED_RATES, resource);

export type BphKeptResource = Exclude<BphResource, BphMergedResource>;
export function bphMergedReward(resource: BphResource, amount: number): { readonly resource: BphKeptResource; readonly amount: number } {
  return isBphMergedResource(resource) ? { resource: "mastery", amount: amount * BPH_MERGED_RATES[resource] } : { resource, amount };
}

export function mergeBphNodeCosts(nodes: Readonly<Record<string, BphUpgradeNode>>): Record<string, BphUpgradeNode> {
  return Object.fromEntries(Object.entries(nodes).map(([id, node]) => {
    const costs = { ...node.costs };
    let moved = 0;
    for (const resource of Object.keys(BPH_MERGED_RATES) as BphMergedResource[]) {
      moved += costs[resource] * BPH_MERGED_RATES[resource];
      costs[resource] = 0;
    }
    return [id, moved ? { ...node, costs: { ...costs, mastery: costs.mastery + moved } } : node];
  }));
}

/** Balances a save still holds in a merged currency become mastery once. Income stays in save.income. */
export function foldBphMergedBalances(save: BphSave): void {
  for (const resource of Object.keys(BPH_MERGED_RATES) as BphMergedResource[]) {
    if (resource === "coinIncome" || !save.resources[resource]) continue;
    save.resources.mastery += save.resources[resource] * BPH_MERGED_RATES[resource];
    save.resources[resource] = 0;
  }
}
