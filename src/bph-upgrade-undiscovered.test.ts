import { expect, test } from "bun:test";
import { freshBphSave } from "./bph-save";
import { bphConcealmentConditions } from "./bph-unlock-condition";
import { implementedQuestDescription, questRequirement } from "./bph-upgrade-quest-text";
import { BPH_PLACEMENTS, BPH_UPGRADE_NODES, bphNodeBlockers, bphQuestUnknowns, buyBphNode } from "./bph-upgrades";
import { bphPrepUpgradeNodes } from "./bph-upgrade-tree-nodes";

const troop = "_SkillTreeMain_Demo:28:30";

function prepNode(save: ReturnType<typeof freshBphSave>, id: string) {
  const placement = BPH_PLACEMENTS.get(id);
  const node = placement && bphPrepUpgradeNodes(save, [placement])[0];
  if (!node) throw new RangeError(`Missing upgrade placement ${id}`);
  return node;
}

test("an undiscovered placement spends nothing: its own progression gates block the purchase (castle ledger 1045)", () => {
  const save = freshBphSave();
  save.resources.mastery = 999;
  expect(prepNode(save, troop).concealed).toBe(true);
  expect(bphNodeBlockers(save, troop)).toContain("퀘스트 진행 부족");
  expect(buyBphNode(save, troop)).toBe(false);
  expect(save.resources.mastery).toBe(999);
  expect(save.purchasedPlacements).not.toContain(troop);
});

test("discovery clears the concealment and its unlock routes", () => {
  const save = freshBphSave();
  const definition = BPH_PLACEMENTS.get(troop)!;
  const node = BPH_UPGRADE_NODES[definition.nodeId!];
  const routes = bphConcealmentConditions(save, node);
  expect(routes.length).toBeGreaterThan(0);
  expect(routes.join(" ")).toContain("해금 방법:");
  save.discovered.push("Hero2_Monk");
  expect(bphConcealmentConditions(save, node)).toEqual([]);
  expect(prepNode(save, troop).concealed).toBeUndefined();
});

test("the quest income reward reads as a permanent starting-coin bonus for every battle (castle ledger 1046)", () => {
  const quest = Object.values(BPH_UPGRADE_NODES).find(node =>
    node.type === 4 && (node.values.questIncomeFlatBonus ?? 0) > 0
    && !bphQuestUnknowns(node).length && questRequirement(node, "1"));
  if (!quest) throw new Error("Missing income quest fixture");
  const description = implementedQuestDescription(quest)!;
  expect(description).toContain(`매 전투 시작 코인 +${quest.values.questIncomeFlatBonus}`);
  expect(description).toContain("(영구)");
  expect(description).not.toMatch(/^전투 시작 코인 \+1$/);
});
