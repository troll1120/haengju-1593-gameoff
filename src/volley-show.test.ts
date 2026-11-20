import { expect, test } from "bun:test";
import { CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import type { ChaosSkillEvent } from "./chaos-contract";
import { armyTick } from "./chaos-shows/charge-trails";
import { chaosArena, chaosEnemy, chaosTicks } from "./chaos-test-fixture";
import { fortRect, WIDTH } from "./geometry";
import type { Point } from "./geometry";
import { PALETTE } from "./presentation";
import type { Paint } from "./presentation";
import { riverBank } from "./river";
import { useSkill } from "./rules";
import type { Run } from "./rules";
import type { SkillStage } from "./skill-stage";
import { skillVfx } from "./skill-vfx";
import { liveRain, lobOffset, paintRain, planVolley, rainArrows, rainCount, rainFall, rainVeil, RAIN_SHOW, VOLLEY_SHOW } from "./volley-show";
import type { RainLayer, RainLook } from "./volley-show";
import { volleyShow } from "./volley-show-view";

const plan = { seed: 7, x: 200, y: 300, radius: 80, tier: 1, density: 1, still: false, targets: [{ x: 190, y: 310 }, { x: 230, y: 280 }] };

test("every arrow lands inside the real radius and one lands on each struck foe as its damage shows", () => {
  for (const tier of [1, 2, 3]) for (const seed of [1, 7, 1593]) {
    const cast = { ...plan, seed, tier, radius: 80 + (tier - 1) * 9.6 }, arrows = planVolley(cast);
    expect(arrows).toHaveLength(VOLLEY_SHOW.arrows + VOLLEY_SHOW.arrowsPerTier * (tier - 1));
    expect(arrows.filter(arrow => arrow.strike)).toEqual(cast.targets.map(target => ({ ...target, landAt: VOLLEY_SHOW.impact, strike: true })));
    for (const arrow of arrows) {
      expect(Math.hypot(arrow.x - cast.x, arrow.y - cast.y)).toBeLessThanOrEqual(cast.radius);
      expect(arrow.landAt).toBeGreaterThanOrEqual(VOLLEY_SHOW.impact - VOLLEY_SHOW.lead);
      expect(arrow.landAt).toBeLessThanOrEqual(VOLLEY_SHOW.rain);
    }
  }
});

test("the scatter repeats for a seed and never draws from Math.random", () => {
  const global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    expect(planVolley(plan)).toEqual(planVolley(plan));
    expect(planVolley({ ...plan, seed: 8 })).not.toEqual(planVolley(plan));
  } finally { Math.random = global; }
});

test("with motion off every arrow stands at once, and a slow device gets fewer of them", () => {
  expect(planVolley({ ...plan, still: true }).every(arrow => arrow.landAt === 0)).toBe(true);
  expect(planVolley({ ...plan, density: .8 })).toHaveLength(Math.round(VOLLEY_SHOW.arrows * .8));
});

type Mark = { readonly layer: RainLayer; readonly paint: Paint; readonly alpha: number; readonly x: number; readonly y: number; readonly wide: number; readonly high: number };
const MOVING: RainLook = { motion: true, flash: true, density: 1 }, STILL: RainLook = { ...MOVING, motion: false };

/** A real cast: 권율 at army level N uses his skill on one foe, and from level 1 the rules plan the rain that follows the volley. */
function castRain(level: number): Run {
  const run = chaosArena("권율", level);
  chaosEnemy(run, 195, 100);
  useSkill(run, 0);
  return run;
}
const rainOf = (run: Run): readonly ChaosSkillEvent[] => run.chaosSkills?.events ?? [];
const tickOf = (run: Run): number => run.chaosSkills?.tick ?? 0;
function* volleyTicks(run: Run, last: number) {
  const start = tickOf(run);
  if (!Number.isSafeInteger(last) || last < start) throw new Error(`Invalid volley end ${last} from ${start}`);
  for (let step = start; step < last && tickOf(run) < last; step++) {
    const before = tickOf(run);
    yield;
    chaosTicks(run, 1);
    if (tickOf(run) <= before) throw new Error(`Volley stalled at tick ${before}/${last}, phase=${run.phase}, time=${run.time}`);
  }
}
const lastOf = (events: readonly ChaosSkillEvent[], tick: "impactTick" | "untilTick"): number => Math.max(...events.map(event => event[tick]));
function marks(run: Run, clock: number, look: RainLook, events = rainOf(run)): Mark[] {
  const seen: Mark[] = [];
  paintRain({ events, clock, look, ground: { width: WIDTH, bank: riverBank(), keep: fortRect(run.fort) } },
    (layer, paint, alpha, x, y, wide, high) => seen.push({ layer, paint, alpha, x, y, wide, high }));
  return seen;
}

