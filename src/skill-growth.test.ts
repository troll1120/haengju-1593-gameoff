import { expect, test } from "bun:test";
import type { BphEffect } from "./bph-contract";
import type { BphGeneral } from "./bph-commanders";
import { BPH_GENERALS } from "./bph-commanders";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { advance, createRun, useSkill } from "./rules";
import type { Effect, Enemy, Run } from "./rules";
import { growthFor, skillUpgradeCount } from "./skill-growth";
import { activeBphEffects, buyBphNode } from "./bph-upgrades";
import { freshBphSave } from "./bph-save";
import { buyBphUnitUpgrade } from "./bph-unit-upgrades";
import { riverLane } from "./river";
import { CENTER, guardPoint } from "./geometry";
import { uniqueSkillSpeed } from "./skills-unique";
import { language, setLanguage } from "./i18n";
import { skillGrowthDescription, skillGrowthLine } from "./skill-growth-view";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";
import { pauseArenaWaves } from "./chaos-test-fixture";

function upgrades(count: number): BphEffect[] {
  return Array.from({ length: count }, (_, index) => ({
    nodeId: "SN_HeroDmg", type: "HeroAttackPower", value: .25,
    effectPower: 0, effectPowerScale: 0, stackCap: 0, countStep: 0,
    targets: { placementId: `growth:${index}`, nodeType: "0" },
  }));
}
function arena(general: BphGeneral, tier: number): Run {
  const run = createBphRun(freshMeta(), { seed: 144, general, upgrades: upgrades((tier - 1) * 3), startBattle: false });
  run.weather = "맑음"; run.time = 1; run.spawnBudget = -1e9;
  pauseArenaWaves(run);
  run.commandClock = run.arrowClock = run.hwachaClock = 1e9;
  const squad = run.squads[0];
  squad.x = squad.homeX = squad.targetX = CENTER.x;
  squad.y = squad.homeY = squad.targetY = 100;
  squad.skillClock = 0; squad.clock = 1e9;
  squad.specialAttack = { clock: 1e9, strikeAt: 0, aim: 0 };
  return run;
}
function enemy(run: Run, x: number, y: number, kind: Enemy["kind"] = "yari"): Enemy {
  const unit: Enemy = { id: run.nextId++, kind, direction: "위", x, y, hp: 10000, maxHp: 10000,
    speed: 0, elite: false, boss: false, goalX: x, goalY: y, clock: 1e9, strikeAt: 0,
    prey: null, stun: 0, burn: 0, burnClock: 0, skillClock: 1e9, casting: 0, casts: 0 };
  run.enemies.push(unit);
  return unit;
}
function tick(run: Run, seconds: number): Effect[] {
  const effects: Effect[] = [];
  for (let index = 0; index < Math.round(seconds * 100); index++) effects.push(...advance(run, .01));
  return effects;
}

test.each(BPH_GENERALS)("%s starts with the tier earned by 0/3/6 stat purchases", general => {
  expect([0, 2, 3, 5, 6, 10].map(count => growthFor(general,
    { level: 99, squads: [], bph: { upgrades: upgrades(count) } }).tier)).toEqual([1, 1, 2, 2, 3, 3]);
});

test("a purchase counts once, unrelated classes and economy do not advance this commander's skill", () => {
  const effect = upgrades(1)[0];
  const effects = [effect, { ...effect, type: "HeroDuration" },
    { ...effect, targets: { placementId: "other", nodeType: "0", targetHero: "Hero2_Monk" } },
    { ...effect, type: "SalaryFlatBonus", targets: { placementId: "salary", nodeType: "0" } }];
  expect(skillUpgradeCount("권율", effects)).toBe(1);
  expect(skillUpgradeCount("사명대사", effects)).toBe(2);
});

test("real troop stat purchases drive growth, while a fort upgrade does not", () => {
  const save = freshBphSave();
  save.resources.mastery = 52; // Two attack stages (25 + 26) and the fort node (1).
  save.discovered.push("Hero1_Squire");
  expect(buyBphUnitUpgrade(save, "Hero1_Squire", "attack")).toBe(true);
  expect(buyBphUnitUpgrade(save, "Hero1_Squire", "attack")).toBe(true);
  expect(buyBphNode(save, "_SkillTreeMain_Demo:23:15")).toBe(true);
  expect(growthFor("권율", { level: 1, squads: [], bph: { upgrades: activeBphEffects(save) } }))
    .toMatchObject({ purchases: 2, tier: 1 });
});

