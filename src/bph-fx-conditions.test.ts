import { expect, test } from "bun:test";
import type { BphFxEvent } from "./bph-contract";
import { applyInfection, conditionProvenance, CONDITION_CONSUMERS } from "./bph-fx-conditions";
import { beginBphCast } from "./bph-effects-entry";
import { bindBphConsumers, bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { createRun } from "./rules";

function battle() {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [], startBattle: false });
  const context = bphFxContext(run);
  if (!context) throw new RangeError("A survival run must bind the real effect context");
  const target = createRun(144).enemies[0];
  target.id = run.nextId++;
  run.enemies.push(target);
  context.spawnProfile("Hero3_WitchDoctor", 1, { packId: "Pack3_Swamp", cause: "pack" });
  const source = run.squads[0].soldiers[0];
  if (!source) throw new RangeError("Original Witch Doctor must produce a real unit");
  const events: BphFxEvent[] = [];
  bindBphConsumers(context, [...CONDITION_CONSUMERS, {
    id: "status", kinds: [],
    onEvent: (_ctx, event) => { events.push(event); },
    consume: () => { throw new RangeError("Observation has no upgrade effect kinds"); },
  }], false);
  const cast = beginBphCast(context, { spellId: "Spell_InfectionBomb", source, target,
    position: { x: target.x, y: target.y }, tomeId: "Tome_InfectionBomb", foil: false, power: 0.25 });
  return { run, context, target, source, cast, events };
}

test("a basic infection crosses real applyBuff with explicit duration and complete cast provenance", () => {
  const { run, context, target, cast, events } = battle();
  run.time = 7;
  applyInfection(context, { target, cast, duration: 2.75 });
  expect(context.state.statuses).toHaveLength(1);
  const infection = context.state.statuses[0];
  expect(infection).toMatchObject({
    id: "Infected", targetId: target.id, side: "enemy", until: 9.75,
    power: 0, stacks: 1, sourceId: cast.sourceId,
  });
  expect(conditionProvenance(infection)).toEqual(cast);
  expect(events.filter(event => event.kind === "buff-applied")).toHaveLength(1);
});

test.each([0.5, 4])("a refresh with duration %s keeps one state and the expiration-owning cast", duration => {
  const { run, context, target, source, cast } = battle();
  applyInfection(context, { target, cast, duration: 2.75 });
  run.time = 1;
  const next = beginBphCast(context, { spellId: "Spell_InfectionBomb", source, target,
    position: target, foil: true, power: 0.5 });
  applyInfection(context, { target, cast: next, duration });
  expect(context.state.statuses).toHaveLength(1);
  const infection = context.state.statuses[0];
  expect(infection.until).toBe(duration === 0.5 ? 2.75 : 5);
  expect(conditionProvenance(infection)).toEqual(duration === 0.5 ? cast : next);
  expect(infection.stacks).toBe(1);
});

test("the basic consumer expires at the exact boundary and leaves unrelated buffs intact", () => {
  const { run, context, target, cast } = battle();
  applyInfection(context, { target, cast, duration: 2.75 });
  context.applyBuff({ target, side: "enemy", id: "Vulnerable", duration: 10, power: 50, stacks: 1 });
  run.time = 2.749;
  dispatchBphEffects(run, { kind: "step", dt: 0.001 });
  expect(context.state.statuses.map(status => status.id)).toEqual(["Infected", "Vulnerable"]);
  run.time = 2.75;
  dispatchBphEffects(run, { kind: "step", dt: 0.001 });
  expect(context.state.statuses.map(status => status.id)).toEqual(["Vulnerable"]);
});

test("a new infection after expiration uses the new source life without reviving the old cast", () => {
  const { run, context, target, cast } = battle();
  applyInfection(context, { target, cast, duration: 1 });
  run.time = 1;
  dispatchBphEffects(run, { kind: "step", dt: 1 });
  run.squads[0].soldiers = [];
  context.spawnProfile("Hero3_WitchDoctor", 1, { packId: "Pack3_Swamp", cause: "summon" });
  const source = run.squads[0].soldiers[0];
  if (!source) throw new RangeError("A new source must have a real life");
  const next = beginBphCast(context, { spellId: "Spell_InfectionBomb", source, target,
    position: target, foil: null, power: 0.75 });
  applyInfection(context, { target, cast: next, duration: 3 });
  expect(context.state.statuses).toHaveLength(1);
  expect(context.state.statuses[0].until).toBe(4);
  expect(conditionProvenance(context.state.statuses[0])).toEqual(next);
  expect(next.sourceId).not.toBe(cast.sourceId);
  expect(next.sourceLifeId).toBe(context.unitInfo(source)?.lifeId ?? null);
});

test("a projectile retains its firing source and life after that source leaves the field", () => {
  const { run, context, target, cast } = battle();
  run.squads[0].soldiers = [];
  applyInfection(context, { target, cast, duration: 3 });
  expect(context.state.statuses[0].sourceId ?? null).toBe(cast.sourceId);
  expect(conditionProvenance(context.state.statuses[0])?.sourceLifeId).toBe(cast.sourceLifeId);
});

test.each(["dead", "zero-duration"] as const)("the %s hit cannot create a live infection", reason => {
  const { context, target, cast } = battle();
  if (reason === "dead") target.hp = 0;
  applyInfection(context, { target, cast, duration: reason === "zero-duration" ? 0 : 3 });
  expect(context.state.statuses).toEqual([]);
});

test("basic infection and expiration change no HP, speed, reward or RNG state", () => {
  const { run, context, target, cast } = battle();
  const before = { hp: target.hp, speed: target.speed, gold: run.gold,
    rng: run.rng, save: JSON.stringify(context.save), nextId: run.nextId };
  applyInfection(context, { target, cast, duration: 3 });
  run.time = 3;
  dispatchBphEffects(run, { kind: "step", dt: 3 });
  expect({ hp: target.hp, speed: target.speed, gold: run.gold,
    rng: run.rng, save: JSON.stringify(context.save), nextId: run.nextId }).toEqual(before);
});
