import { expect, test } from "bun:test";
import { MOTION, stepHop, stepsWalked, strikeOffset } from "./motion";

const NEVER = 1e9;
test("a striker is drawn back through the wind-up, thrown forward at the blow and settles afterwards", () => {
  expect(strikeOffset(NEVER, 220, NEVER)).toBe(0);
  expect(strikeOffset(110, 220, NEVER)).toBeCloseTo(-MOTION.windBack / 2);
  expect(strikeOffset(219, 220, NEVER)).toBeLessThan(strikeOffset(110, 220, NEVER));
  expect(strikeOffset(220, 220, 0)).toBe(MOTION.lunge);
  expect(strikeOffset(220 + MOTION.lungeMs / 2, 220, MOTION.lungeMs / 2)).toBeCloseTo(MOTION.lunge / 2);
  expect(strikeOffset(220 + MOTION.lungeMs, 220, MOTION.lungeMs)).toBe(0);
});
test("the body frame changes with every stride walked and never while standing", () => {
  let gait = 0, frame = 0, changes = 0;
  for (let pixel = 0; pixel < MOTION.stride * 5; pixel++) {
    gait += 1;
    const next = stepsWalked(gait) % 2;
    if (next !== frame) { frame = next; changes++; }
  }
  expect(changes).toBe(5);
  expect(stepsWalked(gait)).toBe(stepsWalked(gait + 0));
  expect(stepHop(MOTION.stride / 2)).toBeCloseTo(MOTION.hop);
  expect(stepHop(MOTION.stride)).toBeCloseTo(0);
});