test("buying a third applicable stat upgrade raises the next run's tier at level one", () => {
  const save = freshBphSave();
  save.resources.mastery = 78; // Three attack stages: 25 + 26 + 27.
  save.discovered.push("Hero1_Squire");
  for (let stage = 0; stage < 3; stage++) expect(buyBphUnitUpgrade(save, "Hero1_Squire", "attack")).toBe(true);
  const run = createBphRun({ ...freshMeta(), bph: save }, {
    seed: 144, general: "권율", upgrades: activeBphEffects(save), startBattle: false,
  });
  expect(growthFor("권율", run).tier).toBe(2);
  expect(run.level).toBe(1);
});

test("relic effects, foil bonuses, and missing purchase receipts cannot advance skill growth", () => {
  const effect = upgrades(1)[0];
  expect(skillUpgradeCount("권율", [
    { ...effect, targets: { placementId: "relic", nodeType: "5" } },
    { ...effect, type: "FoilHeroAttackPower" },
    { ...effect, targets: { nodeType: "0" } },
    { ...effect, value: 0 },
  ])).toBe(0);
});

test("legacy level and promotion retain their original skill radius without the BPH account bonus", () => {
  const run = createRun(144);
  run.level = 10; run.squads[0].tier = 3; run.squads[0].skillClock = 0;
  const cast = useSkill(run, 0).find(effect => effect.kind === "skill");
  expect(cast?.value).toBe(99.2);
});

test("an old awakening does not silently disagree with the BPH purchase screen's growth tier", () => {
  const run = arena("권율", 1);
  run.squads[0].tier = 2; run.squads[0].awakened = 1;
  expect(growthFor("권율", run).tier).toBe(1);
  expect(growthFor("권율", { level: 1, squads: [], bph: run.bph }).tier).toBe(1);
});

test.each([1, 2, 3])("volley tier %i expands its hit boundary at the same Lv1 army start", tier => {
  const run = arena("권율", tier);
  const center = enemy(run, 70, 100), edge = enemy(run, 70 + 84, 100), outer = enemy(run, 70 + 92, 100);
  // Boss priority fixes aim independently of the number of peripheral targets.
  center.boss = true;
  const effects = useSkill(run, 0), cast = effects.find(effect => effect.kind === "skill");
  expect(cast?.value).toBe([88, 96, 104][tier - 1]);
  expect(10000 - center.hp).toBe(5);
  expect(10000 - edge.hp).toBe(5);
  expect(10000 - outer.hp).toBe(tier >= 2 ? 5 : 0);
  expect(run.squads[0].skillClock).toBe(8);
});

test.each([1, 2, 3])("volley tier %i combines its manual arrows with the same Lv1 army follow-up", tier => {
  const run = arena("권율", tier), target = enemy(run, 70, 100);
  if (!run.bph?.survival) throw new Error("Missing survival fixture");
  // The opening gunners can reach this arena during the manual volley.
  pauseArenaWaves(run);
  run.quiver = true;
  useSkill(run, 0);
  expect(run.shots).toHaveLength([1, 3, 5][tier - 1]);
  expect(new Set(run.shots.map(shot => shot.x)).size).toBe([1, 3, 5][tier - 1]);
  expect(10000 - target.hp).toBe(5);
  tick(run, 1);
  expect(10000 - target.hp).toBeCloseTo(5 + .5 * (2 * tier - 1) + .33 * BPH_SURVIVAL_TABLE.generalSkill);
  expect(run.shots).toHaveLength(0);
});

test.each([1, 2, 3])("stomp tier %i enlarges the damaging ring but retains power and cooldown", tier => {
  const run = arena("황진", tier), squad = run.squads[0];
  const near = enemy(run, squad.x + 90, squad.y);
  const edge = enemy(run, squad.x + 115, squad.y), outer = enemy(run, squad.x + 124, squad.y);
  const cast = useSkill(run, 0).find(effect => effect.kind === "skill");
  expect(cast?.value).toBe([111, 120, 129][tier - 1]);
  expect(10000 - near.hp).toBe(4);
  expect(10000 - edge.hp).toBe(tier >= 2 ? 4 : 0);
  expect(10000 - outer.hp).toBe(tier === 3 ? 4 : 0);
  expect(run.squads[0].skillClock).toBe(10);
});

