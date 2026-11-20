import { expect, test } from "bun:test";
import { chaosAfterAttack, chaosState } from "../chaos";
import { CHAOS_RULES, chaosSkillBand } from "../chaos-contract";
import type { ChaosSkillEvent } from "../chaos-contract";
import { chaosArena, chaosEnemy } from "../chaos-test-fixture";
import { CENTER, WIDTH, fortRect } from "../geometry";
import type { Point } from "../geometry";
import { PALETTE } from "../presentation";
import { advance, useSkill } from "../rules";
import type { Enemy, Run } from "../rules";
import type { ShowChannels } from "../skill-show";
import type { FrameContext, SkillStage } from "../skill-stage";
import { ambient, BELL_TOLLS } from "./heal-pools";
import { bellPlace } from "../shows/heal-wave-show";

const MOTION = { motion: true, flash: true }, STILL = { motion: false, flash: false };
const RULES = CHAOS_RULES.skills.bell, TICK = 1 / CHAOS_RULES.simulationHz, CELL = 4, ON_RING = CELL / 2 + 1e-6;
const DANGER: number[] = [PALETTE.danger, PALETTE.red, PALETTE.scarlet];

type Fill = { readonly layer: string; readonly paint: number; readonly alpha: number; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
type Body = NonNullable<ReturnType<FrameContext["foe"]>>;
/** A stand-in stage that records what the show draws; an ambient show may ask nothing else of the stage, so every other call throws. */
function recorder() {
  const fills: Fill[] = [], refuse = (call: string) => () => { throw new Error(`the ambient show asked the stage for ${call}`); };
  const layer = (name: string) => {
    let paint = 0, alpha = 1;
    const graphics = {
      fillStyle(next: number, nextAlpha = 1) { paint = next; alpha = nextAlpha; return graphics; },
      fillRect(x: number, y: number, width: number, height: number) { fills.push({ layer: name, paint, alpha, x, y, width, height }); return graphics; },
    };
    return graphics;
  };
  const stage = { ground: layer("ground"), field: layer("field"), trails: layer("trails"),
    mote: refuse("a mote"), shake: refuse("a shake"), veil: refuse("the dusk"), random: refuse("the cast shows' random stream") };
  return { stage: stage as unknown as SkillStage, fills };
}
/** Draws one frame with Math.random poisoned and returns what that frame drew. */
function drawn(view: ReturnType<typeof recorder>, run: Run, channels: ShowChannels, foe: FrameContext["foe"] = () => undefined): Fill[] {
  const from = view.fills.length, global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try { ambient.update(view.stage, { now: 0, cssPixel: 1, run, at: unit => unit, foe, channels }); } finally { Math.random = global; }
  return view.fills.slice(from);
}
const bells = (run: Run): ChaosSkillEvent[] => (run.chaosSkills?.events ?? []).filter(event => event.kind === "bell");
const farFrom = (fill: Fill, at: Point): number => Math.hypot(fill.x + CELL / 2 - at.x, fill.y + CELL / 2 - at.y);
const leads = (fills: readonly Fill[]): Fill[] => fills.filter(fill => fill.layer === "ground" && fill.paint === PALETTE.brass);
function army(level: number): Run {
  const run = chaosArena("사명대사", level);
  chaosState(run);
  return run;
}
function attack(run: Run, count: number): void {
  for (let index = 0; index < count; index++) chaosAfterAttack(run, { unit: run.squads[0], target: CENTER, amount: 1 }, []);
}
/** Whether the daze is drawn over a spot: chips within their orbit of it. */
const dazedAt = (fills: readonly Fill[], spot: Point): boolean => fills.some(fill => fill.layer === "field"
  && Math.abs(fill.x + fill.width / 2 - spot.x) <= BELL_TOLLS.daze.orbit + 3 && Math.abs(fill.y + fill.height / 2 - spot.y) <= 5);
const overHead = (enemy: Enemy): Point => ({ x: enemy.x, y: enemy.y - BELL_TOLLS.daze.head });

test.each([1, 10, 20])("N%i: an army toll runs out as one thin ring on the radius the rules hold for it, under a small bell over 사명대사, off the castle", level => {
  const run = army(level), view = recorder();
  attack(run, RULES.passiveEvery[chaosSkillBand(level)]);
  const [toll] = bells(run), hung = bellPlace(toll.to, run.fort, BELL_TOLLS.bell.scale), wall = fortRect(run.fort);
  expect(bells(run)).toHaveLength(1);
  let ringed = 0;
  for (let tick = 0; tick < RULES.expand - 1; tick++) {
    advance(run, TICK);
    const picture = drawn(view, run, MOTION), ring = leads(picture);
    for (const cell of ring) expect(Math.abs(farFrom(cell, toll.to) - toll.currentRadius)).toBeLessThanOrEqual(ON_RING);
    if (toll.currentRadius > CELL && toll.currentRadius < WIDTH / 2) { expect(ring.length).not.toBe(0); ringed++; }
    for (const fill of picture) {
      expect(DANGER).not.toContain(fill.paint);
      if (fill.layer === "ground") continue;
      expect(fill.layer).toBe("field");
      expect(Math.hypot(fill.x + fill.width / 2 - hung.x, fill.y + fill.height / 2 - hung.y)).toBeLessThan(24);
      expect(fill.x + fill.width <= wall.left || fill.x >= wall.right || fill.y + fill.height <= wall.top || fill.y >= wall.bottom).toBe(true);
    }
    expect(picture.some(fill => fill.layer === "field")).toBe(true);
  }
  expect(ringed).not.toBe(0);
});

test("the same attacks ring more tolls at a higher level, and however many are alive only a few rings run out at once", () => {
  const most = (level: number, attacksATick: number): number => {
    const run = army(level), view = recorder();
    let rings = 0;
    for (let tick = 0; tick < 3 * RULES.expand; tick++) {
      attack(run, attacksATick);
      advance(run, TICK);
      const before = JSON.stringify(run), ring = leads(drawn(view, run, MOTION));
      expect(JSON.stringify(run)).toBe(before);
      const running = bells(run).filter(event => !event.resolved && ring.some(cell => Math.abs(farFrom(cell, event.to) - event.currentRadius) <= ON_RING));
      rings = Math.max(rings, new Set(running.map(event => event.currentRadius)).size);
    }
    return rings;
  };
  const sparse = most(1, 1), steady = most(10, 1), dense = most(20, 1), flooded = most(20, 3 * RULES.passiveEvery[chaosSkillBand(20)]);
  expect(sparse).toBeLessThan(steady);
  expect(dense).toBeGreaterThanOrEqual(steady);
  expect(dense).toBeLessThanOrEqual(BELL_TOLLS.rings + 1);
  expect(flooded).toBeLessThanOrEqual(BELL_TOLLS.rings + 1);
});

test("with motion off the army's tolls stand as one still ring under an upright bell, the same on every frame", () => {
  const shares = [1, 20].map(level => {
    const run = army(level), view = recorder(), every = RULES.passiveEvery[chaosSkillBand(level)], frames: Fill[][] = [];
    // Half ticks, and a new toll on every whole one, so tolls of every age and a share of a tick already run are both in the picture.
    for (let step = 0; step < 2 * RULES.expand; step++) {
      if (step % 2 === 0) attack(run, every);
      advance(run, TICK / 2);
      frames.push(drawn(view, run, STILL));
    }
    for (const picture of frames) expect(picture).toEqual(frames[0]);
    const [toll] = bells(run), ring = frames[0].filter(fill => fill.layer === "ground"), radius = Math.max(...ring.map(cell => farFrom(cell, toll.to)));
    expect(ring.length).not.toBe(0);
    expect(new Set(ring.map(cell => cell.paint)).size).toBe(1);
    for (const cell of ring) expect(radius - farFrom(cell, toll.to)).toBeLessThan(CELL);
    return radius / toll.radius;
  });
  expect(shares[0]).toBeLessThan(1);
  expect(shares[1]).toBeCloseTo(shares[0], 1);
});

// The bell's own stun is the same at every band; Lv20 is the band whose ring reaches every foe these tests place.
test("a foe a toll has stunned carries the daze over its head while the bell's own stun runs, and no other stun shows it", () => {
  const run = chaosArena("사명대사", 20), view = recorder(), near = chaosEnemy(run, CENTER.x, CENTER.y - 100), chief = chaosEnemy(run, CENTER.x - 110, CENTER.y);
  const far = chaosEnemy(run, CENTER.x + 60, CENTER.y - 170), ship = chaosEnemy(run, CENTER.x - 80, CENTER.y + 150);
  chief.boss = true; ship.kind = "ship";
  useSkill(run, 0);
  // Lv20 rings several waves: each foe's daze runs from the latest toll that struck it, whichever wave that was.
  const [toll] = bells(run), own = RULES.stun * CHAOS_RULES.simulationHz, struckAt = new Map<number, number>(), held = new Map<number, Set<boolean>>();
  const counted = new Set<string>();
  for (let tick = 1; tick < toll.untilTick; tick++) {
    // Stuns from another source: on the far foe from before the ring reaches it until long after the bell's own has run out, and on
    // a ship, which the rules' bell never strikes.
    far.stun = 2; ship.stun = 2;
    advance(run, TICK);
    for (const event of bells(run)) for (const enemy of [near, chief, far]) {
      const hit = `${event.id}:${enemy.id}`;
      if (event.hits.includes(enemy.id) && !counted.has(hit)) { counted.add(hit); struckAt.set(enemy.id, tick); }
    }
    const picture = drawn(view, run, MOTION);
    for (const fill of picture) { expect(fill.layer).toBe("field"); expect(DANGER).not.toContain(fill.paint); }
    for (const enemy of [near, chief]) {
      expect(dazedAt(picture, overHead(enemy))).toBe(enemy.stun > 0);
      held.set(enemy.id, (held.get(enemy.id) ?? new Set()).add(enemy.stun > 0));
    }
    expect(dazedAt(picture, overHead(ship))).toBe(false);
    const since = tick - (struckAt.get(far.id) ?? Infinity);
    if (since < 0) expect(dazedAt(picture, overHead(far))).toBe(false);
    else if (since < own - 1) expect(dazedAt(picture, overHead(far))).toBe(true);
    else if (since > own + 2) expect(dazedAt(picture, overHead(far))).toBe(false);
  }
  expect([...held.values()].map(seen => seen.size)).toEqual([2, 2]);
  expect([...struckAt.keys()].sort()).toEqual([near.id, chief.id, far.id].sort());
  for (const event of bells(run)) expect(event.hits).not.toContain(ship.id);
});

test("the daze sits over the foe's drawn body and is not drawn for a body the scene has hidden", () => {
  const run = chaosArena("사명대사", 20), view = recorder(), enemy = chaosEnemy(run, CENTER.x, CENTER.y - 100);
  useSkill(run, 0);
  while (enemy.stun <= 0) advance(run, TICK);
  const body = (visible: boolean) => ({ x: enemy.x + 90, y: enemy.y + 40, displayHeight: 30, originY: .5, active: true, visible }) as Body;
  const picture = drawn(view, run, MOTION, () => body(true));
  expect(dazedAt(picture, { x: enemy.x + 90, y: enemy.y + 40 - 15 })).toBe(true);
  expect(dazedAt(picture, overHead(enemy))).toBe(false);
  expect(drawn(view, run, MOTION, () => body(false))).toHaveLength(0);
  const still = drawn(view, run, STILL);
  advance(run, TICK / 2);
  expect(enemy.stun).toBeGreaterThan(0);
  expect(drawn(view, run, STILL)).toEqual(still);
});

test("a damage-only army toll never marks another attack's stun as bell daze", () => {
  const run = army(20), view = recorder(), enemy = chaosEnemy(run, CENTER.x, CENTER.y - 100);
  attack(run, RULES.passiveEvery[chaosSkillBand(20)]);
  const [toll] = bells(run);
  expect(toll.trigger).toBe("army");
  expect(toll.stun).toBe(0);
  while (!toll.hits.includes(enemy.id)) advance(run, TICK);
  enemy.stun = 1;
  expect(dazedAt(drawn(view, run, MOTION), overHead(enemy))).toBe(false);
});

test("a cast's own tolls are left to the cast show: no ring is drawn for them, and no small bell while the great one hangs", () => {
  const run = army(20), view = recorder();
  useSkill(run, 0);
  for (let tick = 0; tick < 2 * RULES.interval; tick++) { advance(run, TICK); expect(drawn(view, run, MOTION)).toHaveLength(0); }
  const cast = bells(run).length;
  attack(run, RULES.passiveEvery[chaosSkillBand(20)]);
  expect(bells(run)).toHaveLength(cast + 1);
  for (let tick = 0; tick < RULES.expand / 2; tick++) advance(run, TICK);
  const picture = drawn(view, run, MOTION), [own] = bells(run).filter(event => event.wave === 0 && event.startedTick > 0);
  expect(leads(picture).length).not.toBe(0);
  for (const cell of leads(picture)) expect(Math.abs(farFrom(cell, own.to) - own.currentRadius)).toBeLessThanOrEqual(ON_RING);
  expect(picture.filter(fill => fill.layer === "field")).toHaveLength(0);
});
