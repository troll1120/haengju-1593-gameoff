import { expect, test } from "bun:test";
import type Phaser from "phaser";
import { CHAOS_LEVELS, CHAOS_RULES } from "../chaos-contract";
import type { ChaosFleetPass } from "../chaos-contract";
import { WIDTH } from "../geometry";
import { chaosArena, chaosTicks } from "../chaos-test-fixture";
import { PALETTE } from "../presentation";
import { useSkill } from "../rules";
import type { SkillStage } from "../skill-stage";
import { segmentGap } from "../chaos-skill-geometry";
import { ambient, fleetBow, fleetTick, passBand, passLayers, passPhase, planPass, shipLane } from "./fleet-passes";

const { passTicks, afterimageTicks, pushPixels } = CHAOS_RULES.fleet;
/** One volley at an army level as tickChaosFleet lays it out on its cast tick, every number read from the contract. */
function sample(level: number, lane = 301.5) {
  const mods = CHAOS_LEVELS["이순신"][level];
  if (mods?.general !== "이순신") throw new Error(`No fleet at army level ${level}`);
  const fleet: ChaosFleetPass[] = Array.from({ length: mods.passes }, (_, index) => ({ id: 900 + index, lane, width: mods.width,
    dueTick: 420 + index * passTicks, untilTick: 420 + (index + 1) * passTicks + afterimageTicks, landIds: [], shipIds: [],
    landPower: 0, shipPower: 0, push: pushPixels / mods.passes, resolved: index === 0 }));
  return { mods, fleet };
}
const crossing = { dueTick: 300, untilTick: 300 + passTicks + afterimageTicks };

test("each pass is drawn in its real band, and its ship, spray, embers and afterimages stay inside it", () => {
  for (const level of [10, 20]) {
    const { mods, fleet } = sample(level);
    for (const pass of fleet) {
      const band = passBand(pass, mods, WIDTH), plan = planPass(pass.id, band, false);
      expect([band.half * 2, band.left, band.right]).toEqual([mods.width, 0, WIDTH]);
      for (let y = band.top; y < band.bottom; y += 4) expect(Math.abs(y + 2 - pass.lane)).toBeLessThanOrEqual(band.half);
      for (const y of [band.top - 4, band.bottom]) expect(Math.abs(y + 2 - pass.lane)).toBeGreaterThan(band.half);
      expect(plan.rise).toBeLessThanOrEqual(band.half);
      expect(plan.spray.length * plan.embers.length * plan.echoes.length).toBeGreaterThan(0);
      for (const drop of [...plan.spray, ...plan.embers]) {
        expect(Math.abs(drop.y - pass.lane)).toBeLessThanOrEqual(band.half);
        expect(drop.x).toBeGreaterThanOrEqual(band.left);
        expect(drop.x).toBeLessThan(band.right);
      }
      plan.echoes.forEach((echo, index) => {
        expect(echo.x - plan.hull).toBeGreaterThanOrEqual(index ? plan.echoes[index - 1].x : band.left);
        expect(echo.x).toBeLessThanOrEqual(band.right);
      });
    }
    expect(passBand({ lane: 300, width: undefined }, mods, WIDTH).half).toBe(mods.width / 2);
  }
});

test("a pass is marked until it is due, crosses in the pass time and fades over the afterimage time on the rules' clock", () => {
  expect(passPhase(crossing, 300 - passTicks / 2)).toEqual({ kind: "due", ahead: passTicks / 2 });
  expect(passPhase(crossing, 300)).toEqual({ kind: "crossing", sailed: 0 });
  expect(passPhase(crossing, 300 + passTicks / 2)).toEqual({ kind: "crossing", sailed: .5 });
  expect(passPhase(crossing, 300 + passTicks)).toEqual({ kind: "afterimage", fade: 1 });
  expect(passPhase(crossing, 300 + passTicks + afterimageTicks / 2)).toEqual({ kind: "afterimage", fade: .5 });
  expect(passPhase(crossing, crossing.untilTick)).toEqual({ kind: "gone" });
  expect(fleetTick({ tick: 40, remainder: .5 / CHAOS_RULES.simulationHz })).toBeCloseTo(40.5, 9);
  const { mods, fleet } = sample(20), band = passBand(fleet[0], mods, WIDTH), plan = planPass(fleet[0].id, band, false);
  expect(fleetBow(band, plan.hull, 0)).toBe(band.left);
  expect(fleetBow(band, plan.hull, 1) - plan.hull).toBe(band.right);
  for (const echo of plan.echoes) expect(fleetBow(band, plan.hull, echo.at)).toBeCloseTo(echo.x, 9);
  for (const drop of [...plan.spray, ...plan.embers]) expect(drop.at >= 0 && drop.at < 1).toBe(true);
});

