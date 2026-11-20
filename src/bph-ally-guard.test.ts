import { expect, test } from "bun:test";
import { freshMeta } from "./meta";
import { createBphRun } from "./bph-session";
import { addBphProfile } from "./bph-combat";
import { advance, ALLY_SPACING, createRun, RETALIATE } from "./rules";
import type { Enemy, Run } from "./rules";
import { CENTER, contains, distance, fortRect } from "./geometry";

function quiet(): Run {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades: [] });
  run.enemies = []; run.xp = run.spawnBudget = -1e9;
  run.nextElite = run.nextBoss = run.nextWave = run.nextRiverWave = 1e9;
  return run;
}
function gunner(run: Run, at: { x: number; y: number }): Enemy {
  return { ...createRun(4).enemies[0], id: run.nextId++, ...at, kind: "teppo", hp: 1e9, maxHp: 1e9, speed: 0, elite: false, boss: false,
    goalX: at.x, goalY: at.y, clock: 0, strikeAt: 0, prey: null, stun: 0, skillClock: 1e9 };
}

test("idle soldiers bunched on the west wall get stable posts balanced between both halves", () => {
  const run = quiet();
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 12, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  const wall = fortRect(run.fort), soldiers = run.squads[0].soldiers;
  soldiers.forEach((unit, i) => Object.assign(unit, { x: wall.left - 26, y: wall.top + 10 + i * 14, emerging: false }));
  advance(run, 1 / 30);
  const spots = soldiers.map(unit => ({ ...unit.march! }));
  const counts = ["left", "right"].map(side => soldiers.filter(unit => unit.flank === side).length);
  expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  for (const [i, a] of spots.entries()) {
    expect(contains(wall, a)).toBe(false);
    for (const b of spots.slice(i + 1)) expect(distance(a, b)).toBeGreaterThanOrEqual(ALLY_SPACING);
  }
  advance(run, 1 / 30);
  expect(soldiers.map(unit => unit.march)).toEqual(spots);
});

test("a melee soldier shot from beyond its reach charges the gunner and a nearby mate joins, then they let go past the leash", () => {
  const run = quiet();
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 8, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  const wall = fortRect(run.fort), [shot, mate, far, ...rest] = run.squads[0].soldiers;
  // Two soldiers to a side, so the guard ring keeps both north soldiers on the north side.
  const spots = [{ x: wall.right + 26, y: CENTER.y + 30 }, { x: CENTER.x - 40, y: wall.bottom + 26 }, { x: CENTER.x + 40, y: wall.bottom + 26 },
    { x: wall.left - 26, y: CENTER.y - 30 }, { x: wall.left - 26, y: CENTER.y + 30 }];
  rest.forEach((unit, i) => Object.assign(unit, spots[i], { emerging: false }));
  // The shield turns every bullet into a block, so the soldiers live through the whole chase.
  run.shieldUntil = 1e9; run.reflect = false;
  Object.assign(shot, { x: CENTER.x + 40, y: wall.top - 30, emerging: false });
  Object.assign(mate, { x: CENTER.x + 64, y: wall.top - 30, emerging: false });
  Object.assign(far, { x: wall.right + 26, y: wall.bottom - 20, emerging: false });
  // Past the 130 px band soldiers look for foes in, still inside the gunner's 110 px aggro.
  const enemy = gunner(run, { x: shot.x, y: shot.y - 108 });
  run.enemies = [enemy];
  const start = distance(shot, enemy);
  for (let i = 0; i < 60 && shot.revenge === undefined; i++) advance(run, .05);
  expect(shot.revenge).toBe(enemy.id);
  expect(mate.revenge).toBe(enemy.id);
  expect(far.revenge).toBeUndefined();
  for (let i = 0; i < 10; i++) advance(run, .05);
  expect(distance(shot, enemy)).toBeLessThan(start - 20);
  Object.assign(enemy, { y: wall.top - RETALIATE.leash - 20, goalY: wall.top - RETALIATE.leash - 20 });
  advance(run, .05);
  expect(shot.revenge).toBeUndefined();
});
