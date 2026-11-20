import type { BphSave, BphWallet } from "./bph-contract";
import { BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES, BPH_MOVED_UNIT_UPGRADES, BPH_V1_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { withBphArmyTraining } from "./bph-army-training";
import { mergeBphNodeCosts } from "./bph-cost-merge";
import { tr } from "./i18n";

/** Purchase order is persisted by buyBphNode's append-only placement array.
 * Replay that prefix to apply only discounts already owned at the time of payment.
 * Definition-only IDs never charged resources under that contract. */
/** Refunds return what was historically paid, in every wallet currency, before merged ones fold into mastery. */
const WALLET = { mastery: 0, skull: 0, coinIncome: 0, zenith: 0, ink: 0, fruit: 0, foilium: 0, shard: 0,
  runeA: 0, runeB: 0, runeC: 0, prestigePoint: 0, relic: 0 } as const satisfies BphWallet;

export function migrateBphHiddenUpgrades(save: BphSave): void {
  const previous = save.hiddenUpgradeRefund;
  if (previous?.version === 2) return;
  const refunds: BphWallet = { ...WALLET };
  // Storage loads before prepareBphUpgrades; do not use its lazy placement map here.
  const { nodes, grids } = withBphArmyTraining({ nodes: BPH_UPGRADE_NODES, grids: BPH_UPGRADE_GRIDS });
  const placements = new Map(grids.flatMap(grid => grid.placements.map(p => [p.id, p] as const)));
  const merged = mergeBphNodeCosts(nodes);
  let masteryReduction = 0;
  let count = 0, movedCount = 0;
  for (const id of save.purchasedPlacements) {
    const placement = placements.get(id);
    const node = placement?.nodeId ? nodes[placement.nodeId] : undefined;
    const moved = node && BPH_MOVED_UNIT_UPGRADES.has(node.id);
    if (node && (moved || (!previous && BPH_V1_HIDDEN_UPGRADES.has(node.id)))) {
      count++;
      if (moved) movedCount++;
      // Stage 2 prices come from the playable, merged-currency tree.
      const costs = moved ? merged[node.id].costs : node.costs;
      for (const resource of Object.keys(WALLET)) {
        if (isResource(resource) && !node.values.isFree) {
          refunds[resource] += costs[resource] * (resource === "mastery" ? Math.max(0, 1 - masteryReduction) : 1);
        }
      }
    }
    if (node) masteryReduction += node.effects.filter(effect => effect.type === "NodeMasteryCostReduction")
      .reduce((sum, effect) => sum + effect.value, 0);
  }
  for (const resource of Object.keys(WALLET)) {
    if (isResource(resource)) save.resources[resource] += refunds[resource];
  }
  save.purchasedPlacements = save.purchasedPlacements.filter(id => {
    const nodeId = placements.get(id)?.nodeId;
    return !nodeId || !BPH_HIDDEN_UPGRADES.has(nodeId);
  });
  save.purchasedNodes = save.purchasedNodes.filter(id => !BPH_HIDDEN_UPGRADES.has(id));
  const outstanding = previous && !previous.announced ? previous.count : 0;
  const outstandingCount = count + outstanding;
  const resources = previous ? { ...previous.resources } : { ...WALLET };
  for (const resource of Object.keys(WALLET)) {
    if (isResource(resource)) resources[resource] += refunds[resource];
  }
  save.hiddenUpgradeRefund = { version: 2, count: outstandingCount, movedCount, resources, announced: outstandingCount === 0 };
}

function isResource(key: string): key is keyof BphWallet {
  return Object.hasOwn(WALLET, key);
}

/** Acknowledgement is persisted by the UI in the same account write as the refund. */
export function takeBphRefundNotice(save: BphSave): string | null {
  const refund = save.hiddenUpgradeRefund;
  if (!refund || refund.announced || !refund.count) return null;
  refund.announced = true;
  if (refund.movedCount) return tr`병종 강화로 옮긴 강화 ${refund.movedCount}개를 정리하고 재화를 돌려드렸어요`;
  return tr`효과 없는 강화 ${refund.count}개를 정리하고 재화를 돌려드렸어요`;
}
