import { expect, test } from "bun:test";
import { advance, ALLY_SPACING, buyRecruit, choose, createRun, recruit, units } from "./rules";
import type { Enemy, General } from "./rules";
import { CENTER, contains, crosses, distance, fortRect, guardPoint, route, routeDistance, wallPosts } from "./geometry";
import { battleLayout, retainRoster } from "./sprite-layout";

function arena(general: General = "황진") {
  const run = createRun(7, general);
  run.enemies = []; run.xp = run.spawnBudget = -1e9;
  run.nextElite = run.nextBoss = run.nextWave = run.nextRiverWave = 1e9;
  run.commandClock = run.arrowClock = run.hwachaClock = 1e9;
  for (const unit of units(run.squads[0])) unit.clock = 1e9;
  return run;
}
function enemy(at: { x: number; y: number }, id: number): Enemy {
  return { id, ...at, kind: "yari", hp: 1e9, maxHp: 1e9, speed: 0, direction: "위", elite: false, boss: false,
    goalX: at.x, goalY: at.y, clock: 1e9, strikeAt: 0, prey: null, stun: 0, burn: 0, burnClock: 0, skillClock: 1e9, casting: 0, casts: 0 };
}

test("a walker already on a corner advances to the next corner instead of selecting itself", () => {
  const block = fortRect(0, 10), from = { x: block.left, y: block.top }, to = { x: block.right + 30, y: CENTER.y };
  expect(crosses(block, from, to)).toBe(true);
  const next = route(block, from, to);
  expect(distance(from, next)).toBeGreaterThan(1);
  expect(crosses(block, from, next)).toBe(false);
  expect(Number.isFinite(routeDistance(block, from, to))).toBe(true);
});

test("north-side soldiers stay outside, keep their quarry and continue to the next nearby foe", () => {
  const run = arena(), unit = run.squads[0].soldiers[0], wall = fortRect(0);
  Object.assign(unit, guardPoint(0, "위", 30), { emerging: false });
  const first = enemy({ x: unit.x + 45, y: unit.y - 10 }, 101);
  const next = enemy({ x: unit.x - 30, y: unit.y - 10 }, 102);
  run.enemies = [first]; advance(run, .05);
  run.enemies.push(next);
  for (let i = 0; i < 15; i++) {
    advance(run, .05);
    expect(unit.quarry).toBe(first.id);
    expect(contains(wall, unit)).toBe(false);
  }
  first.hp = 0;
  advance(run, .05);
  expect(unit.quarry).toBe(next.id);
  expect(unit.y).toBeLessThan(wall.top);
  run.enemies = [];
  for (let i = 0; i < 30; i++) advance(run, .05);
  expect(unit.y).toBeCloseTo(wall.top - 26);
});

test("wall clearance correction pushes an outside soldier to the nearest edge instead of the south gate", () => {
  const run = arena(), unit = run.squads[0].soldiers[0], wall = fortRect(0);
  Object.assign(unit, { x: CENTER.x, y: wall.top - 7.999999, emerging: false });
  advance(run, .05);
  expect(unit.y).toBeLessThanOrEqual(wall.top - 8);
  expect(unit.x).toBe(CENTER.x);
});

test("a melee counter-push cannot put a fighter outside the playable field padding", () => {
  const run = arena(), unit = run.squads[0].soldiers[0];
  Object.assign(unit, { x: 18, y: CENTER.y, emerging: false, strikeAt: .0001, aim: 101 });
  const boss = enemy({ x: 32, y: CENTER.y }, 101); boss.boss = true; boss.bossArt = "wakizaka";
  run.enemies = [boss];
  advance(run, .001);
  expect(boss.hp).toBeLessThan(boss.maxHp);
  expect(unit.x).toBeGreaterThanOrEqual(18);
});

test("a soldier chooses a nearby enemy before a shorter line through the castle", () => {
  const run = arena(), unit = run.squads[0].soldiers[0], wall = fortRect(0);
  Object.assign(unit, { x: wall.left - 12, y: CENTER.y, emerging: false });
  const across = enemy({ x: wall.right + 12, y: CENTER.y }, 101);
  const local = enemy({ x: unit.x, y: unit.y - 105 }, 102);
  run.enemies = [across, local]; advance(run, .05);
  expect(unit.quarry).toBe(local.id);
  expect(routeDistance(fortRect(0, 10), unit, across)).toBeGreaterThan(distance(unit, across));
});