test("a pass's plan repeats for its seed and never draws from Math.random", () => {
  const global = Math.random;
  Math.random = () => { throw new Error("decoration drew from Math.random"); };
  try {
    const { mods, fleet } = sample(10), band = passBand(fleet[0], mods, WIDTH);
    expect(planPass(7, band, false)).toEqual(planPass(7, band, false));
    expect(planPass(8, band, false).spray).not.toEqual(planPass(7, band, false).spray);
    expect(planPass(8, band, false).echoes).toEqual(planPass(7, band, false).echoes);
  } finally { Math.random = global; }
});

test("with motion off only the still band shows until the crossing ends, and flashes off keep the motion without the landing flash", () => {
  const { mods, fleet } = sample(20), still = planPass(7, passBand(fleet[0], mods, WIDTH), true);
  expect([still.spray, still.embers, still.echoes]).toEqual([[], [], []]);
  const [due, sailing, after] = [299, 300 + passTicks / 2, 300 + passTicks + 1].map(tick => passPhase(crossing, tick));
  const bare = { tide: false, ship: false, flash: false, afterimage: false };
  expect([due, sailing, after].map(phase => passLayers(phase, { motion: false, flash: true }))).toEqual([{ band: 1, ...bare }, { band: 1, ...bare }, { band: 0, ...bare }]);
  expect(passLayers(sailing, { motion: true, flash: false })).toEqual({ band: 1, tide: false, ship: true, flash: false, afterimage: true });
  expect(passLayers(due, { motion: true, flash: true })).toEqual({ band: 1, ...bare, tide: true });
});

test("manual fleet ground tint covers each runtime route once, without yellow dashes", () => {
  const counts: number[] = [];
  for (const level of [1, 5, 10, 15, 20]) {
    const run = chaosArena("이순신", level), stage: SkillStage = Object.create(null);
    const ground: Phaser.GameObjects.Graphics = Object.create(null);
    let paint = 0, alpha = 0;
    const fills: number[][] = [];
    ground.fillStyle = (color = 0, opacity = 1) => { paint = color; alpha = opacity; return ground; };
    ground.fillRect = (x, y, width, height) => { fills.push([paint, alpha, x, y, width, height]); return ground; };
    Object.assign(stage, { ground });
    useSkill(run, 0); chaosTicks(run, 3);
    const frame = { run, now: 0, cssPixel: 1, at: (unit: { x: number; y: number }) => unit, foe: () => undefined, channels: { motion: false, flash: true } };
    try {
      ambient.update(stage, frame);
      const marks = fills.filter(fill => fill[0] === PALETTE.ally && fill[1] === .12);
      expect(fills.filter(fill => fill[0] === PALETTE.gold)).toEqual([]);
      const live = run.chaosSkills?.events.filter(event => event.kind === "ships" && event.startedTick <= 3) ?? [];
      const routes = new Set(live.map(event => event.from.y === event.to.y ? `y:${event.from.y}` : `x:${event.from.x}`));
      counts.push(routes.size);
      // Ships sharing a route share its marks: one mark per distinct lane box, however many ships sail it.
      const boxes = new Set(live.flatMap(event => shipLane(event).map(box => `${box.left}:${box.top}:${box.right}:${box.bottom}`)));
      expect(marks.length).toBe(boxes.size);
      expect(marks.length).toBeGreaterThanOrEqual(routes.size);
      // Compare every 4px cell against distance to the real collision route (a field crossing, or the area's segment), independently of shipLane.
      for (let y = 2; y < 650; y += 4) for (let x = 2; x < WIDTH; x += 4) {
        const struck = live.some(event => segmentGap({ x, y }, event.from, event.to) <= event.radius);
        const marked = marks.some(([, , left, top, width, height]) => x >= left && x < left + width && y >= top && y < top + height);
        expect(marked).toBe(struck);
      }
      const first = fills.map(fill => [...fill]);
      fills.length = 0; chaosTicks(run, 8); ambient.update(stage, frame);
      expect(fills).toEqual(first);
    } finally { ambient.clear(stage); }
  }
  // A fresh run's Lv1 fleet is the smallest start, not nothing.
  expect(counts[0]).toBeGreaterThan(0);
  expect(counts.every((count, index) => index === 0 || count >= counts[index - 1])).toBe(true);
  expect(counts.at(-1)).toBeGreaterThan(counts[0]);
});