test.each([1, 2, 3])("return charge tier %i extends its lane and applies the extra stun on impact", tier => {
  const run = arena("신립", tier), squad = run.squads[0];
  const target = enemy(run, squad.x + 50, squad.y);
  const cast = useSkill(run, 0).find(effect => effect.kind === "skill");
  expect((cast?.x ?? 0) - squad.x).toBe(76 + (tier - 1) * 24);
  const effects = tick(run, .1);
  expect(effects.find(effect => effect.kind === "stun" && effect.target === target.id)?.value).toBeCloseTo(1.4 + (tier - 1) * .2);
  expect(10000 - target.hp).toBe(4);
});

test.each([1, 2, 3])("cannon tier %i keeps Lv1 shell waves independent of purchases without a shield", tier => {
  const run = arena("김시민", tier);
  useSkill(run, 0);
  expect(run.shieldUntil).toBe(0);
  expect(run.chaosSkills?.events).toHaveLength(2);
  expect(run.squads[0].skillClock).toBe(12);
});

test.each([1, 2, 3])("bell tier %i keeps its Lv1 offensive toll without restoring HP", tier => {
  const run = arena("사명대사", tier), squad = run.squads[0];
  squad.hp = squad.maxHp * .1;
  useSkill(run, 0);
  expect(squad.hp / squad.maxHp).toBeCloseTo(.1);
  expect(run.chaosSkills?.events).toHaveLength(1);
  expect(squad.skillClock).toBe(12);
});

test.each([1, 2, 3])("turtle ship tier %i starts with one delayed Lv1 body independently of purchases", tier => {
  const run = arena("이순신", tier), ship = enemy(run, 60, riverLane(), "ship");
  const land = enemy(run, 120, 45);
  useSkill(run, 0);
  expect([ship.hp, land.hp]).toEqual([10000, 10000]);
  expect(run.chaosSkills?.events).toHaveLength(1);
  tick(run, 1.2);
  expect(land.hp).toBeLessThan(10000);
  expect(run.metrics.skills[0]).toBe(1);
});

test.each([1, 2, 3])("thunderstorm tier %i starts with Lv1 spatial strikes without slowing enemies", tier => {
  const run = arena("송상현", tier), at = guardPoint(run.fort, "위", 40);
  const center = enemy(run, at.x, at.y);
  useSkill(run, 0);
  expect(run.uniqueSkills).toBeUndefined();
  expect(uniqueSkillSpeed(run, center)).toBe(1);
  expect(run.chaosSkills?.events).toHaveLength(4);
  const strike = run.chaosSkills?.events[0];
  if (!strike) throw new Error("Missing lightning");
  const witness = enemy(run, strike.to.x, strike.to.y);
  tick(run, .3);
  expect(10000 - witness.hp).toBeCloseTo(.9 * BPH_SURVIVAL_TABLE.generalSkill);
});

test.each([1, 2, 3])("Militia Ambush tier %i starts with Lv1 reinforcements independently of purchases", tier => {
  const run = arena("곽재우", tier), at = guardPoint(run.fort, "위", 80);
  enemy(run, at.x, at.y);
  const squad = run.squads[0];
  useSkill(run, 0);
  expect(run.uniqueSkills).toBeUndefined();
  expect(run.chaosSkills?.events).toHaveLength(2);
  const member = run.chaosSkills?.events[0];
  if (!member) throw new Error("Missing militia reinforcement");
  const witness = enemy(run, member.x, member.y);
  tick(run, 1);
  expect(witness.hp).toBeLessThan(10000);
  expect(squad.soldiers).toHaveLength(0);
  expect(squad.lane).toBeNull();
});

test("growth reads consume no RNG or account state and bilingual progress uses the same tier", () => {
  const run = arena("권율", 2), before = JSON.stringify(run);
  const previous = language();
  try {
    setLanguage("en");
    const line = skillGrowthLine("권율", run.bph?.upgrades ?? []);
    expect(line).toContain("skill ●●○");
    expect(line).toContain("Buy 3 more upgrades");
    expect(/[가-힣]/.test(line)).toBe(false);
    setLanguage("ko");
    expect(skillGrowthLine("권율", run.bph?.upgrades ?? [])).toContain("스킬 ●●○");
    expect(JSON.stringify(run)).toBe(before);
  } finally { setLanguage(previous); }
});

test.each(BPH_GENERALS)("%s growth details resolve every tier in English", general => {
  const previous = language();
  try {
    setLanguage("en");
    for (const tier of [1, 2, 3]) expect(/[가-힣]/.test(skillGrowthDescription(general, tier))).toBe(false);
  } finally { setLanguage(previous); }
});
