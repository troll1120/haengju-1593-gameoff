import { expect, test } from "bun:test";
import { CHAOS_RULES } from "./chaos-contract";
import { chaosArena, chaosEnemy, chaosTicks } from "./chaos-test-fixture";
import { fleetArrivalTick, fleetBow, passBand, planPass } from "./chaos-shows/fleet-passes";
import { WIDTH } from "./geometry";
import { bphEffectCombat, useSkill } from "./rules";
import type { Effect } from "./rules";
import { fleetResult, noteHitHealth, SkillHolds } from "./skill-holds";
import { HELD_KINDS } from "./skill-show";
import { bowAt, bowTime, planRam, TURTLE_SHOW } from "./shows/turtle-ship-show";
import { castYisunsin } from "./skills-yisunsin";
import type Phaser from "phaser";
import type { PaintedArt } from "./painted-art";
import { SkillStage } from "./skill-stage";
import type { SkillShow } from "./skill-stage";
import { PALETTE } from "./presentation";

const ms = (tick: number) => tick * 1000 / CHAOS_RULES.simulationHz;

test("manual right-edge targets wait for the bow's visible exit instead of taking damage at the lane endpoint", () => {
  const at = bowTime(0, WIDTH, 24, WIDTH - 24);
  expect(at).toBeGreaterThan(TURTLE_SHOW.pass);
  expect(at).toBeLessThan(TURTLE_SHOW.pass + TURTLE_SHOW.exit);
  expect(bowAt(at, 24, WIDTH - 24)).toBeCloseTo(WIDTH, 9);
});

for (const hp of [2, .5]) test(`automatic fleet holds precise HP, number and death until the bow reaches hp=${hp}`, () => {
  const run = chaosArena("이순신", 1), enemy = chaosEnemy(run, WIDTH - 40, 300);
  enemy.hp = enemy.maxHp = hp;
  run.chaos!.nextFleetTick = 1;
  const effects = chaosTicks(run, 1);
  const hit = effects.find(effect => effect.kind === "hit" && effect.target === enemy.id)!;
  expect(hit).toBeDefined();
  const pass = fleetResult(hit)!;
  expect(pass).toBeDefined();
  const holds = new SkillHolds(), results = effects.filter(effect => fleetResult(effect) === pass);
  const arrival = fleetArrivalTick(pass, run.chaos!.mods, hit.x, WIDTH);
  const band = passBand(pass, run.chaos!.mods, WIDTH), plan = planPass(1, band, false);
  expect(fleetBow(band, plan.hull, (arrival - pass.dueTick) / CHAOS_RULES.fleet.passTicks)).toBeCloseTo(hit.x, 9);
  const snapshot = JSON.stringify(run);
  holds.hold(results, effect => ms(fleetArrivalTick(pass, run.chaos!.mods, effect.x, WIDTH)), 0,
    effect => effect, "fleet", 0);
  expect(holds.update(5000, ms(arrival - .001))).toEqual([]);
  expect(holds.hp(enemy.id, enemy.hp)).toBeCloseTo(hp, 9);
  expect(holds.pinned(enemy.id)).toEqual({ x: hit.x, y: hit.y });
  expect(holds.holds(enemy.id)).toBe(hp === .5);
  const released = holds.update(5010, ms(arrival));
  expect(released).toContain(hit);
  expect(holds.hp(enemy.id, enemy.hp)).toBeCloseTo(Math.max(0, enemy.hp), 9);
  expect(holds.holds(enemy.id)).toBe(false);
  expect(JSON.stringify(run)).toBe(snapshot);
});

test("fleet results use the ship's simulation clock across a hit stop, then flush when motion is disabled", () => {
  const run = chaosArena("이순신", 1), enemy = chaosEnemy(run, 300, 300);
  run.chaos!.nextFleetTick = 1;
  const effects = chaosTicks(run, 1), hit = effects.find(effect => effect.kind === "hit")!, pass = fleetResult(hit)!;
  const holds = new SkillHolds();
  holds.hold([hit], () => ms(fleetArrivalTick(pass, run.chaos!.mods, hit.x, WIDTH)), 0, effect => effect, "fleet", 0);
  expect(holds.update(5000, ms(pass.dueTick))).toEqual([]);
  expect(holds.hp(enemy.id, enemy.hp)).toBe(enemy.maxHp);
  expect(holds.update(5001, ms(pass.dueTick), false)).toEqual([hit]);
  expect(holds.hp(enemy.id, enemy.hp)).toBe(enemy.hp);
});

