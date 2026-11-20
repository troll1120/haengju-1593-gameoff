import type { BphSave, BphWallet } from "./bph-contract";
import { BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { BPH_RESOURCE_LABELS } from "./bph-upgrades";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";

/** Purchase order is persisted by buyBphNode's append-only placement array.
 * Replay that prefix to apply only discounts already owned at the time of payment.
 * Definition-only IDs never charged resources under that contract. */
export function migrateBphHiddenUpgrades(save: BphSave): void {
  if (save.hiddenUpgradeRefund?.version === 1) return;
  const refunds: BphWallet = { ...save.resources };
  for (const resource of Object.keys(BPH_RESOURCE_LABELS)) {
    if (Object.hasOwn(refunds, resource)) Reflect.set(refunds, resource, 0);
  }
  // Storage loads before prepareBphUpgrades; do not use its lazy placement map here.
  const placements = new Map(BPH_UPGRADE_GRIDS.flatMap(grid => grid.placements.map(p => [p.id, p] as const)));
  let masteryReduction = 0;
  let count = 0;
  for (const id of save.purchasedPlacements) {
    const placement = placements.get(id);
    const node = placement?.nodeId ? BPH_UPGRADE_NODES[placement.nodeId] : undefined;
    if (node && BPH_HIDDEN_UPGRADES.has(node.id)) {
      count++;
      for (const resource of Object.keys(BPH_RESOURCE_LABELS)) {
        if (isResource(resource) && !node.values.isFree) {
          refunds[resource] += node.costs[resource] * (resource === "mastery" ? Math.max(0, 1 - masteryReduction) : 1);
        }
      }
    }
    if (node) masteryReduction += node.effects.filter(effect => effect.type === "NodeMasteryCostReduction")
      .reduce((sum, effect) => sum + effect.value, 0);
  }
  for (const resource of Object.keys(BPH_RESOURCE_LABELS)) {
    if (isResource(resource)) save.resources[resource] += refunds[resource];
  }
  save.purchasedPlacements = save.purchasedPlacements.filter(id => {
    const nodeId = placements.get(id)?.nodeId;
    return !nodeId || !BPH_HIDDEN_UPGRADES.has(nodeId);
  });
  save.purchasedNodes = save.purchasedNodes.filter(id => !BPH_HIDDEN_UPGRADES.has(id));
  save.hiddenUpgradeRefund = { version: 1, count, resources: refunds, announced: count === 0 };
}

function isResource(key: string): key is keyof BphWallet {
  return Object.hasOwn(BPH_RESOURCE_LABELS, key);
}

/** Acknowledgement is persisted by the UI in the same account write as the refund. */
export function takeBphRefundNotice(save: BphSave): string | null {
  const refund = save.hiddenUpgradeRefund;
  if (!refund || refund.announced || !refund.count) return null;
  refund.announced = true;
  return `효과 없는 강화 ${refund.count}개를 정리하고 재화를 돌려드렸어요`;
}
