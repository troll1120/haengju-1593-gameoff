import { expect, test } from "bun:test";
import type { BphSave } from "./bph-contract";
import { buyBphGeneralUpgrade } from "./bph-general-upgrades";
import { freshBphSave } from "./bph-save";
import { buyBphUnitUpgrade } from "./bph-unit-upgrades";
import { bphGeneralUpgradeNodes, bphPrepUpgradeNodes, bphUnitUpgradeNodes } from "./bph-upgrade-tree-nodes";
import { BPH_PLACEMENTS, buyBphNode, recordBphProgress } from "./bph-upgrades";

function prepNode(save: BphSave, id: string) {
  const placement = BPH_PLACEMENTS.get(id);
  const node = placement && bphPrepUpgradeNodes(save, [placement])[0];
  if (!node) throw new RangeError(`Missing upgrade placement ${id}`);
  return node;
}

test("a locked troop placement keeps its silhouette and safe copy until discovery", () => {
  const save = freshBphSave(), id = "_SkillTreeMain_Demo:28:30";
  const hidden = prepNode(save, id);
  expect(hidden).toMatchObject({
    concealed: true, label: "???", description: null, icon: {
      url: "./art/icons/codex-undiscovered-silhouette.webp", sheet: null, badge: null,
    },
  });
  expect(hidden.nextText).toBeTruthy();
  expect([hidden.currentText, hidden.nextText].join(" ")).not.toContain("승려");
  save.discovered.push("Hero2_Monk");
  const revealed = prepNode(save, id);
  expect(revealed.concealed).toBeUndefined();
  expect(revealed.label).not.toBe("???");
  expect(revealed.icon.url).not.toBe(hidden.icon.url);
  expect(revealed.description).toBeTruthy();
});

test("unit nodes expose mastery costs and the next special effect only after discovery", () => {
  const save = freshBphSave(), id = "Hero1_Squire";
  save.resources.mastery = 19;
  expect(bphUnitUpgradeNodes(save, id)).toEqual([]);
  save.discovered.push(id);
  const special = () => bphUnitUpgradeNodes(save, id).find(node => node.id === "special");
  expect(special()).toMatchObject({ tier: 3, currentText: "0%", nextText: "10%", cost: 20, currency: "mastery", buyable: false });
  save.resources.mastery++;
  expect(special()?.buyable).toBe(true);
  expect(buyBphUnitUpgrade(save, id, "special")).toBe(true);
  expect(special()).toMatchObject({ tier: 3, rank: 1, max: 3, cost: 40, currentText: "10%", nextText: "20%", buyable: false });
  expect(save.resources.mastery).toBe(0);
});

test("commander nodes hide locked generals and distinguish maxed and unbought tracks", () => {
  const save = freshBphSave(), general = "신립";
  save.resources.mastery = 325;
  expect(bphGeneralUpgradeNodes(save, general)).toEqual([]);
  save.unlockedGenerals.push(general);
  expect(bphGeneralUpgradeNodes(save, general).map(node => node.id)).toEqual(["health", "attack", "attackSpeed", "skill"]);
  for (let rank = 0; rank < 5; rank++) expect(buyBphGeneralUpgrade(save, general, "skill")).toBe(true);
  expect(buyBphGeneralUpgrade(save, general, "skill")).toBe(false);
  const nodes = bphGeneralUpgradeNodes(save, general);
  expect(nodes.find(node => node.id === "skill")).toMatchObject({
    tier: 3, rank: 5, max: 5, purchased: true, cost: null, currentText: "25%", nextText: null, buyable: false,
  });
  expect(nodes.find(node => node.id === "attack")).toMatchObject({
    tier: 1, rank: 0, max: null, purchased: false, cost: 20, currentText: "Lv 0", buyable: true, requiredPrereqCount: 0,
  });
  save.generalUpgrades = { 신립: { attackSpeed: 1000 } };
  expect(bphGeneralUpgradeNodes(save, general).find(node => node.id === "attackSpeed")).toMatchObject({
    rank: 1000, max: null, currentText: "Lv 1000", cost: 20_020, buyable: false,
  });
});

