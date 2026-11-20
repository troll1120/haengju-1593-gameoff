import { strict as assert } from "node:assert";
import type { BphResource, BphSave } from "../src/bph-contract";
import type { Meta } from "../src/meta";
import { enterBphImprovements, notifyBphQuestCompletion, projectBphSalary, startBphCampaignAttempt } from "../src/bph-account";
import { refreshBphEffects } from "../src/bph-fx-dispatch";
import { createBphRun } from "../src/bph-session";
import { prepareBphManagementShop } from "../src/bph-shop-session";
import { BPH_DEFAULT_GRID } from "../src/bph-upgrade-data";
import { bphReachabilityTargets } from "../src/bph-reachability-targets";
import {
  activeBphEffects, BPH_PLACEMENTS, BPH_RESOURCE_LABELS,
  BPH_UPGRADE_NODES, bphNodeBlockers, bphNodeCost, bphQuestClaims, buyBphNode,
} from "../src/bph-upgrades";

export const REACHABILITY_CAMPAIGN_POLICY = "reachability-v1-auto-chapter";
/** main.ts opens its management context with this seed and the selected general. */
const MANAGEMENT_SEED = 1593;
const investmentBuildings = new Set(["SN_Building_Advanced_Unlock", "SN_Building_Magic_Unlock"]);
const ascii = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const resources = Object.keys(BPH_RESOURCE_LABELS).filter(
  (key): key is BphResource => Object.hasOwn(BPH_RESOURCE_LABELS, key),
);
const balances = (save: BphSave) => ({ income: save.income, resources: { ...save.resources } });

export type ReachabilityCandidate = {
  readonly placementId: string;
  readonly nodeId: string;
  readonly quest: boolean;
  readonly training: boolean;
  readonly costs: Readonly<Record<BphResource, number>>;
  readonly blockers: readonly string[];
};

/** One decision only. The manager rebuilds candidates after every actual purchase. */
export function chooseReachabilityPurchase(candidates: readonly ReachabilityCandidate[]) {
  const priority = (row: ReachabilityCandidate) => row.quest ? 0 :
    row.nodeId === "SN_Building_Basic_Unlock" ? 1 :
    investmentBuildings.has(row.nodeId) ? 2 : row.training ? 3 : 4;
  return candidates.filter(row => row.blockers.length === 0).sort((a, b) =>
    priority(a) - priority(b) ||
    (a.quest && b.quest ? ascii(a.placementId, b.placementId) :
      a.costs.mastery - b.costs.mastery || a.costs.foilium - b.costs.foilium ||
      ascii(a.placementId, b.placementId)))[0];
}

/** Product management visit (main.ts entry and per-purchase refresh) driven by reachability-v1. */
export function manageReachabilityAccount(account: { readonly meta: Meta; readonly save: BphSave }) {
  const { meta, save } = account;
  assert(meta.bph === save, "Management requires the account's own save");
  const targets = bphReachabilityTargets();
  const targetIds = new Set(targets.survival), trainingIds = new Set(targets.training20);
  const before = balances(save);
  // The entry run binds account events to the current effects, as the lobby does.
  createBphRun(meta, { seed: MANAGEMENT_SEED, general: "권율", upgrades: activeBphEffects(save), startBattle: false });
  projectBphSalary(save, activeBphEffects(save));
  startBphCampaignAttempt(save); enterBphImprovements(save);
  prepareBphManagementShop(save, activeBphEffects(save));
  const entered = balances(save);
  const purchases: {
    placementId: string; nodeId: string; claim: number | null;
    costs: Readonly<Record<BphResource, number>>;
    before: ReturnType<typeof balances>; after: ReturnType<typeof balances>;
  }[] = [];
  const candidates = (): ReachabilityCandidate[] => [...BPH_PLACEMENTS.values()].flatMap(p => {
    const node = p.nodeId && BPH_UPGRADE_NODES[p.nodeId];
    if (!node) return [];
    const quest = node.type === 4 && p.gridId === BPH_DEFAULT_GRID &&
      p.prestigeLock === 0 && (node.values.prestigeLock ?? 0) === 0;
    if (!quest && !targetIds.has(p.id)) return [];
    if (save.purchasedPlacements.includes(p.id) &&
      (!quest || node.thresholds[bphQuestClaims(save, p.id)] === undefined)) return [];
    const costs = { ...save.resources };
    for (const resource of resources) costs[resource] = bphNodeCost(save, node, resource);
    const blockers = [...bphNodeBlockers(save, p.id)];
    if (investmentBuildings.has(node.id) && save.income - costs.coinIncome < 3)
      blockers.push("policy: investment must leave income >= 3");
    return [{ placementId: p.id, nodeId: node.id, quest, training: trainingIds.has(p.id), costs, blockers }];
  });
  while (true) {
    const available = candidates(), chosen = chooseReachabilityPurchase(available);
    if (!chosen) return {
      before, entered, after: balances(save), purchases,
      blocks: available.map(row => ({ placementId: row.placementId, nodeId: row.nodeId, reasons: row.blockers })),
      progress: {
        core: save.purchasedPlacements.filter(id => targets.core143.includes(id)).length,
        coreTotal: targets.core143.length,
        training: save.purchasedPlacements.filter(id => trainingIds.has(id)).length,
        trainingTotal: targets.training20.length,
      },
    };
    const prior = balances(save);
    assert(buyBphNode(save, chosen.placementId), `Eligible purchase failed: ${chosen.placementId}`);
    const effects = activeBphEffects(save);
    refreshBphEffects(save, effects); projectBphSalary(save, effects);
    prepareBphManagementShop(save, effects);
    for (const id of save.purchasedPlacements) notifyBphQuestCompletion(save, id);
    purchases.push({
      placementId: chosen.placementId, nodeId: chosen.nodeId,
      claim: chosen.quest ? bphQuestClaims(save, chosen.placementId) : null,
      costs: chosen.costs, before: prior, after: balances(save),
    });
  }
}
