import { expect, test } from "bun:test";
import { CHAOS_RULES, chaosSkillBand } from "../chaos-contract";
import type { ChaosTrail } from "../chaos-contract";
import { chaosArena, chaosEnemy, chaosFire, chaosTicks } from "../chaos-test-fixture";
import type { Point } from "../geometry";
import { PALETTE } from "../presentation";
import type { Paint } from "../presentation";
import { useSkill } from "../rules";
import type { Run } from "../rules";
import { armyTick, cloneMoment, cloneRides, laneSpot, paintClone, paintQueued, paintTrail, planClone, planTrail, streakSpan, tickClock, trailMoment, TRAIL_SHOW } from "./charge-trails";
import type { TrailLayer, TrailLook, TrailPlan, TrailSink } from "./charge-trails";

type Mark = { readonly layer: TrailLayer; readonly paint: Paint; readonly alpha: number;
  readonly x: number; readonly y: number; readonly wide: number; readonly high: number };

function record(paint: (sink: TrailSink) => void): Mark[] {
  const marks: Mark[] = [];
  paint((layer, tone, alpha, x, y, wide, high) => marks.push({ layer, paint: tone, alpha, x, y, wide, high }));
  return marks;
}

/** A sample army state from the real rules: 신립 at army level N attacks one foe until the rules lay a breakthrough trail. */
function armyTrail(level: number, at: Point): ChaosTrail {
  const run = chaosArena("신립", level), target = chaosEnemy(run, at.x, at.y);
  for (let attack = 0; attack < 40 && !run.chaos?.trails.length; attack++) { chaosFire(run, target); target.x = at.x; target.y = at.y; }
  const trail = run.chaos?.trails[0];
  if (!trail) throw new Error(`no trail at army level ${level}`);
  return trail;
}

/** A real manual charge at army level N: the rules ride 신립 at a boss and, from N1, his clones beside him. */
function charge(level: number, at: Point): Run {
  const run = chaosArena("신립", level), aim = chaosEnemy(run, at.x, at.y);
  aim.boss = true;
  useSkill(run, 0);
  return run;
}

function fromLane(trail: Pick<ChaosTrail, "from" | "to">, point: Point): number {
  const dx = trail.to.x - trail.from.x, dy = trail.to.y - trail.from.y, length = dx * dx + dy * dy;
  const along = length ? Math.max(0, Math.min(1, ((point.x - trail.from.x) * dx + (point.y - trail.from.y) * dy) / length)) : 0;
  return Math.hypot(point.x - trail.from.x - along * dx, point.y - trail.from.y - along * dy);
}

function farthest(trail: Pick<ChaosTrail, "from" | "to">, plan: TrailPlan, marks: readonly Mark[]): number {
  return Math.max(0, ...marks.flatMap(mark => [[mark.x, mark.y], [mark.x + mark.wide, mark.y], [mark.x, mark.y + mark.high], [mark.x + mark.wide, mark.y + mark.high]]
    .map(([along, offset]) => fromLane(trail, laneSpot(plan, along, offset)))));
}

const LOOKS: readonly Omit<TrailLook, "now">[] = [{ motion: true, flash: true }, { motion: true, flash: false }, { motion: false, flash: true }];

test("every mark of a real N10 and N20 trail stays inside the reach the rules sweep, and the head runs from `from` to `to` over the hit window", () => {
  const sweep = CHAOS_RULES.trail.hitTicks;
  for (const level of [10, 20]) for (const at of [{ x: 225, y: 100 }, { x: 216, y: 121 }]) {
    const trail = armyTrail(level, at), plan = planTrail(trail, 7), life = trail.untilTick - trail.startedTick, reach = trail.width / 2 + 1e-9;
    expect(plan.half * 2).toBe(trail.width);
    expect(plan.length).toBeCloseTo(Math.hypot(trail.to.x - trail.from.x, trail.to.y - trail.from.y), 9);
    for (let step = 0; step <= life * 4; step++) {
      const moment = trailMoment(trail, trail.startedTick + step / 4);
      for (const look of LOOKS) expect(farthest(trail, plan, record(sink => paintTrail(plan, moment, { ...look, now: step * 37 }, sink)))).toBeLessThanOrEqual(reach);
      if (moment.head < 1) for (const streak of plan.streaks)
        expect(streakSpan(plan, streak, moment)?.front ?? 0).toBeLessThanOrEqual(moment.head * plan.length + 1e-9);
    }
    expect(farthest(trail, plan, record(sink => paintQueued(plan, { motion: true, flash: true, now: 300 }, sink)))).toBeLessThanOrEqual(reach);
    expect(trailMoment(trail, trail.startedTick).head).toBe(0);
    expect(trailMoment(trail, trail.startedTick + sweep / 2).head).toBeCloseTo(.5, 9);
    expect(trailMoment(trail, trail.startedTick + sweep)).toMatchObject({ head: 1, fade: 1 });
    expect(trailMoment(trail, trail.untilTick).fade).toBe(0);
  }
  // Between the scene's whole ticks the drawn clock moves on by display time, never more than one tick ahead of the rules.
  const tickMs = 1000 / CHAOS_RULES.simulationHz, state = { tick: 40, remainder: 0 };
  expect(armyTick(state)).toBe(40);
  expect(armyTick(state, tickMs / 2)).toBeCloseTo(40.5, 9);
  expect(armyTick(state, tickMs * 5)).toBe(41);
});

