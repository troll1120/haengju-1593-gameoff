import { expect, test } from "bun:test";
import type { BphEffect, BphEffectConsumer, BphFxEvent } from "./bph-contract";
import { beginBphCast, BPH_EFFECT_UNITS } from "./bph-effects-entry";
import { CONDITION_CONSUMERS } from "./bph-fx-conditions";
import { ENEMY_CONSUMERS } from "./bph-enemy-effects";
import { TROOP_CONSUMERS } from "./bph-fx-troops";
import { aimBphTactic, applyBphBuff, bphConsumers, bindBphConsumers, bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { createBphRun } from "./bph-session";
import { bphCratePoint, hitBphPack } from "./bph-combat";
import { grantBphMastery, notifyBphQuestCompletion } from "./bph-account";
import { BPH_PLACEMENTS, buyBphNode } from "./bph-upgrades";
import { BPH_DEFAULT_GRID, BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { parseBphSave } from "./bph-save";
import { freshMeta } from "./meta";
import { advance, createRun } from "./rules";

function battle(upgrades: readonly BphEffect[] = [], hook?: BphEffectConsumer["onEvent"]) {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades });
  const context = bphFxContext(run);
  if (!context) throw new Error("Production run must bind effects");
  const events: BphFxEvent[] = [];
  bindBphConsumers(context, [...bphConsumers(), {
    id: "quests", kinds: [], onEvent: (ctx, event) => { events.push(event); hook?.(ctx, event); },
    consume: () => { throw new Error("Observation has no registered effect kinds"); },
  }], false);
  return { context, run, events };
}
function placement(nodeId: string): string {
  const found = [...BPH_PLACEMENTS.values()].find(p => p.gridId === BPH_DEFAULT_GRID && p.nodeId === nodeId);
  if (!found) throw new Error(`Missing authored placement ${nodeId}`);
  return found.id;
}

test("the real run registers each frozen condition, enemy and troop consumer only once", () => {
  const consumers = bphConsumers();
  for (const consumer of [...CONDITION_CONSUMERS, ...ENEMY_CONSUMERS, ...TROOP_CONSUMERS])
    expect(consumers.filter(registered => registered === consumer)).toHaveLength(1);
  expect(BPH_EFFECT_UNITS().filter(entry => entry.unitId === "Q1")).toHaveLength(1);
  expect(() => createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] })).not.toThrow();
});

test("an unregistered troop consumer cannot suppress the original Beastmaster friends", () => {
  const { context: ctx, run } = battle(BPH_UPGRADE_NODES.SN_BeastmasterAddBear.effects);
  bindBphConsumers(ctx, bphConsumers().filter(consumer => !TROOP_CONSUMERS.includes(consumer)), false);

  ctx.spawnProfile("Hero5_Beastmaster", 1, { packId: "Pack1_Basic", cause: "pack" });

  const [owner, ...friends] = run.squads[0].soldiers;
  expect(friends.map(unit => unit.bph?.profileId)).toEqual(["Hero_Rat", "Hero_Rat", "Hero_Rat", "Hero_Rat"]);
  expect(friends.map(unit => unit.bph?.parentId)).toEqual(Array(4).fill(owner.id));
});

test("real pack hits progress and claim the active quest once without a view callback", () => {
  const { context: ctx, run, events } = battle();
  ctx.save.resources.mastery = 1;
  expect(buyBphNode(ctx.save, placement("SN_TowerHP"))).toBe(true);
  const quest = placement("Q_PackBasic");
  for (let opened = 0; opened < 2; opened++) {
    ctx.grantPack("Pack1_Basic", 1, { sourceBuilding: "Building_2Advanced" });
    const pack = run.bph?.packs.at(-1);
    if (!pack) throw new Error("Real grant must create a field instance");
    expect(hitBphPack(run, pack.id)).toEqual([]);
    expect(hitBphPack(run, pack.id)).toHaveLength(1);
    expect(hitBphPack(run, pack.id)).toEqual([]);
  }
  expect(ctx.save.questProgress[quest]).toBe(2);
  expect(events.filter(event => event.kind === "pack-opened").map(event => event.origin)).toEqual([
    { instanceId: 1, packId: "Pack1_Basic", box: false, sourceBuilding: "Building_2Advanced",
      sourceWave: undefined, position: bphCratePoint(1) },
    { instanceId: 2, packId: "Pack1_Basic", box: false, sourceBuilding: "Building_2Advanced",
      sourceWave: undefined, position: bphCratePoint(2) },
  ]);
  expect(buyBphNode(ctx.save, quest)).toBe(true);
  expect(buyBphNode(ctx.save, quest)).toBe(false);
  expect(notifyBphQuestCompletion(ctx.save, quest)).toBe(false);
  expect(ctx.save.income).toBe(4);
  expect(events.filter(event => event.kind === "quest-completed")).toEqual([
    { kind: "quest-completed", placementId: quest, claim: 1,
      receipt: { placementId: quest, nodeId: "Q_PackBasic", claim: 1, receiptId: `quest:${quest}:1` } },
  ]);
  const restored = parseBphSave(JSON.parse(JSON.stringify(ctx.save)));
  expect(notifyBphQuestCompletion(restored, quest)).toBe(false);
});

