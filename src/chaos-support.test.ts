import { tickChaosSkills } from "./chaos-skill-tick";
import { pauseArenaWaves } from "./chaos-test-fixture";
import { expect, test } from "bun:test";
import { CHAOS_LEVELS, CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import { chaosAfterAttack } from "./chaos";
import type { ChaosContext, ChaosState } from "./chaos-contract";
import { chaosBeltPositions, chaosBeltReduction, chaosSupportKill, tickChaosSupport } from "./chaos-support";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { riverBank } from "./river";
import { CENTER, contains, crosses, distance, fortRect, guardPoint } from "./geometry";
import type { Point } from "./geometry";
import { advance, bphEffectCombat, might, soldier, useSkill } from "./rules";
import type { Enemy } from "./rules";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

// Independent approved rows after the Lv1 small start moved the former bands one step later.
const DESIGN_BANDS = [
  { levels: [1, 2, 3, 4], militia: [14, 1, 150, .16, 45, 72, 16, 24] },
  { levels: [5, 6, 7, 8, 9], militia: [10, 2, 240, .22, 45, 96, 20, 24] },
  { levels: [10, 11, 12, 13, 14], militia: [7, 4, 420, .26, 36, 120, 24, 36] },
  { levels: [15, 16, 17, 18, 19], militia: [5, 8, 600, .35, 30, 144, 28, 48] },
  { levels: [20], militia: [3, 12, Infinity, .5, 30, 176, 32, 60] },
] as const;

function scenario(general: "김시민" | "곽재우" | "사명대사", level = 20): ChaosContext {
  const run = createBphRun(freshMeta(), { seed: 144, general, upgrades: [], startBattle: false });
  const mods = CHAOS_LEVELS[general][level];
  if (!mods) throw new RangeError(`Missing chaos level ${level}`);
  const state: ChaosState = { general, level, mods, tick: 0, remainder: 0, xp: 0, hitXp: {}, feedWindow: -1, feeds: 0, attacks: 0, rangedAttacks: 0,
    kills: 0, trails: [], rings: [], pools: [], militia: [], fleet: [], orbitHits: {},
    pendingMilitia: [], pendingTrails: [], stomps: [], nextFleetTick: 0, nextBeltTick: 0, militiaGroup: 0 };
  const effects: ChaosContext["effects"] = [];
  run.chaos = state;
  return { run, state, effects, squad: run.squads[0], combat: bphEffectCombat(run, effects) };
}

function enemy(ctx: ChaosContext, at: Point): Enemy {
  const target: Enemy = { ...at, id: ctx.run.nextId++, kind: "yari", direction: "위", hp: 100,
    maxHp: 100, speed: 0, elite: false, boss: false, goalX: CENTER.x, goalY: CENTER.y,
    clock: 1e9, strikeAt: 0, prey: null, stun: 0, burn: 0, burnClock: 0, skillClock: 1e9, casting: 0, casts: 0 };
  ctx.run.enemies.push(target);
  return target;
}

function ticks(ctx: ChaosContext, through: number, active = true): void {
  while (ctx.state.tick < through) { ctx.state.tick++; tickChaosSupport(ctx, active); }
}

function attacks(ctx: ChaosContext, count: number): void {
  for (let index = 0; index < count; index++)
    chaosAfterAttack(ctx.run, { unit: ctx.squad, target: CENTER, amount: 1 }, ctx.effects);
}

function kills(ctx: ChaosContext, count: number, at = guardPoint(0, "위", 80)): void {
  for (let index = 0; index < count; index++) chaosSupportKill(ctx, at);
}

test.each(DESIGN_BANDS.flatMap(band => band.levels))("Kim N%i replaces the protection band with delayed wall cannon attacks", level => {
  const ctx = scenario("김시민", level);
  // The passive battery only answers enemies within its reach: one foe north of the wall draws that side's full gun set.
  enemy(ctx, { x: CENTER.x, y: fortRect(ctx.run.fort).top - 60 });
  const period = CHAOS_RULES.skills.cannon.passiveEvery[chaosSkillBand(level)];
  ticks(ctx, period - 1);
  expect(ctx.run.chaosSkills).toBeUndefined();
  ticks(ctx, period);
  const shells = ctx.run.chaosSkills?.events ?? [];
  expect(shells).toHaveLength(CHAOS_RULES.skills.cannon.count[chaosSkillBand(level)]);
  const target = enemy(ctx, shells[0].to);
  expect(chaosBeltReduction(ctx, target)).toBe(0);
  expect(target.hp).toBe(100);
  for (let tick = 0; tick < 18; tick++) tickChaosSkills(ctx.run, 1 / 30, ctx.effects);
  expect(target.hp).toBeLessThan(100);
});

test("Kim never creates orbiting shield actors even while active", () => {
  const ctx = scenario("김시민");
  const target = enemy(ctx, CENTER);
  ticks(ctx, 120);
  expect(chaosBeltPositions(ctx)).toEqual([]);
  expect(ctx.state.orbitHits).toEqual({});
  expect(chaosBeltReduction(ctx, target)).toBe(0);
  ctx.squad.state = "down"; ctx.squad.hp = 0;
  expect(chaosBeltReduction(ctx, target)).toBe(0);
});

test.each(DESIGN_BANDS.flatMap(band => band.levels.map(level => [level, ...band.militia] as const)))(
  "Gwak N%i queues next-tick summons, caps bodies and refreshes only oldest lifetime",
  (level, every, cap, lifetime) => {
    const ctx = scenario("곽재우", level), rng = ctx.run.rng;
    kills(ctx, every * cap, CENTER);
    expect(ctx.state.militia).toHaveLength(0);
    ticks(ctx, 1);
    expect(ctx.state.militia).toHaveLength(cap);
    expect(ctx.state.militia.map(member => member.untilTick)).toEqual(Array(cap).fill(1 + lifetime));
    const ids = ctx.state.militia.map(member => member.id);
    expect(ctx.state.militia.map(member => [member.x, member.y])).toEqual(Array.from({ length: cap },
      () => [fortRect(0, 12).left, CENTER.y]));
    kills(ctx, every);
    ticks(ctx, 2);
    expect(ctx.state.militia.map(member => member.id)).toEqual(ids);
    expect(ctx.state.militia[0].untilTick).toBe(2 + lifetime);
    expect(ctx.run.rng).toBe(rng);
  },
);

test.each(DESIGN_BANDS.flatMap(band => band.levels.map(level => [level, ...band.militia] as const)))(
  "Gwak N%i uses approved movement, reach, cleave and native attack period while down",
  (level, every, _cap, lifetime, power, period, reach, radius, speed) => {
    const ctx = scenario("곽재우", level), at = guardPoint(0, "위", 80);
    kills(ctx, every, at); ticks(ctx, 1);
    const member = ctx.state.militia[0], before = { x: member.x, y: member.y };
    const target = enemy(ctx, { x: at.x + reach - 1, y: at.y });
    const adjacent = enemy(ctx, { x: target.x + 1, y: target.y });
    const third = enemy(ctx, { x: target.x, y: target.y - 1 });
    ticks(ctx, 2, false);
    expect(distance(before, member)).toBeCloseTo(speed / 30);
    expect([target.hp, adjacent.hp, third.hp, target.stun]).toEqual([100, 100, 100, 0]);
    ticks(ctx, period + 1, false);
    expect([100 - target.hp, 100 - adjacent.hp, 100 - third.hp].sort((a, b) => b - a))
      .toEqual([power, power, 0].map(value => expect.closeTo(value, 8)));
    expect(distance(member, target)).toBeLessThan(reach);
    const isolated = enemy(ctx, { x: target.x, y: target.y - radius - 1 });
    ticks(ctx, 2 * period + 1, false);
    expect(isolated.hp).toBe(100);
    if (Number.isFinite(lifetime)) { ticks(ctx, lifetime + 1, false); expect(ctx.state.militia).toHaveLength(0); }
  },
);

test("Kim N20's shells each land a share of the army's blows since the last volley, and only at N20", () => {
  const mods = CHAOS_LEVELS.김시민[20];
  if (mods?.general !== "김시민" || !mods.armyRatio) throw new Error("Missing Kim army ratio");
  // One foe north of the wall draws that side's guns; `blows` army attacks of 1 land before the first volley.
  const volley = (ctx: ChaosContext, blows: number) => {
    enemy(ctx, { x: CENTER.x, y: fortRect(ctx.run.fort).top - 60 });
    ticks(ctx, 1);
    attacks(ctx, blows);
    ticks(ctx, ctx.state.nextBeltTick);
    return ctx.run.chaosSkills?.events.map(event => event.power) ?? [];
  };
  const quiet = volley(scenario("김시민"), 0), ctx = scenario("김시민"), loud = volley(ctx, 5);
  expect(quiet).toHaveLength(CHAOS_RULES.skills.cannon.count[chaosSkillBand(20)]);
  expect(loud).toHaveLength(quiet.length);
  for (const [index, power] of loud.entries()) expect(power - quiet[index]).toBeCloseTo(5 * mods.armyRatio);
  // The tally is spent with the volley: the next one, with no blow in between, is back to the battery's own power.
  if (ctx.run.chaosSkills) ctx.run.chaosSkills.events = [];
  ticks(ctx, ctx.state.nextBeltTick);
  expect(ctx.run.chaosSkills?.events.map(event => event.power)).toEqual(quiet);
  const below = scenario("김시민", 19);
  expect(volley(below, 5)).toEqual(volley(scenario("김시민", 19), 0));
  expect(below.state.blows).toBeUndefined();
});

test("Gwak N20's militiaman nearest the enemy the army strikes lands a share of that blow at once, and only at N20", () => {
  const strike = (ctx: ChaosContext, target: Point, count: number) => {
    for (let index = 0; index < count; index++) chaosAfterAttack(ctx.run, { unit: ctx.squad, target, amount: 4 }, ctx.effects);
  };
  const ctx = scenario("곽재우"), mods = ctx.state.mods, at = guardPoint(0, "위", 80);
  if (mods.general !== "곽재우" || !mods.rally || !mods.rallyRatio) throw new Error("Missing Gwak rally band");
  kills(ctx, mods.every, at); ticks(ctx, 1);
  const member = ctx.state.militia[0], due = member.nextTick;
  const target = enemy(ctx, { x: member.x + mods.reach - 1, y: member.y });
  const far = enemy(ctx, { x: member.x, y: member.y - mods.reach - 1 });
  strike(ctx, target, mods.rally - 1);
  expect(target.hp).toBe(100);
  strike(ctx, target, 1);
  expect(100 - target.hp).toBeCloseTo(4 * mods.rallyRatio);
  // His own strike clock is untouched, and an enemy outside every militiaman's reach is not answered.
  expect(member.nextTick).toBe(due);
  strike(ctx, far, mods.rally);
  expect(far.hp).toBe(100);
  const calm = scenario("곽재우", 19), rows = calm.state.mods;
  if (rows.general !== "곽재우") throw new Error("Missing Gwak army band");
  kills(calm, rows.every, at); ticks(calm, 1);
  const spared = enemy(calm, { x: calm.state.militia[0].x + rows.reach - 1, y: calm.state.militia[0].y });
  strike(calm, spared, 10 * mods.rally);
  expect(spared.hp).toBe(100);
});

test.each([0, 50])("Gwak spawn stays on land for a kill %i pixels past the river boundary", offset => {
  const ctx = scenario("곽재우", 1);
  kills(ctx, 14, { x: CENTER.x, y: riverBank() + offset });
  ticks(ctx, 1);
  expect(ctx.state.militia.map(member => member.y)).toEqual([riverBank() - 8]);
});

test("Gwak follows the outside fort route and ignores enemies beyond the land boundary", () => {
  const ctx = scenario("곽재우"), wall = fortRect(0), rng = ctx.run.rng;
  const at = { x: wall.left - 12, y: wall.top + 12 }, target = enemy(ctx, { x: CENTER.x, y: wall.top - 12 });
  kills(ctx, 3, at); ticks(ctx, 1);
  const member = ctx.state.militia[0];
  for (let tick = 2; tick <= 61; tick++) {
    const previous = { x: member.x, y: member.y }; ticks(ctx, tick, false);
    expect(contains(wall, member) || crosses(wall, previous, member)).toBe(false);
  }
  expect(100 - target.hp).toBeCloseTo(1);
  expect(ctx.run.rng).toBe(rng);
  ctx.run.enemies = [];
  Object.assign(member, { x: CENTER.x, y: riverBank() - 8 });
  const river = enemy(ctx, { x: CENTER.x, y: riverBank() + 10 });
  ticks(ctx, 121, false);
  expect([member.x, member.y, river.hp]).toEqual([CENTER.x, riverBank() - 8, 100]);
});

test.each([10, 20])("Kim N%i leaves native allied incoming HP loss unchanged", level => {
  const treated = scenario("김시민", level), control = scenario("김시민", level);
  control.run.chaos = undefined;
  for (const ctx of [treated, control]) {
    Object.assign(ctx.squad, { ...CENTER, hp: 100, maxHp: 100 });
    bphEffectCombat(ctx.run, ctx.effects).applyUnitDamage({ target: ctx.squad, amount: 10 });
  }
  expect(treated.squad.hp).toBe(control.squad.hp);
  expect(treated.squad.hp).toBeLessThan(100);
});

test.each([[0, 181, 45], [29, 180, 33]])("Gwak groups replace only simultaneous normal hits (spawn offset %i)", (offset, end, damage) => {
  const ctx = scenario("곽재우"), at = guardPoint(0, "위", 80), target = enemy(ctx, at);
  ticks(ctx, offset);
  kills(ctx, 36, at); ticks(ctx, end);
  expect(100 - target.hp).toBeCloseTo(damage);
});

test("a native militia kill pays once without feeding the direct kill summon counter", () => {
  const ctx = scenario("곽재우"), at = guardPoint(0, "위", 80), target = enemy(ctx, at);
  target.hp = .1;
  kills(ctx, 3, at); ticks(ctx, 91);
  expect(ctx.run.kills).toBe(1);
  expect(ctx.run.bph?.save.totalKills).toBe(1);
  expect(ctx.state.kills).toBe(3);
  expect(ctx.state.militia).toHaveLength(1);
  expect(ctx.state.pendingMilitia).toHaveLength(0);
});

test.each(DESIGN_BANDS.flatMap(band => band.levels))("Samyeong N%i creates a delayed offensive bell instead of healing wounded allies", level => {
  const ctx = scenario("사명대사", level), ally = soldier("spearman", 1, ctx.squad);
  Object.assign(ally, { id: ctx.run.nextId++, hp: 50, maxHp: 100 }); ctx.squad.soldiers.push(ally);
  ctx.squad.maxHp = 100; ctx.squad.hp = 50;
  const every = CHAOS_RULES.skills.bell.passiveEvery[chaosSkillBand(level)];
  attacks(ctx, every - 1);
  expect(ctx.run.chaosSkills).toBeUndefined();
  attacks(ctx, 1);
  // Stand inside even Lv1's smaller ring, measured from the caster.
  const target = enemy(ctx, { x: ctx.squad.x, y: ctx.squad.y - 40 });
  expect(ctx.state.pools).toEqual([]);
  tickChaosSkills(ctx.run, 1 / 30, ctx.effects);
  expect(target.hp).toBe(100);
  for (let tick = 1; tick < 24; tick++) tickChaosSkills(ctx.run, 1 / 30, ctx.effects);
  expect(target.hp).toBeLessThan(100);
  expect([ctx.squad.hp, ally.hp]).toEqual([50, 50]);
});

test("overlapping passive bells cannot heal or revive allies", () => {
  const ctx = scenario("사명대사");
  ctx.squad.maxHp = 100; ctx.squad.hp = 50;
  const dead = soldier("spearman", 1, ctx.squad); dead.hp = 0; ctx.squad.soldiers.push(dead);
  attacks(ctx, 6);
  const target = enemy(ctx, { x: CENTER.x, y: CENTER.y - 100 });
  for (let tick = 0; tick < 24; tick++) tickChaosSkills(ctx.run, 1 / 30, ctx.effects);
  const bell = CHAOS_RULES.skills.bell, band = chaosSkillBand(20);
  expect(100 - target.hp).toBeCloseTo(2 * bell.power[band] * bell.passiveScale * (1 + .03 * 19)
    * might(ctx.run) * BPH_SURVIVAL_TABLE.generalSkill);
  expect(ctx.squad.hp).toBe(50); expect(dead.hp).toBe(0);
});

test.each([[5, 12, 15], [10, 8, 7], [20, 3, 7]])("Samyeong N%i staggered attack thresholds keep separate bell deadlines without healing", (level, every, offset) => {
  const ctx = scenario("사명대사", level);
  ctx.squad.maxHp = 100; ctx.squad.hp = 50;
  attacks(ctx, every);
  for (let tick = 0; tick < offset; tick++) tickChaosSkills(ctx.run, 1 / 30, ctx.effects);
  attacks(ctx, every);
  expect(ctx.run.chaosSkills?.events.map(event => event.impactTick)).toEqual([24, 24 + offset]);
  for (let tick = 0; tick < 48; tick++) tickChaosSkills(ctx.run, 1 / 30, ctx.effects);
  expect(ctx.squad.hp).toBe(50);
  expect(ctx.state.pools).toEqual([]);
});

test("Samyeong manual bell needs no pools and hits each enemy once per expanding toll", () => {
  const ctx = scenario("사명대사");
  ctx.squad.skillClock = 0;
  const target = enemy(ctx, { x: CENTER.x, y: CENTER.y - 100 });
  useSkill(ctx.run, 0);
  for (let tick = 0; tick < 24; tick++) tickChaosSkills(ctx.run, 1 / 30, ctx.effects);
  const bell = CHAOS_RULES.skills.bell, band = chaosSkillBand(20);
  expect(100 - target.hp).toBeCloseTo(bell.power[band] / bell.waves[band] * (1 + .03 * 19)
    * might(ctx.run) * BPH_SURVIVAL_TABLE.generalSkill);
  expect(ctx.state.pools).toEqual([]);
});

test.each(["won", "lost"] as const)("support stops hits and clears owned entities after run is %s", phase => {
  const ctx = scenario("곽재우"), at = guardPoint(0, "위", 80), target = enemy(ctx, at);
  kills(ctx, 6, at); ticks(ctx, 1);
  ctx.run.phase = phase;
  ticks(ctx, 100);
  kills(ctx, 6, at);
  expect(target.hp).toBe(100);
  expect(ctx.state.militia).toHaveLength(0);
  expect(ctx.state.pendingMilitia).toHaveLength(0);
});

test("advance drives the passive wall cannon launch and delayed explosion through production hooks", () => {
  const ctx = scenario("김시민", 1);
  pauseArenaWaves(ctx.run);
  ctx.squad.clock = 1e9; ctx.squad.strikeAt = 1e9;
  // A passive battery fires only when a foe is inside this band's wall reach.
  const target = enemy(ctx, { x: CENTER.x, y: fortRect(ctx.run.fort).top - 40 });
  const period = CHAOS_RULES.skills.cannon.passiveEvery[chaosSkillBand(1)];
  for (let index = 0; index < period - 1; index++) advance(ctx.run, 1 / 30);
  expect(ctx.run.chaosSkills).toBeUndefined();
  advance(ctx.run, 1 / 30);
  const shell = ctx.run.chaosSkills?.events[0];
  if (!shell) throw new Error("Missing cannon shell");
  expect(target.hp).toBe(100);
  for (let index = 0; index < 18; index++) advance(ctx.run, 1 / 30);
  expect(target.hp).toBeLessThan(100);
});
