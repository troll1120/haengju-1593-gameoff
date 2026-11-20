import { expect, test } from "bun:test";
import {
  bphGeneralUpgradePrice, buyBphGeneralUpgrade, GENERAL_GROWTH_UPGRADE, generalGrowthRank, generalGrowthSecondsSaved,
} from "./bph-general-upgrades";
import { freshBphSave, parseBphSave } from "./bph-save";

test("장수 성장 속도 buys one account rank at a time and saves its medals and time reduction", () => {
  const id = "generalGrowthSpeed";
  expect(GENERAL_GROWTH_UPGRADE).toMatchObject({ id, name: "장수 성장 속도" });
  let save = parseBphSave(JSON.parse(JSON.stringify(freshBphSave())));
  expect(generalGrowthRank(save)).toBe(0);
  expect(generalGrowthSecondsSaved(save)).toBe(0);
  save.resources.mastery = 1050;
  save.resources.foilium = 20;
  for (const { price, rank, balance, seconds } of [
    { price: 100, rank: 1, balance: 950, seconds: 60 },
    { price: 150, rank: 2, balance: 800, seconds: 120 },
    { price: 200, rank: 3, balance: 600, seconds: 180 },
    { price: 250, rank: 4, balance: 350, seconds: 240 },
    { price: 350, rank: 5, balance: 0, seconds: 300 },
  ] as const) {
    expect(bphGeneralUpgradePrice(save, id)).toBe(price);
    const poor = structuredClone(save);
    poor.resources.mastery = price - 1;
    expect(buyBphGeneralUpgrade(poor, id)).toBe(false);
    expect(poor).toEqual({ ...save, resources: { ...save.resources, mastery: price - 1 } });

    expect(buyBphGeneralUpgrade(save, id)).toBe(true);
    save = parseBphSave(JSON.parse(JSON.stringify(save)));
    expect(generalGrowthRank(save)).toBe(rank);
    expect(generalGrowthSecondsSaved(save)).toBe(seconds);
    expect(save.resources.mastery).toBe(balance);
    expect(save.resources.foilium).toBe(20);
    expect(save.generalUpgrades).toBeUndefined();
  }

  save.resources.mastery = 1000;
  expect(bphGeneralUpgradePrice(save, id)).toBeUndefined();
  expect(buyBphGeneralUpgrade(save, id)).toBe(false);
  expect(generalGrowthRank(save)).toBe(5);
  expect(save.resources.mastery).toBe(1000);
});

test("legacy and invalid ranks do not reduce the first Lv10 time", () => {
  for (const generalGrowthSpeed of [undefined, -1, 1.5, 6, "3"]) {
    const restored = parseBphSave({ ...freshBphSave(), generalGrowthSpeed });
    expect(generalGrowthRank(restored)).toBe(0);
    expect(generalGrowthSecondsSaved(restored)).toBe(0);
    expect(restored).not.toHaveProperty("generalGrowthSpeed");
  }
});
