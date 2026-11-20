import { expect, test } from "bun:test";
import { onBphNativeTreant } from "./bph-native-passives-treant";
import { nativeFixture } from "./bph-native-passives-test-context";
import { BPH_PROFILE_CONSUMERS } from "./bph-fx-profiles";
import { BPH_WORLD_TO_PX } from "./bph-contract";

test("Treant attack produces a cast-bearing Seed consumed by the existing Fortify engine", () => {
  const f = nativeFixture(onBphNativeTreant, [], [], BPH_PROFILE_CONSUMERS);
  f.run.squads[0].x = -1000;
  const treant = f.spawn("Hero5_Treant"), ally = f.spawn("Hero1_Archer");
  ally.x = treant.x + 20; ally.y = treant.y;
  f.send({ kind: "after-attack", unit: treant, target: f.enemy() });
  const actor = f.ctx.state.actors[0];
  expect(actor.cast?.spellId).toBe("Spell_Seed");
  expect([actor.x, actor.y, actor.data.fromX, actor.data.fromY]).toEqual([treant.x, treant.y, treant.x, treant.y]);
  f.step(0.1);
  const fortify = f.ctx.state.statuses.find(status => status.targetId === ally.id && status.id === "Fortify");
  expect(fortify?.until).toBeCloseTo(f.run.time + 5);
  expect(f.ctx.state.actors).toHaveLength(0);
});

test("Treant foil Seed bounces to a distinct ally without a chance roll", () => {
  const f = nativeFixture(onBphNativeTreant, [], [0], BPH_PROFILE_CONSUMERS);
  f.run.squads[0].x = -1000;
  const treant = f.spawn("Hero5_Treant", { foil: true });
  const first = f.spawn("Hero1_Archer"), second = f.spawn("Hero1_Squire");
  first.x = treant.x + 10; second.x = treant.x + 20;
  f.send({ kind: "after-attack", unit: treant, target: f.enemy() });
  f.step(0.1); f.step(0.1);
  expect(f.ctx.state.statuses.filter(status => status.id === "Fortify").map(status => status.targetId).sort())
    .toEqual([first.id, second.id].sort());
  expect(f.draws()).toBe(1);
});

test("Treant requires an ally in authored range and ordinary units never produce Seeds", () => {
  const f = nativeFixture(onBphNativeTreant);
  const counters = { ...f.ctx.state.counters };
  f.run.squads[0].x = -1000;
  const treant = f.spawn("Hero5_Treant"), ally = f.spawn("Hero1_Archer");
  ally.x = treant.x + 3 * BPH_WORLD_TO_PX + 1;
  const target = f.enemy();
  f.send({ kind: "after-attack", unit: treant, target });
  f.send({ kind: "after-attack", unit: ally, target });
  expect(f.ctx.state.actors).toEqual([]);
  expect(f.ctx.state.counters).toEqual(counters);
});

test("Treant targets the most injured ally rather than a random or nearest ally", () => {
  const f = nativeFixture(onBphNativeTreant);
  f.run.squads[0].x = -1000;
  const treant = f.spawn("Hero5_Treant"), healthy = f.spawn("Hero1_Archer"), hurt = f.spawn("Hero1_Squire");
  healthy.x = treant.x + 10; hurt.x = treant.x + 100; hurt.hp = hurt.maxHp / 4;
  f.send({ kind: "after-attack", unit: treant, target: f.enemy() });
  expect(f.ctx.state.actors[0].targets).toEqual([hurt.id]);
  expect(f.draws()).toBe(0);
});