test("each stream is drawn by the rules' own numbers: their lob, their radius and their ticks, from startedTick to untilTick", () => {
  for (const level of [1, 10, 20]) {
    const run = castRain(level), planned = [...rainOf(run)], last = lastOf(planned, "untilTick");
    // Planned waves wait for their startedTick: on the cast tick only the first wave is drawn.
    expect(liveRain(planned, tickOf(run))).toEqual(planned.filter(event => event.wave === 0));
    for (const _ of volleyTicks(run, last)) {
      for (const event of liveRain(rainOf(run), tickOf(run))) {
        const at = lobOffset(event, Math.min(1, (tickOf(run) - event.startedTick) / (event.impactTick - event.startedTick)));
        expect(event.to.x + at.x).toBeCloseTo(event.x, 9);
        expect(event.to.y + at.y).toBeCloseTo(event.y, 9);
      }
    }
    expect(marks(run, tickOf(run), MOVING, planned)).toEqual([]);
    for (const event of planned) {
      const arrows = rainArrows(event, event.id, rainCount(event, 1));
      for (const arrow of arrows) {
        expect(Math.hypot(arrow.x - event.to.x, arrow.y - event.to.y)).toBeLessThanOrEqual(event.radius);
        expect(arrow.landTick).toBeGreaterThan(event.startedTick);
        expect(arrow.landTick).toBeLessThan(event.untilTick);
      }
      expect(arrows[0].landTick).toBe(event.impactTick);
    }
  }
});

test("a stream with another radius, lob or timing is drawn by those, not by remembered constants", () => {
  const event = rainOf(castRain(20))[0];
  const odd: ChaosSkillEvent = { ...event, radius: event.radius / 2, arcHeight: event.arcHeight * 2, from: { x: event.to.x - 40, y: event.to.y - 30 },
    impactTick: event.impactTick + 6, untilTick: event.untilTick + 20 };
  const arrows = rainArrows(odd, 7, 12);
  expect(Math.max(...arrows.map(arrow => Math.hypot(arrow.x - odd.to.x, arrow.y - odd.to.y)))).toBeLessThanOrEqual(odd.radius);
  expect(arrows[0].landTick).toBe(odd.impactTick);
  expect(Math.max(...arrows.map(arrow => arrow.landTick))).toBeGreaterThan(odd.impactTick);
  // Half-way through the flight the rules' point is half-way from `from` to `to`, lifted by the whole arcHeight.
  expect(lobOffset(odd, .5).x).toBeCloseTo(-20, 9);
  expect(lobOffset(odd, .5).y).toBeCloseTo(-15 - odd.arcHeight, 9);
  // An arrow comes down from the top of that lob onto its place; the way up is never drawn.
  const heights = Array.from({ length: 21 }, (_, step) => rainFall(odd, step / 20).y);
  expect(heights).toEqual([...heights].sort((a, b) => a - b));
  expect(heights[0]).toBeCloseTo(Math.min(...Array.from({ length: 201 }, (_, step) => lobOffset(odd, step / 200).y)), 1);
  expect(Math.hypot(rainFall(odd, 1).x, rainFall(odd, 1).y)).toBe(0);
  // Half the radius is about a quarter of the ground, so about a quarter of the arrows.
  expect(rainCount(odd, 1)).toBeLessThan(rainCount(event, 1) / 3);
});

