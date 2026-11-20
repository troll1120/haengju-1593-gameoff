import { expect, test } from "bun:test";
import * as rules from "./rules";
import { advance, ARMS, ASSAULT_PERIOD, ASSAULT_WARNING, assaultSide, ATTACK_INTERVALS, BALANCE, cardText, CASTS, choose, chooseGeneral, covers, createRun,
  directionWeights, drawCards, DURATION, enterEndless, fielded, FINAL_BOSS_AT, GENERAL_TIMES, levelSeconds, might, pressure, recruit, ROULETTE_SECONDS, ROULETTE_TICKS, PRIZE_TIERS,
  rouletteIndex, skillAim, ENEMY_SPACING, soldier, spawnRate, SQUAD_MARGIN, SQUAD_SPEED, strength, STYLES, targetDensity, toughness, units, upgradeClass, upgradeCost, useSkill } from "./rules";
import type { Bonus, CardId, Effect, Enemy, General, Run, Skill, Squad } from "./rules";
import { CENTER, contains, crosses, distance, fortRect, gapToRect, guardPoint, HEIGHT, route, setFieldHeight, sideOf, SIDES, wallPoint, weaponSlots, WIDTH } from "./geometry";
import type { Point } from "./geometry";
import { play, POLICIES } from "./bots";
import { bonusesOf, freshMeta, TREE_NODES } from "./meta";

const STAGE3_FASTEST_ENEMY = 5.5;
function fight(run: Run, seconds: number): Effect[] {
  const effects: Effect[] = [];
  for (let step = 0; step < Math.round(seconds * 20); step++) effects.push(...advance(run, .05));
  return effects;
}
const createdReel = (run: Run) => run.roulette;
function place(squad: Squad, at: Point): void {
  squad.x = squad.targetX = at.x; squad.y = squad.targetY = at.y;
  for (const unit of squad.soldiers) { unit.x = at.x; unit.y = at.y; }
}
function bench(run: Run, keep: General[] = ["권율"]): void {
  for (const general of ["김시민", "곽재우"] as const) if (!run.squads.some(squad => squad.general === general)) {
    run.phase = "general"; run.generalOffers = [general]; chooseGeneral(run, general);
  }
  for (const squad of run.squads) if (!keep.includes(squad.general)) { squad.state = "down"; squad.downUntil = 1e9; squad.hp = 0; squad.soldiers = []; }
  run.xp = -1e9;
}
function disarm(run: Run): void {
  run.arrowClock = run.hwachaClock = 1e9;
  for (const squad of run.squads) for (const unit of units(squad)) unit.clock = 1e9;
}
function foe(run: Run, at: Point, extra: Partial<Enemy> = {}): Enemy {
  const goal = wallPoint(fortRect(run.fort, 12), at);
  const enemy: Enemy = { id: run.nextId++, kind: "yari", direction: "위", x: at.x, y: at.y, hp: 1e6, maxHp: 1e6, speed: 0, elite: false, boss: false,
    goalX: goal.x, goalY: goal.y, clock: 0, strikeAt: 0, prey: null, stun: 0, burn: 0, burnClock: 0, skillClock: 1e9, casting: 0, casts: 0, ...extra };
  run.enemies.push(enemy);
  return enemy;
}
function sterile(run: Run): void {
  run.spawnBudget = -1e9; run.enemies = [];
  for (let i = 0; i <= Math.floor(200 * BALANCE.fieldFloor); i++) foe(run, { x: -420 + i % 6 * 170, y: -600 - i * 8 }, { hp: 1e12, maxHp: 1e12 });
}
function stage(seed = 42, keep: General[] = ["권율"]): { run: Run; squad: Squad; post: Point } {
  const run = createRun(seed), post = guardPoint(run.fort, "위", BALANCE.guardGap);
  bench(run, keep);
  run.squads[0].soldiers = ["spearman", "archer", "hwacha"].map(kind => soldier(kind as rules.SoldierKind, 1, CENTER));
  run.arrow = run.hwacha = 1;
  sterile(run); disarm(run); run.commandClock = 1e9;
  place(run.squads[0], post);
  return { run, squad: run.squads[0], post };
}

test("a seed recreates the same weather, commander and initial state", () => {
  expect(createRun(1593)).toEqual(createRun(1593));
  expect(new Set(Array.from({ length: 100 }, (_, i) => createRun(i + 1).weather)).size).toBeGreaterThan(1);
});
test("nine-second first level-up keeps combat running and offers three different cards", () => {
  const run = createRun(42);
  while (run.phase === "playing") advance(run, .05);
  expect(run.time).toBeGreaterThanOrEqual(8.9); expect(run.time).toBeLessThanOrEqual(9.1);
  expect(run.phase).toBe("choice");
  expect(new Set(run.offers).size).toBe(3);
  const time = run.time;
  advance(run, 0.1);
  expect(run.time).toBeCloseTo(time + .1);
  expect(run.offers.some(card => card.startsWith("hero-"))).toBe(true);
  choose(run, run.offers[0]);
  expect(run).toHaveProperty("phase", "playing");
});

test("a treasure waits in its queue until the open level-up hand is answered", () => {
  const run = createRun(42);
  run.phase = "choice"; run.offers = ["arrow"]; run.xp = -1e9;
  run.chests.push({ id: 9000, ...CENTER });

  advance(run, .05);
  expect(run.roulette).toBeNull();
  expect(run.chests).toHaveLength(1);
  choose(run, "arrow"); advance(run, .05);

  expect(run.chests).toHaveLength(0);
  expect(run.roulette).not.toBeNull();
});
test("evolution requires level three weapon, matching support and a post-five-minute chest", () => {
  const run = createRun(2); bench(run);
  run.arrow = 2; run.hwacha = 2; run.phase = "choice"; run.offers = ["hwacha", "arrow", "curse"];
  choose(run, "hwacha");
  expect(run.hwacha).toBe(3); expect(run.evolved).toBe(false);
  run.powder = true; run.time = 299;
  run.chests.push({ id: 900, x: 195, y: 350 });
  advance(run, .05);
  expect(run).toHaveProperty("phase", "playing"); expect(run.roulette?.evolution).toBeNull();
  while (run.roulette) advance(run, .05);
  expect(run.evolved).toBe(false);
  run.time = 300; run.chests.push({ id: 901, x: 195, y: 350 });
  advance(run, .05);
  expect(createdReel(run)?.evolution).toBe("hwacha");
  for (let i = 0; i < 18; i++) advance(run, .05);
  expect(run.evolved).toBe(false);
  for (let i = 0; i < 3; i++) advance(run, .05);
  expect(run.evolved).toBe(true);
  expect(run.evolutions).toEqual(["hwacha"]);
  expect(run.metrics.evolutionTimes[0]).toBeGreaterThan(301); expect(run.metrics.evolutionTimes[0]).toBeLessThan(301.2);
});
test("legend is rare, selectable, and gives the future weapon", () => {
  const run = createRun(0x1593);
  let seen = 0;
  for (let i = 0; i < 10000; i++) if (drawCards(run).includes("rift")) seen++;
  expect(seen).toBeGreaterThan(60); expect(seen).toBeLessThan(145);
  run.phase = "choice"; run.offers = ["rift", "arrow", "curse"];
  choose(run, "rift");
  expect(run.rift).toBe(true); expect(run.multiplier).toBe(4);
});
test("curse increases score multiplier and enemy pressure", () => {
  const run = createRun(4); run.phase = "choice"; run.offers = ["curse", "arrow", "hwacha"];
  choose(run, "curse");
  expect(run.multiplier).toBe(2); expect(run.curses).toBe(1);
});
test("base loss and the ten-minute final-boss deadline finish the run", () => {
  const lost = createRun(1); lost.base = 0; advance(lost, 0.1); expect(lost.phase).toBe("lost");
  const won = createRun(1); won.time = DURATION - 0.05; won.finalDefeated = true;
  advance(won, 0.1); expect(won.phase).toBe("won");
  const score = won.score; advance(won, 0.1); expect(won.score).toBe(score);
  const unfinished = createRun(1); unfinished.time = DURATION - .05; advance(unfinished, .1);
  expect(unfinished.phase).toBe("lost");
});
test("every signature skill respects its cooldown and retry makes a fresh run", () => {
  const run = createRun(1); bench(run, ["권율", "김시민", "곽재우"]);
  for (const squad of run.squads) {
    squad.skillClock = 5; expect(useSkill(run, squad.id)).toEqual([]);
    squad.skillClock = 0;
    expect(useSkill(run, squad.id).some(effect => effect.kind === "skill" && effect.squad === squad.id)).toBe(true);
    expect(squad.skillClock).toBe(BALANCE.cooldown[squad.general]);
    expect(useSkill(run, squad.id)).toEqual([]);
  }
  expect(run.metrics.skills).toEqual([1, 1, 1]);
  run.phase = "choice"; run.squads[0].skillClock = 0; expect(useSkill(run, 0).some(effect => effect.kind === "skill")).toBe(true);
  run.score = 1234; run.wall = 1;
  expect(createRun(1).score).toBe(0); expect(createRun(1).wall).toBeGreaterThan(1);
});
test("an automatic policy reaches a real terminal outcome", () => {
  const run = play(POLICIES.mash, 1593);
  expect(["won", "lost"]).toContain(run.phase);
  expect(run.kills).toBeGreaterThan(10);
});
test("hit metadata preserves the actual target and critical damage", () => {
  let criticalHits = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const { run } = stage(seed), wall = fortRect(run.fort);
    const target = foe(run, { x: CENTER.x, y: wall.bottom + 60 });
    run.arrowClock = 0;
    expect(advance(run, .05).some(effect => effect.kind === "shot")).toBe(true);
    const shot = run.shots[0];
    expect(shot.target).toBe(target.id);
    expect(shot.damage).toBeCloseTo(might(run) * BALANCE.arrowPower * (shot.critical ? 2 : 1), 6);
    const hit = fight(run, 1).find(effect => effect.kind === "hit");
    if (!hit) throw new Error("The arrow must land within a second");
    expect(hit.target).toBe(target.id);
    expect(hit.value).toBe(Math.round(shot.damage)); expect(hit.critical).toBe(shot.critical);
    if (hit.critical) criticalHits++;
  }
  expect(criticalHits).toBeGreaterThan(0);
});

