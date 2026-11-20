import { expect, test } from "bun:test";
import { chaosAfterAttack, chaosState } from "../chaos";
import { CHAOS_RULES, chaosSkillBand } from "../chaos-contract";
import type { ChaosSkillEvent } from "../chaos-contract";
import { chaosArena } from "../chaos-test-fixture";
import { CENTER, SIDES, WIDTH, fortRect, guardPoint } from "../geometry";
import type { Point } from "../geometry";
import { PALETTE } from "../presentation";
import { advance, useSkill } from "../rules";
import type { Run } from "../rules";
import type { ShowChannels } from "../skill-show";
import type { FrameContext, SkillStage } from "../skill-stage";
import { envelope } from "../skill-show";
import { skillVfx } from "../skill-vfx";
import { BELL_SHOW, bellPlace, bellTolls, drawBell, show } from "./heal-wave-show";

const MOTION = { motion: true, flash: true }, CALM = { motion: true, flash: false }, STILL = { motion: false, flash: false };
const TICK = 1 / CHAOS_RULES.simulationHz, CELL = 4, ON_RING = CELL / 2 + 1e-6;

type Fill = { readonly layer: string; readonly paint: number; readonly alpha: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
/** A stand-in stage that records what the show draws and asks of it; the stage's random stream throws. */
function recorder() {
  const fills: Fill[] = [], asked = { motes: [] as number[][], shakes: 0, veils: [] as number[] };
  const layer = (name: string) => {
    let paint = 0, alpha = 1;
    const graphics = {
      fillStyle(next: number, nextAlpha = 1) { paint = next; alpha = nextAlpha; return graphics; },
      fillRect(x: number, y: number, width: number, height: number) { fills.push({ layer: name, paint, alpha, x, y, width, height }); return graphics; },
    };
    return graphics;
  };
  const stage = { ground: layer("ground"), field: layer("field"), trails: layer("trails"),
    mote: (at: Point, ...rest: (number | boolean)[]) => { asked.motes.push([at.x, at.y, ...rest.map(Number)]); },
    shake: () => { asked.shakes++; }, veil: (share: number) => { asked.veils.push(share); },
    random: () => { throw new Error("the show drew from the stage's random stream"); } };
  return { stage: stage as unknown as SkillStage, fills, asked };
}
const frame = (run: Run, channels: ShowChannels): FrameContext => ({ now: 0, cssPixel: 1, run, at: unit => unit, foe: () => undefined, channels });
/** Draws one frame with Math.random poisoned and returns what that frame drew. */
function drawn(view: ReturnType<typeof recorder>, run: Run, channels: ShowChannels): Fill[] {
  const from = view.fills.length, global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try { show.update(view.stage, frame(run, channels)); } finally { Math.random = global; }
  return view.fills.slice(from);
}
const bells = (run: Run): ChaosSkillEvent[] => (run.chaosSkills?.events ?? []).filter(event => event.kind === "bell");
const started = (run: Run): ChaosSkillEvent[] => bells(run).filter(event => event.startedTick <= (run.chaosSkills?.tick ?? 0));
const farFrom = (fill: Fill, at: Point): number => Math.hypot(fill.x + CELL / 2 - at.x, fill.y + CELL / 2 - at.y);
/** ringBand may merge a row's neighbouring cells into one rect; the grid it paints is still those 4px cells. */
const chips = (fills: readonly Fill[]): Fill[] => fills.flatMap(fill =>
  fill.layer !== "ground" || (fill.width === CELL && fill.height === CELL) ? [fill]
    : Array.from({ length: fill.width / CELL * fill.height / CELL }, (_, index) => {
      const across = fill.width / CELL;
      return { ...fill, x: fill.x + index % across * CELL, y: fill.y + Math.floor(index / across) * CELL, width: CELL, height: CELL };
    }));
function cast(level: number) {
  const run = chaosArena("사명대사", level), view = recorder();
  useSkill(run, 0);
  if (!bells(run).length) throw new Error(`the rules scheduled no bell toll at N${level}`);
  show.clear(view.stage);
  return { run, view, scheduled: bells(run).length, last: Math.max(...bells(run).map(event => event.untilTick)) };
}
/** The band's segments are the only fills two chips tall; every other chip of the bell is one. */
const segments = (fills: readonly Fill[]): Fill[] => fills.filter(fill => fill.layer === "field" && fill.height === 2 * BELL_SHOW.scale);

test("toll routing reads its source even when only one manual wave remains or army waves share a cast", () => {
  const { run } = cast(20), [event] = bells(run);
  for (const trigger of ["manual", "army"] as const) {
    const events = trigger === "manual" ? [{ ...event, trigger }] : [
      { ...event, trigger }, { ...event, trigger, id: event.id + 1, wave: 1 },
    ];
    expect(bellTolls({ chaosSkills: { tick: event.startedTick, remainder: 0, events } }).map(toll => toll.passive))
      .toEqual(trigger === "manual" ? [false] : [true, true]);
  }
});

test.each([0, 1, 10, 20])("N%i: each toll's bright lip lies on the radius the rules hold for it, and a scheduled toll is not drawn before it starts", level => {
  const { run, view, scheduled, last } = cast(level), seen = new Set<number>();
  for (let tick = 0; tick < last; tick++) {
    advance(run, TICK);
    const lips = chips(drawn(view, run, MOTION).filter(fill => fill.layer === "ground" && fill.paint === PALETTE.white)), live = started(run);
    for (const lip of lips) expect(live.some(event => Math.abs(farFrom(lip, event.to) - event.currentRadius) <= ON_RING)).toBe(true);
    for (const event of live.filter(event => !event.resolved && event.currentRadius > CELL && event.currentRadius < WIDTH / 2)) {
      expect(lips.some(lip => Math.abs(farFrom(lip, event.to) - event.currentRadius) <= ON_RING)).toBe(true);
      seen.add(event.id);
    }
  }
  expect(seen.size).toBe(scheduled);
});

test("a higher army level rings more tolls, and each one strikes once and lights its own segment of the bell's band", () => {
  const rung = [0, 1, 5, 10, 20].map(level => {
    const { run, view, scheduled, last } = cast(level);
    let lit = 0;
    for (let tick = 0; tick < last - 1; tick++) {
      advance(run, TICK);
      const band = segments(drawn(view, run, MOTION));
      expect(band).toHaveLength(scheduled);
      const live = started(run), ms = 1000 / CHAOS_RULES.simulationHz;
      const litAlpha = Math.max(...live.map(event => envelope(((run.chaosSkills?.tick ?? 0) - event.startedTick) * ms,
        BELL_SHOW.rise, (event.untilTick - event.startedTick) * ms - BELL_SHOW.rise - BELL_SHOW.fall, BELL_SHOW.fall)));
      for (const segment of band) {
        expect(segment.height).toBe(2 * BELL_SHOW.scale);
        expect(segment.alpha).toBeCloseTo(litAlpha * skillVfx(run, run.squads[0]).alpha, 9);
      }
      lit = band.filter(fill => fill.paint !== PALETTE.ochre).length;
      expect(lit).toBe(1 + Math.max(...started(run).map(event => event.wave)));
    }
    expect(lit).toBe(scheduled);
    expect(view.asked.shakes).toBe(scheduled);
    return scheduled;
  });
  expect(rung).toEqual([...rung].sort((a, b) => a - b));
  expect(rung[rung.length - 1]).toBeGreaterThan(rung[0]);
});

test("Lv1, Lv10 and Lv20 bells keep their native body geometry while growth changes opacity", () => {
  const pictures = [1, 10, 20].map(level => {
    const { run, view, scheduled } = cast(level), squad = run.squads[0];
    squad.awakened = level === 20 ? 2 : 0;
    squad.tier = squad.awakened + 1;
    advance(run, TICK);
    const field = drawn(view, run, STILL).filter(fill => fill.layer === "field"), band = segments(field);
    expect(band).toHaveLength(scheduled);
    expect(field.every(fill => fill.alpha === skillVfx(run, squad).alpha)).toBe(true);
    expect(field.every(fill => fill.height >= 1 && Number.isInteger(fill.width) && Number.isInteger(fill.height))).toBe(true);
    return field.filter(fill => fill.height === BELL_SHOW.scale).map(({ alpha: _alpha, ...rect }) => rect);
  });
  expect(pictures[0].length).toBeGreaterThan(0);
  expect(pictures[1]).toEqual(pictures[0]);
  expect(pictures[2]).toEqual(pictures[0]);
});

test("with motion off the picture stands still: the band's rings for each toll the cast rings, at even shares of the real radius", () => {
  for (const level of [0, 20]) {
    const { run, view, scheduled, last } = cast(level), [toll] = bells(run), frames: Fill[][] = [];
    // Half ticks, so the share of a tick already run is not zero on every other frame.
    for (let step = 0; step < 2 * CHAOS_RULES.skills.bell.interval - 2; step++) { advance(run, TICK / 2); frames.push(drawn(view, run, STILL)); }
    for (const picture of frames) expect(picture).toEqual(frames[0]);
    const ground = frames[0].filter(fill => fill.layer === "ground"), rings = ground.filter(fill => fill.paint === PALETTE.gold);
    const count = Math.round(scheduled * BELL_SHOW.ripples[chaosSkillBand(level)]);
    const radii = Array.from({ length: count }, (_, index) => toll.radius * (index + 1) / (count + 1));
    for (const cell of rings) expect(radii.some(radius => Math.abs(farFrom(cell, toll.to) - radius) <= ON_RING)).toBe(true);
    for (const radius of radii.filter(radius => radius < WIDTH / 2)) expect(rings.some(cell => Math.abs(farFrom(cell, toll.to) - radius) <= ON_RING)).toBe(true);
    // Through the rest of the cast the ground never changes: only the band's lit segments step on as tolls ring.
    while ((run.chaosSkills?.tick ?? last) < last - 1) {
      advance(run, TICK);
      expect(drawn(view, run, STILL).filter(fill => fill.layer === "ground")).toEqual(ground);
    }
    expect(view.asked.motes).toHaveLength(0);
    expect(view.asked.shakes).toBe(0);
    expect(new Set(view.asked.veils).size).toBe(1);
  }
  const { run, view } = cast(20);
  advance(run, TICK / 2);
  const before = drawn(view, run, MOTION);
  advance(run, TICK / 2);
  expect(drawn(view, run, MOTION)).not.toEqual(before);
});

test("the picture repeats for the same battle, never draws from Math.random and never writes the run", () => {
  const replay = () => {
    const { run, view, scheduled } = cast(20);
    for (let step = 0; step < 2 * CHAOS_RULES.skills.bell.interval * scheduled; step++) {
      advance(run, TICK / 2);
      const before = JSON.stringify(run);
      drawn(view, run, MOTION);
      expect(JSON.stringify(run)).toBe(before);
    }
    expect(new Set(view.asked.motes.map(mote => mote.join())).size).toBe(view.asked.motes.length);
    return { fills: view.fills, asked: view.asked, tolls: scheduled };
  };
  const first = replay();
  expect(first.asked.motes.length % first.tolls).toBe(0);
  expect(first.asked.motes.length).not.toBe(0);
  expect(replay()).toEqual(first);
});

test("no mode paints a danger colour, flashes off paint no white, and over the bodies only the bell over 사명대사, off the castle, is drawn", () => {
  const danger: number[] = [PALETTE.danger, PALETTE.red, PALETTE.scarlet], reach = 80;
  for (const channels of [MOTION, CALM, STILL]) {
    const { run, view, last } = cast(20), [toll] = bells(run), hung = bellPlace(toll.to, run.fort, BELL_SHOW.scale), wall = fortRect(run.fort);
    expect(Math.hypot(toll.to.x - run.squads[0].x, toll.to.y - run.squads[0].y)).toBe(0);
    for (let tick = 0; tick < last - 1; tick++) {
      advance(run, TICK);
      for (const fill of drawn(view, run, channels)) {
        expect(danger).not.toContain(fill.paint);
        if (!channels.flash) expect(fill.paint).not.toBe(PALETTE.white);
        if (fill.layer === "ground") { if (!channels.flash) expect(fill.paint).not.toBe(PALETTE.cream); continue; }
        expect(fill.layer).toBe("field");
        expect(Math.abs(fill.x + fill.width / 2 - hung.x)).toBeLessThanOrEqual(reach);
        expect(Math.abs(fill.y + fill.height / 2 - hung.y)).toBeLessThanOrEqual(reach);
        expect(fill.x + fill.width <= wall.left || fill.x >= wall.right || fill.y + fill.height <= wall.top || fill.y >= wall.bottom).toBe(true);
      }
    }
  }
});

test("the army's own tolls are left to the ambient show: without a cast nothing is drawn or asked of the stage", () => {
  const run = chaosArena("사명대사", 20), view = recorder();
  chaosState(run);
  for (let attack = 0; attack < CHAOS_RULES.skills.bell.passiveEvery[chaosSkillBand(20)]; attack++)
    chaosAfterAttack(run, { unit: run.squads[0], target: CENTER, amount: 1 }, []);
  expect(bells(run)).toHaveLength(1);
  show.clear(view.stage);
  for (let tick = 0; tick < CHAOS_RULES.skills.bell.expand; tick++) { advance(run, TICK); expect(drawn(view, run, MOTION)).toHaveLength(0); }
  expect(view.asked).toEqual({ motes: [], shakes: 0, veils: [] });
});

test("the bell stands symmetric about the place it rings, under a narrow crown and widest through its body", () => {
  const view = recorder(), at = { x: 200, y: 300 }, rows = new Map<number, { left: number; right: number }>();
  drawBell(view.stage.field, at, { scale: 2, alpha: 1, sway: 0 });
  for (const fill of view.fills) {
    const row = rows.get(fill.y);
    rows.set(fill.y, { left: Math.min(row?.left ?? Infinity, fill.x), right: Math.max(row?.right ?? -Infinity, fill.x + fill.width) });
  }
  const spans = [...rows.entries()].sort(([above], [below]) => above - below).map(([, span]) => span), widths = spans.map(span => span.right - span.left);
  for (const span of spans) expect(span.left + span.right).toBe(2 * at.x);
  const widest = Math.max(...widths);
  expect(widths[0]).toBeLessThan(widest / 3);
  expect(widths.indexOf(widest)).toBeGreaterThan(widths.length / 2);
});

test.each([0, 1, 2])("at fort level %i the bell and swinging striker stay beside 사명대사 and off the castle on every post", fort => {
  const wall = fortRect(fort), half = 16, up = 18, down = 18;
  for (const side of SIDES) for (const gap of [12, 18, 24, 36, 60]) for (const shift of [-60, 0, 60]) {
    const at = guardPoint(fort, side, gap, shift), hung = bellPlace(at, fort, 1);
    expect(hung.x + half <= wall.left || hung.x - half >= wall.right || hung.y + down <= wall.top || hung.y - up >= wall.bottom).toBe(true);
    expect(Math.hypot(hung.x - at.x, hung.y - (at.y - 16))).toBeLessThanOrEqual(BELL_SHOW.head + BELL_SHOW.gap + 2 * up);
    const manual = bellPlace(at, fort, 1, true);
    expect(Math.hypot(manual.x - at.x, manual.y - (at.y - 16))).toBeLessThanOrEqual(BELL_SHOW.head + BELL_SHOW.gap + 2 * up);
    for (const sway of [-BELL_SHOW.sway, 0, BELL_SHOW.sway]) for (const rest of [0, BELL_SHOW.rest]) {
      const view = recorder();
      drawBell(view.stage.field, manual, { scale: 1, alpha: 1, sway, gap: rest });
      expect(view.fills.length).toBeGreaterThan(0);
      for (const fill of view.fills) {
        expect(fill.x + fill.width <= wall.left || fill.x >= wall.right || fill.y + fill.height <= wall.top || fill.y >= wall.bottom).toBe(true);
        expect(fill.x).toBeGreaterThanOrEqual(0);
        expect(fill.x + fill.width).toBeLessThanOrEqual(WIDTH);
      }
    }
  }
  const { run, view } = cast(1);
  run.fort = fort;
  Object.assign(run.squads[0], guardPoint(fort, "좌", 18, 0));
  const picture = drawn(view, run, STILL).filter(fill => fill.layer === "field");
  expect(picture.length).toBeGreaterThan(0);
  for (const fill of picture)
    expect(fill.x + fill.width <= wall.left || fill.x >= wall.right || fill.y + fill.height <= wall.top || fill.y >= wall.bottom).toBe(true);
});

test("the full moving pole box clears the wall at every candidate guard position", () => {
  for (const fort of [0, 1, 2]) for (const side of SIDES)
    for (const gap of [12, 18, 24, 36, 60]) for (const shift of [-60, 0, 60]) {
      const wall = fortRect(fort), at = guardPoint(fort, side, gap, shift);
      const hung = bellPlace(at, fort, BELL_SHOW.scale, true);
      const view = recorder();
      // The pole's 14x9 source box begins 15 chips right and 2 chips below the anchor.
      // Record its whole outward and vertical travel, including intermediate rounded positions.
      for (let step = 0; step <= 40; step++) {
        const rest = BELL_SHOW.rest * step / 40;
        const x = Math.round(hung.x) + 15 * BELL_SHOW.scale + Math.round(rest);
        const y = Math.round(hung.y) + 2 * BELL_SHOW.scale - Math.round(rest / 4);
        expect(x + 14 * BELL_SHOW.scale <= wall.left || x >= wall.right
          || y + 9 * BELL_SHOW.scale <= wall.top || y >= wall.bottom).toBe(true);
        drawBell(view.stage.field, hung, { scale: BELL_SHOW.scale, alpha: 1,
          sway: -BELL_SHOW.sway + 2 * BELL_SHOW.sway * step / 40, gap: rest });
      }
      const bounds = { left: Math.min(...view.fills.map(fill => fill.x)),
        right: Math.max(...view.fills.map(fill => fill.x + fill.width)),
        top: Math.min(...view.fills.map(fill => fill.y)),
        bottom: Math.max(...view.fills.map(fill => fill.y + fill.height)) };
      expect(bounds.right <= wall.left || bounds.left >= wall.right
        || bounds.bottom <= wall.top || bounds.top >= wall.bottom).toBe(true);
    }
});
