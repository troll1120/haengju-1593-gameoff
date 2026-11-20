import { expect, test } from "bun:test";
import type { BphGeneral } from "./bph-commanders";
import type { BphGeneralUpgradeTrack } from "./bph-contract";
import { unlockBphGeneral } from "./bph-commanders";
import { bphGeneralUpgradePrice, buyBphGeneralUpgrade } from "./bph-general-upgrades";
import { freshBphSave, parseBphSave } from "./bph-save";
import { createBphRun } from "./bph-session";
import { buyBphUnitUpgrade } from "./bph-unit-upgrades";
import { freshMeta } from "./meta";
import { advance, spawn, useSkill } from "./rules";

test("general tracks use the troop wallet and require the general's quest unlock", () => {
  const save = freshBphSave();
  save.resources.mastery = 304;
  save.discovered.push("Hero1_Squire");
  expect(buyBphGeneralUpgrade(save, "신립", "health")).toBe(false);
  expect(save.resources.mastery).toBe(304);
  expect(unlockBphGeneral(save, { runs: 1, bestSeconds: 0, bossesReached: 0, bossesKilled: 0 })).toEqual(["신립"]);
  for (const remaining of [284, 244, 184, 104, 4]) {
    expect(buyBphGeneralUpgrade(save, "신립", "health")).toBe(true);
    expect(save.resources.mastery).toBe(remaining);
  }
  expect(buyBphGeneralUpgrade(save, "신립", "health")).toBe(false);
  expect(buyBphGeneralUpgrade(save, "신립", "attack")).toBe(false);
  expect(buyBphUnitUpgrade(save, "Hero1_Squire", "attack")).toBe(false);
  const restored = parseBphSave(JSON.parse(JSON.stringify(save)));
  expect(restored.generalUpgrades).toEqual({ 신립: { health: 5 } });
  expect(restored.resources.mastery).toBe(4);
});

test("old and high general ranks survive loading without granting invalid or locked ranks", () => {
  const save = freshBphSave();
  expect(parseBphSave(save).generalUpgrades).toBeUndefined();
  expect(parseBphSave({ ...save, generalUpgrades: { 권율: { health: 5, attack: 4, skill: 2 } } }).generalUpgrades)
    .toEqual({ 권율: { health: 5, attack: 4, skill: 2 } });
  expect(parseBphSave({ ...save, generalUpgrades: {
    권율: { health: 1000, attack: 1_000_000, attackSpeed: 1000, skill: 6, extra: 4 },
    신립: { health: 4 }, unknown: { health: 4 },
  } }).generalUpgrades).toEqual({ 권율: { health: 1000, attack: 1_000_000, attackSpeed: 1000 } });
  expect(parseBphSave({ ...save, generalUpgrades: {
    권율: { health: 1.5, attack: -1, attackSpeed: Number.MAX_SAFE_INTEGER + 1 },
  } }).generalUpgrades).toBeUndefined();
});

for (const track of ["health", "attack", "attackSpeed"] as const) {
  test(`${track} charges the next rank beyond both Lv 5 and Lv 1000`, () => {
    const save = freshBphSave();
    save.resources.mastery = 200_000;
    for (const [rank, price] of [[5, 120], [1000, 20_020]] as const) {
      save.generalUpgrades = { 권율: { [track]: rank } };
      const before = save.resources.mastery;
      expect(bphGeneralUpgradePrice(save, "권율", track)).toBe(price);
      expect(buyBphGeneralUpgrade(save, "권율", track)).toBe(true);
      expect(save.generalUpgrades?.권율?.[track]).toBe(rank + 1);
      expect(save.resources.mastery).toBe(before - price);
      expect(bphGeneralUpgradePrice(save, "권율", track)).toBe(price + 20);
    }
  });
}

