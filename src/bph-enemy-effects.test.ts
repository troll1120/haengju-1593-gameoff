import { expect, test } from "bun:test";
import type { BphEffect, BphFxContext } from "./bph-contract";
import { addBphProfile } from "./bph-combat";
import { BPH_MONSTERS } from "./bph-data";
import { infantryMultiplierAt } from "./bph-survival-data";
import { CENTER } from "./geometry";
import { bphEnemyStats, effectiveWaveInterval } from "./bph-enemy-effects";
import { bindBphConsumers, bphConsumers, bphFxContext, dispatchBphEffects } from "./bph-fx-dispatch";
import { createBphRun } from "./bph-session";
import { parseBphSave } from "./bph-save";
import { BPH_UPGRADE_GRIDS, BPH_UPGRADE_NODES } from "./bph-upgrade-data";
import { activeBphEffects, bphPlacementIsUpgrade } from "./bph-upgrades";
import { freshMeta } from "./meta";
import { advance } from "./rules";
import type { Run } from "./rules";
import { bphSurvivalBossGroup, bphSurvivalPlan } from "./bph-survival";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

const statRows = [
  ["Mod_MonsterHpAndDamage125", 2.25],
  ["Mod_MonsterHpAndDamage200", 3],
  ["Mod_MonsterHpAndDamage300", 4],
  ["Mod_MonsterHpAndDamage500", 6],
] as const;
const assigned = ["Mod_Accelerate", "Mod_Infestation", "Mod_Infestation3x",
  ...statRows.map(([id]) => id), "Mod_RiftUpgradeWaveSpeed"] as const;

function battle(upgrades: readonly BphEffect[] = []) {
  const run = createBphRun(freshMeta(), { seed: 144, general: "권율", upgrades });
  const context = bphFxContext(run);
  if (!context) throw new Error("Production battle must bind effects");
  return { run, context };
}

function firstSpawn(upgrades: readonly BphEffect[] = []) {
  const result = battle(upgrades);
  for (let frame = 0; frame < 60; frame++) {
    advance(result.run, 0.05);
    const enemy = result.run.enemies[0];
    if (enemy) return { ...result, enemy };
  }
  throw new Error("Authored chapter must spawn its first monster");
}

const BOSS_TIMES = BPH_SURVIVAL_TABLE.bosses.flatMap(beat => Array.from({ length: beat.count }, () => beat.at));
const FIRST_ARRIVAL = 30 / (180 + 1); // 90 authored slots at the opening 2x density.
const plan = bphSurvivalPlan("WaveChapter1");
const regularSlots = plan.filter(entry => !entry.boss && !entry.elite && !entry.rush);
const fixedCount = plan.length - regularSlots.length;
const BATCH = BPH_SURVIVAL_TABLE.batchSeconds;
const regularByBatch = Array.from({ length: BPH_SURVIVAL_TABLE.duration / BATCH },
  (_, batch) => regularSlots.filter(slot => Math.floor(slot.at / BATCH) === batch));
/** The authored slots the cadence projection emits over the finite run, with their game times:
 * `speed` stretches the projected clock and `countMultiplier` repeats each batch's slots. */
function emittedSlots(speed: number, countMultiplier: number) {
  const out: { entry: typeof plan[number]; at: number }[] = [];
  regularByBatch.forEach((base, batch) => {
    const count = base.length * countMultiplier, first = BATCH / (base.length + 1), duration = BATCH - first;
    const after = batch * BATCH * speed, through = (batch + 1) * BATCH * speed;
    for (let cycle = Math.floor(after / BATCH); cycle <= Math.floor(through / BATCH); cycle++)
      for (let index = 0; index < count; index++) {
        const at = cycle * BATCH + first + index * duration / count;
        if (at > after + 1e-9 && at <= through + 1e-9) out.push({ entry: base[index % base.length], at: at / speed });
      }
  });
  return out;
}
/** Profiles those slots field. An ordinary spear slot fields the infantryFile ramp's bodies at its game
 * time (3dbe2b7d), carrying the fractional remainder to the next spear slot (3dbe2b7d, state.infantryCarry). */
