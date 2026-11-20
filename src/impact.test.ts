import { expect, test } from "bun:test";
import { ImpactBudget } from "./impact";

test("all simulation impact requests retain the original two second cadence", () => {
  const budget = new ImpactBudget();
  expect(budget.request(0, false, false)).toEqual({ allowed: true, stop: 0 });
  expect(budget.request(1999, true, false).allowed).toBe(false);
  expect(budget.request(2000, true, false).stop).toBe(90);
  expect(budget.request(3999, false, false).allowed).toBe(false);
  expect(budget.request(4000, false, false)).toEqual({ allowed: true, stop: 0 });
});

test("rolling-minute simulation stop retains its original four-event 360ms allowance", () => {
  const budget = new ImpactBudget(), admitted: { at: number; stop: number }[] = [];
  let capped = false;
  for (let at = 0; at < 180000; at += 50) {
    const result = budget.request(at, at % 100 === 0, false);
    capped ||= result.allowed && result.stop === 0;
    admitted.push({ at, stop: result.stop });
    const sum = admitted.filter(item => at - item.at < 60000).reduce((total, item) => total + item.stop, 0);
    expect(sum).toBeLessThanOrEqual(360);
    expect(admitted.filter(item => at - item.at < 60000 && item.stop > 0)).toHaveLength(sum / 90);
  }
  expect(capped).toBe(true);
  expect(admitted.filter(item => item.at >= 120000 && item.stop > 0).length).toBeGreaterThan(0);
});

test("camera offsets decay continuously within CSS pixel limits and vanish with motion off", () => {
  const budget = new ImpactBudget();
  budget.critical(0, false);
  expect(budget.sample(0, false)).toEqual({ x: 0, y: 0 });
  expect(Math.abs(budget.sample(25, false).x)).toBeLessThanOrEqual(1.5 * .75 ** 2);
  expect(budget.sample(25, true)).toEqual({ x: 0, y: 0 });
  expect(budget.sample(100, false)).toEqual({ x: 0, y: 0 });
  budget.request(500, true, false);
  expect(Math.abs(budget.sample(590, false).y)).toBeLessThanOrEqual(.75);
  expect(budget.sample(680, false)).toEqual({ x: 0, y: 0 });
});

test("reduced motion removes both shaking and hit-stop", () => {
  const budget = new ImpactBudget();
  expect(budget.request(0, false, true)).toEqual({ allowed: false, stop: 0 });
  expect(budget.request(0, true, true)).toEqual({ allowed: false, stop: 0 });
  expect(budget.critical(0, true)).toBe(false);
  expect(budget.holding(0, true)).toBe(false);
});

test("critical decoration never delays a simulation request or spends a major stop", () => {
  const budget = new ImpactBudget();
  expect(budget.critical(0, false)).toBe(true);
  expect(budget.request(0, true, false)).toEqual({ allowed: true, stop: 90 });
  expect(budget.critical(1999, false)).toBe(true);
  expect(budget.request(2000, true, false)).toEqual({ allowed: true, stop: 90 });
  expect(budget.request(4000, true, false)).toEqual({ allowed: true, stop: 90 });
  expect(budget.request(6000, true, false)).toEqual({ allowed: true, stop: 90 });
  expect(budget.request(8000, true, false)).toEqual({ allowed: true, stop: 0 });
});

test("major display hold ends at 67ms without shortening the 90ms simulation stop", () => {
  const budget = new ImpactBudget();
  const impact = budget.request(0, true, false);
  expect(budget.holding(66, false)).toBe(true);
  expect(budget.holding(67, false)).toBe(false);
  expect(impact.stop).toBe(90);
  expect(budget.holding(33, true)).toBe(false);
});

test("naval display impact holds and shakes without spending a simulation stop", () => {
  const budget = new ImpactBudget();
  expect(budget.big(0, true)).toBe(false);
  expect(budget.holding(0, false)).toBe(false);
  expect(budget.big(0, false)).toBe(true);
  expect(budget.holding(49, false)).toBe(true);
  expect(budget.holding(49, true)).toBe(false);
  expect(budget.holding(50, false)).toBe(false);
  expect(budget.sample(25, false)).not.toEqual({ x: 0, y: 0 });
  expect(budget.sample(25, true)).toEqual({ x: 0, y: 0 });
  expect(budget.sample(140, false)).toEqual({ x: 0, y: 0 });
  for (const at of [0, 2000, 4000, 6000])
    expect(budget.request(at, true, false).stop).toBe(90);
});
