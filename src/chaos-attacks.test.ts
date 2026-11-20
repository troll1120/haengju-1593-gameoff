import { expect, test } from "bun:test";
import { CHAOS_TEST_LEVELS, chaosArena, chaosEnemy, chaosFire, chaosSpecial, chaosTicks } from "./chaos-test-fixture";
import { addBphProfile } from "./bph-combat";
import { BPH_PROFILES } from "./bph-data";
import { useSkill } from "./rules";
import { fortRect, guardPoint } from "./geometry";
import { bindBphConsumers, bphConsumers, bphFxContext } from "./bph-fx-dispatch";
import { CHAOS_RULES, chaosSkillBand } from "./chaos-contract";
import { generalReach } from "./general-reach";
import { BPH_SURVIVAL_TABLE } from "./bph-survival-data";

test.each(CHAOS_TEST_LEVELS)("Gwon N%i adds real split-damage arrows to the independent special rocket volley", level => {
  const [count, ratio, spread] = level >= 20 ? [10, 9.60, 48] : level >= 15 ? [6, 1.20, 32]
    : level >= 10 ? [4, .70, 20] : [2, .35, 8];
  const run = chaosArena("권율", level);
  const targets = Array.from({ length: 12 }, (_, index) => chaosEnemy(run, 235 + index * 10, 100));
  chaosSpecial(run, targets[0]);
  const originals = run.shots.filter(shot => !shot.procDepth), arrows = run.shots.filter(shot => shot.procDepth === 1);
  expect(originals).toHaveLength(generalReach("권율", level)?.targets ?? 0);
  expect(originals.every(shot => shot.kind === "rocket")).toBe(true);
  expect(arrows).toHaveLength(count);
  expect(new Set(arrows.map(shot => shot.target)).size).toBe(count);
  expect(arrows.reduce((sum, shot) => sum + shot.damage, 0)).toBeCloseTo(originals[0].damage * ratio);
  if (count > 1) expect(((arrows.at(-1)?.fanAngle ?? 0) - (arrows[0].fanAngle ?? 0)) * 180 / Math.PI).toBeCloseTo(spread);
  run.shots = arrows;
  chaosTicks(run, 45);
  expect(targets.reduce((sum, enemy) => sum + 10000 - enemy.hp, 0)).toBeCloseTo(originals[0].damage * ratio);
  expect(run.shots).toHaveLength(0);
});

test("Gwon does not concentrate missing arrows or apply auxiliary fire damage in rain", () => {
  const run = chaosArena("권율", 20), target = chaosEnemy(run, 235, 100);
  run.weather = "비";
  chaosSpecial(run, target);
  const arrow = run.shots.find(shot => shot.procDepth === 1);
  if (!arrow) throw new Error("Missing auxiliary arrow");
  expect(run.shots.filter(shot => shot.procDepth === 1)).toHaveLength(1);
  const direct = run.shots.find(shot => shot.kind === "rocket");
  expect(arrow.damage).toBeCloseTo((direct?.damage ?? 0) * .96);
  run.shots = [arrow]; chaosTicks(run, 30);
  expect(10000 - target.hp).toBeCloseTo(arrow.damage);
});

test("Gwon's manual follow-up finds a live enemy after the initial impact kills its aim", () => {
  const run = chaosArena("권율", 20), aim = chaosEnemy(run, 235, 100), far = chaosEnemy(run, 40, 100);
  aim.boss = true; aim.hp = .1;
  useSkill(run, 0);
  expect(aim.hp).toBeLessThanOrEqual(0);
  expect(run.shots).toHaveLength(20);
  expect(run.shots.every(shot => shot.target === far.id)).toBe(true);
  const followUp = run.shots.reduce((sum, shot) => sum + shot.damage, 0);
  chaosTicks(run, 45);
  // The retargeted arrows and the first three delayed rain waves both reach this foe.
  const rain = CHAOS_RULES.skills.arrows, band = chaosSkillBand(20);
  const waves = Math.min(rain.waves[band], 1 + Math.floor((45 - rain.flight) / rain.interval));
  expect(10000 - far.hp).toBeCloseTo(followUp + waves * rain.power[band] / rain.waves[band]
    * (1 + .03 * 19) * BPH_SURVIVAL_TABLE.generalSkill);
});