function fieldedProfiles(speed: number, countMultiplier: number): string[] {
  const ids: string[] = [];
  let carry = 0;
  for (const { entry, at } of emittedSlots(speed, countMultiplier)) {
    let bodies = 1;
    if (entry.kind === "yari" && !entry.ladder) {
      const budget = infantryMultiplierAt(at) + carry;
      bodies = Math.floor(budget);
      carry = budget - bodies;
    }
    for (let body = 0; body < bodies; body++) ids.push(entry.profileId);
  }
  return ids;
}
const CHAPTER_ONE_ESCORT_COUNT = 1108; // Five beats: 18×3, 22×7, 26×10, 30×10, and 34×10.
const drawnBosses = (run: Run) => BPH_SURVIVAL_TABLE.bosses.flatMap((_, group) => [...bphSurvivalBossGroup(run.bph!.survival!, group)]);
function waveTrace(upgrades: readonly BphEffect[], dt: number) {
  const { run, context } = battle(upgrades);
  const spawns: { profileId: string; boss: boolean; escort: boolean; at: number }[] = [];
  const minibossTimes: number[] = [];
  run.base = run.maxBase = 1e6;
  for (const side of Object.keys(run.walls)) Reflect.set(run.walls, side, 1e6);
  bindBphConsumers(context, [...bphConsumers(), {
    id: "quests", kinds: [],
    onEvent(ctx, event) {
      if (event.kind === "enemy-spawn" && event.enemy.bphProfileId) {
        if (event.enemy.miniboss) minibossTimes.push(Math.round(ctx.run.time));
        else spawns.push({ profileId: event.enemy.bphProfileId, boss: event.enemy.boss,
          escort: event.enemy.commanderEscort === true, at: ctx.run.time });
      }
    },
    consume() { throw new Error("Spawn observer has no effect kinds"); },
  }], false);
  for (let frame = 0; frame <= Math.ceil(BPH_SURVIVAL_TABLE.duration / dt) && run.phase === "playing"; frame++) {
    advance(run, dt);
    // Observe scheduling independently of combat survival and field accumulation;
    // a cleared boss counts as fallen so the final group cannot hold the 15:00 win.
    run.enemies = [];
    for (const boss of run.metrics.bosses) boss.fallen ??= run.time;
  }
  expect(minibossTimes).toEqual([75, 150, 225, 300, 365, 430, 495, 560, 625, 680, 735, 790, 845]);
  return { spawns, run };
}

for (const [id, multiplier] of statRows) {
  test(`${id} projects original HP onto a real spawned monster without compounding on replay`, () => {
    const { run, enemy } = firstSpawn(BPH_UPGRADE_NODES[id].effects);
    const base = BPH_MONSTERS.Monster1_Caveling;
    // The opening slot fields one spear body (infantryFile ramp, 3dbe2b7d) that carries the slot's whole HP.
    const file = infantryMultiplierAt(plan[0].at);
    const hp = base.hp * multiplier * plan[0].hp / file;
    expect(run.enemies.map(member => member.hp)).toEqual(Array.from({ length: file }, () => hp));
    expect(enemy.hp).toBe(hp);
    enemy.hp -= 0.5;
    dispatchBphEffects(run, { kind: "enemy-spawn", enemy });
    expect(enemy.hp).toBe(hp - 0.5);
    expect(base.hp).toBe(2);
  });

  test(`${id} changes actual allied-unit HP loss using the original attack multiplier`, () => {
    const { run, enemy } = firstSpawn(BPH_UPGRADE_NODES[id].effects);
    // Survival enemies only fight inside the visible field (0369ee9e); the spawn point lies outside it.
    const field = { x: CENTER.x, y: CENTER.y - 150 };
    enemy.x = field.x; enemy.y = field.y;
    addBphProfile(run, { profileId: "Hero3_DemonSlayer", copies: 1, foil: false, discovered: false },
      { packId: "Pack1_Basic", position: field });
    const unit = run.squads[0].soldiers[0];
    const before = unit.hp;
    enemy.hp = enemy.maxHp = 1000;
    enemy.prey = [0, 0]; enemy.strikeAt = run.time + 0.01;
    enemy.clock = 1000; enemy.skillClock = 1000;
    advance(run, 0.05);
    // A file body keeps the slot's full attack on troops (owner 2026-11-19, castle 1036).
    expect(before - unit.hp).toBeCloseTo(BPH_MONSTERS.Monster1_Caveling.damage * multiplier * plan[0].unitDamage, 10);
  });

  test(`${id} preserves the original positive towerDamage override in actual wall HP loss`, () => {
    const { run, enemy } = firstSpawn(BPH_UPGRADE_NODES[id].effects);
    enemy.x = enemy.goalX; enemy.y = enemy.goalY;
    enemy.clock = 0; enemy.strikeAt = 0; enemy.skillClock = 1000;
    const before = Object.values(run.walls).reduce((sum, hp) => sum + hp, 0);
    advance(run, 0.05);
    const after = Object.values(run.walls).reduce((sum, hp) => sum + hp, 0);
    expect(before - after).toBeCloseTo(BPH_MONSTERS.Monster1_Caveling.towerDamage * plan[0].castleDamage
      / infantryMultiplierAt(plan[0].at), 8);
  });
}

