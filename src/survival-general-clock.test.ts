import { expect, test } from "bun:test";
import { survivalGeneralLevel } from "./chaos-growth";
import { buyGeneralGrowthUpgrade, generalGrowthRank } from "./bph-general-growth-upgrade";
import { freshBphSave, parseBphSave } from "./bph-save";

test("growth purchases spend the exact medal ladder and survive a save round trip", () => {
  const save = freshBphSave();
  for (const [index, cost] of [100, 150, 200, 250, 350].entries()) {
    save.resources.mastery = cost - 1;
    expect(buyGeneralGrowthUpgrade(save)).toBe(false);
    save.resources.mastery++;
    expect(buyGeneralGrowthUpgrade(save)).toBe(true);
    expect(save.resources.mastery).toBe(0);
    expect(generalGrowthRank(parseBphSave(JSON.parse(JSON.stringify(save))))).toBe(index + 1);
  }
  save.resources.mastery = 1000;
  expect(buyGeneralGrowthUpgrade(save)).toBe(false);
  expect(save.resources.mastery).toBe(1000);
});

test.each([
  [0, 900, 10], [1, 840, 12], [2, 780, 14], [3, 720, 16], [4, 660, 18], [5, 600, 20],
])("growth rank %d reaches its last level at the announced time", (rank, seconds, level) => {
  expect(survivalGeneralLevel(0, rank)).toBe(1);
  for (let next = 2; next <= level; next++) {
    const boundary = seconds * (next - 1) / (level - 1);
    expect(survivalGeneralLevel(boundary - .05, rank)).toBe(next - 1);
    expect(survivalGeneralLevel(boundary, rank)).toBe(next);
  }
  expect(survivalGeneralLevel(seconds + 300, rank)).toBe(level);
});