test("a light opening army comes from all four edges, the field climbs after forty seconds and the cap grows to two hundred", () => {
  const run = createRun(42);
  expect(run.enemies.length).toBe(BALANCE.opening); expect(BALANCE.opening).toBeLessThan(BALANCE.openField);
  expect(new Set(Array.from({ length: 20 }, (_, seed) => createRun(seed + 1).enemies.map(e => e.direction)).flat())).toEqual(new Set(SIDES));
  expect(BALANCE.opening).toBeLessThanOrEqual(BALANCE.calmField);
  run.time = 0; expect(targetDensity(run)).toBe(BALANCE.calmField);
  run.time = BALANCE.calmUntil; expect(targetDensity(run)).toBe(BALANCE.calmField);
  run.time = (BALANCE.calmUntil + BALANCE.rampAt) / 2;
  expect(targetDensity(run)).toBeGreaterThan(BALANCE.calmField); expect(targetDensity(run)).toBeLessThan(BALANCE.openField);
  run.time = BALANCE.rampAt; expect(targetDensity(run)).toBe(BALANCE.openField);
  run.time = BALANCE.rampAt + 30; expect(targetDensity(run)).toBe(BALANCE.openField + Math.floor(30 * BALANCE.rampRate));
  run.time = 600; expect(targetDensity(run)).toBe(200);
});
test("the first twenty seconds never put more than the calm field on screen", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const run = createRun(seed);
    while (run.time < BALANCE.calmUntil) { advance(run, .05); if (run.phase === "choice") choose(run, run.offers[0]); expect(run.enemies.length).toBeLessThanOrEqual(BALANCE.calmField); }
  }
});
test("a locked general never joins through level-up cards until he is unlocked", () => {
  const locked = createRun(5, "권율", undefined, ["권율", "김시민"]), open = createRun(5, "권율", undefined, ["권율", "김시민", "곽재우"]);
  const dealt = (run: Run) => {
    const seen = new Set<CardId>();
    while (run.time < 240 && run.phase !== "lost") {
      advance(run, .05);
      if (run.phase === "choice") { run.offers.forEach(card => seen.add(card)); choose(run, run.offers.find(card => card.startsWith("hero-")) ?? run.offers[0]); }
    }
    return seen;
  };
  const lockedSeen = dealt(locked);
  expect(lockedSeen.has("hero-김시민")).toBe(true); expect(lockedSeen.has("hero-곽재우")).toBe(false);
  expect(locked.squads.some(squad => squad.general === "곽재우")).toBe(false);
  for (let draw = 0; draw < 200; draw++) expect(drawCards(locked)).not.toContain("hero-곽재우");
  expect(dealt(open).has("hero-곽재우")).toBe(true);
});
test("unanswered cards stay up for thirty seconds while combat and growth go on, and queued levels are dealt one hand at a time", () => {
  const run = createRun(42);
  while (run.phase === "playing") advance(run, .05);
  const offers = [...run.offers], level = run.level, dealtAt = run.time;
  while (run.time < dealtAt + 30) advance(run, .05);
  expect(run.phase).toBe("choice"); expect(run.offers).toEqual(offers);
  expect(run.level).toBeGreaterThan(level); expect(run.queued).toBe(run.level - level);
  const waiting = run.queued;
  choose(run, run.offers[0]);
  expect(run.phase).toBe("choice"); expect(run.queued).toBe(waiting - 1); expect(new Set(run.offers).size).toBe(3);
  while (run.queued) choose(run, run.offers[0]);
  choose(run, run.offers[0]);
  expect(run).toHaveProperty("phase", "playing");
});
test("gunners join the field at thirty-five seconds", () => {
  const run = createRun(42); bench(run); disarm(run);
  run.base = run.maxBase = 1e9;
  const kindsUntil = (until: number) => {
    const seen = new Set<string>();
    while (run.time < until) { advance(run, .05); expect(run.phase).toBe("playing"); for (const e of run.enemies) seen.add(e.kind); }
    return seen;
  };
  expect(kindsUntil(34.9).has("teppo")).toBe(false);
  expect(kindsUntil(70).has("teppo")).toBe(true);
});
test("reinforcements are halved while a boss is on the field or a siege is running", () => {
  const run = createRun(42); bench(run); disarm(run);
  run.enemies = run.enemies.slice(0, 5);
  const normal = spawnRate(run);
  run.enemies[0].boss = true; expect(spawnRate(run)).toBeCloseTo(normal * BALANCE.eventRefill);
  run.enemies[0].boss = false; run.waveUntil = run.time + 10; expect(spawnRate(run)).toBeCloseTo(normal * BALANCE.eventRefill);
});
test("the fort sits in the centre of the field and every attacker walks to its wall", () => {
  const run = createRun(42), wall = fortRect(run.fort);
  expect((wall.left + wall.right) / 2).toBe(WIDTH / 2);
  expect(Math.abs((wall.top + wall.bottom) / 2 - HEIGHT / 2)).toBeLessThanOrEqual(8);
  for (const enemy of run.enemies) {
    const stand = gapToRect(wall, { x: enemy.goalX, y: enemy.goalY });
    expect(stand).toBeGreaterThanOrEqual(11.9); expect(stand).toBeLessThanOrEqual(48.1);
    expect(crosses(wall, enemy, { x: enemy.goalX, y: enemy.goalY })).toBe(false);
  }
  run.squads = []; run.arrowClock = run.hwachaClock = 1e9;
  const before = run.enemies.map(e => ({ id: e.id, gap: Math.hypot(e.goalX - e.x, e.goalY - e.y) }));
  fight(run, 3);
  for (const { id, gap } of before) {
    const enemy = run.enemies.find(e => e.id === id);
    if (!enemy) throw new Error("Nobody attacks in this fixture, so every attacker must survive");
    expect(Math.hypot(enemy.goalX - enemy.x, enemy.goalY - enemy.y)).toBeLessThanOrEqual(Math.max(71, gap - 30));
    expect(contains(wall, enemy)).toBe(false);
  }
});
test("a shorter phone field keeps the fort centred, attackers on its edges and squads inside it", () => {
  setFieldHeight(520);
  try {
    const run = createRun(42), wall = fortRect(run.fort);
    expect(HEIGHT).toBe(520); expect(CENTER.y).toBe(260);
    expect(Math.abs((wall.top + wall.bottom) / 2 - 260)).toBeLessThanOrEqual(8);
    run.enemies = []; run.spawnBudget = 8;
    advance(run, .05);
    expect(run.enemies.length).toBeGreaterThan(7);
    expect(run.enemies.every(e => e.x >= -15 && e.x <= WIDTH + 15 && e.y >= -15 && e.y <= 535)).toBe(true);
    expect(run.enemies.every(e => e.x < 0 || e.x > WIDTH || e.y < 0 || e.y > 520)).toBe(true);
    fight(run, 6);
    for (const unit of units(run.squads[0])) {
      expect(unit.x).toBeGreaterThanOrEqual(0); expect(unit.x).toBeLessThanOrEqual(WIDTH);
      expect(unit.y).toBeGreaterThanOrEqual(0); expect(unit.y).toBeLessThanOrEqual(520);
    }
  } finally { setFieldHeight(650); }
  expect(HEIGHT).toBe(650); expect(CENTER.y).toBe(325);
});
test("the main assault side holds seventy percent, shifts every twenty-five seconds and warns three seconds ahead", () => {
  let top = 0, total = 0;
  const rest = (1 - BALANCE.focusShare) / 3;
  expect(BALANCE.focusShare).toBe(.7);
  for (let seed = 1; seed <= 100; seed++) {
    const run = createRun(seed);
    expect(assaultSide(run)).toBe("위");
    expect(directionWeights(run)).toEqual([BALANCE.focusShare, rest, rest, rest]);
    for (let i = 1; i < run.assaultOrder.length; i++) expect(run.assaultOrder[i]).not.toBe(run.assaultOrder[i - 1]);
    expect(run.assaultOrder.at(-1)).not.toBe(run.assaultOrder[0]);
    top += run.enemies.filter(e => e.direction === "위").length; total += run.enemies.length;
  }
  expect(top / total).toBeGreaterThan(.66); expect(top / total).toBeLessThan(.74);
  const run = createRun(42); run.xp = -1e9;
  run.time = ASSAULT_PERIOD - ASSAULT_WARNING - .05;
  const warning = advance(run, .1).find(effect => effect.kind === "assault");
  expect(warning?.side).toBe(run.assaultOrder[1]);
  expect(assaultSide(run)).toBe("위");
  expect(advance(run, .1).some(effect => effect.kind === "assault")).toBe(false);
  run.time = ASSAULT_PERIOD + .01;
  expect(assaultSide(run)).toBe(run.assaultOrder[1]);
  expect(directionWeights(run)[SIDES.indexOf(run.assaultOrder[1])]).toBe(BALANCE.focusShare);
});
test("ranged attackers fire during the approach and deal real damage", () => {
  const { run, squad } = stage();
  const hunter = foe(run, { x: squad.x, y: squad.y - 140 }, { kind: "teppo", speed: 20 });
  const sapper = foe(run, { x: 30, y: CENTER.y }, { kind: "teppo", speed: 20 });
  const wall = run.wall, health = squad.hp, effects = fight(run, 5);
  expect(effects.some(effect => effect.kind === "shot" && effect.hostile && effect.target === hunter.id)).toBe(true);
  expect(effects.some(effect => effect.kind === "hurt" && effect.squad === 0 && effect.index === -1 && effect.target === hunter.id)).toBe(true);
  expect(squad.hp).toBeLessThan(health);
  expect(distance(hunter, squad)).toBeGreaterThan(100);
  expect(run.wall).toBeLessThan(wall);
  expect(gapToRect(fortRect(run.fort), sapper)).toBeGreaterThan(60);
});
test("all four recruits preserve tank and damage roles without consuming existing soldiers", () => {
  const run = createRun(42), squad = run.squads[0];
  expect(soldier("spearman").hp).toBeGreaterThan(soldier("monk").hp);
  expect(soldier("archer").hp).toBeGreaterThan(soldier("hwacha").hp);
  squad.soldiers = [];
  recruit(run, "monk"); recruit(run, "monk");
  expect(squad.soldiers).toHaveLength(2);
  const effects = recruit(run, "monk");
  expect(squad.soldiers).toHaveLength(3); expect(squad.soldiers.every(unit => unit.tier === 1)).toBe(true);
  expect(effects.some(e => e.kind === "merge" && e.value > 0)).toBe(false);
  expect(run.metrics.merges).toBe(0);
  expect(strength(squad)).toBe(3);
  run.phase = "general"; run.generalOffers = ["김시민"]; chooseGeneral(run, "김시민");
  run.phase = "choice"; run.offers = ["recruit-archer", "arrow", "curse"]; choose(run, "recruit-archer");
  expect(run.squads[1].soldiers.filter(unit => unit.kind === "archer")).toHaveLength(2);
  expect(run.squads[1].soldiers).toHaveLength(3);
});
test("squads take their own posts and nothing can order a move", () => {
  for (const removed of ["moveSquad", "selectSquad", "sortie", "barrage", "collectChest"]) expect(removed in rules).toBe(false);
  const run = createRun(42), wall = fortRect(run.fort), squad = run.squads[0];
  // Measure deployment without an eligible nearby fighter interrupting the march.
  for (const enemy of run.enemies) Object.assign(enemy, { x: CENTER.x, y: wall.top - 200, speed: 0 });
  expect(sideOf(wall, squad)).toBe("아래");
  advance(run, .05);
  expect(squad.post).toBe("위");
  expect(pressure(run)["위"]).toBeGreaterThan(Math.max(pressure(run)["좌"], pressure(run)["우"], pressure(run)["아래"]));
  fight(run, 4);
  expect(sideOf(wall, squad)).toBe("위");
  expect(gapToRect(wall, squad)).toBeGreaterThan(SQUAD_MARGIN - 1); expect(gapToRect(wall, squad)).toBeLessThan(BALANCE.guardGap + 30);
  expect(run.metrics.redeploys).toBeGreaterThanOrEqual(1);
});
test("squads march at a finite pace around the wall and never cut through it", () => {
  const run = createRun(42); run.xp = -1e9;
  const wall = fortRect(run.fort), block = fortRect(run.fort, SQUAD_MARGIN - .01), squad = run.squads[0];
  for (const enemy of run.enemies) Object.assign(enemy, { x: CENTER.x, y: wall.top - 200, speed: 0 });
  let arrival = 0, previous = { x: squad.x, y: squad.y };
  for (let step = 1; step <= 100; step++) {
    advance(run, .05);
    expect(distance(previous, squad)).toBeLessThanOrEqual(SQUAD_SPEED * .05 + .001);
    expect(contains(block, squad)).toBe(false);
    previous = { x: squad.x, y: squad.y };
    if (!arrival && squad.y < wall.top - SQUAD_MARGIN + 1) arrival = step * .05;
  }
  expect(arrival).toBeGreaterThan(1.2); expect(arrival).toBeLessThan(3.5);
});
test("routes around the fort are the shorter way and never cross it", () => {
  const block = fortRect(1, SQUAD_MARGIN);
  const west = { x: block.left - 20, y: CENTER.y + 30 }, east = { x: block.right + 20, y: CENTER.y + 30 };
  expect(crosses(block, west, east)).toBe(true);
  const first = route(block, west, east);
  expect(first).toEqual({ x: block.left, y: block.bottom });
  expect(crosses(block, west, first)).toBe(false);
  expect(route(block, first, east)).toEqual({ x: block.right, y: block.bottom });
  expect(route(block, { x: block.right, y: block.bottom }, east)).toEqual(east);
  expect(route(block, west, { x: west.x, y: 40 })).toEqual({ x: west.x, y: 40 });
  const struck = wallPoint(fortRect(1), { x: 0, y: 0 });
  expect(struck.x === fortRect(1).left || struck.y === fortRect(1).top).toBe(true);
});
test("unlocked squads muster at the main gate and an exhausted roster offers no more heroes", () => {
  const run = createRun(42, "권율", rules.NO_META, rules.GENERALS.slice(0, 3)), wall = fortRect(run.fort); run.xp = -1e9;
  expect(run.squads[0].x).toBe(CENTER.x); expect(sideOf(wall, run.squads[0])).toBe("아래");
  run.level = 2; run.phase = "choice"; run.offers = ["hero-곽재우", "arrow", "recruit-archer"];
  expect(() => choose(run, "hero-권율")).toThrow();
  expect(choose(run, "hero-곽재우").some(effect => effect.kind === "join" && effect.squad === 1)).toBe(true);
  expect(run.squads.map(squad => squad.general)).toEqual(["권율", "곽재우"]);
  expect(sideOf(wall, run.squads[1])).toBe("아래"); expect(run.squads[1].skillClock).toBe(0);
  expect(run.squads[1].soldiers.map(unit => unit.kind)).toEqual([rules.GENERAL_CLASS.곽재우]);
  run.phase = "choice"; run.offers = ["hero-김시민", "arrow", "recruit-monk"];
  expect(choose(run, "hero-김시민").some(effect => effect.kind === "join" && effect.squad === 2)).toBe(true);
  expect(run).toHaveProperty("phase", "playing");
  expect(run.squads.map(squad => squad.general)).toEqual(["권율", "곽재우", "김시민"]);
  expect(run.squads[2].skillClock).toBeLessThanOrEqual(.1);
  fight(run, 2);
  expect(run.squads).toHaveLength(3); expect(run.metrics.generalTimes).toHaveLength(2);
  expect(drawCards(run).some(card => card.startsWith("hero-"))).toBe(false);
});
test("Kim Yeomul's retained charge cuts a lane, stuns what it passes and returns to guard", () => {
  for (const awakened of [0, 1, 2]) {
    const { run } = stage(42, ["권율", "곽재우"]), rider = run.squads[2], start = guardPoint(run.fort, "좌", 40);
    rider.general = "김여물";
    place(rider, start); rider.awakened = awakened; rider.skillClock = 0;
    const line = [80, 60, 40].map(x => foe(run, { x, y: start.y }));
    const aim = skillAim(run, rider.id);
    expect(aim?.count).toBe(3); expect(aim?.urgent).toBe(false);
    expect(useSkill(run, rider.id).some(effect => effect.kind === "skill")).toBe(true);
    expect(rider.state).toBe("charge"); expect(fielded(rider)).toBe(false);
    const effects = fight(run, 2.5);
    for (const enemy of line) {
      expect(1e6 - enemy.hp).toBeCloseTo(BALANCE.chargePower * might(run) * (awakened === 2 ? 2 : 1), 4);
      expect(effects.some(effect => effect.kind === "stun" && effect.target === enemy.id && effect.value === BALANCE.chargeStun)).toBe(true);
    }
    expect(rider.state).toBe("guard"); expect(rider.lane).toBeNull();
    expect(rider.frenzyUntil > 0).toBe(awakened >= 1);
    expect(distance(rider, start)).toBeLessThan(2);
  }
});
test("an elite's chest spins by itself while the battle goes on, fast then slow, and pays where the reel lands", () => {
  const { run, squad } = stage(); squad.skillClock = 0;
  run.level = 10;
  for (let i = 0; i < 4; i++) foe(run, { x: 60 + i * 8, y: 120 }, { hp: 1, maxHp: 1, elite: i === 0 });
  expect(useSkill(run, 0).some(effect => effect.kind === "chest")).toBe(true);
  expect(run.chests).toHaveLength(1);
  advance(run, .05);
  expect(run).toHaveProperty("phase", "playing"); expect(run.chests).toHaveLength(0);
  const reward = run.roulette;
  if (!reward) throw new Error("The opened chest must spin its reel");
  expect([...reward.options].sort()).toEqual(["awaken", "gold", "gold", "gold", "jackpot", "recruit", "recruit", "weapon"]); expect(reward.remaining).toBe(ROULETTE_SECONDS);
  const time = run.time, landing = reward.options[0], seen: number[] = [];
  let paid: Effect[] = [];
  while (run.roulette) { seen.push(rouletteIndex(reward)); paid = advance(run, .05); }
  expect(run.time - time).toBeCloseTo(ROULETTE_SECONDS, 1);
  const turns = (list: number[]) => list.filter((index, order) => order > 0 && index !== list[order - 1]).length, half = Math.floor(seen.length / 2);
  const sampled = Array.from({ length: 121 }, (_, i) => rouletteIndex({ ...reward, remaining: 1.2 - i / 100 }));
  expect(turns(sampled)).toBe(ROULETTE_TICKS);
  expect(turns(sampled.slice(80))).toBe(3);
  expect(turns(seen.slice(0, half))).toBeGreaterThan(turns(seen.slice(half)) * 1.5);
  expect(paid.some(effect => effect.kind === "prize" && effect.value === PRIZE_TIERS[landing])).toBe(true);
  expect(run.metrics.chests).toBe(1); expect(run.metrics.bonuses[landing]).toBe(1);
  const tally = () => ({ troops: run.squads.reduce((sum, mate) => sum + strength(mate), 0), gold: run.gold, weapons: run.arrow + run.hwacha,
    awakened: run.squads.reduce((sum, mate) => sum + mate.awakened, 0), wall: run.wall });
  for (const bonus of ["gold", "recruit", "weapon", "awaken", "jackpot"] as const) {
    run.roulette = { remaining: .01, options: Array<Bonus>(8).fill(bonus), soldier: "monk", evolution: null };
    const before = tally(), all = bonus === "jackpot";
    expect(advance(run, .05).some(effect => effect.kind === "prize" && effect.value === PRIZE_TIERS[bonus])).toBe(true); expect(run.roulette).toBeNull();
    const after = tally();
    expect(after.troops - before.troops).toBe(bonus === "recruit" || all ? 2 : 0);
    expect(after.gold > before.gold).toBe(bonus === "gold" || all);
    expect(after.weapons - before.weapons).toBe(bonus === "weapon" ? 1 : 0);
    expect(after.awakened - before.awakened).toBe(bonus === "awaken" ? 1 : 0);
    expect(after.wall).toBeLessThanOrEqual(before.wall);
  }
  run.arrow = run.hwacha = 3; run.quiver = run.powder = true; for (const mate of run.squads) { mate.awakened = 2; mate.tier = 3; }
  run.chests.push({ id: 990, x: 195, y: 350 }); advance(run, .05);
  expect([...(run.roulette?.options ?? [])].sort()).toEqual(["gold", "gold", "gold", "gold", "jackpot", "recruit", "recruit", "recruit"]);
  expect(PRIZE_TIERS).toEqual({ gold: 0, recruit: 1, weapon: 2, awaken: 2, jackpot: 3 });
});
test("mid bosses use four unique randomized identities at two-minute marks", () => {
  const orders = new Set<string>();
  for (let seed = 1; seed < 20; seed++) orders.add(createRun(seed).bossOrder.join(","));
  expect(orders.size).toBeGreaterThan(4);
  const run = createRun(42); bench(run); expect(new Set(run.bossRoster.slice(0, 4)).size).toBe(4);
  for (const time of [120, 240, 360, 480]) {
    run.phase = "playing"; run.time = time - .05;
    advance(run, .1);
    expect(run.enemies.some(e => e.boss && e.pattern === run.bossOrder[time / 120 - 1])).toBe(true);
    expect(run.metrics.bosses.at(-1)?.art).toBe(run.bossRoster[time / 120 - 1]);
  }
});
test("every warned skill winds up between 0.8 and 1.2 seconds", () => {
  for (const spec of Object.values(CASTS)) { expect(spec.windup).toBeGreaterThanOrEqual(.8); expect(spec.windup).toBeLessThanOrEqual(1.2); }
});
test("elites, mid-bosses and the final boss each cast their own warned skill", () => {
  const cases: { skill: Skill; extra: Partial<Enemy>; at: (post: Point) => Point }[] = [
    { skill: "slam", extra: { elite: true }, at: post => ({ x: post.x + 50, y: post.y - 20 }) },
    { skill: "ram", extra: { elite: true }, at: () => ({ x: CENTER.x, y: fortRect(0).bottom + 20 }) },
    { skill: "gunner", extra: { boss: true, pattern: "gunner" }, at: post => ({ x: post.x - 100, y: post.y }) },
    { skill: "cavalry", extra: { boss: true, pattern: "cavalry", kind: "cavalry" }, at: post => ({ x: post.x - 100, y: post.y }) },
    { skill: "siege", extra: { boss: true, pattern: "siege" }, at: post => ({ x: post.x + 20, y: post.y - 60 }) },
    { skill: "ninja", extra: { boss: true, pattern: "ninja" }, at: () => ({ x: 30, y: HEIGHT - 60 }) },
    { skill: "decree", extra: { boss: true, kind: "ukita" }, at: post => ({ x: post.x - 100, y: post.y }) },
  ];
  for (const { skill, extra, at } of cases) {
    const { run, squad, post } = stage();
    const caster = foe(run, at(post), { skillClock: 0, speed: 30, ...extra });
    const effects = advance(run, .05), mark = run.telegraphs[0];
    expect(run.telegraphs).toHaveLength(1);
    expect(mark.skill).toBe(skill); expect(mark.owner).toBe(caster.id); expect(mark.shape).toBe(CASTS[skill].shape); expect(mark.radius).toBe(CASTS[skill].radius);
    expect(mark.at - mark.startedAt).toBeCloseTo(CASTS[skill].windup, 6);
    expect(effects.some(effect => effect.kind === "telegraph" && effect.target === caster.id)).toBe(true);
    expect(caster.casting).toBe(mark.id);
    if (skill === "ninja") expect(distance(caster, squad)).toBeLessThan(60);
    if (skill !== "ram") expect(covers(mark, squad)).toBe(true); else expect(gapToRect(fortRect(run.fort), mark)).toBeLessThan(1);
    const stood = { x: caster.x, y: caster.y }, target = { x: mark.x, y: mark.y };
    while (run.telegraphs.length) { expect({ x: caster.x, y: caster.y }).toEqual(stood); advance(run, .05); }
    expect(caster.casting).toBe(0); expect(run.metrics.landed).toBe(1);
    if (skill === "cavalry") expect(distance(caster, target)).toBeLessThan(1);
    if (skill === "decree") {
      caster.skillClock = 0; advance(run, .05);
      expect(run.telegraphs[0].skill).toBe("salvo"); expect(run.telegraphs[0].shape).toBe("lane");
    }
  }
});
test("a boss skill lands on a general and takes his health", () => {
  const { run, squad } = stage();
  const boss = foe(run, { x: squad.x - 100, y: squad.y }, { boss: true, pattern: "gunner", kind: "samurai", skillClock: 0, speed: 20 });
  advance(run, .05);
  const mark = run.telegraphs[0], before = squad.hp, effects: Effect[] = [];
  expect(mark.owner).toBe(boss.id);
  expect(mark.at - mark.startedAt).toBeGreaterThanOrEqual(.8); expect(mark.at - mark.startedAt).toBeLessThanOrEqual(1.2);
  expect(covers(mark, squad)).toBe(true); expect(mark.damage).toBeGreaterThan(squad.maxHp * .1);
  while (run.telegraphs.length) { expect(squad.hp).toBe(before); effects.push(...advance(run, .05)); }
  expect(before - squad.hp).toBeCloseTo(mark.damage, 6);
  expect(run.metrics.generalsStruck).toBe(1); expect(run.metrics.landed).toBe(1);
  expect(effects.some(effect => effect.kind === "land" && effect.label === "gunner" && !effect.minor)).toBe(true);
  expect(effects.some(effect => effect.kind === "hurt" && effect.squad === 0 && effect.index === -1 && effect.target === boss.id && effect.value === Math.round(mark.damage))).toBe(true);
});
test("a landing skill also hurts the soldiers inside it and the wall it reaches", () => {
  const { run, squad } = stage();
  fight(run, 2);
  const guard = squad.soldiers.find(unit => unit.kind === "archer")!, out = Math.atan2(guard.y - CENTER.y, guard.x - CENTER.x);
  const nearby = { x: guard.x + Math.cos(out) * 28, y: guard.y + Math.sin(out) * 28 };
  squad.x = squad.targetX = nearby.x; squad.y = squad.targetY = nearby.y;
  foe(run, { x: guard.x + Math.cos(out) * 60, y: guard.y + Math.sin(out) * 60 }, { boss: true, pattern: "siege", skillClock: 0 });
  for (const side of SIDES) run.walls[side] = 300;
  run.wall = 1200;
  advance(run, .05);
  const mark = run.telegraphs[0], wall = run.wall, inside = squad.soldiers.filter(unit => covers(mark, unit)), health = inside.map(unit => unit.hp);
  expect(inside.length).toBeGreaterThan(0); expect(mark.wallDamage).toBeGreaterThan(0);
  while (run.telegraphs.length) advance(run, .05);
  expect(wall - run.wall).toBeCloseTo(mark.wallDamage, 6);
  inside.forEach((unit, index) => {
    const armor = unit.kind === "spearman" ? .55 : unit.kind === "monk" ? .6 : 1;
    expect(health[index] - unit.hp).toBeCloseTo(Math.min(health[index], mark.damage / 2 * armor), 6);
  });
});
test("cannon attacks do not block a landing skill, while charge and killing still interrupt", () => {
  const shielded = stage(42, ["권율", "김시민"]);
  foe(shielded.run, { x: shielded.post.x - 100, y: shielded.post.y }, { boss: true, pattern: "gunner", skillClock: 0 });
  advance(shielded.run, .05);
  shielded.run.squads[1].skillClock = 0;
  expect(skillAim(shielded.run, 1)?.urgent).toBe(true);
  expect(useSkill(shielded.run, 1).length).toBeGreaterThan(0);
  const health = shielded.squad.hp, blocked = fight(shielded.run, 1.5);
  expect(shielded.squad.hp).toBeLessThan(health);
  expect(shielded.run.metrics.blockedCasts).toBe(0); expect(shielded.run.metrics.generalsStruck).toBe(1);
  expect(blocked.some(effect => effect.kind === "land" && !effect.minor)).toBe(true);
  expect(blocked.some(effect => effect.kind === "block" && effect.squad === 0 && effect.index === -1)).toBe(false);

  const cut = stage(42, ["권율", "곽재우"]), rider = cut.run.squads[2];
  rider.general = "김여물";
  place(rider, { x: cut.post.x - 60, y: cut.post.y - 70 }); rider.skillClock = 0;
  const caster = foe(cut.run, { x: cut.post.x - 100, y: cut.post.y }, { boss: true, pattern: "gunner", skillClock: 0 });
  advance(cut.run, .05);
  expect(cut.run.telegraphs).toHaveLength(1); expect(skillAim(cut.run, rider.id)?.urgent).toBe(true);
  useSkill(cut.run, rider.id);
  const before = cut.squad.hp, effects = fight(cut.run, 1.5);
  expect(cut.run.telegraphs).toHaveLength(0); expect(cut.run.metrics.interrupts).toBe(1); expect(cut.run.metrics.landed).toBe(0);
  expect(effects.some(effect => effect.kind === "interrupt" && effect.target === caster.id)).toBe(true);
  expect(cut.squad.hp).toBe(before); expect(caster.casting).toBe(0);

  const slain = stage(); slain.squad.skillClock = 0;
  const doomed = foe(slain.run, { x: slain.post.x - 100, y: slain.post.y }, { boss: true, pattern: "gunner", skillClock: 0, hp: 1, maxHp: 1 });
  advance(slain.run, .05);
  expect(slain.run.telegraphs[0].owner).toBe(doomed.id);
  useSkill(slain.run, 0);
  expect(slain.run.telegraphs).toHaveLength(0); expect(slain.run.metrics.interrupts).toBe(1); expect(slain.run.chests).toHaveLength(1);
});
test("riders hunt generals from anywhere, samurai from close by, gunners shoot them and spearmen fight what blocks the way", () => {
  const { run, squad } = stage();
  // Keep the archer blocker fixture, without a melee defender intercepting the rider.
  squad.soldiers = squad.soldiers.filter(unit => unit.kind === "archer");
  fight(run, 3);
  const rider = foe(run, { x: WIDTH - 10, y: squad.y }, { kind: "cavalry", speed: 100 });
  const far = foe(run, { x: squad.x + 150, y: squad.y - 150 }, { kind: "samurai" }), near = foe(run, { x: squad.x - 70, y: squad.y - 50 }, { kind: "samurai", speed: 25 });
  const passer = foe(run, { x: squad.x - 60, y: squad.y - 70 }, { kind: "yari" }), siege = foe(run, { x: squad.x + 50, y: squad.y - 30 }, { kind: "samurai", wave: true });
  advance(run, .05);
  const front = squad.soldiers.findIndex(unit => unit.kind === "archer");
  const guard = squad.soldiers[front], outward = Math.atan2(guard.y - CENTER.y, guard.x - CENTER.x);
  const blocker = foe(run, { x: guard.x + Math.cos(outward) * 14, y: guard.y + Math.sin(outward) * 14 }, { kind: "yari", speed: 25 });
  advance(run, .05);
  expect(rider.prey).toEqual([0, -1]); expect(near.prey).toEqual([0, -1]);
  expect(far.prey).toBeNull(); expect(passer.prey).toBeNull(); expect(siege.prey).toEqual([0, -1]);
  expect(blocker.prey).toEqual([0, front]);
  const general = squad.hp, soldierHealth = squad.soldiers[front].hp, effects = fight(run, 8);
  expect(effects.some(effect => effect.kind === "lunge" && effect.target === near.id)).toBe(true);
  expect(effects.some(effect => effect.kind === "hurt" && effect.index === -1 && effect.target === rider.id)).toBe(true);
  expect(squad.hp).toBeLessThan(general);
  expect(effects.some(effect => effect.kind === "hurt" && effect.index === front && effect.target === blocker.id)).toBe(true);
  expect(squad.soldiers[front].hp).toBeLessThan(soldierHealth);
  expect(run.metrics.taken[0]).toBeGreaterThan(0);
});
test("a general at zero health is out for a while and rises again while his soldiers hold the wall; a soldier is only wounded", () => {
  const { run, squad } = stage();
  fight(run, .5); squad.hp = 1; squad.hurtAt = run.time;
  const killer = foe(run, { x: squad.x + 14, y: squad.y }, { speed: 20 });
  const effects = fight(run, 1);
  expect(squad.state).toBe("down"); expect(squad.hp).toBe(0); expect(fielded(squad)).toBe(false);
  expect(effects.some(effect => effect.kind === "down" && effect.squad === 0 && effect.index === -1)).toBe(true);
  expect(run.metrics.downs).toHaveLength(1); expect(squad.downs).toBe(1);
  const fell = run.metrics.downs[0].time;
  squad.skillClock = 0; expect(useSkill(run, 0)).toEqual([]);
  fight(run, 1);
  expect(killer.prey).toEqual([0, 0]);
  expect(squad.soldiers[0].hp).toBeGreaterThan(0);
  fight(run, BALANCE.downSeconds - 2.2);
  expect(squad.state).toBe("down");
  killer.x = 4; killer.y = 4;
  const rising = fight(run, 1);
  expect(squad.state).toBe("guard"); expect(run.time).toBeGreaterThanOrEqual(fell + BALANCE.downSeconds);
  expect(squad.hp).toBeCloseTo(squad.maxHp * .6, 6);
  expect(rising.some(effect => effect.kind === "rise" && effect.squad === 0)).toBe(true);

  const hurt = stage(), victim = hurt.squad.soldiers[1];
  fight(hurt.run, 3); victim.hp = 1;
  foe(hurt.run, { x: victim.x, y: victim.y - 14 }, { speed: 20 });
  const wounded = fight(hurt.run, 1);
  expect(victim.hp).toBe(0); expect(victim.downUntil).toBeGreaterThan(hurt.run.time);
  expect(wounded.some(effect => effect.kind === "down" && effect.index === 1)).toBe(true);
  expect(hurt.squad.state).toBe("guard"); expect(hurt.run.metrics.soldierDowns).toBe(1);
  hurt.run.enemies = hurt.run.enemies.filter(enemy => enemy.hp > 1e9);
  fight(hurt.run, BALANCE.soldierDown);
  expect(victim.hp).toBeGreaterThanOrEqual(victim.maxHp / 2);
});
test("a badly hurt general holds his assigned side instead of fleeing at thirty percent", () => {
  const { run, squad } = stage(); run.commandClock = 0;
  // Two ranks at ENEMY_SPACING: one 9 px rank of thirty was pushed apart into a blob much closer to the general.
  for (let i = 0; i < 30; i++) foe(run, { x: 40 + i % 15 * ENEMY_SPACING, y: fortRect(run.fort).top - 90 - Math.floor(i / 15) * ENEMY_SPACING });
  fight(run, 1);
  expect(squad.post).toBe("위"); expect(squad.state).toBe("guard");
  squad.hp = squad.maxHp * (BALANCE.retreatAt - .05);
  const effects = fight(run, .5);
  expect(squad.state).toBe("guard"); expect(squad.post).toBe("위");
  expect(effects.some(effect => effect.kind === "retreat")).toBe(false);
  expect(run.metrics.retreats).toBe(0);
  fight(run, 4);
  expect(sideOf(fortRect(run.fort), squad)).toBe("위");
  fight(run, 6);
  expect(squad.hp).toBeGreaterThan(squad.maxHp * (BALANCE.retreatAt - .05));
  expect(squad.state).toBe("guard"); expect(squad.post).toBe("위");
});
test("a weakened general steps out of a warned area while a healthy one holds his ground", () => {
  for (const weak of [true, false]) {
    const { run, squad, post } = stage(); run.commandClock = 0;
    for (let i = 0; i < 30; i++) foe(run, { x: 60 + i * 9, y: 20 });
    fight(run, 1);
    squad.hp = squad.maxHp * (weak ? BALANCE.dodgeBelow - .08 : 1);
    foe(run, { x: squad.x + 50, y: squad.y - 20 }, { elite: true, skillClock: 0 });
    advance(run, .05);
    const mark = run.telegraphs[0], before = squad.hp;
    expect(covers(mark, squad)).toBe(true); expect(distance(squad, post)).toBeLessThan(60);
    while (run.telegraphs.length) advance(run, .05);
    expect(covers(mark, squad)).toBe(!weak);
    expect(run.metrics.generalsStruck).toBe(weak ? 0 : 1);
    if (weak) expect(squad.hp).toBeGreaterThanOrEqual(before); else expect(before - squad.hp).toBeCloseTo(mark.damage, 6);
  }
});
test("squads cover threatened sides without sharing an assigned side", () => {
  const run = createRun(42), wall = fortRect(run.fort);
  bench(run, ["권율", "김시민", "곽재우"]); sterile(run); disarm(run);
  for (let i = 0; i < 30; i++) foe(run, { x: 60 + i * 9, y: wall.top - 90 });
  for (let i = 0; i < 20; i++) foe(run, { x: wall.left - 90, y: wall.top + i * 5 });
  fight(run, 5);
  expect(run.squads.map(squad => squad.post).sort().join()).toBe(["위", "좌", "아래"].sort().join());
  for (const first of run.squads) for (const second of run.squads)
    if (first.id < second.id) expect(distance(first, second)).toBeGreaterThan(40);
  for (const squad of run.squads) if (STYLES[squad.general] !== "hunter") expect(sideOf(wall, squad)).toBe(squad.post);
  for (const enemy of run.enemies) if (sideOf(wall, enemy) === "위" && enemy.hp < 1e9) { enemy.x = wall.right + 90; enemy.y = wall.top + 20 + enemy.id % 10 * 8; }
  fight(run, 5);
  expect(run.squads.filter(squad => squad.post === "우")).toHaveLength(1);
  expect(new Set(run.squads.map(squad => squad.post)).size).toBe(3);
  // Only one defender changes sides; the others retain their separate posts.
  expect(run.metrics.redeploys).toBe(1);
  const calm = createRun(42); calm.enemies = [];
  const ahead = pressure({ ...calm, time: ASSAULT_PERIOD - ASSAULT_WARNING + .1 }), now = pressure(calm);
  expect(ahead[calm.assaultOrder[1]] - now[calm.assaultOrder[1]]).toBe(6);
});
test("권율's barrage lands on the densest pack and the rift only reaches enemies near a fielded squad", () => {
  const { run, squad } = stage(); squad.skillClock = 0;
  const pack = Array.from({ length: 8 }, (_, i) => foe(run, { x: 50 + i % 4 * 10, y: 110 + Math.floor(i / 4) * 10 }));
  const few = Array.from({ length: 3 }, (_, i) => foe(run, { x: 330 + i * 10, y: 500 }));
  const aim = skillAim(run, 0);
  if (!aim) throw new Error("The barrage needs a pack to aim at");
  expect(aim.count).toBe(8); expect(distance(aim, pack[0])).toBeLessThan(40);
  const effects = useSkill(run, 0);
  for (const enemy of pack) expect(1e6 - enemy.hp).toBeCloseTo(BALANCE.volleyPower * might(run), 6);
  for (const enemy of few) expect(enemy.hp).toBe(1e6);
  expect(effects.find(effect => effect.kind === "total")?.value).toBe(Math.round(8 * BALANCE.volleyPower * might(run)));
  expect(run.metrics.damage.skill).toBeCloseTo(8 * BALANCE.volleyPower * might(run), 4);
  const close = foe(run, { x: squad.x, y: squad.y - 80 });
  run.rift = true; run.riftClock = 0;
  expect(advance(run, .05).some(effect => effect.kind === "rift")).toBe(true);
  expect(1e6 - close.hp).toBeCloseTo(might(run) * 4, 6);
  for (const enemy of few) expect(enemy.hp).toBe(1e6);
});
test("권율's barrage awakens into two volleys and then a halved cooldown", () => {
  const { run, squad } = stage(); squad.skillClock = 0; squad.awakened = 1;
  const pack = Array.from({ length: 8 }, (_, i) => foe(run, { x: 50 + i % 4 * 10, y: 110 + Math.floor(i / 4) * 10 }));
  useSkill(run, 0);
  expect(1e6 - pack[0].hp).toBeCloseTo(BALANCE.volleyPower * might(run), 6);
  expect(squad.skillClock).toBe(BALANCE.cooldown.권율);
  fight(run, .6);
  expect(1e6 - pack[0].hp).toBeCloseTo(2 * BALANCE.volleyPower * might(run), 6);
  squad.skillClock = 0; squad.awakened = 2; useSkill(run, 0);
  expect(squad.skillClock).toBe(BALANCE.cooldown.권율 / 2);
});
test("every attack winds up before it strikes and projectiles deal their damage on arrival", () => {
  const { run, squad } = stage();
  fight(run, .5);
  const bow = squad.soldiers.findIndex(unit => unit.kind === "archer"), archer = squad.soldiers[bow];
  const target = foe(run, { x: archer.x + 100, y: archer.y - 20 });
  archer.clock = 0;
  const start = run.time, first = advance(run, .05);
  expect(first.some(effect => effect.kind === "windup" && effect.squad === 0 && effect.index === bow && effect.value === ARMS.archer.windup)).toBe(true);
  expect(first.some(effect => effect.kind === "shot" || effect.kind === "hit")).toBe(false);
  let loosed = 0;
  while (!run.shots.length) { advance(run, .05); loosed = run.time - start; }
  expect(loosed).toBeGreaterThanOrEqual(ARMS.archer.windup); expect(loosed).toBeLessThanOrEqual(ARMS.archer.windup + .11);
  expect(target.hp).toBe(1e6); expect(run.shots[0].target).toBe(target.id);
  const flight = run.time;
  while (run.shots.length) advance(run, .05);
  expect(target.hp).toBeLessThan(1e6);
  expect(run.time - flight).toBeGreaterThan(.15); expect(run.time - flight).toBeLessThan(.5);

  const spear = squad.soldiers.findIndex(unit => unit.kind === "spearman"), spearman = squad.soldiers[spear];
  const adjacent = foe(run, { x: spearman.x, y: spearman.y - 25 });
  spearman.clock = 0;
  expect(advance(run, .05).some(effect => effect.kind === "windup" && effect.index === spear)).toBe(true);
  expect(adjacent.hp).toBe(1e6);
  const swing = fight(run, .4);
  expect(swing.some(effect => effect.kind === "swing" && effect.index === spear && effect.by === "spearman")).toBe(true);
  expect(swing.some(effect => effect.kind === "hit" && effect.target === adjacent.id)).toBe(true);
  expect(adjacent.hp).toBeLessThan(1e6);
});
test("every hit knocks its target back", () => {
  for (const [extra, share] of [[{}, 1], [{ elite: true }, .5], [{ boss: true }, .25]] as const) {
    const { run, squad } = stage();
    fight(run, 3);
    const spearman = squad.soldiers.find(unit => unit.kind === "spearman");
    if (!spearman) throw new Error("권율 starts with a spearman");
    const clear = guardPoint(run.fort, "아래", 4); spearman.x = clear.x; spearman.y = clear.y;
    const out = Math.atan2(spearman.y - CENTER.y, spearman.x - CENTER.x);
    const target = foe(run, { x: spearman.x + Math.cos(out) * 32, y: spearman.y + Math.sin(out) * 32 }, extra);
    const before = { x: target.x, y: target.y };
    spearman.clock = 0;
    fight(run, .4);
    expect(target.hp).toBeLessThan(1e6);
    expect(distance(before, target)).toBeCloseTo(ARMS.spearman.knock * share, 4);
  }
});
test("no blow is a chip: a general's blow keeps taking at least a sixth of a same-minute regular enemy", () => {
  const run = createRun(42), sample = play(POLICIES.timed, 42), reached = sample.metrics.levelTimes;
  expect(sample.time).toBeGreaterThan(120);
  for (let time = 0; time <= Math.min(540, sample.time); time += 60) {
    run.level = 1 + reached.filter(at => at <= time).length;
    expect(might(run) * ARMS.general.power).toBeGreaterThanOrEqual(BALANCE.enemyHp * toughness(time) / 6);
  }
});
test("enemies are fast and riders are faster", () => {
  const run = createRun(42);
  expect(new Set(run.enemies.map(enemy => enemy.kind))).toEqual(new Set(["yari"]));
  run.time = 180; run.wall = run.maxWall; run.base = run.maxBase;
  fight(run, 4);
  const regular = run.enemies.filter(e => e.kind !== "cavalry" && e.kind !== "ship" && !e.boss && !e.elite), riders = run.enemies.filter(e => e.kind === "cavalry");
  expect(riders.length).toBeGreaterThan(0);
  expect(BALANCE.fastSpeed).toBeGreaterThanOrEqual(1.8);
  for (const enemy of regular) {
    expect(enemy.speed).toBeGreaterThanOrEqual(3 * STAGE3_FASTEST_ENEMY);
    expect(enemy.speed).toBeGreaterThanOrEqual(BALANCE.enemySpeed * .88 * .9 - 1e-9); expect(enemy.speed).toBeLessThanOrEqual(BALANCE.enemySpeed * 1.15 * (1 + run.time / 1200) + 1e-9);
  }
  for (const enemy of riders) {
    expect(enemy.speed).toBeGreaterThanOrEqual(BALANCE.enemySpeed * BALANCE.fastSpeed * .9 - 1e-9);
    expect(enemy.speed).toBeLessThanOrEqual(BALANCE.enemySpeed * BALANCE.fastSpeed * 1.15 * (1 + run.time / 1200) + 1e-9);
  }
});
test("three offers hold a wall weapon and a class reward, with owned classes returning as upgrades", () => {
  const run = createRun(42); bench(run, ["권율", "김시민", "곽재우"]);
  for (let draw = 0; draw < 200; draw++) {
    const offers = drawCards(run);
    expect(new Set(offers).size).toBe(3);
    expect(["arrow", "hwacha", "rift"]).toContain(offers[0]);
    expect(offers[1].startsWith("recruit-") || offers[1].startsWith("upgrade-")).toBe(true);
  }
  run.wall = run.maxWall * .2;
  for (let draw = 0; draw < 50; draw++) expect(drawCards(run).every(card => !/repair/.test(card))).toBe(true);
  run.arrow = run.hwacha = 5; run.wall = run.maxWall;
  for (let draw = 0; draw < 50; draw++) expect(drawCards(run).some(card => card === "arrow" || card === "hwacha")).toBe(false);
  const every: CardId[] = ["arrow", "hwacha", "quiver", "powder", "fire", "curse", "rift", "recruit-spearman", "recruit-archer", "recruit-hwacha", "recruit-monk",
    "awaken-권율", "awaken-김시민", "awaken-곽재우"];
  for (const awakened of [0, 1]) {
    for (const squad of run.squads) { squad.awakened = awakened; squad.tier = awakened + 1; }
    for (const card of every) {
      const text = cardText(run, card);
      expect(text.name.length).toBeGreaterThan(0); expect(text.name.length).toBeLessThanOrEqual(8);
      expect(text.line.length).toBeGreaterThan(0); expect(text.line.length).toBeLessThanOrEqual(14);
    }
  }
  expect(cardText(run, "arrow").pips).toBe(6);
  run.arrow = 2; run.phase = "choice"; run.offers = ["arrow", "recruit-monk", "awaken-김시민"];
  expect(cardText(run, "arrow").pips).toBe(3);
  choose(run, "awaken-김시민");
  expect(run.squads[1].awakened).toBe(2); expect(run.squads[1].skillClock).toBe(0);
  for (const squad of run.squads) { squad.awakened = 2; squad.tier = 3; }
  for (let draw = 0; draw < 50; draw++) expect(drawCards(run).some(card => card.startsWith("awaken-"))).toBe(false);
});
test("sieges add weapon slots without repairing the four walls and the footprint stays five by five", () => {
  const run = createRun(42); bench(run);
  expect(weaponSlots(run.fort)).toHaveLength(2);
  run.time = 209.95; advance(run, .1);
  expect(run.fort).toBe(1); expect(run.maxWall).toBe(BALANCE.wall); expect(weaponSlots(run.fort)).toHaveLength(3);
  advance(run, .1); expect(run.fort).toBe(1); expect(run.maxWall).toBe(BALANCE.wall);
  run.time = 419.95; advance(run, .1);
  expect(run.fort).toBe(2); expect(run.maxWall).toBe(BALANCE.wall); expect(weaponSlots(run.fort)).toHaveLength(4);
  advance(run, .1); expect(run.fort).toBe(2); expect(run.maxWall).toBe(BALANCE.wall);
  const sizes = [0, 1, 2].map(level => fortRect(level));
  expect(sizes[1]).toEqual(sizes[0]); expect(sizes[2]).toEqual(sizes[0]);
  expect(sizes[0].right - sizes[0].left).toBe(160); expect(sizes[0].bottom - sizes[0].top).toBe(176);
});
test("endless is locked before victory and continues beyond ten minutes", () => {
  const run = createRun(42); expect(() => enterEndless(run)).toThrow();
  bench(run, ["권율", "김시민", "곽재우"]); run.phase = "won"; run.time = 600; run.finalDefeated = true;
  enterEndless(run); advance(run, .1);
  expect(run).toHaveProperty("phase", "playing"); expect(run.endless).toBe(true); expect(run.time).toBeGreaterThan(600);
});
test("a player who never fires a skill loses the wall within two and a half minutes", () => {
  for (const seed of [42, 1593, 77]) {
    const run = play(POLICIES.idle, seed);
    expect(run.phase).toBe("lost"); expect(run.time).toBeLessThan(150);
    expect(run.metrics.skills).toEqual([0, 0, 0]); expect(run.base).toBe(0);
  }
});
test("timing the skills keeps the generals out of the enemy's warned skills", () => {
  const seeds = [42, 1593, 77, 7];
  const mash = seeds.map(seed => play(POLICIES.mash, seed)), timed = seeds.map(seed => play(POLICIES.timed, seed));
  const struck = (runs: Run[]) => runs.reduce((sum, run) => sum + run.metrics.generalsStruck, 0);
  expect(struck(timed)).toBeLessThan(struck(mash));
  expect(timed.reduce((sum, run) => sum + run.metrics.blockedCasts + run.metrics.interrupts, 0)).toBeGreaterThan(seeds.length * 10);
  const idle = seeds.map(seed => play(POLICIES.idle, seed));
  timed.forEach((run, order) => expect(run.time).toBeGreaterThan(idle[order].time * 1.5));
});
test("a veteran timed run that wins keeps the whole ten-minute arc on schedule", () => {
  // Owner DMs 1794626233.833599 / 1794626251.975969 require a fresh
  // profile to lose near 1:00. The complete arc is a veteran contract now;
  // none of the schedule, density, damage or effect thresholds below change.
  // Use a legal partial tree, not completion power: the latter kills threats
  // before this continuity fixture can exercise their warnings and interrupts.
  const meta = freshMeta();
  meta.nodes = TREE_NODES.filter(node => (node.spine || node.rank === 1)
    && !["hero3", "keep5", "keep6", "startFire"].includes(node.id)).map(node => node.id);
  meta.nodes.push("body2");
  const run = play(POLICIES.timed, 7, .05, bonusesOf(meta)), levels = run.metrics.levelTimes;
  if (run.phase !== "won") console.error("VETERAN_RUNTIME_FAILURE", JSON.stringify({
    phase: run.phase, time: run.time, cause: run.lossCause, base: run.base, wall: run.wall,
    finalDefeated: run.finalDefeated, skills: run.metrics.skills, taken: run.metrics.taken,
    damage: run.metrics.damage, downs: run.metrics.downs, finalBosses: run.metrics.bosses.slice(-2),
    survivingLadders: run.enemies.filter(enemy => enemy.hp > 0 && enemy.ladder).slice(0, 8)
      .map(enemy => ({ hp: enemy.hp, maxHp: enemy.maxHp, x: enemy.x, y: enemy.y, breach: enemy.breach })),
    finalBoss: run.enemies.filter(enemy => enemy.kind === "ukita").map(enemy => ({ hp: enemy.hp, maxHp: enemy.maxHp })),
  }));
  expect(run.phase).toBe("won"); expect(run.finalDefeated).toBe(true);
  expect(run.time).toBeGreaterThan(FINAL_BOSS_AT); expect(run.time).toBeLessThanOrEqual(DURATION);
  expect(run.squads).toHaveLength(3);
  expect(run.metrics.generalTimes.map(Math.round)).toEqual([9, 25]);
  expect(run.metrics.quietSegments).toBe(0); expect(run.metrics.maxQuietSeconds).toBeLessThanOrEqual(3);
  expect(levels[0]).toBeGreaterThanOrEqual(8); expect(levels[0]).toBeLessThanOrEqual(10);
  expect(levels[1]).toBeCloseTo(25, 0);
  expect(levels.length).toBeGreaterThanOrEqual(15); expect(levels.length).toBeLessThanOrEqual(24);
  expect(run.metrics.waves.map(Math.round)).toEqual([210, 420]); expect(run.metrics.waveWarnings.map(Math.round)).toEqual([200, 410]);
  expect(run.metrics.evolutionTimes.length).toBeGreaterThanOrEqual(1);
  expect(run.metrics.evolutionTimes.every(time => time >= 300 && time <= 540)).toBe(true);
  expect(run.metrics.maxEventGap).toBeLessThanOrEqual(120);
  expect(Math.max(...run.metrics.density.map(sample => sample.count))).toBeLessThanOrEqual(222);
  expect(run.metrics.merges).toBe(0); expect(run.metrics.chests).toBeGreaterThan(20);
  expect(run.metrics.assaultShifts).toBe(Math.floor((run.time + ASSAULT_WARNING) / ASSAULT_PERIOD));
  expect(run.metrics.finalDefeatedAt).toBeGreaterThan(FINAL_BOSS_AT);
  expect(run.metrics.damage.squads.every(dealt => dealt > 0)).toBe(true);
  expect(run.metrics.damage.weapon).toBeGreaterThan(0); expect(run.metrics.damage.skill).toBeGreaterThan(0);
  expect(run.metrics.skills.every(count => count > 10)).toBe(true);
  // Militia Ambush's one-second arrival stun suppresses enemy casts, and soldiers filling the nearest
  // enemy's contact ring kill casters sooner (13 warnings on this fixture).
  expect(run.metrics.telegraphs).toBeGreaterThanOrEqual(12); expect(run.metrics.taken.every(amount => amount > 0)).toBe(true);
});
test("growth opens at nine and twenty-five seconds, then time and kills fill a requirement that rises with the level", () => {
  expect([1, 2].map(levelSeconds)).toEqual([9, 16]);
  for (let level = 3; level < 30; level++) expect(levelSeconds(level + 1)).toBeGreaterThan(levelSeconds(level));
  const { run, squad } = stage(); run.level = 5; run.nextXp = levelSeconds(5); run.xp = 0;
  fight(run, 10);
  expect(run.xp).toBeCloseTo(10 * BALANCE.passiveXp, 5);
  for (let i = 0; i < 8; i++) foe(run, { x: 60 + i % 4 * 8, y: 120 + Math.floor(i / 4) * 8 }, { hp: 1, maxHp: 1, elite: i === 0 });
  const before = run.xp; squad.skillClock = 0; useSkill(run, 0);
  expect(run.xp - before).toBeCloseTo(BALANCE.killXp * (7 + 12), 5);
  const opening = stage();
  for (let i = 0; i < 8; i++) foe(opening.run, { x: 60 + i % 4 * 8, y: 120 + Math.floor(i / 4) * 8 }, { hp: 1, maxHp: 1 });
  opening.run.xp = 0; opening.squad.skillClock = 0; useSkill(opening.run, 0);
  expect(opening.run.kills).toBe(8); expect(opening.run.xp).toBe(0);
});
test("reinforcements slow as the field crowds and stop at the cap, above a floor that keeps the field busy", () => {
  const run = createRun(42); bench(run); disarm(run);
  while (run.enemies.length < targetDensity(run)) run.enemies.push({ ...run.enemies[0], id: run.nextId++ });
  expect(spawnRate(run)).toBe(0);
  run.enemies = run.enemies.slice(0, 22);
  expect(spawnRate(run)).toBeCloseTo(BALANCE.spawnBase * Math.max(0, 1 - (22 / targetDensity(run)) ** BALANCE.crowdPower));
  run.time = 600; run.enemies = [];
  expect(spawnRate(run)).toBeCloseTo(BALANCE.spawnBase + 600 / BALANCE.spawnSpan);
  run.time = BALANCE.rampAt; run.spawnBudget = 0;
  const floor = Math.floor(targetDensity(run) * BALANCE.fieldFloor);
  advance(run, .05);
  expect(floor).toBeGreaterThan(0); expect(run.enemies.length).toBe(floor);
  fight(run, 2);
  const arrived = run.enemies.length - floor;
  expect(arrived).toBeGreaterThanOrEqual(Math.floor(BALANCE.spawnBase * 2 * .7)); expect(arrived).toBeLessThanOrEqual(Math.ceil((BALANCE.spawnBase + (BALANCE.rampAt + 2) / BALANCE.spawnSpan) * 2));
  fight(run, 50);
  expect(run.enemies.length).toBeGreaterThanOrEqual(targetDensity(run) * .8); expect(run.enemies.length).toBeLessThanOrEqual(targetDensity(run));
});
test("the final boss is announced ten seconds ahead, arrives on that side and his fall routs the whole army outward", () => {
  const run = createRun(42); bench(run); run.time = FINAL_BOSS_AT - 10.05;
  const herald = advance(run, .1).find(effect => effect.kind === "assault" && effect.value === 10);
  expect(herald?.side).toBe(assaultSide(run, FINAL_BOSS_AT)); expect(run.bossWarned).toBe(true);
  expect(advance(run, .1).some(effect => effect.kind === "assault" && effect.value === 10)).toBe(false);
  run.time = FINAL_BOSS_AT - .05; advance(run, .1);
  const chief = run.enemies.find(enemy => enemy.kind === "ukita");
  if (!chief) throw new Error("The final boss must arrive at his time");
  expect(chief.direction).toBe(assaultSide(run)); expect(chief.boss).toBe(true); expect(run.bossSpawned).toBe(true);
  expect(run.enemies.filter(enemy => enemy.direction === chief.direction).length).toBeGreaterThan(30);
  chief.hp = 1; chief.x = CENTER.x; chief.y = 60; run.squads[0].skillClock = 0;
  run.enemies = [chief]; run.spawnBudget = -1e9;
  for (let i = 0; i < 20; i++) foe(run, { x: 10 + i % 10 * 40, y: i < 10 ? 300 : HEIGHT - 10 });
  for (let i = 0; i < 6; i++) foe(run, { x: chief.x - 12 + i % 3 * 12, y: chief.y - 6 + Math.floor(i / 3) * 12 }, { hp: 1, maxHp: 1 });
  const fall = useSkill(run, 0);
  expect(fall.some(effect => effect.kind === "rout")).toBe(true);
  expect(run.finalDefeated).toBe(true); expect(run.rout).not.toBeNull(); expect(run.metrics.finalDefeatedAt).toBe(run.time);
  const fled = run.time;
  while (run.phase === "playing") advance(run, .05);
  expect(run.phase).toBe("won"); expect(run.enemies).toHaveLength(0);
  expect(run.time - fled).toBeGreaterThanOrEqual(BALANCE.routSeconds - .06); expect(run.time).toBeLessThan(DURATION);
});
test("generals fight in person with a short cleave credited to their squad", () => {
  const { run, squad } = stage();
  // Every pair stands at least ENEMY_SPACING apart before and after the radial knock, and the one left unstruck (farthest from
  // the nearest target) stands beside the pack rather than behind it, so enemy separation adds nothing to the knock being measured.
  const near = [[30, 0], [34, 22], [34, -22], [54, 11], [54, -11], [20, 38]].map(([dx, dy]) => foe(run, { x: squad.x + dx, y: squad.y + dy })), lone = foe(run, { x: squad.x + 30, y: squad.y + 120 });
  const gaps = near.map(enemy => distance(squad, enemy));
  squad.clock = 0;
  const effects = fight(run, .5), hits = effects.filter(effect => effect.kind === "hit");
  expect(effects.some(effect => effect.kind === "windup" && effect.squad === 0 && effect.index === -1)).toBe(true);
  expect(effects.some(effect => effect.kind === "swing" && effect.by === "general" && effect.squad === 0)).toBe(true);
  expect(hits).toHaveLength(ARMS.general.cleave);
  for (const hit of hits) expect(hit.value).toBe(Math.round(might(run) * ARMS.general.power * (hit.critical ? 2 : 1)));
  expect(lone.hp).toBe(1e6);
  const dealt = near.reduce((sum, enemy) => sum + 1e6 - enemy.hp, 0);
  expect(run.metrics.damage.squads[0]).toBeCloseTo(dealt, 4);
  expect(effects.find(effect => effect.kind === "total")?.value).toBe(Math.round(dealt));
  near.forEach((enemy, index) => { if (enemy.hp < 1e6) expect(distance(squad, enemy)).toBeGreaterThan(gaps[index] + ARMS.general.knock - 1); });
});
test("a general in range attacks within half a second and stays locked on that enemy while it lives in range", () => {
  const { run, squad } = stage();
  run.commandClock = 1e9;
  const first = foe(run, { x: squad.x + 30, y: squad.y - 10 });
  squad.clock = 0;
  const opening = fight(run, .5);
  expect(opening.some(effect => effect.kind === "swing" && effect.by === "general" && effect.squad === 0)).toBe(true);
  // A boss walks in nearby: pick() would prefer it, the lock keeps the general on his enemy.
  foe(run, { x: squad.x - 34, y: squad.y + 6 }, { boss: true });
  const held = fight(run, 4).filter(effect => effect.kind === "windup" && effect.squad === 0 && effect.index === -1);
  expect(held.length).toBeGreaterThanOrEqual(3);
  expect(squad.aim).toBe(first.id);
  expect(distance(squad, first)).toBeLessThan(ARMS.general.reach + rules.LOCK_SLACK);
  first.hp = 0;
  fight(run, 1.5);
  expect(squad.aim).not.toBe(first.id);
});
test("wall weapons cover every side and shoot unguarded attackers first", () => {
  const { run, squad } = stage(), wall = fortRect(run.fort);
  const guarded = foe(run, { x: squad.x, y: squad.y - 30 }), open = foe(run, { x: CENTER.x, y: wall.bottom + 40 });
  expect(distance(guarded, squad)).toBeLessThan(BALANCE.guardRadius);
  run.arrowClock = 0;
  advance(run, .05);
  expect(run.shots.map(shot => shot.target)).toEqual([open.id]);
  run.shots = []; run.enemies = run.enemies.filter(enemy => enemy !== guarded && enemy !== open);
  const ring = [{ x: CENTER.x, y: wall.top - 60 }, { x: wall.left - 60, y: CENTER.y }, { x: wall.right + 60, y: CENTER.y }, { x: CENTER.x, y: wall.bottom + 60 }].map(at => foe(run, at));
  squad.state = "down"; squad.downUntil = 1e9;
  run.arrow = 4; run.arrowClock = 0; run.hwacha = 4; run.hwachaClock = 0;
  advance(run, .05);
  const arrows = run.shots.filter(shot => shot.kind === "arrow"), rockets = run.shots.filter(shot => shot.kind === "rocket");
  expect(new Set(arrows.map(shot => shot.target))).toEqual(new Set(ring.map(enemy => enemy.id)));
  expect(rockets).toHaveLength(4);
  expect(new Set(rockets.map(shot => `${Math.round(shot.toX)},${Math.round(shot.toY)}`)).size).toBe(4);
});
test("wall cannon waves attack without blocking damage to units or castle", () => {
  const { run, squad } = stage(42, ["권율", "김시민"]), wall = fortRect(run.fort);
  squad.soldiers = []; run.squads[1].soldiers = [];
  place(run.squads[1], guardPoint(run.fort, "좌", BALANCE.guardGap));
  fight(run, .5);
  foe(run, { x: squad.x + 15, y: squad.y }, { speed: 20 });
  const sapper = foe(run, { x: CENTER.x, y: wall.bottom + 14 }, { speed: 30, goalX: CENTER.x, goalY: wall.bottom + 14, wave: true });
  const exposed = fight(run, 3), taken = run.metrics.taken[0], stone = run.wall;
  expect(exposed.some(effect => effect.kind === "hurt")).toBe(true); expect(exposed.some(effect => effect.kind === "wall")).toBe(true);
  expect(taken).toBeGreaterThan(0); expect(stone).toBeLessThan(run.maxWall);
  run.squads[1].skillClock = 0;
  expect(useSkill(run, 1).some(effect => effect.kind === "skill")).toBe(true);
  expect(run.shieldUntil).toBe(0);
  expect(run.chaosSkills?.events.every(event => event.kind === "cannon")).toBe(true);
  const held = fight(run, BALANCE.shieldSeconds - .1);
  expect(run.metrics.taken[0]).toBeGreaterThan(taken); expect(run.wall).toBeLessThan(stone);
  expect(held.some(effect => effect.kind === "block")).toBe(false); expect(held.some(effect => effect.kind === "hurt" || effect.kind === "wall")).toBe(true);
  expect(run.metrics.blocked).toBe(0);
  const after = fight(run, 4);
  expect(after.some(effect => effect.kind === "hurt")).toBe(true); expect(after.some(effect => effect.kind === "wall")).toBe(true);
  expect(run.metrics.taken[0]).toBeGreaterThan(taken); expect(run.wall).toBeLessThan(stone);
});
test("missing maximum level or matching support prevents chest evolution", () => {
  const open = (setup: (run: Run) => void) => {
    const run = createRun(2); bench(run); run.time = 400; setup(run);
    run.chests.push({ id: 900, x: 195, y: 350 });
    advance(run, .05);
    return run.roulette?.evolution;
  };
  expect(open(run => { run.hwacha = 2; run.powder = true; })).toBeNull();
  expect(open(run => { run.hwacha = 3; })).toBeNull();
  expect(open(run => { run.arrow = 3; })).toBeNull();
  expect(open(run => { run.arrow = 3; run.quiver = true; })).toBe("arrow");
  expect(open(run => { run.arrow = 3; run.quiver = true; run.hwacha = 3; run.powder = true; })).toBe("hwacha");
  expect(open(run => { run.arrow = 3; run.quiver = true; run.hwacha = 3; run.powder = true; run.evolutions = ["hwacha"]; })).toBe("arrow");
});
test("legend is withheld for sixty seconds after an evolution", () => {
  const run = createRun(0x1593); run.lastEvolution = 0;
  for (let i = 0; i < 10000; i++) expect(drawCards(run)).not.toContain("rift");
  run.time = 61;
  expect(Array.from({ length: 10000 }, () => drawCards(run)).some(offers => offers.includes("rift"))).toBe(true);
});
test("normal enemy types rotate every minute without replacing living enemies", () => {
  const run = createRun(42); bench(run); disarm(run);
  const featured = ["yari", "teppo", "samurai", "cavalry"] as const;
  for (let minute = 0; minute < 4; minute++) {
    const kinds: string[] = [];
    run.time = minute * 60 + 1;
    for (let draw = 0; draw < 60; draw++) { run.enemies = []; run.spawnBudget = 8; advance(run, .05); kinds.push(...run.enemies.filter(enemy => enemy.kind !== "ship" && !enemy.elite && !enemy.boss).map(enemy => enemy.kind)); }
    const share = (kind: string) => kinds.filter(found => found === kind).length / kinds.length;
    expect(kinds.length).toBeGreaterThan(400);
    expect(share(featured[minute])).toBeGreaterThan(.44);
    if (minute < 3) expect(share("cavalry")).toBe(0);
    else expect(share("cavalry")).toBeGreaterThan(.44);
    expect(kinds.every(kind => featured.slice(0, minute + 1).includes(kind as rules.EnemyKind & typeof featured[number]))).toBe(true);
  }
  const live = createRun(42); bench(live); disarm(live); live.time = 59.95;
  const before = new Map(live.enemies.map(enemy => [enemy.id, enemy.kind]));
  advance(live, .1);
  for (const enemy of live.enemies) if (before.has(enemy.id)) expect(enemy.kind).toBe(before.get(enemy.id)!);
  expect(live.metrics.enemyChanges.at(-1)).toEqual({ time: live.time, kind: "teppo" });
});
test("encirclement warns ten seconds early, closes in from all four edges and rewards survival", () => {
  const run = createRun(42); bench(run); run.time = 199.95;
  advance(run, .1);
  expect(run.warnedWave).toBe(true); expect(run.metrics.waveWarnings).toHaveLength(1);
  run.time = 209.95;
  const start = advance(run, .1), wave = run.enemies.flatMap(enemy => enemy.cargo ?? [enemy]).filter(enemy => enemy.wave);
  expect(start.some(effect => effect.kind === "wave")).toBe(true);
  expect(start.some(effect => effect.kind === "event" && effect.hostile)).toBe(true);
  expect(wave).toHaveLength(48); expect(wave.every(enemy => enemy.kind === "samurai")).toBe(true);
  for (const side of SIDES) expect(wave.filter(enemy => enemy.direction === side)).toHaveLength(12);
  expect(run.waveUntil).toBeCloseTo(run.time + 25, 6); expect(directionWeights(run)).toEqual([.25, .25, .25, .25]);
  expect(run.metrics.waves).toHaveLength(1); expect(run.nextWave).toBe(420);
  run.time = run.waveUntil - .05; advance(run, .1);
  expect(run.waveUntil).toBe(0);
  expect(run.roulette).not.toBeNull(); expect(run).toHaveProperty("phase", "playing");
});
test("weapon cooldowns preserve the 1.2-second and 0.15-second cadence across frames", () => {
  expect(ATTACK_INTERVALS.basic).toBe(1.2); expect(ATTACK_INTERVALS.fast).toBe(.15);
  const { run } = stage(), wall = fortRect(run.fort);
  for (const shift of [-70, 0, 70]) foe(run, { x: CENTER.x + shift, y: wall.bottom + 50 }, { hp: 1e12, maxHp: 1e12 });
  run.arrow = 3; run.arrowClock = 0;
  for (let frame = 0; frame < 360; frame++) advance(run, 1 / 30);
  expect(run.metrics.weaponShots.arrow % 3).toBe(0);
  expect(run.metrics.weaponShots.arrow / 3).toBeGreaterThanOrEqual(10); expect(run.metrics.weaponShots.arrow / 3).toBeLessThanOrEqual(11);
  run.evolutions = ["arrow"]; run.metrics.weaponShots.arrow = 0; run.arrowClock = 0;
  for (let frame = 0; frame < 90; frame++) advance(run, 1 / 30);
  expect(run.metrics.weaponShots.arrow).toBeGreaterThanOrEqual(19); expect(run.metrics.weaponShots.arrow).toBeLessThanOrEqual(21);
  run.arrowClock = 1e9; run.hwacha = 2; run.hwachaClock = 0;
  for (let frame = 0; frame < 360; frame++) advance(run, 1 / 30);
  expect(run.metrics.weaponShots.hwacha % 2).toBe(0);
  expect(run.metrics.weaponShots.hwacha / 2).toBeGreaterThanOrEqual(5); expect(run.metrics.weaponShots.hwacha / 2).toBeLessThanOrEqual(6);
});

