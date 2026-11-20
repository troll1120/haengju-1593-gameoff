import { expect, test } from "bun:test";
import { BPH_GENERALS, DIM_TIERS, FRAME_MS, dimFixture, measureDim } from "../scripts/skill-dim-fixture";

for (const general of BPH_GENERALS) for (const { level, awakened } of DIM_TIERS) {
  test(`${general} Lv${level} awakening ${awakened}: the veil covers the entire scheduled show`, () => {
    const measured = measureDim(general, level, awakened);
    expect(measured.gaps).toBe(0);
    expect(measured.overlayEnd).toBeGreaterThanOrEqual(measured.showEnd);
    expect(measured.overlayEnd).toBeLessThan(measured.showEnd + 1000);
  });
}
test("overlapping manual casts stay dim through the last show, fade, then release; army events do not extend them", () => {
  const fixture = dimFixture("곽재우", 20, 2);
  fixture.cast();
  for (let tick = 0; tick < 30; tick++) fixture.step();
  fixture.cast();
  const end = Math.max(...fixture.run.chaosSkills!.events.filter(event => event.trigger === "manual").map(event => event.untilTick));
  const sample = fixture.run.chaosSkills!.events[0];
  fixture.run.chaosSkills!.events.push({ ...sample, id: fixture.run.nextId++, trigger: "army",
    startedTick: end, impactTick: end + 100, untilTick: end + 1000 });
  while (fixture.run.chaosSkills!.tick < end - 1) expect(fixture.step()).toBeGreaterThan(0);
  for (let tick = 0; tick < 30; tick++) fixture.step();
  expect(fixture.dusk.visible).toBe(false);
  fixture.stage.clear();
  expect(fixture.frame()).toBe(0);
});

test("clearing a live cast resets the veil tail and changing accessibility settings applies immediately", () => {
  const fixture = dimFixture("황진", 20, 2);
  fixture.cast();
  expect(fixture.frame()).toBeGreaterThan(0);
  fixture.stage.update(FRAME_MS, { run: fixture.run, cssPixel: 1, at: unit => unit, foe: () => undefined,
    channels: { motion: false, flash: false } });
  expect(Number(fixture.dusk.alpha)).toBeLessThanOrEqual(.25);
  fixture.stage.clear();
  fixture.run.chaosSkills!.events = [];
  expect(fixture.frame()).toBe(0);
});

for (const channels of [{ motion: false, flash: true }, { motion: true, flash: false }, { motion: false, flash: false }]) {
  test(`calm veil remains bounded and releases with motion=${channels.motion}, flash=${channels.flash}`, () => {
    const fixture = dimFixture("황진", 20, 2, channels);
    fixture.cast();
    const end = Math.max(...fixture.run.chaosSkills!.events.map(event => event.untilTick));
    for (let tick = 0; tick < end - 1; tick++) {
      const alpha = fixture.step();
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThanOrEqual(.25);
    }
    for (let tick = 0; tick < 30; tick++) fixture.step();
    expect(fixture.dusk.visible).toBe(false);
    fixture.stage.clear();
  });
}
