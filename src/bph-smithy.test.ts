import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { addBphProfile, bphStats } from "./bph-combat";
import { BPH_PROFILES } from "./bph-data";
import { advance } from "./rules";
import { BPH_SMITHY, BPH_WALL_TIER_PLACEMENTS, bphSmithyClassPrice, bphSmithyWallPrice, bphWallTier, bphWallTierCap,
  buyBphSmithyClass, buyBphSmithyWall } from "./bph-smithy";

const owned = (placementId: string): BphEffect => ({ nodeId: "SN_TowerHP", type: "BonfireMaxHP", value: 0,
  effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: { placementId } });
function battle(upgrades: readonly BphEffect[] = [], gold = 1000) {
  const run = createBphRun(freshMeta(), { seed: 1593, general: "권율", upgrades });
  run.phase = "playing"; run.gold = gold;
  return run;
}

test("a run starts on the 100-hit palisade, and the mastery map allows the stone and castle walls in order", () => {
  const run = battle();
  expect(bphWallTier(run)).toBe(0);
  expect(BPH_SMITHY.walls.map(wall => wall.hits)).toEqual([100, 500, 1000]);
  expect(run.wall).toBeCloseTo(run.maxWall);
  expect(Object.values(run.walls).every(hp => Math.abs(hp - run.maxWall / 4) < 1e-9)).toBe(true);
  expect(bphWallTierCap([])).toBe(0);
  expect(bphWallTierCap([owned(BPH_WALL_TIER_PLACEMENTS[0])])).toBe(1);
  expect(bphWallTierCap([owned(BPH_WALL_TIER_PLACEMENTS[1])])).toBe(0);
  expect(bphWallTierCap(BPH_WALL_TIER_PLACEMENTS.map(owned))).toBe(2);
});
test("each wall tier is paid in gold, raises max wall HP, and stops at the mastery cap", () => {
  const run = battle([owned(BPH_WALL_TIER_PLACEMENTS[0])]), base = run.maxWall / BPH_SMITHY.walls[0].hits, sides = { ...run.walls };
  expect(bphSmithyWallPrice(run)).toBe(BPH_SMITHY.walls[1].price);
  expect(buyBphSmithyWall(run)).toBe(true);
  expect(run.gold).toBe(1000 - BPH_SMITHY.walls[1].price);
  expect(run.maxWall).toBeCloseTo(base * BPH_SMITHY.walls[1].hits);
  expect(run.walls.위).toBeCloseTo(sides.위 + base * (BPH_SMITHY.walls[1].hits - BPH_SMITHY.walls[0].hits) / 4);
  expect(run.wall).toBeCloseTo(Object.values(run.walls).reduce((sum, hp) => sum + hp, 0));
  expect(bphSmithyWallPrice(run)).toBeNull();
  expect(buyBphSmithyWall(run)).toBe(false);
  const full = battle(BPH_WALL_TIER_PLACEMENTS.map(owned));
  full.walls.좌 = 0;
  expect(buyBphSmithyWall(full) && buyBphSmithyWall(full)).toBe(true);
  expect(full.maxWall).toBeCloseTo(base * BPH_SMITHY.walls[2].hits);
  expect(full.walls.좌).toBe(0);
});
test("a class level lifts every soldier of that class at a rising price, and standing soldiers re-fit their HP", () => {
  const run = battle(), spear = Object.values(BPH_PROFILES).find(profile => profile.classId === "spearman")!;
  addBphProfile(run, { profileId: spear.id, copies: 1, foil: false, discovered: false }, { packId: "DeliveryBox", cause: "effect" });
  const unit = run.squads.flatMap(squad => squad.soldiers)[0], before = bphStats(unit, run)!;
  const prices = [0, 1, 2, 3].map(() => { const price = bphSmithyClassPrice(run, "spearman"); buyBphSmithyClass(run, "spearman"); return price; });
  expect(prices).toEqual([4, 8, 16, 32]);
  expect(bphSmithyClassPrice(run, "spearman")).toBeNull();
  expect(buyBphSmithyClass(run, "spearman")).toBe(false);
  const after = bphStats(unit, run)!, boost = 1 + BPH_SMITHY.perLevel * BPH_SMITHY.maxLevel;
  expect(after.hp).toBeCloseTo(before.hp * boost);
  expect(after.damage).toBeCloseTo(before.damage * boost);
  advance(run, 1 / 30);
  expect(unit.maxHp).toBeCloseTo(after.hp);
  expect(bphSmithyClassPrice(run, "archer")).toBe(4);
});
test("the smithy sells nothing without gold or outside play", () => {
  const poor = battle([], 3);
  expect(buyBphSmithyClass(poor, "archer")).toBe(false);
  expect(poor.bph?.smithy).toBeUndefined();
  const paused = battle([owned(BPH_WALL_TIER_PLACEMENTS[0])]);
  paused.phase = "choice";
  expect(buyBphSmithyWall(paused)).toBe(false);
});
