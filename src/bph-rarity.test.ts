import { expect, test } from "bun:test";
import { openBphPack } from "./bph";
import { BPH_PACKS, BPH_PROFILES } from "./bph-data";
import { freshBphSave } from "./bph-save";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import type { BphEffect } from "./bph-contract";

const rare = BPH_UPGRADE_NODES.Relic1_Rare.effects.filter(e => e.type === "PackRareWeightBoost");
const epic = BPH_UPGRADE_NODES.R_Epic.effects.filter(e => e.type === "PackEpicWeightBoost");
const mature = (seed: number) => {
  const save = freshBphSave(seed);
  save.discovered = BPH_PACKS.Pack2_Advanced.pool.map(p => p.id);
  save.foils = [...save.discovered];
  save.packs.Pack2_Advanced = { opened: 100, sinceNewHero: 0, sinceNewFoil: 0 };
  return save;
};
const rarityCounts = (effects: readonly BphEffect[], subset: boolean) => {
  const save = mature(0x548723), counts = [0, 0, 0, 0];
  for (let i = 0; i < 10000; i++) {
    if (subset) {
      // pity.md: newUnitPityMinPacks/MaxPacks include heroes and tomes; exclude the known tome from this Rare/Epic subset.
      save.discovered = ["Hero2_Monk", "Tome_RaiseDead"];
      save.packs.Pack2_Advanced.sinceNewHero = 11;
    }
    const result = openBphPack(save, { packId: "Pack2_Advanced", effects });
    const card = BPH_PROFILES[result.cards[0].profileId];
    counts[card?.rarity ?? 3]++;
    save.pendingResults.length = 0;
  }
  return counts;
};

for (const row of [
  { name: "Rare", effects: rare, expected: [60 / 115, 45 / 115, 9 / 115, 1 / 115] },
  { name: "Epic", effects: epic, expected: [60 / 109, 30 / 109, 18 / 109, 1 / 109] },
  { name: "combined", effects: [...rare, ...epic], expected: [60 / 124, 45 / 124, 18 / 124, 1 / 124] },
]) test(`original ${row.name} boosts change normalized actual pack rarity distribution`, () => {
  const counts = rarityCounts(row.effects, false);
  for (let i = 0; i < counts.length; i++)
    expect(Math.abs(counts[i] / 10000 - row.expected[i])).toBeLessThan(.02);
  console.log(`RARITY_WEIGHT ${row.name} n=10000 counts=${counts.join("/")} expected=${row.expected.join("/")}`);
});

test("hero-pity selection renormalizes boosted weights inside the unknown-hero subset", () => {
  const counts = rarityCounts(rare, true);
  expect(counts[0]).toBe(0);
  expect(counts[3]).toBe(0);
  expect(Math.abs(counts[1] / 10000 - 45 / 54)).toBeLessThan(.02);
  console.log(`RARITY_WEIGHT hero-subset n=10000 counts=${counts.join("/")} expectedRare=${45 / 54}`);
});

test("zero boosts preserve receipts and account RNG across sequential openings", () => {
  const ordinary = mature(7781), zero = mature(7781);
  const effects = [...rare, ...epic].map(e => ({ ...e, value: 0 }));
  for (let i = 0; i < 100; i++) {
    expect(openBphPack(zero, { packId: "Pack2_Advanced", effects }))
      .toEqual(openBphPack(ordinary, { packId: "Pack2_Advanced", effects: [] }));
    expect(zero.rng).toBe(ordinary.rng);
  }
});

test("rarity upgrades preserve fixed Basic opening cards and RNG", () => {
  const ordinary = freshBphSave(441), boosted = freshBphSave(441);
  for (let i = 0; i < 6; i++) {
    expect(openBphPack(boosted, { packId: "Pack1_Basic", effects: [...rare, ...epic] }))
      .toEqual(openBphPack(ordinary, { packId: "Pack1_Basic", effects: [] }));
    expect(boosted.rng).toBe(ordinary.rng);
  }
});