test("Gwon's in-flight auxiliary arrow retargets the nearest living enemy after a kill", () => {
  const run = chaosArena("권율", 20), first = chaosEnemy(run, 235, 100), next = chaosEnemy(run, 260, 120);
  chaosSpecial(run, first);
  const arrow = run.shots.find(shot => shot.chaosDamage && shot.target === first.id);
  if (!arrow) throw new Error("Missing launched auxiliary");
  first.hp = 0;
  run.shots = [arrow];
  const power = arrow.damage;
  chaosTicks(run, 30);
  expect(10000 - next.hp).toBeCloseTo(power);
  expect(arrow.target).toBe(next.id);
});

test("Gwon's second original ranged attack pierces auxiliaries once at half power", () => {
  const run = chaosArena("권율", 20), target = chaosEnemy(run, 245, 100);
  for (let attack = 1; attack <= 2; attack++) {
    run.shots = [];
    chaosSpecial(run, target);
    const arrow = run.shots.find(shot => shot.procDepth === 1);
    if (!arrow) throw new Error("Missing auxiliary arrow");
    expect(arrow.chaosPierce ?? 0).toBe(attack === 2 ? 1 : 0);
    if (attack < 2) continue;
    const fanX = 195 + Math.cos(arrow.fanAngle ?? 0) * 12;
    const fanY = 100 + Math.sin(arrow.fanAngle ?? 0) * 12;
    const length = Math.hypot(target.x - fanX, target.y - fanY);
    const behind = chaosEnemy(run, target.x + (target.x - fanX) / length * 25,
      target.y + (target.y - fanY) / length * 25);
    const before = target.hp;
    run.shots = [arrow]; chaosTicks(run, 30);
    expect(before - target.hp).toBeCloseTo(arrow.chaosPierceDamage ? arrow.chaosPierceDamage * 2 : 0);
    expect(10000 - behind.hp).toBeCloseTo(arrow.chaosPierceDamage ?? 0);
    expect(arrow.hitIds).toEqual([target.id, behind.id]);
  }
});

test("Gwon selects actual archer/hwacha profiles, excluding chongtong's shared sprite", () => {
  for (const classId of ["archer", "hwacha", "chongtong"] as const) {
    const run = chaosArena("권율", 20), target = chaosEnemy(run, 245, 100);
    const profile = Object.values(BPH_PROFILES).find(profile => profile.classId === classId && profile.cooldown > 0);
    if (!profile) throw new Error(`Missing ${classId}`);
    addBphProfile(run, { profileId: profile.id, copies: 1, discovered: false, foil: false }, { packId: "DeliveryBox" });
    const unit = run.squads[0].soldiers[0];
    Object.assign(unit, { x: 195, y: 100, strikeAt: run.time, aim: target.id, perch: 0 });
    chaosTicks(run, 1);
    expect(run.shots.filter(shot => shot.procDepth === 1)).toHaveLength(classId === "chongtong" ? 0 : 1);
    if (classId === "hwacha") {
      // Native Hero.GetSpellCastBaseDamage: the caster's effective attack damage
      // (this hwacha profile casts 4.2) reaches the chaos volley, scaled by its 0.96 factor.
      expect(run.shots.find(shot => shot.procDepth === 1)?.damage).toBeCloseTo(4.032);
      unit.clock = 1e9;
      chaosTicks(run, 12);
      // Same native effective-attack scaling (4.2 vs the old 4 * .25 = 1) as the volley above.
      expect(10000 - target.hp).toBeCloseTo(1.96 * 4.2);
    }
  }
});

test.each(CHAOS_TEST_LEVELS)("Song N%i appends bounded authored pierces to actual arrows", level => {
  const pierces = Math.min(generalReach("송상현", level)?.targets ?? 0, level >= 20 ? 6 : 3, 5);
  const ratio = level >= 20 ? .9 : level >= 15 ? .65 : level >= 10 ? .5 : .4;
  const run = chaosArena("송상현", level);
  const targets = Array.from({ length: 6 }, (_, index) => chaosEnemy(run, 225 + index * 25, 100));
  chaosSpecial(run, targets[0]);
  const shot = run.shots[0], power = shot.damage;
  chaosTicks(run, 45);
  expect(10000 - targets[0].hp).toBeCloseTo(power);
  for (let index = 1; index < targets.length; index++)
    expect(10000 - targets[index].hp).toBeCloseTo(index <= pierces ? power * ratio : 0);
  expect(shot.hitIds).toEqual(targets.slice(0, 1 + pierces).map(enemy => enemy.id));
});

