import { expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { ensureBphSave, createBphRun } from "./bph-session";
import { addBphProfile, bphUnitKill } from "./bph-combat";
import { bphCodexDetails } from "./bph-codex-details";
import { activeBphEffects, buyBphNode } from "./bph-upgrades";
import { parseBphSave } from "./bph-save";

test("a fresh account hides the spear lineage and cannot promote even after enough kills", () => {
  const meta = freshMeta(), save = ensureBphSave(meta);
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades: activeBphEffects(save) });
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic" });
  const unit = run.squads[0].soldiers[0];
  for (let kills = 0; kills < 50; kills++) bphUnitKill(run, unit, []);
  expect(unit.bph?.profileId).toBe("Hero1_Squire");
  expect(unit.bph?.stage).toBe(0);
  expect(bphCodexDetails("Hero1_Squire", activeBphEffects(save)).evolution).toEqual([]);
});

test("buying spear promotions after save migration reveals and enables exactly the purchased stages", () => {
  const meta = freshMeta();
  const start = "_SkillTreeMain_Demo:23:15", removedDamage = "_SkillTreeMain_Demo:27:14";
  const save = meta.bph = parseBphSave({
    version: 1, dimension: 1, resources: { mastery: 100000 },
    purchasedPlacements: [start, removedDamage], purchasedNodes: ["SN_TowerHP", "SN_SquireDamage 2"],
  });
  expect(save.purchasedPlacements).toEqual([start]);
  expect(save.purchasedNodes).toEqual(["SN_TowerHP"]);
  const ranks = ["Hero1_Squire2", "Hero1_Squire3", "Hero4_Bannerman"];
  for (const [index, placement] of ["_SkillTreeMain_Demo:28:14", "_SkillTreeMain_Demo:29:14", "_SkillTreeMain_Demo:30:14"].entries()) {
    expect(buyBphNode(save, placement)).toBe(true);
    const upgrades = activeBphEffects(save);
    expect(bphCodexDetails("Hero1_Squire", upgrades).evolution.map(step => step.profileId))
      .toEqual(ranks.slice(0, index + 1));
    const run = createBphRun(meta, { seed: 7, general: "권율", upgrades });
    addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false },
      { packId: "Pack1_Basic" });
    const unit = run.squads[0].soldiers[0];
    expect(bphCodexDetails("Hero1_Squire", upgrades).evolution.map(step => step.kills))
      .toEqual([10, 20, 50].slice(0, index + 1));
    for (let kills = 0; kills < 50; kills++) bphUnitKill(run, unit, []);
    expect(unit.bph?.profileId).toBe(ranks[index]);
    expect(unit.bph?.stage).toBe(index + 1);
  }
});

test("the summoned spear lineage without a promotion node remains visible", () => {
  expect(bphCodexDetails("Hero_Skeleton").evolution.map(step => step.profileId))
    .toEqual(["Hero_SkeletonUpgraded"]);
});
