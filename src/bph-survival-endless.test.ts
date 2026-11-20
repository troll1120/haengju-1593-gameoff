import { afterEach, beforeEach, expect, test } from "bun:test";
import { bphSurvivalBossGroup, bphSurvivalEndlessIntensity, bphSurvivalPlan, createBphSurvival } from "./bph-survival";
import type { BphSurvivalState } from "./bph-survival";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { createBphRun, ensureBphSave, recordEndlessBest } from "./bph-session";
import { freshMeta, keepMeta, loadMeta } from "./meta";
import { advance, enterEndless, hitBphEnemy } from "./rules";
import type { Run } from "./rules";
import { HEIGHT, setFieldSize, WIDTH } from "./geometry";

let previousSize: [number, number];
beforeEach(() => {
  previousSize = [WIDTH, HEIGHT];
  setFieldSize(390, 844);
});
afterEach(() => setFieldSize(...previousSize));
const groups = (state: BphSurvivalState, count: number) =>
  Array.from({ length: count }, (_, group) => [...bphSurvivalBossGroup(state, group)]);
function survival(run: Run): BphSurvivalState {
  const state = run.bph?.survival;
  if (!state) throw new TypeError("Missing survival state");
  return state;
}
function fortified(seed = 7, chapter = 0): Run {
  const meta = freshMeta();
  ensureBphSave(meta).chapter = chapter;
  const run = createBphRun(meta, { seed, general: "권율", upgrades: [] });
  run.base = run.maxBase = 1e12;
  return run;
}
/** Jumps to just before `at` with every earlier planned slot consumed. */
function before(run: Run, at: number): void {
  const state = survival(run);
  run.time = at - .05; run.enemies = [];
  state.cursor = bphSurvivalPlan(run.bph!.waveId).findIndex(entry => entry.at >= at);
  if (state.cursor < 0) state.cursor = bphSurvivalPlan(run.bph!.waveId).length;
}

test("the 15:00 director keeps the 3-minute boss rhythm 1, 1, 2, 2, then a final three at 13:30", () => {
  const plan = bphSurvivalPlan("WaveChapter1");
  const beats = new Map<number, boolean[]>();
  for (const entry of plan.filter(entry => entry.boss)) beats.set(entry.at, [...beats.get(entry.at) ?? [], entry.final]);

  expect(BPH_SURVIVAL_TABLE.duration).toBe(900);
  expect([...beats]).toEqual([[180, [false]], [360, [false]], [540, [false, false]], [720, [false, false]], [810, [true, true, true]]]);
  expect(BPH_SURVIVAL_TABLE.intensity.map(step => step.at)).toEqual([0, 60, 120, 180, 360, 480, 540, 720, 840]);
});

test("commander picks never repeat until all eight appeared, never repeat inside a group, and follow the seed", () => {
  const firstPicks = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) {
    const drawn = groups(createBphSurvival("WaveChapter1", seed)!, 12);
    const flat = drawn.flat();

    expect(drawn.map(group => group.length)).toEqual([1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 8, 8]);
    expect(new Set(flat.slice(0, 8)).size).toBe(8);
    for (const group of drawn) expect(new Set(group).size).toBe(group.length);
    expect(flat.every(id => (BPH_SURVIVAL_TABLE.commanders as readonly string[]).includes(id))).toBe(true);
    expect(groups(createBphSurvival("WaveChapter1", seed)!, 12)).toEqual(drawn);
    firstPicks.add(flat[0]);
  }

  expect(firstPicks.size).toBe(8);
});

test("the main RNG reaches the first boss moment exactly as on 0f412af", () => {
  // Values recorded by running 0f412afcb4b47a3f5727eb5ca2cd6539753ff16b with the same fortified setup,
  // re-recorded for the gate in every survival wall (owner DM 1794899184.599879); south-gate-only still gives the old values.
  for (const [chapter, rng, kills, enemies] of [[0, 2634912272, 21, 168], [3, 4233442197, 0, 168]] as const) {
    const run = fortified(7, chapter);

    for (let tick = 0; tick < 3598; tick++) advance(run, .05);

    expect({ rng: run.rng, kills: run.kills, enemies: run.enemies.length }).toEqual({ rng, kills, enemies });
  }
});

test("each boss moment fields this run's drawn commanders with the slot's scaling", () => {
  const run = fortified(11), state = survival(run);
  for (const [group, at] of [[2, 540], [3, 720]] as const) {
    before(run, at);

    advance(run, .1);

    const bosses = run.enemies.filter(enemy => enemy.boss);
    expect(bosses.map(enemy => enemy.bphProfileId).sort()).toEqual([...bphSurvivalBossGroup(state, group)].sort());
    expect(bosses.every(enemy => enemy.appearedAt === at && enemy.bossArt)).toBe(true);
  }
});

