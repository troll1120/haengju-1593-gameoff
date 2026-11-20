import { expect, test } from "bun:test";
import { moveEnemy } from "./enemy-wall";
import { CENTER, contains, fortRect, guardPoint, SIDES, visibleCourtyard } from "./geometry";
import { riverBank } from "./river";
import { advance, createRun, spawn } from "./rules";

function siege() {
  const run = createRun(1593);
  run.squads = [];
  run.enemies = [];
  // Keep the fixture deterministic while allowing the real raid and crowd step.
  run.spawnBudget = -1e6;
  run.weather = "맑음";
  return run;
}

test("an intact wall blocks an enemy walking toward an interior target", () => {
  for (const side of SIDES) {
    const run = siege(), enemy = spawn(run, false, false, undefined, false, "위");
    Object.assign(enemy, guardPoint(run.fort, side, 10), {
      kind: "yari", ladder: false, goalX: CENTER.x, goalY: CENTER.y, speed: 240,
    });
    for (let step = 0; step < 30; step++) {
      advance(run, 1 / 30);
      expect(contains(fortRect(run.fort), enemy)).toBe(false);
    }
    expect(enemy.breach).toBeUndefined();
  }
});

test("walkers cross a broken side only, and attack the keep after entering", () => {
  for (const side of SIDES) {
    const run = siege(), enemy = spawn(run, false, false, undefined, false, "위");
    run.walls[side] = 0;
    const at = guardPoint(run.fort, side, 52);
    Object.assign(enemy, at, { kind: "yari", ladder: false, speed: 240, goalX: at.x, goalY: at.y, clock: 0 });
    const keepHp = run.base;
    advance(run, 1 / 30);
    expect(enemy.breach).toBeUndefined();
    expect(run.base).toBe(keepHp);
    for (let step = 0; step < 45; step++) advance(run, 1 / 30);
    expect(contains(visibleCourtyard(run.fort), enemy)).toBe(true);
    expect(enemy.breach).toBe(side);
    expect(run.base).toBeLessThan(keepHp);
    expect(SIDES.filter(other => run.walls[other] <= 0)).toEqual([side]);
  }
});

test("large pushes cannot tunnel through the fortress or enter through an adjacent intact wall", () => {
  const run = siege(), wall = fortRect(run.fort);
  const enemy = spawn(run, false, false, undefined, false, "위");
  const west = guardPoint(run.fort, "좌", 20), east = guardPoint(run.fort, "우", 20);
  Object.assign(enemy, west);
  run.walls.우 = 0;
  moveEnemy(run, enemy, east);
  expect(enemy.x).toBe(wall.left);
  expect(enemy.breach).toBeUndefined();
  Object.assign(enemy, east);
  moveEnemy(run, enemy, west);
  expect(enemy.breach).toBe("우");
  expect(enemy.x).toBeGreaterThan(wall.left);
  moveEnemy(run, enemy, east);
  expect(enemy.x).toBe(east.x);
  expect(enemy.breach).toBeUndefined();
});

test("crowd separation cannot push an enemy already in the old padding across the intact wall", () => {
  const run = siege(), wall = fortRect(run.fort);
  const near = spawn(run, false, false, undefined, false, "위");
  const next = spawn(run, false, false, undefined, false, "위");
  Object.assign(near, { x: wall.left - .5, y: CENTER.y, stun: 10 });
  Object.assign(next, { x: wall.left - 6, y: CENTER.y, stun: 10 });
  advance(run, 1 / 30);
  expect(near.x).toBe(wall.left);
  expect(next.x).toBeLessThan(wall.left - 6);
});

test("the intact wall stays clear under crowded shoreline landings, march-ins, and separation", () => {
  const run = siege(), wall = fortRect(run.fort);
  const marchers = SIDES.flatMap(side => Array.from({ length: 24 }, () =>
    spawn(run, false, false, undefined, false, side, .99)));
  const passengers = Array.from({ length: 30 }, () => spawn(run, false, false, undefined, false, "아래"));
  for (const ship of run.enemies.filter(e => e.cargo)) {
    ship.x = CENTER.x; ship.y = riverBank() + .01; ship.sailing = true;
  }
  for (const enemy of [...marchers, ...passengers]) {
    enemy.speed = 180; enemy.clock = 1e6; enemy.skillClock = 1e6;
  }
  for (let step = 0; step < 80; step++) {
    advance(run, 1 / 30);
    expect(run.enemies.some(e => e.kind !== "ship" && contains(wall, e))).toBe(false);
  }
  expect(run.metrics.naval.passengersLanded).toBe(passengers.length);
  expect(SIDES.every(side => run.walls[side] > 0)).toBe(true);
});
