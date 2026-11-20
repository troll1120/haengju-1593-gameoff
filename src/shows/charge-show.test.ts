import { expect, test } from "bun:test";
import { CHAOS_RULES, chaosSkillBand } from "../chaos-contract";
import { cloneRides } from "../chaos-shows/charge-trails";
import { chaosArena, chaosEnemy, chaosTicks } from "../chaos-test-fixture";
import { PALETTE } from "../presentation";
import { useSkill } from "../rules";
import type { Run } from "../rules";
import type { SkillStage } from "../skill-stage";
import { skillVfx } from "../skill-vfx";
import { CHARGE_SHOW, cloneBodies, echoSpots, gildPixels, laneSpot, planCharge, show, streakSpan } from "./charge-show";
import type { ChargeLane } from "./charge-show";

const cast = { seed: 7, fromX: 120, fromY: 400, toX: 300, toY: 280, halfWidth: 28, tier: 1, density: 1, still: false };
function fromSpine(point: { readonly x: number; readonly y: number }, lane: ChargeLane): number {
  const dx = lane.toX - lane.fromX, dy = lane.toY - lane.fromY, length = dx * dx + dy * dy;
  const along = length ? Math.max(0, Math.min(1, ((point.x - lane.fromX) * dx + (point.y - lane.fromY) * dy) / length)) : 0;
  return Math.hypot(point.x - lane.fromX - along * dx, point.y - lane.fromY - along * dy);
}
/** A real manual charge at army level N: the rules ride 신립 at a boss and, from N1, his clones beside him. */
function charge(level: number, at: { readonly x: number; readonly y: number }): Run {
  const run = chaosArena("신립", level), aim = chaosEnemy(run, at.x, at.y);
  aim.boss = true;
  useSkill(run, 0);
  return run;
}

test("every hoof mark, ember and streak stays inside the real lane, and a streak only trails behind the general", () => {
  for (const tier of [1, 2, 3]) for (const seed of [1, 7, 1593]) for (const [toX, toY] of [[300, 280], [120, 170], [20, 520], [121, 401]]) {
    const lane = { ...cast, seed, tier, toX, toY, halfWidth: 28 * (1 + .12 * (tier - 1)) }, plan = planCharge(lane);
    expect(plan.hoofs).toHaveLength(Math.floor(plan.length / CHARGE_SHOW.hoofGap));
    expect(plan.streaks).toHaveLength(CHARGE_SHOW.streaks + CHARGE_SHOW.streaksPerTier * (tier - 1));
    expect(plan.embers).toHaveLength(CHARGE_SHOW.embers + CHARGE_SHOW.embersPerTier * (tier - 1));
    for (const spot of [...plan.hoofs, ...plan.embers]) expect(fromSpine(spot, lane)).toBeLessThanOrEqual(lane.halfWidth);
    for (const streak of plan.streaks) for (const heading of [1, -1] as const) for (let along = 0; along <= plan.length; along += 7) {
      const span = streakSpan(plan, streak, along, heading);
      if (!span) continue;
      expect((along - span.from) * heading).toBeGreaterThan(0);
      expect((span.from - span.to) * heading).toBeGreaterThanOrEqual(0);
      for (const end of [span.from, span.to]) expect(fromSpine(laneSpot(plan, end, streak.offset), lane)).toBeLessThanOrEqual(lane.halfWidth);
    }
  }
});

test("the scatter repeats for a seed and never draws from Math.random", () => {
  const global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    expect(planCharge(cast)).toEqual(planCharge(cast));
    expect(planCharge({ ...cast, seed: 8 })).not.toEqual(planCharge(cast));
  } finally { Math.random = global; }
});

test("with motion off nothing but the lane is planned, and a slow device gets fewer decorations", () => {
  const moving = planCharge(cast), still = planCharge({ ...cast, still: true }), slow = planCharge({ ...cast, density: .5 });
  expect([still.hoofs, still.streaks, still.embers]).toEqual([[], [], []]);
  expect([still.length, still.ux, still.uy]).toEqual([moving.length, moving.ux, moving.uy]);
  expect(slow.hoofs).toHaveLength(Math.floor(moving.length / CHARGE_SHOW.hoofGap * .5));
  expect(slow.streaks).toHaveLength(Math.round(CHARGE_SHOW.streaks * .5));
  expect(slow.embers).toHaveLength(Math.round(CHARGE_SHOW.embers * .5));
});