const witchless = Array.from({ length: 50 }, (_, index) => index + 1)
  .find(seed => !bphSurvivalBossGroup(createBphSurvival("WaveChapter1", seed)!, 4).includes("Boss3_Witch")) ?? 1;
function slay(run: Run, enemy: Run["enemies"][number]): void {
  enemy.hp = .001;
  hitBphEnemy(run, enemy.id);
}
function overtime(): { run: Run; finals: Run["enemies"] } {
  const run = fortified(witchless), state = survival(run);
  before(run, 810);
  advance(run, .1);
  const finals = run.enemies.filter(enemy => enemy.boss);
  expect(finals.map(enemy => enemy.bphProfileId).sort()).toEqual([...bphSurvivalBossGroup(state, 4)].sort());
  state.cursor = bphSurvivalPlan(run.bph!.waveId).length;
  run.time = 899.95; run.enemies = [...finals];
  advance(run, .1);
  return { run, finals };
}

test("15:00 does not win while a final commander stands; the run continues until the last one falls", () => {
  const { run, finals } = overtime();

  expect(run.phase).toBe("playing");
  expect(run.time).toBeGreaterThan(900);
  for (const enemy of finals.slice(0, -1)) slay(run, enemy);
  advance(run, .05);
  expect(run.phase).toBe("playing");

  slay(run, finals[finals.length - 1]);
  advance(run, .05);

  expect(run.phase).toBe("won");
  expect(run.metrics.bosses.filter(boss => boss.final).every(boss => boss.fallen !== null)).toBe(true);
});

test("the castle can still fall while the final commanders outlast 15:00", () => {
  const { run } = overtime();
  run.base = 0;

  advance(run, .05);

  expect(run.phase).toBe("lost");
});

test("felled finals let 15:00 win on the exact deadline, and endless continues the same battle", () => {
  const run = fortified(witchless), state = survival(run);
  before(run, 810);
  advance(run, .1);
  for (const enemy of run.enemies.filter(enemy => enemy.boss)) slay(run, enemy);
  state.cursor = bphSurvivalPlan(run.bph!.waveId).length;
  run.time = 899.95;

  advance(run, .1);

  expect(run.time).toBe(900);
  expect(run.phase).toBe("won");

  enterEndless(run);
  for (let tick = 0; tick < 200; tick++) advance(run, .05);

  expect(run.phase).toBe("playing");
  expect(run.time).toBeCloseTo(910, 6);
  expect(run.enemies.length).toBeGreaterThan(0);

  run.time = 1079.95; run.enemies = [];
  advance(run, .1);

  const group = run.enemies.filter(enemy => enemy.boss);
  expect(group.map(enemy => enemy.bphProfileId).sort()).toEqual([...bphSurvivalBossGroup(state, 5)].sort());
  expect(group).toHaveLength(4);

  run.base = 0;
  advance(run, .05);

  expect(run.phase).toBe("lost");
});

test("endless keeps rising every three minutes beyond the last table step", () => {
  const last = BPH_SURVIVAL_TABLE.intensity.at(-1)!;
  const steps = [900, 1079, 1080, 1260].map(bphSurvivalEndlessIntensity);

  expect(steps.map(step => step.count)).toEqual([last.count + 18, last.count + 18, last.count + 36, last.count + 54].map(count => 10 * count));
  expect(steps[2].hp).toBeGreaterThan(steps[0].hp);
  expect(steps[3].castleDamage).toBeGreaterThan(steps[2].castleDamage);
});

test("an endless run saves only personal bests and survives a reload", () => {
  const stored = new Map<string, string>();
  Object.assign(globalThis, { localStorage: {
    getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value),
  } });
  try {
    const meta = freshMeta(), first = fortified(), second = fortified();
    first.time = 1234.6; first.kills = 300;
    second.time = 1000; second.kills = 410;

    expect(recordEndlessBest(meta, first)).toEqual({ seconds: 1234, kills: 300, improved: true });
    expect(recordEndlessBest(meta, second)).toEqual({ seconds: 1234, kills: 410, improved: true });
    expect(recordEndlessBest(meta, second)).toEqual({ seconds: 1234, kills: 410, improved: false });
    expect([meta.runs, meta.wins, meta.merit]).toEqual([0, 0, 0]);
    keepMeta(meta);
    expect(loadMeta().endlessBest).toEqual({ seconds: 1234, kills: 410 });
  } finally {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
});
