import { expect, test } from "bun:test";
import { onBphNativeIllusionist } from "./bph-native-passives-illusionist";
import { nativeFixture } from "./bph-native-passives-test-context";
import { BPH_STATUS_CONSUMERS } from "./bph-fx-status";

test("Illusionist death requests one original AoeCircle and its real executor deals full attack 24 HP", () => {
  const f = nativeFixture(onBphNativeIllusionist, [], [], BPH_STATUS_CONSUMERS);
  const unit = f.spawn("Hero3_Illusionist");
  const enemy = f.enemy(unit.x + 10, unit.y);
  f.death(unit); f.death(unit);
  expect(f.ctx.state.spells).toHaveLength(1);
  f.step(0.01);
  expect(enemy.hp).toBe(76);
  const hit = f.events.find(event => event.kind === "spellHit");
  expect(hit?.kind === "spellHit" && hit.cast?.spellId).toBe("Spell_AoeCircle");
  expect(hit?.kind === "spellHit" && hit.cast?.sourceLifeId).toBe(1);
});

test("Foil multiplier adds half the existing extra pack copies once without recursive duplication", () => {
  const f = nativeFixture(onBphNativeIllusionist);
  const parent = f.spawn("Hero3_Illusionist", { foil: true, resultId: 50 });
  const result = { id: 50, packId: "Pack3_Magic", ordinal: 1, frenzy: false, reason: "weighted",
    cards: [{ profileId: "Hero3_Illusionist", copies: 3, foil: true, discovered: false }] } as const;
  f.send({ kind: "pack-opened", result });
  f.send({ kind: "pack-opened", result });
  const child = f.run.squads[0].soldiers.at(-1);
  expect(f.run.squads[0].soldiers).toHaveLength(2);
  expect(child?.bph?.parentId).toBe(parent.id);
  expect(child?.bph?.cause).toBe("duplicate");
  expect(child?.bph?.foil).toBe(true);
  expect(f.draws()).toBe(0);
});

test("One base illusion has no invented clones and unrelated death never queues a blast", () => {
  const f = nativeFixture(onBphNativeIllusionist);
  const counters = { ...f.ctx.state.counters };
  f.spawn("Hero3_Illusionist", { foil: true, resultId: 51 });
  f.send({ kind: "pack-opened", result: { id: 51, packId: "Pack3_Magic", ordinal: 1,
    frenzy: false, reason: "weighted",
    cards: [{ profileId: "Hero3_Illusionist", copies: 1, foil: true, discovered: false }] } });
  f.death(f.spawn("Hero1_Archer"));
  expect(f.run.squads[0].soldiers).toHaveLength(2);
  expect(f.ctx.state.spells).toEqual([]);
  expect(f.ctx.state.counters).toEqual(counters);
});