test("afterimages keep their spacing along the path he was drawn on, round the turn too", () => {
  // Drawn 7px a frame out to x=170, then three frames back down the same line: he stands at x=149, 21px past the turn.
  const path = [...Array.from({ length: 11 }, (_, frame) => ({ x: 100 + frame * 7, y: 300 })), { x: 163, y: 300 }, { x: 156, y: 300 }, { x: 149, y: 300 }];
  const spots = echoSpots(path, 22, 4);
  // 22px of path behind him is 1px beyond the turn, on the way out: the echoes are 22px of riding apart, not 22px away from him.
  expect(spots).toHaveLength(4);
  [169, 147, 125, 103].forEach((x, order) => {
    expect(spots[order].x).toBeCloseTo(x, 6);
    expect(spots[order].y).toBe(300);
    expect([spots[order].ux, spots[order].uy]).toEqual([1, 0]);
  });
  expect(echoSpots(path, 8, 2).map(spot => spot.ux)).toEqual([-1, -1]);
  expect(echoSpots(path.slice(-2), 22, 4)).toEqual([]);
  expect(echoSpots(path, 22, 9)).toHaveLength(4);
});

test("a clone's body is where the rules have it on every tick of its ride, and its afterimages only trail it down its own lane", () => {
  const { echoes: most, echoLag } = CHARGE_SHOW.clone;
  for (const at of [{ x: 245, y: 100 }, { x: 80, y: 220 }]) {
    const run = charge(20, at), state = run.chaosSkills, rides = [...cloneRides(run)];
    if (!state) throw new Error("no clones at army level 20");
    for (let step = 0; step < 200 && state.events.length; step++) {
      for (const ride of rides) {
        const [body, ...echoes] = cloneBodies(ride, state.tick, true), ridden = state.tick - ride.startedTick;
        expect(Math.hypot(body.x - ride.x, body.y - ride.y)).toBeLessThan(1e-9);
        // None before it has ridden, all of them once it has ridden far enough, and they catch it up while it rests.
        if (!ridden || state.tick >= ride.impactTick + most * echoLag) expect(echoes).toEqual([]);
        else if (ridden >= most * echoLag && state.tick <= ride.impactTick) expect(echoes).toHaveLength(most);
        for (const echo of echoes) {
          expect(fromSpine(echo, { fromX: ride.from.x, fromY: ride.from.y, toX: body.x, toY: body.y, halfWidth: 0 })).toBeLessThan(1e-9);
          expect(Math.hypot(echo.x - ride.from.x, echo.y - ride.from.y)).toBeLessThan(Math.hypot(body.x - ride.from.x, body.y - ride.from.y));
          expect(echo.alpha).toBeLessThan(body.alpha);
        }
      }
      chaosTicks(run, 1);
    }
    // The rules have dropped every clone: nothing of it is drawn any more.
    expect(state.events).toEqual([]);
    for (const ride of rides) expect(cloneBodies(ride, state.tick, true)).toEqual([]);
  }
});

test("every higher army band draws more bodies and each appears at its own rules spawn point", () => {
  const rules = CHAOS_RULES.skills.clones;
  let fewer = 0;
  for (const level of [1, 5, 10, 15, 20]) {
    const run = charge(level, { x: 80, y: 220 }), rides = cloneRides(run);
    const rank = rides.map(ride => cloneBodies(ride, run.chaosSkills?.tick ?? 0, true)[0]);
    expect(rank).toHaveLength(rules.count[chaosSkillBand(level)]);
    expect(rank.length).toBeGreaterThan(fewer);
    fewer = rank.length;
    expect(rank.map(({ x, y }) => ({ x, y }))).toEqual(rides.map(ride => ride.from));
  }
});

