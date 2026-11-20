import { expect, test } from "bun:test";
import { CHAOS_LEVELS, CHAOS_RULES } from "../chaos-contract";
import { chaosArena, chaosEnemy, chaosFire, chaosTicks } from "../chaos-test-fixture";
import type { Point } from "../geometry";
import { useSkill } from "../rules";
import { castStomps } from "../shows/jingak-show";
import type { ShowChannels } from "../skill-show";
import { POOL, SkillStage } from "../skill-stage";
import type { MarkTiming, Reach } from "../skill-stage";
import { armyStomps, planGather, planStompRing, RING_MOTES, ringFront, ringReaches, STOMP_RINGS_SHOW, StompPictures } from "./stomp-rings";
import type { Stomp, StompScene, StompStage } from "./stomp-rings";

// 48 attacks: a whole number of every survival band's ring period (12, 8, 6, 3).
const LEVELS = [1, 5, 10, 15, 20] as const, ATTACKS = 48;
const MOVING: ShowChannels = { motion: true, flash: true }, STILL: ShowChannels = { motion: false, flash: true };
const armyMods = (level: number) => {
  const mods = CHAOS_LEVELS["황진"][Math.max(5, level)];
  if (mods?.general !== "황진") throw new Error(`No 황진 army level ${level}`);
  return mods;
};
const reachOf = (level: number): number => armyMods(level).radius;

function armyAttacks(level: number): { readonly striker: Point; readonly scenes: StompScene[] } {
  const run = chaosArena("황진", level), target = chaosEnemy(run, 215, 100), scenes: StompScene[] = [];
  for (let attack = 0; attack < ATTACKS; attack++) { chaosFire(run, target); target.x = 215; scenes.push(armyStomps(run.chaos)); }
  return { striker: { x: run.squads[0].x, y: run.squads[0].y }, scenes };
}
function castScenes(level: number): StompScene[] {
  const run = chaosArena("황진", level), scenes: StompScene[] = [];
  useSkill(run, 0);
  while (run.chaosSkills?.events.length) { scenes.push(castStomps(run.chaosSkills)); chaosTicks(run, 1); }
  return scenes;
}
const realSources = (level: number) => [{ scenes: castScenes(level), bold: true }, { scenes: armyAttacks(level).scenes, bold: false }];
const everyStomp = (scenes: readonly StompScene[]): Stomp[] => [...new Map(scenes.flatMap(scene => scene.stomps).map(stomp => [stomp.id, stomp] as const)).values()];

type Painted = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type Thrown = Point & { readonly size: number };
type Frame = { readonly scene: StompScene; readonly onItsTick: boolean; readonly painted: readonly Painted[];
  readonly marks: readonly { readonly reach: Reach; readonly timing: MarkTiming }[]; readonly thrown: readonly Thrown[] };
type Shot = { readonly scene: StompScene; readonly now: number };
function drawn(shots: readonly Shot[], channels: ShowChannels, bold: boolean): Frame[] {
  let painted: Painted[] = [], marks: { reach: Reach; timing: MarkTiming }[] = [], thrown: Thrown[] = [];
  const ground: StompStage["ground"] = { fillStyle: () => ground, fillRect: (x, y, width, height) => { painted.push({ x, y, width, height }); return ground; } };
  const stage: StompStage = { ground, reach: SkillStage.prototype.reach, mark: (reach, timing) => { marks.push({ reach, timing }); },
    mote: (at, _vx, _vy, _pull, _life, _paint, _twinkles, _delay, size = 0) => { thrown.push({ x: at.x, y: at.y, size }); } };
  const pictures = new StompPictures({ bold });
  return shots.map(({ scene, now }, index) => {
    painted = []; marks = []; thrown = [];
    pictures.draw(stage, scene, { now, channels });
    return { scene, onItsTick: shots[index - 1]?.scene !== scene, painted, marks, thrown };
  });
}
function drawnOnAndBetweenTicks(scenes: readonly StompScene[], channels: ShowChannels, bold: boolean): Frame[] {
  const halfTickMs = 500 / CHAOS_RULES.simulationHz;
  return drawn(scenes.flatMap((scene, tick) => [{ scene, now: tick * 2 * halfTickMs }, { scene, now: (tick * 2 + 1) * halfTickMs }]), channels, bold);
}
const middle = (cell: Painted): Point => ({ x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 });
const inside = (at: Point, stomp: Stomp): boolean => Math.hypot(at.x - stomp.x, at.y - stomp.y) <= stomp.radius;
const takesItsSizeFromTheStageScatter = (chip: Thrown): boolean => chip.size <= 0;
const gap = (at: Point, stomp: Stomp): number => Math.hypot(at.x - stomp.x, at.y - stomp.y);

