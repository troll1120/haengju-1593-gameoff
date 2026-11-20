import { expect, test } from "bun:test";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { spellEffect, spellScenario } from "./bph-unit-attack-spells.test";
import { bphUnitAttackSpellDamage, castBphUnitAttackSpell } from "./bph-unit-attack-spells";

test("tornado inherits source attack and delivers eight half-second ticks before expiry", () => {
  const s = spellScenario("Hero4_Stormcaller", [spellEffect("TargetSpellRadius", 100)]);
  s.spell.id = "Spell_Tornado";
  expect(bphUnitAttackSpellDamage(s.ctx, s.spell)).toBe(6.5);
  castBphUnitAttackSpell(s.ctx, s.spell);
  s.tick(0.499);
  expect(s.enemy.hp).toBe(1000);
  s.tick(0.001);
  expect(s.enemy.hp).toBe(993.5);
  s.tick(3.5);
  expect(s.enemy.hp).toBe(948);
  expect(s.ctx.state.actors).toHaveLength(0);
  s.tick(2);
  expect(s.enemy.hp).toBe(948);
});

test("tornado motion is seeded and independent of caller frame partition", () => {
  const a = spellScenario("Hero4_Stormcaller"), b = spellScenario("Hero4_Stormcaller");
  a.spell.id = b.spell.id = "Spell_Tornado";
  castBphUnitAttackSpell(a.ctx, a.spell); castBphUnitAttackSpell(b.ctx, b.spell);
  a.tick(2);
  for (let i = 0; i < 120; i++) b.tick(1 / 60);
  expect(a.run.rng).toBe(b.run.rng);
  expect(a.ctx.state.actors[0].x).toBeCloseTo(b.ctx.state.actors[0].x, 10);
  expect(a.ctx.state.actors[0].y).toBeCloseTo(b.ctx.state.actors[0].y, 10);
  expect(a.enemy.x).toBeCloseTo(b.enemy.x, 10);
  expect(a.enemy.y).toBeCloseTo(b.enemy.y, 10);
  expect(a.ctx.state.actors[0].x).not.toBe(200);
});

test("tornado soft pull and swirl move nearby enemies but leave distant enemies untouched", () => {
  const s = spellScenario("Hero4_Stormcaller");
  s.spell.id = "Spell_Tornado";
  s.enemy.x = 225;
  const far = { ...s.enemy, id: s.run.nextId++, x: 380, y: 600 };
  s.run.enemies.push(far);
  castBphUnitAttackSpell(s.ctx, s.spell);
  s.tick(1 / 60);
  expect(s.enemy.x).toBeLessThan(225);
  expect(s.enemy.y).toBeGreaterThan(100);
  expect([far.x, far.y, far.hp]).toEqual([380, 600, 1000]);
  expect(s.ctx.state.actors[0].radius).toBeCloseTo(0.25 * BPH_WORLD_TO_PX);
  s.tick(0.5);
  expect(far.hp).toBe(1000);
});

test("tornado expiry releases captured survivors with the original impulse speed", () => {
  const a = spellScenario("Hero4_Stormcaller", [spellEffect("TargetSpellRadius", 100)]);
  const b = spellScenario("Hero4_Stormcaller", [spellEffect("TargetSpellRadius", 100),
    spellEffect("SpellDuration", 0.025)]);
  a.spell.id = b.spell.id = "Spell_Tornado";
  castBphUnitAttackSpell(a.ctx, a.spell); castBphUnitAttackSpell(b.ctx, b.spell);
  a.tick(4); b.tick(4);
  expect(Math.hypot(a.enemy.x - b.enemy.x, a.enemy.y - b.enemy.y)).toBeCloseTo(3 * BPH_WORLD_TO_PX / 60);
  expect(a.ctx.state.actors).toHaveLength(0);
  expect(b.ctx.state.actors).toHaveLength(1);
});

test("tornado source-specific upgrades extend duration and preserve dead-source damage", () => {
  const target = { targetHero: "Hero4_Stormcaller", targetSpell: "Spell_Tornado" };
  const s = spellScenario("Hero4_Stormcaller", [
    spellEffect("SpellDuration", 0.5, target), spellEffect("TargetSpellRadius", 100, target),
    spellEffect("TargetSpellDamageBonus", 1, target),
    spellEffect("SpellDuration", 20, { targetHero: "Hero9_Quasar" }),
  ]);
  s.spell.id = "Spell_Tornado";
  castBphUnitAttackSpell(s.ctx, s.spell);
  const cast = s.ctx.state.actors[0].cast;
  s.run.squads[0].soldiers = [];
  s.tick(6);
  expect(s.enemy.hp).toBe(844);
  expect(s.ctx.state.actors).toHaveLength(0);
  const hits = s.events.filter(event => event.kind === "spellHit");
  expect(hits).toHaveLength(12);
  expect(hits.every(event => event.cast === cast && event.cast?.sourceLifeId === 7)).toBe(true);
});

test("tornado rolls crit separately per enemy per tick with two plus bonus multiplier", () => {
  const s = spellScenario("Hero4_Stormcaller", [
    spellEffect("TargetSpellRadius", 100), spellEffect("HeroCritChance", 0.5),
    spellEffect("HeroCritDamage", 0.5),
  ]);
  s.spell.id = "Spell_Tornado";
  s.run.rng = 144;
  const second = { ...s.enemy, id: s.run.nextId++ };
  s.run.enemies.push(second);
  castBphUnitAttackSpell(s.ctx, s.spell);
  s.tick(0.5);
  expect([s.enemy.hp, second.hp]).toEqual([983.75, 993.5]);
  s.tick(0.5);
  expect([s.enemy.hp, second.hp]).toEqual([977.25, 977.25]);
});
