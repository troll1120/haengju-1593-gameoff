import { beforeAll, expect, test } from "bun:test";
import { freshMeta } from "../meta";
import { aliveBphTomes } from "../bph-active-tomes";
import { bphFxContext } from "../bph-fx-dispatch";
import { activeBphEffects, prepareBphUpgrades } from "../bph-upgrades";
import { CHAOS_LEVELS } from "../chaos-contract";
import { chaosContext } from "../chaos-state";
import { ensureBphSave } from "../bph-session";
import { benchAdvance, benchRun, benchStats, benchTick, chapterEnemies, clearEnemies, ENEMY_IDS, fireSkill, freshClock,
  gatePoint, isBoss, presetPlacements, setChaosLevel, spawnEnemies, spawnProfiles, TICK, TOME_IDS, UNIT_IDS } from "./bench";
import type { BenchSetup } from "./bench";

beforeAll(() => prepareBphUpgrades());
const setup = (extra: Partial<BenchSetup> = {}): BenchSetup =>
  ({ general: "권율", chapter: 1, placements: [], gold: 500, seed: 1593, ...extra });

test("bench runs use a detached account copy and the chosen upgrade preset", () => {
  const meta = freshMeta(), before = JSON.stringify(meta);
  const none = presetPlacements("none"), typical = presetPlacements("typical"), full = presetPlacements("full");
  expect(none).toHaveLength(0);
  expect(typical.length).toBeGreaterThan(0);
  expect(full.length).toBeGreaterThan(typical.length);
  const run = benchRun(meta, setup({ placements: full, gold: 777, chapter: 3 }));
  expect(JSON.stringify(meta)).toBe(before);
  expect(run.gold).toBe(777);
  expect(run.bph?.waveId).toBe("WaveChapter3");
  const save = ensureBphSave(structuredClone(meta));
  save.purchasedPlacements = [...full];
  expect(run.bph?.upgrades).toEqual(activeBphEffects(save));
});

test("every troop profile, variants included, spawns the requested count at the gate", () => {
  const run = benchRun(freshMeta(), setup());
  const gate = gatePoint(run);
  for (const id of UNIT_IDS) {
    const before = run.squads[0].soldiers.length;
    spawnProfiles(run, id, 2);
    const added = run.squads[0].soldiers.slice(before).filter(unit => unit.bph?.birthProfileId === id);
    expect(added.length, id).toBe(2);
    if (added[0].kind !== "panokseon") expect({ x: added[0].x, y: added[0].y }, id).toEqual(gate);
  }
});

test("every tome activates on the next tick", () => {
  for (const id of TOME_IDS) {
    const run = benchRun(freshMeta(), setup()), clock = freshClock();
    spawnProfiles(run, id, 1);
    benchTick(run, clock);
    const context = bphFxContext(run);
    if (!context) throw new Error("bench run lost its effect context");
    expect(aliveBphTomes(context).map(tome => tome.id), id).toContain(id);
  }
});

test("chaos level override holds through ticks and 0 disables army chaos", () => {
  const run = benchRun(freshMeta(), setup({ general: "신립" })), clock = freshClock();
  setChaosLevel(run, 12);
  for (let i = 0; i < 30; i++) benchTick(run, clock);
  expect(run.chaos?.level).toBe(12);
  expect(run.chaos?.mods).toBe(CHAOS_LEVELS.신립[12]!);
  expect(chaosContext(run, [])).toBeDefined();
  setChaosLevel(run, 0);
  benchTick(run, clock);
  expect(run.chaos?.level).toBe(0);
  expect(chaosContext(run, [])).toBeUndefined();
});

test("fire skill casts immediately and the invincible general cannot fall", () => {
  const run = benchRun(freshMeta(), setup()), clock = freshClock();
  expect(fireSkill(run)).toBe(false);
  spawnEnemies(run, chapterEnemies(1)[0], 3, "위");
  for (let i = 0; i < 30; i++) benchTick(run, clock);
  run.squads[0].skillClock = 99;
  expect(fireSkill(run)).toBe(true);
  expect(run.squads[0].usedAt).toBe(run.time);
  expect(run.squads[0].skillClock).toBeGreaterThan(0);
  clock.generalInvincible = true;
  run.squads[0].hp = 1;
  benchTick(run, clock);
  expect(run.squads[0].hp).toBe(run.squads[0].maxHp);
});

test("enemy spawns honour type, count and side; bosses are recorded; clear removes them", () => {
  const run = benchRun(freshMeta(), setup());
  const regular = chapterEnemies(1).find(id => !isBoss(id)), boss = ENEMY_IDS.find(isBoss);
  if (!regular || !boss) throw new Error("no enemy ids");
  spawnEnemies(run, regular, 6, "좌");
  expect(run.enemies.filter(enemy => enemy.bphProfileId === regular && enemy.direction === "좌")).toHaveLength(6);
  const effects = spawnEnemies(run, boss, 1, "위");
  expect(effects.some(effect => effect.kind === "boss-enter")).toBe(true);
  expect(run.metrics.bosses).toHaveLength(1);
  clearEnemies(run);
  expect(run.enemies).toHaveLength(0);
});

test("held waves stop the survival plan while live waves keep arriving", () => {
  const held = benchRun(freshMeta(), setup()), live = benchRun(freshMeta(), setup());
  const heldClock = { ...freshClock(), wavesHeld: true }, liveClock = freshClock();
  for (let i = 0; i < 20 * 30; i++) { benchTick(held, heldClock); benchTick(live, liveClock); }
  expect(held.enemies).toHaveLength(0);
  expect(live.enemies.length + live.kills).toBeGreaterThan(0);
});

test("pause, single step and speed drive the real fixed tick", () => {
  const run = benchRun(freshMeta(), setup()), clock = freshClock();
  clock.paused = true;
  benchAdvance(run, clock, .1);
  expect(run.time).toBe(0);
  clock.steps = 1;
  benchAdvance(run, clock, .1);
  expect(run.time).toBeCloseTo(TICK, 9);
  clock.paused = false; clock.speed = 3;
  benchAdvance(run, clock, .1);
  expect(run.time).toBeCloseTo(TICK * 10, 9);
  clock.speed = .25;
  for (let i = 0; i < 4; i++) benchAdvance(run, clock, .1);
  expect(run.time).toBeCloseTo(TICK * 13, 9);
});

test("live stats count enemy HP removed, DPS over the last five seconds and kills", () => {
  const run = benchRun(freshMeta(), setup()), clock = { ...freshClock(), wavesHeld: true };
  spawnProfiles(run, "Hero1_Archer", 6);
  const target = chapterEnemies(1).find(id => !isBoss(id));
  if (!target) throw new Error("no enemy id");
  spawnEnemies(run, target, 8, "아래");
  for (let i = 0; i < 25 * 30; i++) benchTick(run, clock);
  const stats = benchStats(run, clock);
  expect(stats.dealt).toBeGreaterThan(0);
  expect(stats.kills).toBeGreaterThan(0);
  expect(stats.dps).toBeGreaterThanOrEqual(0);
  expect(stats.maxHp).toBeGreaterThan(0);
});
