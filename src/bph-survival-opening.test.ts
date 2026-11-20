import { expect, test } from "bun:test";
import { deferFixtureBarracks } from "./bph-barracks-fixture";
import { bphSurvivalPlan } from "./bph-survival";
import { bphSurvivalRegularBetween } from "./bph-survival-interval";
import { createBphRun, ensureBphSave } from "./bph-session";
import { bphConsumers, bphFxContext, bindBphConsumers } from "./bph-fx-dispatch";
import { BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { freshMeta } from "./meta";
import { advance } from "./rules";
import { BPH_MONSTERS } from "./bph-data";
import { BPH_SCALE } from "./bph-combat";
import { infantryMultiplierAt } from "./bph-survival-data";

const introductions: Readonly<Record<string, number>> = {
  Monster4_Sentinel2: 3, Monster4_Bandit2: 14, Monster4_Minorat2: 40,
};

test("the first spear slot fields one fighter with its full toughness and threat", () => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  const state = run.bph?.survival;
  if (!state) throw new Error("Expected survival");
  const [slot] = bphSurvivalPlan("WaveChapter1");
  run.squads = [];
  for (let i = 0; i < Math.ceil(slot.at / .05); i++) advance(run, .05);
  const infantry = run.enemies.flatMap(enemy => enemy.cargo ?? [enemy]);
  expect(infantry.map(enemy => enemy.bphProfileId)).toEqual([slot.profileId]);
  for (const enemy of infantry) {
    expect(enemy.maxHp).toBeCloseTo(BPH_MONSTERS[slot.profileId].hp * BPH_SCALE.hp * slot.hp, 8);
    expect(state.damage[enemy.id].unit).toBeCloseTo(slot.unitDamage, 8);
    expect(state.damage[enemy.id].castle).toBeCloseTo(slot.castleDamage, 8);
  }
});

test.each([[0, 1], [59.99, 1], [60, 1.5], [119.99, 1.5], [120, 2],
  [179.99, 2], [180, 3], [1200, 3]])("at %s seconds spear density is %s", (at, multiplier) => {
  expect(infantryMultiplierAt(at)).toBe(multiplier);
});

test.each([[60, 3], [120, 4], [180, 6]])("two spear slots at %s seconds share their HP, wall pressure and reward across %s bodies, each with the slot's full attack", (at, bodies) => {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades: [] });
  const state = run.bph?.survival;
  if (!state) throw new Error("Expected survival");
  const [first] = bphSurvivalPlan("WaveChapter1");
  const slot = { ...first, at };
  for (let i = 0; i < 2; i++) {
    state.reinforcements = [slot];
    advance(run, .01);
  }
  const infantry = run.enemies.flatMap(enemy => enemy.cargo ?? [enemy]);
  expect(infantry).toHaveLength(bodies);
  for (const enemy of infantry) {
    const share = 2 / bodies;
    expect(enemy.maxHp).toBeCloseTo(BPH_MONSTERS[slot.profileId].hp * BPH_SCALE.hp * slot.hp * share, 8);
    expect(state.damage[enemy.id].unit).toBeCloseTo(slot.unitDamage, 8);
    expect(state.damage[enemy.id].castle).toBeCloseTo(slot.castleDamage * share, 8);
    expect(enemy.infantryRewardShare).toBeCloseTo(share, 8);
  }
});

// These pins include the slow density ramp, fixed C1/C2 threats, C1 codex substitutions,
// and the time-weighted roster tiers (castle 1040).
test.each([
  ["WaveChapter1", "42405521e68e65cf1c2a14675397b8d229856be81b95e8cb8438e678ed541e3d"],
  ["WaveChapter2", "c5cc086ddf30f2a7e0837f0ca1a650648d8e1516a3cb10d89786cf8a9a68c6ce"],
  ["WaveChapter3", "8679586911618c7979ad2f511fad6739ef38ba71315a972b578bf4105191e52a"],
  ["WaveChapter4", "860505fe2eb05e413ed396d3623a6b6e7271f94dbd4c886224b45657e9b09b5a"],
] as const)("%s retains the tiered survival roster for the first ten minutes", (wave, expected) => {
  const regular = bphSurvivalPlan(wave).filter(entry => !entry.boss && entry.at < 600);
  const actual = new Bun.CryptoHasher("sha256").update(JSON.stringify(regular)).digest("hex");

  expect(actual).toBe(expected);
});