test("every crack, chip and gathering mote planned for 황진's real army rings and real cast stomps stays inside its real reach and life", () => {
  for (const level of LEVELS) for (const { scenes } of realSources(level)) for (const stomp of everyStomp(scenes)) for (const bold of [false, true]) {
    const plan = planStompRing({ seed: stomp.id, x: stomp.x, y: stomp.y, radius: stomp.radius, motes: RING_MOTES, bold, still: false });
    expect(plan.cracks.length).toBeGreaterThan(0);
    expect(plan.chips.length).toBeGreaterThan(0);
    expect(plan.chips.length).toBeLessThanOrEqual(Math.round(RING_MOTES * (bold ? STOMP_RINGS_SHOW.bold : 1)));
    for (const cell of plan.cracks) {
      expect(Number.isInteger(cell.x / 4) && Number.isInteger(cell.y / 4)).toBe(true);
      for (const [cornerX, cornerY] of [[0, 0], [4, 0], [0, 4], [4, 4]])
        expect(Math.hypot(cell.x + cornerX - stomp.x, cell.y + cornerY - stomp.y)).toBeLessThanOrEqual(stomp.radius);
      expect(cell.at).toBeCloseTo(ringReaches(cell.far, stomp.radius), 9);
    }
    for (const chip of plan.chips) {
      expect(Math.hypot(chip.x - stomp.x, chip.y - stomp.y)).toBeLessThanOrEqual(stomp.radius);
      expect(chip.at).toBeGreaterThanOrEqual(0);
      expect(chip.life).toBeGreaterThan(0);
      expect(chip.at + chip.life).toBeLessThanOrEqual(1);
    }
    const motes = planGather({ seed: stomp.id, x: stomp.x, y: stomp.y, radius: stomp.radius, motes: RING_MOTES, still: false });
    expect(motes.length).toBeGreaterThan(0);
    expect(motes.length).toBeLessThanOrEqual(RING_MOTES);
    for (const mote of motes) {
      expect(Math.hypot(mote.x - stomp.x, mote.y - stomp.y)).toBeLessThanOrEqual(stomp.radius);
      expect(mote.wait).toBeGreaterThanOrEqual(0);
      expect(mote.wait).toBeLessThan(1);
    }
  }
});

test("over the same real attacks 황진's army stands more rings at a higher level, each landing at once on the striker with that level's real reach", () => {
  let fewer = 0;
  for (const level of LEVELS) {
    const { striker, scenes } = armyAttacks(level), rings = everyStomp(scenes), mods = armyMods(level);
    expect(rings).toHaveLength(ATTACKS / mods.every);
    if (level === 5) expect(rings.length).toBe(fewer);
    else expect(rings.length).toBeGreaterThan(fewer);
    fewer = rings.length;
    expect(Math.max(...scenes.map(scene => scene.stomps.length))).toBeLessThanOrEqual(CHAOS_RULES.ring.capacity);
    for (const ring of rings) {
      expect([ring.x, ring.y, ring.radius]).toEqual([striker.x, striker.y, mods.radius]);
      expect([ring.landsTick - ring.startedTick, ring.untilTick - ring.landsTick]).toEqual([0, CHAOS_RULES.ring.lifetimeTicks]);
    }
  }
});

test("with motion on the picture paints only inside the real stomps standing at that moment, paints the ground under each one's foot, and throws every chip from inside one", () => {
  for (const level of LEVELS) for (const { scenes, bold } of realSources(level)) for (const { scene, painted, marks, thrown } of drawnOnAndBetweenTicks(scenes, MOVING, bold)) {
    expect(marks).toEqual([]);
    expect(painted.filter(cell => !scene.stomps.some(stomp => inside(middle(cell), stomp)))).toEqual([]);
    expect(thrown.filter(chip => !scene.stomps.some(stomp => inside(chip, stomp)))).toEqual([]);
    expect(scene.stomps.filter(({ x, y }) => !painted.some(cell => cell.x <= x && x < cell.x + cell.width && cell.y <= y && y < cell.y + cell.height))).toEqual([]);
  }
});

test("a real stomp's ring starts on the tick the rules land it: no chip leaves its foot while it is still coming, chips leave it then, and the wave is still at the foot", () => {
  const CELL = 4;
  for (const level of LEVELS) for (const { scenes, bold } of realSources(level)) {
    const frames = drawnOnAndBetweenTicks(scenes, MOVING, bold), fromItsFoot = (stomp: Stomp, frame: Frame) => frame.thrown.filter(chip => gap(chip, stomp) <= CELL).length;
    for (const stomp of everyStomp(scenes)) {
      const standing = frames.filter(({ scene }) => scene.stomps.some(({ id }) => id === stomp.id));
      const coming = standing.filter(({ scene }) => scene.tick < stomp.landsTick), landing = standing.find(({ scene }) => scene.tick >= stomp.landsTick);
      expect([coming.reduce((sum, frame) => sum + fromItsFoot(stomp, frame), 0), landing ? fromItsFoot(stomp, landing) > 0 : false]).toEqual([0, true]);
    }
    const allLanding = frames.filter(({ scene, onItsTick }) => onItsTick && scene.stomps.every(stomp => stomp.landsTick === scene.tick));
    expect(allLanding.flatMap(({ scene, painted }) => painted.filter(cell => !scene.stomps.some(stomp => gap(middle(cell), stomp) <= CELL * 2)))).toEqual([]);
    if (bold) expect(allLanding.length).toBe(new Set(everyStomp(scenes).map(stomp => stomp.landsTick)).size);
  }
});

