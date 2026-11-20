import { expect, test } from "bun:test";
import { CAP, ParticleCap, storm } from "./fxdensity";

test("effect density is calm early and a storm by six to eight minutes", () => {
  expect(storm(0)).toBeCloseTo(.3, 6);
  expect(storm(60)).toBeCloseTo(.3, 6);
  expect(storm(180)).toBeLessThan(.5);
  expect(storm(360)).toBeGreaterThan(.9);
  expect(storm(420)).toBe(1);
  expect(storm(600)).toBe(1);
  for (let time = 0; time < 600; time += 10) expect(storm(time + 10)).toBeGreaterThanOrEqual(storm(time));
});

test("the particle cap shrinks under slow frames, regrows at 60 fps and never grants past it", () => {
  const cap = new ParticleCap();
  for (let i = 0; i < 300; i++) cap.sample(33);
  expect(cap.sample(33)).toBe(CAP.min);
  expect(cap.headroom()).toBe(CAP.min / CAP.start);
  cap.live = CAP.min - 2;
  expect(cap.grant(10, 1)).toBe(2);
  for (let i = 0; i < 1000; i++) cap.sample(1000 / 120);
  expect(cap.sample(1000 / 120)).toBe(CAP.max);
  cap.live = 0;
  expect(cap.grant(10, .3)).toBe(3);
  expect(cap.grant(10, 1)).toBe(10);
});

test("cosmetic particles never exceed sixty even after sustained fast frames", () => {
  const cap = new ParticleCap();
  for (let i = 0; i < 1000; i++) cap.sample(8);
  expect(cap.grant(100, 1)).toBe(60);
  cap.live = 59;
  expect(cap.grant(6, 1)).toBe(1);
  cap.live = 60;
  expect(cap.grant(6, 1)).toBe(0);
});