test("C4 reserves raw first arrivals inside its two twelve-enemy opening batches", () => {
  const regular = bphSurvivalPlan("WaveChapter4").filter(entry => !entry.boss);

  for (const [profileId, at] of Object.entries(introductions))
    expect(regular.find(entry => entry.profileId === profileId)?.at).toBe(at);
  expect(regular.filter(entry => entry.at < 30)).toHaveLength(12);
  expect(regular.filter(entry => entry.at >= 30 && entry.at < 60)).toHaveLength(12);
  // Two 12-body exceptions replace the two 180-body batches in the 10,952-body ramp.
  expect(regular).toHaveLength(10_616);
  expect(regular.filter(entry => entry.at < 30).map(entry => entry.profileId)).toEqual([
    ...Array.from({ length: 5 }, () => "Monster4_Sentinel2"),
    "Monster4_Bandit2",
    ...Array.from({ length: 6 }, () => "Monster4_Sentinel2"),
  ]);
});

test.each([
  [1, 1, 4_875], [1, 2, 9_751], [1.5, 1, 7_313], [2, 1, 9_750], [2, 3, 29_251],
])("C4 E1 speed %s count %s discards only pre-introduction empty slots", (speed, multiplier, count) => {
  const entries = bphSurvivalRegularBetween("WaveChapter4", { through: 600, dt: 600 },
    { after: 0, through: 600 * speed, countMultiplier: multiplier });

  expect(entries).toHaveLength(count);
  expect(entries.every(entry => entry.at >= introductions[entry.profileId])).toBe(true);
  expect([...new Set(entries.map(entry => entry.profileId))].sort()).toEqual(Object.keys(introductions).sort());
});

test("C4 projected eligibility is independent of query boundaries around introductions and batches", () => {
  const boundaries = [0, 2.99, 3, 3.01, 13.99, 14, 14.01, 29.99, 30, 30.01, 39.99, 40, 40.01, 60];
  const whole = bphSurvivalRegularBetween("WaveChapter4", { through: 60, dt: 60 },
    { after: 0, through: 120, countMultiplier: 3 });
  const split = boundaries.slice(1).flatMap((through, index) => {
    const after = boundaries[index];
    return bphSurvivalRegularBetween("WaveChapter4", { through, dt: through - after },
      { after: after * 2, through: through * 2, countMultiplier: 3 });
  });

  expect(split.map(entry => entry.profileId)).toEqual(whole.map(entry => entry.profileId));
  expect(split).toHaveLength(whole.length);
  for (const [index, entry] of split.entries()) expect(entry.at).toBeCloseTo(whole[index].at, 10);
});

test.each([false, true])("C4 actual spawn events respect game-time introductions with E1=%s", projected => {
  const meta = freshMeta();
  ensureBphSave(meta).chapter = 3;
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades: projected
    ? [...BPH_UPGRADE_NODES.Mod_Accelerate.effects, ...BPH_UPGRADE_NODES.Mod_Infestation3x.effects] : [] });
  const context = bphFxContext(run);
  if (!context) throw new TypeError("Missing survival effect context");
  const actual: { readonly profileId: string; readonly at: number }[] = [];
  bindBphConsumers(context, [...bphConsumers(), {
    id: "quests", kinds: [],
    onEvent(ctx, event) {
      if (event.kind === "enemy-spawn" && event.enemy.bphProfileId)
        actual.push({ profileId: event.enemy.bphProfileId, at: ctx.run.time });
    },
    consume() { throw new TypeError("Spawn observer has no effect kinds"); },
  }], false);
  deferFixtureBarracks(run);
  run.squads = []; run.shieldUntil = Infinity;

  for (let tick = 0; tick < 1200; tick++) {
    advance(run, .05);
    run.enemies = [];
  }

  expect(actual).toHaveLength(projected ? 139 : 24);
  expect(actual.every(entry => entry.at >= introductions[entry.profileId] - 1e-9)).toBe(true);
  for (const [profileId, at] of Object.entries(introductions)) {
    const first = actual.find(entry => entry.profileId === profileId);
    expect(first).toBeDefined();
    if (!projected) expect(first?.at).toBeCloseTo(at, 1);
  }
});
