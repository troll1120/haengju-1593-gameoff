import { expect, test } from "bun:test";
import { enterBphImprovements, equipBphRelic, grantBphRelic, projectBphSalary, recoverBphRelic, startBphCampaignAttempt } from "./bph-account";
import { freshBphSave, parseBphSave } from "./bph-save";
import { openBphPack } from "./bph";
import { bphChance } from "./bph-fx-dispatch";
import type { BphEffect } from "./bph-contract";
import { activeBphEffects, BPH_PLACEMENTS, BPH_UPGRADE_NODES, buyBphNode, recordBphProgress } from "./bph-upgrades";

const effect = (type: string, value: number): BphEffect => ({
  nodeId: type, type, value, effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {},
});
test("management and campaign receipt keys survive reload without repeated grants", () => {
  const save = freshBphSave();
  expect(enterBphImprovements(save)).toBe(true);
  expect(startBphCampaignAttempt(save)).toBe(true);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(enterBphImprovements(restored)).toBe(false);
  expect(startBphCampaignAttempt(restored)).toBe(false);
  restored.lifecycle.managementVisit++;
  expect(enterBphImprovements(restored)).toBe(true);
  expect(startBphCampaignAttempt(restored)).toBe(false);
});
test("salary projection changes income once and retains later quest income", () => {
  const save = freshBphSave(), effects = [effect("SalaryFlatBonus", 5)];
  projectBphSalary(save, effects); save.income++;
  projectBphSalary(save, effects);
  expect(save.income).toBe(9);
});
test("owned relic slots and atomic recovery retain escalating original foil costs", () => {
  const save = freshBphSave(), effects = [effect("RecoverDestroyedRelicsWithFoilium", 1)];
  grantBphRelic(save, "R_ShockNeedle"); grantBphRelic(save, "R_EchoingBones");
  expect(equipBphRelic(save, "R_ShockNeedle")).toBe(true);
  expect(equipBphRelic(save, "R_EchoingBones")).toBe(false);
  save.relicState.slots = 1;
  expect(equipBphRelic(save, "R_EchoingBones")).toBe(true);
  save.relicState.equipped = []; save.relicState.destroyed.push("R_ShockNeedle");
  save.resources.foilium = 4;
  expect(recoverBphRelic(save, { relicId: "R_ShockNeedle", effects })).toBe(false);
  save.resources.foilium = 15;
  expect(recoverBphRelic(save, { relicId: "R_ShockNeedle", effects })).toBe(true);
  expect(save.resources.foilium).toBe(10);
  expect(recoverBphRelic(save, { relicId: "R_ShockNeedle", effects })).toBe(false);
  save.relicState.destroyed.push("R_ShockNeedle");
  expect(recoverBphRelic(save, { relicId: "R_ShockNeedle", effects })).toBe(true);
  expect(save.resources.foilium).toBe(0);
});
test("building metadata survives storage and changes the actual opened instance", () => {
  const save = freshBphSave();
  // pity.md: the building's foil bonus raises the roll chance, but FoilManager's
  // copiesBeforeFoilByRarity gate still applies to natural foil rolls.
  save.discovered.push("Hero1_Squire");
  save.questProgress["draw:foil-copies:Hero1_Squire"] = 8;
  save.inventory.push({ id: 1, packId: "Pack1_Basic", box: false,
    sourceBuilding: "Building_2Advanced", foilChanceBonus: 1, giantChance: 1 });
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  const result = openBphPack(restored, { packId: "Pack1_Basic", effects: [], instance: restored.inventory[0] });
  expect(restored.inventory[0].sourceBuilding).toBe("Building_2Advanced");
  expect(result.cards[0]).toMatchObject({ profileId: "Hero1_Squire", foil: true, giant: true });
});
test("global chance changes a threshold once without changing uniform RNG", () => {
  expect(bphChance(.25, [effect("GlobalChanceEffectMultiplier", .33)])).toBe(.3325);
  expect(bphChance(.9, [effect("GlobalChanceEffectMultiplier", 1)])).toBe(1);
});

test("former income buildings charge mastery only, then a real quest adds one income without salary reissuing it", () => {
  const save = freshBphSave();
  save.income = 1;
  save.resources.mastery = 10000;
  save.purchasedPlacements = ["_SkillTreeMain_Demo:23:15", "_SkillTreeMain_Demo:19:32", "_SkillTreeMain_Demo:20:44"];

  expect(buyBphNode(save, "_SkillTreeMain_Demo:18:32")).toBe(true);
  expect([save.income, save.resources.mastery]).toEqual([1, 10000 - 105]);
  expect(buyBphNode(save, "_SkillTreeMain_Demo:20:45")).toBe(true);
  expect([save.income, save.resources.mastery]).toEqual([1, 10000 - 105 - 140]);
  recordBphProgress(save, { kind: "pack-opened", packId: "Pack1_Basic", count: 2 });
  expect(buyBphNode(save, "_SkillTreeMain_Demo:23:19")).toBe(true);
  expect(save.income).toBe(2);
  projectBphSalary(save, activeBphEffects(save));
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  projectBphSalary(restored, activeBphEffects(restored));
  expect([restored.income, restored.resources.mastery]).toEqual([2, 9755]);
  expect(restored.salaryApplied).toBe(save.salaryApplied);
  expect(buyBphNode(restored, "_SkillTreeMain_Demo:18:32")).toBe(false);
});

test.each([
  ["SN_Building_Advanced_Unlock", 2], ["SN_Building_Magic_Unlock", 4],
  ["SN_Building_Royal_Unlock", 5], ["SN_Building_Nature_Unlock", 2],
  ["SN_Building_Death_Unlock", 4], ["SN_Building_Frost_Unlock", 6], ["Q_DefeatNiro", 2],
] as const)("%s leaves income untouched instead of spending its authored %d", (nodeId, cost) => {
  const p = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === nodeId);
  if (!p) throw new RangeError(nodeId);
  const save = freshBphSave();
  save.dimension = 2; save.income = 12;
  for (const resource of Object.keys(save.resources)) Object.assign(save.resources, { [resource]: 100000 });
  save.resources.coinIncome = 0;
  save.purchasedPlacements = [...BPH_PLACEMENTS.keys()].filter(id => id !== p.id);
  save.questProgress[p.id] = 1;

  const mastery = save.resources.mastery;
  expect(buyBphNode(save, p.id)).toBe(true);
  expect(save.income).toBe(12);
  expect(mastery - save.resources.mastery).toBeGreaterThan(0);
  expect(save.resources.coinIncome).toBe(0);
});

test("the unplaced reroll income definition does not acquire a purchasable placement", () => {
  const save = freshBphSave();
  save.income = 12;
  expect(BPH_UPGRADE_NODES["SN_ShopRerollCostReduction 1"].costs.coinIncome).toBe(0);
  expect([...BPH_PLACEMENTS.values()].some(p => p.nodeId === "SN_ShopRerollCostReduction 1")).toBe(false);
  const before = JSON.stringify(save);
  expect(buyBphNode(save, "SN_ShopRerollCostReduction 1")).toBe(false);
  expect(JSON.stringify(save)).toBe(before);
});
