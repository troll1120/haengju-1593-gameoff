import { expect, test } from "bun:test";
import { advance, createRun, might, useSkill } from "./rules";
import type { Enemy, General, Run } from "./rules";
import { CENTER, contains, fortRect, guardPoint } from "./geometry";
import type { Point } from "./geometry";
import { COOLDOWNS, SKILL_NAMES } from "./roster";
import { holdDongnae, militiaAmbush, uniqueSkillSpeed, UNIQUE_SKILL_DESCRIPTIONS } from "./skills-unique";
import { setLanguage, t } from "./i18n";
import { riverBank } from "./river";

function fixture(general: General): Run {
  const run = createRun(42, general);
  run.enemies = []; run.weather = "맑음"; run.xp = -1e9; run.spawnBudget = -1e9;
  run.nextElite = run.nextBoss = run.nextWave = run.nextRiverWave = 1e9;
  run.commandClock = run.arrowClock = run.hwachaClock = 1e9;
  run.squads[0].soldiers = []; run.squads[0].clock = 1e9; run.squads[0].skillClock = 0;
  for (let index = 0; index < 25; index++) enemy(run, { x: -500, y: -500 - index * 20 }).kind = "ship";
  return run;
}
function enemy(run: Run, at: Point): Enemy {
  const foe: Enemy = { id: run.nextId++, kind: "yari", direction: "위", ...at, hp: 10000, maxHp: 10000,
    speed: 0, elite: false, boss: false, goalX: CENTER.x, goalY: fortRect(run.fort).top - 12,
    clock: 1e9, strikeAt: 0, prey: null, stun: 0, burn: 0, burnClock: 0, skillClock: 1e9, casting: 0, casts: 0 };
  run.enemies.push(foe);
  return foe;
}
function elapse(run: Run, seconds: number): void {
  for (let index = 0; index < Math.round(seconds * 20); index++) advance(run, .05);
}

test("Thunderstorm leaves movement speed unchanged and creates no defensive line", () => {
  const held = fixture("송상현"), control = fixture("송상현"), at = guardPoint(held.fort, "위", 40);
  const stormed = enemy(held, at), normal = enemy(control, at);
  stormed.speed = normal.speed = 24;
  useSkill(held, 0);
  advance(held, .1); advance(control, .1);
  expect(stormed.y - at.y).toBeCloseTo(normal.y - at.y, 8);
  expect(stormed.speed).toBe(24);
  expect(held.uniqueSkills).toBeUndefined();
});

test("the approved Song N0 storm has three delayed distributed waves and never slows or hits ships", () => {
  const run = fixture("송상현");
  useSkill(run, 0);
  const strikes = run.chaosSkills?.events ?? [];
  expect(strikes).toHaveLength(9);
  const wave = strikes.filter(strike => strike.wave === 0).map(strike => enemy(run, strike.to));
  const ship = enemy(run, strikes[0].to); ship.kind = "ship";
  elapse(run, .3);
  expect(wave.map(foe => (10000 - foe.hp) / might(run))).toEqual(Array(3).fill(expect.closeTo(1.8, 6)));
  expect(wave.map(foe => uniqueSkillSpeed(run, foe))).toEqual([1, 1, 1]);
  expect(ship.hp).toBe(10000);
  elapse(run, 2);
  expect(run.chaosSkills?.events).toEqual([]);
});

test("Militia Ambush strikes twice with four bodies then vanishes without moving or recruiting the general", () => {
  const run = fixture("곽재우"), at = guardPoint(run.fort, "위", 80), target = enemy(run, at);
  const squad = run.squads[0], start = { x: squad.x, y: squad.y }, ids = run.rng;
  const effects = useSkill(run, 0);
  const summon = run.uniqueSkills?.[0];

  expect(summon?.kind).toBe("ambush");
  if (summon?.kind !== "ambush") throw new Error("Missing ambush");
  expect(summon.members).toHaveLength(4);
  expect(target.hp).toBe(10000);
  elapse(run, 3.1);

  expect(10000 - target.hp).toBeCloseTo(5.6 * might(run), 6);
  expect(run.uniqueSkills).toEqual([]);
  expect(squad.lane).toBeNull(); expect(squad.state).toBe("guard");
  expect({ x: squad.x, y: squad.y }).toEqual(start);
  expect(squad.soldiers).toEqual([]); expect(run.rng).toBe(ids);
  expect(effects.find(effect => effect.kind === "skill")?.label).toBe(SKILL_NAMES.곽재우);
});