test("prep quest uses the connector frontier and exposes the live economy reward and threshold", () => {
  const save = freshBphSave(), start = "_SkillTreeMain_Demo:23:15", quest = "_SkillTreeMain_Demo:23:19";
  save.resources.mastery = 1;
  expect(prepNode(save, quest)).toMatchObject({ requiredPrereqCount: 1, thresholds: [2], buyable: false });
  expect(prepNode(save, quest).prereqs).toContainEqual({ id: start, rank: 1 });
  expect(buyBphNode(save, start)).toBe(true);
  recordBphProgress(save, { kind: "pack-opened", packId: "Pack1_Basic", count: 1 });
  expect(prepNode(save, quest)).toMatchObject({ buyable: false, currentText: expect.stringContaining("1/2") });
  recordBphProgress(save, { kind: "pack-opened", packId: "Pack1_Basic", count: 1 });
  const ready = prepNode(save, quest);
  expect(ready).toMatchObject({ buyable: true, purchased: false, cost: 0, rank: 0, max: 1, currentText: expect.stringContaining("2/2") });
  expect(ready.nextText).toMatch(/\+1\b/);
  expect(buyBphNode(save, quest)).toBe(true);
  expect(prepNode(save, quest)).toMatchObject({
    buyable: false, purchased: true, rank: 1, tier: ready.tier, currentText: expect.stringContaining("1/1"), cost: null, nextText: null,
  });
  expect(save.income).toBe(4);
});

test("prep reports authored prerequisite counts and per-placement state independently from rank", () => {
  const save = freshBphSave();
  const gate = prepNode(save, "_SkillTreeMain_Demo:22:7");
  expect(gate.requiredPrereqCount).toBe(2);
  expect(gate.prereqs).toEqual([{ id: "_SkillTreeMain_Demo:23:7", rank: 1 }, { id: "_SkillTreeMain_Demo:22:8", rank: 1 }]);
  const bought = "_SkillTreeMain_Demo:19:16", sibling = "_SkillTreeMain_Demo:19:17";
  save.purchasedPlacements.push(bought);
  expect(prepNode(save, bought)).toMatchObject({ rank: 1, max: 2, purchased: true, nextText: null });
  const pending = prepNode(save, sibling);
  expect(pending).toMatchObject({ rank: 1, max: 2, purchased: false });
  expect(pending.currentText.length).toBeGreaterThan(0);
  expect(pending.currentText).not.toBe(pending.nextText);
});

test("a repeatable prep quest advances to the next authored requirement after a claim", () => {
  const save = freshBphSave(), id = "_SkillTreeMain_Demo:28:7";
  const before = prepNode(save, id);
  expect(before.currentText).toContain("0/5");
  save.questProgress[`claims:${id}`] = 1;
  save.purchasedPlacements.push(id);
  const after = prepNode(save, id);
  expect(after).toMatchObject({ purchased: true, rank: 1, tier: before.tier });
  expect(after.currentText).toContain("1/12");
  expect(after.nextText).toMatch(/\b12\b/);
  expect(after.nextText).not.toBe(before.nextText);
});

test("prep displays the actual non-mastery charge and follows the wallet as it changes", () => {
  const save = freshBphSave(), id = "_SkillTreeMain_Demo:23:8";
  save.resources.mastery = 100;
  const short = prepNode(save, id);
  expect(short).toMatchObject({ costs: [{ amount: 1, currency: "foilium" }], buyable: false });
  expect(short.concealed).toBeUndefined();
  expect(short.label).not.toBe("???");
  save.resources.foilium = 1;
  expect(prepNode(save, id)).toMatchObject({ cost: 1, currency: "foilium", buyable: true, label: short.label, icon: short.icon });
  expect(buyBphNode(save, id)).toBe(true);
  expect(save.resources).toMatchObject({ foilium: 0, mastery: 100 });
});
