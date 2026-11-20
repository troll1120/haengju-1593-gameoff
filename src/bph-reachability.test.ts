import { expect, test } from "bun:test";
import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES, BPH_MOVED_UNIT_UPGRADES } from "./bph-hidden-upgrades";
import { freshBphSave } from "./bph-save";
import { bphReachabilityTargets } from "./bph-reachability-targets";
import { adjacentBphPlacements, bphNodeBlockers, buyBphNode,
  BPH_PLACEMENTS, BPH_UPGRADE_NODES, visibleBphPlacements } from "./bph-upgrades";
import type { BphPlacement, BphUpgradeNode } from "./bph-upgrade-data";

/** Independent optimistic graph oracle. No wallet, event or legal-purchase claim.
 * Dimensions never gate a cell (owner DM 1794921703.908979), so the oracle is dimension-blind. */
function structuralOracle(): Set<string> {
  const placements = [...BPH_PLACEMENTS.values()].filter(p => p.gridId === BPH_DEFAULT_GRID);
  const reached = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const target of placements) {
      const node = target.nodeId && BPH_UPGRADE_NODES[target.nodeId];
      if (!node || reached.has(target.id)) continue;
      if (!BPH_HIDDEN_UPGRADES.has(node.id) && ![0, 4, 6, 9].includes(node.type)) continue;
      const queue = [...adjacentBphPlacements(target)], seen = new Set([target.id]);
      let neighbours = 0;
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        if (reached.has(p.id)) { neighbours++; continue; }
        const other = p.nodeId && BPH_UPGRADE_NODES[p.nodeId];
        if (other && [1, 2, 3].includes(other.type)) queue.push(...adjacentBphPlacements(p));
      }
      if (target.start || neighbours >= Math.max(1, node.values.requiredAdjacentPurchased ?? 0)) {
        reached.add(target.id); changed = true;
      }
    }
  }
  return reached;
}

function productClosure() {
  const save = freshBphSave();
  const ignored = new Set(["퀘스트 진행 부족", "집계 이벤트 미확인", "지정 병력 미발견", "지정 책략 미발견", "지정 모집 미해금"]);
  for (const resource of Object.keys(save.resources)) Object.assign(save.resources, { [resource]: 1e12 });
  save.income = 1e12;
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of BPH_PLACEMENTS.values()) {
      const node = p.nodeId && BPH_UPGRADE_NODES[p.nodeId];
      if (!node || p.gridId !== BPH_DEFAULT_GRID || save.purchasedPlacements.includes(p.id) ||
        ![0, 4, 6, 9].includes(node.type)) continue;
      if (bphNodeBlockers(save, p.id).some(reason => !ignored.has(reason))) continue;
      save.purchasedPlacements.push(p.id);
      save.purchasedNodes.push(node.id);
      changed = true;
    }
  }
  return save;
}

test("without dimensions the web reaches every remaining main-grid purchase except the isolated Chaos rift", () => {
  const targets = bphReachabilityTargets();
  const oracle = structuralOracle();
  const actual = productClosure();
  // The naive flood ignores quest and reference locks on connector cells, so it can only bound from above.
  for (const id of actual.purchasedPlacements) expect(oracle.has(id)).toBe(true);
  const paid = new Set(actual.purchasedPlacements);
  const remaining = [...BPH_PLACEMENTS.values()].flatMap<{ p: BphPlacement; node: BphUpgradeNode }>(p => {
    const node = p.nodeId && BPH_UPGRADE_NODES[p.nodeId];
    return p.gridId === BPH_DEFAULT_GRID && node && !BPH_HIDDEN_UPGRADES.has(node.id) ? [{ p, node }] : [];
  });
  const normal = remaining.filter(({ node }) => node.type === 0);
  const current = normal.filter(({ p, node }) => p.prestigeLock === 0 && (node.values.prestigeLock ?? 0) === 0);
  expect(new Set(targets.current144)).toEqual(new Set(current.map(({ p }) => p.id)));
  expect(new Set(targets.future74)).toEqual(new Set(normal.filter(entry => !current.includes(entry)).map(({ p }) => p.id)));
  expect(actual.purchasedPlacements).toContain("_SkillTreeMain_Demo:17:6");
  for (const rift of ["Rift_Graveyard", "Rift_Frozen", "Rift_Nature"])
    expect(actual.purchasedNodes).toContain(rift);
  // The Chaos entrance has no authored adjacency: it stays isolated for connectivity, not for dimension.
  const rich = structuredClone(actual);
  const chaos = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === "Rift_Chaos");
  if (!chaos) throw new RangeError("Chaos entrance");
  expect(paid).toEqual(new Set(remaining.filter(({ p, node }) => p !== chaos &&
    [0, 4, 6, 9].includes(node.type)).map(({ p }) => p.id)));
  expect(bphNodeBlockers(rich, chaos.id)).toEqual(["연결된 선행 노드 필요"]);
});