test("level-zero manual extra passes drop displayed HP once at each bow arrival, with fractional damage intact", () => {
  const run = chaosArena("이순신", 1), enemy = chaosEnemy(run, 140, 300);
  run.chaos!.level = 0;
  const effects: Effect[] = [], combat = bphEffectCombat(run, effects);
  castYisunsin(run, run.squads[0], effects, {
    damage: (target, amount) => combat.damage(target, amount, run.squads[0]),
    knock: (target, _from, pixels) => { target.x += pixels; },
  }, { extraPass: 1 });
  const results = effects.filter(effect => HELD_KINDS.has(effect.kind));
  const skill = effects.find(effect => effect.kind === "skill")!;
  const from = { x: skill.fromX!, y: skill.fromY! }, to = { x: skill.x, y: skill.y };
  const plan = planRam({ seed: 7, pass: 0, from, to, half: skill.value, density: 0, still: false, results });
  const holds = new SkillHolds(), initial = enemy.maxHp, snapshot = JSON.stringify(run);
  holds.hold(results, (_effect, index) => plan.times[index], 0, effect => ({ x: effect.x, y: effect.y }));
  const hits = results.flatMap((effect, index) => effect.kind === "hit" ? [{ effect, at: plan.times[index] }] : []);
  expect(hits).toHaveLength(2);
  expect(holds.update(hits[0].at - .001, 0)).toEqual([]);
  expect(holds.hp(enemy.id, enemy.hp)).toBeCloseTo(initial, 9);
  expect(bowAt(hits[0].at, from.x, to.x)).toBeCloseTo(hits[0].effect.x, 9);
  expect(holds.update(hits[0].at, 0)).toContain(hits[0].effect);
  const afterFirst = holds.hp(enemy.id, enemy.hp);
  expect(afterFirst).toBeLessThan(initial);
  holds.update(hits[1].at - .001, 0);
  expect(holds.hp(enemy.id, enemy.hp)).toBe(afterFirst);
  expect(holds.update(hits[1].at, 0)).toContain(hits[1].effect);
  expect(holds.hp(enemy.id, enemy.hp)).toBeCloseTo(enemy.hp, 9);
  expect(JSON.stringify(run)).toBe(snapshot);
});

test("later lethal hits cannot overtake a held turtle hit; clear drops all presentation state", () => {
  const run = chaosArena("이순신", 1), enemy = chaosEnemy(run, 250, 300);
  enemy.hp = enemy.maxHp = 10;
  const holds = new SkillHolds();
  const hit: Effect = { kind: "hit", x: enemy.x, y: enemy.y, value: 1, target: enemy.id };
  enemy.hp -= 1.2; noteHitHealth(hit, enemy, 1.2);
  holds.hold([hit], () => 800, 0, effect => effect);
  const later: Effect = { ...hit, value: 20 }, kill: Effect = { ...hit, kind: "kill" };
  enemy.hp -= 20; noteHitHealth(later, enemy, 20);
  expect(holds.follow([later, kill], 50)).toEqual([later, kill]);
  expect(holds.hp(enemy.id, enemy.hp)).toBeCloseTo(10, 9);
  expect(holds.update(799, 0)).toEqual([]);
  expect(holds.update(800, 0)).toEqual([hit, later]);
  expect(holds.holds(enemy.id)).toBe(true);
  expect(holds.hp(enemy.id, enemy.hp)).toBe(0);
  expect(holds.update(850, 0)).toEqual([kill]);
  holds.clear();
  expect(holds.target(enemy.id)).toBeUndefined();
  expect(holds.pinned(enemy.id)).toBeUndefined();
});

test("natural level-zero useSkill receipts retain the original targets and damage amounts", () => {
  const run = chaosArena("이순신", 1), enemy = chaosEnemy(run, 200, 300);
  run.chaos!.level = 0;
  const effects = useSkill(run, 0), hit = effects.find(effect => effect.kind === "hit")!;
  const holds = new SkillHolds();
  holds.hold([hit], () => 300, 0, effect => effect);
  expect(holds.hp(enemy.id, enemy.hp)).toBeCloseTo(enemy.maxHp, 9);
  const before = JSON.stringify(run);
  holds.update(300, 0);
  expect(JSON.stringify(run)).toBe(before);
});

