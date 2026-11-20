// Preview-only test bench rules (`?sandbox=1`). Every action goes through the game's own entry points;
// nothing here is imported by the product build.
import type { Meta } from "../meta";
import type { BphGeneral } from "../bph-commanders";
import { BPH_GENERALS } from "../bph-commanders";
import { BPH_CLASS_BODY, BPH_SCALE } from "../bph-combat";
import { BPH_MONSTERS, BPH_PROFILES, BPH_TOMES, BPH_WAVES } from "../bph-data";
import { bphFxContext, dispatchBphEffects } from "../bph-fx-dispatch";
import { createBphRun, ensureBphSave } from "../bph-session";
import { bphSurvivalIntensity, bphSurvivalPlan } from "../bph-survival";
import { BPH_SURVIVAL_TABLE, bphSurvivalChapter } from "../bph-survival-data";
import { activeBphEffects, BPH_PLACEMENTS, BPH_UPGRADE_NODES, bphPlacementIsUpgrade } from "../bph-upgrades";
import type { BphWaveId } from "../bph-waves";
import { bphEnemyMapping } from "../bph-waves";
import { BOSSES } from "../bosses";
import { clearChaos } from "../chaos";
import { CHAOS_LEVELS } from "../chaos-contract";
import { chaosLevelXp } from "../chaos-growth";
import { fortRect } from "../geometry";
import type { Direction, Point } from "../geometry";
import { advance, spawn, units, useSkill } from "../rules";
import type { Effect, Enemy, Run } from "../rules";

export const TICK = 1 / 30;
export const CHAPTERS: readonly BphWaveId[] = ["WaveChapter1", "WaveChapter2", "WaveChapter3", "WaveChapter4"];
export const UNIT_IDS: readonly string[] = Object.keys(BPH_PROFILES);
export const TOME_IDS: readonly string[] = Object.keys(BPH_TOMES);
export const ENEMY_IDS: readonly string[] = Object.keys(BPH_MONSTERS);
export const isBoss = (id: string) => Boolean(bphEnemyMapping(id)?.bossId);

export function chapterEnemies(chapter: number): readonly string[] {
  const waveId = CHAPTERS[chapter - 1];
  const ids = new Set<string>(BPH_WAVES[waveId].flatMap(burst => burst.id ? [burst.id] : []));
  // Since the 15:00 contract (ba634d8) every chapter's bosses are drawn from the eight commanders.
  if (bphSurvivalChapter(waveId)) for (const boss of BPH_SURVIVAL_TABLE.commanders) ids.add(boss);
  return ENEMY_IDS.filter(id => ids.has(id));
}

export type UpgradePreset = "none" | "typical" | "full" | "custom";
export function upgradePlacements(): readonly string[] {
  return [...BPH_PLACEMENTS.keys()].filter(bphPlacementIsUpgrade);
}
const masteryCost = (id: string) => {
  const nodeId = BPH_PLACEMENTS.get(id)?.nodeId;
  return nodeId ? BPH_UPGRADE_NODES[nodeId]?.costs.mastery ?? 0 : 0;
};
/** none: nothing; typical: the cheapest third of the upgrade tree by mastery cost; full: every upgrade. */
export function presetPlacements(preset: Exclude<UpgradePreset, "custom">): readonly string[] {
  const all = upgradePlacements();
  if (preset === "none") return [];
  if (preset === "full") return all;
  return [...all].sort((a, b) => masteryCost(a) - masteryCost(b) || a.localeCompare(b)).slice(0, Math.ceil(all.length / 3));
}

export type BenchSetup = {
  readonly general: BphGeneral; readonly chapter: number; readonly placements: readonly string[];
  readonly gold: number; readonly seed: number;
};
/** A survival run on a detached copy of the account: the real save object is never touched. */
export function benchRun(meta: Meta, setup: BenchSetup): Run {
  const copy = structuredClone(meta);
  const save = ensureBphSave(copy);
  save.purchasedPlacements = [...setup.placements];
  save.purchasedNodes = setup.placements.flatMap(id => BPH_PLACEMENTS.get(id)?.nodeId ?? []);
  save.relicState = { ...save.relicState, equipped: [] };
  save.chapter = Math.max(0, Math.min(CHAPTERS.length, setup.chapter) - 1);
  const run = createBphRun(copy, { seed: setup.seed, general: setup.general, upgrades: activeBphEffects(save) });
  run.gold = save.coins = setup.gold;
  return run;
}

