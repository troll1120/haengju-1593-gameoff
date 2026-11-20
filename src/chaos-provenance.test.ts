import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import { addBphProfile } from "./bph-combat";
import { bindBphConsumers, bphFxContext } from "./bph-fx-dispatch";
import { bphEffectCombat } from "./rules";
import { chaosArena, chaosEnemy, chaosTicks } from "./chaos-test-fixture";

function effect(type: string, value: number): BphEffect {
  return { nodeId: `fixture:${type}`, type, value, effectPower: 0, effectPowerScale: 0,
    stackCap: 0, countStep: 0, targets: { targetClass: "0" } };
}

test.each(["multishot", "bounce", "pierce"] as const)(
  "existing %s retains native stunned-target damage bonuses after the first army upgrade", mode => {
    for (const level of [0, 1]) {
      const run = chaosArena("신립", level), context = bphFxContext(run);
      if (!context) throw new Error("Missing native effect context");
      const extras = mode === "multishot" ? [effect("HeroProjectileCount", 1)]
        : mode === "bounce" ? [effect("ArcherArrowBounce", 1)] : [];
      bindBphConsumers({ ...context, effects: [...context.effects, effect("StunnedEnemyDamageBonus", .5), ...extras] }, undefined, false);
      const first = chaosEnemy(run, 235, 100), second = chaosEnemy(run, 265, 100);
      first.stun = second.stun = 10;
      addBphProfile(run, { profileId: "Hero1_Archer", copies: 1, foil: false, discovered: false }, { packId: "DeliveryBox" });
      const unit = run.squads[0].soldiers[0];
      Object.assign(unit, { x: 195, y: 100, clock: 1e9, strikeAt: run.time, aim: first.id, perch: 0 });
      run.quiver = mode === "pierce";
      chaosTicks(run, 30);
      const hit = 1.5 * (1 + level * .02);
      expect(10000 - first.hp).toBeCloseTo(hit * (mode === "multishot" ? 2 : 1));
      expect(10000 - second.hp).toBeCloseTo(mode === "multishot" ? 0 : hit);
    }
  },
);

test.each(["Hero4_Stormcaller", "Hero9_Quasar", "Hero3_WitchDoctor"])(
  "native attack spell %s casts through its own executor and still counts one chaos attack", profileId => {
    const spell = { Hero4_Stormcaller: "Spell_Tornado", Hero9_Quasar: "Spell_Quasar",
      Hero3_WitchDoctor: "Spell_InfectionBomb" }[profileId]!;
    const run = chaosArena("권율", 20), target = chaosEnemy(run, 235, 100);
    addBphProfile(run, { profileId, copies: 1, foil: false, discovered: false }, { packId: "DeliveryBox" });
    Object.assign(run.squads[0].soldiers[0], { x: 195, y: 100, clock: 1e9, strikeAt: run.time, aim: target.id, perch: 0 });
    chaosTicks(run, 1);
    // The restored executor replaces the old basic-attack fallback: the attack is
    // one real chaos attack and the spell actor carries its own positive power.
    expect(run.chaos?.attacks).toBe(1);
    const actor = run.bph?.fx.actors.find(a => a.data.unitSpell === 1);
    expect(actor?.cast?.spellId).toBe(spell);
    expect((actor?.power ?? 0) > 0).toBe(true);
    expect(run.shots.every(shot => shot.damage > 0)).toBe(true);
    // Durations differ per spell (tornado 4s, bomb 5.9s, quasar 0.4s); the
    // per-spell lifetime mechanics are covered by their own module tests.
    chaosTicks(run, 29);
    expect(run.chaos?.attacks).toBe(1);
  },
);

test("Song's added pierce restores original damage and hooks before a native bounce", () => {
  const run = chaosArena("송상현", 5), context = bphFxContext(run);
  if (!context) throw new Error("Missing native effect context");
  bindBphConsumers({ ...context, effects: [...context.effects, effect("StunnedEnemyDamageBonus", .5),
    effect("ArcherArrowBounce", 1)] }, undefined, false);
  // At Lv5 a second army hop reaches 65px. Only the native bow bounce can reach this witness.
  const first = chaosEnemy(run, 235, 100), second = chaosEnemy(run, 265, 100), third = chaosEnemy(run, 265, 180);
  first.stun = second.stun = third.stun = 10;
  addBphProfile(run, { profileId: "Hero1_Archer", copies: 1, foil: false, discovered: false }, { packId: "DeliveryBox" });
  Object.assign(run.squads[0].soldiers[0], { x: 195, y: 100, clock: 1e9, strikeAt: run.time, aim: first.id, perch: 0 });
  chaosTicks(run, 30);
  expect(10000 - first.hp).toBeCloseTo(1.1 * 1.5);
  expect(10000 - second.hp).toBeCloseTo(1.1 * .4);
  expect(10000 - third.hp).toBeCloseTo(1.1 * 1.5);
});

