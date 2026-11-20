import { expect, test } from "bun:test";
import { onBphNativeDoppelganger } from "./bph-native-passives-doppelganger";
import { onBphNativePassives } from "./bph-native-passives";
import { nativeFixture } from "./bph-native-passives-test-context";

const receipt = (id: number) => ({ id, packId: "Pack1_Basic", ordinal: id, frenzy: false,
  reason: "weighted", cards: [] } as const);

test("Doppelganger changes on each pack while retaining birth, life, parent, foil and health fraction", () => {
  const f = nativeFixture(onBphNativeDoppelganger, [], [0, 0.99]);
  const unit = f.spawn("Hero8_Doppelganger", { parentId: 45, resultId: 2, foil: true });
  f.ctx.save.discovered = ["Hero1_Archer", "Hero7_Warlord", "Hero8_Doppelganger"];
  unit.hp = unit.maxHp / 2;
  const id = unit.id;
  f.send({ kind: "pack-opened", result: receipt(1) });
  expect(unit.bph?.profileId).toBe("Hero1_Archer");
  expect(unit.hp / unit.maxHp).toBe(0.5);
  f.send({ kind: "pack-opened", result: receipt(1) });
  expect(f.draws()).toBe(1);
  f.send({ kind: "pack-opened", result: receipt(2) });
  expect(unit.bph?.profileId).toBe("Hero7_Warlord");
  expect(unit.bph?.birthProfileId).toBe("Hero8_Doppelganger");
  expect(unit.bph?.lifeId).toBe(1);
  expect(unit.bph?.parentId).toBe(45);
  expect(unit.bph?.resultId).toBe(2);
  expect(unit.bph?.foil).toBe(true);
  expect(unit.hp / unit.maxHp).toBe(0.5);
  expect(unit.id).toBe(id);
});

test("Combined consumer does not allocate state or draw RNG for irrelevant ordinary unit events", () => {
  const f = nativeFixture(onBphNativePassives);
  const counters = { ...f.ctx.state.counters };
  const unit = f.spawn("Hero1_Archer"), enemy = f.enemy();
  f.step(20);
  f.send({ kind: "after-attack", unit, target: enemy });
  f.send({ kind: "pack-opened", result: receipt(1) });
  f.death(unit);
  expect(f.ctx.state.timers).toEqual({});
  expect(f.ctx.state.counters).toEqual(counters);
  expect(f.ctx.state.actors).toEqual([]);
  expect(f.ctx.state.spells).toEqual([]);
  expect(f.draws()).toBe(0);
});

test("Combined consumer recognizes a transformed Portal without losing Doppelganger birth identity", () => {
  const f = nativeFixture(onBphNativePassives, [], [0, 0]);
  const unit = f.spawn("Hero8_Doppelganger");
  f.ctx.save.discovered = ["Hero3_Portal", "Hero1_Squire"];
  f.send({ kind: "pack-opened", result: receipt(4) });
  expect(unit.bph?.profileId).toBe("Hero3_Portal");
  f.step(10);
  expect(f.run.squads[0].soldiers.at(-1)?.bph?.parentId).toBe(unit.id);
  expect(unit.bph?.birthProfileId).toBe("Hero8_Doppelganger");
});
