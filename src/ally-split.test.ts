import { afterEach, beforeEach, expect, test } from "bun:test";
import { marchFixture, measureMarch } from "../scripts/ally-march-fixture";
import { addBphProfile } from "./bph-combat";
import { advance, ALLY_SPACING, recruit } from "./rules";
import { CENTER, contains, distance, fortRect, HEIGHT, setFieldSize, WIDTH } from "./geometry";
import { riverBank } from "./river";

let field: { width: number; height: number };
beforeEach(() => { field = { width: WIDTH, height: HEIGHT }; });
afterEach(() => setFieldSize(field.width, field.height));

test("idle infantry finishes evenly on both edges without late movement", () => {
  const measured = measureMarch("idle");
  expect(measured.rows.filter(row => row.endX < measured.width / 2)).toHaveLength(8);
  expect(measured.rows.filter(row => row.endX > measured.width / 2)).toHaveLength(8);
  expect(measured.summary.reversals).toBeLessThan(100);
  const last = measured.frames.at(-1)!, earlier = measured.frames.at(-101)!;
  expect(last.soldiers.map(unit => [unit.x, unit.y])).toEqual(earlier.soldiers.map(unit => [unit.x, unit.y]));
});

test("infantry receives alternating flanks at birth and recruitment before the first tick", () => {
  const { run, soldiers } = marchFixture("idle");
  expect(soldiers.map(unit => unit.flank)).toEqual(Array.from({ length: 16 }, (_, i) => i % 2 ? "right" : "left"));
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 3, foil: false, discovered: false },
    { packId: "Pack1_Basic", position: { x: WIDTH - 30, y: CENTER.y } });
  expect(soldiers.slice(-3).map(unit => unit.flank)).toEqual(["left", "right", "left"]);
  run.meta.caps!.troops = 48;
  expect(recruit(run, "monk")).toHaveLength(1);
  expect(soldiers.at(-1)!.flank).toBe("right");
  expect(recruit(run, "archer")).toHaveLength(1);
  expect(soldiers.at(-1)!.flank).toBeUndefined();
  // A fighter that became ranged no longer counts, even if its old idle flank is still present.
  soldiers[1].kind = "archer";
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  expect(soldiers.at(-1)!.flank).toBe("right");
});

test("both populated sides allow the nearest foe and retaliation across assigned flanks", () => {
  const { run, soldiers, enemy } = marchFixture("far");
  const x = fortRect(run.fort).left - 190;
  const left = { ...enemy, id: run.nextId++, x, goalX: x };
  run.enemies.push(left);
  for (let i = 0; i < 1800; i++) advance(run, 1 / 30);
  expect(soldiers.filter(unit => unit.flank === "left")).toHaveLength(8);
  expect(soldiers.filter(unit => unit.flank === "right")).toHaveLength(8);
  // The existing contact-ring cap can spread fighters to both foes, independently of their idle flank.
  expect(soldiers.some(unit => unit.flank === "left" && unit.quarry === enemy.id && unit.x > CENTER.x)).toBe(true);
  expect(soldiers.some(unit => unit.flank === "right" && unit.quarry === left.id && unit.x < CENTER.x)).toBe(true);
  // A live revenge target on the opposite flank still takes precedence over the nearer foe.
  left.x = left.goalX = fortRect(run.fort).left - 100;
  enemy.x = enemy.goalX = fortRect(run.fort).right + 100;
  for (const unit of soldiers) {
    unit.revenge = unit.flank === "left" ? enemy.id : left.id;
    unit.quarry = unit.revenge; unit.lockUntil = 1e9;
  }
  advance(run, 1 / 30);
  for (const unit of soldiers) expect(unit.quarry).toBe(unit.flank === "left" ? enemy.id : left.id);
});

test("support continues when a home-side foe appears and idle soldiers return to their own posts", () => {
  const { run, soldiers, enemy } = marchFixture("far");
  for (let i = 0; i < 600; i++) advance(run, 1 / 30);
  expect(soldiers.every(unit => unit.quarry === enemy.id)).toBe(true);
  const before = new Map(soldiers.map(unit => [unit.id, unit.flank]));
  const x = fortRect(run.fort).left - 190;
  const left = { ...enemy, id: run.nextId++, x, goalX: x };
  run.enemies.push(left);
  advance(run, 1 / 30);
  for (const unit of soldiers) {
    expect(unit.flank).toBe(before.get(unit.id));
    expect(unit.quarry).toBe(enemy.id);
  }
  run.enemies = [];
  for (let i = 0; i < 1800; i++) {
    advance(run, 1 / 30);
    // The idle phase supplies no live targets. Timed encounters have their own director test.
    run.enemies = run.enemies.filter(enemy => !enemy.miniboss);
  }
  for (const unit of soldiers) {
    expect(unit.flank).toBe(before.get(unit.id));
    expect(unit.quarry).toBeUndefined();
    expect(unit.x < CENTER.x).toBe(unit.flank === "left");
    expect(distance(unit, unit.march!)).toBeLessThan(.01);
  }
});