test("the streams of a wave rain on their own cells at the same time, and the rain never pauses before the last wave ends", () => {
  for (const level of [1, 20]) {
    const run = castRain(level), planned = [...rainOf(run)], cast = tickOf(run);
    const impact = lastOf(planned, "impactTick"), last = lastOf(planned, "untilTick"), flown = new Map<number, readonly [first: number, end: number]>();
    for (const _ of volleyTicks(run, last)) {
      for (const part of [.25, .75]) {
        const clock = tickOf(run) + part, seen = marks(run, clock, MOVING);
        // Lv1's small radius and density leave one arrow per stream, landing at impact.
        const firstFlight = level === 1 ? CHAOS_RULES.skills.arrows.flight * (1 - RAIN_SHOW.fall) : 1;
        if (clock > cast + firstFlight && clock <= impact) expect(seen.some(mark => mark.layer === "trails")).toBe(true);
        if (clock > cast + CHAOS_RULES.skills.arrows.flight) expect(seen.some(mark => mark.layer === "ground")).toBe(true);
        for (const event of liveRain(rainOf(run), clock)) {
          const air = marks(run, clock, MOVING, [event]).filter(mark => mark.layer === "trails");
          if (!air.length) continue;
          expect(Math.max(...air.map(mark => Math.abs(mark.x - event.to.x)))).toBeLessThanOrEqual(event.radius);
          flown.set(event.id, [flown.get(event.id)?.[0] ?? clock, clock]);
        }
      }
    }
    // Every stream of a wave flew, and their rains overlap: the last one to begin is in the air before the first one ends.
    for (let wave = 0; wave <= Math.max(...planned.map(event => event.wave)); wave++) {
      const spans = planned.filter(event => event.wave === wave).map(event => flown.get(event.id) ?? [Infinity, -Infinity]);
      expect(spans).toHaveLength(CHAOS_RULES.skills.columns * CHAOS_RULES.skills.rows);
      expect(Math.max(...spans.map(([first]) => first))).toBeLessThan(Math.min(...spans.map(([, end]) => end)));
    }
    // The last arrows stand, fading, right up to the rules' last untilTick, with nothing left in the air.
    expect(new Set(marks(run, last - .25, MOVING, planned).map(mark => mark.layer))).toEqual(new Set<RainLayer>(["ground"]));
  }
});

test("arrows grow by the shared visual density while damage retuning leaves their count unchanged", () => {
  const rules = CHAOS_RULES.skills.arrows, levels = [1, 5, 10, 15, 20], runs = levels.map(castRain);
  const streams = runs.map(run => rainOf(run)[0]), counts = streams.map(stream => rainCount(stream, 1));
  const top = counts[counts.length - 1], strongest = Math.max(...rules.visualDensity);
  expect(counts.every((count, index) => index === 0 || count > counts[index - 1])).toBe(true);
  levels.forEach((level, index) => {
    const reach = streams[index].radius - VOLLEY_SHOW.insetPixels;
    expect(counts[index]).toBe(Math.max(1, Math.round(Math.PI * reach * reach / rules.arrowArea * rules.visualDensity[chaosSkillBand(level)])));
  });
  // The same growth reaches the screen: the standing arrows of the still picture, shaft by shaft.
  const shafts = runs.map(run => marks(run, tickOf(run), STILL).filter(mark => mark.paint === PALETTE.leatherLight).length);
  expect(shafts.every((count, index) => index === 0 || count > shafts[index - 1])).toBe(true);
  expect(marks(castRain(0), 0, MOVING)).toEqual([]);
  // A slow device thins the rain, but a live stream never draws nothing.
  expect(Math.abs(rainCount(streams[4], .5) - top / 2)).toBeLessThanOrEqual(1);
  expect(rainCount(streams[4], 0)).toBe(1);
  const power = rules.power;
  Object.defineProperty(rules, "power", { value: power.map(value => value / 2) });
  try {
    expect(streams.map(stream => rainCount(stream, 1))).toEqual(counts);
  } finally { Object.defineProperty(rules, "power", { value: power }); }
  const visualDensity = rules.visualDensity;
  Object.defineProperty(rules, "visualDensity", { value: visualDensity.map(() => strongest) });
  try {
    expect(streams.map(stream => rainCount(stream, 1))).toEqual(streams.map(stream =>
      Math.max(1, Math.round(Math.PI * (stream.radius - VOLLEY_SHOW.insetPixels) ** 2 / rules.arrowArea * strongest))));
  } finally { Object.defineProperty(rules, "visualDensity", { value: visualDensity }); }
});

