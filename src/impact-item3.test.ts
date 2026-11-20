import { expect, test } from "bun:test";
import { ImpactBudget } from "./impact";

test("major camera tiers retain their CSS amplitudes and bounded glow durations", () => {
  for (const [strength, glow, amplitude, duration] of [
    [.004, 20, 2, 100], [.008, 200, 3, 200], [.014, 420, 4, 240],
  ]) {
    const budget = new ImpactBudget();
    expect(budget.request(0, true, false, strength, glow)).toEqual({ allowed: true, stop: 90 });
    expect(budget.cameraEvents).toBe(1);
    expect(budget.sample(10, false).x).toBeCloseTo(Math.sin(1.2) * amplitude * (1 - 10 / duration) ** 2);
    expect(budget.sample(duration, false)).toEqual({ x: 0, y: 0 });
  }
});

test("landing hits cannot restart a stronger major camera event inside two seconds", () => {
  const budget = new ImpactBudget();
  budget.request(0, true, false, .014, 420);
  const offset = budget.sample(100, false);
  expect(budget.big(100, false)).toBe(false);
  expect(budget.sample(100, false)).toEqual(offset);
  for (const at of [250, 500, 750, 1000, 1250, 1500, 1750, 1999]) {
    expect(budget.big(at, false)).toBe(false);
  }
  expect(budget.cameraEvents).toBe(1);
  expect(budget.sample(1010, false)).toEqual({ x: 0, y: 0 });
});

test("repeated landing hits share the major two-second camera budget", () => {
  const budget = new ImpactBudget(), admitted: number[] = [];
  for (let at = 0; at <= 6000; at += 250) if (budget.big(at, false)) admitted.push(at);
  expect(admitted).toEqual([0, 2000, 4000, 6000]);
  expect(budget.cameraEvents).toBe(admitted.length);
});

test("landing display holds keep their 50ms length and 250ms cadence without another camera event", () => {
  const budget = new ImpactBudget();
  expect(budget.big(0, false)).toBe(true);
  expect(budget.holding(49, false)).toBe(true);
  expect(budget.holding(50, false)).toBe(false);
  expect(budget.big(249, false)).toBe(false);
  expect(budget.holding(249, false)).toBe(false);
  expect(budget.big(250, false)).toBe(false);
  expect(budget.holding(299, false)).toBe(true);
  expect(budget.holding(300, false)).toBe(false);
  expect(budget.cameraEvents).toBe(1);
});

test("a landing camera event suppresses only the next request's camera, never its stop", () => {
  const budget = new ImpactBudget();
  expect(budget.big(0, false)).toBe(true);
  expect(budget.request(100, true, false, .014, 420)).toEqual({ allowed: true, stop: 90 });
  expect(budget.cameraEvents).toBe(1);
  expect(budget.holding(166, false)).toBe(true);
  expect(budget.holding(167, false)).toBe(false);
  expect(budget.sample(200, false)).toEqual({ x: 0, y: 0 });
  expect(budget.request(2100, true, false, .014, 420)).toEqual({ allowed: true, stop: 90 });
  expect(budget.cameraEvents).toBe(2);
  expect(budget.sample(2110, false).x).toBeCloseTo(Math.sin(1.2) * 4 * (1 - 10 / 240) ** 2);
});

test("interleaved landing hits preserve every simulation request and rolling-minute stop decision", () => {
  const baseline = new ImpactBudget(), candidate = new ImpactBudget();
  const stops: number[] = [];
  for (let at = 0; at <= 62000; at += 50) {
    candidate.big(at, false);
    if (at % 1000 !== 0) continue;
    const major = at % 4000 !== 0;
    const expected = baseline.request(at, major, false, .014, 420);
    const actual = candidate.request(at, major, false, .014, 420);
    expect(actual).toEqual(expected);
    if (actual.stop) stops.push(at);
    expect(stops.filter(time => at - time < 60000).length).toBeLessThanOrEqual(4);
  }
  expect(stops.length).toBeGreaterThan(4);
});

test("motion-off and zero-strength skill requests spend no camera budget", () => {
  const budget = new ImpactBudget();
  expect(budget.big(0, true)).toBe(false);
  expect(budget.request(0, true, true, .014, 420)).toEqual({ allowed: false, stop: 0 });
  expect(budget.request(0, true, false, 0)).toEqual({ allowed: true, stop: 90 });
  expect(budget.cameraEvents).toBe(0);
  expect(budget.big(0, false)).toBe(true);
  expect(budget.holding(1, true)).toBe(false);
  expect(budget.sample(1, true)).toEqual({ x: 0, y: 0 });
});

