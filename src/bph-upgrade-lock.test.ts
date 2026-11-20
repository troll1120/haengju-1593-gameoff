import { expect, test } from "bun:test";
import { freshBphSave } from "./bph-save";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES, bphNodeBlockers } from "./bph-upgrades";
import { upgradeLock } from "./bph-upgrade-lock";

test("quest completion lock counts completed quest placements rather than its event counter", () => {
  const save = freshBphSave();
  const placement = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === "Q_CompleteQuests");
  if (!placement?.nodeId) throw new Error("Missing quest fixture");
  save.purchasedPlacements = ["_SkillTreeMain_Demo:23:19", "_SkillTreeMain_Demo:23:21"];
  save.questProgress[placement.id] = 99;
  const lock = upgradeLock(save, placement, BPH_UPGRADE_NODES[placement.nodeId], "퀘스트 진행 부족");
  expect(lock).toEqual({ icon: "trophy", count: "2/5", hint: "퀘스트 5개 완료" });
});

test("a repeat quest lock uses its next claim threshold and remains unpurchasable", () => {
  const save = freshBphSave();
  const placement = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === "Q_CompleteQuests");
  if (!placement?.nodeId) throw new Error("Missing quest fixture");
  save.purchasedPlacements = [placement.id, "_SkillTreeMain_Demo:23:19"];
  save.questProgress[`claims:${placement.id}`] = 1;
  const lock = upgradeLock(save, placement, BPH_UPGRADE_NODES[placement.nodeId], "퀘스트 진행 부족");
  expect(lock).toEqual({ icon: "trophy", count: "2/12", hint: "퀘스트 12개 완료" });
  expect(bphNodeBlockers(save, placement.id)).toContain("퀘스트 진행 부족");
});
