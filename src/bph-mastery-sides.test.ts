import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import { freshBphSave, parseBphSave } from "./bph-save";
import { BPH_DEFAULT_GRID } from "./bph-upgrade-data";
import { activeBphEffects, BPH_PLACEMENTS, BPH_UPGRADE_NODES, buyBphNode } from "./bph-upgrades";
import { BPH_SURVIVAL_CHAPTERS } from "./bph-survival-data";
import { BPH_START_LEVEL_CAP, bphGeneralMastery, bphMasterySideCounts, bphStartLevel } from "./bph-mastery-sides";
import { bphPlacementSide } from "./bph-prep-card-groups";
import { BPH_RELIC_COUNT, bphRelicTag, bphRelicTagOfNumber } from "./bph-relic-tags";
import { createBphBattle } from "./bph-combat";

const mainOf = (side: "army" | "general") => [...BPH_PLACEMENTS.values()]
  .filter(p => p.gridId === BPH_DEFAULT_GRID && bphPlacementSide(p.id) === side).map(p => p.id);
const effectsFor = (ids: readonly string[]): BphEffect[] => {
  const save = freshBphSave();
  save.purchasedPlacements = [...ids];
  return [...activeBphEffects(save)];
};

test("the retained main web has 8 army and 10 general placements; promotions are army", () => {
  expect(mainOf("army")).toHaveLength(8);
  expect(mainOf("general")).toHaveLength(10);
  // Retained profile upgrades still follow their effect type, even when they target a troop.
  expect(bphPlacementSide(`${BPH_DEFAULT_GRID}:29:36`)).toBe("army"); // Thief blade count
  expect(bphPlacementSide(`${BPH_DEFAULT_GRID}:35:25`)).toBe("general"); // Skeleton spell bounce
  const promotions = [...BPH_PLACEMENTS.values()].filter(p => p.gridId === BPH_DEFAULT_GRID && p.nodeId
    && BPH_UPGRADE_NODES[p.nodeId].type === 0 && BPH_UPGRADE_NODES[p.nodeId].effects.some(e => e.type === "HeroKillUpgradeUnlock"));
  expect(promotions.length).toBeGreaterThan(0);
  expect(promotions.every(p => bphPlacementSide(p.id) === "army")).toBe(true);
});

test("the retained general placements grant -20% cooldown, +15% radius and a Lv3 start", () => {
  const general = mainOf("general");
  expect(bphGeneralMastery(effectsFor(general.slice(0, 3)))).toEqual({ purchases: 3, cooldownCut: .06, radiusBonus: .045, startLevel: 1 });
  expect(bphStartLevel(effectsFor(general.slice(0, 4)))).toBe(2);
  expect(bphStartLevel(effectsFor(general.slice(0, 8)))).toBe(3);
  const all = bphGeneralMastery(effectsFor(general));
  expect(all).toEqual({ purchases: 10, cooldownCut: .2, radiusBonus: .15, startLevel: 3 });
  expect(bphMasterySideCounts(effectsFor(mainOf("army").slice(0, 5)))).toEqual({ army: 5, general: 0 });
});

test("general mastery caps cooldown, radius and starting level above the live purchase count", () => {
  const effects: BphEffect[] = Array.from({ length: 20 }, (_, i) => ({
    nodeId: "SN_ThunderboltDamage", type: "ThunderboltDamageBonus", value: 1,
    effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
    targets: { placementId: `cap-fixture:${i}` },
  }));
  expect(bphGeneralMastery(effects))
    .toEqual({ purchases: 20, cooldownCut: .3, radiusBonus: .2, startLevel: BPH_START_LEVEL_CAP });
});

test("a run carries the general-side bonus only when one was bought, so other runs keep their bytes", () => {
  const save = freshBphSave();
  const wave = BPH_SURVIVAL_CHAPTERS[0];
  expect("generalMastery" in createBphBattle(save, [], wave)).toBe(false);
  const battle = createBphBattle(save, effectsFor(mainOf("general").slice(0, 8)), wave);
  expect(battle.generalMastery?.startLevel).toBe(3);
});

test("old payment and reset receipts are discarded without crediting medals or losing purchased nodes", () => {
  const castle = `${BPH_DEFAULT_GRID}:23:15`, rank = `${BPH_DEFAULT_GRID}:28:14`;
  const save = parseBphSave({
    version: 1, resources: { mastery: 9600 }, purchasedPlacements: [castle, rank],
    purchasedNodes: ["SN_TowerHP", "SN_SquireUpgrade2"],
    masteryWebPayments: { [rank]: 1920 }, lifecycle: { claimed: ["mastery-respec:2026-11-19", "quest:kept"] },
  });
  expect(save.purchasedPlacements).toEqual([castle, rank]);
  expect(save.resources.mastery).toBe(100);
  expect(parseBphSave(JSON.parse(JSON.stringify(save))).resources.mastery).toBe(100);
  expect(save.lifecycle.claimed).toContain("quest:kept");
  expect(save.lifecycle.claimed).not.toContain("mastery-respec:2026-11-19");
  expect("masteryWebPayments" in save).toBe(false);
  expect(buyBphNode(save, rank)).toBe(false);
  expect(save.resources.mastery).toBe(100);
});

test("relics split 12 general-type and 28 army-type; today's codex relics follow their relic-40 numbers", () => {
  const tags = Array.from({ length: BPH_RELIC_COUNT }, (_, index) => bphRelicTagOfNumber(index + 1));
  expect(tags.filter(tag => tag === "general")).toHaveLength(12);
  expect(tags.filter(tag => tag === "army")).toHaveLength(28);
  expect(bphRelicTag("Relic1_Rapier")).toBe("general");
  expect(bphRelicTag("Relic1_Club")).toBe("general");
  expect(bphRelicTag("Relic1_CharmWarrior")).toBe("army");
  expect(bphRelicTag("R_HeroMoveSpeed")).toBe("army");
});
