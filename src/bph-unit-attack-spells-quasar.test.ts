import { expect, test } from "bun:test";
import { HEIGHT, WIDTH } from "./geometry";
import { bindBphConsumers } from "./bph-fx-dispatch";
import { beginBphCast } from "./bph-effects-entry";
import { spellEffect, spellScenario } from "./bph-unit-attack-spells.test";
import { bphUnitAttackSpellDamage, castBphUnitAttackSpell } from "./bph-unit-attack-spells";

test("quasar deals full source attack instantly and its fade causes no later damage or RNG", () => {
  const s = spellScenario("Hero9_Quasar");
  s.spell.id = "Spell_Quasar";
  expect(bphUnitAttackSpellDamage(s.ctx, s.spell)).toBe(40);
  castBphUnitAttackSpell(s.ctx, s.spell);
  expect(s.enemy.hp).toBe(960);
  const rng = s.run.rng, actor = s.ctx.state.actors[0];
  expect(actor.kind).toBe("beam");
  expect(actor.cast?.attackId).toBe(91);
  expect([actor.data.fromX, actor.data.fromY]).toEqual([100, 100]);
  s.tick(0.399);
  expect(s.ctx.state.actors).toHaveLength(1);
  expect(s.enemy.hp).toBe(960);
  s.tick(0.002);
  expect(s.ctx.state.actors).toHaveLength(0);
  expect(s.enemy.hp).toBe(960);
  expect(s.run.rng).toBe(rng);
});

test("quasar wraps to the opposite screen edge without enemy bounce or a cross-screen hit segment", () => {
  const s = spellScenario("Hero9_Quasar");
  s.spell.id = "Spell_Quasar";
  s.unit.x = WIDTH - 10;
  s.spell.x = WIDTH + 20;
  s.enemy.x = WIDTH - 5;
  const wrapped = { ...s.enemy, id: s.run.nextId++, x: 5 };
  const distant = { ...s.enemy, id: s.run.nextId++, x: 200, y: 300 };
  s.run.enemies.push(wrapped, distant);
  castBphUnitAttackSpell(s.ctx, s.spell);
  expect([s.enemy.hp, wrapped.hp, distant.hp]).toEqual([960, 960, 1000]);
  const data = s.ctx.state.actors[0].data;
  expect(data.wrapsUsed).toBe(1);
  for (let n = 0; n < data.pathCount; n++) {
    expect(Math.hypot(data[`path${n}ToX`] - data[`path${n}FromX`],
      data[`path${n}ToY`] - data[`path${n}FromY`])).toBeLessThanOrEqual(20.00001);
  }
  expect(s.events.filter(e => e.kind === "spellHit" && e.target.id === s.enemy.id)).toHaveLength(1);
});

test("quasar radius duration damage and wrap upgrades match the casting source", () => {
  const target = { targetHero: "Hero9_Quasar", targetSpell: "Spell_Quasar" };
  const s = spellScenario("Hero9_Quasar", [
    spellEffect("TargetSpellRadius", 1, target), spellEffect("SpellDuration", 1, target),
    spellEffect("TargetSpellDamageBonus", 0.5, target), spellEffect("TargetSpellBounce", 2, target),
    spellEffect("TargetSpellBounce", 10, { targetHero: "Hero4_Stormcaller" }),
  ]);
  s.spell.id = "Spell_Quasar";
  s.enemy.x = 100; s.enemy.y = 125;
  castBphUnitAttackSpell(s.ctx, s.spell);
  expect(s.enemy.hp).toBe(940);
  expect(s.ctx.state.actors[0].data.wrapsUsed).toBe(3);
  s.tick(0.5);
  expect(s.ctx.state.actors).toHaveLength(1);
  s.tick(0.301);
  expect(s.ctx.state.actors).toHaveLength(0);

  const control = spellScenario("Hero9_Quasar");
  control.spell.id = "Spell_Quasar"; control.enemy.x = 100; control.enemy.y = 125;
  castBphUnitAttackSpell(control.ctx, control.spell);
  expect(control.enemy.hp).toBe(1000);
});

test("quasar rolls crit once per cast and shares two plus bonus damage across all hits", () => {
  const s = spellScenario("Hero9_Quasar", [
    spellEffect("HeroCritChance", 0.5), spellEffect("HeroCritDamage", 0.5),
  ]);
  s.run.rng = 144;
  s.spell.id = "Spell_Quasar";
  const second = { ...s.enemy, id: s.run.nextId++, x: 220 };
  s.run.enemies.push(second);
  castBphUnitAttackSpell(s.ctx, s.spell);
  expect([s.enemy.hp, second.hp]).toEqual([900, 900]);
  expect(s.ctx.state.actors[0].data.castCritical).toBe(1);
});

