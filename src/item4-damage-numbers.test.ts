import { expect, test } from "bun:test";
import {
  DamageNumbers, DAMAGE_MERGE_GAP_MS, DAMAGE_NUMBER_CAP, DAMAGE_NUMBERS_PER_FRAME,
  damageNumberStyle, mergedNumberScale,
} from "./hit-feedback";

test("priority upgrades merge at full pool and frame budgets without allocating another number", () => {
  const numbers = new DamageNumbers(), slots = [...numbers.slots];
  for (let index = 0; index < DAMAGE_NUMBER_CAP; index++) {
    const at = Math.floor(index / DAMAGE_NUMBERS_PER_FRAME);
    if (index % DAMAGE_NUMBERS_PER_FRAME === 0) numbers.beginFrame(at);
    expect(numbers.add(index, 20, 1, false, at, `foe:${index}`)).toBe(index);
  }
  const at = DAMAGE_NUMBER_CAP / DAMAGE_NUMBERS_PER_FRAME - 1;
  expect(numbers.add(0, 0, 9, true, at, "foe:overflow", true)).toBe(-1);

  // Merging precedes both admission limits, including normal -> skill -> critical.
  expect(numbers.add(30, 40, 10, false, at, "foe:0", true)).toBe(0);
  expect(damageNumberStyle(numbers.slots[0].critical, numbers.slots[0].big))
    .toEqual({ size: 14, color: "#ffffff", alpha: 1 });
  expect(numbers.add(31, 41, 20, true, at, "foe:0")).toBe(0);
  for (let hit = 0; hit < 10; hit++)
    expect(numbers.add(32, 42, 1, false, at, "foe:0")).toBe(0);
  expect(numbers.slots[0]).toMatchObject({
    x: 32, y: 42, value: 41, hits: 13, critical: true, big: true,
    startedAt: 0, bumpedAt: at, active: true,
  });
  expect(damageNumberStyle(numbers.slots[0].critical, numbers.slots[0].big))
    .toEqual({ size: 18, color: "#ffdf53", alpha: 1 });
  expect(mergedNumberScale(numbers.slots[0].hits)).toBe(1.5);
  expect(numbers.slots.filter(slot => slot.active)).toHaveLength(DAMAGE_NUMBER_CAP);
  for (let index = 0; index < DAMAGE_NUMBER_CAP; index++)
    expect(numbers.slots[index]).toBe(slots[index]);

  // A full pool must not extend a merge beyond the exact 300ms boundary.
  numbers.beginFrame(at + DAMAGE_MERGE_GAP_MS);
  expect(numbers.add(99, 99, 100, true, at + DAMAGE_MERGE_GAP_MS, "foe:0")).toBe(-1);
  expect(numbers.slots[0]).toMatchObject({ value: 41, hits: 13, bumpedAt: at });
});

test("a priority merge leaves all four new-number admissions available", () => {
  const numbers = new DamageNumbers();
  numbers.beginFrame(0);
  expect(numbers.add(0, 0, 1, false, 0, "foe:existing")).toBe(0);
  numbers.beginFrame(1);
  expect(numbers.add(0, 0, 2, true, 1, "foe:existing", true)).toBe(0);
  for (let index = 0; index < DAMAGE_NUMBERS_PER_FRAME; index++)
    expect(numbers.add(0, 0, 1, false, 1, `foe:new:${index}`)).toBe(index + 1);
  expect(numbers.add(0, 0, 1, false, 1, "foe:overflow")).toBe(-1);
  expect(numbers.slots.filter(slot => slot.active)).toHaveLength(DAMAGE_NUMBERS_PER_FRAME + 1);
});
