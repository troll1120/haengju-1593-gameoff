import { expect, test } from "bun:test";
import { createBphRun } from "./bph-session";
import { freshMeta } from "./meta";
import { advance, bphEffectCombat, createRun, might, useSkill } from "./rules";
import type { Effect, Enemy } from "./rules";
import { castYisunsin } from "./skills-yisunsin";
import { setFieldSize, WIDTH } from "./geometry";
import { chaosState } from "./chaos-state";
import { chaosSkillBand } from "./chaos-contract";

function battle() {
  const run = createBphRun(freshMeta(), { seed: 1593, general: "이순신", upgrades: [] });
  const template = createRun(4).enemies[0];
  run.enemies = [0, 100, 124, 148, 200].map((y, i): Enemy => ({
    ...template, id: 100 + i, kind: "yari", x: 40, y, hp: 1000, maxHp: 1000,
    boss: false, elite: false, ladder: false, shielded: false,
  }));
  run.enemies.push({ ...run.enemies[0], id: 200, kind: "ship", y: 124 });
  run.squads[0].skillClock = 0;
  return run;
}

test("BPH turtle charge hits exactly the densest 48 px land band and retains 300 ship damage", () => {
  const run = battle(), before = run.enemies.map(enemy => ({ ...enemy }));
  // The legacy L0 column keeps the instant land lane; survival runs start at Lv1 and sail chaos ships (test below).
  chaosState(run)!.level = 0;

  const effects = useSkill(run, 0);

  expect(effects.filter(effect => effect.kind === "hit").map(effect => effect.target))
    .toEqual([200, 101, 102, 103]);
  expect(run.enemies.map(enemy => 1000 - enemy.hp)).toEqual([0, 7.299600000000055, 7.299600000000055, 7.299600000000055, 0, 300]);
  for (const index of [1, 2, 3]) {
    const amount = before[index].hp - run.enemies[index].hp;
    expect(amount / might(run)).toBeGreaterThanOrEqual(.6083 * 12 * .8);
    expect(amount / might(run)).toBeLessThanOrEqual(.6083 * 12 * 1.2);
    expect(run.enemies[index].x).toBe(before[index].x + 30);
  }
  expect(effects.find(effect => effect.kind === "skill")).toMatchObject({
    y: 124, fromY: 124, value: 24, shape: "lane",
  });
  expect(run.squads[0].skillClock).toBe(12);
  expect(run.metrics.skills[0]).toBe(1);
});

for (const extraPass of [0, 1, 2]) {
  test(`BPH turtle extraPass=${extraPass} adds half-damage extra passes`, () => {
    const run = battle(), effects: Effect[] = [];
    const native = bphEffectCombat(run, effects);

    castYisunsin(run, run.squads[0], effects, {
      damage: (enemy, amount) => native.damage(enemy, amount, run.squads[0]),
      knock: (enemy, _from, pixels) => { enemy.x += pixels; },
    }, { extraPass });

    expect(run.enemies[2].hp).toBeCloseTo(1000 - 7.2996 * (1 + extraPass * .5), 8);
    expect(run.enemies[5].hp).toBe(1000 - 300 * (1 + extraPass * .5));
    expect(effects.filter(effect => effect.kind === "skill").map(effect => effect.index))
      .toEqual(Array.from({ length: extraPass + 1 }, (_, index) => index));
    expect(run.enemies[2].x).toBe(40 + 30 * (1 + extraPass));
  });
}

test("BPH seed 1593 Lv1 cast sails the whole field and damages actual wave enemies", () => {
  setFieldSize(370, 800);
  try {
    const run = createBphRun(freshMeta(), { seed: 1593, general: "이순신", upgrades: [] });
    // Sample the natural opening horde before casting the controlled Lv1 regression.
    for (let step = 0; step < 140; step++) advance(run, .05);
    run.squads[0].skillClock = 0;
    // Keep the Lv1 regression boundary independent of horde kill XP and balance tuning.
    chaosState(run)!.level = 1;
    expect(chaosSkillBand(chaosState(run)!.level)).toBe(1);
    // Denser waves can already contain a waiting transport; the skill must still hit real land enemies.
    expect(run.enemies.some(enemy => enemy.kind !== "ship" && enemy.hp > 0)).toBe(true);
    const wave = new Set(run.enemies.filter(enemy => enemy.kind !== "ship").map(enemy => enemy.id));

    useSkill(run, 0);
    const ships = run.chaosSkills!.events.filter(event => event.kind === "ships");
    expect(ships).toHaveLength(1);
    // Lv1 no longer clips the pass to the 110 px box around the general, where it sailed empty water.
    expect(Math.min(ships[0].from.x, ships[0].to.x)).toBeLessThan(0);
    expect(Math.max(ships[0].from.x, ships[0].to.x)).toBeGreaterThan(WIDTH);
    let dealt = 0;
    for (let tick = 0; tick < 60 && !ships[0].resolved; tick++) {
      // The live wave keeps landing troops while the ship crosses the field.
      for (const enemy of run.enemies) if (enemy.kind !== "ship") wave.add(enemy.id);
      const before = new Map(run.enemies.map(enemy => [enemy.id, enemy.hp])), seen = ships[0].hits.length;
      advance(run, 1 / 30);
      for (const enemy of run.enemies) if (enemy.kind !== "ship") wave.add(enemy.id);
      for (const id of ships[0].hits.slice(seen)) dealt += (before.get(id) ?? 0) - Math.max(0, run.enemies.find(enemy => enemy.id === id)?.hp ?? 0);
    }
    expect(ships[0].resolved).toBe(true);
    expect(ships[0].hits.length).toBeGreaterThan(0);
    for (const id of ships[0].hits) expect(wave.has(id)).toBe(true);
    expect(dealt).toBeGreaterThan(0);
  } finally { setFieldSize(390, 650); }
});

test("legacy Yi Sun-sin retains general charge rather than the BPH ship or land attack", () => {
  const run = createRun(1593, "이순신"), template = run.enemies[0];
  run.enemies = [{ ...template, id: 100, kind: "ship", hp: 1000, maxHp: 1000 }];
  run.squads[0].skillClock = 0;

  const effects = useSkill(run, 0);

  expect(run.enemies[0].hp).toBe(1000);
  expect(run.squads[0].state).toBe("charge");
  expect(run.squads[0].lane?.back).toBe(false);
  expect(effects.filter(effect => effect.kind === "hit")).toHaveLength(0);
  expect(effects.find(effect => effect.kind === "skill")?.shape).toBeUndefined();
});