export function gatePoint(run: Run): Point {
  const wall = fortRect(run.fort);
  return { x: (wall.left + wall.right) / 2, y: wall.bottom + 18 };
}
/** Units and tomes both enter through the run's bound spawnProfile; a tome starts on the next step. */
export function spawnProfiles(run: Run, profileId: string, copies: number): void {
  const context = bphFxContext(run);
  if (!context || copies < 1) return;
  const profile = BPH_PROFILES[profileId];
  const river = profile && BPH_CLASS_BODY[profile.classId] === "panokseon";
  context.spawnProfile(profileId, copies, { packId: "DeliveryBox", cause: "effect",
    ...(profile && !river ? { position: gatePoint(run) } : {}) });
}

/** 0 turns army chaos off: the state is owned by a general who is not on the field, so no chaos context exists. */
export function setChaosLevel(run: Run, level: number): void {
  const general = BPH_GENERALS.find(name => name === run.commander);
  if (!general) return;
  const wanted = Math.max(0, Math.min(20, Math.round(level)));
  const spare: BphGeneral = general === "이순신" ? "신립" : "이순신";
  const owner = CHAOS_LEVELS[general][wanted] ? general : spare;
  const mods = CHAOS_LEVELS[owner][Math.max(1, wanted)];
  if (!mods) return;
  const previous = run.chaos;
  clearChaos(run);
  const tick = previous?.tick ?? 0;
  run.chaos = { general: owner, level: wanted, manualLevel: true, mods, tick, remainder: previous?.remainder ?? 0,
    xp: chaosLevelXp(Math.max(1, wanted)), hitXp: {}, feedWindow: -1, feeds: 0,
    attacks: previous?.attacks ?? 0, rangedAttacks: previous?.rangedAttacks ?? 0, kills: previous?.kills ?? 0,
    trails: [], rings: [], pools: [], militia: [], fleet: [], orbitHits: {}, pendingMilitia: [], pendingTrails: [], stomps: [],
    nextFleetTick: mods.general === "이순신" ? tick + mods.every : 0,
    nextBeltTick: mods.general === "김시민" ? tick + mods.every : 0, militiaGroup: 0 };
}
export function chaosLevel(run: Run): number { return run.chaos?.level ?? 0; }

export function fireSkill(run: Run, cast: (squad: number) => void = squad => { useSkill(run, squad); }): boolean {
  const squad = run.squads[0];
  if (!squad) return false;
  const before = squad.usedAt;
  squad.skillClock = 0;
  cast(0);
  return squad.usedAt !== before;
}

/** Same BPH stat adaptation as spawnBphSurvival, at the current survival intensity. Bosses use full (final) HP. */
export function spawnEnemies(run: Run, profileId: string, count: number, side: Direction): Effect[] {
  const battle = run.bph, data = BPH_MONSTERS[profileId], mapping = bphEnemyMapping(profileId);
  const effects: Effect[] = [];
  if (!battle || !data || !mapping) return effects;
  const chapter = bphSurvivalChapter(battle.waveId) ?? { hp: 1, unitDamage: 1, castleDamage: 1 };
  const intensity = bphSurvivalIntensity(run.time), boss = Boolean(mapping.bossId);
  const transports = new Set<Enemy>();
  for (let i = 0; i < count; i++) {
    const enemy = spawn(run, false, boss, mapping.bossId ? BOSSES[mapping.bossId].pattern : undefined, false, side);
    const nativeHp = enemy.maxHp;
    enemy.bphProfileId = profileId; enemy.kind = mapping.kind;
    enemy.hp = enemy.maxHp = data.hp * BPH_SCALE.hp * chapter.hp * intensity.hp;
    enemy.speed = data.moveSpeed * BPH_SCALE.movement;
    enemy.shielded = false; enemy.ladder = false;
    if (battle.survival) battle.survival.damage[enemy.id] = {
      unit: chapter.unitDamage * intensity.unitDamage, castle: chapter.castleDamage * intensity.castleDamage };
    if (mapping.bossId) {
      enemy.bossArt = mapping.bossId; enemy.appearedAt = run.time;
      run.metrics.bosses.push({ art: mapping.bossId, final: false, appeared: run.time, fallen: null, phase2: null, dealt: 0 });
      effects.push({ kind: "boss-enter", x: enemy.x, y: enemy.y, value: 2, target: enemy.id });
    }
    dispatchBphEffects(run, { kind: "enemy-spawn", enemy });
    const boat = enemy.aboard && run.enemies.find(carrier => carrier.cargo?.includes(enemy));
    if (boat) {
      const adjustment = (enemy.maxHp - nativeHp) * (boat.hull ?? .5);
      boat.hp += adjustment; boat.maxHp += adjustment;
      transports.add(boat);
    }
  }
  // A manual batch is complete even if smaller than the normal wave's boat capacity.
  for (const boat of transports) boat.sailing = true;
  return effects;
}
export function clearEnemies(run: Run): void {
  run.enemies = [];
  run.telegraphs = [];
}
/** While waves are held, the survival plan cursor is moved past everything due through the next tick. */
export function holdWaves(run: Run, through: number): void {
  const battle = run.bph, state = battle?.survival;
  if (!battle || !state) return;
  const plan = bphSurvivalPlan(battle.waveId);
  while (state.cursor < plan.length && plan[state.cursor].at <= through) state.cursor++;
}