test("Mod_Accelerate halves the first survival arrival without moving the game clock", () => {
  const { run, enemy } = firstSpawn(BPH_UPGRADE_NODES.Mod_Accelerate.effects);
  expect(run.time).toBeCloseTo(Math.ceil(FIRST_ARRIVAL / 2 / .05) * .05, 10);
  expect(enemy.bphProfileId).toBe("Monster1_Caveling");
  expect(firstSpawn().run.time).toBeCloseTo(Math.ceil(FIRST_ARRIVAL / .05) * .05, 10);
});

for (const [id, multiplier] of [["Mod_Infestation", 2], ["Mod_Infestation3x", 3]] as const) {
  test(`${id} multiplies the survival regular roster while retaining the fixed boss beats`, () => {
    const slow = waveTrace(BPH_UPGRADE_NODES[id].effects, 0.1);
    const fast = waveTrace(BPH_UPGRADE_NODES[id].effects, 0.05);
    // Authored elite/rush threats keep their fixed beats; E1 multiplies ordinary slots.
    const expected = [...fieldedProfiles(1, multiplier),
      ...plan.filter(entry => entry.elite || entry.rush).map(entry => entry.profileId)].sort();
    for (const { spawns } of [slow, fast]) {
      expect(spawns.filter(s => !s.boss && !s.escort).map(s => s.profileId).sort()).toEqual(expected);
      expect(spawns.filter(s => s.escort)).toHaveLength(CHAPTER_ONE_ESCORT_COUNT);
    }
    expect(slow.spawns.filter(s => s.boss).map(s => s.profileId)).toEqual(drawnBosses(slow.run));
    for (const [index, boss] of slow.spawns.filter(spawn => spawn.boss).entries())
      expect(boss.at).toBeCloseTo(BOSS_TIMES[index], 8);
    expect(slow.spawns[0].at).toBeCloseTo(Math.ceil(FIRST_ARRIVAL / .1) * .1, 8);
    expect(slow.run.time).toBe(900);
    expect(slow.run.phase).toBe("won");
  });
}

test("active speed and count together preserve every spawn and remain reproducible with the same seed", () => {
  const effects = [...BPH_UPGRADE_NODES.Mod_Accelerate.effects, ...BPH_UPGRADE_NODES.Mod_Infestation3x.effects];
  const first = waveTrace(effects, 0.05);
  const replay = waveTrace(effects, 0.05);
  expect(first.spawns).toEqual(replay.spawns);
  expect(first.run.rng).toBe(replay.run.rng);
  expect(first.spawns.filter(spawn => !spawn.escort)).toHaveLength(fieldedProfiles(2, 3).length + fixedCount);
  expect(first.spawns.filter(spawn => spawn.escort)).toHaveLength(CHAPTER_ONE_ESCORT_COUNT);
  expect(first.spawns[0].at).toBeCloseTo(Math.ceil(FIRST_ARRIVAL / 2 / .05) * .05, 8);
  expect(first.run.time).toBe(900);
  expect(first.run.phase).toBe("won");
  for (const [index, boss] of first.spawns.filter(spawn => spawn.boss).entries())
    expect(boss.at).toBeCloseTo(BOSS_TIMES[index], 8);
  expect(first.run.bph?.fx.counters).not.toHaveProperty("enemies:through");
});