test("with motion off nothing flies or fades: one still picture stands from the first wave's start to the last wave's end", () => {
  for (const level of [1, 20]) {
    const run = castRain(level), planned = [...rainOf(run)], last = lastOf(planned, "untilTick"), first = marks(run, tickOf(run), STILL);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every(mark => mark.layer === "ground" && mark.alpha === 1)).toBe(true);
    // With motion on the same events change from one half tick to the next.
    expect(marks(run, tickOf(run) + 9.5, MOVING)).not.toEqual(marks(run, tickOf(run) + 9, MOVING));
    for (const _ of volleyTicks(run, last)) {
      for (const part of [0, .5]) expect(marks(run, tickOf(run) + part, STILL)).toEqual(first);
      expect(rainVeil(rainOf(run), tickOf(run) + .5, false)).toBe(RAIN_SHOW.dusk);
    }
    expect(marks(run, tickOf(run), STILL, planned)).toEqual([]);
    expect(rainVeil(planned, tickOf(run), false)).toBe(0);
  }
});

test("the rain repeats for the same events, never draws from Math.random, paints no danger colour, and flash off only takes the white out of its streaks", () => {
  const run = castRain(20), global = Math.random, forbidden = new Set<Paint>([PALETTE.danger, PALETTE.red, PALETTE.scarlet]);
  chaosTicks(run, 20);
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    const clock = tickOf(run) + .5, lit = marks(run, clock, MOVING), calm = marks(run, clock, { ...MOVING, flash: false });
    for (const look of [MOVING, STILL]) expect(marks(run, clock, look)).toEqual(marks(run, clock, look));
    expect(rainArrows(rainOf(run)[0], 2, 9)).not.toEqual(rainArrows(rainOf(run)[0], 1, 9));
    expect([...lit, ...calm, ...marks(run, clock, STILL)].some(mark => forbidden.has(mark.paint))).toBe(false);
    const repainted = calm.filter((mark, index) => mark.paint !== lit[index].paint);
    expect(calm.map(mark => ({ ...mark, paint: 0 }))).toEqual(lit.map(mark => ({ ...mark, paint: 0 })));
    expect(repainted.length).toBeGreaterThan(0);
    expect(repainted.some(mark => mark.paint === PALETTE.white)).toBe(false);
    expect(lit.filter((mark, index) => mark.paint !== calm[index].paint).some(mark => mark.paint === PALETTE.white)).toBe(true);
  } finally { Math.random = global; }
});