test.each(["outside", "inside"] as const)("melee releases a quarry that moves %s the permitted battle band", location => {
  const run = arena(), unit = run.squads[0].soldiers[0], wall = fortRect(0);
  Object.assign(unit, guardPoint(0, "위", 32), { emerging: false });
  const first = enemy({ x: unit.x + 45, y: unit.y - 10 }, 101), next = enemy({ x: unit.x - 30, y: unit.y - 10 }, 102);
  run.enemies = [first]; advance(run, .05);
  expect(unit.quarry).toBe(first.id);
  run.enemies.push(next);
  Object.assign(first, location === "inside" ? CENTER : { x: CENTER.x, y: wall.top - 131 });
  advance(run, .05);
  expect(unit.quarry).toBe(next.id);
});

test.each([["권율", 28], ["김시민", 42], ["곽재우", 64], ["황진", 42]] as const)("%s engages at 85px instead of returning home and cannot redeploy while locked", (general, gap) => {
  const run = arena(general), squad = run.squads[0], home = guardPoint(0, "위", gap);
  squad.post = "위"; Object.assign(squad, { x: home.x, y: home.y - 30 }); squad.soldiers = [];
  const foe = enemy({ x: squad.x, y: squad.y - 85 }, 101);
  run.enemies = [foe]; run.commandClock = 0;
  const before = distance(squad, foe);
  advance(run, .05);
  expect(distance(squad, foe)).toBeLessThan(before);
  Object.assign(foe, { x: squad.x + 40, y: squad.y });
  squad.aim = foe.id; run.commandClock = 0;
  run.assaultOrder.fill("아래");
  const redeploys = run.metrics.redeploys;
  advance(run, .05);
  expect(squad.post).toBe("위");
  expect(run.metrics.redeploys).toBe(redeploys);
});

test("nearby melee targets never make soldiers back away to preserve artificial spacing", () => {
  for (const gap of [8, 16, 24, 45, 85, 105]) {
    const run = arena(), unit = run.squads[0].soldiers[0];
    Object.assign(unit, guardPoint(0, "위", 32), { emerging: false });
    const foe = enemy({ x: unit.x + gap, y: unit.y }, 101);
    run.enemies = [foe];
    for (let tick = 0; tick < 20; tick++) {
      const before = distance(unit, foe); advance(run, .05);
      expect(distance(unit, foe)).toBeLessThanOrEqual(before + .000001);
    }
  }
});

test("an out-of-radius general lock cannot hide another eligible nearby enemy", () => {
  const run = arena(), squad = run.squads[0], home = guardPoint(0, "위", 42);
  squad.post = "위"; squad.soldiers = [];
  Object.assign(squad, { x: home.x, y: home.y - 110 });
  const old = enemy({ x: home.x, y: home.y - 130 }, 101);
  const local = enemy({ x: home.x + 30, y: home.y - 115 }, 102);
  run.enemies = [old, local]; squad.aim = old.id; run.commandClock = 0;
  const before = distance(squad, local);
  advance(run, .05);
  expect(distance(squad, local)).toBeLessThan(before);
});

test("a nearby arrival updates engagement between quarter-second deployment decisions", () => {
  const run = arena(), squad = run.squads[0];
  squad.post = "위"; run.assaultOrder.fill("위"); run.commandClock = 0;
  advance(run, .05);
  const home = { x: squad.targetX, y: squad.targetY };
  Object.assign(squad, { x: home.x, y: home.y - 30 });
  const local = enemy({ x: squad.x, y: squad.y - 85 }, 101);
  run.enemies = [local]; run.commandClock = .2;
  const before = distance(squad, local);
  advance(run, .05);
  expect(distance(squad, local)).toBeLessThan(before);
});

test("the last intruder dying clears the interior station and walks the defender out through the gate", () => {
  const run = arena(), squad = run.squads[0];
  Object.assign(squad, CENTER); squad.targetX = CENTER.x; squad.targetY = CENTER.y;
  const intruder = enemy(CENTER, 101); intruder.hp = 1; intruder.breach = "위";
  run.enemies = [intruder]; squad.strikeAt = .0001; squad.aim = intruder.id;
  const before = { x: squad.x, y: squad.y };
  advance(run, .001);
  expect(intruder.hp).toBeLessThanOrEqual(0);
  expect(distance(before, squad)).toBeLessThanOrEqual(140 * .001);
  expect(contains(fortRect(0), { x: squad.targetX, y: squad.targetY })).toBe(false);
  expect(squad.targetX).toBe(CENTER.x);
  for (let i = 0; i < 80; i++) advance(run, .05);
  expect(contains(fortRect(0), squad)).toBe(false);
});

