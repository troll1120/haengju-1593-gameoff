import { afterEach, beforeEach, expect, test } from "bun:test";
import { defendFixture } from "../scripts/ally-defend-fixture";
import { ALLY_SPACING, advance, contactReach } from "./rules";
import { CENTER, distance, fortRect, HEIGHT, routeDistance, setFieldSize, WIDTH } from "./geometry";

let field: { width: number; height: number };
beforeEach(() => { field = { width: WIDTH, height: HEIGHT }; });
afterEach(() => setFieldSize(field.width, field.height));

test.each(["gate", "wall", "keep"] as const)("nearby fighters leave a north skirmish to defend the %s", kind => {
  const { run, soldiers, south, north } = defendFixture(kind);
  const flanks = soldiers.map(unit => unit.flank);
  expect(soldiers.every(unit => unit.quarry === north.id)).toBe(true);
  advance(run, 1 / 30);
  const responding = soldiers.filter(unit => unit.quarry === south.id);
  const capacity = Math.floor(2 * Math.PI * Math.max(contactReach(run, responding[0]), ALLY_SPACING) / ALLY_SPACING);
  expect(responding).toHaveLength(capacity);
  expect(responding.length).toBeLessThan(soldiers.length);
  expect(soldiers.map(unit => unit.flank)).toEqual(flanks);
  const initialGap = Math.min(...responding.map(unit => distance(unit, south)));
  for (let i = 0; i < 900; i++) advance(run, 1 / 30);
  expect(Math.min(...responding.map(unit => distance(unit, south)))).toBeLessThan(contactReach(run, responding[0]) + 2);
  expect(Math.min(...responding.map(unit => distance(unit, south)))).toBeLessThan(initialGap - 80);
  expect(soldiers.some(unit => unit.quarry === north.id)).toBe(true);
  const hp = south.hp;
  for (const unit of soldiers) unit.clock = 0;
  for (let i = 0; i < 120; i++) advance(run, 1 / 30);
  expect(south.hp).toBeLessThan(hp);
});

test("the shortest walking routes receive the limited south defense slots", () => {
  const { run, soldiers, south } = defendFixture();
  const walk = fortRect(run.fort, 10);
  const order = [...soldiers].sort((a, b) => routeDistance(walk, a, south) - routeDistance(walk, b, south) || a.id - b.id);
  advance(run, 1 / 30);
  const responding = soldiers.filter(unit => unit.quarry === south.id);
  expect(responding.map(unit => unit.id).sort()).toEqual(order.slice(0, responding.length).map(unit => unit.id).sort());
});

test("a fighter already inside outranks outside reinforcements for the keep", () => {
  const { run, soldiers, south } = defendFixture("keep");
  const wall = fortRect(run.fort);
  for (const unit of soldiers.slice(0, 6)) Object.assign(unit, { x: CENTER.x, y: wall.bottom + 30 });
  const inside = soldiers[6];
  Object.assign(inside, { x: CENTER.x + 2, y: CENTER.y, emerging: false });
  advance(run, 1 / 30);
  expect(inside.quarry).toBe(south.id);
});

test("defenders replace losses and return to the same 8/8 home sides when danger ends", () => {
  const { run, soldiers, south } = defendFixture();
  const flanks = new Map(soldiers.map(unit => [unit.id, unit.flank]));
  advance(run, 1 / 30);
  const defenders = soldiers.filter(unit => unit.quarry === south.id);
  const fallen = defenders[0];
  fallen.hp = 0; fallen.downUntil = 1e9;
  advance(run, 1 / 30);
  expect(soldiers.filter(unit => unit.hp > 0 && unit.quarry === south.id)).toHaveLength(defenders.length);
  fallen.hp = fallen.maxHp;
  fallen.downUntil = 0;
  run.enemies = [];
  for (let i = 0; i < 1800; i++) advance(run, 1 / 30);
  expect(soldiers.filter(unit => unit.flank === "left")).toHaveLength(8);
  expect(soldiers.filter(unit => unit.flank === "right")).toHaveLength(8);
  for (const unit of soldiers) {
    expect(unit.flank).toBe(flanks.get(unit.id));
    expect(unit.quarry).toBeUndefined();
    expect(distance(unit, unit.march!)).toBeLessThan(.01);
    expect(unit.x < CENTER.x).toBe(unit.flank === "left");
  }
});

test("an approaching foe does not summon a castle defense before reaching attack range", () => {
  const { run, soldiers, south, north } = defendFixture();
  south.y += 100;
  advance(run, 1 / 30);
  expect(soldiers.every(unit => unit.quarry === north.id)).toBe(true);
});

test("interception does not release the whole army when the attacker steps away from the gate", () => {
  const { run, soldiers, south, north } = defendFixture();
  run.enemies = [south];
  advance(run, 1 / 30);
  const count = soldiers.filter(unit => unit.quarry === south.id).length;
  south.y += 35;
  advance(run, 1 / 30);
  expect(soldiers.filter(unit => unit.quarry === south.id)).toHaveLength(count);
  expect(soldiers.filter(unit => unit.quarry === undefined)).toHaveLength(soldiers.length - count);
  // Once it leaves the existing retaliation leash, ordinary nearest-target behavior resumes.
  south.y += 300;
  run.enemies.push(north);
  advance(run, 1 / 30);
  expect(south.castleThreat).toBe(false);
});

function crowdedThreat() {
  const { run, soldiers, south, north } = defendFixture("wall");
  north.hp = 0;
  const near = soldiers.slice(0, 7), far = soldiers.slice(7), wall = fortRect(run.fort);
  near.forEach((unit, k) => Object.assign(unit, { x: south.x - 45 + k * 15, y: south.y + 40, emerging: false, quarry: undefined }));
  far.forEach((unit, k) => Object.assign(unit, { x: wall.left + 10 + k * 15, y: wall.top - 60, emerging: false, quarry: undefined }));
  return { run, south, near, far };
}

test("soldiers beside a threat whose defense ring is full still join it instead of idling", () => {
  const { run, south, near } = crowdedThreat();
  const ring = Math.floor(2 * Math.PI * Math.max(contactReach(run, near[0]), ALLY_SPACING) / ALLY_SPACING);
  expect(near.length).toBeGreaterThan(ring);
  advance(run, 1 / 30);
  expect(near.map(unit => unit.quarry)).toEqual(near.map(() => south.id));
});

test("soldiers beyond 110 px of another wall's threat are not pulled off their post", () => {
  const { run, south, far } = crowdedThreat();
  expect(far.every(unit => distance(unit, south) > 110)).toBe(true);
  advance(run, 1 / 30);
  expect(far.filter(unit => unit.quarry !== undefined)).toEqual([]);
});