test("an enemy with a soldier in range attacks the soldier before the wall, and the wall once nobody is near", () => {
  const { run, squad } = stage();
  squad.soldiers = [soldier("archer", 1, CENTER)];
  squad.soldiers[0].clock = 1e9;
  fight(run, 2);
  squad.x = squad.targetX = 20; squad.y = squad.targetY = HEIGHT - 20;
  const guard = squad.soldiers[0], out = Math.atan2(guard.y - CENTER.y, guard.x - CENTER.x);
  const raider = foe(run, { x: guard.x + Math.cos(out) * 50, y: guard.y + Math.sin(out) * 50 }, { speed: 30 });
  const health = guard.hp, stone = run.wall, first = fight(run, 2);
  expect(raider.prey).toEqual([0, 0]);
  expect(first.some(effect => effect.kind === "lunge" && effect.target === raider.id)).toBe(true);
  expect(first.some(effect => effect.kind === "hurt" && effect.index === 0 && effect.target === raider.id)).toBe(true);
  expect(guard.hp).toBeLessThan(health);
  expect(first.some(effect => effect.kind === "wall")).toBe(false); expect(run.wall).toBe(stone);
  for (const mate of squad.soldiers) { mate.hp = 0; mate.downUntil = 1e9; }
  place(squad, { x: 20, y: HEIGHT - 20 }); squad.soldiers.forEach(mate => { mate.x = guard.x; mate.y = guard.y; });
  const later = fight(run, 3);
  expect(raider.prey).toBeNull();
  expect(later.some(effect => effect.kind === "wall" && effect.target === raider.id)).toBe(true); expect(run.wall).toBeLessThan(stone);
});
test("ranged soldiers take vacant wall posts while melee soldiers fight outside the gate", () => {
  const { run, squad } = stage(), wall = fortRect(run.fort);
  fight(run, 3);
  const ranged = squad.soldiers.filter(unit => unit.kind === "archer" || unit.kind === "hwacha");
  for (const unit of squad.soldiers) expect(contains(wall, unit)).toBe(unit.kind === "archer" || unit.kind === "hwacha");
  expect(contains(wall, squad)).toBe(false);
  expect(new Set(ranged.map(unit => unit.perch)).size).toBe(ranged.length);
  const perches = ranged.map(unit => ({ x: unit.x, y: unit.y }));
  squad.hp = 0; squad.state = "down"; squad.downUntil = run.time + 5;
  const archer = squad.soldiers.find(unit => unit.kind === "archer");
  if (!archer) throw new Error("권율 starts with an archer");
  const out = Math.atan2(archer.y - CENTER.y, archer.x - CENTER.x), target = foe(run, { x: archer.x + Math.cos(out) * 70, y: archer.y + Math.sin(out) * 70 });
  archer.clock = 0;
  const effects = fight(run, 1.5);
  expect(effects.some(effect => effect.kind === "shot" && effect.by === "archer")).toBe(true); expect(target.hp).toBeLessThan(1e6);
  expect(ranged.map(unit => ({ x: unit.x, y: unit.y }))).toEqual(perches);
});

