import { expect, test } from "bun:test";
import { onBphNativePortal } from "./bph-native-summons-portal";
import { nativeFixture, originalNativeEffects } from "./bph-native-passives-test-context";

test("Portal waits ten seconds, summons five total heroes, then expires even if children die", () => {
  const f = nativeFixture(onBphNativePortal, [], [0, 0, 0, 0, 0]);
  f.ctx.save.discovered = ["Hero1_Squire", "Tome_Thunderstorm", "Hero_SkeletonUpgraded"];
  const portal = f.spawn("Hero3_Portal", { resultId: 47 });
  f.step(9.9);
  expect(f.run.squads[0].soldiers).toHaveLength(1);
  f.step(0.1);
  f.run.squads[0].soldiers[1].hp = 0;
  f.step(40);
  const children = f.run.squads[0].soldiers.filter(unit => unit.bph?.parentId === portal.id);
  expect(children).toHaveLength(5);
  expect(f.draws()).toBe(5);
  expect(children.every(unit => unit.bph?.profileId === "Hero1_Squire"
    && unit.bph.resultId === 47 && unit.bph.cause === "summon")).toBe(true);
  expect(portal.hp).toBeGreaterThan(0);
  f.step(1); f.step(100);
  expect(portal.hp).toBe(0);
  expect(f.run.squads[0].soldiers.filter(unit => unit.hp > 0 && unit.bph?.parentId === portal.id)).toHaveLength(4);
  expect(f.events.filter(event => event.kind === "spellCast")).toHaveLength(5);
  expect(f.events.filter(event => event.kind === "unit-death" && event.unit === portal)).toHaveLength(1);
});

test("Portal applies original cast speed and rarity weights to authored collection cards", () => {
  const base = nativeFixture(onBphNativePortal, [], [0.6]);
  const boosted = nativeFixture(onBphNativePortal,
    originalNativeEffects("SN_Spawner_CastSpeed", "SN_Spawner_RarityWeights"), [0.6]);
  for (const f of [base, boosted]) {
    f.ctx.save.discovered = ["Hero1_Squire", "Hero1_Archer"];
    f.spawn("Hero3_Portal");
    f.step(8);
  }
  expect(base.run.squads[0].soldiers).toHaveLength(1);
  expect(boosted.run.squads[0].soldiers.at(-1)?.bph?.profileId).toBe("Hero1_Archer");
  base.step(2);
  expect(base.run.squads[0].soldiers.at(-1)?.bph?.profileId).toBe("Hero1_Squire");
});

test("Portal foil speed is intrinsic and irrelevant units allocate no timers or RNG", () => {
  const f = nativeFixture(onBphNativePortal, [], [0]);
  f.ctx.save.discovered = ["Hero1_Squire"];
  const ordinary = f.spawn("Hero1_Archer");
  f.step(100);
  expect(f.ctx.state.timers).toEqual({});
  expect(f.draws()).toBe(0);
  f.spawn("Hero3_Portal", { foil: true });
  f.step(10 / 1.5);
  expect(f.run.squads[0].soldiers).toHaveLength(3);
  expect(ordinary.hp).toBe(ordinary.maxHp);
});

test("Portal empty collection and dead owners never draw RNG", () => {
  const f = nativeFixture(onBphNativePortal);
  f.ctx.save.discovered = [];
  const portal = f.spawn("Hero3_Portal");
  f.ctx.save.discovered = ["Hero3_Portal"];
  f.step(20); portal.hp = 0; f.step(20);
  expect(f.draws()).toBe(0);
  expect(f.run.squads[0].soldiers).toHaveLength(1);
});
