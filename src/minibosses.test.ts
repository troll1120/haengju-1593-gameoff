import { expect, test } from "bun:test";
import { createBphRun } from "./bph-session";
import { bphSurvivalPlan } from "./bph-survival";
import { enemyArt } from "./enemy-animation";
import { fortRect } from "./geometry";
import { freshMeta } from "./meta";
import { MINIBOSS, MINIBOSS_TYPES, minibossScale } from "./minibosses";
import { advance, CASTS, ENEMY_SPACING, type Enemy, type Run } from "./rules";

function bench(seed: number) {
  const run = createBphRun(freshMeta(), { seed, general: "권율", upgrades: [], startBattle: false });
  const battle = run.bph!, director = battle.survival!;
  director.cursor = bphSurvivalPlan(battle.waveId).length;
  run.commandClock = 1e6;
  run.squads[0].clock = 1e6;
  return { run, director };
}

function appear(index: number) {
  const { run, director } = bench(index);
  run.time = 74.9;
  advance(run, .1);
  const enemy = run.enemies.find(foe => foe.miniboss)!;
  expect(enemy).toBeDefined();
  return { run, director, enemy };
}

test("the survival director spawns one mini-boss at each scheduled boundary", () => {
  const { run, director } = bench(0);
  const times = [75, 150, 225, 300, 365, 430, 495, 560, 625, 680, 735, 790, 845];
  for (const [index, at] of times.entries()) {
    run.enemies = [];
    run.time = at - .2;
    advance(run, .1);
    expect(run.enemies.filter(foe => foe.miniboss)).toHaveLength(0);
    advance(run, .1);
    expect(run.enemies.filter(foe => foe.miniboss).map(foe => foe.kind)).toEqual([MINIBOSS_TYPES[index % 5].kind]);
  }
  run.time = 899.9;
  advance(run, .1);
  expect(run.enemies.filter(foe => foe.miniboss)).toHaveLength(1);
});

function prepare(run: Run, enemy: Enemy) {
  const wall = fortRect(run.fort);
  Object.assign(enemy, { x: (wall.left + wall.right) / 2, y: wall.top - 25, speed: 0, skillClock: 0, clock: 1e6 });
  const squad = run.squads[0];
  Object.assign(squad, { x: enemy.x, y: wall.top, targetX: enemy.x, targetY: wall.top, perch: 0 });
  return squad;
}

for (const [index, type] of MINIBOSS_TYPES.entries()) {
  test(`${type.kind} uses its regular art at 1.5x and lands its boss skill`, () => {
    const { run, enemy } = appear(index);
    const regular = { ...enemy, miniboss: undefined };
    expect(enemyArt(enemy)).toEqual(enemyArt(regular));
    expect(minibossScale(enemy) / minibossScale(regular)).toBe(1.5);
    expect(enemy.boss || enemy.elite).toBe(false);
    const squad = prepare(run, enemy), hp = squad.hp, wall = run.wall, y = enemy.y;
    const warning = advance(run, .05);
    expect(warning.some(effect => effect.kind === "telegraph" && effect.target === enemy.id)).toBe(true);
    const mark = run.telegraphs.find(mark => mark.owner === enemy.id)!;
    expect(mark.skill).toBe(type.skill);
    expect(mark.at - mark.startedAt).toBeCloseTo(CASTS[type.skill].windup);
    const effects = [];
    while (run.time <= mark.at + .01) effects.push(...advance(run, .05));
    expect(effects.filter(effect => effect.kind === "land").map(effect => effect.miniboss)).toEqual([type.skill]);
    expect(run.wall).toBeLessThan(wall);
    expect(enemy.casting).toBe(0);
    expect(enemy.skillClock).toBeCloseTo(MINIBOSS.cooldown, 1);
    expect(enemy.casts).toBe(1);
    const hits = effects.filter(effect => effect.kind === "hurt" && effect.target === enemy.id);
    if (type.skill === "salvo") expect(hits).toHaveLength(1);
    else { expect(hits).toHaveLength(0); expect(squad.hp).toBe(hp); }
    if (type.skill === "cavalry") expect(enemy.y).not.toBe(y);
    if (type.skill === "shield") expect(enemy.shielded).toBe(true);
  });
}

test("the enlarged body reaches the edge of a splash that misses a normal enemy", () => {
  const { run, enemy } = appear(1);
  const regular = { ...enemy, id: run.nextId++, miniboss: undefined, y: enemy.y + ENEMY_SPACING * 2, speed: 0 };
  enemy.speed = 0;
  run.enemies.push(regular);
  for (const foe of [regular, enemy]) {
    run.shots.push({ id: run.nextId++, kind: "rocket", x: foe.x + 28, y: foe.y, toX: foe.x + 28, toY: foe.y,
      speed: 300, target: 0, prey: null, damage: 1, critical: false, by: "weapon", splash: 26, pierce: 0, from: 0 });
  }
  advance(run, .05);
  expect(enemy.hp).toBeLessThan(enemy.maxHp);
  expect(regular.hp).toBe(regular.maxHp);
  expect(regular.casting).toBe(0);
});

test("dying during windup cancels the warning and cannot leak a cast into the next spawn", () => {
  const { run, enemy } = appear(0);
  prepare(run, enemy);
  advance(run, .05);
  const mark = run.telegraphs.find(mark => mark.owner === enemy.id)!;
  expect(mark).toBeDefined();
  run.shots.push({ id: run.nextId++, kind: "arrow", x: enemy.x, y: enemy.y, toX: enemy.x, toY: enemy.y, target: enemy.id,
    speed: 300, prey: null, damage: 1e9, critical: false, by: "weapon", splash: 0, pierce: 0, from: 0 });
  const effects = advance(run, .05);
  expect(effects.some(effect => effect.kind === "kill" && effect.target === enemy.id)).toBe(true);
  expect(run.telegraphs).toHaveLength(0);
  while (run.time <= mark.at + .05) expect(advance(run, .05).some(effect => effect.kind === "land")).toBe(false);
  run.time = 149.9;
  advance(run, .1);
  const next = run.enemies.find(foe => foe.miniboss)!;
  expect(next.id).not.toBe(enemy.id);
  expect(next.casts).toBe(0);
  expect(next.casting).toBe(0);
});