test("a fallen general walks back into the gate, waits thirty seconds and comes out unhurt for a moment", () => {
  const { run, squad } = stage();
  fight(run, .5); squad.hp = 1; squad.hurtAt = run.time;
  const killer = foe(run, { x: squad.x + 14, y: squad.y });
  fight(run, 1);
  expect(squad.state).toBe("down"); expect(BALANCE.downSeconds).toBe(30);
  const fell = squad.downUntil - BALANCE.downSeconds, tent = { x: CENTER.x - 36, y: CENTER.y + 20 };
  fight(run, 8);
  expect(distance(squad, tent)).toBeLessThan(1); expect(useSkill(run, squad.id)).toEqual([]); expect(killer.prey).toEqual([0, 0]);
  expect(squad.soldiers[0].hp).toBeGreaterThan(0);
  while (run.time < fell + BALANCE.downSeconds - .2) advance(run, .05);
  expect(squad.state).toBe("down");
  const rising = fight(run, .4);
  expect(squad.state).toBe("guard"); expect(rising.some(effect => effect.kind === "rise" && effect.squad === squad.id)).toBe(true);
  expect(squad.hp).toBe(squad.maxHp * .6); expect(squad.safeUntil).toBeGreaterThan(run.time);
  killer.x = squad.x + 14; killer.y = squad.y; killer.clock = 0;
  fight(run, 1.2);
  expect(squad.hp).toBe(squad.maxHp * .6);
  fight(run, 3);
  expect(squad.hp).toBeLessThan(squad.maxHp * .6);
});

