import { expect, test } from "bun:test";
import { CHAOS_RULES, chaosSkillBand } from "../chaos-contract";
import type { ChaosState } from "../chaos-contract";
import { chaosArena, chaosEnemy, chaosTicks } from "../chaos-test-fixture";
import { CENTER, contains, fortRect, gapToRect, sideOf, SIDES } from "../geometry";
import type { Point } from "../geometry";
import { PALETTE } from "../presentation";
import type { Paint } from "../presentation";
import { useSkill } from "../rules";
import type { Run } from "../rules";
import type { ShowChannels } from "../skill-show";
import type { SkillStage } from "../skill-stage";
import { ambient, CANNON_GENERAL, cannonShells, GunPainter, paintBattery, planBattery, WALL_BATTERY_SHOW } from "./wall-belt";
import type { BatteryPlan, GunHeat, GunPart } from "./wall-belt";

type Mark = { readonly part: GunPart; readonly paint: Paint; readonly x: number; readonly y: number; readonly wide: number; readonly high: number };
const MOVING: ShowChannels = { motion: true, flash: true }, CALM: ShowChannels = { motion: true, flash: false }, STILL: ShowChannels = { motion: false, flash: true };
const ARMY = [1, 5, 10, 15, 20] as const;
const { count: COUNT, passiveEvery: EVERY, passiveReach: REACH } = CHAOS_RULES.skills.cannon;
/** Off each side of the wall, inside every band's passive reach, so every band's passive guns fire on every side. */
const OFF_WALL = Math.min(...REACH) - 8;

/** 김시민's run at an army level with a foe standing off each side of the wall, stepped once so the rules hold its army state. */
function battery(level: number): { readonly run: Run; readonly state: ChaosState } {
  const run = chaosArena(CANNON_GENERAL, level), wall = fortRect(run.fort);
  for (const [x, y] of [[CENTER.x, wall.top - OFF_WALL], [CENTER.x, wall.bottom + OFF_WALL], [wall.left - OFF_WALL, CENTER.y], [wall.right + OFF_WALL, CENTER.y]]) chaosEnemy(run, x, y);
  chaosTicks(run, 1);
  if (!run.chaos) throw new Error(`no army state at level ${level}`);
  return { run, state: run.chaos };
}

function planOf(run: Run, channels: ShowChannels): BatteryPlan {
  const plan = planBattery(run, channels);
  if (!plan) throw new Error("no battery stands");
  return plan;
}

function picture(plan: BatteryPlan, channels: ShowChannels): Mark[] {
  const marks: Mark[] = [];
  paintBattery(plan, new GunPainter((part, paint) => (x, y, wide, high) => { marks.push({ part, paint, x, y, wide, high }); }, channels.flash));
  return marks;
}

const key = (point: Point): string => `${point.x},${point.y}`;
const holds = (mark: Mark, point: Point): boolean => point.x >= mark.x && point.x <= mark.x + mark.wide && point.y >= mark.y && point.y <= mark.y + mark.high;
function firingPorts(run: Run): string[] {
  const tick = run.chaosSkills?.tick ?? 0;
  return [...new Set(cannonShells(run).filter(shell => shell.startedTick <= tick && tick < shell.untilTick).map(shell => key(shell.from)))].sort();
}

test.each(ARMY)("N%i: a gun stands in every wall port the rules fire from, CHAOS_RULES' count a side, and every shell the rules fire leaves from one of them", level => {
  const { run } = battery(level), wall = fortRect(run.fort), band = chaosSkillBand(level), plan = planOf(run, MOVING), standing = new Set(plan.ports.map(key));
  expect(standing.size).toBe(SIDES.length * COUNT[band]);
  expect(plan.ports).toHaveLength(standing.size);
  for (const side of SIDES) expect(plan.ports.filter(port => port.side === side)).toHaveLength(COUNT[band]);
  for (const port of plan.ports) {
    expect(gapToRect(wall, port)).toBe(0);
    expect(contains(wall, port)).toBe(false);
    expect(sideOf(wall, port)).toBe(port.side);
  }
  const guns = picture(plan, MOVING);
  for (const port of plan.ports) expect(guns.some(mark => holds(mark, port))).toBe(true);
  // A cast and two passive volleys: every shell the rules reserve leaves from a standing port, and they leave from every side.
  useSkill(run, 0);
  const origins = new Map<string, string>();
  for (let tick = 0; tick < EVERY[band] * 2; tick++, chaosTicks(run, 1)) for (const shell of cannonShells(run)) origins.set(key(shell.from), sideOf(wall, shell.from));
  for (const origin of origins.keys()) expect(standing.has(origin)).toBe(true);
  expect([...new Set(origins.values())].sort()).toEqual([...SIDES].sort());
});

