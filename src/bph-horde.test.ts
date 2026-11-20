import { expect, test } from "bun:test";
import { BPH_MONSTERS } from "./bph-data";
import { bphSurvivalMonster, BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { bphSurvivalPlan, bphSurvivalIntensity } from "./bph-survival";
import { bphKillCoins } from "./bph-kill-drops";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { advance, generalHp, spawn } from "./rules";
import { addBphProfile } from "./bph-combat";
import { riverBank } from "./river";

test("survival commanders share one HP budget including both Witch bodies", () => {
  const budget = BPH_SURVIVAL_TABLE.commander;
  for (const id of BPH_SURVIVAL_TABLE.commanders) {
    const stats = bphSurvivalMonster(id);
    const hp = stats.hp + (id === "Boss3_Witch" ? bphSurvivalMonster("Boss3_Witch2").hp : 0);
    expect(hp).toBeCloseTo(budget.hp, 9);
    expect(stats.damage).toBeLessThanOrEqual(budget.hit);
    expect(stats.damage * stats.attackSpeed).toBeLessThanOrEqual(budget.dps + 1e-9);
    expect(stats.towerDamage * stats.attackSpeed).toBeLessThanOrEqual(budget.castleDps + 1e-9);
  }
  const second = bphSurvivalMonster("Boss3_Witch2");
  expect(second.damage * second.attackSpeed).toBeLessThanOrEqual(budget.dps + 1e-9);
  expect(BPH_MONSTERS.Boss4_Forger.hp).toBe(35000);
  expect(BPH_MONSTERS.Boss9_Final.damage).toBe(120);
  expect(bphSurvivalMonster("Monster1_Caveling")).toBe(BPH_MONSTERS.Monster1_Caveling);
});

test("early pressure changes from mass infantry to an elite and two charging groups", () => {
  const plan = bphSurvivalPlan("WaveChapter1"), beat = BPH_SURVIVAL_TABLE.earlyThreats;
  const ordinary = plan.filter(entry => !entry.boss && !entry.elite && !entry.rush);
  expect(ordinary.filter(entry => entry.at < 60).length).toBeGreaterThanOrEqual(48 * 4);
  expect(ordinary.filter(entry => entry.at < 180).every(entry => entry.hp < 1)).toBe(true);
  expect(plan.filter(entry => entry.elite).map(entry => entry.at)).toEqual([beat.eliteAt]);
  for (const at of [beat.rushAt, beat.rushAgain]) {
    const rush = plan.filter(entry => entry.rush && entry.at === at);
    expect(rush).toHaveLength(beat.rushCount * 2);
    expect(rush.every(entry => entry.profileId === "Monster3_Shadow" && !entry.boss)).toBe(true);
  }
  expect(plan.filter(entry => entry.boss)[0].at).toBe(180);
  expect(BPH_SURVIVAL_TABLE.duration).toBe(900);
});

test("kill wages depend on elapsed time rather than the number of weak enemies", () => {
  const collect = (killsPerSecond: number) => {
    const run = createBphRun(freshMeta(), { seed: 1, general: "권율", upgrades: [], startBattle: false });
    let coins = 0;
    for (let second = 0; second <= 180; second++) {
      run.time = second;
      for (let kill = 0; kill < killsPerSecond; kill++) coins += bphKillCoins(run, 3);
    }
    return coins;
  };
  expect(collect(1)).toBe(collect(100));
  expect(collect(1)).toBeLessThanOrEqual(
    BPH_SURVIVAL_TABLE.killCoins.burst + 180 * BPH_SURVIVAL_TABLE.killCoins.perSecond);
});

test("idle time cannot bank a later army-sized kill payout", () => {
  const run = createBphRun(freshMeta(), { seed: 1, general: "권율", upgrades: [], startBattle: false });
  run.time = 180;
  expect(bphKillCoins(run, 1000)).toBe(BPH_SURVIVAL_TABLE.killCoins.burst);
  expect(bphKillCoins(run, 1000)).toBe(0);
});

test("survival HP follows the actual general level and preserves the current health share", () => {
  const run = createBphRun(freshMeta(), { seed: 1, general: "권율", upgrades: [], startBattle: false });
  const squad = run.squads[0];
  if (!run.bph?.survival) throw new Error("Expected survival fixture");
  run.bph.survival.cursor = bphSurvivalPlan(run.bph.waveId).length;
  run.time = 199.975;
  squad.hurtAt = run.time;
  advance(run, .01);
  expect(run.chaos?.level).toBe(2);
  expect(squad.maxHp).toBeCloseTo(generalHp("권율", 2) * BPH_SURVIVAL_TABLE.generalHpScale, 8);
  squad.hp = squad.maxHp / 2;
  advance(run, .05);
  expect(run.level).toBe(1);
  expect(run.chaos?.level).toBe(3);
  expect(squad.maxHp).toBeCloseTo(generalHp("권율", 3) * BPH_SURVIVAL_TABLE.generalHpScale, 8);
  expect(squad.hp / squad.maxHp).toBeCloseTo(.5, 8);
});

test("a survival commander's ladder summons cannot escape into legacy HP and damage units", () => {
  const run = createBphRun(freshMeta(), { seed: 3, general: "권율", upgrades: [], startBattle: false });
  run.time = 179.95;
  const state = run.bph!.survival!;
  state.cursor = bphSurvivalPlan("WaveChapter1").findIndex(entry => entry.boss);
  run.squads = [];
  run.shieldUntil = Infinity;
  advance(run, .1);
  const boss = run.enemies.find(enemy => enemy.boss)!;
  boss.bossArt = "todo";
  boss.enraged = true;
  boss.casts = 0;
  boss.skillClock = 0;
  for (let tick = 0; tick < 100 && !run.enemies.some(enemy => enemy.ladder); tick++) advance(run, .05);
  const ladders = run.enemies.filter(enemy => enemy.ladder);
  expect(ladders).toHaveLength(6);
  for (const enemy of ladders) {
    expect(enemy.bphProfileId).toBe("Monster1_Raider");
    expect(enemy.maxHp).toBeCloseTo(BPH_MONSTERS.Monster1_Raider.hp * bphSurvivalIntensity(run.time).hp, 8);
    expect(state.damage[enemy.id].castle).toBe(bphSurvivalIntensity(run.time).castleDamage);
    expect(enemy.maxHp).toBeLessThan(10);
  }
});

test("a survival flagship volley cannot one-shot an unwounded basic recruit with native damage 10", () => {
  const run = createBphRun(freshMeta(), { seed: 1, general: "권율", upgrades: [], startBattle: false });
  run.bph!.survival!.cursor = Number.MAX_SAFE_INTEGER;
  const general = run.squads[0];
  general.x = general.homeX = general.targetX = 60;
  general.y = general.homeY = general.targetY = 100;
  addBphProfile(run, { profileId: "Hero1_Squire", copies: 1, foil: false, discovered: false },
    { packId: "Pack1_Basic" });
  const unit = general.soldiers[0];
  unit.x = 180; unit.y = riverBank() - 10;
  const passenger = spawn(run, false, false, undefined, false, "위");
  run.enemies = [{ ...passenger, id: run.nextId++, kind: "ship", shipArt: "atakebune",
    cargo: [passenger], sailing: true, x: unit.x, y: riverBank() + 60, speed: 0, skillClock: 0 }];
  const hp = unit.hp;
  advance(run, .05);
  expect(hp - unit.hp).toBeCloseTo(BPH_SURVIVAL_TABLE.transportVolley, 8);
  expect(unit.hp).toBeGreaterThan(0);
});

test.each([60, 120, 180, 900])("a Shin Rip run normalizes enraged ladder reinforcements at %i seconds", time => {
  const run = createBphRun(freshMeta(), { seed: 3, general: "신립", upgrades: [], startBattle: false });
  run.time = time;
  if (time >= 900) run.endless = true;
  run.bph!.survival!.cursor = bphSurvivalPlan("WaveChapter1").length;
  run.squads = [];
  run.shieldUntil = Infinity;
  const owner = spawn(run, false, true, "decree", false, "위");
  owner.enraged = true;
  owner.skillClock = 1000;
  run.telegraphs.push({ id: run.nextId++, owner: owner.id, skill: "ladder", shape: "circle",
    x: owner.x, y: owner.y, fromX: owner.x, fromY: owner.y, radius: 20,
    startedAt: run.time - 1, at: run.time + .025, damage: 0, wallDamage: 0 });
  advance(run, .05);
  advance(run, .05);
  const reinforcements = run.enemies.filter(enemy => enemy.id !== owner.id && enemy.ladder);
  expect(reinforcements).toHaveLength(6);
  for (const enemy of reinforcements) {
    expect(enemy.bphProfileId).toBe("Monster1_Raider");
    expect(enemy.maxHp).toBeCloseTo(BPH_MONSTERS.Monster1_Raider.hp * bphSurvivalIntensity(time).hp, 8);
    expect(enemy.maxHp).toBeLessThan(10);
  }
});
