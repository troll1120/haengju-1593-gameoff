import { expect, test } from "bun:test";
import { BPH_GENERALS, DIM_TIERS, dimFixture } from "../scripts/skill-dim-fixture";

test("all generals and growth tiers preserve every field of battle state across rendering", () => {
  for (const general of BPH_GENERALS) for (const { level, awakened } of DIM_TIERS) {
    const fixture = dimFixture(general, level, awakened);
    fixture.cast();
    for (let tick = 0; tick < 420; tick++) {
      const before = JSON.stringify(fixture.run);
      fixture.frame();
      expect(JSON.stringify(fixture.run)).toBe(before);
      // Only the original rules advance the battle, between the read-only display checks.
      fixture.step();
    }
    fixture.stage.clear();
  }
});