test("with motion off a clone is one still body in the middle of its real lane: it never travels and only fades once the ride is over", () => {
  const ride = cloneRides(charge(10, { x: 80, y: 220 }))[0], rest = (ride.impactTick + ride.untilTick) / 2, global = Math.random;
  const middle = { x: (ride.from.x + ride.to.x) / 2, y: (ride.from.y + ride.to.y) / 2 };
  Math.random = () => { throw new Error("a clone drew from Math.random"); };
  try {
    const first = cloneBodies(ride, ride.startedTick, false);
    expect(first).toEqual([{ ...middle, order: 0, alpha: CHARGE_SHOW.clone.alpha, ridden: 0 }]);
    for (let tick = ride.startedTick; tick <= ride.impactTick; tick += .25) expect(cloneBodies(ride, tick, false)).toEqual(first);
    expect(cloneBodies(ride, rest, false)).toEqual([{ ...first[0], alpha: CHARGE_SHOW.clone.alpha / 2 }]);
    expect(cloneBodies(ride, ride.untilTick, false)).toEqual([]);
    expect(cloneBodies(ride, ride.startedTick - 1, false)).toEqual([]);
    // The moving picture of the same tick is somewhere else: the still one is not that picture slowed down.
    const moving = cloneBodies(ride, ride.startedTick + 1, true);
    expect(moving[0]).not.toMatchObject(middle);
    expect(cloneBodies(ride, ride.startedTick + 1, true)).toEqual(moving);
  } finally { Math.random = global; }
});

test("Lv1, Lv10 and Lv20 clones render at the same whole native scale with growth opacity", () => {
  const scales = [1, 10, 20].map(level => {
    const run = charge(level, { x: 80, y: 220 }), squad = run.squads[0];
    squad.awakened = level === 20 ? 2 : 0;
    squad.tier = squad.awakened + 1;
    const images: { scale: number; alpha: number; visible: boolean }[] = [];
    const stage = {
      scene: { textures: { exists: () => true } },
      image: () => {
        const image = {
          scale: 0, alpha: 0, visible: false,
          setTexture() { return image; }, setFlipX() { return image; },
          setScale(scale: number) { image.scale = scale; return image; },
          setPosition() { return image; }, setAlpha(alpha: number) { image.alpha = alpha; return image; },
          setDepth() { return image; }, setVisible(visible: boolean) { image.visible = visible; return image; },
        };
        images.push(image);
        return image;
      },
      free() {},
    } as unknown as SkillStage;
    try {
      show.update(stage, { now: 0, cssPixel: 1, run, at: unit => unit, foe: () => undefined, channels: { motion: false, flash: false } });
      expect(images).toHaveLength(cloneRides(run).length);
      for (const image of images) {
        expect(image.visible).toBe(true);
        expect(image.scale).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(image.scale)).toBe(true);
        expect(image.alpha).toBeCloseTo(CHARGE_SHOW.clone.alpha * skillVfx(run, squad).alpha, 9);
      }
      return images[0].scale;
    } finally { show.clear(stage); }
  });
  expect(scales).toEqual([scales[0], scales[0], scales[0]]);
});

test("a clone wears his picture in gold: his dark lines keep the outline colour, his red turns gold, and every pixel keeps its alpha", () => {
  const pixels = new Uint8ClampedArray([
    0x26, 0x2b, 0x44, 255,   // one of his dark lines
    0xb4, 0x20, 0x2a, 255,   // his red armour
    0xe8, 0x45, 0x37, 128,   // a brighter red, half clear
    0xff, 0xff, 0xff, 255,   // a white glint
    0xb4, 0x20, 0x2a, 0,     // a clear pixel, whatever colour lies in it
  ]);
  gildPixels(pixels);
  const paint = (pixel: number) => pixels[pixel * 4] << 16 | pixels[pixel * 4 + 1] << 8 | pixels[pixel * 4 + 2];
  expect([paint(0), paint(1), paint(2), paint(3)]).toEqual([PALETTE.outline, PALETTE.brass, PALETTE.gold, PALETTE.cream]);
  expect(paint(4)).toBe(0xb4202a);
  expect([0, 1, 2, 3, 4].map(pixel => pixels[pixel * 4 + 3])).toEqual([255, 255, 128, 255, 0]);
  // Whatever colour his picture holds comes out as one of those four tones, so no red is left to be read as a danger mark.
  const steps = [0, 51, 102, 153, 204, 255], sweep = new Uint8ClampedArray(steps.flatMap(r => steps.flatMap(g => steps.flatMap(b => [r, g, b, 255]))));
  gildPixels(sweep);
  const tones = new Set(Array.from({ length: sweep.length / 4 }, (_, pixel) => sweep[pixel * 4] << 16 | sweep[pixel * 4 + 1] << 8 | sweep[pixel * 4 + 2]));
  expect(tones).toEqual(new Set<number>([PALETTE.outline, PALETTE.brass, PALETTE.gold, PALETTE.cream]));
});
