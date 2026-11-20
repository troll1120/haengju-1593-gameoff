import { expect, test } from "bun:test";
import { deferFixtureBarracks } from "./bph-barracks-fixture";
import { createBphRun, ensureBphSave } from "./bph-session";
import { bphSurvivalPlan } from "./bph-survival";
import { distance, fortRect } from "./geometry";
import { freshMeta } from "./meta";
import { advance, spawn } from "./rules";

function battlefield(chapter = 0, upgrades: Parameters<typeof createBphRun>[1]["upgrades"] = []) {
  const meta = freshMeta();
  ensureBphSave(meta).chapter = chapter;
  const run = createBphRun(meta, { seed: 7, general: "권율", upgrades });
  deferFixtureBarracks(run);
  run.bph?.arrivals?.splice(0);
  run.squads = []; run.shieldUntil = Infinity;
  return run;
}

test("gold pouches replace at most one eligible ground enemy per minute beginning at 60 seconds", () => {
  const effect = { nodeId: "HJ_GoldPouchSpawn", type: "GoldPouchSpawnChanceBonus", value: .5,
    effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {} };
  const run = battlefield(0, [effect, effect]), baseline = battlefield(), arrivals: number[] = [];
  let baselinePouches = 0;
  let hadTransport = false, hadSpecial = false;
  for (let tick = 0; tick < 3000; tick++) {
    advance(run, .1);
    advance(baseline, .1);
    expect(run.rng).toBe(baseline.rng);
    expect(run.enemies.map(enemy => enemy.id)).toEqual(baseline.enemies.map(enemy => enemy.id));
    baselinePouches += baseline.enemies.filter(enemy => enemy.goldPouch).length;
    baseline.enemies = [];
    for (const enemy of run.enemies) {
      if (enemy.cargo) {
        hadTransport = true;
        expect(enemy.goldPouch).toBeUndefined();
        for (const passenger of enemy.cargo) expect(passenger.goldPouch).toBeUndefined();
      }
      if (enemy.commanderEscort) expect(enemy.goldPouch).toBeUndefined();
      if (enemy.boss || enemy.elite || enemy.wave || enemy.ladder) {
        hadSpecial = true;
        expect(enemy.goldPouch).toBeUndefined();
      }
      if (enemy.goldPouch) {
        expect(enemy.kind).not.toBe("ship");
        expect(enemy.aboard).toBeUndefined();
        arrivals.push(run.time);
      }
    }
    run.enemies = [];
  }
  expect(hadTransport).toBe(true);
  expect(hadSpecial).toBe(true);
  expect(arrivals).toHaveLength(4);
  expect(baselinePouches).toBe(2);
  expect(arrivals.map(at => Math.floor(at / 60))).toEqual([1, 2, 3, 4]);
});

test("the 50% larger pouch body separates from a regular enemy at 25 pixels", () => {
  const run = battlefield(), state = run.bph?.survival;
  if (!state) throw new TypeError("Missing survival state");
  state.cursor = bphSurvivalPlan("WaveChapter1").length;
  const normal = spawn(run, false, false, undefined, false, "위");
  const pouch = spawn(run, false, false, undefined, false, "위");
  Object.assign(normal, { x: 100, y: 90, stun: 10 });
  Object.assign(pouch, { x: 122, y: 90, stun: 10 });

  advance(run, .05);
  expect(distance(normal, pouch)).toBe(22);

  pouch.goldPouch = true;
  advance(run, .05);
  expect(distance(normal, pouch)).toBeCloseTo(25, 8);
});

test("first physical wall contact permanently spends the pouch while preserving its visual tag", () => {
  const run = battlefield(), wall = fortRect(run.fort);
  const pouch = spawn(run, false, false, undefined, false, "위");
  Object.assign(pouch, { goldPouch: true, x: (wall.left + wall.right) / 2, y: wall.top - 16, stun: 10 });

  advance(run, .05);
  expect(pouch.goldPouchSpent).toBeUndefined();

  pouch.y = wall.top - 15;
  advance(run, .05);
  expect(pouch.goldPouchSpent).toBe(true);

  pouch.y -= 30;
  advance(run, .05);
  expect(pouch.goldPouch).toBe(true);
  expect(pouch.goldPouchSpent).toBe(true);
});

test.each([
  // Authored escort budgets split by the release ramp at 180, 360, 540, 720 and 810s.
  ["WaveChapter1", 0, [18 * 3, 22 * 7, 26 * 10, 30 * 10, 34 * 10]],
  ["WaveChapter4", 3, [30 * 3, 34 * 7, 38 * 10, 42 * 10, 46 * 10]],
] as const)("%s spawns one 2.5-second escort burst per commander beat", (waveId, chapter, counts) => {
  for (const [beat, anchor] of [180, 360, 540, 720, 810].entries()) {
    const run = battlefield(chapter), battle = run.bph;
    if (!battle?.survival) throw new TypeError("Missing survival state");
    battle.survival.cursor = bphSurvivalPlan(waveId).findIndex(entry => entry.at >= anchor);
    run.time = anchor - .15;
    const arrivals = new Map<number, number>();
    let commanderAt: number | undefined;
    let usedTransport = false;
    for (let tick = 0; tick < 34; tick++) {
      advance(run, .1);
      for (const enemy of run.enemies) {
        if (enemy.boss) commanderAt ??= run.time;
        for (const ground of enemy.cargo ?? [enemy]) if (ground.commanderEscort) {
          expect(ground.goldPouch).toBeUndefined();
          expect(ground.boss || ground.elite || ground.wave || ground.ladder).toBe(false);
          if (!arrivals.has(ground.id)) arrivals.set(ground.id, run.time);
          if (enemy.cargo) usedTransport = true;
        }
      }
    }
    const times = [...arrivals.values()];
    if (commanderAt === undefined) throw new TypeError(`No commander appeared at ${anchor}`);
    expect(times).toHaveLength(counts[beat]);
    expect(times[0]).toBe(commanderAt);
    expect(times.at(-1) ?? -Infinity).toBeCloseTo(anchor + 2.55, 6);
    expect(usedTransport).toBe(true);
  }
});