test("mastery reentry cannot credit twice and an equal receipt in another save stays independent", () => {
  const second = battle();
  const nested: number[] = [];
  const first = battle([], (ctx, event) => {
    if (event.kind !== "mastery-gained") return;
    nested.push(grantBphMastery(ctx.save, { receiptId: event.receiptId, amount: 99, source: "quest" }));
    grantBphMastery(second.context.save, { receiptId: event.receiptId, amount: 3, source: "quest" });
    event.grant.amount *= 2;
  });
  expect(grantBphMastery(first.context.save, { receiptId: "quest:p:1", amount: 6, source: "quest" })).toBe(12);
  expect(nested).toEqual([0]);
  expect(first.context.save.resources.mastery).toBe(12);
  expect(second.context.save.resources.mastery).toBe(3);
  expect(first.context.save.lifecycle.claimed).toEqual(["mastery:quest:p:1"]);
  const restored = parseBphSave(JSON.parse(JSON.stringify(first.context.save)));
  expect(grantBphMastery(restored, { receiptId: "quest:p:1", amount: 6, source: "quest" })).toBe(0);
});

test("a failed pre-credit hook leaves no committed balance or receipt and releases its in-flight claim", () => {
  const failure = new Error("Rejected pre-credit hook");
  const { context: ctx } = battle([], (_ctx, event) => {
    if (event.kind === "mastery-gained") throw failure;
  });
  const request = { receiptId: "quest:p:1", amount: 6, source: "quest" } as const;
  expect(() => grantBphMastery(ctx.save, request)).toThrow(failure);
  expect(ctx.save.resources.mastery).toBe(0);
  expect(ctx.save.lifecycle.claimed).toEqual([]);
  bindBphConsumers(ctx, bphConsumers(), false);
  expect(grantBphMastery(ctx.save, request)).toBe(6);
});

test("cast identity survives distinct lives, damage and the final kill without advancing either RNG", () => {
  const { context: ctx, run, events } = battle();
  ctx.spawnProfile("Hero1_Squire", 1, { packId: "Pack1_Basic", foil: true });
  const unit = run.squads[0].soldiers[0];
  if (!unit.bph) throw new Error("Expected original profile");
  const enemy = { ...createRun(11).enemies[0], id: 900, kind: "yari" as const, hp: 3, shielded: false };
  run.enemies = [enemy];
  const before = [run.rng, ctx.save.rng, run.nextId];
  const request = { spellId: "Spell_Thunderbolt", source: unit, target: enemy,
    position: { x: enemy.x, y: enemy.y }, foil: true, power: 2 };
  const first = beginBphCast(ctx, request);
  unit.bph.lifeId++;
  const second = beginBphCast(ctx, request);
  expect([run.rng, ctx.save.rng, run.nextId]).toEqual(before);
  ctx.applyDamage({ target: enemy, amount: 1, source: unit, spellId: first.spellId, cast: first });
  ctx.applyDamage({ target: enemy, amount: 2, source: unit, spellId: second.spellId, cast: second });
  expect(events.filter(event => event.kind === "spellHit").map(event => event.cast)).toEqual([first, second]);
  expect([first.id, second.id, first.sourceLifeId, second.sourceLifeId]).toEqual([1, 2, 1, 2]);
  expect(events.find(event => event.kind === "enemy-killed")).toMatchObject({ cast: second, spellId: second.spellId });
  const other = battle();
  expect(beginBphCast(other.context, { ...request, source: null, target: null }).id).toBe(1);
});

test("a delayed real fireball retains one cast through arrival after its source life changes", () => {
  const { context: ctx, run, events } = battle();
  ctx.spawnProfile("Hero2_Pyromancer", 1, { packId: "Pack1_Basic", position: { x: 100, y: 200 } });
  const unit = run.squads[0].soldiers[0];
  const enemy = { ...createRun(11).enemies[0], id: 900, hp: 100, x: 200, y: 200, shielded: false };
  run.enemies = [enemy];
  ctx.state.spells.push({ id: "Spell_Fireball", sourceId: unit.id, targetId: enemy.id, x: 200, y: 200, power: 2 });
  dispatchBphEffects(run, { kind: "step", dt: .01 });
  const actor = ctx.state.actors.find(actor => actor.data.statusSpell === 1);
  if (!actor || !unit.bph) throw new Error("Real fireball must create a delayed actor");
  unit.bph.lifeId++;
  run.time = actor.until + .01;
  dispatchBphEffects(run, { kind: "step", dt: .01 });
  const casts = events.filter(event => event.kind === "spellCast");
  const hits = events.filter(event => event.kind === "spellHit");
  expect(casts).toHaveLength(1);
  expect(hits).toHaveLength(1);
  expect(hits[0].cast).toEqual(casts[0].cast);
  expect(hits[0].cast).toMatchObject({ sourceId: unit.id, sourceLifeId: 1, power: 2 });
  // Native hero casts use Pyromancer's effective attack 3, not planeswalker power 2.
  expect(enemy.hp).toBe(97);
});

