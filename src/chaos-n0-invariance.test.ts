import { expect, test } from "bun:test";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { advance, bphEffectCombat, useSkill } from "./rules";
import type { Run } from "./rules";
import { CHAOS_LEVELS } from "./chaos-contract";
import { chaosEnemy } from "./chaos-test-fixture";

const base = new URL("../evidence/runtime-n0-base/src/", import.meta.url);
const baseline: typeof import("./rules") = await import(new URL("rules.ts", base).href);
const baselineSession: typeof import("./bph-session") = await import(new URL("bph-session.ts", base).href);
const baselineMeta: typeof import("./meta") = await import(new URL("meta.ts", base).href);

function prepare(run: Run): void {
  if (!run.bph?.survival) throw new Error("Expected survival fixture");
  run.bph.survival.cursor = Number.MAX_SAFE_INTEGER;
  run.time = 84; run.weather = "맑음";
  run.commandClock = run.arrowClock = run.hwachaClock = 1e9;
  const squad = run.squads[0];
  Object.assign(squad, { x: 195, homeX: 195, targetX: 195, y: 100, homeY: 100, targetY: 100,
    clock: 1e9, skillClock: 0, hurtAt: run.time });
  chaosEnemy(run, 225, 100);
  const ladder = chaosEnemy(run, 195, 220);
  ladder.ladder = true; ladder.speed = 24; ladder.clock = 0;
}

// The former N0 premise (a survival run with no purchases has no chaos state) is gone by design:
// every survival run now stands its general at Lv1 with no XP and grows from there in the run.
test.each((["권율", "신립", "황진", "이순신"] as const).flatMap(general =>
  [144, 1593, 2026].map(seed => ({ general, seed }))))("$general seed $seed: a fresh survival run stands its general at Lv1 with no XP", ({ general, seed }) => {
  const run = createBphRun(freshMeta(), { seed, general, upgrades: [], startBattle: false });
  prepare(run);
  advance(run, 1 / 30);
  expect(run.chaos).toMatchObject({ general, level: 1, xp: 0 });
  expect(run.chaos?.mods).toBe(CHAOS_LEVELS[general][5]!);
});

test("Shin at Lv1 keeps the original charge exposure of 0f412af", () => {
  const current = createBphRun(freshMeta(), { seed: 144, general: "신립", upgrades: [], startBattle: false });
  const previous = baselineSession.createBphRun(baselineMeta.freshMeta(), { seed: 144, general: "신립", upgrades: [], startBattle: false });
  prepare(current); prepare(previous);
  useSkill(current, 0); baseline.useSkill(previous, 0);
  expect([current.squads[0].state, previous.squads[0].state]).toEqual(["charge", "charge"]);
  current.squads[0].hp = previous.squads[0].hp = 100;
  bphEffectCombat(current, []).applyUnitDamage({ target: current.squads[0], amount: 10 });
  baseline.bphEffectCombat(previous, []).applyUnitDamage({ target: previous.squads[0], amount: 10 });
  expect(current.squads[0].hp).toBe(100);
  expect(previous.squads[0].hp).toBe(100);
  expect(current.chaos).toMatchObject({ general: "신립", level: 1, xp: 0 });
});