export type BenchClock = {
  paused: boolean; speed: number; steps: number; accumulator: number;
  wavesHeld: boolean; generalInvincible: boolean; castleInvincible: boolean;
  dealt: number; samples: { time: number; dealt: number }[];
};
export const freshClock = (): BenchClock => ({ paused: false, speed: 1, steps: 0, accumulator: 0,
  wavesHeld: false, generalInvincible: false, castleInvincible: true, dealt: 0, samples: [] });

function guard(run: Run, clock: BenchClock): void {
  const general = run.squads[0];
  if (clock.generalInvincible && general) { general.hp = general.maxHp; general.downUntil = 0; }
  if (clock.castleInvincible) {
    run.base = run.maxBase;
    if (run.phase === "lost") { run.phase = "playing"; run.lossCause = null; }
  }
}
export function benchTick(run: Run, clock: BenchClock): Effect[] {
  if (clock.wavesHeld) holdWaves(run, run.time + TICK + 1e-9);
  guard(run, clock);
  const before = new Map(run.enemies.map(enemy => [enemy.id, enemy.hp]));
  const effects = advance(run, TICK);
  guard(run, clock);
  const after = new Map(run.enemies.map(enemy => [enemy.id, enemy.hp]));
  for (const [id, hp] of before) clock.dealt += Math.max(0, hp - Math.max(0, after.get(id) ?? 0));
  clock.samples.push({ time: run.time, dealt: clock.dealt });
  while (clock.samples.length > 2 && clock.samples[1].time <= run.time - 5) clock.samples.shift();
  return effects;
}
export function benchAdvance(run: Run, clock: BenchClock, seconds: number): Effect[] {
  if (!clock.paused) clock.accumulator += Math.min(seconds, .1) * clock.speed;
  let ticks = Math.floor(clock.accumulator / TICK + 1e-9);
  clock.accumulator = Math.max(0, clock.accumulator - ticks * TICK);
  ticks += clock.steps; clock.steps = 0;
  const effects: Effect[] = [];
  for (let i = 0; i < ticks; i++) effects.push(...benchTick(run, clock));
  return effects;
}

export function benchStats(run: Run, clock: BenchClock) {
  const allies = run.squads.flatMap(units);
  const first = clock.samples[0], last = clock.samples.at(-1);
  const window = first && last ? last.time - first.time : 0;
  return {
    time: run.time, allies: allies.filter(unit => unit.hp > 0).length,
    hp: allies.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0),
    maxHp: allies.reduce((sum, unit) => sum + unit.maxHp, 0),
    dealt: clock.dealt, dps: window > 0 && first && last ? (last.dealt - first.dealt) / window : 0,
    kills: run.kills, enemies: run.enemies.length, base: run.base, maxBase: run.maxBase, phase: run.phase,
  };
}