test("a delayed buff retains its firing life when another unit reuses the caster ID", () => {
  const { context: ctx, run } = battle();
  ctx.spawnProfile("Hero3_WitchDoctor", 1);
  const original = run.squads[0].soldiers[0];
  const target = createRun(11).enemies[0];
  const cast = beginBphCast(ctx, { spellId: "Spell_InfectionBomb", source: original,
    target, position: target, foil: true, power: .25 });
  run.squads[0].soldiers = [];
  run.nextId = original.id;
  ctx.spawnProfile("Hero3_WitchDoctor", 1);
  const replacement = run.squads[0].soldiers[0];
  if (!replacement.bph) throw new Error("Expected an original profile life");
  replacement.bph.lifeId = 2;

  applyBphBuff(run, { target, source: replacement, side: "enemy", id: "Infected",
    duration: 2.75, stacks: 1, power: 0, cast });

  expect(ctx.state.statuses[0]).toMatchObject({ sourceId: original.id, until: 2.75,
    cast: { sourceId: original.id, sourceLifeId: 1, spellId: "Spell_InfectionBomb", foil: true, power: .25 } });
});

test("actual thunderstorm execution retains the foil from its real opened pack", () => {
  const { context: ctx, run, events } = battle();
  run.enemies = createRun(11).enemies.slice(0, 2);
  for (const enemy of run.enemies) { enemy.hp = 100; enemy.kind = "yari"; enemy.stun = 100; }
  ctx.save.packs.Pack1_Basic = { opened: 20, sinceNewHero: 0, sinceNewFoil: 0 };
  // pity.md: natural foil rolls pass FoilManager's copiesBeforeFoilByRarity gate
  // (already discovered with 8 copies; the discovery copy never counts).
  ctx.save.discovered.push("Tome_Thunderstorm");
  ctx.save.questProgress["draw:foil-copies:Tome_Thunderstorm"] = 8;
  ctx.grantPack("Pack1_Basic", 1, { foilChanceBonus: 1 });
  const instance = run.bph?.packs[0];
  if (!instance) throw new Error("Real grant must create a field instance");
  hitBphPack(run, instance.id);
  expect(hitBphPack(run, instance.id)[0].cards[0]).toMatchObject({ profileId: "Tome_Thunderstorm", foil: true });
  aimBphTactic(run, run.enemies[0]);
  for (let i = 0; i < 11; i++) advance(run, .1);
  const casts = events.filter(event => event.kind === "spellCast");
  expect(casts).toHaveLength(2);
  expect(casts.map(event => event.cast?.id)).toEqual([1, 2]);
  expect(casts[0].cast).toMatchObject({ tomeId: "Tome_Thunderstorm", foil: true, sourceId: null });
  expect(ctx.save.foils).toContain("Tome_Thunderstorm");
});

test("healing reports applied HP with its source and never counts full or dead targets", () => {
  const { context: ctx, run, events } = battle();
  ctx.spawnProfile("Hero1_Squire", 1);
  const unit = run.squads[0].soldiers[0];
  unit.hp = unit.maxHp - 2;
  ctx.heal(unit, 100, run.squads[0]);
  ctx.heal(unit, 100, run.squads[0]);
  unit.hp = 0;
  ctx.heal(unit, 100, run.squads[0]);
  expect(events.filter(event => event.kind === "unit-healed")).toEqual([
    { kind: "unit-healed", targetId: unit.id, sourceId: run.squads[0].id, actualHpRestored: 2 },
  ]);
  expect(unit.hp).toBe(0);
});

test("unit spell provenance reaches the before-damage boundary before HP changes", () => {
  const { context: ctx, run, events } = battle([], (_ctx, event) => {
    if (event.kind === "before-unit-damage" && event.spellId === "Spell_Blizzard") event.hit.prevented = true;
  });
  ctx.spawnProfile("Hero1_Squire", 1);
  const unit = run.squads[0].soldiers[0];
  unit.emerging = false;
  ctx.applyUnitDamage({ target: unit, amount: 1, spellId: "Spell_Blizzard" });
  expect(unit.hp).toBe(4);
  ctx.applyUnitDamage({ target: unit, amount: 1 });
  expect(unit.hp).toBe(3);
  expect(events.filter(event => event.kind === "damage-dealt").map(event => event.dealt)).toEqual([0, 1]);
});
