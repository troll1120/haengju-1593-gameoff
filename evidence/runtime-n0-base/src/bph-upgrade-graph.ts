import type { BphSave } from "./bph-contract";
import type { BphPlacement, BphUpgradeNode } from "./bph-upgrade-data";
import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { activeBphEffects, BPH_PLACEMENTS, BPH_UPGRADE_NODES } from "./bph-upgrades";

const directions = [
  [-1, 0, "connectLeft", "connectRight"], [1, 0, "connectRight", "connectLeft"],
  [0, -1, "connectDown", "connectUp"], [0, 1, "connectUp", "connectDown"],
] as const;
const value = (node: BphUpgradeNode, key: string) => node.values[key] ?? 0;
const nodeOf = (p: BphPlacement) => p.nodeId ? BPH_UPGRADE_NODES[p.nodeId] : undefined;

/** This role opens a path, never the rift's purchase or child grid. */
export function bphRiftPassThrough(save: BphSave, p: BphPlacement): boolean {
  const node = nodeOf(p);
  return Boolean(node?.type === 6 && value(node, "riftConnectorBeforePrestige2") === 1 && save.dimension < 2);
}

/** Edges require both authored directions and retain horizontal/vertical restrictions. */
export function adjacentBphPlacements(p: BphPlacement): readonly BphPlacement[] {
  const node = nodeOf(p);
  if (!node) return [];
  return directions.flatMap(([dx, dy, from, to]) => {
    const next = BPH_PLACEMENTS.get(`${p.gridId}:${p.x + dx}:${p.y + dy}`);
    const other = next && nodeOf(next);
    if (!next || !other || !value(node, from) || !value(other, to)) return [];
    if (dy && (node.type === 2 || other.type === 2)) return [];
    if (dx && (node.type === 3 || other.type === 3)) return [];
    return [next];
  });
}

export function bphPlacementLocks(save: BphSave, p: BphPlacement, node: BphUpgradeNode): string[] {
  const reasons: string[] = [];
  if (save.dimension < Math.max(value(node, "prestigeLock"), p.prestigeLock)) reasons.push("차원 잠금");
  if (node.refs.requiredHero && !save.discovered.includes(node.refs.requiredHero)) reasons.push("지정 병력 미발견");
  if (node.refs.requiredTome && !save.discovered.includes(node.refs.requiredTome)) reasons.push("지정 책략 미발견");
  const pack = node.refs.requiredPack;
  if (pack && pack !== "Pack1_Basic" && !(save.packs[pack]?.opened ?? 0) &&
    !activeBphEffects(save).some(effect => effect.type === "ShopUnlockTargetPack" && effect.targets.targetPack === pack))
    reasons.push("지정 모집 미해금");
  if (p.gridId.startsWith("_SkillTreePrestige") && save.dimension < Number(p.gridId.slice(-1))) reasons.push("차원 잠금");
  if (![BPH_DEFAULT_GRID, "_SkillTreePrestige1", "_SkillTreePrestige2"].includes(p.gridId)) {
    const entered = save.purchasedPlacements.some(id => {
      const bought = BPH_PLACEMENTS.get(id);
      return bought && nodeOf(bought)?.refs.riftSkillTreeGrid === p.gridId;
    });
    if (!entered) reasons.push("균열 미해금");
  }
  return reasons;
}

/** One role judgment for connectivity, the hidden fixed point, visibility and quests. */
function actsAsConnector(save: BphSave, p: BphPlacement): boolean {
  const node = nodeOf(p);
  return Boolean(node && ([1, 2, 3].includes(node.type) || bphRiftPassThrough(save, p)));
}

/** Purchase connectivity also needs the cell's locks. The pass-through role waives only
 * the rift definition's purchase prestige lock; placement and entry locks still apply. */
function traversable(save: BphSave, p: BphPlacement): boolean {
  const node = nodeOf(p);
  if (!node || !actsAsConnector(save, p)) return false;
  const gate = bphRiftPassThrough(save, p) ? { ...node, values: { ...node.values, prestigeLock: 0 } } : node;
  return bphPlacementLocks(save, p, gate).length === 0;
}

export function connectedBphPlacement(save: BphSave, target: BphPlacement, purchased: ReadonlySet<string>): boolean {
  const targetNode = nodeOf(target);
  if (!targetNode) return false;
  if (target.start && (target.prestigeIgnore === 0 || save.dimension < target.prestigeIgnore)) return true;
  const queue = [...adjacentBphPlacements(target)], visited = new Set([target.id]);
  let purchasedNeighbours = 0;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (visited.has(p.id)) continue;
    visited.add(p.id);
    if (purchased.has(p.id)) { purchasedNeighbours++; continue; }
    if (traversable(save, p)) queue.push(...adjacentBphPlacements(p));
  }
  return purchasedNeighbours >= Math.max(1, value(targetNode, "requiredAdjacentPurchased"));
}

/** Hidden removals cross only at the fixed point of their original purchase gates. */
export function reachedBphPlacements(save: BphSave): Set<string> {
  const reached = new Set(save.purchasedPlacements.filter(id => {
    const node = BPH_PLACEMENTS.get(id)?.nodeId;
    return !node || !BPH_HIDDEN_UPGRADES.has(node);
  }));
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of BPH_PLACEMENTS.values()) {
      const node = nodeOf(p);
      if (!node || !BPH_HIDDEN_UPGRADES.has(node.id) || reached.has(p.id)) continue;
      if (bphPlacementLocks(save, p, node).length === 0 && connectedBphPlacement(save, p, reached)) {
        reached.add(p.id); changed = true;
      }
    }
  }
  return reached;
}

export function visibleBphPlacements(save: BphSave, gridId: string, includeHiddenPaths = false): readonly BphPlacement[] {
  const reached = reachedBphPlacements(save), visible = new Map<string, BphPlacement>();
  const visit = (p: BphPlacement) => {
    if (visible.has(p.id)) return;
    visible.set(p.id, p);
    // Reveal keeps the original rule: connector cells show their neighbours even while locked.
    if (actsAsConnector(save, p)) for (const next of adjacentBphPlacements(p)) visit(next);
  };
  for (const p of BPH_PLACEMENTS.values()) {
    if (p.gridId !== gridId) continue;
    const node = nodeOf(p);
    if (!node) continue;
    if (reached.has(p.id)) {
      visit(p);
      for (const next of adjacentBphPlacements(p)) visit(next);
    } else if (p.start && (gridId !== BPH_DEFAULT_GRID || node.id === "SN_TowerHP") &&
      bphPlacementLocks(save, p, node).length === 0) visible.set(p.id, p);
  }
  return [...visible.values()].filter(p => includeHiddenPaths || !p.nodeId || !BPH_HIDDEN_UPGRADES.has(p.nodeId));
}