test("the battery grows a side with each band of the army level, the smallest at a fresh run's Lv1, and none stands for another commander", () => {
  const guns = ARMY.map(level => planOf(battery(level).run, MOVING).ports.length);
  expect(guns).toEqual(ARMY.map(level => SIDES.length * COUNT[chaosSkillBand(level)]));
  for (let index = 1; index < guns.length; index++) expect(guns[index]).toBeGreaterThan(guns[index - 1]);
  // A survival run has no army level zero any more: a fresh run stands Lv1's battery, the smallest one.
  const bare = chaosArena(CANNON_GENERAL, 0);
  chaosEnemy(bare, CENTER.x, fortRect(bare.fort).top - 90);
  chaosTicks(bare, 1);
  expect(bare.chaos?.level).toBe(1);
  expect(planOf(bare, MOVING).ports).toHaveLength(SIDES.length * COUNT[chaosSkillBand(1)]);
  expect(planOf(bare, MOVING).ports.length).toBeLessThan(guns[1]);
  const other = chaosArena("황진", 20);
  chaosTicks(other, 1);
  expect(other.chaos?.general).toBe("황진");
  expect(planBattery(other, MOVING)).toBeUndefined();
});

test("each gun's fuse burns through the rules' passive period and the rules' volley leaves as it burns out, period after period", () => {
  const { run, state } = battery(20), band = chaosSkillBand(20), every = EVERY[band], { smoulder, burn } = WALL_BATTERY_SHOW, seen = new Set<number>();
  const rank: Readonly<Record<GunHeat, number>> = { cold: 0, smoulder: 1, burn: 2, spit: 2, fired: 3 };
  for (const period of [1, 2]) {
    const heats = new Set<GunHeat>();
    for (; state.tick < every * period - 1; chaosTicks(run, 1)) {
      const plan = planOf(run, MOVING), fuse = (state.tick - every * (period - 1)) / every;
      expect(plan.fuse).toBeCloseTo(fuse, 9);
      expect(rank[plan.heat]).toBe(fuse < smoulder ? 0 : fuse < burn ? 1 : 2);
      expect(planOf(run, CALM).heat).not.toBe("spit");
      heats.add(plan.heat);
      for (const shell of cannonShells(run)) expect(seen.has(shell.id)).toBe(true);
    }
    expect([...heats].sort()).toEqual(["burn", "cold", "smoulder", "spit"]);
    chaosTicks(run, 1);
    const volley = cannonShells(run).filter(shell => !seen.has(shell.id)), plan = planOf(run, MOVING);
    expect(volley).toHaveLength(SIDES.length * COUNT[band]);
    for (const shell of volley) seen.add(shell.id);
    expect(plan.fuse).toBeCloseTo(0, 9);
    expect(plan.ports.filter(port => port.firing).map(key).sort()).toEqual(firingPorts(run));
  }
});

test("with motion off the guns stand cold and still whatever the rules' clock, and a fallen commander's battery stands silent", () => {
  const { run } = battery(20), first = picture(planOf(run, STILL), STILL);
  chaosTicks(run, Math.floor(EVERY[chaosSkillBand(20)] * .9));
  expect(planOf(run, MOVING).heat).not.toBe("cold");
  expect(planOf(run, STILL)).toEqual({ ports: planOf(run, MOVING).ports, heat: "cold" });
  expect(picture(planOf(run, STILL), STILL)).toEqual(first);
  run.squads[0].state = "down";
  expect(planOf(run, MOVING)).toEqual(planOf(run, STILL));
});

test("a firing port's gun is left to the barrage so no port holds two guns, and the battery lies on the ground, never red, never from Math.random", () => {
  const { run } = battery(20), global = Math.random, forbidden = new Set<Paint>([PALETTE.danger, PALETTE.red, PALETTE.scarlet]);
  useSkill(run, 0);
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    const plan = planOf(run, MOVING), marks = picture(plan, MOVING), firing = plan.ports.filter(port => port.firing);
    expect(firing.map(key).sort()).toEqual(firingPorts(run));
    expect(firing).not.toEqual([]);
    for (const port of plan.ports) expect(marks.some(mark => holds(mark, port))).toBe(!port.firing);
    expect([...new Set(marks.map(mark => mark.part))]).toEqual(["gun"]);
    expect(marks.some(mark => forbidden.has(mark.paint))).toBe(false);
    expect(planBattery(run, MOVING)).toEqual(plan);
    // Through the stage the guns go to the ground layer only, under the bodies and the enemy's warnings.
    if (!ambient) throw new Error("the battery is not registered");
    const laid: string[] = [], stage: SkillStage = Object.create(null);
    const layer = (name: string) => { const graphics = { fillStyle: () => graphics, fillRect: () => { laid.push(name); return graphics; } }; return graphics; };
    Object.defineProperties(stage, { ground: { value: layer("ground") }, trails: { value: layer("trails") } });
    ambient.update(stage, { now: 0, cssPixel: 1, run, channels: MOVING, at: (point: Point) => point, foe: () => undefined });
    expect(laid).toHaveLength(marks.length);
    expect([...new Set(laid)]).toEqual(["ground"]);
  } finally { Math.random = global; }
});
