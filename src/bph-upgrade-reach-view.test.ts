import { expect, test } from "bun:test";
import { freshBphSave } from "./bph-save";
import { BPH_PLACEMENTS } from "./bph-upgrades";
import type { BphPlacement } from "./bph-upgrade-data";
import { bphTargetRows, bphTileState } from "./bph-upgrade-reach-view";

const GRAVEYARD = "_SkillTreeMain_Demo:23:27", FROZEN = "_SkillTreeMain_Demo:23:40", NATURE = "_SkillTreeMain_Demo:23:13";
const placement = (id: string): BphPlacement => {
  const found = BPH_PLACEMENTS.get(id);
  if (!found) throw new Error(`placement ${id} is missing from the effective registry`);
  return found;
};
const tower = [...BPH_PLACEMENTS.values()].find(p => p.start && p.nodeId === "SN_TowerHP");

test("an unbought rift reads as locked regardless of dimension, below a purchase and an open buy", () => {
  if (!tower) throw new Error("the tower start placement is missing");
  const rows = [
    { id: GRAVEYARD, dimension: 0, bought: false, state: "locked" },
    { id: FROZEN, dimension: 1, bought: false, state: "locked" },
    { id: NATURE, dimension: 0, bought: false, state: "available" },
    { id: GRAVEYARD, dimension: 2, bought: false, state: "locked" },
    { id: GRAVEYARD, dimension: 0, bought: true, state: "bought" },
    { id: tower.id, dimension: 0, bought: false, state: "available" },
  ] as const;
  const seen = rows.map(row => {
    const save = freshBphSave();
    save.dimension = row.dimension; save.resources.mastery = 1_000_000;
    if (row.bought) save.purchasedPlacements.push(row.id);
    return [row.id, row.dimension, bphTileState(save, placement(row.id))];
  });
  expect(seen).toEqual(rows.map(row => [row.id, row.dimension, row.state]));
});

const manifest = (training: readonly string[]) => ({
  current144: ["a", "b", "c", "shop"], core143: ["a", "b", "c"], laterShop: ["shop"], future74: ["f1", "f2"],
  training20: [...training], survival: ["a", "b", "c", ...training],
});

test("target rows count purchases against each manifest group's own length", () => {
  const save = freshBphSave();
  save.purchasedPlacements.push("a", "c", "f2", "elsewhere");
  expect(bphTargetRows(save, manifest([]))).toEqual([
    { group: "core", bought: 2, total: 3 }, { group: "laterShop", bought: 0, total: 1 }, { group: "future", bought: 1, total: 2 },
  ]);
});

test("growth rows appear only when the effective registry supplies training placements", () => {
  const save = freshBphSave();
  save.purchasedPlacements.push("a", "t1");
  expect(bphTargetRows(save, manifest(["t1", "t2"])).map(row => [row.group, row.bought, row.total])).toEqual([
    ["core", 1, 3], ["training", 1, 2], ["survival", 2, 5], ["laterShop", 0, 1], ["future", 0, 2],
  ]);
});