test("the scatter repeats for a seed and never draws from Math.random", () => {
  const trail = armyTrail(20, { x: 216, y: 121 }), global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    expect(planTrail(trail, 7)).toEqual(planTrail(trail, 7));
    expect(planTrail(trail, 8)).not.toEqual(planTrail(trail, 7));
    const moment = trailMoment(trail, trail.startedTick + 5.5), look = { motion: true, flash: true, now: 480 };
    expect(record(sink => paintTrail(planTrail(trail, 7), moment, look, sink))).toEqual(record(sink => paintTrail(planTrail(trail, 7), moment, look, sink)));
  } finally { Math.random = global; }
});

test("with motion off only the still real reach stands and fades by untilTick; flash off paints no white; nothing red touches the ground", () => {
  const trail = armyTrail(10, { x: 216, y: 121 }), plan = planTrail(trail, 7), sweep = CHAOS_RULES.trail.hitTicks, life = trail.untilTick - trail.startedTick;
  const still = (since: number, now: number) => record(sink => paintTrail(plan, trailMoment(trail, trail.startedTick + since), { motion: false, flash: true, now }, sink));
  const first = still(0, 0);
  // The whole real reach shows from the first tick and nothing travels through the sweep, whatever the display clock says.
  for (const since of [.5, 3, sweep]) expect(still(since, since * 977)).toEqual(first);
  expect(first.every(mark => mark.layer === "ground" && mark.paint === PALETTE.gold)).toBe(true);
  expect(first[0]).toMatchObject({ x: 0, y: -plan.half, high: plan.half * 2 });
  expect(first[0].wide).toBeCloseTo(plan.length, 9);
  expect(Math.max(...still(life - 1, 0).map(mark => mark.alpha))).toBeLessThan(Math.max(...first.map(mark => mark.alpha)));
  expect(still(life, 0)).toEqual([]);
  const queued = (now: number) => record(sink => paintQueued(plan, { motion: false, flash: true, now }, sink));
  expect(queued(0)).toEqual(queued(1234));
  const forbidden = new Set<Paint>([PALETTE.danger, PALETTE.red, PALETTE.scarlet]);
  for (let step = 0; step <= life * 2; step++) for (const flash of [true, false]) {
    const marks = record(sink => paintTrail(plan, trailMoment(trail, trail.startedTick + step / 2), { motion: true, flash, now: step * 41 }, sink));
    expect(marks.some(mark => forbidden.has(mark.paint))).toBe(false);
    if (!flash) expect(marks.some(mark => mark.paint === PALETTE.white)).toBe(false);
  }
});

test("a real clone lane is its event's own segment and radius: every mark stays inside the reach it sweeps, and the ground lights up to where the rules have the clone", () => {
  for (const level of [1, 20]) for (const at of [{ x: 245, y: 100 }, { x: 80, y: 220 }]) {
    const run = charge(level, at), state = run.chaosSkills, rides = [...cloneRides(run)], plans = rides.map(ride => planClone(ride));
    if (!state) throw new Error(`no clones at army level ${level}`);
    for (const [index, ride] of rides.entries()) {
      const plan = plans[index], end = laneSpot(plan, plan.length, 0);
      expect(plan.half).toBe(ride.radius);
      expect(laneSpot(plan, 0, 0)).toEqual(ride.from);
      expect(Math.hypot(end.x - ride.to.x, end.y - ride.to.y)).toBeLessThan(1e-9);
    }
    for (let step = 0; step < 200 && state.events.length; step++) {
      for (const [index, ride] of rides.entries()) {
        const plan = plans[index], moment = cloneMoment(ride, state.tick), head = laneSpot(plan, moment.head * plan.length, 0);
        expect(Math.hypot(head.x - ride.x, head.y - ride.y)).toBeLessThan(1e-9);
        for (const look of LOOKS) expect(farthest(ride, plan, record(sink => paintClone(plan, moment, { ...look, now: step * 37 }, sink)))).toBeLessThanOrEqual(ride.radius + 1e-9);
        for (const streak of plan.streaks) expect(streakSpan(plan, streak, moment)?.front ?? 0).toBeLessThanOrEqual(moment.head * plan.length + 1e-9);
      }
      chaosTicks(run, 1);
    }
    expect(state.events).toEqual([]);
  }
});

