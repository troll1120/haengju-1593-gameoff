import { expect, test } from "bun:test";
import { freshBphSave, parseBphSave } from "./bph-save";
import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import { BPH_HIDDEN_UPGRADES, BPH_MOVED_UNIT_UPGRADES, BPH_V1_HIDDEN_UPGRADES } from "./bph-hidden-upgrades";
import { takeBphRefundNotice } from "./bph-upgrade-migration";
import { BPH_PLACEMENTS, canBuyBphNode, visibleBphPlacements } from "./bph-upgrades";
import { reachedBphPlacements } from "./bph-upgrade-graph";

const placement = (node: string) => {
  const found = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === node);
  if (!found) throw new RangeError(node);
  return found.id;
};
const reload = (save: unknown) => parseBphSave(JSON.parse(JSON.stringify(save)));

test("purchased levels and repeated placements refund each payment with its historical discount", () => {
  const save = freshBphSave();
  save.resources.mastery = 13;
  save.resources.shard = 7;
  save.resources.skull = 11;
  const repeated = [...BPH_PLACEMENTS.values()].filter(p => p.nodeId === "SN_FrozenSlideMaxHpDamage");
  save.purchasedPlacements = [
    placement("SN_TomeSurgeBuffIncrease"), placement("PN_MasteryCostReduction"),
    placement("SN_TomeSurgeBuffIncrease2"), ...repeated.map(p => p.id),
    placement("SN_Spectral_HPLossReduction"), placement("SN_TowerHP"),
  ];
  save.purchasedNodes = save.purchasedPlacements.flatMap(id => BPH_PLACEMENTS.get(id)?.nodeId ?? []);

  const restored = reload(save);

  expect(restored.resources).toMatchObject({ mastery: 39013 + 61 * 136 + 41 * 45, shard: 0, skull: 0 });
  expect(restored.purchasedPlacements).toEqual([placement("PN_MasteryCostReduction"), placement("SN_TowerHP")]);
  expect(restored.purchasedNodes).toEqual(["PN_MasteryCostReduction", "SN_TowerHP"]);
  expect(restored.hiddenUpgradeRefund?.count).toBe(6);
});

test("an unpurchased definition grants no refund and unknown save fields survive", () => {
  const save = { ...freshBphSave(), futureField: { revision: 19 },
    resources: { ...freshBphSave().resources, futureCurrency: 23 },
    purchasedNodes: ["SN_TomeSurgeBuffIncrease2"] };

  const restored = reload(save);

  expect(restored.resources.mastery).toBe(0);
  expect(restored.purchasedNodes).toEqual([]);
  expect(restored).toMatchObject({ futureField: { revision: 19 }, resources: { futureCurrency: 23 } });
  expect(takeBphRefundNotice(restored)).toBeNull();
});

test("all placed B definitions refund the audited resource totals without inventing unplaced purchases", () => {
  const save = freshBphSave();
  save.purchasedPlacements = [...BPH_PLACEMENTS.values()]
    .filter(p => p.nodeId && BPH_V1_HIDDEN_UPGRADES.has(p.nodeId)).map(p => p.id);
  save.purchasedNodes = [...BPH_V1_HIDDEN_UPGRADES];

  const restored = reload(save);

  // The repaired portal unlock remains purchasable, so its 50,000 cost is no longer refunded.
  expect(restored.resources).toEqual({ mastery: 105280 + 210 * 45 + 240 * 38 + 69 * 136, skull: 0, coinIncome: 0, zenith: 0,
    ink: 0, fruit: 0, foilium: 0, shard: 0, runeA: 0, runeB: 0, runeC: 0,
    prestigePoint: 0, relic: 0 });
  expect(restored.purchasedPlacements).toEqual([]);
  expect(restored.purchasedNodes).toEqual([]);
});

