import { expect, test } from "bun:test";
import { CHAOS_TEST_LEVELS, chaosArena, chaosEnemy, chaosFire, chaosTicks } from "./chaos-test-fixture";
import { generalReach } from "./general-reach";
import { advance, useSkill } from "./rules";
import { growthFor } from "./skill-growth";
import { addBphProfile } from "./bph-combat";
import { chaosAfterAttack } from "./chaos";
import { CHAOS_LEVELS, CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

test.each(CHAOS_TEST_LEVELS)("Shin N%i generates one real four-target trail at the army attack threshold", level => {
  const mods = CHAOS_LEVELS.신립[Math.max(5, level)];
  if (mods?.general !== "신립") throw new Error("Missing Shin army band");
  const { every, width, ratio, length } = mods;
  const run = chaosArena("신립", level), target = chaosEnemy(run, 225, 100);
  for (let attack = 0; attack < every - 1; attack++) { chaosFire(run, target); target.x = 225; }
  expect(run.chaos?.trails).toHaveLength(0);
  const before = target.hp;
  const hit = chaosFire(run, target).find(effect => effect.kind === "hit");
  const direct = before - target.hp;
  expect(hit).toBeDefined();
  const trail = run.chaos?.trails[0];
  expect(trail?.width).toBe(width);
  expect(trail?.power).toBeCloseTo(direct * ratio);
  expect(trail && Math.hypot(trail.to.x - trail.from.x, trail.to.y - trail.from.y)).toBeCloseTo(length);
  const power = trail?.power ?? 0;
  const after = target.hp;
  chaosTicks(run, 12);
  expect(after - target.hp).toBeCloseTo(power);
  chaosTicks(run, 23);
  expect(run.chaos?.trails).toHaveLength(1);
  chaosTicks(run, 1);
  expect(run.chaos?.trails).toHaveLength(0);
});

test("Song N20's ricochet leaves the enemy the army strikes as one hopping arrow per attack threshold, and only at N20", () => {
  const mods = CHAOS_LEVELS.송상현[20], hop = generalReach("송상현", 20);
  if (mods?.general !== "송상현" || !hop || !mods.ricochetEvery || !mods.ricochetRatio) throw new Error("Missing Song ricochet band");
  const every = mods.ricochetEvery, reach = 2 * hop.length;
  const run = chaosArena("송상현", 20), struck = chaosEnemy(run, 205, 400);
  const near = chaosEnemy(run, 205, 400 + reach - 1), beyond = chaosEnemy(run, 205, 400 - reach - 1);
  const blow = () => chaosAfterAttack(run, { unit: run.squads[0], target: struck, amount: 10 }, []);
  for (let attack = 1; attack < every; attack++) blow();
  expect(run.shots).toHaveLength(0);
  blow();
  expect(run.shots).toHaveLength(1);
  const arrow = run.shots[0];
  expect([arrow.x, arrow.y, arrow.target, arrow.hitIds]).toEqual([struck.x, struck.y, near.id, [struck.id]]);
  expect(arrow.damage).toBeCloseTo(10 * mods.ricochetRatio);
  expect([arrow.chaosPierce, arrow.chaosPierceRange]).toEqual([hop.targets - 1, hop.length]);
  chaosTicks(run, 45);
  expect(10000 - near.hp).toBeCloseTo(10 * mods.ricochetRatio);
  expect([struck.hp, beyond.hp]).toEqual([10000, 10000]);
  expect(run.shots).toHaveLength(0);
  // With no other enemy inside that range the arrow turns on the struck one.
  const lone = chaosArena("송상현", 20), only = chaosEnemy(lone, 205, 400);
  for (let attack = 0; attack < every; attack++) chaosAfterAttack(lone, { unit: lone.squads[0], target: only, amount: 10 }, []);
  expect([lone.shots[0]?.target, lone.shots[0]?.hitIds]).toEqual([only.id, []]);
  chaosTicks(lone, 5);
  expect(10000 - only.hp).toBeCloseTo(10 * mods.ricochetRatio);
  expect(lone.shots).toHaveLength(0);
  const calm = chaosArena("송상현", 19), other = chaosEnemy(calm, 205, 300);
  chaosEnemy(calm, 215, 300);
  for (let attack = 0; attack < 10 * every; attack++)
    chaosAfterAttack(calm, { unit: calm.squads[0], target: other, amount: 10 }, []);
  expect(calm.shots).toHaveLength(0);
});

test.each(CHAOS_TEST_LEVELS)("Hwang N%i applies one capped radial pulse per direct attack threshold", level => {
  const mods = CHAOS_LEVELS.황진[Math.max(5, level)];
  if (mods?.general !== "황진") throw new Error("Missing Hwang army band");
  const { every, radius, ratio, targets: count } = mods;
  const run = chaosArena("황진", level), target = chaosEnemy(run, 215, 100);
  target.boss = true;
  for (let attack = 0; attack < every - 1; attack++) { chaosFire(run, target); target.x = 215; }
  const extra = Array.from({ length: count + 1 }, (_, index) => chaosEnemy(run, 195 - radius + .1, 100 + index * .01));
  const outside = chaosEnemy(run, 195 - radius - 1, 100);
  const before = target.hp;
  chaosFire(run, target);
  const direct = before - target.hp;
  // The primary is either outside the pulse or consumes one of its target slots.
  const primaryInside = 23 <= radius;
  const basePower = primaryInside ? direct / (1 + ratio) : direct;
  expect(extra.filter(enemy => enemy.hp < 10000)).toHaveLength(count - Number(primaryInside));
  for (const enemy of extra.filter(enemy => enemy.hp < 10000))
    expect(10000 - enemy.hp).toBeCloseTo(basePower * ratio);
  expect(outside.hp).toBe(10000);
  expect(run.chaos?.rings[0].radius).toBe(radius);
});

test("Hwang N20 manual stomp schedules six simultaneous distributed waves with native damage", () => {
  const level = 20, band = chaosSkillBand(level), rules = CHAOS_RULES.skills.stomps;
  const damage = rules.power[band] / rules.waves[band] * (1 + .03 * (level - 1)) * BPH_SURVIVAL_TABLE.generalSkill;
  const run = chaosArena("황진", level), near = chaosEnemy(run, 225, 100);
  useSkill(run, 0);
  expect(10000 - near.hp).toBe(4);
  const waves = run.chaosSkills?.events ?? [];
  expect(waves).toHaveLength(48);
  const targets = waves.filter(event => event.wave === 0).map(event => chaosEnemy(run, event.to.x, event.to.y));
  chaosTicks(run, 8);
  expect(targets.map(target => target.hp)).toEqual(Array(8).fill(10000));
  const first = chaosTicks(run, 1);
  expect(targets.map(target => 10000 - target.hp)).toEqual(Array(8).fill(expect.closeTo(damage)));
  expect(first.filter(effect => effect.kind === "stun")).toHaveLength(0);
  expect(run.chaos?.stomps).toEqual([]);
});

test("chaos clocks accumulate simulation time rather than counting .01 calls", () => {
  const run = chaosArena("황진", 1);
  for (let index = 0; index < 3; index++) advance(run, .01);
  expect(run.chaos?.tick).toBe(0);
  advance(run, .01);
  expect(run.chaos?.tick).toBe(1);
});

test("zero purchases start at army Lv1 and growth reads never consume the RNG", () => {
  const run = chaosArena("신립", 0), before = JSON.stringify(run);
  for (let index = 0; index < 30; index++) {
    expect(growthFor("신립", run).army).toBeNull();
    expect(growthFor("신립", run).level).toBe(0);
  }
  expect(JSON.stringify(run)).toBe(before);
  expect(run.chaos).toMatchObject({ level: 1, xp: 0 });
  expect(run.chaos?.mods ?? null).toBe(CHAOS_LEVELS.신립[5]);
  chaosTicks(run, 30);
  expect(run.chaos).toMatchObject({ level: 1, xp: 0, tick: 30 });
});

test.each(CHAOS_TEST_LEVELS)("Shin N%i applies army movement to real walking distance", level => {
  const mods = CHAOS_LEVELS.신립[Math.max(5, level)], base = CHAOS_LEVELS.신립[5];
  if (mods?.general !== "신립" || base?.general !== "신립") throw new Error("Missing Shin army band");
  const control = chaosArena("신립", 0), grown = chaosArena("신립", level);
  control.squads[0].targetX = grown.squads[0].targetX = 250;
  chaosTicks(control, 1); chaosTicks(grown, 1);
  // The opening survival row supplies the control's movement bonus.
  expect(grown.squads[0].x - 195).toBeCloseTo((control.squads[0].x - 195) * (1 + mods.moveRatio) / (1 + base.moveRatio));
});

test("Shin N20 finishes the original return before leaving two offset damaging trails", () => {
  const run = chaosArena("신립", 20);
  chaosEnemy(run, 245, 100);
  useSkill(run, 0);
  expect(run.chaos?.trails).toHaveLength(0);
  let ticks = 0;
  while (run.squads[0].state === "charge" && ticks++ < 90) chaosTicks(run, 1);
  expect(run.squads[0].state).toBe("guard");
  expect(run.chaos?.trails).toHaveLength(2);
  const trails = run.chaos?.trails ?? [];
  expect(Math.abs(trails[0].from.y - trails[1].from.y)).toBeCloseTo(36);
  expect(trails.map(trail => trail.power)).toEqual([expect.closeTo(2.65 * 2.6), expect.closeTo(2.65 * 2.6)]);
  const target = chaosEnemy(run, (trails[0].from.x + trails[0].to.x) / 2, (trails[0].from.y + trails[1].from.y) / 2);
  chaosTicks(run, 12);
  // Width 80 overlaps the lanes separated by 36: each trail may hit once.
  expect(10000 - target.hp).toBeCloseTo(2.65 * 2.6 * 2);
  chaosTicks(run, 12);
  expect(10000 - target.hp).toBeCloseTo(2.65 * 2.6 * 2);
});

test.each(CHAOS_TEST_LEVELS)("Shin N%i ranged attacks reach the enemy cluster with a fixed length trail", level => {
  const mods = CHAOS_LEVELS.신립[Math.max(5, level)];
  if (mods?.general !== "신립") throw new Error("Missing Shin army band");
  const { every, length, ratio } = mods;
  const run = chaosArena("신립", level), target = chaosEnemy(run, 335, 100);
  addBphProfile(run, { profileId: "Hero1_Archer", copies: 1, foil: false, discovered: false }, { packId: "DeliveryBox" });
  const unit = run.squads[0].soldiers[0];
  // The trail test needs a released attack; 70px is inside the calibrated bow reach.
  Object.assign(unit, { x: 265, y: 100, clock: 1e9, perch: 0, emerging: false });
  for (let attack = 0; attack < every; attack++) {
    // The new 16-shot start band otherwise knocks the fixture out of bow reach before its first trail.
    if (level < 5) Object.assign(target, { x: 335, y: 100 });
    Object.assign(unit, { x: 265, y: 100, strikeAt: run.time, aim: target.id });
    chaosTicks(run, 1); unit.clock = 1e9;
  }
  const trail = run.chaos?.trails[0];
  expect(trail).toBeDefined();
  expect(trail && Math.hypot(trail.to.x - trail.from.x, trail.to.y - trail.from.y)).toBeCloseTo(length);
  expect(trail?.power).toBeCloseTo((1 + level * .02) * ratio);
  // On a narrow band enemies packed within 10px push the target off the lane (N5's 24px band: y 99 -> 123 before the
  // trail passes), so the witnesses stand spaced along the trail itself.
  const neighbors = trail ? [0, .275, 1].map(fraction => chaosEnemy(run,
    trail.from.x + (trail.to.x - trail.from.x) * fraction,
    trail.from.y + (trail.to.y - trail.from.y) * fraction))
    : [chaosEnemy(run, 325, 105), chaosEnemy(run, 340, 95), chaosEnemy(run, 350, 100)];
  chaosTicks(run, 12);
  expect(neighbors.map(enemy => 10000 - enemy.hp)).toEqual(neighbors.map(() => expect.closeTo((1 + level * .02) * ratio)));
  expect(trail?.hits).toContain(target.id);
  expect(run.chaos?.attacks).toBe(every);
});

test("Shin overflow collides immediately while retaining six actors and four targets per trail", () => {
  const run = chaosArena("신립", 20), squad = run.squads[0];
  const target = chaosEnemy(run, 225, 100);
  for (let attack = 0; attack < 14; attack++)
    chaosAfterAttack(run, { unit: squad, target, amount: 10 }, []);
  expect(run.chaos?.trails).toHaveLength(6);
  expect(run.chaos?.pendingTrails).toHaveLength(1);
  const targets = Array.from({ length: 5 }, (_, index) => chaosEnemy(run, 220 + index, 100));
  chaosTicks(run, 1);
  expect(targets.map(enemy => 10000 - enemy.hp)).toEqual([182, 182, 182, 182, 0]);
  expect(run.chaos?.trails.map(trail => trail.hits.length)).toEqual([4, 4, 4, 4, 4, 4]);
  expect(run.chaos?.pendingTrails).toHaveLength(0);
  chaosTicks(run, 1);
  expect(targets.map(enemy => 10000 - enemy.hp)).toEqual([182, 182, 182, 182, 0]);
  for (const enemy of [target, ...targets]) enemy.hp = 0;
  chaosTicks(run, 10);
  expect(run.chaos?.trails).toHaveLength(6);
  expect(run.chaos?.pendingTrails).toHaveLength(0);
  const late = chaosEnemy(run, 410, 100);
  chaosTicks(run, 12);
  expect(late.hp).toBe(10000);
  const expired = chaosEnemy(run, 410, 100);
  chaosTicks(run, 12);
  expect(expired.hp).toBe(10000);
  expect(run.chaos?.attacks).toBe(14);
});

test("Shin simultaneous overflow finishes its last sweep within the activation window without replay", () => {
  const run = chaosArena("신립", 20), squad = run.squads[0];
  const target = chaosEnemy(run, 225, 100);
  for (let attack = 0; attack < 18; attack++)
    chaosAfterAttack(run, { unit: squad, target, amount: 10 }, []);
  target.hp = 0;
  const edge = chaosEnemy(run, 480, 100);
  expect(run.chaos?.trails).toHaveLength(6);
  expect(run.chaos?.pendingTrails).toHaveLength(3);
  chaosTicks(run, 11);
  expect(edge.hp).toBe(10000);
  chaosTicks(run, 1);
  expect(10000 - edge.hp).toBe(234);
  expect(run.chaos?.pendingTrails).toHaveLength(0);
  expect(run.chaos?.trails.map(trail => trail.startedTick)).toEqual([0, 0, 0, 0, 0, 0]);
  const late = chaosEnemy(run, 480, 100);
  chaosTicks(run, 36);
  expect(10000 - edge.hp).toBe(234);
  expect(late.hp).toBe(10000);
  expect(run.chaos?.trails).toHaveLength(0);
  expect(run.chaos?.pendingTrails).toHaveLength(0);
  expect(run.chaos?.attacks).toBe(18);
});

test("Shin sustained overflow holds only recent twelve-tick activations and drains after stopping", () => {
  const run = chaosArena("신립", 20), squad = run.squads[0];
  const target = chaosEnemy(run, 225, 100);
  target.hp = 0;
  for (let tick = 0; tick < 36; tick++) {
    for (let attack = 0; attack < 14; attack++)
      chaosAfterAttack(run, { unit: squad, target, amount: 10 }, []);
    chaosTicks(run, 1);
    expect(run.chaos?.trails).toHaveLength(6);
    expect(run.chaos?.pendingTrails.length).toBeLessThanOrEqual(77);
    for (const trail of run.chaos?.pendingTrails ?? []) {
      expect(trail.startedTick).toBeGreaterThan(tick + 1 - 12);
      expect(trail.startedTick).toBeLessThanOrEqual(tick);
      expect(run.chaos?.trails).not.toContain(trail);
    }
  }
  expect(run.chaos?.attacks).toBe(504);
  expect(run.chaos?.pendingTrails).toHaveLength(77);
  chaosTicks(run, 12);
  expect(run.chaos?.pendingTrails).toHaveLength(0);
  chaosTicks(run, 24);
  expect(run.chaos?.trails).toHaveLength(0);
});

test.each(CHAOS_TEST_LEVELS.filter(level => level < 20))("Hwang N%i schedules the band's delayed stomps before the capstone", level => {
  const run = chaosArena("황진", level);
  chaosEnemy(run, 225, 100);
  useSkill(run, 0);
  const waves = run.chaosSkills?.events ?? [];
  const band = chaosSkillBand(level), rules = CHAOS_RULES.skills.stomps;
  const count = rules.count[band];
  const damage = rules.power[band] / rules.waves[band] * (1 + .03 * (level - 1)) * BPH_SURVIVAL_TABLE.generalSkill;
  expect(waves.filter(event => event.wave === 0)).toHaveLength(count);
  const target = chaosEnemy(run, waves[0].to.x, waves[0].to.y);
  chaosTicks(run, 8);
  expect(target.hp).toBe(10000);
  chaosTicks(run, 1);
  expect(10000 - target.hp).toBeCloseTo(damage);
});
