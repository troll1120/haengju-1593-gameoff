import { expect, test } from "bun:test";
import { bphNativeRejectsBuff, onBphNativeSkeleton } from "./bph-native-passives-skeleton";
import { nativeFixture, originalNativeEffects } from "./bph-native-passives-test-context";

test.each(["Hero_Skeleton", "Hero_SkeletonUpgraded"])("%s loses exactly .5 HP each second through shields and dies once", id => {
  const f = nativeFixture(onBphNativeSkeleton);
  const unit = f.spawn(id);
  unit.hp = 1;
  f.run.shieldUntil = 100;
  f.step(0.9); expect(unit.hp).toBe(1);
  f.step(0.1); expect(unit.hp).toBe(0.5);
  f.step(3); expect(unit.hp).toBe(0);
  expect(f.events.filter(event => event.kind === "unit-death")).toHaveLength(1);
  expect(unit.downUntil).toBe(Infinity);
  expect(f.draws()).toBe(0);
});

test.each(["Hero_Skeleton", "Hero_SkeletonUpgraded"])("%s queues original death Bone nodes once per life", id => {
  const f = nativeFixture(onBphNativeSkeleton,
    originalNativeEffects("SN_SkeletonDieThrowBone 1", "SN_SkeletonDieThrowBone"), [0.1, 0.9]);
  const unit = f.spawn(id);
  f.death(unit); f.death(unit);
  expect(f.ctx.state.spells).toEqual([{ id: "Spell_SkeletonBone", sourceId: unit.id,
    x: unit.x, y: unit.y, power: 0.25 }]);
  expect(f.draws()).toBe(2);
});

test("Native zombie immunity rejects only ally Infection on authored immune profiles", () => {
  const f = nativeFixture(onBphNativeSkeleton);
  for (const id of ["Hero_Bear", "Hero_Jaguar", "Hero_Monkey", "Hero_Rat", "Hero_Skeleton", "Hero_SkeletonUpgraded"]) {
    const unit = f.spawn(id);
    expect(bphNativeRejectsBuff(f.ctx.profileId(unit), { id: "Infected", side: "ally" })).toBe(true);
    expect(bphNativeRejectsBuff(f.ctx.profileId(unit), { id: "Poison", side: "ally" })).toBe(false);
    expect(bphNativeRejectsBuff(f.ctx.profileId(unit), { id: "Infected", side: "enemy" })).toBe(false);
  }
  expect(bphNativeRejectsBuff("Hero1_Archer", { id: "Infected", side: "ally" })).toBe(false);
  expect(bphNativeRejectsBuff(null, { id: "Infected", side: "ally" })).toBe(false);
});

test("Non-skeletons retain HP and never allocate native decay state", () => {
  const f = nativeFixture(onBphNativeSkeleton);
  const unit = f.spawn("Hero1_Archer");
  f.step(50);
  expect(unit.hp).toBe(unit.maxHp);
  expect(f.ctx.state.timers).toEqual({});
});
