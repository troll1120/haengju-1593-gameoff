import { expect, test } from "bun:test";
import { createBphRun } from "./bph-session";
import { bphSurvivalPlan } from "./bph-survival";
import { spawnBphSurvival } from "./bph-survival-spawn";
import { freshMeta } from "./meta";
import { spawn } from "./rules";

function fixture() {
  const run = createBphRun(freshMeta(), { seed: 3759809611, general: "권율", upgrades: [] });
  const state = run.bph!.survival!;
  const plan = bphSurvivalPlan("WaveChapter1");
  const step = (dt: number) => {
    run.time += dt;
    spawnBphSurvival(run, { dt, effects: [] }, s => spawn(run, s.elite, s.boss, undefined, s.final, s.side, s.march));
  };
  const living = () => run.enemies.filter(e => e.hp > 0).flatMap(e => e.cargo ?? [e]).filter(e => e.hp > 0);
  return { run, state, plan, step, living };
}

test("a full army queues regulars FIFO, including embarked soldiers, while commanders and minibosses enter", () => {
  const { state, plan, step, living } = fixture();
  const slot = { ...plan[0], side: "위" as const, at: 0 };
  const boss = plan.find(s => s.boss)!;
  state.reinforcements = [...Array(399).fill(slot), { ...slot, side: "아래", march: 0 }];
  step(.001);
  expect(living()).toHaveLength(400);
  expect(living().filter(e => e.aboard)).toHaveLength(1);
  const delayed = [{ ...slot, side: "좌" as const }, { ...slot, side: "우" as const }, slot];
  state.reinforcements = [delayed[0], boss, delayed[1], { ...slot, miniboss: "spin-slash" }, delayed[2]];
  const last = Math.max(...living().map(e => e.id));
  step(.001);
  const arrivals = () => living().filter(e => e.id > last);
  expect(arrivals().map(e => e.miniboss ?? e.boss)).toEqual([true, "spin-slash"]);
  for (const [i, { side }] of delayed.entries()) {
    living().find(e => e.id <= last && !e.aboard)!.hp = 0;
    step(.001);
    const released = arrivals().filter(e => !e.boss && !e.miniboss);
    expect(released).toHaveLength(i + 1);
    expect(released.at(-1)?.direction).toBe(side);
  }
  step(.001);
  expect(living()).toHaveLength(402);
});

test("a field cleared each step admits the uninterrupted 210-second roster", () => {
  const { run, step, living } = fixture();
  let count = 0;
  for (let tick = 0; tick < 2100; tick++) {
    step(.1);
    count += living().length;
    run.enemies.length = 0;
  }
  // Count from the same uncapped c9f1a576 director with this seed and input,
  // re-counted for the castle 1040 roster tiers and the f8ada857/f055c302 intensity counts.
  expect(count).toBe(1713);
});