test("quasar status variants are rolled per cast and retain source life and status duration upgrades", () => {
  const target = { targetHero: "Hero9_Quasar", targetSpell: "Spell_Quasar" };
  const s = spellScenario("Hero9_Quasar", [
    spellEffect("HeroSpellCastApplyStatusChance", 1, { ...target, targetStatus: "Weak" }),
    spellEffect("HeroSpellCastApplyStatusChance", 1, { ...target, targetStatus: "Vulnerable" }),
    spellEffect("StatusEffectDurationBonus", 1, { ...target, targetStatus: "Weak" }),
    spellEffect("HeroSpellCastApplyStatusChance", 1, { targetHero: "Hero4_Stormcaller", targetStatus: "Frozen" }),
  ]);
  s.spell.id = "Spell_Quasar";
  castBphUnitAttackSpell(s.ctx, s.spell);
  const cast = s.ctx.state.actors[0].cast;
  expect(s.ctx.state.statuses.map(status => [status.id, status.until, status.power]))
    .toEqual([["Weak", 10, 50], ["Vulnerable", 5, 50]]);
  expect(s.ctx.state.statuses.every(status => status.cast === cast && status.cast?.sourceLifeId === 7)).toBe(true);
  expect(s.events.filter(e => e.kind === "spellCast")).toHaveLength(1);
});

test("quasar path uses the same seeded bounded curve for identical casts", () => {
  const a = spellScenario("Hero9_Quasar"), b = spellScenario("Hero9_Quasar");
  a.spell.id = b.spell.id = "Spell_Quasar";
  castBphUnitAttackSpell(a.ctx, a.spell); castBphUnitAttackSpell(b.ctx, b.spell);
  const ad = a.ctx.state.actors[0].data, bd = b.ctx.state.actors[0].data;
  expect(ad).toEqual(bd);
  expect(a.run.rng).toBe(b.run.rng);
  for (let n = 0; n < ad.pathCount; n++) {
    expect(ad[`path${n}ToX`]).toBeGreaterThanOrEqual(0);
    expect(ad[`path${n}ToX`]).toBeLessThanOrEqual(WIDTH);
    expect(ad[`path${n}ToY`]).toBeGreaterThanOrEqual(0);
    expect(ad[`path${n}ToY`]).toBeLessThanOrEqual(HEIGHT);
    if (n === 0) continue;
    const current = Math.atan2(ad[`path${n}ToY`] - ad[`path${n}FromY`],
      ad[`path${n}ToX`] - ad[`path${n}FromX`]);
    const previous = Math.atan2(ad[`path${n - 1}ToY`] - ad[`path${n - 1}FromY`],
      ad[`path${n - 1}ToX`] - ad[`path${n - 1}FromX`]);
    expect(Math.abs(Math.atan2(Math.sin(current - previous), Math.cos(current - previous))))
      .toBeLessThanOrEqual(Math.PI / 180 + 1e-9);
  }
});

test("quasar finishes its curved path before hit consumers can consume combat RNG", () => {
  const a = spellScenario("Hero9_Quasar"), b = spellScenario("Hero9_Quasar");
  a.spell.id = b.spell.id = "Spell_Quasar";
  bindBphConsumers(b.ctx, [{ id: "spells", kinds: [], consume: () => {},
    onEvent: (ctx, event) => { if (event.kind === "spellHit") ctx.random(); } }], false);
  castBphUnitAttackSpell(a.ctx, a.spell); castBphUnitAttackSpell(b.ctx, b.spell);
  expect(a.ctx.state.actors[0].data).toEqual(b.ctx.state.actors[0].data);
  expect(a.run.rng).not.toBe(b.run.rng);
  expect([a.enemy.hp, b.enemy.hp]).toEqual([960, 960]);
});

test("quasar accepts an existing cast without changing identity or emitting another cast", () => {
  const s = spellScenario("Hero9_Quasar");
  s.spell.id = "Spell_Quasar";
  const cast = beginBphCast(s.ctx, { spellId: s.spell.id, source: s.unit, target: s.enemy,
    position: s.spell, foil: false, power: 0.25, attackId: 91 });
  castBphUnitAttackSpell(s.ctx, { ...s.spell, cast });
  expect(s.ctx.state.actors[0].cast).toBe(cast);
  expect(s.events.filter(e => e.kind === "spellCast")).toHaveLength(1);
  expect(s.events.filter(e => e.kind === "spellHit").every(e => e.cast === cast)).toBe(true);
  expect(bphUnitAttackSpellDamage(s.ctx, { id: s.spell.id, x: 0, y: 0, power: 99 })).toBe(0);
});