test("the staged show draws Lv1, Lv10 and Lv20 rain between ticks with growth alpha, the cast's headroom and one-arrow minimum", () => {
  const channels = { motion: true, flash: true }, look: RainLook = { ...channels, density: .5 };
  for (const level of [1, 10, 20]) {
    const run = chaosArena("권율", level), seen: Mark[] = [], veils: number[] = [], stage: SkillStage = Object.create(null);
    run.squads[0].awakened = level === 20 ? 2 : 0;
    run.squads[0].tier = run.squads[0].awakened + 1;
    chaosEnemy(run, 195, 100);
    const skill = useSkill(run, 0).find(effect => effect.kind === "skill"), squad = run.squads[0];
    if (!skill) throw new Error("the volley cast no skill effect");
    const growth = skillVfx(run, squad), rainLook = { ...look, density: look.density * growth.density };
    for (const layer of ["ground", "field", "trails"] as const) {
      let paint: Paint = PALETTE.dark, alpha = 0;
      const graphics = { fillStyle(tone: Paint, share: number) { paint = tone; alpha = share; return graphics; },
        fillRect(x: number, y: number, wide: number, high: number) { seen.push({ layer, paint, alpha, x, y, wide, high }); return graphics; } };
      Object.defineProperty(stage, layer, { value: graphics });
    }
    Object.defineProperty(stage, "now", { value: 0 });
    stage.random = () => .5;
    stage.reach = (x, y, radius) => ({ x, y, radius, cells: [], rim: [] });
    stage.image = () => undefined;
    stage.mark = () => undefined;
    stage.veil = share => { veils.push(share); };
    const frame = (now: number) => ({ now, cssPixel: 1, run, at: (unit: Point) => unit, foe: () => undefined, channels });
    try {
      volleyShow.cast(stage, { skill, results: [], run, squad, from: squad, tier: squad.tier, channels, density: look.density });
      chaosTicks(run, 9);
      // A fresh tick is drawn as it stands; a sixtieth of a second later the clock is half a tick on; a stalled scene stops one tick ahead.
      for (const since of [0, 1000 / 60, 200]) {
        seen.length = 0; veils.length = 0;
        volleyShow.update(stage, frame(since));
        const state = run.chaosSkills;
        if (!state) throw new Error("Missing Lv1 or Lv20 rain");
        const clock = armyTick(state, since);
        expect(clock).toBeCloseTo(state.tick + Math.min(1, since * CHAOS_RULES.simulationHz / 1000), 9);
        const expected = marks(run, clock, rainLook);
        expect(seen).toEqual(expected.map(mark => ({ ...mark, alpha: mark.alpha * growth.alpha })));
        expect(seen.length).toBeGreaterThan(0);
        for (const event of liveRain(state.events, clock)) {
          expect(rainCount(event, rainLook.density)).toBeGreaterThanOrEqual(1);
          expect(rainCount(event, rainLook.density)).toBeLessThanOrEqual(rainCount(event, growth.density));
        }
        expect(seen.every(mark => mark.wide >= 1 && mark.high >= 1 && Number.isInteger(mark.wide) && Number.isInteger(mark.high))).toBe(true);
        if (level === 1) expect(seen.length).toBe(marks(run, clock, MOVING).length);
        else expect(seen.length).toBeLessThan(marks(run, clock, MOVING).length);
        expect(veils).toContain(rainVeil(state.events, clock, true));
      }
    } finally { volleyShow.clear(stage); }
  }
});

test("Lv1, Lv10 and Lv20 volley arrows render at native 1x with growth opacity", () => {
  for (const level of [1, 10, 20]) {
    const run = chaosArena("권율", level), squad = run.squads[0], images: { scale: number; alpha: number; visible: boolean }[] = [];
    squad.awakened = level === 20 ? 2 : 0;
    squad.tier = squad.awakened + 1;
    chaosEnemy(run, 195, 100);
    const skill = useSkill(run, 0).find(effect => effect.kind === "skill");
    if (!skill) throw new Error("the volley cast no skill effect");
    const graphics = { fillStyle() { return graphics; }, fillRect() { return graphics; } };
    const stage = {
      now: 0, ground: graphics, field: graphics, trails: graphics, random: () => .5,
      reach: (x: number, y: number, radius: number) => ({ x, y, radius, cells: [], rim: [] }),
      image: () => {
        const image = {
          scale: 0, alpha: 1, visible: false,
          setScale(scale: number) { image.scale = scale; return image; },
          setPosition() { return image; }, setAlpha(alpha: number) { image.alpha = alpha; return image; },
          setVisible(visible: boolean) { image.visible = visible; return image; },
        };
        images.push(image);
        return image;
      },
      mark() {}, veil() {}, free() {},
    } as unknown as SkillStage;
    const channels = { motion: true, flash: true };
    try {
      volleyShow.cast(stage, { skill, results: [], run, squad, from: squad, tier: squad.tier, channels, density: 1 });
      volleyShow.update(stage, { now: 1, cssPixel: 1, run, at: unit => unit, foe: () => undefined, channels });
      expect(images.length).toBeGreaterThan(0);
      expect(images.every(image => image.scale === 1)).toBe(true);
      const flying = images.filter(image => image.visible);
      expect(flying.length).toBeGreaterThan(0);
      expect(flying.every(image => image.alpha === skillVfx(run, squad).alpha)).toBe(true);
    } finally { volleyShow.clear(stage); }
  }
});