test("militia retargets living nearby enemies and native damage awards each kill once", () => {
  const run = fixture("곽재우"), at = guardPoint(run.fort, "위", 80);
  const wave = Array.from({ length: 4 }, () => enemy(run, at));
  for (const foe of wave) foe.hp = .5 * might(run);
  const distant = enemy(run, { x: at.x + 150, y: at.y }), ship = enemy(run, at); ship.kind = "ship";
  const gold = run.gold;
  useSkill(run, 0);

  elapse(run, 3.1);

  expect(run.kills).toBe(4); expect(run.gold - gold).toBe(4);
  expect(run.metrics.damage.skill).toBeCloseTo(2.8 * might(run), 6);
  expect(distant.hp).toBe(10000); expect(ship.hp).toBe(10000);
});

test("the militia surprise interrupts nearby casts with native boss resistance and leaves distant enemies alone", () => {
  const run = fixture("곽재우"), at = guardPoint(run.fort, "위", 80);
  const caster = enemy(run, at), ordinary = enemy(run, at), distant = enemy(run, { x: at.x + 150, y: at.y });
  caster.boss = true; caster.casting = run.nextId++;
  run.telegraphs.push({ id: caster.casting, owner: caster.id, skill: "gunner", shape: "circle", ...at,
    fromX: at.x, fromY: at.y, radius: 20, startedAt: 0, at: 1, damage: 50, wallDamage: 50 });

  useSkill(run, 0);

  expect(ordinary.stun).toBe(1); expect(caster.stun).toBe(.5); expect(distant.stun).toBe(0);
  expect(caster.casting).toBe(0); expect(run.telegraphs).toEqual([]);
  expect(run.metrics.interrupts).toBe(1);
});

test("each militia strike cleaves at most two close enemies with the same per-enemy damage budget", () => {
  const run = fixture("곽재우"), at = guardPoint(run.fort, "위", 80);
  const wave = Array.from({ length: 4 }, () => enemy(run, at));
  useSkill(run, 0);

  elapse(run, 3.1);

  expect(wave.map(foe => 10000 - foe.hp)).toEqual([
    expect.closeTo(5.6 * might(run), 6), expect.closeTo(5.6 * might(run), 6), 0, 0,
  ]);
  expect(run.metrics.damage.skill).toBeCloseTo(11.2 * might(run), 6);
});

test("an ambush targeting a breached courtyard spawns and attacks inside the courtyard", () => {
  const run = fixture("곽재우"), target = enemy(run, CENTER);
  target.breach = "아래"; run.walls.아래 = 0;
  useSkill(run, 0);
  const summon = run.uniqueSkills?.[0];
  if (summon?.kind !== "ambush") throw new Error("Missing ambush");

  expect(summon.members.every(member => contains(fortRect(run.fort, -16), member))).toBe(true);
  elapse(run, 3.1);
  expect(10000 - target.hp).toBeCloseTo(5.6 * might(run), 6);
});

test("the existing Red Fury awakening starts once when the ambush ends without adding militia", () => {
  const run = fixture("곽재우");
  run.squads[0].awakened = 1;
  enemy(run, guardPoint(run.fort, "위", 80));
  useSkill(run, 0);
  const summon = run.uniqueSkills?.[0];
  if (summon?.kind !== "ambush") throw new Error("Missing ambush");
  expect(summon.members).toHaveLength(4);

  elapse(run, 2.9);
  expect(run.squads[0].frenzyUntil).toBe(0);
  elapse(run, .2);
  expect(run.squads[0].frenzyUntil).toBeCloseTo(11, 6);
  elapse(run, 1);
  expect(run.squads[0].frenzyUntil).toBeCloseTo(11, 6);
});

test("N0 militia preserve attacks but never divert ladder carriers from their wall goal", () => {
  const run = fixture("곽재우"), at = guardPoint(run.fort, "위", 80);
  enemy(run, at);
  const ladder = enemy(run, guardPoint(run.fort, "위", 9));
  ladder.ladder = true; ladder.speed = 24; ladder.clock = 0;
  const wall = run.wall, startY = ladder.y, goal = { x: ladder.goalX, y: ladder.goalY };
  useSkill(run, 0);

  elapse(run, 1.9);

  expect(ladder.y).toBeGreaterThanOrEqual(startY);
  expect(run.wall).toBeLessThan(wall);
  expect({ x: ladder.goalX, y: ladder.goalY }).toEqual(goal);
  elapse(run, 4);
  expect(run.uniqueSkills).toEqual([]);
  expect(run.wall).toBeLessThan(wall);
});

test("a breached ladder continues toward the keep while outside militia are alive", () => {
  const run = fixture("곽재우"), wall = fortRect(run.fort);
  run.walls.아래 = 0;
  const ladder = enemy(run, { x: CENTER.x, y: wall.top + 8 });
  ladder.ladder = true; ladder.breach = "아래"; ladder.speed = 24;
  const start = ladder.y;
  useSkill(run, 0);

  elapse(run, 1.1);

  expect(ladder.y).toBeGreaterThan(start);
});