test("losses move only the excess survivors; recruits and revived soldiers restore a one-body balance", () => {
  const { run, soldiers } = marchFixture("idle");
  advance(run, 1 / 30);
  const dead = soldiers.filter(unit => unit.flank === "left").slice(0, 5);
  for (const unit of dead) { unit.hp = 0; unit.downUntil = 1e9; }
  const before = new Map(soldiers.filter(unit => unit.hp > 0).map(unit => [unit.id, unit.flank]));
  advance(run, 1 / 30);
  expect(soldiers.filter(unit => unit.hp > 0 && unit.flank !== before.get(unit.id))).toHaveLength(2);
  const assertBalance = () => {
    const alive = soldiers.filter(unit => unit.hp > 0);
    const left = alive.filter(unit => unit.flank === "left").length;
    expect(Math.abs(left - (alive.length - left))).toBeLessThanOrEqual(1);
    expect(new Set(alive.map(unit => `${unit.march!.x},${unit.march!.y}`)).size).toBe(alive.length);
  };
  assertBalance();
  const retained = new Map(soldiers.filter(unit => unit.hp > 0).map(unit => [unit.id, { flank: unit.flank, march: unit.march }]));
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 7, foil: false, discovered: false }, { packId: "Pack1_Basic" });
  advance(run, 1 / 30);
  assertBalance();
  for (const unit of soldiers) if (retained.has(unit.id)) {
    expect(unit.flank).toBe(retained.get(unit.id)!.flank);
    expect(unit.march).toEqual(retained.get(unit.id)!.march);
  }
  const beforeRevive = new Map(soldiers.filter(unit => unit.hp > 0).map(unit => [unit.id, { flank: unit.flank, march: unit.march }]));
  for (const unit of dead) unit.downUntil = 0;
  advance(run, 1 / 30);
  assertBalance();
  for (const unit of soldiers) if (beforeRevive.has(unit.id)) {
    expect(unit.flank).toBe(beforeRevive.get(unit.id)!.flank);
    expect(unit.march).toEqual(beforeRevive.get(unit.id)!.march);
  }
  const stable = new Map(soldiers.map(unit => [unit.id, { flank: unit.flank, march: unit.march }]));
  soldiers.reverse();
  for (let i = 0; i < 120; i++) advance(run, 1 / 30);
  for (const unit of soldiers) {
    expect(unit.flank).toBe(stable.get(unit.id)!.flank);
    expect(unit.march).toEqual(stable.get(unit.id)!.march);
  }
});

test("an enemy wavering inside the centre band retains its side until it fully crosses", () => {
  const { run, enemy } = marchFixture("far");
  enemy.x = CENTER.x + 1; enemy.y = 200;
  advance(run, 1 / 30);
  expect(enemy.defenseSide).toBe("right");
  for (let i = 0; i < 120; i++) {
    enemy.x = CENTER.x + (i % 2 ? -1 : 1);
    advance(run, 1 / 30);
    expect(enemy.defenseSide).toBe("right");
  }
  enemy.x = CENTER.x - 12;
  advance(run, 1 / 30);
  expect(enemy.defenseSide).toBe("left");
});

test("an enemy parked on the centre line does not cause repeated direction changes", () => {
  const measured = measureMarch("center");
  expect(measured.summary.reversals).toBeLessThan(100);
  // Combat may mix flanks around the centre foe; each fighter still keeps a real target and settles.
  for (const row of measured.rows) expect(row.quarry).toBeDefined();
  const last = measured.frames.at(-1)!, earlier = measured.frames.at(-101)!;
  expect(last.soldiers.map(unit => [unit.x, unit.y])).toEqual(earlier.soldiers.map(unit => [unit.x, unit.y]));
});

test.each(["gate", "wall", "top"] as const)("recruits clear the %s without getting pinned in overlapping pairs", kind => {
  const { run, soldiers } = marchFixture("idle", 370);
  const wall = fortRect(run.fort);
  for (const [i, unit] of soldiers.entries()) Object.assign(unit, kind === "gate"
    ? { x: CENTER.x, y: CENTER.y, emerging: true }
    : kind === "top" ? { x: 40 + i * 22, y: 26, emerging: false }
    : { x: wall.right + 10 + i % 2 * 12, y: CENTER.y - 70 + Math.floor(i / 2) * 22, emerging: false });
  for (let i = 0; i < 900; i++) advance(run, 1 / 30);
  for (const [i, unit] of soldiers.entries()) {
    expect(unit.emerging).toBe(false);
    expect(contains(wall, unit)).toBe(false);
    expect(unit.x < CENTER.x).toBe(unit.flank === "left");
    for (const other of soldiers.slice(i + 1)) expect(distance(unit, other)).toBeGreaterThanOrEqual(ALLY_SPACING - .01);
  }
});

test.each([370, 780])("bank recruits reach their own posts even when arrival order reverses at an edge (%s px)", width => {
  const { run, soldiers } = marchFixture("idle", width);
  soldiers.forEach((unit, i) => Object.assign(unit, { x: 40 + i * 22, y: riverBank() - 8, emerging: false }));
  advance(run, 1 / 30);
  const posts = new Map(soldiers.map(unit => [unit.id, { ...unit.march! }]));
  for (let i = 1; i < 900; i++) advance(run, 1 / 30);
  for (const [i, unit] of soldiers.entries()) {
    expect(unit.march).toEqual(posts.get(unit.id));
    expect(distance(unit, unit.march!)).toBeLessThan(.01);
    expect(unit.x < CENTER.x).toBe(unit.flank === "left");
    for (const other of soldiers.slice(i + 1)) expect(distance(unit, other)).toBeGreaterThanOrEqual(ALLY_SPACING - .01);
  }
});