test("all 188 moved placements stay hidden and unbuyable after the web closes", () => {
  const save = productClosure();
  const hidden = [...BPH_PLACEMENTS.values()].flatMap<{ p: BphPlacement; nodeId: string }>(p =>
    p.nodeId && BPH_HIDDEN_UPGRADES.has(p.nodeId) ? [{ p, nodeId: p.nodeId }] : []);
  expect(hidden.filter(({ nodeId }) => BPH_MOVED_UNIT_UPGRADES.has(nodeId))).toHaveLength(188);
  const shown = new Set([...new Set(hidden.map(({ p }) => p.gridId))]
    .flatMap(gridId => visibleBphPlacements(save, gridId).map(p => p.id)));
  for (const { p } of hidden) {
    expect(shown.has(p.id)).toBe(false);
    expect(bphNodeBlockers(save, p.id)).toEqual(["제거된 강화"]);
  }
});

test("buying a rift entrance opens its zone for point purchases", () => {
  const save = freshBphSave();
  save.purchasedPlacements.push("_SkillTreeMain_Demo:23:25");
  const rift = BPH_PLACEMENTS.get("_SkillTreeMain_Demo:23:27");
  if (!rift) throw new RangeError("Graveyard placement");
  expect(buyBphNode(save, rift.id)).toBe(true);
  const child = [...BPH_PLACEMENTS.values()].find(p => p.gridId === "_SkillTreeGraveyard" &&
    p.nodeId && BPH_UPGRADE_NODES[p.nodeId].type === 0);
  if (!child) throw new RangeError("Graveyard upgrade");
  expect(bphNodeBlockers(save, child.id)).not.toContain("강화망 입구 미구입");
});

test("no cell ever reports a dimension lock and the relic cells cost points only", () => {
  for (const dimension of [0, 1, 2]) {
    const save = freshBphSave();
    save.dimension = dimension;
    for (const p of BPH_PLACEMENTS.values()) {
      const node = p.nodeId && BPH_UPGRADE_NODES[p.nodeId];
      if (!node) continue;
      expect(bphNodeBlockers(save, p.id).join(" · ")).not.toContain("차원");
    }
  }
  const fresh = freshBphSave();
  for (const resource of Object.keys(fresh.resources)) Object.assign(fresh.resources, { [resource]: 1e12 });
  const costs: Record<string, number> = { SN_UnlockRelicRainOfArrows: 15000, SN_UnlockRelicSkeleton: 20000,
    SN_RelicSlotFoilium: 7, SN_RelicSlotFoilium2: 11 };
  for (const [nodeId, mastery] of Object.entries(costs)) {
    const p = [...BPH_PLACEMENTS.values()].find(candidate => candidate.nodeId === nodeId);
    if (!p) throw new RangeError(nodeId);
    // Nothing but standing next to a purchase: no dimension, no rift, no removal.
    expect(bphNodeBlockers(fresh, p.id)).toEqual(["연결된 선행 노드 필요"]);
  }
  const portal = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === "SN_UnlockRelicPortal");
  if (!portal) throw new RangeError("portal cell");
  expect(bphNodeBlockers(fresh, portal.id)).toEqual(["연결된 선행 노드 필요"]);
});

test("remaining targets keep their partitions and the Nature gate costs points only", () => {
  const targets = bphReachabilityTargets();
  const owned = freshBphSave();
  for (const resource of Object.keys(owned.resources)) Object.assign(owned.resources, { [resource]: 1e12 });
  owned.income = 1e12;
  owned.purchasedPlacements = [...targets.core143];
  expect(visibleBphPlacements(owned, BPH_DEFAULT_GRID).map(p => p.id)).toContain("_SkillTreeMain_Demo:23:13");
  expect(bphNodeBlockers(owned, "_SkillTreeMain_Demo:23:13")).toEqual([]);
  expect(targets.current144).toHaveLength(68);
  expect(targets.core143).toHaveLength(67);
  for (const cell of ["24:14", "24:13", "24:12", "25:17", "25:18"]) {
    expect(targets.core143).toContain(`${BPH_DEFAULT_GRID}:${cell}`);
  }
  expect(targets.laterShop).toEqual(["_SkillTreeMain_Demo:17:6"]);
  expect(targets.core143).toEqual(targets.current144.filter(id => !targets.laterShop.includes(id)));
  expect(targets.future74).toHaveLength(47);
  expect(targets.training20).toEqual([]);
  expect(targets.survival).toEqual(targets.core143);
});
