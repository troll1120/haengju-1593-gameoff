import { expect, test } from "bun:test";
import { CHAOS_LEVELS, CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import type { ChaosContext, ChaosState } from "./chaos-contract";
import { chaosFleetAttack, tickChaosFleet } from "./chaos-fleet";
import { bphBattleMedals, createBphRun } from "./bph-session";
import { contains, fortRect } from "./geometry";
import { freshMeta } from "./meta";
import { riverBank } from "./river";
import { bphEffectCombat, createRun } from "./rules";
import type { Effect, Enemy } from "./rules";

function battle(level = 20, seed = 1593): ChaosContext {
  const run = createBphRun(freshMeta(), { seed, general: "이순신", upgrades: [] });
  const mods = CHAOS_LEVELS.이순신[level];
  if (!mods || mods.general !== "이순신") throw new RangeError("Expected enabled fleet level");
  const template = createRun(4).enemies[0];
  run.enemies = [
    { ...template, id: 1000, kind: "yari", x: 40, y: 100, hp: 1000, maxHp: 1000,
      boss: false, elite: false, ladder: false, shielded: false },
    { ...template, id: 1001, kind: "ship", x: 60, y: 550, hp: 1000, maxHp: 1000,
      boss: false, elite: false, ladder: false, shielded: false },
  ];
  run.nextId = 2000;
  run.squads[0].skillClock = 7;
  const state: ChaosState = {
    general: "이순신", level, mods, tick: 0, remainder: 0, xp: 0, hitXp: {}, feedWindow: -1, feeds: 0, attacks: 0, rangedAttacks: 0, kills: 0,
    trails: [], rings: [], pools: [], militia: [], fleet: [], orbitHits: {},
    pendingMilitia: [], pendingTrails: [], stomps: [], nextFleetTick: mods.every,
    nextBeltTick: 0, militiaGroup: 0,
  };
  const effects: Effect[] = [];
  return { run, state, squad: run.squads[0], effects, combat: bphEffectCombat(run, effects) };
}

function through(ctx: ChaosContext, tick: number, active = true): void {
  while (ctx.state.tick < tick) {
    ctx.state.tick++;
    ctx.run.time += 1 / 30;
    tickChaosFleet(ctx, active);
  }
}

test.each([
  [1, 600, 1, 1.2, 40, 40],
  [2, 600, 1, 1.2, 40, 40],
  [3, 600, 1, 1.2, 40, 40],
  [4, 600, 1, 1.2, 40, 40],
  [5, 450, 1, 1.8, 60, 56],
  [6, 450, 1, 1.8, 60, 56],
  [7, 450, 1, 1.8, 60, 56],
  [8, 450, 1, 1.8, 60, 56],
  [9, 450, 1, 1.8, 60, 56],
  [10, 300, 1, 3.2, 90, 64],
  [11, 300, 1, 3.2, 90, 64],
  [12, 300, 1, 3.2, 90, 64],
  [13, 300, 1, 3.2, 90, 64],
  [14, 300, 1, 3.2, 90, 64],
  [15, 210, 2, 5.5, 120, 72],
  [16, 210, 2, 5.5, 120, 72],
  [17, 210, 2, 5.5, 120, 72],
  [18, 210, 2, 5.5, 120, 72],
  [19, 210, 2, 5.5, 120, 72],
  [20, 120, 3, 14, 240, 96],
])("N%s waits %s ticks then divides damage over %s scheduled passes", (level, every, passes, land, ship, width) => {
  const ctx = battle(level), { run, state, squad } = ctx;
  run.enemies.push({ ...run.enemies[0], id: 1002, y: 100 + width });
  // The equal-density next window must not steal the first band's boundary target.
  if (level < 20) run.enemies.push({ ...run.enemies[0], id: 1003, y: 100 + width + .01 });
  const usedAt = squad.usedAt, skillTimes = [...run.metrics.skillTimes], rng = run.rng;
  through(ctx, every - 1);
  expect(state.fleet).toHaveLength(0);
  expect(run.enemies.map(enemy => enemy.hp)).toEqual(level < 20 ? [1000, 1000, 1000, 1000] : [1000, 1000, 1000]);
  through(ctx, every);
  expect(state.fleet.map(pass => pass.width)).toEqual(Array.from({ length: passes }, () => width));
  expect(state.fleet.map(pass => pass.dueTick)).toEqual(
    Array.from({ length: passes }, (_, index) => every + index * 36));
  for (let index = 0; index < passes; index++) {
    if (index > 0) {
      through(ctx, every + index * 36 - 1);
      expect(run.enemies[0].hp).toBeCloseTo(1000 - land * index / passes, 8);
      through(ctx, every + index * 36);
    }
    expect(run.enemies[0].hp).toBeCloseTo(1000 - land * (index + 1) / passes, 8);
    expect(run.enemies[1].hp).toBeCloseTo(1000 - ship * (index + 1) / passes, 8);
    expect(run.enemies[2].hp).toBeCloseTo(1000 - land * (index + 1) / passes, 8);
    if (level < 20) expect(run.enemies[3].hp).toBe(1000);
  }
  expect(run.enemies[0].x).toBeCloseTo(70, 8);
  expect(run.metrics.damage.squads[0]).toBeCloseTo(2 * land + ship, 8);
  through(ctx, every + 107, false);
  expect(state.fleet).toHaveLength(passes);
  through(ctx, every + 108, false);
  expect(state.fleet).toHaveLength(passes - 1);
  through(ctx, every * 2 - 1, false);
  expect(state.fleet).toHaveLength(Array.from({ length: passes }, (_, index) =>
    every + index * 36 + 108).filter(until => until > every * 2 - 1).length);
  expect(run.enemies[0].hp).toBeCloseTo(1000 - land, 8);
  through(ctx, every * 2);
  expect(run.enemies[0].hp).toBeCloseTo(1000 - land - land / passes, 8);
  through(ctx, every * 2 + 180, false);
  expect(state.fleet).toHaveLength(0);
  expect(run.enemies[0].hp).toBeCloseTo(1000 - 2 * land, 8);
  expect(squad.skillClock).toBe(7);
  expect(squad.usedAt).toBe(usedAt);
  expect(run.metrics.skills[0]).toBe(0);
  expect(run.metrics.skillTimes).toEqual(skillTimes);
  expect(run.rng).toBe(rng);
});

test("N20 snapshots three nonoverlapping 96px lanes with inclusive strip edges", () => {
  const ctx = battle(), template = ctx.run.enemies[0];
  ctx.run.enemies = [100, 148, 196, 300, 320, 480, 500, 650].map((y, index): Enemy =>
    ({ ...template, id: 1000 + index, y }));
  through(ctx, 120);
  expect(ctx.state.fleet.map(pass => pass.lane)).toEqual([148, 310, 490]);
  expect(ctx.state.fleet.map(pass => pass.landIds)).toEqual([[1000, 1001, 1002], [1003, 1004], [1005, 1006]]);
  through(ctx, 192);
  for (const enemy of ctx.run.enemies.slice(0, 7)) expect(enemy.hp).toBeCloseTo(1000 - 14 / 3, 8);
  expect(ctx.run.enemies[7].hp).toBe(1000);
});

test("N20 reuses two available lanes without increasing the per-enemy total cap", () => {
  const ctx = battle(), template = ctx.run.enemies[0];
  ctx.run.enemies = [{ ...template, y: 100 }, { ...template, id: 1002, y: 200 }];
  through(ctx, 192);
  expect(ctx.state.fleet.map(pass => pass.lane)).toEqual([100, 200, 100]);
  expect(ctx.run.enemies[0].hp).toBeCloseTo(1000 - 28 / 3, 8);
  expect(ctx.run.enemies[1].hp).toBeCloseTo(1000 - 14 / 3, 8);
  expect(ctx.run.enemies.map(enemy => enemy.x)).toEqual([60, 50]);
});

test("N20 includes both 96px edges and excludes an enemy just beyond the selected strip", () => {
  const ctx = battle(), template = ctx.run.enemies[0];
  ctx.run.enemies = [100, 148, 196, 196.01, 350, 350, 350, 500, 500, 500]
    .map((y, index): Enemy => ({ ...template, id: 1000 + index, y }));
  through(ctx, 192);
  expect(ctx.state.fleet.map(pass => pass.lane)).toEqual([148, 350, 500]);
  for (const index of [0, 1, 2]) expect(ctx.run.enemies[index].hp).toBeCloseTo(1000 - 14 / 3, 8);
  expect(ctx.run.enemies[3].hp).toBe(1000);
});

test("scheduled IDs stay fixed after deaths and movement while rewards occur exactly once", () => {
  // Seed 299 wins both loot draws for the defeated target at ID 1000.
  const ctx = battle(20, 299), { run } = ctx, template = run.enemies[0];
  const dead = { ...template, hp: .5, bphProfileId: "Monster1_Caveling" };
  const survivor = { ...template, id: 1002 };
  run.enemies = [dead, survivor];
  const gold = run.gold, earned = run.earned, xp = run.xp;
  const kills = run.kills, medals = bphBattleMedals(run), totalKills = run.bph?.save.totalKills ?? 0;
  through(ctx, 120);
  const newcomer = { ...template, id: 1003 };
  survivor.y = 400;
  run.enemies.push(newcomer);
  through(ctx, 239);
  expect(dead.hp).toBeCloseTo(.5 - 14 / 3, 8);
  expect(survivor.hp).toBeCloseTo(1000 - 14, 8);
  expect(newcomer.hp).toBe(1000);
  expect(run.kills).toBe(kills + 1);
  expect(run.bph?.save.totalKills).toBe(totalKills + 1);
  expect(run.gold).toBe(gold + 1);
  expect(run.earned).toBe(earned + 1);
  expect(run.xp).toBe(xp + 1);
  expect(bphBattleMedals(run)).toBe(medals + 1);
  expect(ctx.effects.filter(effect => effect.kind === "kill").map(effect => effect.target)).toEqual([1000]);
});

test("commander down preserves pending passes but prevents new cycles until active", () => {
  const ctx = battle();
  through(ctx, 120);
  ctx.squad.hp = 0;
  through(ctx, 330, false);
  expect(ctx.run.enemies[0].hp).toBeCloseTo(1000 - 14, 8);
  expect(ctx.state.fleet).toHaveLength(0);
  expect(ctx.state.nextFleetTick).toBe(240);
  ctx.squad.hp = ctx.squad.maxHp;
  through(ctx, 331);
  expect(ctx.state.fleet.map(pass => pass.dueTick)).toEqual([331, 367, 403]);
  expect(ctx.state.nextFleetTick).toBe(451);
});

test("N20's sortie lands a share of the army's blows since the last sortie on land enemies, and only at N20", () => {
  const { armyRatio, passTicks } = CHAOS_RULES.fleet, ratio = armyRatio[chaosSkillBand(20)];
  const ctx = battle(), mods = ctx.state.mods, [land, ship] = ctx.run.enemies;
  if (mods.general !== "이순신" || !ratio) throw new RangeError("Expected enabled fleet level");
  through(ctx, 10);
  for (let blow = 0; blow < 5; blow++) chaosFleetAttack(ctx, { unit: ctx.squad, target: land, amount: 4 });
  through(ctx, mods.every + mods.passes * passTicks);
  expect(1000 - land.hp).toBeCloseTo(mods.landPower + 5 * 4 * ratio, 8);
  expect(1000 - ship.hp).toBeCloseTo(mods.shipPower, 8);
  // The tally is spent with the sortie: the next one, with no blow in between, lands the fleet's own landPower alone.
  through(ctx, 2 * mods.every + mods.passes * passTicks);
  expect(1000 - land.hp).toBeCloseTo(2 * mods.landPower + 5 * 4 * ratio, 8);
  const calm = battle(19), rows = calm.state.mods, foe = calm.run.enemies[0];
  if (rows.general !== "이순신") throw new RangeError("Expected enabled fleet level");
  for (let blow = 0; blow < 5; blow++) chaosFleetAttack(calm, { unit: calm.squad, target: foe, amount: 4 });
  through(calm, rows.every + rows.passes * passTicks);
  expect(1000 - foe.hp).toBeCloseTo(rows.landPower, 8);
  expect(calm.state.blows).toBeUndefined();
});

test.each(["won", "lost"] as const)("ending a run as %s cancels pending damage and rewards", phase => {
  const ctx = battle();
  through(ctx, 120);
  const hp = ctx.run.enemies.map(enemy => enemy.hp), gold = ctx.run.gold;
  ctx.run.phase = phase;
  through(ctx, 600);
  expect(ctx.run.enemies.map(enemy => enemy.hp)).toEqual(hp);
  expect(ctx.run.gold).toBe(gold);
  expect(ctx.state.fleet).toHaveLength(0);
});

test("native fleet push respects wall and river geometry and boss or elite resistance", () => {
  const ctx = battle(), template = ctx.run.enemies[0], wall = fortRect(ctx.run.fort, 8);
  ctx.run.enemies = [
    { ...template, x: wall.left - 1, y: (wall.top + wall.bottom) / 2 },
    { ...template, id: 1002, x: 40, y: (wall.top + wall.bottom) / 2, boss: true },
    { ...template, id: 1003, x: 40, y: (wall.top + wall.bottom) / 2, elite: true },
  ];
  through(ctx, 192);
  expect(contains(wall, ctx.run.enemies[0])).toBe(false);
  expect(ctx.run.enemies[0].x).toBe(wall.left);
  // Owner DM 1794897318.658999: a survival boss is not knocked back at all (it was pushed a quarter as far).
  expect(ctx.run.enemies[1].x).toBe(40);
  expect(ctx.run.enemies[2].x).toBeCloseTo(55, 8);
  const river = battle(1);
  river.run.enemies[0].y = riverBank() - 8;
  through(river, 450);
  expect(river.run.enemies[0].y).toBe(riverBank() - 8);
});

test("level zero and another general cannot schedule fleet support", () => {
  const ctx = battle();
  ctx.state.level = 0;
  through(ctx, 600);
  expect(ctx.state.fleet).toHaveLength(0);
  expect(ctx.run.enemies.map(enemy => enemy.hp)).toEqual([1000, 1000]);
  const mods = CHAOS_LEVELS.권율[20];
  if (!mods) throw new RangeError("Expected enabled archer level");
  ctx.state.level = 20;
  ctx.state.mods = mods;
  through(ctx, 900);
  expect(ctx.state.fleet).toHaveLength(0);
  expect(ctx.run.enemies.map(enemy => enemy.hp)).toEqual([1000, 1000]);
});
