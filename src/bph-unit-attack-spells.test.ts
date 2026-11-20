import { expect, test } from "bun:test";
import type { BphEffect, BphFxContext, BphFxEvent, BphFxState } from "./bph-contract";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { bphUnitInfo, createBphBattle } from "./bph-combat";
import { bindBphConsumers, freshBphFxState } from "./bph-fx-dispatch";
import { freshBphSave } from "./bph-save";
import { BPH_PROFILE_CONSUMERS } from "./bph-fx-profiles";
import { bphEffectCombat, createRun, soldier } from "./rules";
import type { Effect } from "./rules";
import { bphUnitAttackSpellDamage, castBphUnitAttackSpell, tickBphUnitAttackSpells } from "./bph-unit-attack-spells";

export function spellScenario(profileId = "Hero3_WitchDoctor", effects: readonly BphEffect[] = []) {
  const run = createRun(144), output: Effect[] = [], events: BphFxEvent[] = [];
  const save = freshBphSave();
  run.bph = createBphBattle(save, effects, "WaveChapter1");
  const unit = soldier("spearman");
  unit.id = run.nextId++; unit.x = 100; unit.y = 100;
  unit.bph = { profileId, birthProfileId: profileId, packId: "Pack1_Basic", foil: false, giant: false,
    kills: 0, stage: 0, resultId: 1, parentId: null, lifeId: 7, cause: "pack" };
  run.squads[0].soldiers = [unit];
  const enemy = run.enemies[0];
  enemy.x = 200; enemy.y = 100; enemy.hp = enemy.maxHp = 1000;
  run.enemies = [enemy];
  const ctx: BphFxContext = {
    run, save, effects, state: freshBphFxState(), pointer: { x: 0, y: 0 },
    ...bphEffectCombat(run, output), profileId: target => target.bph?.profileId ?? null,
    unitInfo: bphUnitInfo,
    spawnProfile: () => { throw new RangeError("Unexpected profile spawn"); },
    grantPack: () => { throw new RangeError("Unexpected pack reward"); },
  };
  bindBphConsumers(ctx, [...BPH_PROFILE_CONSUMERS, { id: "spells", kinds: [], consume: () => {},
    onEvent: (_ctx, event) => { events.push(event); } }], false);
  const spell: BphFxState["spells"][number] = { id: "Spell_InfectionBomb", x: enemy.x, y: enemy.y,
    targetId: enemy.id, sourceId: unit.id, power: 0.25, attackId: 91 };
  const tick = (dt: number) => { run.time += dt; tickBphUnitAttackSpells(ctx, dt); };
  return { ctx, run, unit, enemy, spell, events, tick };
}

export function spellEffect(type: string, value: number, targets: Record<string, string> = {}): BphEffect {
  return { nodeId: `test:${type}`, type, value, effectPower: 0, effectPowerScale: 0,
    stackCap: 0, countStep: 0, targets };
}

test("infection flies for the authored time and affects only the impact circle", () => {
  const s = spellScenario(), radius = 0.4000000059604645 * BPH_WORLD_TO_PX;
  const edge = { ...s.enemy, id: s.run.nextId++, x: 200 + radius };
  const outside = { ...s.enemy, id: s.run.nextId++, x: 200 + radius + 0.001 };
  s.run.enemies.push(edge, outside);
  expect(castBphUnitAttackSpell(s.ctx, s.spell)).toBe(true);
  s.tick(0.44999998807907105);
  expect(s.ctx.state.actors[0].x).toBe(150);
  expect(s.ctx.state.statuses).toHaveLength(0);
  s.tick(0.44999998807907105);
  expect(s.ctx.state.statuses.map(status => status.targetId)).toEqual([s.enemy.id, edge.id]);
  expect(s.ctx.state.statuses[0].until).toBeCloseTo(5.899999976158142);
  expect(outside.hp).toBe(1000);
  expect(s.enemy.hp).toBe(1000);
});

