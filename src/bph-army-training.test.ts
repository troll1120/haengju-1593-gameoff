import { expect, test } from "bun:test";
import { BPH_ARMY_TRAINING } from "./bph-army-training";
import { BPH_UPGRADE_GRIDS as sourceGrids } from "./bph-upgrade-data";
import { BPH_GENERALS } from "./bph-commanders";
import { freshBphSave, parseBphSave } from "./bph-save";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { growthFor, skillUpgradeCount } from "./skill-growth";
import { buyBphUnitUpgrade } from "./bph-unit-upgrades";
import { CHAOS_MAX_LEVEL } from "./chaos-contract";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES, BPH_UPGRADE_GRIDS, activeBphEffects,
  adjacentBphPlacements, buyBphNode, prepareBphUpgrades, visibleBphPlacements } from "./bph-upgrades";
import { upgradeDescription } from "./bph-upgrade-presentation";
import { language, setLanguage } from "./i18n";

test("retired army training cells retain their authored connections without appearing for purchase", () => {
  const original = new Map(sourceGrids.flatMap(grid => grid.placements.map(p => [p.id, p] as const)));
  const save = freshBphSave();
  save.resources.mastery = 2901;
  const start = "_SkillTreeMain_Demo:23:15";
  expect(buyBphNode(save, start)).toBe(true);
  for (const [index, p] of BPH_ARMY_TRAINING.entries()) {
    const next = BPH_ARMY_TRAINING[index + 1];
    expect(original.has(p.id)).toBe(false);
    expect(visibleBphPlacements(save, p.gridId).some(entry => entry.id === p.id)).toBe(false);
    expect(adjacentBphPlacements(p).map(entry => entry.id).sort()).toEqual([
      BPH_ARMY_TRAINING[index - 1]?.id ?? "_SkillTreeMain_Demo:22:15", ...(next ? [next.id] : []),
    ].sort());
    expect(buyBphNode(save, p.id)).toBe(false);
  }
  expect(save.resources.mastery).toBe(2900);
  expect(save.purchasedPlacements).toEqual([start]);
});

test("twenty retired training purchases refund once and no longer boost any general", async () => {
  const save = freshBphSave();
  save.resources.mastery = 1;
  expect(buyBphNode(save, "_SkillTreeMain_Demo:23:15")).toBe(true);
  for (const p of BPH_ARMY_TRAINING) {
    save.purchasedPlacements.push(p.id);
    if (p.nodeId) save.purchasedNodes.push(p.nodeId);
  }
  const reloaded = parseBphSave(JSON.parse(JSON.stringify(save)));
  const size = BPH_PLACEMENTS.size;
  await prepareBphUpgrades();
  await prepareBphUpgrades();
  expect(BPH_PLACEMENTS.size).toBe(size);
  expect(BPH_UPGRADE_GRIDS.flatMap(grid => grid.placements).filter(p => p.nodeId?.startsWith("HJ_ArmyTraining"))).toHaveLength(20);
  for (const p of BPH_ARMY_TRAINING) expect(buyBphNode(reloaded, p.id)).toBe(false);
  expect(reloaded.resources.mastery).toBe(2900);
  expect(parseBphSave(reloaded).resources.mastery).toBe(2900);
  expect(reloaded.purchasedNodes).toEqual(["SN_TowerHP"]);
  expect(reloaded.purchasedPlacements).toEqual(["_SkillTreeMain_Demo:23:15"]);
  const effects = activeBphEffects(reloaded);
  expect(effects.map(effect => effect.nodeId)).toEqual(["SN_TowerHP"]);
  for (const general of BPH_GENERALS) {
    const run = createBphRun({ ...freshMeta(), bph: reloaded }, { seed: 1593, general, upgrades: effects });
    expect(skillUpgradeCount(general, run.bph?.upgrades ?? [])).toBe(0);
  }
});

test("army training health is described as troop HP rather than duration", () => {
  const previous = language();
  try {
    setLanguage("ko");
    const node = BPH_UPGRADE_NODES.HJ_ArmyTraining03;
    expect(upgradeDescription(node)).toBe("병력 체력 +2%");
  } finally { setLanguage(previous); }
});

test("a migrated account can reach every general skill tier and army level through bought troop stats", () => {
  const legacy = freshBphSave();
  legacy.purchasedPlacements = BPH_ARMY_TRAINING.map(p => p.id);
  legacy.discovered.push("Hero1_Squire", "Hero1_Barbarian");
  let save = parseBphSave(legacy);
  expect(save.purchasedPlacements).toEqual([]);
  expect(buyBphUnitUpgrade(save, "Hero1_Squire", "special")).toBe(true);
  for (let level = 0; level <= CHAOS_MAX_LEVEL; level++) {
    save = parseBphSave(JSON.parse(JSON.stringify(save)));
    const upgrades = activeBphEffects(save);
    const tier = level >= 6 ? 3 : level >= 3 ? 2 : 1;
    for (const general of BPH_GENERALS) {
      const run = createBphRun({ ...freshMeta(), bph: save }, { seed: 1593, general, upgrades });
      expect(run.squads[0].general).toBe(general);
      expect(growthFor(general, run)).toMatchObject({ tier, level, purchases: level, army: expect.any(Object) });
    }
    if (level === CHAOS_MAX_LEVEL) break;
    const id = level < 10 ? "Hero1_Squire" : "Hero1_Barbarian";
    expect(buyBphUnitUpgrade(save, id, level % 10 < 5 ? "attack" : "attackSpeed")).toBe(true);
  }
});