function arena(general: BphGeneral, track?: BphGeneralUpgradeTrack, rank = 2, upgradedGeneral: BphGeneral = "권율", turtle = false) {
  const save = freshBphSave(7);
  save.unlockedGenerals.push("김시민", "이순신");
  if (track) save.generalUpgrades = { [upgradedGeneral]: { [track]: rank } };
  const meta = freshMeta();
  if (turtle) meta.nodes.push("turtle");
  const run = createBphRun({ ...meta, bph: parseBphSave(JSON.parse(JSON.stringify(save))) },
    { seed: 7, general, upgrades: [], startBattle: false });
  const squad = run.squads[0];
  const enemy = spawn(run, false, false, undefined, false, "위");
  enemy.x = enemy.goalX = squad.x; enemy.y = enemy.goalY = squad.y - 30;
  enemy.hp = enemy.maxHp = 10000; enemy.speed = 0; enemy.shielded = false;
  squad.clock = 0; squad.strikeAt = 0; squad.skillClock = 0;
  return { run, enemy, squad };
}

test("two saved health tiers scale the purchased general at deployment only", () => {
  expect(arena("권율", "health").squad.maxHp).toBeCloseTo(arena("권율").squad.maxHp * 1.10);
  expect(arena("김시민", "health").squad.maxHp).toBe(arena("김시민").squad.maxHp);
});

test("two attack tiers scale the general's real basic volley without boosting the ultimate", () => {
  const measure = (track?: BphGeneralUpgradeTrack) => {
    const { run, enemy } = arena("권율", track);
    for (let i = 0; i < 30 && enemy.hp === enemy.maxHp; i++) advance(run, .05);
    return enemy.maxHp - enemy.hp;
  };
  const basic = measure();
  expect(basic).toBeGreaterThan(0);
  expect(measure("attack")).toBeCloseTo(basic * 1.10);
  expect(measure("skill")).toBeCloseTo(basic);
});

test("two skill tiers scale the general's manual ultimate independently of basic attack", () => {
  const measure = (track?: BphGeneralUpgradeTrack) => {
    const { run, enemy } = arena("권율", track);
    useSkill(run, 0);
    return enemy.maxHp - enemy.hp;
  };
  const skill = measure();
  expect(skill).toBeGreaterThan(0);
  expect(measure("skill")).toBeCloseTo(skill * 1.10);
  expect(measure("attack")).toBeCloseTo(skill);
});

const cycleStep = 1 / 200;
function basicCycles(general: BphGeneral, rank: number, frenzy: boolean, turtle = false) {
  const { run, squad } = arena(general, "attackSpeed", rank, general, turtle);
  if (frenzy) squad.frenzyUntil = 10;
  const cycles: number[] = [];
  let previousStart: number | undefined;
  for (let tick = 0; tick < 400 && cycles.length < 2; tick++) {
    const effects = advance(run, cycleStep);
    if (!effects.some(effect => effect.kind === "windup" && effect.squad === squad.id &&
      effect.index === -1 && effect.mechanism !== "special")) continue;
    if (previousStart !== undefined) cycles.push(run.time - previousStart);
    previousStart = run.time;
  }
  return cycles;
}

for (const [general, frenzy, baseline, turtle = false] of [
  ["권율", false, .62], ["권율", true, .37],
  ["이순신", false, .50], ["이순신", true, .25],
  ["이순신", true, .1948, true],
] as const) {
  test(`${general} basic attack ranks follow the legacy cadence curve (frenzy ${frenzy}, turtle ${turtle})`, () => {
    for (const rank of [0, 1, 5, 10, 1000]) {
      const cycles = basicCycles(general, rank, frenzy, turtle);
      const floor = Math.min(.25, baseline);
      const expected = floor + (baseline - floor) / (1 + .36 * rank);
      expect(cycles).toHaveLength(2);
      for (const cycle of cycles) {
        expect(cycle).toBeGreaterThanOrEqual(expected - 1e-9);
        expect(cycle).toBeLessThanOrEqual(expected + 2 * cycleStep + 1e-9);
      }
    }
  });
}
