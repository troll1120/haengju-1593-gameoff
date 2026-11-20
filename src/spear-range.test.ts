import { afterEach, beforeEach, expect, test } from "bun:test";
import { BPH_PROFILES } from "./bph-data";
import { bphArms } from "./bph-combat";
import { BPH_WORLD_TO_PX } from "./bph-contract";
import { HEIGHT, setFieldSize, WIDTH } from "./geometry";
import { spearRangeFixture } from "../scripts/spear-range-fixture";

let field: [number, number];
beforeEach(() => { field = [WIDTH, HEIGHT]; });
afterEach(() => { setFieldSize(...field); });

const melee = Object.values(BPH_PROFILES).filter(p => p.attackType === 0 && p.cooldown > 0 && p.range > 0 && p.damage > 0);
test("the melee approach matrix covers all 22 attacking profiles", () => {
  expect(melee).toHaveLength(22);
});

for (const profile of melee) {
  test.each([-1, 1])(`${profile.id}: reaches and hits a stationary foe 90 px away (direction %i)`, side => {
    const { unit, enemy, step } = spearRangeFixture(profile.id);
    unit.x = WIDTH / 2 - 45 * side;
    enemy.x = enemy.goalX = unit.x + 90 * side;
    unit.y = enemy.y = enemy.goalY = 200;
    const enemyHp = enemy.hp;
    for (let tick = 0; tick < 180 && enemy.hp >= enemyHp; tick++) step();
    expect(enemy.hp).toBeLessThan(enemyHp);
  });

  test(`${profile.id}: a full gauge waits outside reach, then attacks in reach`, () => {
    const { run, unit, enemy, reach, step } = spearRangeFixture(profile.id);
    unit.x = 50;
    enemy.x = enemy.goalX = 350;
    if (profile.id === "Hero5_DinoRider") {
      unit.y = 80;
      enemy.y = enemy.goalY = 500;
    }
    if (profile.id === "Hero5_Dino" || profile.id === "Hero5_DinoRider") {
      expect(enemy.x).toBeLessThan(WIDTH);
      expect(Math.hypot(unit.x - enemy.x, unit.y - enemy.y))
        .toBeGreaterThan(Number(profile.raw.dashMaxDistance) * BPH_WORLD_TO_PX);
    }
    const hp = enemy.hp;
    const effects = step();
    expect(enemy.hp).toBe(hp);
    expect(run.shots).toHaveLength(0);
    expect(effects.some(e => e.kind === "windup" && e.index === 0)).toBe(false);
    expect(unit.strikeAt).toBe(0);
    expect(unit.clock).toBe(0);
    enemy.x = unit.x + Math.min(12, reach / 2);
    enemy.y = unit.y;
    step();
    expect(unit.strikeAt).toBeGreaterThan(run.time);
  });
}

for (const profileId of ["Hero1_Squire", "Hero1_Squire2", "Hero1_Squire3", "Hero4_Bannerman"]) {
  test(`${profileId}: no remote damage, then exactly one contact hit`, () => {
    const { run, unit, enemy, step } = spearRangeFixture(profileId);
    const hp = enemy.hp;
    for (let tick = 0; tick < 6; tick++) step();
    expect(enemy.hp).toBe(hp);
    expect(unit.clock).toBe(0);
    expect(unit.strikeAt).toBe(0);
    enemy.x = unit.x + 10;
    enemy.y = unit.y;
    step();
    for (let tick = 0; tick < 4; tick++) step();
    expect(enemy.hp).toBeCloseTo(hp - bphArms(unit, run)!.power, 6);
    const hitHp = enemy.hp;
    step();
    expect(enemy.hp).toBe(hitHp);
  });
}

test("a target escaping during the windup takes no melee damage", () => {
  const { unit, enemy, step } = spearRangeFixture();
  enemy.x = unit.x + 10;
  step();
  expect(unit.strikeAt).toBeGreaterThan(0);
  enemy.x = 320;
  const hp = enemy.hp;
  for (let tick = 0; tick < 4; tick++) step();
  expect(enemy.hp).toBe(hp);
});

for (const profileId of ["Hero5_Treant", "Hero1_Barbarian"]) {
  test(`${profileId}: melee cleave cannot damage a second enemy outside reach`, () => {
    const { run, unit, enemy, reach, step } = spearRangeFixture(profileId);
    enemy.x = unit.x + reach - 8;
    const distant = { ...enemy, id: run.nextId++, x: unit.x + reach + 25 };
    expect(Math.hypot(distant.x - enemy.x, distant.y - enemy.y)).toBeLessThan(bphArms(unit, run)!.span);
    run.enemies.push(distant);
    const hp = distant.hp;
    step();
    for (let tick = 0; tick < 4; tick++) step();
    expect(enemy.hp).toBeLessThan(hp);
    expect(distant.hp).toBe(hp);
  });
}

test("a distant pursuit lock does not hide a target already in reach", () => {
  const { run, unit, enemy, step } = spearRangeFixture();
  unit.revenge = enemy.id;
  unit.quarry = enemy.id;
  const nearby = { ...enemy, id: run.nextId++, x: unit.x + 10 };
  run.enemies.push(nearby);
  step();
  expect(unit.quarry).toBe(enemy.id);
  expect(unit.aim).toBe(nearby.id);
  for (let tick = 0; tick < 4; tick++) step();
  expect(nearby.hp).toBeLessThan(nearby.maxHp);
  expect(enemy.hp).toBe(enemy.maxHp);
});
