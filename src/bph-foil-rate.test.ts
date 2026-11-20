import { expect, test } from "bun:test";
import { openBphPack } from "./bph";
import { BPH_PACKS } from "./bph-data";
import { freshBphSave } from "./bph-save";
import { activeBphEffects, BPH_PLACEMENTS, buyBphNode } from "./bph-upgrades";
import type { BphEffect } from "./bph-contract";

const N = 20000;
function rate(packId: string, effects: readonly BphEffect[]): number {
  let foils = 0;
  for (let seed = 1; seed <= N; seed++) {
    const save = freshBphSave(seed);
    save.discovered = BPH_PACKS[packId].pool.map(entry => entry.id);
    save.foils = [...save.discovered];
    save.firstSquireFoil = save.firstThunderstorm = true;
    save.packs[packId] = { opened: 100, sinceNewHero: 0, sinceNewFoil: 0 };
    const result = openBphPack(save, { packId, effects });
    if (result.cards[0].foil) foils++;
  }
  return foils / N;
}

for (const row of [
  { nodeId: "SN_FoilChance1", packId: "Pack2_Advanced", expected: .018 },
  { nodeId: "SN_FoilChance1 1", packId: "Pack2_Advanced", expected: .028 },
  { nodeId: "SN_FoilChance2", packId: "Pack1_Basic", expected: .018 },
  { nodeId: "SN_FoilChance2", packId: "Pack2_Advanced", expected: .008 },
]) test(`buying ${row.nodeId} gives ${row.expected} natural foil rate in ${row.packId}`, () => {
  const account = freshBphSave();
  account.dimension = 2;
  for (const key of Object.keys(account.resources)) Object.assign(account.resources, { [key]: 1e12 });
  const placement = [...BPH_PLACEMENTS.values()].find(p => p.nodeId === row.nodeId);
  if (!placement) throw new RangeError(row.nodeId);
  account.purchasedPlacements = [...BPH_PLACEMENTS.keys()].filter(id => id !== placement.id);
  expect(buyBphNode(account, placement.id)).toBe(true);
  const effects = activeBphEffects(account).filter(e => e.nodeId === row.nodeId);
  expect(effects).toHaveLength(1);
  const measured = rate(row.packId, effects);
  console.log(`FOIL_RATE ${row.nodeId} ${row.packId} n=${N} observed=${measured} expected=${row.expected}`);
  expect(Math.abs(measured - row.expected)).toBeLessThan(.003);
});

test("foil upgrades stack additively before the existing global chance multiplier", () => {
  const effects: BphEffect[] = [
    ...["SN_FoilChance1", "SN_FoilChance1 1", "SN_FoilChance2"].flatMap(nodeId => {
      const account = freshBphSave();
      account.purchasedPlacements = [...BPH_PLACEMENTS.values()].filter(p => p.nodeId === nodeId).slice(0, 1).map(p => p.id);
      return activeBphEffects(account);
    }),
    { nodeId: "chance", type: "GlobalChanceEffectMultiplier", value: 1,
      effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {} },
  ];
  const measured = rate("Pack1_Basic", effects);
  console.log(`FOIL_RATE stacked n=${N} observed=${measured} expected=.096`);
  expect(Math.abs(measured - .096)).toBeLessThan(.006);
});