test("while the rules stand still the picture runs on by one step at most: a stomp two steps from landing does not land in it", () => {
  const scenes = castScenes(20), twoStepsBefore = scenes.find(scene => scene.tick === scenes[0].stomps[0].landsTick - 2);
  if (!twoStepsBefore) throw new Error("The cast never stood two steps before its first landing");
  const threeStepsOfDisplayTime = 3000 / CHAOS_RULES.simulationHz;
  const [first, stalled] = drawn([{ scene: twoStepsBefore, now: 0 }, { scene: twoStepsBefore, now: threeStepsOfDisplayTime }], MOVING, true);
  expect([first.thrown.length > 0, stalled.thrown]).toEqual([true, []]);
});

test("however many stomps the rules land at once, one frame never asks the stage for more chips than the picture's share of its motes", () => {
  for (const level of LEVELS) for (const { scenes, bold } of realSources(level)) {
    const share = Math.round(POOL.motes * STOMP_RINGS_SHOW.motes * (bold ? STOMP_RINGS_SHOW.bold : 1));
    const mostInOneFrame = Math.max(...drawnOnAndBetweenTicks(scenes, MOVING, bold).map(frame => frame.thrown.length));
    expect([mostInOneFrame > 0, mostInOneFrame <= share]).toEqual([true, true]);
  }
});

test("with motion off each real stomp is one unchanging mark of its real reach while it stands, on and between the rules' ticks, and nothing is painted or thrown", () => {
  for (const level of LEVELS) for (const { scenes, bold } of realSources(level)) {
    const frames = drawnOnAndBetweenTicks(scenes, STILL, bold), someFootLandsAfterItShows = everyStomp(scenes).some(stomp => stomp.landsTick > stomp.startedTick);
    const looks = (landed: boolean) => new Set(frames.flatMap(({ scene, marks }) => marks.filter((_, index) => scene.tick >= scene.stomps[index].landsTick === landed)
      .map(({ timing }) => JSON.stringify(timing))));
    for (const { scene, painted, marks, thrown } of frames) {
      expect([painted, thrown]).toEqual([[], []]);
      expect(marks.map(({ reach }) => [reach.x, reach.y, reach.radius])).toEqual(scene.stomps.map(stomp => [stomp.x, stomp.y, stomp.radius]));
      expect(marks.map(({ timing }) => [timing.age, timing.since, timing.alpha])).toEqual(marks.map(() => [0, -1, STOMP_RINGS_SHOW.still]));
    }
    expect([looks(false).size, looks(true).size]).toEqual([someFootLandsAfterItShows ? 1 : 0, 1]);
    expect([...looks(false)].filter(look => looks(true).has(look))).toEqual([]);
  }
});

test("a ring's and a gathering's decoration repeats for its seed, the whole picture repeats for the same real cast, and nothing draws from Math.random or the stage's scatter", () => {
  const ring = { seed: 7, x: 200, y: 300, radius: reachOf(20), motes: RING_MOTES, bold: false, still: false };
  const scenes = castScenes(20), global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    expect(planStompRing(ring)).toEqual(planStompRing(ring));
    expect(planStompRing({ ...ring, seed: 8 })).not.toEqual(planStompRing(ring));
    expect(planGather(ring)).toEqual(planGather(ring));
    expect(planGather({ ...ring, seed: 8 })).not.toEqual(planGather(ring));
    const frames = drawnOnAndBetweenTicks(scenes, MOVING, true);
    expect(drawnOnAndBetweenTicks(scenes, MOVING, true)).toEqual(frames);
    expect(frames.flatMap(frame => frame.thrown).filter(takesItsSizeFromTheStageScatter)).toEqual([]);
  } finally { Math.random = global; }
});

test("the shockwave runs from the foot onto the real rim inside the ring's life and never past it", () => {
  const { race } = STOMP_RINGS_SHOW;
  for (const radius of [reachOf(10), reachOf(20)]) {
    expect(ringFront(0, radius)).toBe(0);
    let front = 0;
    for (let step = 1; step <= 100; step++) {
      const share = step / 100, next = ringFront(share, radius);
      expect(next).toBeGreaterThanOrEqual(front);
      expect(next).toBeLessThanOrEqual(radius);
      if (share <= race) expect(ringReaches(next, radius)).toBeCloseTo(share, 9);
      front = next;
    }
    expect(ringFront(race, radius)).toBe(radius);
    expect(ringFront(1, radius)).toBe(radius);
    expect(ringReaches(radius, radius)).toBe(race);
    expect(ringReaches(radius * 3, radius)).toBe(race);
  }
});

test("with motion off nothing is planned to travel: no cracks, chips or gathering dust", () => {
  const ring = { seed: 7, x: 200, y: 300, radius: reachOf(10), motes: RING_MOTES, bold: true, still: true };
  expect(planStompRing(ring)).toEqual({ cracks: [], chips: [] });
  expect(planGather(ring)).toEqual([]);
});