test("kills pay gold, and gold buys class upgrades that make that class hit harder and last longer", () => {
  const { run, squad } = stage();
  fight(run, 2);
  const archer = squad.soldiers.find(unit => unit.kind === "archer");
  if (!archer) throw new Error("권율 starts with an archer");
  expect(run.gold).toBe(0); expect(upgradeCost(run, "archer")).toBe(BALANCE.drillCost); expect(upgradeCost(run, "monk")).toBeNull();
  expect(upgradeClass(run, "archer")).toEqual([]);
  const out = Math.atan2(archer.y - CENTER.y, archer.x - CENTER.x), at = { x: archer.x + Math.cos(out) * 70, y: archer.y + Math.sin(out) * 70 };
  const shoot = (): number => {
    const target = foe(run, at); archer.clock = 0; fight(run, 1.2);
    const dealt = 1e6 - target.hp; run.enemies = run.enemies.filter(enemy => enemy !== target);
    return dealt;
  };
  const plain = shoot();
  for (let i = 0; i < 3; i++) foe(run, { x: 40 + i * 10, y: 60 }, { hp: 1, maxHp: 1, elite: i === 0 });
  squad.skillClock = 0;
  expect(useSkill(run, 0).filter(effect => effect.kind === "coin").length).toBe(3);
  expect(run.gold).toBe(BALANCE.coin.elite + 2 * BALANCE.coin.foe); expect(run.earned).toBe(run.gold);
  run.roulette = null; run.chests = []; run.gold = BALANCE.drillCost;
  const bought = upgradeClass(run, "archer");
  expect(bought).toEqual([{ kind: "upgrade", x: CENTER.x, y: CENTER.y, value: 2, by: "archer" }]);
  expect(run.gold).toBe(0); expect(run.drill.archer).toBe(1); expect(upgradeCost(run, "archer")).toBe(1200);
  const drilled = shoot();
  expect(drilled / plain).toBeCloseTo(1.895, 1);
  const raider = foe(run, { x: archer.x + Math.cos(out) * 50, y: archer.y + Math.sin(out) * 50 });
  for (const mate of squad.soldiers) if (mate !== archer) { mate.hp = 0; mate.downUntil = 1e9; }
  const health = archer.hp, hits = fight(run, 2).filter(effect => effect.kind === "hurt" && effect.target === raider.id);
  expect(hits.length).toBeGreaterThan(0);
  run.drill.archer = BALANCE.drillMax; expect(upgradeCost(run, "archer")).toBeNull();
  expect(health - archer.hp).toBeGreaterThan(0);
});

