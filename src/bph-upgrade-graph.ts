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

/** Edges require both authored directions and retain horizontal/vertical restrictions. The graph is immutable at
 *  runtime, so each placement's neighbourhood is computed once. */
const neighbourhoods = new Map<string, readonly BphPlacement[]>();
export function adjacentBphPlacements(p: BphPlacement): readonly BphPlacement[] {
  const known = neighbourhoods.get(p.id);
  if (known) return known;
  const node = nodeOf(p);
  const list: readonly BphPlacement[] = !node ? [] : directions.flatMap(([dx, dy, from, to]) => {
    const next = BPH_PLACEMENTS.get(`${p.gridId}:${p.x + dx}:${p.y + dy}`);
    const other = next && nodeOf(next);
    if (!next || !other || !value(node, from) || !value(other, to)) return [];
    if (dy && (node.type === 2 || other.type === 2)) return [];
    if (dx && (node.type === 3 || other.type === 3)) return [];
    return [next];
  });
  neighbourhoods.set(p.id, list);
  return list;
}

export function bphPlacementLocks(save: BphSave, p: BphPlacement, node: BphUpgradeNode): string[] {
  // Survival has no dimensions (owner DM 1794921703.908979): authored prestige locks never gate a mastery cell.
  const reasons: string[] = [];
  if (node.refs.requiredHero && !save.discovered.includes(node.refs.requiredHero)) reasons.push("지정 병력 미발견");
  if (node.refs.requiredTome && !save.discovered.includes(node.refs.requiredTome)) reasons.push("지정 책략 미발견");
  const pack = node.refs.requiredPack;
  if (pack && pack !== "Pack1_Basic" && !(save.packs[pack]?.opened ?? 0) &&
    !activeBphEffects(save).some(effect => effect.type === "ShopUnlockTargetPack" && effect.targets.targetPack === pack))
    reasons.push("지정 모집 미해금");
  // The prestige-point trees stay closed: nothing in survival pays prestige points.
  if (p.gridId.startsWith("_SkillTreePrestige")) reasons.push("열리지 않음");
  if (![BPH_DEFAULT_GRID, "_SkillTreePrestige1", "_SkillTreePrestige2"].includes(p.gridId)) {
    const entered = save.purchasedPlacements.some(id => {
      const bought = BPH_PLACEMENTS.get(id);
      return bought && nodeOf(bought)?.refs.riftSkillTreeGrid === p.gridId;
    });
    if (!entered) reasons.push("강화망 입구 미구입");
  }
  return reasons;
}

/** One role judgment for connectivity, the hidden fixed point, visibility and quests. */
function actsAsConnector(p: BphPlacement): boolean {
  const node = nodeOf(p);
  return Boolean(node && [1, 2, 3].includes(node.type));
}

/** Purchase connectivity also needs the cell's locks. */
function traversable(save: BphSave, p: BphPlacement): boolean {
  const node = nodeOf(p);
  return Boolean(node && actsAsConnector(p) && bphPlacementLocks(save, p, node).length === 0);
}

function requiredPlacementCount(save: BphSave, target: BphPlacement, node: BphUpgradeNode): number {
  if (target.start && (target.prestigeIgnore === 0 || save.dimension < target.prestigeIgnore)) return 0;
  return Math.max(1, value(node, "requiredAdjacentPurchased"));
}

/** Stop at reached cells or the next non-connector cells, just as purchase reachability does. */
function* bphPlacementFrontier(save: BphSave, target: BphPlacement, reached: ReadonlySet<string>): Iterable<BphPlacement> {
  const queue = [...adjacentBphPlacements(target)], visited = new Set([target.id]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (visited.has(p.id)) continue;
    visited.add(p.id);
    if (!reached.has(p.id) && traversable(save, p)) queue.push(...adjacentBphPlacements(p));
    else yield p;
  }
}

export function bphPlacementPrerequisites(save: BphSave, target: BphPlacement, node: BphUpgradeNode, reached: ReadonlySet<string>): {
  readonly required: number;
  readonly placements: readonly BphPlacement[];
} {
  const required = requiredPlacementCount(save, target, node);
  return { required, placements: required ? [...bphPlacementFrontier(save, target, reached)] : [] };
}

export function connectedBphPlacement(save: BphSave, target: BphPlacement, purchased: ReadonlySet<string>): boolean {
  const targetNode = nodeOf(target);
  if (!targetNode) return false;
  const required = requiredPlacementCount(save, target, targetNode);
  if (!required) return true;
  let purchasedNeighbours = 0;
  for (const p of bphPlacementFrontier(save, target, purchased)) {
    if (purchased.has(p.id) && ++purchasedNeighbours >= required) return true;
  }
  return false;
}

/** Hidden removals cross only at the fixed point of their original purchase gates. */
// Every gate this walk reads (dimension, purchases, discoveries, opened packs) only grows during a run,
// so the version string pins exactly the save shapes that produced a reach set.
const reachMemos = new WeakMap<BphSave, { version: string; reached: Set<string> }>();
function reachVersion(save: BphSave): string {
  return `${save.dimension}|${save.purchasedPlacements.join(",")}|${save.discovered.length}|${
    Object.entries(save.packs).filter(([, pack]) => pack.opened).map(([id]) => id).join(",")}`;
}
export function reachedBphPlacements(save: BphSave): Set<string> {
  const version = reachVersion(save), memo = reachMemos.get(save);
  if (memo && memo.version === version) return memo.reached;
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
  reachMemos.set(save, { version, reached });
  return reached;
}

export function visibleBphPlacements(save: BphSave, gridId: string, includeHiddenPaths = false): readonly BphPlacement[] {
  const reached = reachedBphPlacements(save), visible = new Map<string, BphPlacement>();
  const visit = (p: BphPlacement) => {
    if (visible.has(p.id)) return;
    visible.set(p.id, p);
    // Reveal keeps the original rule: connector cells show their neighbours even while locked.
    if (actsAsConnector(p)) for (const next of adjacentBphPlacements(p)) visit(next);
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
