import { expect, test } from "bun:test";
import { openBphPack } from "./bph";
import { BPH_PACKS } from "./bph-data";
import { freshBphSave, parseBphSave } from "./bph-save";
import type { BphEffect } from "./bph-contract";
import { bphDrawWindowChance } from "./bph-draw-policy";

const noNaturalChance: readonly BphEffect[] = [{
  nodeId: "isolate-guarantee", type: "GlobalChanceEffectMultiplier", value: -1,
  effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {},
}];
const pending = (seed: number, heroAge: number, foilAge: number) => {
  const save = freshBphSave(seed);
  save.discovered = BPH_PACKS.Pack2_Advanced.pool.map(p => p.id);
  save.foils = save.discovered.filter(id => id !== "Hero2_Knight");
  for (const id of save.discovered) save.questProgress[`draw:foil-copies:${id}`] = 100;
  save.packs.Pack2_Advanced = { opened: 100, sinceNewHero: heroAge, sinceNewFoil: foilAge };
  return save;
};
const openAdvanced = (save: ReturnType<typeof freshBphSave>, effects: readonly BphEffect[] = []) =>
  openBphPack(save, { packId: "Pack2_Advanced", effects });

for (const row of [
  { label: "before minimum", age: 7, probability: 0 },
  { label: "at minimum", age: 8, probability: 1 / 4 },
  { label: "at maximum", age: 11, probability: 1 },
]) test(`hero guarantee ${row.label} uses the authored inclusive window`, () => {
  let guaranteed = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const save = pending(seed, row.age, 0);
    save.discovered = save.discovered.filter(id => id !== "Hero2_Knight");
    const result = openAdvanced(save);
    if (result.reason === "hero-pity") {
      guaranteed++;
      expect(result.cards[0]).toMatchObject({ profileId: "Hero2_Knight", discovered: true });
      expect(save.packs.Pack2_Advanced.sinceNewHero).toBe(0);
    }
  }
  if (row.probability === 0 || row.probability === 1) expect(guaranteed).toBe(1000 * row.probability);
  else expect(Math.abs(guaranteed / 1000 - row.probability)).toBeLessThan(.05);
  console.log(`PITY_HERO ${row.label} guarantees=${guaranteed}/1000 expected=${row.probability}`);
});

for (const row of [
  { label: "before minimum", age: 14, probability: 0 },
  { label: "at minimum", age: 15, probability: 1 / 7 },
  { label: "at maximum", age: 21, probability: 1 },
]) test(`new foil guarantee ${row.label} uses its own inclusive window`, () => {
  let guaranteed = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const save = pending(seed, 0, row.age);
    const result = openAdvanced(save, noNaturalChance);
    if (result.cards[0].foil) {
      guaranteed++;
      expect(result.cards[0].profileId).toBe("Hero2_Knight");
      expect(save.packs.Pack2_Advanced.sinceNewFoil).toBe(0);
    }
  }
  if (row.probability === 0 || row.probability === 1) expect(guaranteed).toBe(1000 * row.probability);
  else expect(Math.abs(guaranteed / 1000 - row.probability)).toBeLessThan(.05);
  console.log(`PITY_FOIL ${row.label} guarantees=${guaranteed}/1000 expected=${row.probability}`);
});

test("original foilPity adds probability per non-foil appearance of that card", () => {
  const observed: number[] = [];
  for (const age of [0, 10]) {
    let foils = 0;
    for (let seed = 1; seed <= 10000; seed++) {
      const save = pending(seed, 0, 0);
      for (const id of save.discovered) save.questProgress[`draw:foil-misses:${id}`] = age;
      const result = openAdvanced(save);
      if (result.cards[0].foil) foils++;
    }
    observed.push(foils);
  }
  expect(Math.abs(observed[0] / 10000 - .00800000037997961)).toBeLessThan(.006);
  expect(Math.abs(observed[1] / 10000 - (.00800000037997961 + 10 * .00570000009611249))).toBeLessThan(.012);
  console.log(`PITY_FOIL accumulation ages=0/10 foils=${observed.join("/")} n=10000`);
});