test("fractional speed scales regular count and keeps fixed bosses across tick sizes", () => {
  const effects: BphEffect[] = [{ nodeId: "fractional-cadence", type: "MonsterSpawnSpeed", value: .5,
    effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0, targets: {} }];

  const first = waveTrace(effects, .1), second = waveTrace(effects, .05);

  // A 1.5x clock visits one complete roster plus alternating halves of each 30-second roster;
  // the spear files those slots field follow the infantryFile ramp at each slot's game time.
  const expected = fieldedProfiles(1.5, 1).length + fixedCount - BOSS_TIMES.length;
  for (const { spawns } of [first, second]) {
    expect(spawns.filter(spawn => !spawn.boss && !spawn.escort)).toHaveLength(expected);
    expect(spawns.filter(spawn => spawn.escort)).toHaveLength(CHAPTER_ONE_ESCORT_COUNT);
  }
  expect(first.spawns.filter(spawn => spawn.boss)).toHaveLength(BOSS_TIMES.length);
  expect(second.run.time).toBe(900);
});

for (const id of assigned) {
  test(`${id} grants no effect from an unplaced definition ID, including after save reload`, () => {
    const { context } = battle();
    context.save.purchasedNodes.push(id);
    const reloaded = parseBphSave(JSON.parse(JSON.stringify(context.save)));
    if (!reloaded) throw new Error("Valid production save must reload");
    expect(activeBphEffects(reloaded)).toEqual([]);
    expect(bphEnemyStats(context, { profileId: "Monster1_Caveling" })).toEqual(BPH_MONSTERS.Monster1_Caveling);
    context.run.time = 0.05;
    expect(effectiveWaveInterval(context, 0.05)).toEqual({ after: 0, through: 0.05 });
    expect(context.state.counters).not.toHaveProperty("enemies:through");
  });
}

const chaosPlacements = BPH_UPGRADE_GRIDS.flatMap(grid => grid.id === "_SkillTreeChaos" ? grid.placements : []);
const chaosUpgrades = chaosPlacements.filter(p => bphPlacementIsUpgrade(p.id)).map(p => p.id);
for (const purchases of [0, 3, 4, 7, 8]) {
  test(`Mod_RiftUpgradeWaveSpeed uses ${purchases} actual type-0 purchases in its own dormant rift contract`, () => {
    const { run, context } = battle(BPH_UPGRADE_NODES.Mod_RiftUpgradeWaveSpeed.effects);
    if (!run.bph) throw new Error("Production battle is required");
    const saved = [...chaosUpgrades.slice(0, purchases),
      ...chaosPlacements.filter(p => !bphPlacementIsUpgrade(p.id)).map(p => p.id)];
    context.save.purchasedPlacements = [...saved, ...saved];
    context.save.purchasedNodes = [...assigned];
    const dormant: BphFxContext = { ...context, run: { ...run, time: 0.1,
      bph: { ...run.bph, waveId: "WaveRiftChaos", survival: null } } };
    const beforeRng = run.rng;
    const interval = effectiveWaveInterval(dormant, 0.1);
    expect(interval.through).toBeCloseTo(0.1 * (1 + Math.floor(purchases / 4) * 0.10000000149011612), 12);
    expect(run.rng).toBe(beforeRng);
  });
}

test("Mod_RiftUpgradeWaveSpeed ignores purchases outside its matching wave and grid", () => {
  const { run, context } = battle(BPH_UPGRADE_NODES.Mod_RiftUpgradeWaveSpeed.effects);
  context.save.purchasedPlacements = chaosUpgrades;
  run.time = 0.1;
  const beforeRng = run.rng;
  expect(effectiveWaveInterval(context, 0.1)).toEqual({ after: 0, through: 0.1 });
  expect(run.rng).toBe(beforeRng);
});
