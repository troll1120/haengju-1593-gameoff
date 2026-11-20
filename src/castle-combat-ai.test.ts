import { afterEach, expect, test } from "bun:test";
import { marchFixture } from "../scripts/ally-march-fixture";
import { CENTER, distance, fortRect, HEIGHT, setFieldSize, WIDTH } from "./geometry";
import { advance } from "./rules";

const field = { width: WIDTH, height: HEIGHT };
afterEach(() => setFieldSize(field.width, field.height));

function skirmish() {
  const { run, soldiers, enemy } = marchFixture("idle");
  const [ally, rival, ...rest] = soldiers;
  for (const unit of [rival, ...rest]) { unit.hp = 0; unit.downUntil = 1e9; }
  const wall = fortRect(run.fort);
  const at = { x: 250, y: wall.top - 100 };
  Object.assign(enemy, { ...at, goalX: at.x, goalY: wall.top, stun: 0, clock: 0, speed: 45 });
  Object.assign(ally, { x: at.x + 20, y: at.y, emerging: false });
  run.enemies = [enemy];
  return { run, ally, rival, enemy, at, wall };
}

test("an adjacent ally takes the enemy's blow without the enemy walking past it", () => {
  const { run, ally, enemy, at } = skirmish();
  run.shieldUntil = 0;
  const hp = ally.hp;
  for (let i = 0; i < 12 && ally.hp === hp; i++) advance(run, 1 / 30);
  expect(ally.hp).toBeLessThan(hp);
  expect(distance(enemy, at)).toBeLessThan(.01);
});

test("a closer ally intercepts even when the enemy had a fresh lock on a farther ally", () => {
  const { run, ally, rival, enemy, at } = skirmish();
  ally.hp = 0; ally.downUntil = 1e9;
  Object.assign(rival, { x: at.x - 40, y: at.y, hp: rival.maxHp, downUntil: 0, emerging: false });
  advance(run, 1 / 30);
  ally.hp = ally.maxHp; ally.downUntil = 0;
  const attack = advance(run, 1 / 30).find(effect => effect.kind === "lunge" && effect.target === enemy.id);
  expect(attack).toMatchObject({ x: ally.x, y: ally.y });
});

test.each(["basic", "special"] as const)("%s enemies walk onto the field before engaging", kind => {
  const { run, ally, enemy, wall } = skirmish();
  Object.assign(enemy, { x: -5, goalX: wall.left, boss: kind === "special", pattern: "fire", skillClock: 0 });
  ally.x = 18;
  const effects = advance(run, 1 / 30);
  expect(enemy.x).toBeGreaterThan(-5);
  expect(effects.some(effect => effect.target === enemy.id && (effect.kind === "lunge" || effect.kind === "telegraph"))).toBe(false);
});

test("an ally does not wind up against a nearby foe outside the visible field", () => {
  const { run, ally, enemy } = skirmish();
  ally.x = 8; ally.clock = 0;
  Object.assign(enemy, { x: -5, speed: 0, stun: 1e9 });
  expect(advance(run, 1 / 30).some(effect => effect.kind === "windup" && effect.index === 0)).toBe(false);
});

test.each(["left", "right", "top", "bottom"] as const)(
  "on a 370px map a gunner clears the 40px %s edge band before firing", side => {
    const { run, ally, enemy, wall } = skirmish();
    setFieldSize(370, 844);
    const point = side === "left" ? { x: 35, y: CENTER.y }
      : side === "right" ? { x: WIDTH - 35, y: CENTER.y }
      : side === "top" ? { x: CENTER.x, y: 35 }
      : { x: CENTER.x, y: HEIGHT - 35 };
    const at = side === "left" ? { x: 75, y: CENTER.y }
      : side === "right" ? { x: WIDTH - 75, y: CENTER.y }
      : side === "top" ? { x: CENTER.x, y: 75 }
      : { x: CENTER.x, y: CENTER.y + 90 };
    Object.assign(ally, at);
    Object.assign(enemy, point, { kind: "teppo", goalX: CENTER.x, goalY: wall.top, speed: 90 });
    const edge = () => Math.min(enemy.x, WIDTH - enemy.x, enemy.y, HEIGHT - enemy.y);
    const first = advance(run, 1 / 30);
    expect(first.some(effect => effect.kind === "lunge" && effect.target === enemy.id)).toBe(false);
    for (let step = 0; step < 180; step++) {
      if (advance(run, 1 / 30).some(effect => effect.kind === "lunge" && effect.target === enemy.id)) {
        expect(edge()).toBeGreaterThan(40);
        return;
      }
    }
    expect(enemy.prey).not.toBeNull();
    expect(enemy.strikeAt).toBeGreaterThan(run.time);
  },
);

