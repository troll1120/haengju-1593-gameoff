import { expect, test } from "bun:test";
import type { BphFxEvent } from "./bph-contract";
import { bphConsumers, bindBphConsumers, bphFxContext } from "./bph-fx-dispatch";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { advance, createRun } from "./rules";

test.each(["Hero2_Pyromancer", "Hero9_Supernova"])("%s completes one real spell attack event", profileId => {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
  const context = bphFxContext(run);
  if (!context) throw new RangeError("Expected production context");
  const attacks: BphFxEvent[] = [];
  bindBphConsumers(context, [...bphConsumers(), {
    id: "quests", kinds: [], consume() {},
    onEvent(_ctx, event) { if (event.kind === "after-attack") attacks.push(event); },
  }], false);
  context.spawnProfile(profileId, 1, { packId: "Pack1_Basic", position: { x: 70, y: 100 } });
  const unit = run.squads[0].soldiers[0];
  const target = { ...createRun(4).enemies[0], id: run.nextId++, x: 90, y: 100,
    hp: 100, maxHp: 100, speed: 0, clock: 1000, shielded: false };
  run.enemies = [target]; run.squads[0].clock = 1000;
  unit.strikeAt = .001; unit.aim = target.id; unit.clock = 1000;

  advance(run, .05);

  expect(attacks).toHaveLength(1);
  expect(attacks[0]).toMatchObject({ kind: "after-attack", unit: { id: unit.id }, target: { id: target.id } });
});

test("a stunned spell caster neither creates a spell nor completes an attack", () => {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
  const context = bphFxContext(run);
  if (!context) throw new RangeError("Expected production context");
  const attacks: BphFxEvent[] = [];
  bindBphConsumers(context, [...bphConsumers(), {
    id: "quests", kinds: [], consume() {},
    onEvent(_ctx, event) { if (event.kind === "after-attack" || event.kind === "spellCast") attacks.push(event); },
  }], false);
  context.spawnProfile("Hero2_Pyromancer", 1, { packId: "Pack1_Basic", position: { x: 70, y: 100 } });
  const unit = run.squads[0].soldiers[0];
  const target = { ...createRun(4).enemies[0], id: run.nextId++, x: 90, y: 100,
    hp: 100, maxHp: 100, speed: 0, clock: 1000, shielded: false };
  run.enemies = [target]; run.squads[0].clock = 1000;
  unit.strikeAt = .001; unit.aim = target.id; unit.clock = 1000;
  context.applyBuff({ target: unit, side: "ally", id: "Stun", duration: 1, power: 0, stacks: 1 });

  advance(run, .05);

  expect(attacks).toEqual([]);
  expect(context.state.spells).toEqual([]);
  expect(context.state.actors).toEqual([]);
});