test("each independent clone lane carries both still edges of its own reach", () => {
  const rules = CHAOS_RULES.skills.clones, still = { motion: false, flash: true, now: 0 };
  let fewer = 0;
  for (const level of [1, 5, 10, 20]) {
    const rides = cloneRides(charge(level, { x: 80, y: 220 }));
    expect(rides).toHaveLength(rules.count[chaosSkillBand(level)]);
    expect(rides.length).toBeGreaterThan(fewer);
    fewer = rides.length;
    rides.forEach(ride => {
      const plan = planClone(ride), [reach, ...edges] = record(sink => paintClone(plan, cloneMoment(ride, ride.startedTick), still, sink));
      expect(reach).toMatchObject({ x: 0, y: -ride.radius, high: ride.radius * 2 });
      expect(reach.wide).toBeCloseTo(plan.length, 9);
      expect(new Set(edges.map(edge => edge.y))).toEqual(new Set([-ride.radius, ride.radius - 2]));
    });
  }
});

test("with motion off a clone lane is the still real reach for the whole ride and fades only while the clone rests; flash off paints no white; nothing red touches the ground", () => {
  const ride = cloneRides(charge(20, { x: 80, y: 220 }))[0], plan = planClone(ride);
  const still = (tick: number, now: number) => record(sink => paintClone(plan, cloneMoment(ride, tick), { motion: false, flash: true, now }, sink));
  const first = still(ride.startedTick, 0);
  // The whole real reach shows from the first tick and nothing travels down it, whatever the display clock says.
  for (let tick = ride.startedTick; tick <= ride.impactTick; tick += .5) expect(still(tick, tick * 977)).toEqual(first);
  // Each edge stands as dashes from start to end, and they do not march.
  const period = TRAIL_SHOW.dash + TRAIL_SHOW.gap;
  expect(first.slice(1).filter(mark => mark.y === -ride.radius).map(mark => mark.x))
    .toEqual(Array.from({ length: Math.ceil(plan.length / period) }, (_, dash) => dash * period));
  expect(first.every(mark => mark.layer === "ground" && mark.paint === PALETTE.gold)).toBe(true);
  expect(Math.max(...still((ride.impactTick + ride.untilTick) / 2, 0).map(mark => mark.alpha))).toBeCloseTo(Math.max(...first.map(mark => mark.alpha)) / 2, 9);
  expect(still(ride.untilTick, 0)).toEqual([]);
  expect(still(ride.startedTick - 1, 0)).toEqual([]);
  const forbidden = new Set<Paint>([PALETTE.danger, PALETTE.red, PALETTE.scarlet]);
  for (let tick = ride.startedTick; tick < ride.untilTick; tick += .5) for (const flash of [true, false]) {
    const marks = record(sink => paintClone(plan, cloneMoment(ride, tick), { motion: true, flash, now: tick * 41 }, sink));
    expect(marks.some(mark => forbidden.has(mark.paint))).toBe(false);
    if (!flash) expect(marks.some(mark => mark.paint === PALETTE.white)).toBe(false);
  }
});

test("a clone lane's dressing repeats for its event and never draws from Math.random, and its drawn clock runs on between whole ticks", () => {
  const ride = cloneRides(charge(20, { x: 80, y: 220 }))[0], global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    expect(planClone(ride)).toEqual(planClone(ride));
    expect(planClone({ ...ride, id: ride.id + 1 })).not.toEqual(planClone(ride));
    const moment = cloneMoment(ride, ride.startedTick + 3.5), look = { motion: true, flash: true, now: 480 };
    expect(record(sink => paintClone(planClone(ride), moment, look, sink))).toEqual(record(sink => paintClone(planClone(ride), moment, look, sink)));
  } finally { Math.random = global; }
  // The scene steps whole ticks: the clock moves on by display time from the frame the tick moved, never more than one tick ahead.
  const tickMs = 1000 / CHAOS_RULES.simulationHz, clock = tickClock();
  expect(clock({ tick: 40, remainder: 0 }, 5000)).toBe(40);
  expect(clock({ tick: 40, remainder: 0 }, 5000 + tickMs / 2)).toBeCloseTo(40.5, 9);
  expect(clock({ tick: 41, remainder: 0 }, 5000 + tickMs)).toBe(41);
  expect(clock({ tick: 41, remainder: 0 }, 5000 + tickMs * 6)).toBe(42);
});