test("an in-range hit cannot knock a gunner back into the 40px edge band", () => {
  const { run, ally, enemy, at } = skirmish();
  setFieldSize(370, 844);
  Object.assign(enemy, { kind: "teppo", x: 41, stun: 1e9 });
  Object.assign(ally, { x: 80, y: at.y });
  run.shots.push({ id: run.nextId++, kind: "arrow", x: 45, y: enemy.y, toX: enemy.x, toY: enemy.y,
    speed: 1000, target: enemy.id, prey: null, damage: 1, critical: false, by: "weapon", splash: 0, pierce: 0, from: 0 });
  const hp = enemy.hp;
  advance(run, 1 / 30);
  expect(enemy.hp).toBeLessThan(hp);
  expect(enemy.x).toBeGreaterThan(40);
});

test("an enemy resumes the fort route when its prey runs beyond the pursuit origin", () => {
  const { run, ally, enemy, at } = skirmish();
  enemy.clock = 1e9;
  ally.x = at.x + 42;
  advance(run, 1 / 30);
  expect(enemy.x).toBeGreaterThan(at.x);
  enemy.x = at.x + 85;
  ally.x = at.x + 112;
  advance(run, 1 / 30);
  expect(enemy.y).toBeGreaterThan(at.y);
  expect(enemy.prey).toBeNull();
  advance(run, 1 / 30);
  expect(enemy.prey).toBeNull();
});

test("a melee ally abandons a quarry outside the fort leash and moves back to its post", () => {
  const { run, ally, enemy, wall } = skirmish();
  Object.assign(ally, { x: wall.right + 190, y: wall.top, flank: "right", march: { x: wall.right + 45, y: wall.top } });
  Object.assign(enemy, { x: wall.right + 225, y: wall.top, stun: 1e9 });
  ally.quarry = enemy.id;
  const before = ally.x;
  advance(run, 1 / 30);
  expect(ally.x).toBeLessThan(before);
  expect(ally.quarry).toBeUndefined();
});

test("an enemy at the wall turns on an ally 90px away instead of striking the wall", () => {
  const { run, ally, enemy, wall } = skirmish();
  run.shieldUntil = 0;
  Object.assign(enemy, { x: 250, y: wall.top - 3, goalX: 250, goalY: wall.top, clock: 0 });
  Object.assign(ally, { x: 340, y: wall.top - 3 });
  const walls = { ...run.walls };
  advance(run, 1 / 30);
  expect(enemy.prey).toEqual([run.squads[0].id, 0]);
  expect(run.walls).toEqual(walls);
});

function breachedFort() {
  const { run, enemy, ally, wall } = skirmish();
  run.shieldUntil = 0;
  run.walls["우"] = 0;
  ally.hp = 0; ally.downUntil = 1e9;
  Object.assign(enemy, { x: wall.left - 25, y: CENTER.y, goalX: wall.left, goalY: CENTER.y, speed: 180 });
  return { run, enemy, ally };
}

test.each(["melee", "ranged", "ladder", "commander"] as const)(
  "%s attackers use the breach and damage the keep while intact walls stay untouched", kind => {
    const { run, enemy } = breachedFort();
    if (kind === "ranged") enemy.kind = "teppo";
    if (kind === "ladder") enemy.ladder = true;
    if (kind === "commander") { enemy.boss = true; enemy.skillClock = 0; }
    const intact = { ...run.walls }, keep = run.base;
    for (let i = 0; i < 360 && run.base === keep; i++) advance(run, 1 / 30);
    expect(run.walls).toEqual(intact);
    expect(enemy.breach).toBe("우");
    // It strikes from the keep building's side: 20 px half-width plus its 10 px body and a 2 px touch.
    expect(distance(enemy, CENTER)).toBeLessThanOrEqual(32);
    expect(run.base).toBeLessThan(keep);
  },
);

test("an enemy fights an ally blocking its breach route before damaging the keep", () => {
  const { run, enemy, ally } = breachedFort();
  Object.assign(ally, { x: enemy.x - 20, y: enemy.y, hp: ally.maxHp, downUntil: 0 });
  const keep = run.base;
  const opening = advance(run, 1 / 30);
  expect(opening.find(effect => effect.kind === "lunge" && effect.target === enemy.id)).toMatchObject({ x: ally.x, y: ally.y });
  for (let i = 0; i < 12 && ally.hp > 0; i++) advance(run, 1 / 30);
  expect(ally.hp).toBeLessThan(ally.maxHp);
  expect(run.base).toBe(keep);
});