test("militia appearing at the river bank stay on land", () => {
  const run = fixture("곽재우");
  enemy(run, { x: CENTER.x, y: riverBank() - 8 });
  useSkill(run, 0);
  const summon = run.uniqueSkills?.[0];
  if (summon?.kind !== "ambush") throw new Error("Missing ambush");

  expect(summon.members.every(member => member.y <= riverBank() - 8)).toBe(true);
});

test.each(["송상현", "곽재우"] as const)("%s keeps tier and awakening damage factors on its actual attacks", general => {
  const run = fixture(general), at = guardPoint(run.fort, "위", 80);
  run.squads[0].tier = 2; run.squads[0].awakened = 1;
  const target = enemy(run, at);
  useSkill(run, 0);
  if (general === "송상현") {
    const strike = run.chaosSkills?.events[0];
    if (!strike) throw new Error("Missing thunder");
    const witness = enemy(run, strike.to);
    elapse(run, .3);
    expect(10000 - witness.hp).toBeCloseTo(1.8 * 1.25 * 1.15 * might(run), 6);
  } else {
    elapse(run, 5.1);
    expect(10000 - target.hp).toBeCloseTo(5.6 * 1.15 * might(run), 6);
  }
});

// The growth lane owns growthFor and the one activation hook; this is only its agreed test contract.
const growthFor = (_general: General, run: Run) => {
  const tier = run.level >= 10 ? 3 : run.level >= 5 ? 2 : 1;
  return { tier, mods: { lineLengthBonus: (tier - 1) * 24, militiaCountBonus: tier - 1 } };
};
test.each([1, 5, 10])("legacy optional modifiers retain militia counts but cannot restore the removed hold at level %i", level => {
  const held = fixture("송상현"), ambush = fixture("곽재우");
  held.level = ambush.level = level;
  const aim = guardPoint(held.fort, "위", 80), heldMods = growthFor("송상현", held), ambushMods = growthFor("곽재우", ambush);
  holdDongnae({ run: held, squad: held.squads[0], aim }, heldMods.mods);
  militiaAmbush({ run: ambush, squad: ambush.squads[0], aim }, ambushMods.mods);
  const line = held.uniqueSkills?.[0], summon = ambush.uniqueSkills?.[0];

  if (summon?.kind !== "ambush") throw new Error("Missing militia");
  expect(line).toBeUndefined();
  expect(held.chaosSkills?.events).toHaveLength(9);
  expect(summon.members).toHaveLength(4 + ambushMods.tier - 1);
});

test.each(["송상현", "곽재우"] as const)("%s replays identically from a cloned run and ignores repeat activation during cooldown", general => {
  const run = fixture(general), at = guardPoint(run.fort, "위", general === "송상현" ? 40 : 80);
  enemy(run, at);
  useSkill(run, 0);
  const replay = structuredClone(run);
  expect(useSkill(run, 0)).toEqual([]);

  elapse(run, 5.1); elapse(replay, 5.1);

  expect(run).toEqual(replay);
  expect(run.metrics.skills[0]).toBe(1);
});

test.each(["송상현", "곽재우"] as const)("%s retains a finite native N0 damage budget per cooldown", general => {
  const run = fixture(general), at = guardPoint(run.fort, "위", general === "송상현" ? 40 : 80);
  const target = enemy(run, at);
  useSkill(run, 0);
  elapse(run, 5.1);
  const amount = (10000 - target.hp) / might(run);
  if (general === "송상현") {
    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThanOrEqual(5.4 + 1e-8);
    expect(run.chaosSkills?.events).toEqual([]);
  } else {
    expect(amount / COOLDOWNS[general]).toBeCloseTo(.7, 6);
    expect(Math.abs(amount / COOLDOWNS[general] / ((5 / 8 + 8 / 10 + 4 / 10) / 3) - 1)).toBeLessThanOrEqual(.2);
  }
});

test("new skill names and descriptions resolve in both existing locales", () => {
  try {
    setLanguage("en");
    expect(t(SKILL_NAMES.송상현)).toBe("Thunder Rain");
    expect(t(SKILL_NAMES.곽재우)).toBe("Militia Ambush");
    for (const general of ["송상현", "곽재우"] as const) {
      const description = UNIQUE_SKILL_DESCRIPTIONS[general];
      if (!description) throw new Error("Missing description");
      expect(t(description)).not.toBe(description);
      setLanguage("ko"); expect(t(description)).toBe(description); setLanguage("en");
    }
  } finally { setLanguage("ko"); }
});
