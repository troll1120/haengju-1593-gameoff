import type { BphEffect, BphProgressEvent, BphResource, BphSave } from "./bph-contract";
import { t, tr } from "./i18n";
import { BPH_PROFILES, BPH_TOMES } from "./bph-data";
import { BPH_DEFAULT_GRID, BPH_UPGRADE_GRIDS as sourceGrids, BPH_UPGRADE_NODES as sourceNodes, loadBphUpgradeData } from "./bph-upgrade-data";
import { withBphArmyTraining } from "./bph-army-training";
import type { BphPlacement, BphUpgradeNode } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { notifyBphQuestCompletion } from "./bph-account";
import { refreshBphEffects } from "./bph-fx-dispatch";
import type { BphQuestClaim } from "./bph-effects-entry";
import { BPH_QUEST_ENTRY } from "./bph-quests";
import { bphPlacementLocks as locks, connectedBphPlacement as connected, reachedBphPlacements } from "./bph-upgrade-graph";
export { adjacentBphPlacements, visibleBphPlacements, bphRiftPassThrough } from "./bph-upgrade-graph";

let registry = withBphArmyTraining({ nodes: sourceNodes, grids: sourceGrids });
export let BPH_UPGRADE_NODES = registry.nodes;
export let BPH_UPGRADE_GRIDS = registry.grids;
export const BPH_PLACEMENTS: ReadonlyMap<string, BphPlacement> = new Map(
  BPH_UPGRADE_GRIDS.flatMap(grid => grid.placements.map(p => [p.id, p] as const)),
);
export async function prepareBphUpgrades(): Promise<void> {
  await loadBphUpgradeData();
  registry = withBphArmyTraining({ nodes: sourceNodes, grids: sourceGrids });
  BPH_UPGRADE_NODES = registry.nodes;
  BPH_UPGRADE_GRIDS = registry.grids;
  const placements = BPH_PLACEMENTS;
  if (placements instanceof Map && placements.size === 0) {
    for (const grid of BPH_UPGRADE_GRIDS) for (const p of grid.placements) placements.set(p.id, p);
  }
}
export function bphPlacementIsUpgrade(id: string): boolean {
  const nodeId = BPH_PLACEMENTS.get(id)?.nodeId;
  return Boolean(nodeId && !BPH_HIDDEN_UPGRADES.has(nodeId) && BPH_UPGRADE_NODES[nodeId]?.type === 0);
}
const value = (node: BphUpgradeNode, key: string) => node.values[key] ?? 0;
const nodeOf = (p: BphPlacement) => p.nodeId ? BPH_UPGRADE_NODES[p.nodeId] : undefined;

/** Unsupported observations remain explicit; discovering a card is not spawning that hero. */
export function bphQuestUnknowns(node: BphUpgradeNode): readonly string[] {
  return BPH_QUEST_ENTRY.questUnsupportedFields(node);
}

function questAmount(save: BphSave, p: BphPlacement, node: BphUpgradeNode): number {
  if (value(node, "questCompleteTotalQuests")) return save.purchasedPlacements.filter(id => {
    const entry = BPH_PLACEMENTS.get(id);
    return entry && nodeOf(entry)?.type === 4;
  }).length;
  if (value(node, "questPurchaseUpgradeNodes")) return save.purchasedPlacements.filter(id => {
    const entry = BPH_PLACEMENTS.get(id);
    return entry && nodeOf(entry)?.type === 0;
  }).length;
  if (value(node, "questDiscoverUnits")) return save.discovered.filter(id => BPH_PROFILES[id] || BPH_TOMES[id]).length;
  return BPH_QUEST_ENTRY.questAmount(save, p, node);
}
const claims = (save: BphSave, id: string) => save.questProgress[`claims:${id}`] ?? 0;
export { claims as bphQuestClaims };

/** Preview shares the exact atomic purchase checks used by the view. */
export function bphNodeBlockers(save: BphSave, placementId: string): readonly string[] {
  const p = BPH_PLACEMENTS.get(placementId), node = p && nodeOf(p);
  if (!p || !node) return [t("원본 노드 참조 미확인")];
  if (BPH_HIDDEN_UPGRADES.has(node.id)) return [t("제거된 강화")];
  const reasons = locks(save, p, node);
  if (value(node, "isChaos")) reasons.push("혼돈 비용의 재화·진행 인덱스 미확인");
  const threshold = node.thresholds[claims(save, p.id)];
  if (save.purchasedPlacements.includes(p.id) && (node.type !== 4 || threshold === undefined)) reasons.push("구입 완료");
  if (!connected(save, p, reachedBphPlacements(save))) reasons.push("연결된 선행 노드 필요");
  if (node.type === 4) {
    if (bphQuestUnknowns(node).length) reasons.push("집계 이벤트 미확인");
    if (threshold !== undefined && questAmount(save, p, node) < threshold) reasons.push("퀘스트 진행 부족");
  }
  for (const resource of Object.keys(node.costs)) {
    if (isResource(resource) && (resource === "coinIncome" ? save.income : save.resources[resource]) < bphNodeCost(save, node, resource))
      reasons.push(tr`${BPH_RESOURCE_LABELS[resource]} 부족`);
  }
  return reasons.map(t);
}

export const BPH_RESOURCE_LABELS = {
  mastery: "강화 포인트", skull: "전공", coinIncome: "수입", zenith: "명성", ink: "군령",
  fruit: "군량", foilium: "금박", shard: "조각", runeA: "공격 부적", runeB: "수비 부적",
  runeC: "지원 부적", prestigePoint: "진영 점수", relic: "유물",
} as const satisfies Record<BphResource, string>;
function isResource(key: string): key is BphResource { return Object.hasOwn(BPH_RESOURCE_LABELS, key); }

