import { expect, test } from "bun:test";
import { bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { bphSpellDamage } from "./bph-fx-status";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { createRun } from "./rules";

function battle(profileId: string) {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
  const context = bphFxContext(run);
  if (!context) throw new RangeError("Expected production context");
  context.spawnProfile(profileId, 1, { packId: "Pack1_Basic", position: { x: 100, y: 200 } });
  const source = run.squads[0].soldiers[0];
  const enemy = { ...createRun(4).enemies[0], id: run.nextId++, x: 200, y: 200,
    hp: 100, maxHp: 100, shielded: false, speed: 0, clock: 1000, stun: 0 };
  run.enemies = [enemy];
  return { run, context, source, enemy };
}

test.each([
  ["Hero2_Pyromancer", "Spell_Fireball", 3],
  ["Hero9_BlackHole", "Spell_TeleportAndDamageAoe", 25],
  ["Hero9_Supernova", "Spell_Mine", 30],
  ["Hero3_Illusionist", "Spell_AoeCircle", 24],
] as const)("%s uses its attack damage for %s regardless of planeswalker power", (profileId, id, amount) => {
  const { context, source, enemy } = battle(profileId);

  const values = [.25, 2].map(power => bphSpellDamage(context,
    { id, sourceId: source.id, x: enemy.x, y: enemy.y, power }));

  expect(values).toEqual([amount, amount]);
});

test("a source-less spell retains definition damage scaled by its supplied power", () => {
  const { context, enemy } = battle("Hero2_Pyromancer");

  const amount = bphSpellDamage(context, { id: "Spell_Fireball", x: enemy.x, y: enemy.y, power: 2 });

  expect(amount).toBe(8);
});

test("a fireball retains its firing damage when its source disappears in flight", () => {
  const { run, context, source, enemy } = battle("Hero2_Pyromancer");
  context.state.spells.push({ id: "Spell_Fireball", sourceId: source.id, targetId: enemy.id,
    x: enemy.x, y: enemy.y, power: .25 });
  dispatchBphEffects(run, { kind: "step", dt: 0 });
  run.squads[0].soldiers = [];
  run.time = 1;

  dispatchBphEffects(run, { kind: "step", dt: 1 });

  expect(enemy.hp).toBe(97);
});
