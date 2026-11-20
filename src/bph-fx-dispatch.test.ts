import { expect, test } from "bun:test";
import { bindBphConsumers, DuplicateBphConsumerError, freshBphFxState, refreshBphEffects, updateBphPointer } from "./bph-fx-dispatch";
import { advance, bphEffectCombat, createRun } from "./rules";
import { freshBphSave } from "./bph-save";
import type { BphEffectConsumer, BphFxContext } from "./bph-contract";
import { CENTER } from "./geometry";
import { grantBphMastery } from "./bph-account";

function context(): BphFxContext {
  const run = createRun(144);
  return { run, save: freshBphSave(), effects: [
    { nodeId: "timed", type: "SalaryFlatBonus", value: 4,
      effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {} },
    { nodeId: "other", type: "HeroAttackPower", value: 9,
      effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {} },
  ], state: freshBphFxState(),
    pointer: { x: 100, y: 100 },
    ...bphEffectCombat(run, []),
    profileId: () => null,
    unitInfo: () => null,
    spawnProfile: () => { throw new Error("No spawning in this dispatcher scenario"); },
    grantPack: () => { throw new Error("No pack rewards in this dispatcher scenario"); },
  };
}
test("a real combat tick dispatches only the effect kinds owned by the consumer", () => {
  const ctx = context();
  const consumer: BphEffectConsumer = { id: "buildings", kinds: ["SalaryFlatBonus"],
    consume: (ctx, event, effect) => { if (event.kind === "step") ctx.save.coins += effect.value; } };
  bindBphConsumers(ctx, [consumer]);
  advance(ctx.run, 1 / 30);
  expect(ctx.save.coins).toBe(7);
});
test("baseline actor behavior runs once rather than once per owned effect", () => {
  const ctx = context();
  const consumer: BphEffectConsumer = { id: "profiles", kinds: ["SalaryFlatBonus", "HeroAttackPower"],
    onEvent: (ctx, event) => { if (event.kind === "step") ctx.state.counters.steps = (ctx.state.counters.steps ?? 0) + 1; },
    consume: (ctx, event, effect) => { if (event.kind === "step") ctx.state.counters[effect.type] = effect.value; } };
  bindBphConsumers(ctx, [consumer]); advance(ctx.run, 1 / 30);
  expect(ctx.state.counters).toEqual({ steps: 1, SalaryFlatBonus: 4, HeroAttackPower: 9 });
});
test("refreshing effects replaces routing while preserving consumer and effect order", () => {
  const ctx = context(), calls: string[] = [];
  const consumer: BphEffectConsumer = {
    id: "buildings", kinds: ["SalaryFlatBonus"],
    onEvent: (_ctx, event) => { if (event.kind === "step") calls.push("before"); },
    consume: (_ctx, event, effect) => { if (event.kind === "step") calls.push(effect.nodeId); },
  };
  bindBphConsumers(ctx, [consumer], false);
  const salary = ctx.effects[0];
  refreshBphEffects(ctx.save, [
    { ...salary, nodeId: "replacement-first" }, ctx.effects[1], { ...salary, nodeId: "replacement-second" },
  ]);

  advance(ctx.run, 1 / 30);

  expect(calls).toEqual(["before", "replacement-first", "replacement-second"]);
});
test("two lanes cannot silently register the same effect kind", () => {
  const consumer: BphEffectConsumer = { id: "profiles", kinds: ["HeroAttackPower"],
    consume: () => { throw new Error("Duplicate registration must fail before dispatch"); } };
  expect(() => bindBphConsumers(context(), [consumer, consumer])).toThrow(DuplicateBphConsumerError);
});
test("the next combat tick exposes the player's last touch point", () => {
  const ctx = context();
  const consumer: BphEffectConsumer = { id: "status", kinds: [],
    onEvent: (ctx, event) => {
      if (event.kind === "step") { ctx.state.counters.x = ctx.pointer.x; ctx.state.counters.y = ctx.pointer.y; }
    }, consume: () => { throw new Error("There are no registered kinds"); } };
  bindBphConsumers(ctx, [consumer]); updateBphPointer(ctx.run, { x: 31, y: 237 });
  advance(ctx.run, 1 / 30);
  expect(ctx.state.counters).toEqual({ x: 31, y: 237 });
});
test.each([false, true])("native spell damage reports lethal crit=%s and actual spell hit", critical => {
  const ctx = context(), enemy = ctx.run.enemies[0];
  enemy.hp = 1; enemy.kind = "yari"; enemy.shielded = false;
  const events: string[] = [];
  const consumer: BphEffectConsumer = { id: "status", kinds: [],
    onEvent: (_ctx, event) => {
      if (event.kind === "unitKilled") {
        events.push(`killed:${event.critical}`);
        expect(event.unit.id).toBe(enemy.id);
      }
      if (event.kind === "spellHit") {
        events.push(event.spellId);
        expect(event.target.id).toBe(enemy.id);
        expect(event.amount).toBe(1);
      }
    }, consume: () => { throw new Error("There are no registered kinds"); } };
  bindBphConsumers(ctx, [consumer]);
  expect(ctx.applyDamage({ target: enemy, amount: 2, critical, spellId: "Spell_Thunderbolt" })).toBe(1);
  expect(events).toEqual([`killed:${critical}`, "Spell_Thunderbolt"]);
});
test("damage exhaustion emits shieldBroken and the remaining HQ hit once", () => {
  const ctx = context(), run = ctx.run, enemy = run.enemies[0];
  run.squads = []; run.enemies = [enemy]; run.walls = { 위: 0, 좌: 0, 우: 0, 아래: 0 }; run.wall = 0;
  enemy.x = CENTER.x; enemy.y = CENTER.y; enemy.breach = "위"; enemy.kind = "yari"; enemy.clock = 0;
  ctx.state.castleShield = { hp: 1, maxHp: 1 };
  const events: string[] = [];
  bindBphConsumers(ctx, [{ id: "status", kinds: [],
    onEvent: (_ctx, event) => {
      if (event.kind === "shieldBroken" || event.kind === "towerAttacked") events.push(event.kind);
    }, consume: () => { throw new Error("There are no registered kinds"); } }]);
  advance(run, 1 / 30);
  expect(events).toEqual(["shieldBroken", "towerAttacked"]);
  expect(ctx.state.castleShield.hp).toBe(0);
  expect(run.base).toBeLessThan(run.maxBase);
});
test("mastery grants run their pre-credit hook once even after receipt replay", () => {
  const ctx = context();
  bindBphConsumers(ctx, [{ id: "buildings", kinds: [],
    onEvent: (_ctx, event) => { if (event.kind === "mastery-gained") event.grant.amount *= 1.25; },
    consume: () => { throw new Error("There are no registered kinds"); } }]);
  expect(grantBphMastery(ctx.save, { receiptId: "combat:1", amount: 4.5, source: "combat" })).toBe(5.625);
  expect(grantBphMastery(ctx.save, { receiptId: "combat:1", amount: 4.5, source: "combat" })).toBe(0);
  expect(ctx.save.resources.mastery).toBe(5.625);
});