export function bphNodeCost(save: BphSave, node: BphUpgradeNode, resource: BphResource): number {
  if (value(node, "isFree")) return 0;
  const reduction = resource === "mastery" ? activeBphEffects(save).filter(e => e.type === "NodeMasteryCostReduction").reduce((sum, e) => sum + e.value, 0) : 0;
  return node.costs[resource] * Math.max(0, 1 - reduction);
}
export function canBuyBphNode(save: BphSave, placementId: string): boolean {
  return bphNodeBlockers(save, placementId).length === 0;
}

export function buyBphNode(save: BphSave, placementId: string): boolean {
  if (!canBuyBphNode(save, placementId)) return false;
  const p = BPH_PLACEMENTS.get(placementId), node = p && nodeOf(p);
  if (!p || !node) return false;
  const costs = Object.keys(BPH_RESOURCE_LABELS).flatMap(key => isResource(key) ? [[key, bphNodeCost(save, node, key)] as const] : []);
  const claim: BphQuestClaim = { placementId, nodeId: node.id, claim: claims(save, placementId) + 1,
    receiptId: `quest:${placementId}:${claims(save, placementId) + 1}` };
  for (const [key, cost] of costs) {
    if (key === "coinIncome") save.income -= cost;
    else save.resources[key] -= cost;
  }
  if (!save.purchasedPlacements.includes(placementId)) save.purchasedPlacements.push(placementId);
  if (!save.purchasedNodes.includes(node.id)) save.purchasedNodes.push(node.id);
  if (node.type === 4) {
    save.questProgress[`claims:${placementId}`] = claim.claim;
    BPH_QUEST_ENTRY.claimQuestRewards(save, p, node, claim);
    const rewards = { mastery: "questMasteryReward", skull: "flatSkullBonus", zenith: "questZenithReward",
      runeA: "questRuneAReward", runeB: "questRuneBReward", runeC: "questRuneCReward" } as const;
    for (const [key, field] of Object.entries(rewards)) if (isResource(key)) save.resources[key] += value(node, field);
  }
  for (const effect of node.effects) {
    const resource = { GainRuneA: "runeA", GainRuneB: "runeB", GainRuneC: "runeC" } as const;
    if (effect.type === "GainRuneA" || effect.type === "GainRuneB" || effect.type === "GainRuneC") save.resources[resource[effect.type]] += effect.value;
  }
  activateBphQuests(save);
  refreshBphEffects(save, activeBphEffects(save));
  if (node.type === 4) notifyBphQuestCompletion(save, placementId, claim);
  return true;
}

/** Each purchased placement contributes independently; definition IDs alone grant nothing.
 * An equipped relic contributes its definition once, keyed by the relic instead of a placement. */
export function activeBphEffects(save: BphSave): readonly BphEffect[] {
  const placed = save.purchasedPlacements.flatMap(id => {
    const p = BPH_PLACEMENTS.get(id), node = p && nodeOf(p);
    if (!node || BPH_HIDDEN_UPGRADES.has(node.id)) return [];
    const hooks = node.type === 4 ? Object.entries(node.refs).filter(([key]) => /Reward$/.test(key)) :
      node.type === 6 ? [["riftSkillTreeGrid", node.refs.riftSkillTreeGrid ?? BPH_DEFAULT_GRID]] :
      node.type === 9 ? [["doorPrestigeLevel", String(value(node, "doorPrestigeLevel"))]] : [];
    const rewards = hooks.map(([type, target]) => ({
      nodeId: node.id, type, value: node.type === 4 ? claims(save, id) : 1, effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
      targets: { ...node.refs, target, placementId: id },
    }));
    return [...node.effects.map(e => ({ ...e, targets: { ...e.targets, placementId: id } })), ...rewards];
  });
  const relics = save.relicState.equipped.flatMap(id => {
    const node = BPH_UPGRADE_NODES[id];
    if (node?.type !== 5 || BPH_HIDDEN_UPGRADES.has(id) || save.relicState.destroyed.includes(id)) return [];
    return node.effects.map(e => ({ ...e, targets: { ...e.targets, placementId: `relic:${id}` } }));
  });
  return relics.length ? [...placed, ...relics] : placed;
}

export function activateBphQuests(save: BphSave): void {
  const reached = reachedBphPlacements(save);
  for (const p of BPH_PLACEMENTS.values()) {
    const node = nodeOf(p);
    if (node?.type !== 4 || save.questActivatedAt[p.id] !== undefined || save.purchasedPlacements.includes(p.id)) continue;
    if (locks(save, p, node).length === 0 && connected(save, p, reached)) {
      save.questActivatedAt[p.id] = save.totalOpened;
      save.questProgress[p.id] ??= 0;
    }
  }
}
/** Activation-local counting is our documented policy; original retroactive scope is unconfirmed. */
export function recordBphProgress(save: BphSave, event: BphProgressEvent): void {
  const active = new Set(Object.keys(save.questActivatedAt));
  for (const id of active) {
    const p = BPH_PLACEMENTS.get(id), node = p && nodeOf(p);
    if (!p || !node || (save.purchasedPlacements.includes(id) && node.thresholds[claims(save, id)] === undefined)) continue;
    let count = 0;
    switch (event.kind) {
      case "pack-opened": if (node.refs.questPack === event.packId) count = event.count; break;
      case "enemy-killed":
        if ([node.refs.questMonster, node.refs.questMonsterAlt].includes(event.enemyId)) count = event.count;
        break;
      case "card-discovered": break;
      case "run-ended": break;
      case "chapter-entered": break;
      default: event satisfies never;
    }
    save.questProgress[id] = (save.questProgress[id] ?? 0) + count;
  }
  activateBphQuests(save);
}
