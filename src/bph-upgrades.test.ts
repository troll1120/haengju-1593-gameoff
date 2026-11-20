import { expect, test } from "bun:test";
import type { BphSave } from "./bph-contract";
import { freshBphSave as fresh } from "./bph-save";
import { BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES, BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import { activeBphEffects, adjacentBphPlacements, BPH_PLACEMENTS, bphNodeBlockers, bphQuestUnknowns,
  buyBphNode, canBuyBphNode, recordBphProgress } from "./bph-upgrades";

function placement(nodeId: string, gridId = BPH_DEFAULT_GRID): string {
  const p = [...BPH_PLACEMENTS.values()].find(p => p.gridId === gridId && p.nodeId === nodeId);
  if (!p) throw new RangeError(nodeId);
  return p.id;
}
/** A progressed account with every authored predecessor, excluding the purchase under test. */
function prepared(exclude: readonly string[]): BphSave {
  const save = fresh(); save.dimension = 2;
  for (const resource of Object.keys(save.resources)) Object.assign(save.resources, { [resource]: 1_000_000_000 });
  save.purchasedPlacements = [...BPH_PLACEMENTS.values()].filter(p => p.nodeId && p.nodeId !== "PN_MasteryCostReduction" && !exclude.includes(p.nodeId)).map(p => p.id);
  save.purchasedNodes = [...new Set([...BPH_PLACEMENTS.values()].flatMap(p => p.nodeId && !exclude.includes(p.nodeId) ? [p.nodeId] : []))];
  return save;
}

test("the full source catalog and authored grids remain separate, including five empty references", () => {
  expect(Object.keys(BPH_UPGRADE_NODES)).toHaveLength(543);
  const nodes = Object.values(BPH_UPGRADE_NODES);
  expect(nodes.flatMap(n => n.effects)).toHaveLength(533);
  expect(new Set(nodes.flatMap(n => n.effects.map(e => e.type))).size).toBe(253);
  expect(BPH_UPGRADE_GRIDS.map(g => g.placements.length)).toEqual([21, 26, 133, 47, 132, 502, 101]);
  expect([...BPH_PLACEMENTS.values()].filter(p => p.nodeId === null)).toHaveLength(5);
  expect(BPH_PLACEMENTS.get("_SkillTreeMain_Demo:23:15")).toMatchObject({
    nodeId: "SN_TowerHP", start: true, source: "sharedassets1.assets:3192", prestigeIgnore: 2,
  });
});
test("a first purchase charges exactly one mastery and exposes the unrounded effect once", () => {
  const save = fresh(); save.resources.mastery = 7;
  expect(buyBphNode(save, placement("SN_TowerHP"))).toBe(true);
  expect(save.resources.mastery).toBe(6);
  expect(activeBphEffects(save)).toMatchObject([{ nodeId: "SN_TowerHP", type: "BonfireMaxHP", value: 1 }]);
  expect(buyBphNode(save, placement("SN_TowerHP"))).toBe(false);
  expect(save.resources.mastery).toBe(6);
});
test("an unaffordable purchase is atomic and a disconnected target cannot be bought", () => {
  const save = fresh();
  const before = JSON.stringify(save);
  expect(buyBphNode(save, placement("SN_TowerHP"))).toBe(false);
  expect(JSON.stringify(save)).toBe(before);
  save.resources.mastery = 10000;
  expect(canBuyBphNode(save, placement("SN_SquireBonusChance"))).toBe(false);
});
test("the reroll unlock spends foil rather than substituting mastery", () => {
  const save = fresh(); save.resources.mastery = 100000;
  const id = placement("SN_ShopRerollUnlock");
  expect(buyBphNode(save, id)).toBe(false);
  save.resources.foilium = 1;
  expect(buyBphNode(save, id)).toBe(true);
  expect(save.resources).toMatchObject({ foilium: 0, mastery: 100000 });
  expect(activeBphEffects(save).find(e => e.type === "ShopCanBeRerolled")?.value).toBe(1);
});
test("the audited B merge is unavailable and cannot spend fruit or mastery", () => {
  const save = prepared(["SN_DinoRiderMerge"]);
  const id = placement("SN_DinoRiderMerge", "_SkillTreeNature");
  const mastery = save.resources.mastery;
  save.resources.fruit = 69;
  expect(buyBphNode(save, id)).toBe(false);
  expect(save.resources.fruit).toBe(69);
  save.resources.fruit = 70;
  expect(buyBphNode(save, id)).toBe(false);
  expect(save.resources.fruit).toBe(70);
  expect(save.resources.mastery).toBe(mastery);
  expect(activeBphEffects(save).find(e => e.nodeId === "SN_DinoRiderMerge")).toBeUndefined();
});
test("retired extra-spawn placements cannot be bought or grant effects from old ownership", () => {
  const nodes = ["SN_SquireBonusChance", "SN_SquireBonusChance2"];
  const save = prepared(nodes);
  const before = structuredClone(save);
  for (const node of nodes) {
    const id = placement(node);
    expect(bphNodeBlockers(save, id)).toEqual(["제거된 강화"]);
    expect(buyBphNode(save, id)).toBe(false);
  }
  expect(save).toEqual(before);
  save.purchasedNodes.push(...nodes);
  save.purchasedPlacements.push(...nodes.map(node => placement(node)));
  expect(activeBphEffects(save).filter(e => nodes.includes(e.nodeId))).toEqual([]);
});
test("retired illusionist duplication cannot be bought or grant copies from old ownership", () => {
  const nodes = ["SN_IllusionistPackClones", "SN_IllusionistPackClones2", "SN_IllusionistPackClones3"];
  const ids = ["_SkillTreeMain_Demo:19:41", "_SkillTreeMain_Demo:17:41", "_SkillTreeMain_Demo:14:41"];
  const save = prepared(nodes);
  const before = structuredClone(save);
  for (const id of ids) {
    expect(bphNodeBlockers(save, id)).toEqual(["제거된 강화"]);
    expect(buyBphNode(save, id)).toBe(false);
  }
  expect(save).toEqual(before);
  save.purchasedNodes.push(...nodes);
  save.purchasedPlacements.push(...ids);
  expect(activeBphEffects(save).filter(e => nodes.includes(e.nodeId))).toEqual([]);
});
test("repeated definitions do not implicitly grant another placement or another grid", () => {
  const save = fresh();
  const node = "PN_StartingFoilium";
  const first = placement(node, "_SkillTreePrestige1");
  const second = placement(node, "_SkillTreePrestige2");
  save.purchasedNodes.push(node);
  expect(activeBphEffects(save)).toEqual([]);
  save.purchasedPlacements.push(first);
  expect(activeBphEffects(save).filter(e => e.type === "StartingFoilium").map(e => e.targets.placementId)).toEqual([first]);
  save.purchasedPlacements.push(second);
  expect(activeBphEffects(save).filter(e => e.type === "StartingFoilium").map(e => e.targets.placementId)).toEqual([first, second]);
});
test("pack quests start when connected and pay their reward only after their own two opens", () => {
  const save = fresh(); save.resources.mastery = 1;
  recordBphProgress(save, { kind: "pack-opened", packId: "Pack1_Basic", count: 20 });
  expect(buyBphNode(save, placement("SN_TowerHP"))).toBe(true);
  const quest = placement("Q_PackBasic");
  expect(save.questProgress[quest]).toBe(0);
  recordBphProgress(save, { kind: "pack-opened", packId: "Pack2_Advanced", count: 2 });
  recordBphProgress(save, { kind: "pack-opened", packId: "Pack1_Basic", count: 1 });
  expect(canBuyBphNode(save, quest)).toBe(false);
  recordBphProgress(save, { kind: "pack-opened", packId: "Pack1_Basic", count: 1 });
  expect(buyBphNode(save, quest)).toBe(true);
  expect(save.income).toBe(4);
  expect(buyBphNode(save, quest)).toBe(false);
  expect(save.income).toBe(4);
});
test("missing combat observations do not become invented hero-spawn quest progress", () => {
  const node = BPH_UPGRADE_NODES.Q_HeroSquire;
  const save = prepared(["Q_HeroSquire"]);
  const id = placement("Q_HeroSquire");
  save.questActivatedAt[id] = 0;
  recordBphProgress(save, { kind: "card-discovered", profileId: "Hero1_Squire", foil: false });
  expect(save.questProgress[id]).toBe(0);
  expect(bphQuestUnknowns(node)).toEqual([]);
  expect(bphNodeBlockers(save, id)).toContain("퀘스트 진행 부족");
});
test("dimension and adjacent-count gates cannot be bypassed by a rich wallet", () => {
  const save = fresh(); save.resources.mastery = 1e9; save.resources.foilium = 1e9;
  expect(canBuyBphNode(save, placement("Rift_Nature"))).toBe(false);
  const id = placement("SN_DinoRiderMerge", "_SkillTreeNature");
  const p = BPH_PLACEMENTS.get(id);
  if (!p) throw new RangeError("placement");
  save.dimension = 2; save.resources.fruit = 70;
  save.purchasedPlacements = [placement("Rift_Nature"), adjacentBphPlacements(p)[0].id];
  expect(canBuyBphNode(save, id)).toBe(false);
  expect(adjacentBphPlacements(p).every(n => adjacentBphPlacements(n).some(back => back.id === p.id))).toBe(true);
  expect(canBuyBphNode(prepared(["SN_TowerHP"]), placement("SN_TowerHP"))).toBe(true);
});
test("all effect metadata survives the public interface without rounding or target loss", () => {
  const save = fresh();
  const id = placement("SN_BonusPackOnOpen");
  save.purchasedPlacements.push(id);
  const actual = activeBphEffects(save).find(e => e.nodeId === "SN_BonusPackOnOpen");
  expect(actual).toMatchObject({
    type: "OpenPackBonusPackChance", value: 0.15000000596046448, effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
    targets: { targetPack: "Pack2_Advanced", bonusPackOnOpen: "Pack1_Basic", placementId: id,
      "targetPack.source": "resources.assets:1506", "bonusPackOnOpen.source": "resources.assets:1505" },
  });
});