test("infection ticks ten times after impact and expires without an extra hit", () => {
  const s = spellScenario();
  castBphUnitAttackSpell(s.ctx, s.spell);
  s.tick(0.8999999761581421);
  s.enemy.x = 350;
  s.tick(0.499);
  expect(s.enemy.hp).toBe(1000);
  s.tick(0.001);
  expect(s.enemy.hp).toBeCloseTo(998.7000000476837);
  s.tick(4.5);
  expect(s.enemy.hp).toBeCloseTo(987.0000004768372);
  expect(s.ctx.state.actors).toHaveLength(0);
  s.tick(1);
  expect(s.enemy.hp).toBeCloseTo(987.0000004768372);
});

test("infection preserves cast life and attack attribution after its source disappears", () => {
  const s = spellScenario();
  castBphUnitAttackSpell(s.ctx, s.spell);
  const cast = s.ctx.state.actors[0].cast;
  s.run.squads[0].soldiers = [];
  s.tick(1.399999976158142);
  expect(s.ctx.state.statuses[0].cast).toBe(cast);
  const hit = s.events.find(event => event.kind === "spellHit");
  expect(hit?.kind === "spellHit" && hit.cast).toBe(cast);
  expect(cast?.sourceLifeId).toBe(7);
  expect(cast?.attackId).toBe(91);
  expect(s.events.filter(event => event.kind === "spellCast")).toHaveLength(1);
});

test("infection upgrades match source spell class rarity and duration", () => {
  const source = { targetSpell: "Spell_InfectionBomb", targetHero: "Hero3_WitchDoctor" };
  const s = spellScenario("Hero3_WitchDoctor", [
    spellEffect("TargetSpellDamageBonus", 1, source),
    spellEffect("TargetSpellDamageBonus", 10, { targetHero: "Hero9_Quasar" }),
    spellEffect("TargetSpellDamageBonus", 10, { targetClass: "99" }),
    spellEffect("TargetSpellDamageBonus", 10, { useTargetRarity: "1", targetRarity: "99" }),
    spellEffect("TargetSpellRadius", 1, source), spellEffect("SpellDuration", 1, source),
  ]);
  s.enemy.x = s.spell.x + 80;
  expect(bphUnitAttackSpellDamage(s.ctx, s.spell)).toBeCloseTo(2.5999999046325684);
  castBphUnitAttackSpell(s.ctx, s.spell);
  s.tick(0.8999999761581421);
  expect(s.ctx.state.statuses[0].until).toBeCloseTo(10.899999976158142);
  s.tick(10);
  expect(s.enemy.hp).toBeCloseTo(948.0000019073486);
  expect(s.ctx.state.actors).toHaveLength(0);
});

test("source attack upgrades feed bomb damage while source-less casts use the definition", () => {
  const s = spellScenario("Hero3_WitchDoctor", [
    spellEffect("HeroAttackPower", 1, { targetHero: "Hero3_WitchDoctor" }),
    spellEffect("TargetSpellHitStunSeconds", 0.3, { targetHero: "Hero3_WitchDoctor" }),
  ]);
  expect(bphUnitAttackSpellDamage(s.ctx, s.spell)).toBeCloseTo(2.5999999046325684);
  expect(bphUnitAttackSpellDamage(s.ctx, { id: s.spell.id, x: 0, y: 0, power: 99 })).toBe(0.25);
  castBphUnitAttackSpell(s.ctx, s.spell);
  s.tick(1.399999976158142);
  expect(s.enemy.stun).toBe(0.3);
});

test("unsupported casts and an empty family tick leave the seeded RNG untouched", () => {
  const s = spellScenario(), rng = s.run.rng;
  expect(castBphUnitAttackSpell(s.ctx, { ...s.spell, id: "Spell_Seed" })).toBe(false);
  expect(bphUnitAttackSpellDamage(s.ctx, { ...s.spell, id: "Spell_Seed" })).toBeUndefined();
  s.tick(10);
  expect(s.run.rng).toBe(rng);
  expect(s.ctx.state.actors).toHaveLength(0);
  expect(s.events).toHaveLength(0);
});
