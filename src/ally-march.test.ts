import { afterEach, beforeEach, expect, test } from "bun:test";
import { marchFixture, measureMarch } from "../scripts/ally-march-fixture";
import { advance, contactReach, inFieldPadding } from "./rules";
import { riverBank } from "./river";
import { distance, HEIGHT, setFieldSize, WIDTH } from "./geometry";

let previousField: { width: number; height: number };
beforeEach(() => { previousField = { width: WIDTH, height: HEIGHT }; });
afterEach(() => { setFieldSize(previousField.width, previousField.height); });

function settledTravel(measured: ReturnType<typeof measureMarch>) {
  const frames = measured.frames.slice(-100);
  return frames.slice(1).reduce((sum, frame, index) => sum + frame.soldiers.reduce((moved, unit, rank) => {
    const before = frames[index].soldiers[rank];
    return moved + Math.hypot(unit.x - before.x, unit.y - before.y);
  }, 0), 0);
}

test("spearmen and militia keep advancing to an enemy at the far edge", () => {
  const measured = measureMarch("far");
  expect(measured.summary.reachedEnemy).toBeGreaterThanOrEqual(6);
  for (const row of measured.rows) {
    expect(row.endX).toBeGreaterThan(row.startX + 100);
    expect(row.reversals).toBeLessThan(10);
  }
  expect(settledTravel(measured)).toBeLessThan(1);
});

test("a full melee contact ring settles instead of orbiting the target", () => {
  const measured = measureMarch("crowd");
  expect(measured.summary.reachedEnemy).toBeGreaterThanOrEqual(6);
  expect(measured.summary.reversals).toBeLessThan(50);
  expect(measured.summary.meanTravel).toBeLessThan(150);
  expect(settledTravel(measured)).toBeLessThan(1);
});

test("idle foot soldiers march to the field edge and hold a stable destination", () => {
  const measured = measureMarch("idle");
  expect(measured.summary.reversals).toBeLessThan(100);
  const first = measured.frames.at(-101)!.soldiers, last = measured.frames.at(-1)!.soldiers;
  for (let i = 0; i < last.length; i++) {
    const unit = last[i];
    expect(inFieldPadding(unit)).toBe(true);
    expect(Math.hypot(unit.x - first[i].x, unit.y - first[i].y)).toBeLessThan(.1);
    // The playable southern edge is the river bank, not the bottom of the canvas.
    const edgeGap = Math.min(unit.x - 18, measured.width - 18 - unit.x, unit.y - 26, riverBank() - 8 - unit.y);
    expect(edgeGap).toBeLessThanOrEqual(22.01);
  }
  expect(settledTravel(measured)).toBeLessThan(1);
});

test("a waiting rank advances when a front-rank soldier falls", () => {
  const { run, soldiers, enemy } = marchFixture("crowd");
  for (let step = 0; step < 600; step++) advance(run, 1 / 60);
  const front = [...soldiers].sort((a, b) => distance(a, enemy) - distance(b, enemy))[0];
  const waiting = soldiers.filter(unit => distance(unit, enemy) > contactReach(run, unit) + 2);
  const before = new Map(waiting.map(unit => [unit.id, distance(unit, enemy)]));
  expect(waiting.length).toBeGreaterThan(0);
  front.hp = 0; front.downUntil = 1e9;
  for (let step = 0; step < 120; step++) advance(run, 1 / 60);
  expect(waiting.some(unit => distance(unit, enemy) < before.get(unit.id)! - .5)).toBe(true);
});

test("settled troops resume pursuit and keep landing real attacks", () => {
  const { run, soldiers, enemy } = marchFixture("crowd");
  for (let step = 0; step < 600; step++) advance(run, 1 / 60);
  const before = new Map(soldiers.map(unit => [unit.id, { x: unit.x, y: unit.y }]));
  enemy.x += 90; enemy.goalX = enemy.x;
  for (const unit of soldiers) unit.clock = 0;
  const hp = enemy.hp;
  for (let step = 0; step < 600; step++) advance(run, 1 / 60);
  expect(soldiers.every(unit => distance(unit, before.get(unit.id)!) > 5)).toBe(true);
  expect(enemy.hp).toBeLessThan(hp);
});

test("troops at the north edge bypass unreachable targets and attack the foe on the field", () => {
  const { run, soldiers, enemy } = marchFixture("crowd", 370);
  run.time = 113.99;
  const line = [soldiers[0], soldiers[8]];
  soldiers.forEach(unit => {
    if (!line.includes(unit)) { unit.hp = 0; unit.downUntil = 1e9; }
  });
  line.forEach((unit, i) => Object.assign(unit, { x: 65 + i * 24, y: 26, clock: 0 }));
  Object.assign(enemy, { x: 65, y: -8, goalX: 65, goalY: -8 });
  const offField = { ...enemy, id: run.nextId++, x: 89, goalX: 89 };
  const reachable = { ...enemy, id: run.nextId++, x: 147, y: 140, goalX: 147, goalY: 140 };
  run.enemies.push(offField, reachable);
  const hp = reachable.hp;
  for (let step = 0; step < 105; step++) advance(run, 1 / 30);
  expect(line.every(unit => unit.x > 110 && inFieldPadding(unit))).toBe(true);
  expect(reachable.hp).toBeLessThan(hp);
});

test("the shipped 30 Hz simulation also settles all three marching cases", () => {
  for (const kind of ["far", "crowd", "idle"] as const) {
    const measured = measureMarch(kind, 780, 60, 30);
    expect(measured.summary.reversals).toBeLessThan(100);
    expect(settledTravel(measured)).toBeLessThan(1);
    if (kind === "far") {
      expect(measured.summary.reachedEnemy).toBeGreaterThanOrEqual(6);
      expect(measured.rows.every(unit => unit.endX > unit.startX + 100)).toBe(true);
    }
  }
});
