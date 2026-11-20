import { expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { bphSurvivalPlan } from "./bph-survival";
import { BPH_MONSTERS } from "./bph-data";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { advance } from "./rules";
import type { Enemy } from "./rules";
import { CENTER } from "./geometry";
import type { BphEffect } from "./bph-contract";

function encounter(multiplier: number | null, target: "unit" | "castle", upgrades: readonly BphEffect[] = []) {
  const run = createBphRun(freshMeta(), { seed: 7, general: "권율", upgrades });
  const battle = run.bph, squad = run.squads[0];
  if (!battle?.survival) throw new TypeError("Missing survival battle");
  // Measure only the strike. Crossing 100s would also rescale the general's HP at Lv2.
  run.time = 99; run.weather = "맑음"; run.commandClock = 10;
  squad.hurtAt = run.time;
  battle.survival.cursor = bphSurvivalPlan(battle.waveId).length;
  // At 100s the general reaches Lv2. Settle that HP gain before arming the strike.
  run.enemies = [];
  advance(run, .05);
  squad.x = CENTER.x; squad.y = CENTER.y; squad.strikeAt = 1000;
  const enemy: Enemy = {
    id: run.nextId++, bphProfileId: "Monster1_Caveling", kind: "yari", direction: "위",
    x: CENTER.x + 1, y: CENTER.y, hp: 1000, maxHp: 1000, speed: 0,
    elite: false, boss: false, goalX: CENTER.x, goalY: CENTER.y,
    clock: 0, strikeAt: run.time + .01, prey: [0, -1], stun: 0, burn: 0, burnClock: 0,
    skillClock: 1000, casting: 0, casts: 0,
  };
  run.enemies = [enemy];
  if (multiplier !== null) battle.survival.damage[enemy.id] = { unit: multiplier, castle: multiplier };
  if (target === "castle") {
    run.squads = []; run.walls.위 = 0;
    enemy.breach = "위"; enemy.strikeAt = 0; enemy.prey = null;
  }
  return { run, squad };
}

test.each([1, 1.6])("enemy strikes use their spawn-time unit multiplier %s", multiplier => {
  const { run, squad } = encounter(multiplier, "unit"), before = squad.hp;

  advance(run, .05);

  expect(before - squad.hp).toBeCloseTo(BPH_MONSTERS.Monster1_Caveling.damage * multiplier * BPH_SURVIVAL_TABLE.generalIncoming, 8);
});
test.each([1, 1.6])("castle strikes use their spawn-time castle multiplier %s", multiplier => {
  const { run } = encounter(multiplier, "castle");

  const effects = advance(run, .05);

  const strike = effects.find(effect => effect.kind === "wall");
  expect(strike?.value).toBeCloseTo(BPH_MONSTERS.Monster1_Caveling.towerDamage * multiplier, 8);
});
test.each(["unit", "castle"] as const)("unit scaling is neutral for a %s strike", target => {
  const implicit = encounter(null, target), explicit = encounter(1, target);

  const first = advance(implicit.run, .05), second = advance(explicit.run, .05);

  expect(second).toEqual(first);
  expect(explicit.run.rng).toBe(implicit.run.rng);
  expect(explicit.run.base).toBe(implicit.run.base);
  expect(explicit.squad.hp).toBe(implicit.squad.hp);
});
test.each(["unit", "castle"] as const)("E1 attack power precedes survival scaling for %s", target => {
  const { run, squad } = encounter(1.6, target, [{
    nodeId: "e1-attack", type: "MonsterAttackPower", value: 1, effectPower: 0,
    effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {},
  }]);
  const before = squad.hp;

  const effects = advance(run, .05);

  if (target === "unit")
    expect(before - squad.hp).toBeCloseTo(BPH_MONSTERS.Monster1_Caveling.damage * 2 * 1.6 * BPH_SURVIVAL_TABLE.generalIncoming, 8);
  else
    expect(effects.find(effect => effect.kind === "wall")?.value)
      .toBeCloseTo(BPH_MONSTERS.Monster1_Caveling.towerDamage * 1.6, 8);
});