function stageFixture() {
  const picture = { setDepth() { return this; }, setVisible() { return this; }, setAlpha() { return this; }, clear() {} };
  const scene = { add: { rectangle: () => picture, graphics: () => picture } } as unknown as Phaser.Scene;
  const turtle: SkillShow = { general: "이순신", accent: PALETTE.teal, cast: () => () => 800, update() {}, clear() {} };
  const other: SkillShow = { ...turtle, general: "권율", cast: () => () => 100 };
  const run = chaosArena("이순신", 1), enemy = chaosEnemy(run, 250, 300);
  enemy.hp = enemy.maxHp = 10;
  const stage = new SkillStage(scene, {} as PaintedArt, [turtle, other]);
  const hit: Effect = { kind: "hit", x: enemy.x, y: enemy.y, value: 2, target: enemy.id };
  const kill: Effect = { ...hit, kind: "kill" }, later: Effect = { ...hit, value: 20 };
  enemy.hp -= 2; noteHitHealth(hit, enemy, 2);
  enemy.hp -= 20; noteHitHealth(later, enemy, 20);
  const context = { skill: { ...hit, kind: "skill" as const }, results: [hit], run, squad: run.squads[0],
    from: run.squads[0], tier: 1, channels: { motion: true, flash: false }, density: 0 };
  const frame = { run, cssPixel: 1, at: (point: { x: number; y: number }) => point, foe: () => undefined, channels: context.channels };
  return { stage, run, enemy, hit, later, kill, context, frame };
}

test("scene order registers a manual cast before holding an ordinary lethal hit from the same frame", () => {
  const { stage, enemy, hit, later, kill, context, frame } = stageFixture();
  stage.cast("이순신", context, () => enemy);
  expect(stage.holdFollowing([later, kill], context.channels)).toEqual([later, kill]);
  expect(stage.hp(enemy.id, enemy.hp)).toBe(10);
  for (let step = 0; step < 7; step++) expect(stage.update(100, frame)).toEqual([]);
  expect(stage.update(99, frame)).toEqual([]);
  expect(stage.holds(enemy.id)).toBe(true);
  expect(stage.update(1, frame)).toEqual([hit, later, kill]);
  expect(stage.hp(enemy.id, enemy.hp)).toBe(0);
});

test("another staged skill cannot release its lethal result before a pending turtle hit", () => {
  const { stage, enemy, hit, later, kill, context, frame } = stageFixture();
  stage.cast("이순신", context, () => enemy);
  stage.cast("권율", { ...context, results: [later, kill] }, () => enemy);
  expect(stage.hp(enemy.id, enemy.hp)).toBe(10);
  for (let step = 0; step < 7; step++) expect(stage.update(100, frame)).toEqual([]);
  expect(stage.update(99, frame)).toEqual([]);
  expect(stage.holds(enemy.id)).toBe(true);
  expect(stage.update(1, frame)).toEqual([hit, later, kill]);
  expect(stage.hp(enemy.id, enemy.hp)).toBe(0);
});

test("a later show's own impact remains a minimum even after the turtle has landed", () => {
  const { enemy, hit, later, kill } = stageFixture(), holds = new SkillHolds();
  holds.hold([hit], () => 100, 0, effect => effect);
  holds.hold([later, kill], () => 500, 0, effect => effect, "stage", 0, false);
  expect(holds.update(100, 0)).toEqual([hit]);
  expect(holds.hp(enemy.id, enemy.hp)).toBe(8);
  expect(holds.holds(enemy.id)).toBe(true);
  expect(holds.update(499, 0)).toEqual([]);
  expect(holds.update(500, 0)).toEqual([later, kill]);
});

for (const follow of [false, true]) test(`dependent death retains its flash interval and coin timing (ordinary=${follow})`, () => {
  const { enemy, hit, later, kill } = stageFixture(), holds = new SkillHolds();
  const coin: Effect = { kind: "coin", x: enemy.x, y: enemy.y, value: 1 };
  holds.hold([hit], () => 800, 50, effect => effect);
  if (follow) {
    // This second held hit itself waits for the turtle, so follow() must use its effective arrival.
    holds.hold([later], () => 100, 50, effect => effect, "stage", 0, false);
    expect(holds.follow([kill, coin], 50)).toEqual([kill, coin]);
  } else holds.hold([later, kill, coin], () => 100, 50, effect => effect, "stage", 0, false);
  expect(holds.update(800, 0)).toEqual([hit, later]);
  expect(holds.holds(enemy.id)).toBe(true);
  expect(holds.hp(enemy.id, enemy.hp)).toBe(0);
  expect(holds.update(849, 0)).toEqual([]);
  expect(holds.update(850, 0)).toEqual([kill, coin]);
});