test("collection exhaustion disables both guarantee windows without consuming window RNG", () => {
  const ordinary = pending(9104, 0, 0), exhausted = pending(9104, 1000, 1000);
  ordinary.foils = [...ordinary.discovered]; exhausted.foils = [...exhausted.discovered];
  const a = openAdvanced(ordinary), b = openAdvanced(exhausted);
  expect(b).toEqual(a);
  expect(exhausted.rng).toBe(ordinary.rng);
});

test("fixed opening scripts outrank both overdue windows without consuming their RNG", () => {
  const ordinary = freshBphSave(5231), overdue = freshBphSave(5231);
  overdue.packs.Pack1_Basic = { opened: 0, sinceNewHero: 100, sinceNewFoil: 100 };
  expect(openBphPack(overdue, { packId: "Pack1_Basic", effects: noNaturalChance }))
    .toEqual(openBphPack(ordinary, { packId: "Pack1_Basic", effects: noNaturalChance }));
  expect(overdue.rng).toBe(ordinary.rng);
});

test("simultaneous hard maxima retain the unknown hero and make that hero foil", () => {
  const save = pending(62, 11, 21);
  save.discovered = save.discovered.filter(id => id !== "Hero2_Knight");
  save.foils = save.foils.filter(id => id !== "Hero2_Monk");
  expect(openAdvanced(save, noNaturalChance)).toMatchObject({
    reason: "hero-pity", cards: [{ profileId: "Hero2_Knight", discovered: true, foil: true }],
  });
});

test("an early foil window cannot prematurely trigger the scheduled Squire foil", () => {
  let foilSeen = false;
  for (let seed = 1; seed <= 1000; seed++) {
    const save = freshBphSave(seed);
    save.firstThunderstorm = true;
    save.discovered = BPH_PACKS.Pack1_Basic.pool.map(p => p.id);
    for (const id of save.discovered) save.questProgress[`draw:foil-copies:${id}`] = 100;
    save.packs.Pack1_Basic = { opened: 17, sinceNewHero: 0, sinceNewFoil: 17 };
    const result = openBphPack(save, { packId: "Pack1_Basic", effects: noNaturalChance });
    if (result.cards[0].foil) {
      foilSeen = true;
      // With no authored scheduled guarantee before opening 24, the foil pool
      // can still select an ordinary non-Squire candidate.
      if (result.cards[0].profileId !== "Hero1_Squire") return;
    }
  }
  expect(foilSeen).toBe(true);
  throw new TypeError("Every early guarantee was incorrectly replaced by scheduled Squire");
});

for (const [seed, expected] of [
  [45782, [false, true, true, true]],
  [22571, [false, false, false, false]],
] as const) test(`original monster foil chance uses only current prestige for seed ${seed}`, () => {
  const actual = [0, 1, 2, 9].map(dimension => {
    const save = freshBphSave(seed); save.dimension = dimension;
    return openBphPack(save, { packId: "GravePackRats", effects: [] }).cards[0].foil;
  });
  expect(actual).toEqual([...expected]);
});

test("zero prestige overrides fall back to FoilManager rather than summing prestige rows", () => {
  const foil = [0, 1, 2, 9].map(dimension => {
    const save = pending(430, 0, 0); save.dimension = dimension;
    save.foils = [...save.discovered];
    return openAdvanced(save).cards[0].foil;
  });
  expect(foil).toEqual([false, true, true, true]);
});

test("a tome discovery resets the original hero/tome discovery window", () => {
  const save = freshBphSave(18);
  save.discovered = ["Hero1_Squire", "Hero1_Barbarian", "Hero1_Archer"];
  save.packs.Pack1_Basic = { opened: 20, sinceNewHero: 7, sinceNewFoil: 0 };
  expect(openBphPack(save, { packId: "Pack1_Basic", effects: [] }).cards[0])
    .toMatchObject({ profileId: "Tome_Thunderstorm", discovered: true });
  expect(save.packs.Pack1_Basic.sinceNewHero).toBe(0);
});