test("two reloads cannot refund or announce the same purchase again", () => {
  const save = freshBphSave();
  save.purchasedPlacements = [placement("SN_Beastmaster_FriendRespawn")];
  const first = reload(save);
  expect(first.resources.mastery).toBe(70 * 38);
  expect(takeBphRefundNotice(first)).toBe("효과 없는 강화 1개를 정리하고 재화를 돌려드렸어요");

  const second = reload(first);
  const third = reload(second);

  expect(third.resources.mastery).toBe(70 * 38);
  expect(takeBphRefundNotice(second)).toBeNull();
  expect(takeBphRefundNotice(third)).toBeNull();
});

test("every audited B placement is absent and cannot be purchased even with all predecessors", () => {
  const save = freshBphSave();
  save.dimension = 2;
  save.purchasedPlacements = [...BPH_PLACEMENTS.keys()];
  for (const p of BPH_PLACEMENTS.values()) {
    if (!p.nodeId || !BPH_HIDDEN_UPGRADES.has(p.nodeId)) continue;
    expect(canBuyBphNode(save, p.id)).toBe(false);
    expect(visibleBphPlacements(save, p.gridId).some(v => v.id === p.id)).toBe(false);
  }
});

test("a hidden branch preserves access only after its authored predecessor is purchased", () => {
  const save = freshBphSave();
  save.resources.mastery = 1e6;
  const target = "_SkillTreeMain_Demo:28:14";
  expect(canBuyBphNode(save, target)).toBe(false);
  save.purchasedPlacements = ["_SkillTreeMain_Demo:23:15"];

  expect(canBuyBphNode(save, target)).toBe(true);
  expect(visibleBphPlacements(save, BPH_DEFAULT_GRID).map(p => p.id)).toContain(target);
  expect(save.purchasedPlacements).toEqual(["_SkillTreeMain_Demo:23:15"]);
});

const typical22 = ("23:15 27:16 19:14 18:14 27:14 27:17 27:13 19:13 27:12 28:16 28:17 "
  + "28:14 29:14 30:16 18:13 17:14 16:14 30:17 28:12 29:12 16:13 19:16")
  .split(" ").map(coordinate => `${BPH_DEFAULT_GRID}:${coordinate}`);

test.each([
  { name: "fresh", ids: [], points: 0, count: 0 },
  { name: "typical22", ids: typical22, points: 595, count: 18 },
  { name: "training and pack", ids: [placement("HJ_ArmyTraining01"), placement("SN_HeroFromBasicPackDamage")], points: 2550, count: 2 },
])("stage two refunds $name once after stage one", ({ ids, points, count }) => {
  const save = freshBphSave();
  save.purchasedPlacements = [...ids];
  save.hiddenUpgradeRefund = { version: 1, count: 1, resources: { ...save.resources, mastery: 40 }, announced: true };
  const first = reload(save);
  expect(first.resources.mastery).toBe(points);
  expect(first.hiddenUpgradeRefund).toMatchObject({ version: 2, count, movedCount: count });
  expect(first.purchasedPlacements).toHaveLength(ids.length - count);
  expect(takeBphRefundNotice(first) === null).toBe(count === 0);
  const second = reload(first);
  expect(second.resources.mastery).toBe(points);
  expect(takeBphRefundNotice(second)).toBeNull();
  expect([...BPH_PLACEMENTS.values()].filter(p => p.nodeId && BPH_MOVED_UNIT_UPGRADES.has(p.nodeId))).toHaveLength(188);
});

test("hidden two-predecessor and rift gates remain required for traversing the removed cell", () => {
  const save = freshBphSave();
  save.resources.mastery = 1e6;
  save.resources.fruit = 1000;
  const target = "_SkillTreeNature:19:7";
  save.purchasedPlacements = [placement("Rift_Nature"), placement("Q_HeroRider")];
  expect(reachedBphPlacements(save).has(target)).toBe(false);
  save.purchasedPlacements.push(placement("Q_HeroDino"));
  expect(reachedBphPlacements(save).has(target)).toBe(true);
  save.purchasedPlacements = save.purchasedPlacements.filter(id => id !== placement("Rift_Nature"));
  expect(reachedBphPlacements(save).has(target)).toBe(false);
});
