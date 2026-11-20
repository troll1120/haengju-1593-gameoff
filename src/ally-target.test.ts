import { afterEach, beforeEach, expect, test } from "bun:test";
import { marchFixture } from "../scripts/ally-march-fixture";
import { advance, RETALIATE } from "./rules";
import { CENTER, fortRect, HEIGHT, setFieldSize, WIDTH } from "./geometry";

let field: { width: number; height: number };
beforeEach(() => { field = { width: WIDTH, height: HEIGHT }; });
afterEach(() => setFieldSize(field.width, field.height));

function targetFixture() {
  const { run, soldiers, enemy } = marchFixture("far", 370);
  const unit = soldiers[0];
  soldiers.slice(1).forEach(other => { other.hp = 0; other.downUntil = 1e9; });
  Object.assign(unit, { x: 255, y: 220, emerging: false, clock: 1e9 });
  Object.assign(enemy, { x: 233, y: 220, goalX: 233, goalY: 220 });
  const rival = { ...enemy, id: run.nextId++, x: 277, goalX: 277 };
  run.enemies.push(rival);
  return { run, unit, enemy, rival };
}

test("near-equal moving enemies do not reverse a melee soldier at the contact boundary", () => {
  const { run, unit, enemy, rival } = targetFixture();
  const center = unit.x;
  let picked: number | undefined;
  let changes = 0;
  for (let step = 0; step < 300; step++) {
    const shift = Math.floor(step / 15) % 2 ? 3 : -3;
    enemy.x = enemy.goalX = center - 26 + shift;
    rival.x = rival.goalX = center + 26 + shift;
    advance(run, 1 / 30);
    if (picked !== undefined && unit.quarry !== picked) changes++;
    picked = unit.quarry;
  }
  expect(changes).toBe(0);
});

test("a clearly closer enemy takes over after the short hold", () => {
  const { run, unit, enemy, rival } = targetFixture();
  unit.quarry = enemy.id;
  unit.lockUntil = 0;
  enemy.x = enemy.goalX = unit.x - 45;
  rival.x = rival.goalX = unit.x + 20;
  advance(run, 1 / 30);
  expect(unit.quarry).toBe(rival.id);
});

test("same-direction pursuit keeps the existing nearest-target threshold", () => {
  const { run, unit, enemy, rival } = targetFixture();
  unit.quarry = enemy.id;
  unit.lockUntil = 0;
  enemy.x = enemy.goalX = unit.x + 28;
  rival.x = rival.goalX = unit.x + 22;
  advance(run, 1 / 30);
  expect(unit.quarry).toBe(rival.id);
});

test("dead and ineligible targets release even inside a fresh hold", () => {
  for (const invalid of ["dead", "ship"] as const) {
    const { run, unit, enemy, rival } = targetFixture();
    unit.quarry = enemy.id;
    unit.lockUntil = 1e9;
    if (invalid === "dead") enemy.hp = 0;
    else enemy.kind = "ship";
    advance(run, 1 / 30);
    expect(unit.quarry).toBe(rival.id);
  }
});

test("a target escaping far beyond its rival is released after the hold", () => {
  const { run, unit, enemy, rival } = targetFixture();
  unit.quarry = enemy.id;
  unit.lockUntil = 0;
  enemy.x = enemy.goalX = -200;
  advance(run, 1 / 30);
  expect(unit.quarry).toBe(rival.id);
});

test("a target outside the battlefield leash releases even without another enemy", () => {
  const { run, unit, enemy, rival } = targetFixture();
  unit.quarry = enemy.id;
  unit.lockUntil = 1e9;
  enemy.x = enemy.goalX = -RETALIATE.leash - 1;
  rival.hp = 0;
  advance(run, 1 / 30);
  expect(unit.quarry).toBeUndefined();
});

test("a spearman can hit an attacker pressed against the gate", () => {
  const { run, unit, enemy, rival } = targetFixture();
  const wall = fortRect(run.fort);
  rival.hp = 0;
  Object.assign(unit, { x: CENTER.x, y: wall.top - 45, clock: 0 });
  Object.assign(enemy, { x: CENTER.x, y: wall.top - 1, goalX: CENTER.x, goalY: wall.top });

  const hp = enemy.hp;
  for (let step = 0; step < 180; step++) advance(run, 1 / 60);

  expect(unit.quarry).toBe(enemy.id);
  expect(enemy.hp).toBeLessThan(hp);
});

test("a barbarian cone hit emits one visible release for its striker", () => {
  const { run, unit, enemy, rival } = targetFixture();
  const barbarian = run.squads[0].soldiers.find(unit => unit.bph?.profileId === "Hero1_Barbarian")!;
  Object.assign(unit, { hp: 0, downUntil: 1e9 });
  Object.assign(barbarian, { hp: barbarian.maxHp, downUntil: 0, x: 70, y: 100, clock: 0 });
  rival.hp = 0;
  Object.assign(enemy, { x: 80, goalX: 80, y: 100, goalY: 100 });
  const hp = enemy.hp;
  const effects = Array.from({ length: 20 }, () => advance(run, 1 / 60)).flat();

  expect(enemy.hp).toBeLessThan(hp);
  expect(effects.filter(effect => effect.kind === "swing" && effect.squad === 0
    && effect.index === run.squads[0].soldiers.indexOf(barbarian))).toHaveLength(1);
});

test("a held foe out of reach yields at once to a foe already inside the blade, even inside the target hold", () => {
  const { run, unit, enemy, rival } = targetFixture();
  Object.assign(enemy, { x: unit.x - 80, goalX: unit.x - 80 });
  Object.assign(rival, { x: unit.x + 20, goalX: unit.x + 20 });
  Object.assign(unit, { quarry: enemy.id, lockUntil: 1e9 });
  advance(run, 1 / 30);
  expect(unit.quarry).toBe(rival.id);
});

test("a soldier held in place with his blow ready gives up the unreachable foe after half a second and fights another", () => {
  const { run, unit, enemy, rival } = targetFixture();
  const start = { x: unit.x, y: unit.y };
  Object.assign(enemy, { x: start.x + 60, goalX: start.x + 60, speed: 0 });
  Object.assign(rival, { x: start.x - 70, goalX: start.x - 70, speed: 0 });
  Object.assign(unit, { clock: 0, strikeAt: 0, quarry: enemy.id });
  const begun = run.time;
  let switchedAt: number | undefined;
  for (let step = 0; step < 45 && switchedAt === undefined; step++) {
    advance(run, 1 / 30);
    if (unit.quarry === rival.id) switchedAt = run.time; else Object.assign(unit, start);
  }
  expect(switchedAt! - begun).toBeGreaterThanOrEqual(.5);
  expect(switchedAt! - begun).toBeLessThan(.65);
  const hp = rival.hp;
  const quarries = new Set<number | undefined>();
  for (let step = 0; step < 60 && rival.hp === hp; step++) { advance(run, 1 / 30); quarries.add(unit.quarry); }
  expect(rival.hp).toBeLessThan(hp);
  expect(quarries.has(enemy.id)).toBe(false);
});