test("an original fireball kill counts once, while a triggered fireball and militia kill do not", () => {
  const run = chaosArena("곽재우", 20), target = chaosEnemy(run, 235, 100);
  target.hp = .5;
  addBphProfile(run, { profileId: "Hero2_Pyromancer", copies: 1, foil: false, discovered: false }, { packId: "DeliveryBox" });
  const unit = run.squads[0].soldiers[0];
  Object.assign(unit, { x: 195, y: 100, clock: 1e9, strikeAt: run.time, aim: target.id, perch: 0 });
  chaosTicks(run, 10);
  expect(run.chaos?.kills).toBe(1);
  const proc = chaosEnemy(run, 235, 100); proc.hp = .5;
  const context = bphFxContext(run);
  if (!context) throw new Error("Missing native context");
  context.state.spells.push({ id: "Spell_Fireball", x: proc.x, y: proc.y, power: .25, sourceId: unit.id });
  chaosTicks(run, 10);
  expect(run.chaos?.kills).toBe(1);
  const militiaTarget = chaosEnemy(run, 235, 100); militiaTarget.hp = .1;
  bphEffectCombat(run, []).applyDamage({ target: militiaTarget, source: unit, amount: .18, spellId: "chaos:militia" });
  expect(run.chaos?.kills).toBe(1);
  expect(run.kills).toBe(3);
});

test("army damage retains native resistance without free stun, shield breaks or extra skill multipliers", () => {
  const run = chaosArena("김시민", 20), target = chaosEnemy(run, 235, 100), effects: import("./rules").Effect[] = [];
  run.meta = { ...run.meta, skillPower: 9 };
  const combat = bphEffectCombat(run, effects);
  combat.applyDamage({ target, amount: .3, source: run.squads[0], spellId: "chaos:belt", critical: true });
  expect(10000 - target.hp).toBeCloseTo(.3);
  expect(target.stun).toBe(0);
  expect(effects.find(hit => hit.kind === "hit")).toMatchObject({ minor: true, critical: false });
  target.shielded = true;
  combat.applyDamage({ target, amount: .3, source: run.squads[0], spellId: "chaos:orbit" });
  expect(10000 - target.hp).toBeCloseTo(.3);
  expect(target.shielded).toBe(true);
});

test("manual chaos damage keeps native skill upgrades and shield breaking while retaining its real wall origin", () => {
  const run = chaosArena("김시민", 20), target = chaosEnemy(run, 235, 100);
  const effects: import("./rules").Effect[] = [], origin = { x: 155, y: 229 };
  run.meta.skillPower = 2; target.shielded = true;
  const dealt = bphEffectCombat(run, effects).applyDamage({
    target, amount: 3, source: run.squads[0], spellId: "chaos:manual:cannon", position: origin,
  });
  expect(dealt).toBe(6);
  expect(target.hp).toBe(9994);
  expect(target.shielded).toBe(false);
  expect(target.stun).toBe(0);
  expect(effects.find(effect => effect.kind === "hit")).toMatchObject({ fromX: origin.x, fromY: origin.y });
});

test("army-triggered cannon damage cannot inherit manual skill upgrades or break an enemy shield", () => {
  const run = chaosArena("김시민", 20), target = chaosEnemy(run, 235, 100);
  run.meta.skillPower = 2; target.shielded = true;
  const combat = bphEffectCombat(run, []);
  expect(combat.applyDamage({ target, amount: 3, source: run.squads[0], spellId: "chaos:army:cannon" })).toBe(0);
  expect(target.hp).toBe(10000);
  expect(target.shielded).toBe(true);
  target.shielded = false;
  expect(combat.applyDamage({ target, amount: 3, source: run.squads[0], spellId: "chaos:army:cannon" })).toBe(3);
  expect(target.stun).toBe(0);
});
