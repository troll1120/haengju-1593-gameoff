import { expect, test } from "bun:test";
import { onBphNativeBloodMage } from "./bph-native-passives-bloodmage";
import { nativeFixture, originalNativeEffects } from "./bph-native-passives-test-context";
import { BPH_PROFILE_CONSUMERS } from "./bph-fx-profiles";
import { BPH_WORLD_TO_PX } from "./bph-contract";

test("BloodMage completed consumption adds original damage fractions once, without compounding", () => {
  const f = nativeFixture(onBphNativeBloodMage,
    originalNativeEffects("SN_BloodMage_ConsumeChance", "SN_BloodMage_ConsumeDamage"));
  const mage = f.spawn("Hero6_BloodMage");
  const base = f.stats(mage).damage;
  for (let i = 0; i < 2; i++) {
    const corpse = f.enemy(); corpse.hp = 0;
    expect(f.ctx.beginConsume(mage, corpse)).toBe(true);
    expect(f.ctx.endConsume(mage, corpse)).toBe(true);
    f.send({ kind: "consume", phase: "end", source: mage, target: corpse });
  }
  expect(f.stats(mage).damage).toBeCloseTo(base * 1.9000000059604645);
  if (!mage.bph) throw new Error("Native life required");
  mage.bph.lifeId++;
  expect(f.stats(mage).damage).toBe(base);
});

test("Nearby ally consumption takes the authored 1.2 seconds and reaches existing heal and growth", () => {
  const f = nativeFixture(onBphNativeBloodMage, originalNativeEffects(
    "SN_BloodMage_ConsumeHeroesNearby", "SN_BloodMage_ConsumeHeal", "SN_BloodMage_ConsumeDamage"),
  [0], BPH_PROFILE_CONSUMERS);
  const mage = f.spawn("Hero6_BloodMage"), ally = f.spawn("Hero1_Squire");
  const base = f.stats(mage).damage;
  mage.hp = mage.maxHp / 2;
  const before = mage.hp;
  f.death(ally);
  expect(f.ctx.state.consumptions[0]?.phase).toBe("start");
  f.step(1.19);
  expect(mage.hp).toBe(before);
  f.step(0.02);
  expect(f.ctx.state.consumptions[0]?.phase).toBe("end");
  expect(mage.hp).toBeCloseTo(before + mage.maxHp * 0.30000001192092896);
  expect(f.stats(mage).damage).toBeCloseTo(base * 1.2000000029802322);
});

test("Nearby consumption excludes distant corpses and does not consume common hero defaults", () => {
  const f = nativeFixture(onBphNativeBloodMage,
    originalNativeEffects("SN_BloodMage_ConsumeHeroesNearby"));
  const mage = f.spawn("Hero6_BloodMage"), ally = f.spawn("Hero1_Squire");
  ally.x = mage.x + 2.5 * BPH_WORLD_TO_PX + 1;
  f.death(ally);
  expect(f.draws()).toBe(0);
  expect(f.ctx.state.consumptions).toEqual([]);
  const unupgraded = nativeFixture(onBphNativeBloodMage);
  const counters = { ...unupgraded.ctx.state.counters };
  unupgraded.spawn("Hero6_BloodMage");
  unupgraded.death(unupgraded.spawn("Hero1_Archer"));
  expect(unupgraded.ctx.state.counters).toEqual(counters);
  expect(unupgraded.draws()).toBe(0);
});

test("A corpse has one owner and a dead or changed consumer cannot complete it", () => {
  const f = nativeFixture(onBphNativeBloodMage,
    originalNativeEffects("SN_BloodMage_ConsumeHeroesNearby"), [0]);
  const first = f.spawn("Hero6_BloodMage");
  f.spawn("Hero6_BloodMage");
  const ally = f.spawn("Hero1_Squire");
  f.death(ally);
  expect(f.ctx.state.consumptions).toHaveLength(1);
  expect(f.ctx.state.consumptions[0].sourceId).toBe(first.id);
  first.hp = 0;
  f.step(2);
  expect(f.ctx.state.consumptions).toEqual([]);
});