test("discovery counters pause while no eligible unseen hero/tome or foil remains", () => {
  const save = pending(9104, 5, 8);
  save.foils = [...save.discovered];
  openAdvanced(save);
  expect(save.packs.Pack2_Advanced).toMatchObject({ sinceNewHero: 5, sinceNewFoil: 8 });
});

for (const [id, required] of [
  ["Hero1_Squire", 8], ["Hero1_Barbarian", 7], ["Hero1_Archer", 5], ["Hero3_Portal", 3],
] as const) test(`${id} uses its original rarity copy gate before natural foil eligibility`, () => {
  const save = freshBphSave(5);
  const effect: BphEffect = { nodeId: "repeat-common", type: "OpenTargetPackExtraHeroChance",
    value: 1, targets: { targetPack: "Pack2_Advanced", targetHero: id },
    effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0 };
  const foils: boolean[] = [];
  for (let i = 0; i < required + 2; i++) {
    const result = openBphPack(save, { packId: "Pack2_Advanced", effects: [effect],
      instance: { id: i, packId: "Pack2_Advanced", box: false, foilChanceBonus: 1 } });
    foils.push(result.cards[result.cards.length - 1].foil);
  }
  expect(foils).toEqual([...Array.from({ length: required + 1 }, () => false), true]);
});

test("a nonfoilable egg pack card does not inherit hero or monster foil chance", () => {
  const save = freshBphSave(33216); save.dimension = 2;
  const result = openBphPack(save, { packId: "GravePackRats", effects: [],
    instance: { id: 1, packId: "GravePackRats", box: false, foilChanceBonus: 1 } });
  expect(result.cards[0]).toMatchObject({ profileId: "Monster9Spawner_CrystalTurret", foil: false });
});

test("nonfoil appearances and a known foil update and reset only that card's persisted misses", () => {
  const save = freshBphSave(441);
  save.discovered = BPH_PACKS.Pack1_Basic.pool.map(p => p.id);
  save.foils = [...save.discovered];
  save.questProgress["draw:foil-misses:Hero1_Squire"] = 2;
  save.questProgress["draw:foil-misses:Hero1_Archer"] = 5;
  openBphPack(save, { packId: "Pack1_Basic", effects: noNaturalChance });
  expect(save.questProgress["draw:foil-misses:Hero1_Squire"]).toBe(3);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  openBphPack(restored, { packId: "Pack1_Basic", effects: [],
    instance: { id: 1, packId: "Pack1_Basic", box: false, foilChanceBonus: 1 } });
  expect(restored.questProgress["draw:foil-misses:Hero1_Squire"]).toBe(0);
  expect(restored.questProgress["draw:foil-misses:Hero1_Archer"]).toBe(5);
});

test("disabled windows stay off and a maximum below minimum uses the minimum", () => {
  expect(bphDrawWindowChance(100, 0, 12)).toBe(0);
  expect(bphDrawWindowChance(8, 9, 4)).toBe(0);
  expect(bphDrawWindowChance(9, 9, 4)).toBe(1);
});

test("prestige disables repeat hero foil payouts but retains the first Binder foil reward", () => {
  const save = freshBphSave(441);
  save.discovered = BPH_PACKS.Pack1_Basic.pool.map(p => p.id);
  save.questProgress["draw:foil-copies:Hero1_Squire"] = 8;
  for (let i = 0; i < 2; i++) {
    const result = openBphPack(save, { packId: "Pack1_Basic", effects: [],
      instance: { id: i, packId: "Pack1_Basic", box: false, foilChanceBonus: 1 } });
    expect(result.cards[0]).toMatchObject({ profileId: "Hero1_Squire", foil: true });
    expect(save.resources.foilium).toBe(1);
  }
});

test("reload retains active window progression and the next deterministic receipt", () => {
  const save = pending(501, 8, 15);
  save.discovered = save.discovered.filter(id => id !== "Hero2_Knight");
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(openAdvanced(restored)).toEqual(openAdvanced(save));
  expect(restored.packs).toEqual(save.packs);
  expect(restored.rng).toBe(save.rng);
});