test("an intruder already in melee contact does not make his defender walk through and away", () => {
  const run = arena(), squad = run.squads[0];
  Object.assign(squad, CENTER); squad.soldiers = []; run.commandClock = 0;
  const intruder = enemy({ x: CENTER.x, y: CENTER.y - 5 }, 101); intruder.breach = "위";
  run.enemies = [intruder];
  const before = distance(squad, intruder);
  advance(run, .05);
  expect(distance(squad, intruder)).toBeLessThanOrEqual(before);
});

test("an intruder cannot pull an engaged defender away from his valid nearby opponent", () => {
  const run = arena(), squad = run.squads[0];
  squad.post = "위"; squad.soldiers = []; run.commandClock = 0;
  advance(run, .05);
  Object.assign(squad, { x: squad.homeX, y: squad.homeY - 30 });
  const local = enemy({ x: squad.x, y: squad.y - 5 }, 101), intruder = enemy(CENTER, 102);
  intruder.breach = "위"; run.enemies = [local, intruder]; squad.aim = local.id; run.commandClock = .2;
  const before = distance(squad, local);
  advance(run, .05);
  expect(distance(squad, local)).toBeLessThanOrEqual(before);
});

for (const general of ["권율", "김시민", "곽재우", "황진"] as const) {
  for (const source of ["card", "chest", "gold"] as const) test(`${general} ${source} recruitment preserves every existing fighter and position`, () => {
    const run = arena(general), squad = run.squads[0], kind = squad.soldiers[0].kind;
    if (kind === "general") throw new Error("A starting soldier must have a soldier class");
    Object.assign(squad.soldiers[0], guardPoint(0, "위", 32), { emerging: false });
    const old = squad.soldiers[0];
    old.strikeAt = 1e9;
    if (kind === "archer" || kind === "hwacha") { old.perch = 0; Object.assign(old, wallPosts(0)[0]); }
    const existing = [...squad.soldiers], before = existing.map(({ id, x, y, tier }) => ({ id, x, y, tier }));
    if (source === "card") { run.phase = "choice"; run.offers = [`recruit-${kind}`]; choose(run, `recruit-${kind}`); }
    else if (source === "chest") {
      run.roulette = { remaining: 0, options: ["recruit"], soldier: kind, evolution: null };
      advance(run, .001);
    } else { run.gold = 1000; buyRecruit(run, kind); buyRecruit(run, kind); }
    expect(squad.soldiers).toHaveLength(3);
    expect(squad.soldiers[0]).toBe(existing[0]);
    expect(existing.map(({ id, x, y, tier }) => ({ id, x, y, tier }))).toEqual(before);
    expect(new Set(squad.soldiers.map(unit => unit.id)).size).toBe(3);
    // A step may already have split the two coincident recruits half a spacing each way.
    expect(squad.soldiers.slice(1).every(unit => distance(unit, CENTER) <= ALLY_SPACING / 2 + .2 && unit.emerging)).toBe(true);
  });
}

test("render roster reconciliation retains animation objects through recruitment and tier changes", () => {
  const run = arena(), squad = run.squads[0], old = { frame: 7, faceLeft: true };
  const previous = new Map([[squad.soldiers[0].id, old]]);
  recruit(run, "spearman", 0); recruit(run, "spearman", 0);
  squad.soldiers[0].tier = 2;
  let created = 0;
  const roster = retainRoster(squad.soldiers, previous, () => { created++; return { frame: 0, faceLeft: false }; });
  expect(roster[0]).toBe(old); expect(created).toBe(2);
});

test("boss displacement grows and clears by at most six pixels per rendered frame", () => {
  const run = arena(), unit = run.squads[0], boss = enemy({ x: 195, y: 180 }, 101);
  Object.assign(unit, { x: 195, y: 196 }); boss.boss = true; run.enemies = [boss]; unit.soldiers = [];
  let previous = new Map([[unit, { x: unit.x, y: unit.y }]]);
  for (let i = 0; i < 80; i++) {
    if (i === 40) run.enemies = [];
    const layout = battleLayout(run, previous), at = layout.get(unit) ?? unit;
    expect(distance(previous.get(unit) ?? unit, at)).toBeLessThanOrEqual(6.000001);
    previous = new Map([[unit, { ...at }]]);
  }
  expect(distance(previous.get(unit) ?? unit, unit)).toBeLessThan(.001);
});