test.each(CHAOS_TEST_LEVELS)("Song N%i keeps direct arrow power separate from delayed thunder", level => {
  const run = chaosArena("송상현", level), at = guardPoint(run.fort, "위", 40);
  const target = chaosEnemy(run, at.x + 20, at.y), squad = run.squads[0];
  squad.x = at.x - 10; squad.y = at.y;
  useSkill(run, 0);
  chaosFire(run, target);
  const power = run.shots[0].damage;
  chaosTicks(run, 6);
  expect(10000 - target.hp).toBeCloseTo(power);
  expect(run.uniqueSkills).toBeUndefined();
});

test("Song N20 replaces both former lines with ten distributed lightning waves", () => {
  const run = chaosArena("송상현", 20);
  const ctx = bphFxContext(run);
  if (!ctx) throw new Error("Missing native context");
  // Keep the real pointer outside the battlefield so native CursorDps cannot contaminate this skill budget.
  bindBphConsumers({ ...ctx, pointer: { x: -1000, y: -1000 } }, bphConsumers(), false);
  useSkill(run, 0);
  const strikes = run.chaosSkills?.events ?? [];
  expect(strikes).toHaveLength(120);
  const targets = strikes.filter(strike => strike.wave === 0).map(strike => chaosEnemy(run, strike.to.x, strike.to.y));
  chaosTicks(run, 8);
  expect(targets.map(target => target.hp)).toEqual(Array(12).fill(10000));
  chaosTicks(run, 1);
  const thunder = CHAOS_RULES.skills.thunder, band = chaosSkillBand(20);
  const hit = thunder.power[band] / thunder.waves[band] * (1 + .03 * 19) * BPH_SURVIVAL_TABLE.generalSkill;
  expect(targets.map(target => 10000 - target.hp)).toEqual(Array(12).fill(expect.closeTo(hit, 8)));
  chaosTicks(run, 162);
  expect(targets.map(target => 10000 - target.hp)).toEqual(Array(12).fill(expect.closeTo(hit * thunder.waves[band], 8)));
  expect(run.uniqueSkills).toBeUndefined();
});

test("Song's army pierce seeks an off-axis living target within its authored range", () => {
  const run = chaosArena("송상현", 10), first = chaosEnemy(run, 235, 100);
  const offAxis = chaosEnemy(run, 265, 145), outside = chaosEnemy(run, 5, 550);
  chaosSpecial(run, first);
  const power = run.shots[0].damage;
  chaosTicks(run, 30);
  expect(10000 - offAxis.hp).toBeCloseTo(power * .5);
  expect(outside.hp).toBe(10000);
});

test("Song N10 damages wall-contact enemies by thunder without creating a slow line", () => {
  const run = chaosArena("송상현", 10), at = guardPoint(run.fort, "위", 40);
  const aim = chaosEnemy(run, at.x, at.y); aim.boss = true;
  const contact = chaosEnemy(run, at.x, fortRect(run.fort).top - 8);
  useSkill(run, 0);
  chaosTicks(run, 150);
  expect(contact.hp).toBeLessThan(10000);
  expect(run.uniqueSkills).toBeUndefined();
  expect(run.chaosSkills?.events).toEqual([]);
});

test("Song recasts each retain a bounded independent thunder damage budget", () => {
  const run = chaosArena("송상현", 20);
  useSkill(run, 0);
  const strike = run.chaosSkills?.events[0];
  if (!strike) throw new Error("Missing thunder");
  const target = chaosEnemy(run, strike.to.x, strike.to.y);
  run.squads[0].skillClock = 0;
  useSkill(run, 0);
  chaosTicks(run, 171);
  expect(10000 - target.hp).toBeCloseTo(2 * CHAOS_RULES.skills.thunder.power[chaosSkillBand(20)]
    * (1 + .03 * 19) * BPH_SURVIVAL_TABLE.generalSkill);
});
