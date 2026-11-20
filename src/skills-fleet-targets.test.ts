import { expect, test } from "bun:test";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { riverLane } from "./river";
import { createRun, useSkill } from "./rules";
import type { Enemy } from "./rules";
import { fleetLanes } from "./skills-fleet-targets";
import { chaosState } from "./chaos-state";

const cases = [
  { name: "empty land", ys: [], lane: riverLane(), hits: [] },
  { name: "inclusive 48px edge", ys: [100, 148, 196], lane: 124, hits: [0, 1] },
  { name: "first of equal dense bands", ys: [0, 48, 100, 148], lane: 24, hits: [0, 1] },
  { name: "duplicate-height targets", ys: [100, 100, 148, 148, 196], lane: 124, hits: [0, 1, 2, 3] },
  { name: "largest window after a smaller window", ys: [0, 100, 124, 148, 200], lane: 124, hits: [1, 2, 3] },
] as const;

for (const sample of cases) {
  test(`N0 manual fleet preserves default 48px targeting: ${sample.name}`, () => {
    const run = createBphRun(freshMeta(), { seed: 1593, general: "이순신", upgrades: [] });
    // Explicit legacy L0: zero purchases now starts survival at Lv1.
    const state = chaosState(run);
    if (!state) throw new Error("Missing commander state");
    state.level = 0;
    const template = createRun(4).enemies[0];
    run.enemies = sample.ys.map((y, index): Enemy => ({
      ...template, id: 1000 + index, kind: "yari", x: 40, y, hp: 1000, maxHp: 1000,
      boss: false, elite: false, ladder: false, shielded: false,
    }));
    run.squads[0].skillClock = 0;
    const rng = run.rng;

    const effects = useSkill(run, 0);

    expect(fleetLanes(run.enemies, 1)).toEqual([sample.lane]);
    expect(effects.filter(effect => effect.kind === "hit").map(effect => effect.target))
      .toEqual(sample.hits.map(index => 1000 + index));
    expect(effects.find(effect => effect.kind === "skill")?.y).toBe(sample.lane);
    for (const [index, enemy] of run.enemies.entries()) {
      expect(enemy.hp).toBeCloseTo(sample.hits.some(hit => hit === index) ? 992.7004 : 1000, 8);
    }
    expect(run.chaos).toBe(state);
    expect(state.level).toBe(0);
    expect(run.rng).toBe(rng);
  });
}
