import { beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { advance, bphEffectCombat, createRun, might, useSkill } from "./rules";
import type { Enemy, General, Shot } from "./rules";
import { setFieldSize } from "./geometry";
import { addBphProfile, createBphBattle } from "./bph-combat";
import { freshBphSave } from "./bph-save";
import { weatherDamage, weatherEnemySpeed, weatherView } from "./weather";
import type { Weather } from "./weather";

beforeEach(() => setFieldSize(390, 650));

for (const weather of ["맑음", "비", "서풍"] as const) {
  test(`${weather} modifies only fire damage and enemy movement`, () => {
    expect(weatherDamage(weather, 80, true)).toBe(weather === "비" ? 60 : 80);
    expect(weatherDamage(weather, 80, false)).toBe(80);
    expect(weatherEnemySpeed(weather)).toBe(weather === "비" ? .9 : 1);
  });
  test(`${weather} shows weather guidance only when rain affects combat`, () => {
    const view = weatherView(weather, "ko");
    expect(view.icon).toBe(weather === "비");
    expect(view.bannerMs).toBe(weather === "비" ? 1000 : 0);
  });
}

function field(weather: Weather, general: General = "권율") {
  const run = createRun(9999, general);
  run.weather = weather;
  run.arrow = run.hwacha = 0;
  run.arrowClock = run.hwachaClock = run.commandClock = 1e9;
  run.spawnBudget = -1e9;
  for (const squad of run.squads) {
    squad.clock = 1e9;
    squad.soldiers = [];
  }
  const enemy: Enemy = { id: run.nextId++, kind: "yari", direction: "위", x: 50, y: 50,
    hp: 10000, maxHp: 10000, speed: 0, elite: false, boss: false,
    goalX: 50, goalY: 200, clock: 1e9, strikeAt: 0, prey: null, stun: 0,
    burn: 0, burnClock: 0, skillClock: 1e9, casting: 0, casts: 0 };
  run.enemies = [enemy];
  return { run, enemy };
}

for (const [name, properties, fire] of [
  ["ordinary arrow", { kind: "arrow" }, false],
  ["fire arrow", { kind: "arrow", flaming: true }, true],
  ["hwacha profile arrow", { kind: "arrow", source: "hwacha" }, true],
  ["hwacha explosion", { kind: "rocket" }, true],
  ["naval cannon", { kind: "rocket", naval: true, source: "panokseon" }, false],
] satisfies readonly (readonly [string, Partial<Shot>, boolean])[]) {
  for (const weather of ["맑음", "비"] as const) {
    test(`${weather} routes ${name} through the shared damage multiplier`, () => {
      const { run, enemy } = field(weather);
      run.shots.push({ id: run.nextId++, x: 50, y: 50, toX: 50, toY: 50,
        speed: 340, target: enemy.id, prey: null, damage: 80, critical: false, by: "weapon",
        splash: 26, pierce: 0, from: 0, ...properties });
      advance(run, .01);
      expect(10000 - enemy.hp).toBe(weather === "비" && fire ? 60 : 80);
    });
  }
}

for (const spellId of ["Spell_Fireball", "Spell_Thunderbolt", "Spell_PoisonCloud", "Spell_Mine"]) {
  test(`rain classifies ${spellId} independently of its caster`, () => {
    const { run, enemy } = field("비");
    bphEffectCombat(run, []).applyDamage({ target: enemy, amount: 80, spellId });
    expect(10000 - enemy.hp).toBe(spellId === "Spell_Fireball" ? 60 : 80);
  });
}

for (const [profileId, fire] of [
  ["Hero2_Pyromancer", true], ["Hero4_Stormcaller", true], ["Hero9_Quasar", true],
  ["Hero6_BloodMage", false], ["Hero6_Shotgun", false],
] as const) {
  test(`rain classifies ${profileId} by its original class despite the shared hwacha body`, () => {
    const { run, enemy } = field("비");
    run.bph = createBphBattle(freshBphSave(), [], "WaveChapter1");
    addBphProfile(run, { profileId, foil: false, copies: 1, discovered: false },
      { packId: "DeliveryBox", cause: "effect" });
    bphEffectCombat(run, []).applyDamage({ target: enemy, amount: 80, source: run.squads[0].soldiers[0] });
    expect(10000 - enemy.hp).toBe(fire ? 60 : 80);
  });
}

for (const general of ["권율", "이복남", "이정헌", "조헌", "김명원", "김희수"] as const) {
  test(`rain applies once to ${general}'s skill damage`, () => {
    const hits = (weather: Weather) => {
      const { run, enemy } = field(weather, general);
      run.squads[0].skillClock = 0;
      useSkill(run, 0);
      return 10000 - enemy.hp;
    };
    const clear = hits("맑음");
    expect(clear).toBeGreaterThan(0);
    expect(hits("비")).toBeCloseTo(clear * (general === "권율" ? 1 : .75), 8);
  });
}

test("rain weakens ongoing burn once without slowing its tick clock", () => {
  const { run, enemy } = field("비");
  enemy.burn = 3;
  advance(run, .01);
  expect(10000 - enemy.hp).toBeCloseTo(.5 * might(run) * .75, 8);
  expect(enemy.burnClock).toBe(.5);
});

for (const skill of ["fire", "slam"] as const) {
  test(`rain handles enemy ${skill} damage to the general and castle`, () => {
    const hit = (weather: Weather) => {
      const { run, enemy } = field(weather), squad = run.squads[0];
      squad.safeUntil = 0;
      const hp = squad.hp, base = run.base;
      run.telegraphs.push({ id: run.nextId++, owner: enemy.id, skill, shape: "circle",
        x: squad.x, y: squad.y, fromX: enemy.x, fromY: enemy.y, radius: 100,
        startedAt: 0, at: .001, damage: 80, wallDamage: 0 });
      advance(run, .01);
      return { general: hp - squad.hp, castle: base - run.base };
    };
    const clear = hit("맑음"), rain = hit("비");
    expect(clear.general).toBeGreaterThan(0);
    expect(rain.general).toBeCloseTo(clear.general * (skill === "fire" ? .75 : 1), 8);
    expect(rain.castle).toBeCloseTo(clear.castle * (skill === "fire" ? .75 : 1), 8);
  });
}

for (const kind of ["yari", "ship"] as const) {
  test(`rain slows ${kind} displacement without changing base speed or attack clocks`, () => {
    const move = (weather: Weather) => {
      const { run, enemy } = field(weather);
      enemy.kind = kind; enemy.speed = 40;
      advance(run, .05);
      return { distance: kind === "ship" ? Math.abs(enemy.x - 50) : Math.hypot(enemy.x - 50, enemy.y - 50),
        speed: enemy.speed, clock: enemy.skillClock };
    };
    const clear = move("맑음"), rain = move("비");
    expect(rain.distance).toBeCloseTo(clear.distance * .9, 8);
    expect(rain.speed).toBe(clear.speed);
    expect(rain.clock).toBe(clear.clock);
  });
}

// Recorded from untouched 3edc4ab, default field size, 40 advances of .05 seconds;
// seeds 1593 and 9999 re-recorded when allied soldiers began keeping body spacing.
const BASELINE = [
  { seed: 1, weather: "비", rng: 2448248884 },
  { seed: 2, weather: "서풍", rng: 1816413215, after: "aaa7401c73c86f40508e2bcbaf1317478e40e05d169cf539147a9be9ebc74a80" },
  { seed: 42, weather: "비", rng: 3647979068 },
  { seed: 1593, weather: "서풍", rng: 616684663, after: "532ae9fba9d36b41453322328727be1c1ee4505354dbd7da5d8d0ae341671302" },
  { seed: 9999, weather: "맑음", rng: 1816423212, after: "c5e6703a977de7ab94c80304543dbf7cf76d7426f4a1f6fd9cf4d73b47814caa" },
] as const;
for (const baseline of BASELINE) {
  test(`seed ${baseline.seed} preserves the original weather choice and RNG position`, () => {
    const run = createRun(baseline.seed);
    expect({ weather: run.weather, rng: run.rng, nextId: run.nextId, commander: run.commander })
      .toEqual({ weather: baseline.weather, rng: baseline.rng, nextId: 10, commander: "권율" });
    if ("after" in baseline) {
      for (let i = 0; i < 40; i++) advance(run, .05);
      expect(createHash("sha256").update(JSON.stringify(run)).digest("hex")).toBe(baseline.after);
    }
  });
}

for (const [seed, hash] of [
  [2, "c1cd85892bde2f6757abc7789bdb02111024e40f05780eac51e4baabd1a5d55a"],
  [1593, "893c0248aa4552d74d80fd67f70a68e46bba123e7838c74f1dd4f253169c9f80"],
  [9999, "1d569d7c3e3a5cb001bfe3b429874a4a7249354267fd55eb5bdb8aef147bd65c"],
] as const) {
  test(`non-rain seed ${seed} preserves the complete 20-second combat state from 3edc4ab`, () => {
    const run = createRun(seed);
    for (let i = 0; i < 400; i++) {
      if (i % 80 === 0) useSkill(run, 0);
      advance(run, .05);
    }
    expect(createHash("sha256").update(JSON.stringify(run)).digest("hex")).toBe(hash);
  });
}