test("generals hold their roles and a hunter only chases elites inside his activity radius", () => {
  const { run } = stage(42, ["권율", "김시민", "곽재우"]), wall = fortRect(run.fort);
  expect(STYLES).toMatchObject({ 권율: "guardian", 곽재우: "hunter", 김시민: "frontline" });
  const elite = foe(run, { x: 40, y: 80 }, { elite: true });
  run.commandClock = 0;
  for (let step = 0; step < 120; step++) { run.commandClock = Math.min(run.commandClock, .25); advance(run, .05); }
  const [guardian, support, hunter] = run.squads;
  expect(gapToRect(wall, guardian)).toBeLessThan(BALANCE.guardianGap + 8);
  expect(gapToRect(wall, support)).toBeGreaterThan(BALANCE.guardianGap + 8); expect(gapToRect(wall, support)).toBeLessThan(BALANCE.supportGap + 16);
  expect(distance(hunter, elite)).toBeGreaterThan(170);
  Object.assign(elite, { x: hunter.x, y: hunter.y + (hunter.post === "위" ? -70 : 70) });
  for (let step = 0; step < 60; step++) advance(run, .05);
  expect(distance(hunter, elite)).toBeLessThan(40);
  const guard = run.squads[0].soldiers[0];
  guard.hp = guard.maxHp / 2; advance(run, .05);
  const mended = guard.hp - guard.maxHp / 2;
  support.state = "down"; support.downUntil = 1e9; guard.hp = guard.maxHp / 2; advance(run, .05);
  expect(mended / (guard.hp - guard.maxHp / 2)).toBeCloseTo(BALANCE.supportRegen, 1);
});

test("barracks bonuses raise the starting wall and troops, and runs without them start as before", () => {
  const plain = createRun(42), boosted = createRun(42, "권율", { wallHp: 1.2, startTroops: 2, skillCharge: 1, goldGain: 1 });
  expect(boosted.maxWall).toBe(Math.round(plain.maxWall * 1.2)); expect(boosted.walls.위).toBe(boosted.maxWall / 4);
  expect(boosted.squads[0].soldiers.length).toBe(plain.squads[0].soldiers.length + 2);
  expect(createRun(42, "권율", rules.NO_META).maxWall).toBe(plain.maxWall);
});
