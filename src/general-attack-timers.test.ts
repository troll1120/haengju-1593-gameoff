import { expect, test } from "bun:test";
import { BPH_GENERALS } from "./bph-commanders";
import { chaosArena, chaosEnemy, chaosTicks } from "./chaos-test-fixture";
import { advance, useSkill } from "./rules";
import { allyAnimation, allyAttackFrame } from "./ally-animation";
import { generalUnit } from "./roster";

for (const general of BPH_GENERALS) {
  test(`${general}: basic release does not start or reset the special or manual timer`, () => {
    const run = chaosArena(general, 1), squad = run.squads[0];
    const target = chaosEnemy(run, squad.x + 26, squad.y);
    target.boss = true;
    squad.clock = 0; squad.skillClock = 8;
    squad.specialAttack = { clock: 5, strikeAt: 0, aim: 0 };
    const effects = chaosTicks(run, 10);
    expect(effects.filter(effect => effect.index === -1 && ["swing", "shot"].includes(effect.kind))).toHaveLength(1);
    expect(effects.some(effect => effect.mechanism === "special")).toBe(false);
    expect(squad.specialAttack.clock).toBeCloseTo(5 - 10 / 30);
    expect(squad.specialAttack.strikeAt).toBe(0);
    expect(squad.skillClock).toBeCloseTo(8 - 10 / 30 * run.meta.skillCharge);
    expect(run.chaos?.attacks).toBe(0);
    if (general === "권율") expect(run.shots).toHaveLength(0);
  });

  test(`${general}: special releases while basic is cooling down and leaves both other timers alone`, () => {
    const run = chaosArena(general, 1), squad = run.squads[0];
    const target = chaosEnemy(run, squad.x + 26, squad.y);
    target.boss = true;
    squad.clock = 7; squad.skillClock = 8;
    squad.specialAttack = { clock: 0, strikeAt: 0, aim: 0 };
    const effects = chaosTicks(run, 12);
    expect(effects.some(effect => effect.mechanism === "special" && ["swing", "shot"].includes(effect.kind))).toBe(true);
    expect(effects.some(effect => effect.index === -1 && effect.kind === "windup" && effect.mechanism !== "special")).toBe(false);
    expect(squad.clock).toBeCloseTo(7 - 12 / 30);
    expect(squad.strikeAt).toBe(0);
    expect(squad.skillClock).toBeCloseTo(8 - 12 / 30 * run.meta.skillCharge);
    expect(run.chaos?.attacks).toBe(1);
  });

  test(`${general}: manual skill preserves an already pending basic and special attack`, () => {
    const run = chaosArena(general, 1), squad = run.squads[0];
    const target = chaosEnemy(run, squad.x + 26, squad.y);
    target.boss = true;
    squad.clock = 3; squad.strikeAt = run.time + .1; squad.aim = target.id;
    squad.specialAttack = { clock: 4, strikeAt: run.time + .2, aim: target.id };
    const basic = [squad.clock, squad.strikeAt, squad.aim], special = structuredClone(squad.specialAttack);
    const effects = useSkill(run, 0);
    expect(effects.some(effect => effect.kind === "skill")).toBe(true);
    expect(squad.skillClock).toBeGreaterThan(0);
    expect([squad.clock, squad.strikeAt, squad.aim]).toEqual(basic);
    expect(squad.specialAttack).toEqual(special);
    expect(useSkill(run, 0)).toEqual([]);
  });

  test(`${general}: special cycles repeat with no basic attacks and no skill casts`, () => {
    const run = chaosArena(general, 1), squad = run.squads[0];
    const target = chaosEnemy(run, squad.x + 26, squad.y);
    target.boss = true; target.hp = target.maxHp = 1e9;
    squad.clock = 1e9;
    squad.specialAttack = { clock: 0, strikeAt: 0, aim: 0 };
    const effects = chaosTicks(run, 180);
    expect(effects.filter(effect => effect.kind === "windup" && effect.mechanism === "special" && effect.value !== .14).length)
      .toBeGreaterThanOrEqual(general === "권율" ? 2 : 3);
    expect(run.metrics.skills[0]).toBe(0);
  });

  test(`${general}: the body starts at least eight basic attacks in six seconds without any special`, () => {
    const run = chaosArena(general, 1), squad = run.squads[0];
    const target = chaosEnemy(run, squad.x + 26, squad.y);
    target.boss = true; target.hp = target.maxHp = 1e9;
    squad.clock = 0;
    const effects = chaosTicks(run, 180);
    expect(effects.filter(effect => effect.kind === "windup" && effect.index === -1 && effect.mechanism !== "special").length)
      .toBeGreaterThanOrEqual(8);
    expect(effects.some(effect => effect.mechanism === "special")).toBe(false);
    expect(squad.specialAttack?.strikeAt).toBe(0);
    expect(run.metrics.skills[0]).toBe(0);
  });
}

test("권율's flag damage lands on the existing contact frame, before any special rockets", () => {
  const run = chaosArena("권율", 1), squad = run.squads[0];
  const target = chaosEnemy(run, squad.x + 26, squad.y);
  target.boss = true;
  squad.clock = 0;
  const preparation = advance(run, 1 / 30);
  expect(preparation.some(effect => effect.kind === "windup")).toBe(true);
  expect(target.hp).toBe(target.maxHp);
  let release = advance(run, 1 / 30);
  while (squad.strikeAt > run.time) {
    expect(target.hp).toBe(target.maxHp);
    release = advance(run, 1 / 30);
  }
  expect(release.some(effect => effect.kind === "swing" && effect.mechanism !== "special")).toBe(true);
  expect(release.some(effect => effect.kind === "hit" && effect.target === target.id)).toBe(true);
  expect(target.hp).toBeLessThan(target.maxHp);
  expect(run.shots).toHaveLength(0);
  const animation = allyAnimation(generalUnit("권율"), {
    moving: false, attacking: true, hurt: false, down: false, direction: "side",
  });
  expect(animation.key).toBe("ally-full-gwon_yul-side-attack");
  expect(allyAttackFrame(animation, { windupProgress: 1, sinceReleaseMs: 0 }))
    .toEqual(animation.frames[Math.floor(animation.frames.length / 2)]);
});

test("a basic release, special release, and manual cast can all happen on the same simulation step", () => {
  const run = chaosArena("권율", 1), squad = run.squads[0];
  const target = chaosEnemy(run, squad.x + 26, squad.y);
  target.boss = true;
  squad.strikeAt = run.time; squad.aim = target.id;
  squad.specialAttack = { clock: 7, strikeAt: run.time, aim: target.id };
  const effects = [...useSkill(run, 0), ...advance(run, 1 / 30)];
  expect(effects.some(effect => effect.kind === "skill")).toBe(true);
  expect(effects.some(effect => effect.kind === "swing" && effect.mechanism !== "special")).toBe(true);
  expect(effects.some(effect => effect.kind === "shot" && effect.mechanism === "special")).toBe(true);
  expect(run.shots.filter(shot => shot.kind === "rocket" && !shot.procDepth)).toHaveLength(3);
});
